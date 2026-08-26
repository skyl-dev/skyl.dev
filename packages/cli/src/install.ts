import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  DEFAULT_TARGET, LOCKFILE_NAME, entryFor, formatLockfile, parseLockfile,
  takesReferences, targetById, type Lockfile, type Skill, type Target,
} from '@skyl/core';

export async function readLockfile(root: string): Promise<Lockfile | undefined> {
  try {
    return parseLockfile(await readFile(join(root, LOCKFILE_NAME), 'utf8'));
  } catch {
    return undefined;
  }
}

export async function writeLockfile(root: string, lock: Lockfile): Promise<void> {
  await writeFile(join(root, LOCKFILE_NAME), formatLockfile(lock), 'utf8');
}

/** What gets written for a skill, under the conventions of one target. */
export function renderFor(target: Target, skill: Skill): string {
  return `${target.header(skill)}${skill.installable}\n`;
}

/**
 * Where a reference file goes, for a target that gives the skill a directory.
 *
 * Beside SKILL.md under the name the rule already uses, so `see references/money.md`
 * resolves by reading it literally. Every other layout would need the rule text rewritten
 * per target, and a skill whose body differs by tool is a skill nobody can diff.
 */
export function referencePathFor(root: string, target: Target, skill: Skill, file: string): string {
  return join(dirname(pathFor(root, target, skill)), 'references', file);
}

/** Reference files a target cannot carry, so a caller can say so rather than drop them. */
export function referencesDropped(target: Target, ordered: readonly Skill[]): readonly Skill[] {
  if (takesReferences(target)) return [];
  return ordered.filter((s) => s.references.length > 0);
}

/** Skills whose written form is past what the target will actually read. */
export function overLimit(
  target: Target,
  ordered: readonly Skill[],
): { readonly over: readonly Skill[]; readonly total: number } {
  if (!target.limit) return { over: [], total: 0 };
  const size = (s: Skill) => renderFor(target, s).length;
  return {
    over: ordered.filter((s) => size(s) > target.limit!.perFile),
    total: ordered.reduce((n, s) => n + size(s), 0),
  };
}

export function pathFor(root: string, target: Target, skill: Skill): string {
  return join(root, target.dir, target.fileFor(skill.name));
}

export async function readInstalled(root: string, target: Target, skill: Skill): Promise<string | undefined> {
  try {
    return await readFile(pathFor(root, target, skill), 'utf8');
  } catch {
    return undefined;
  }
}

export async function install(
  root: string,
  target: Target,
  ordered: readonly Skill[],
  requested: ReadonlySet<string>,
  existing: Lockfile | undefined,
): Promise<Lockfile> {
  const lock: Lockfile = {
    lockfileVersion: 1,
    target: target.id,
    skills: { ...(existing?.target === target.id ? existing.skills : {}) },
  };

  const carriesReferences = takesReferences(target);

  for (const skill of ordered) {
    const file = pathFor(root, target, skill);
    const text = renderFor(target, skill);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text, 'utf8');

    // the rules say `see references/x.md`, so the file has to be at that path or the
    // pointer is a dead end. A target with no directory of its own cannot hold them;
    // `referencesDropped` is what tells the user, rather than this failing quietly.
    if (carriesReferences) {
      for (const reference of skill.references) {
        const at = referencePathFor(root, target, skill, reference.file);
        await mkdir(dirname(at), { recursive: true });
        await writeFile(at, reference.body, 'utf8');
      }
    }
    (lock.skills as Record<string, ReturnType<typeof entryFor>>)[skill.name] = entryFor(
      skill,
      text,
      requested.has(skill.name) ? 'requested' : 'required',
    );
  }
  return lock;
}

export function resolveTarget(id: string | undefined, lock: Lockfile | undefined): Target {
  const wanted = id ?? lock?.target ?? DEFAULT_TARGET;
  const target = targetById(wanted);
  if (!target) {
    throw new Error(`unknown target \`${wanted}\``);
  }
  return target;
}
