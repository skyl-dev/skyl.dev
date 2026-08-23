import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { audit as analyse } from '@skyl/core';
import { readLockfile } from '../install.ts';
import { loadRegistry } from '../registry.ts';
import { bold, cyan, dim, green, out, red, tokens, yellow } from '../ui.ts';

/** Where hand-written agent context tends to live. */
const CANDIDATES = [
  'CLAUDE.md', '.claude/CLAUDE.md', 'AGENTS.md', '.cursorrules', '.windsurfrules',
  '.github/copilot-instructions.md', '.continue/rules.md', '.aider.conf.yml',
];

export interface AuditOptions {
  root: string;
  file?: string | undefined;
  dir?: string | undefined;
  refresh?: boolean | undefined;
}

/**
 * Read a hand-written context file and say what is in it.
 *
 * Analysis only, and no rewriting: prose passed through a model comes back longer and
 * more generic, and this file is usually one someone tuned by hand. Everything here is
 * lexical, so the matched words are always printed. A reader who disagrees can see
 * immediately why the tool said it.
 */
export async function audit(opts: AuditOptions): Promise<number> {
  let path = opts.file;
  if (!path) {
    for (const c of CANDIDATES) {
      const full = join(opts.root, c);
      if (await readFile(full, 'utf8').then(() => true, () => false)) { path = full; break; }
    }
  } else if (!path.startsWith('/')) {
    path = join(opts.root, path);
  }

  if (!path) {
    out(`  ${yellow('No hand-written context file found.')}`);
    out(`  ${dim(`Looked for ${CANDIDATES.slice(0, 4).join(', ')}`)}`);
    return 1;
  }

  const text = await readFile(path, 'utf8').catch(() => undefined);
  if (text === undefined) {
    out(`  ${red('Cannot read')} ${path}`);
    return 1;
  }

  const { skills } = await loadRegistry({ dir: opts.dir, refresh: opts.refresh });
  const lock = await readLockfile(opts.root);
  const installed = new Set(Object.keys(lock?.skills ?? {}));
  const report = analyse(text, skills);

  out();
  out(`  ${bold(relative(opts.root, path) || path)} ${dim(`${report.words} words, ${tokens(report.words)}`)}`);
  out();

  if (report.secrets.length > 0) {
    out(`  ${red('Possible credentials.')} ${dim('these reach the model with every request')}`);
    for (const s of report.secrets) out(`    ${red('!')} line ${s.line}, ${s.what}`);
    out();
  }

  let flagged = 0;
  for (const section of report.sections) {
    const notes: string[] = [];
    for (const o of section.overlaps) {
      const state = installed.has(o.skill) ? 'installed' : 'in the registry';
      notes.push(`${yellow('~')} shares vocabulary with ${bold(o.skill)} ${dim(`(${state}: ${o.terms.slice(0, 6).join(', ')})`)}`);
    }
    if (section.noInstruction && section.words > 40) {
      notes.push(`${yellow('~')} no instruction in it ${dim('nothing to follow, and the agent can read the code itself')}`);
    }
    if (notes.length === 0) continue;
    flagged += 1;
    out(`  ${bold(section.heading)} ${dim(`${section.words} words`)}`);
    for (const n of notes) out(`    ${n}`);
    out();
  }

  if (report.missing.length > 0) {
    out(`  ${dim('Not found in the file')}`);
    for (const m of report.missing) out(`    ${dim('o')} ${m}`);
    out();
  }

  if (flagged === 0 && report.secrets.length === 0) {
    out(`  ${green('Nothing to flag.')} ${dim('no overlap with the registry, and every section carries an instruction')}`);
    out();
    return 0;
  }

  out(`  ${dim('Overlap is word overlap, not a judgement. Read the section before cutting it.')}`);
  out(`  ${cyan('skyl scan')} ${dim('shows what the registry would install for this project.')}`);
  out();
  return 0;
}
