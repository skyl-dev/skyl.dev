import { rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { normalise } from '@skyl/core';
import { pathFor, readLockfile, resolveTarget, writeLockfile } from '../install.ts';
import { loadRegistry } from '../registry.ts';
import { bold, confirm, dim, green, out, red, yellow } from '../ui.ts';

export interface RemoveOptions {
  root: string;
  names: string[];
  dir?: string | undefined;
  refresh?: boolean | undefined;
  yes?: boolean | undefined;
}

/**
 * Take a skill back out.
 *
 * Removal refuses to orphan a dependency: if something still installed requires the
 * skill being removed, that other skill is left referring to rules the agent will not
 * have, which is a worse state than either keeping or removing both.
 */
export async function remove(opts: RemoveOptions): Promise<number> {
  const lock = await readLockfile(opts.root);
  if (!lock || Object.keys(lock.skills).length === 0) {
    out(`${yellow('Nothing installed.')}`);
    return 1;
  }
  if (opts.names.length === 0) {
    out(`${yellow('Name a skill to remove.')}`);
    return 1;
  }

  const target = resolveTarget(undefined, lock);
  const { skills } = await loadRegistry({ dir: opts.dir, refresh: opts.refresh });
  const byName = new Map(skills.map((s) => [s.name, s]));
  const installed = new Set(Object.keys(lock.skills));

  const asked = normalise(skills.filter((s) => installed.has(s.name)), opts.names);
  const going = new Set(asked);

  const orphaned: string[] = [];
  for (const name of installed) {
    if (going.has(name)) continue;
    for (const dep of byName.get(name)?.requires ?? []) {
      if (going.has(dep)) orphaned.push(`${name} requires ${dep}`);
    }
  }
  if (orphaned.length > 0) {
    out(`  ${red('Still required.')}`);
    for (const line of orphaned) out(`    ${dim(line)}`);
    out();
    out(`  ${dim('Remove those first, or keep this one.')}`);
    return 1;
  }

  out();
  for (const name of asked) out(`    ${bold(name.padEnd(22))} ${red('remove')}`);
  out();
  if (!(await confirm('  Delete them?', opts.yes === true))) {
    out(`  ${dim('Nothing deleted.')}`);
    return 1;
  }

  const skills2 = { ...lock.skills };
  for (const name of asked) {
    const skill = byName.get(name);
    if (skill) {
      const file = pathFor(opts.root, target, skill);
      await rm(file, { force: true });
      // claude puts each skill in its own directory, which is now empty
      if (target.fileFor(name).includes('/')) await rm(dirname(file), { recursive: true, force: true });
    }
    delete skills2[name];
  }
  await writeLockfile(opts.root, { ...lock, skills: skills2 });

  out();
  out(`  ${green('Removed.')} ${dim(`${asked.length} gone, ${Object.keys(skills2).length} left`)}`);
  out();
  return 0;
}
