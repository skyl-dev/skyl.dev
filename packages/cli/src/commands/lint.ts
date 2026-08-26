import { readdir, readFile, stat as statFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { lintRegistry, lintSkill, parseSkill, type Finding, type Skill } from '@skyl/core';
import { bold, cyan, dim, err, green, out, red, yellow } from '../ui.ts';

export interface LintOptions {
  root: string;
  paths: string[];
  strict?: boolean | undefined;
}

async function skillFiles(path: string): Promise<string[]> {
  const info = await statFile(path).catch(() => undefined);
  if (!info) return [];
  if (info.isFile()) return [path];

  const out: string[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 3) return;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, depth + 1);
      else if (entry.name === 'SKILL.md') out.push(full);
    }
  };
  await walk(path, 0);
  return out.sort();
}

/**
 * Check skills against the spec.
 *
 * The registry repository has its own validator in Python. Keeping both is deliberate:
 * they are independent readings of the same document, CI runs both, and a disagreement
 * between them surfaces as a failure rather than as silence.
 */
export async function lint(opts: LintOptions): Promise<number> {
  const targets = opts.paths.length > 0 ? opts.paths : await defaultPaths(opts.root);
  if (targets.length === 0) {
    err(`${yellow('Nothing to lint.')} Point at a SKILL.md or a skills directory.`);
    return 1;
  }

  const files: string[] = [];
  for (const t of targets) files.push(...await skillFiles(t));
  if (files.length === 0) {
    err(`${yellow('No SKILL.md found in')} ${targets.join(', ')}`);
    return 1;
  }

  /*
   * An install directory is not a registry, and saying so beats reporting the difference
   * as a spec violation on every file. What arrives in `.claude/skills` is a flattened
   * name and the agent sections only, by design, so linting it against the authoring spec
   * produces one error per skill and none of them are actionable.
   */
  const written = await Promise.all(files.map((f) => readFile(f, 'utf8')));
  if (written.length > 0 && written.every((text) => /^---\nname: [^/\n]+\n/.test(text))) {
    err(`${yellow('That is an install directory, not a registry.')}`);
    err(dim('  Installed skills carry a flattened name and only the sections an agent is given.'));
    err(dim('  Lint the registry they came from: skyl lint <checkout>/skills'));
    return 1;
  }

  let errors = 0;
  let warnings = 0;
  const parsed: Skill[] = [];
  const perFile = new Map<string, Finding[]>();
  const fileOf = new Map<string, string>();

  for (const file of files) {
    const text = await readFile(file, 'utf8');
    perFile.set(file, lintSkill(text, file));
    try {
      const skill = parseSkill(text);
      parsed.push(skill);
      fileOf.set(skill.name, file);
    } catch {
      // already reported by lintSkill
    }
  }

  // requires and cross-references can only be judged against the whole set
  for (const [name, found] of lintRegistry(parsed)) {
    const file = fileOf.get(name);
    if (!file) continue;
    perFile.set(file, [...(perFile.get(file) ?? []), ...found]);
  }

  out();
  for (const file of files) {
    const found = perFile.get(file) ?? [];
    const where = relative(opts.root, file) || file;
    if (found.length === 0) {
      out(`  ${green('ok')}   ${dim(where)}`);
      continue;
    }
    out(`  ${found.some((f) => f.level === 'error') ? red('fail') : yellow('warn')} ${bold(where)}`);
    for (const f of found) {
      if (f.level === 'error') errors += 1; else warnings += 1;
      const at = f.line === undefined ? '' : dim(`:${f.line}`);
      out(`       ${f.level === 'error' ? red('error') : yellow('warn ')}${at} ${f.message}`);
      if (f.detail) out(`             ${dim(f.detail)}`);
    }
  }

  out();
  out(`  ${files.length} skill${files.length === 1 ? '' : 's'}, ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`);
  if (errors === 0 && warnings > 0 && opts.strict !== true) {
    out(`  ${dim('warnings do not fail this run,')} ${cyan('--strict')} ${dim('makes them')}`);
  }
  out();
  return errors > 0 || (opts.strict === true && warnings > 0) ? 1 : 0;
}

async function defaultPaths(root: string): Promise<string[]> {
  for (const candidate of ['skills', '.']) {
    const path = join(root, candidate);
    const found = await skillFiles(path);
    if (found.length > 0) return [path];
  }
  return [];
}
