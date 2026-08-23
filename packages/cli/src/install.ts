import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  DEFAULT_TARGET, LOCKFILE_NAME, entryFor, formatLockfile, parseLockfile,
  targetById, type Lockfile, type Skill, type Target,
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
  const header = target.header?.(skill.name, skill.version) ?? '';
  return `${header}${skill.installable}\n`;
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

  for (const skill of ordered) {
    const file = pathFor(root, target, skill);
    const text = renderFor(target, skill);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text, 'utf8');
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
