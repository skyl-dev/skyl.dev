import { SkylError, TARGETS } from '@skyl/core';
import { add } from './commands/add.ts';
import { audit } from './commands/audit.ts';
import { context } from './commands/context.ts';
import { diff } from './commands/diff.ts';
import { learn } from './commands/learn.ts';
import { lint } from './commands/lint.ts';
import { list } from './commands/list.ts';
import { remove } from './commands/remove.ts';
import { scan } from './commands/scan.ts';
import { update } from './commands/update.ts';
import { bold, cyan, dim, err, out, red } from './ui.ts';

// kept in step with package.json by a test, rather than read at startup
const VERSION = '0.1.0';

const HELP = `
  ${bold('skyl')} ${dim('curated agent skills for what your project actually uses')}

  ${dim('Install')}
    ${bold('skyl scan')}                 read the project and propose an install
    ${bold('skyl add')} <skill...>       install skills and what they require
    ${bold('skyl remove')} <skill...>    take skills back out
    ${bold('skyl list')}                 what is installed, and what has moved since

  ${dim('Keep current')}
    ${bold('skyl diff')} [skill...]      what changed here, and what changed upstream
    ${bold('skyl update')} [skill...]    apply the upstream side, keeping local edits

  ${dim('Your own files')}
    ${bold('skyl audit')} [file]         read a hand-written CLAUDE.md and say what is in it
    ${bold('skyl context')}              emit what a model needs to describe this project
    ${bold('skyl learn')}                derive a project knowledge skill from this repository

  ${dim('Authoring')}
    ${bold('skyl lint')} [path...]       check skills against the spec

  ${dim('Options')}
    --target <${TARGETS.map((t) => t.id).join('|')}>
    --dir <path>              read skills from a local checkout instead
    --refresh                 prefer the network over the bundled copy
    --json                    machine-readable output (scan, context)
    --full                    whole file rather than hunks (diff)
    --force                   take the upstream side of a conflict (update)
    --strict                  warnings fail the run (lint)
    --dry-run                 list what would be sent, and send nothing (context)
    --agent <cmd>             the agent to pipe a prompt to (learn)
    --print-prompt            print the prompt instead of running anything (learn)
    --out <file>              write to a file instead of stdout
    -y, --yes                 do not ask before writing
    -C <path>                 run as if in this directory
    -h, --help                -v, --version

  ${dim('Skills are proposed, never installed without asking.')}
`;

interface Parsed {
  command: string | undefined;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parse(argv: readonly string[]): Parsed {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  const takesValue = new Set(['target', 'dir', 'C', 'out', 'agent', 'max-files']);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--') { positional.push(...argv.slice(i + 1)); break; }
    if (arg.startsWith('--')) {
      const [name, inline] = arg.slice(2).split('=', 2) as [string, string | undefined];
      if (inline !== undefined) flags[name] = inline;
      else if (takesValue.has(name)) { flags[name] = argv[i + 1] ?? ''; i += 1; }
      else flags[name] = true;
    } else if (arg.startsWith('-') && arg.length > 1) {
      const short = arg.slice(1);
      if (takesValue.has(short)) { flags[short] = argv[i + 1] ?? ''; i += 1; }
      else for (const c of short) flags[c] = true;
    } else positional.push(arg);
  }
  return { command: positional.shift(), positional, flags };
}

const str = (v: string | boolean | undefined): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

const yes = (flags: Parsed['flags']): boolean => flags['yes'] === true || flags['y'] === true;

export async function run(argv: readonly string[]): Promise<number> {
  const { command, positional, flags } = parse(argv);

  // version before the no-command case, or `skyl --version` prints help
  if (flags['version'] === true || flags['v'] === true) { out(`skyl ${VERSION}`); return 0; }
  if (flags['help'] === true || flags['h'] === true || command === 'help') { out(HELP); return 0; }
  if (command === undefined) { out(HELP); return 1; }

  const root = str(flags['C']) ?? process.cwd();
  const dir = str(flags['dir']);
  const refresh = flags['refresh'] === true;

  try {
    switch (command) {
      case 'scan':
        return await scan({ root, dir, refresh, json: flags['json'] === true });
      case 'add':
        return await add({ root, names: positional, target: str(flags['target']), dir, refresh, yes: yes(flags) });
      case 'list':
        return await list({ root, dir, refresh });
      case 'remove':
      case 'rm':
        return await remove({ root, names: positional, dir, refresh, yes: yes(flags) });
      case 'diff':
        return await diff({ root, names: positional, dir, refresh, full: flags['full'] === true });
      case 'update':
      case 'upgrade':
        return await update({
          root, names: positional, dir, refresh, yes: yes(flags),
          force: flags['force'] === true, showDiff: flags['diff'] === true,
        });
      case 'audit':
        return await audit({ root, file: positional[0], dir, refresh });
      case 'context':
        return await context({
          root, dryRun: flags['dry-run'] === true, json: flags['json'] === true,
          outFile: str(flags['out']),
          ...(str(flags['max-files']) === undefined ? {} : { maxFiles: Number(str(flags['max-files'])) }),
        });
      case 'learn':
        return await learn({
          root, agent: str(flags['agent']), printPrompt: flags['print-prompt'] === true,
          outFile: str(flags['out']), yes: yes(flags), target: str(flags['target']),
        });
      case 'lint':
        return await lint({ root, paths: positional, strict: flags['strict'] === true });
      default:
        err(`${red('Unknown command')} ${bold(command)}`);
        err(`Try ${cyan('skyl --help')}`);
        return 1;
    }
  } catch (cause) {
    if (cause instanceof SkylError) {
      err(`${red('Error')} ${cause.message}`);
      return 1;
    }
    throw cause;
  }
}
