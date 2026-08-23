import { drift, type DriftKind, type LockEntry, type Lockfile, type Skill, type Target } from '@skyl/core';
import { readInstalled, renderFor } from './install.ts';
import { loadRegistry } from './registry.ts';

/**
 * What is installed here, next to what upstream currently says.
 *
 * `list`, `diff` and `update` all need exactly this, and computing it in one place is
 * what keeps them from disagreeing about whether something has moved.
 */
export interface Installed {
  readonly name: string;
  readonly entry: LockEntry;
  readonly skill: Skill | undefined;
  /** What is in the file now, if the file is still there. */
  readonly onDisk: string | undefined;
  /** What we would write today. */
  readonly upstream: string | undefined;
  readonly state: DriftKind;
}

export async function installedState(
  root: string,
  lock: Lockfile,
  target: Target,
  opts: { dir?: string | undefined; refresh?: boolean | undefined },
): Promise<{ items: Installed[]; from: string | undefined }> {
  let registry: Map<string, Skill> | undefined;
  let from: string | undefined;
  try {
    const reg = await loadRegistry(opts);
    registry = new Map(reg.skills.map((s) => [s.name, s]));
    from = reg.from;
  } catch {
    // offline: local state is still worth showing, drift just cannot be judged
  }

  const items: Installed[] = [];
  for (const name of Object.keys(lock.skills).sort()) {
    const entry = lock.skills[name]!;
    const skill = registry?.get(name);
    const onDisk = skill ? await readInstalled(root, target, skill) : undefined;
    items.push({
      name,
      entry,
      skill,
      onDisk,
      upstream: skill ? renderFor(target, skill) : undefined,
      state: registry === undefined ? 'unchanged' : drift(entry, onDisk, skill),
    });
  }
  return { items, from };
}

/**
 * A skill that moved upstream can still be byte-identical here: a patch release that
 * only touched `## Why` changes the version and not a word of what was installed.
 * Saying "update available" for that is noise, so the two are told apart.
 */
export function changedOnDisk(item: Installed): boolean {
  return item.upstream !== undefined && item.onDisk !== item.upstream;
}
