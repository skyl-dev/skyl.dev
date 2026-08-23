import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { buildContext } from '../context.ts';
import { readLockfile, resolveTarget } from '../install.ts';
import { extractMarkdown, learnPrompt, preserved, reattach, withCaution, LEARNED_NAME } from '../learn.ts';
import { bold, confirm, cyan, dim, err, green, out, red, tokens, yellow } from '../ui.ts';

export interface LearnOptions {
  root: string;
  agent?: string | undefined;
  printPrompt?: boolean | undefined;
  outFile?: string | undefined;
  yes?: boolean | undefined;
  target?: string | undefined;
}

/** The one shorthand whose headless flag is known to work. Anything else is given in full. */
const SHORTHAND: Record<string, string[]> = { claude: ['claude', '-p'] };

/**
 * Derive a project knowledge skill from this repository.
 *
 * The agent calls skyl, not the reverse. Selecting the files, keeping the hand-written
 * text, and merging the result are deterministic and live here; the reading is done by
 * whichever model the user already pays for. That is why there is no API key anywhere in
 * this command, and why `--print-prompt` is a first class path rather than a fallback.
 */
export async function learn(opts: LearnOptions): Promise<number> {
  const lock = await readLockfile(opts.root);
  const target = resolveTarget(opts.target, lock);
  const file = join(opts.root, target.dir, target.fileFor(LEARNED_NAME));

  const existing = await readFile(file, 'utf8').catch(() => undefined);
  const keep = preserved(existing);

  const bundle = await buildContext(opts.root, { installed: Object.keys(lock?.skills ?? {}) });
  if (bundle.files.length === 0) {
    err(`${yellow('Nothing to read here.')} No documentation, schema or source files were selected.`);
    return 1;
  }
  const prompt = learnPrompt(bundle, keep);

  if (opts.printPrompt === true || !opts.agent) {
    if (opts.outFile) {
      await writeFile(opts.outFile, prompt, 'utf8');
      out(`  ${green('Written.')} ${opts.outFile}`);
    } else {
      process.stdout.write(prompt);
    }
    if (!opts.agent && opts.printPrompt !== true) {
      err('');
      err(`  ${dim('Paste this into any agent, or run')} ${cyan('skyl learn --agent claude')} ${dim('to do it here.')}`);
    }
    return 0;
  }

  const command = SHORTHAND[opts.agent] ?? opts.agent.split(' ');
  out();
  out(`  ${bold('Reading this project')} ${dim(`${bundle.files.length} files, ${tokens(prompt.split(/\s+/).length)}`)}`);
  for (const w of bundle.withheld) out(`    ${yellow('withheld')} ${w.path} ${dim(w.why)}`);
  out(`  ${dim(`through ${command.join(' ')}, which uses your own account`)}`);
  out();
  if (!(await confirm(`  Send ${bundle.files.length} files to ${command[0]}?`, opts.yes === true))) {
    out(`  ${dim('Nothing sent.')}`);
    return 1;
  }

  const output = await pipeTo(command, prompt).catch((cause: Error) => {
    err(`  ${red('Could not run')} ${command.join(' ')}`);
    err(`  ${dim(cause.message)}`);
    return undefined;
  });
  if (output === undefined) return 1;

  const generated = extractMarkdown(output);
  if (!generated) {
    err(`  ${red('No skill in the output.')} ${dim('Re-run with --print-prompt and paste it somewhere you can see the answer.')}`);
    return 1;
  }

  const date = new Date().toISOString().slice(0, 10);
  const sha = await gitSha(opts.root);
  const text = withCaution(reattach(generated, keep), date, sha);

  if (existing !== undefined) {
    const history = join(opts.root, '.skyl', 'history', `project-core.${sha ?? date}.md`);
    await mkdir(dirname(history), { recursive: true });
    await writeFile(history, existing, 'utf8');
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text, 'utf8');

  const open = (text.match(/<!-- unanswered -->/g) ?? []).length;
  out();
  out(`  ${green(existing ? 'Refreshed.' : 'Written.')} ${dim(file.replace(opts.root + '/', ''))}`);
  if (keep.manual) {
    const lines = keep.manual.split('\n').length;
    out(`  ${dim(`## Manual carried over, ${lines} line${lines === 1 ? '' : 's'}`)}`);
  }
  if (open > 0) out(`  ${yellow(`${open} question${open === 1 ? '' : 's'}`)} ${dim('left for you, marked <!-- unanswered -->')}`);
  out();
  return 0;
}

function pipeTo(command: readonly string[], input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0]!, command.slice(1), { stdio: ['pipe', 'pipe', 'inherit'] });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d: string) => { stdout += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`exited with code ${String(code)}`));
    });
    child.stdin.end(input, 'utf8');
  });
}

async function gitSha(root: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const child = spawn('git', ['-C', root, 'rev-parse', '--short', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d: string) => { out += d; });
    child.on('error', () => resolve(undefined));
    child.on('close', (code) => resolve(code === 0 && out.trim() !== '' ? out.trim() : undefined));
  });
}
