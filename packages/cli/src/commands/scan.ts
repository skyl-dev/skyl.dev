import { detect, resolve, unmatched, type Skill } from '@skyl/core';
import { scanProject } from '../scan.ts';
import { loadRegistry } from '../registry.ts';
import { readLockfile, resolveTarget } from '../install.ts';
import { bold, cyan, dim, green, out, tokens, yellow } from '../ui.ts';

export interface ScanOptions {
  root: string;
  dir?: string | undefined;
  refresh?: boolean | undefined;
  json?: boolean | undefined;
}

export async function scan(opts: ScanOptions): Promise<number> {
  const { skills } = await loadRegistry({ dir: opts.dir, refresh: opts.refresh });
  const signals = await scanProject(opts.root);
  const matched = detect(skills, signals);

  if (matched.length === 0) {
    out(`${yellow('Nothing detected.')} No skill in the registry matches this project.`);
    out(dim('  Skyl currently covers Android. If this is an Android project, please open an issue.'));
    return 0;
  }

  const chosen = resolve(skills, matched.map((m) => m.skill));
  const lock = await readLockfile(opts.root);
  const target = resolveTarget(undefined, lock);
  const installed = new Set(Object.keys(lock?.skills ?? {}));

  if (opts.json) {
    out(JSON.stringify({
      detected: matched,
      install: chosen.map((s) => ({ name: s.name, version: s.version, words: s.installableWords, installed: installed.has(s.name) })),
      target: target.id,
    }, null, 2));
    return 0;
  }

  const evidence = new Map<string, string[]>();
  for (const m of matched) evidence.set(m.skill, m.on.map((o) => o.value));

  out();
  out(`  ${bold('Detected')} ${dim(`in ${opts.root}`)}`);
  out();
  for (const skill of chosen) {
    const why = evidence.get(skill.name);
    const mark = installed.has(skill.name) ? dim('installed') : green('new');
    const reason = why?.length ? why[0]! : skill.axis === 'core' ? `every ${skill.family} project` : 'required';
    out(`    ${bold(skill.name.padEnd(22))} ${mark.padEnd(18)} ${dim(reason)}`);
  }

  const rest = unmatched(skills, matched).filter((s) => !chosen.some((c) => c.name === s.name));
  if (rest.length > 0) {
    out();
    out(`  ${dim('Considered and not detected')}`);
    for (const s of rest) out(`    ${dim(s.name)}`);
  }

  const fresh = chosen.filter((s) => !installed.has(s.name));
  const words = fresh.reduce((n, s) => n + s.installableWords, 0);
  out();
  if (fresh.length === 0) {
    out(`  ${green('Up to date.')} ${dim(`${chosen.length} skills installed for ${target.id}.`)}`);
  } else {
    out(`  ${fresh.length} to install, ${tokens(words)} ${dim(`into ${target.dir}`)}`);
    out();
    out(`    ${cyan(`skyl add ${fresh.map((s) => s.name).join(' ')}`)}`);
  }
  out();
  return 0;
}

export type { Skill };
