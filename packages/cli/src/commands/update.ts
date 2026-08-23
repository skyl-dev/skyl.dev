import { resolve, type Skill } from '@skyl/core';
import { install, readLockfile, resolveTarget, writeLockfile } from '../install.ts';
import { loadRegistry } from '../registry.ts';
import { changedOnDisk, installedState } from '../state.ts';
import { printDiff } from './diff.ts';
import { bold, confirm, cyan, dim, green, out, tokens, yellow } from '../ui.ts';

export interface UpdateOptions {
  root: string;
  names?: string[];
  dir?: string | undefined;
  refresh?: boolean | undefined;
  yes?: boolean | undefined;
  force?: boolean | undefined;
  showDiff?: boolean | undefined;
}

type Action = 'apply' | 'restore' | 'new' | 'kept' | 'conflict' | 'gone';

const SAYS: Record<Action, string> = {
  apply: 'update',
  restore: 'file is gone, put it back',
  new: 'newly required',
  kept: 'edited here, left alone',
  conflict: 'edited here, and changed upstream',
  gone: 'no longer in the registry',
};

export async function update(opts: UpdateOptions): Promise<number> {
  const lock = await readLockfile(opts.root);
  if (!lock || Object.keys(lock.skills).length === 0) {
    out(`${yellow('Nothing installed.')} Run ${bold('skyl scan')} to see what fits this project.`);
    return 0;
  }

  const target = resolveTarget(undefined, lock);
  const load = { dir: opts.dir, refresh: opts.refresh ?? opts.dir === undefined };
  const { items, from } = await installedState(opts.root, lock, target, load);
  if (from === undefined) {
    out(`  ${yellow('No registry reachable.')} ${dim('Nothing to update from.')}`);
    return 1;
  }

  const { skills } = await loadRegistry(load);
  const requested = Object.entries(lock.skills).filter(([, e]) => e.reason === 'requested').map(([n]) => n);
  const known = new Set(skills.map((s) => s.name));

  // a new version can add a `requires`, and the dependency has to arrive with it
  let ordered: Skill[] = [];
  try {
    ordered = resolve(skills, requested.filter((n) => known.has(n)));
  } catch {
    ordered = [];
  }
  const held = new Set(Object.keys(lock.skills));
  const arrivals = ordered.filter((s) => !held.has(s.name));

  const plan: { skill: Skill | undefined; name: string; action: Action; version: string }[] = [];

  for (const item of items) {
    if (!item.skill) { plan.push({ skill: undefined, name: item.name, action: 'gone', version: item.entry.version }); continue; }
    if (item.onDisk === undefined) { plan.push({ skill: item.skill, name: item.name, action: 'restore', version: item.skill.version }); continue; }
    if (!changedOnDisk(item)) {
      // byte-identical: a patch that only touched `## Why` is not an update to anything
      // installed, so the lockfile version is corrected quietly and nothing is rewritten
      continue;
    }
    if (item.state === 'local-edit') { plan.push({ skill: item.skill, name: item.name, action: 'kept', version: item.entry.version }); continue; }
    if (item.state === 'both') { plan.push({ skill: item.skill, name: item.name, action: opts.force === true ? 'apply' : 'conflict', version: item.skill.version }); continue; }
    plan.push({ skill: item.skill, name: item.name, action: 'apply', version: item.skill.version });
  }
  for (const skill of arrivals) plan.push({ skill, name: skill.name, action: 'new', version: skill.version });

  const wanted = new Set(opts.names ?? []);
  const chosen = plan.filter((p) =>
    (p.action === 'apply' || p.action === 'restore' || p.action === 'new') &&
    (wanted.size === 0 || wanted.has(p.name) || wanted.has(p.name.split('/')[1]!)));

  const stale = items.filter((i) => i.skill && i.skill.version !== i.entry.version && !changedOnDisk(i));

  if (plan.length === 0 && stale.length === 0) {
    out();
    out(`  ${green('Up to date.')} ${dim(`${items.length} skills, from ${from}`)}`);
    out();
    return 0;
  }

  out();
  for (const p of plan) {
    const colour = p.action === 'conflict' || p.action === 'kept' || p.action === 'gone' ? yellow : green;
    out(`    ${bold(p.name.padEnd(22))} ${p.version.padEnd(8)} ${colour(SAYS[p.action])}`);
  }
  out();

  if (chosen.length === 0) {
    if (plan.some((p) => p.action === 'conflict')) {
      out(`  ${dim('Nothing applied.')} ${cyan('skyl diff')} shows both sides, ${cyan('--force')} takes the upstream one.`);
    } else {
      out(`  ${dim('Nothing to apply.')}`);
    }
    if (stale.length > 0) await recordVersions(opts.root, lock, stale.map((i) => [i.name, i.skill!.version] as const));
    out();
    return 0;
  }

  if (opts.showDiff === true) {
    for (const item of items) {
      if (chosen.some((c) => c.name === item.name)) printDiff(item, false);
    }
    out();
  }

  const words = chosen.reduce((n, c) => n + (c.skill?.installableWords ?? 0), 0);
  out(`  ${chosen.length} to write, ${tokens(words)} ${dim(`into ${target.dir}`)}`);
  out();
  if (!(await confirm('  Apply?', opts.yes === true))) {
    out(`  ${dim('Nothing written.')}`);
    return 1;
  }

  const requestedSet = new Set(requested);
  const next = await install(
    opts.root, target,
    chosen.map((c) => c.skill!),
    requestedSet,
    lock,
  );
  for (const [name, version] of stale.map((i) => [i.name, i.skill!.version] as const)) {
    const entry = next.skills[name];
    if (entry) (next.skills as Record<string, typeof entry>)[name] = { ...entry, version };
  }
  await writeLockfile(opts.root, next);

  out();
  out(`  ${green('Done.')} ${dim('skyl.lock records what is here now.')}`);
  out();
  return 0;
}

/** A version bump that changed nothing installed still belongs in the lockfile. */
async function recordVersions(
  root: string,
  lock: Awaited<ReturnType<typeof readLockfile>> & object,
  pairs: readonly (readonly [string, string])[],
): Promise<void> {
  if (pairs.length === 0) return;
  const skills = { ...lock.skills };
  for (const [name, version] of pairs) {
    const entry = skills[name];
    if (entry) skills[name] = { ...entry, version };
  }
  await writeLockfile(root, { ...lock, skills });
}
