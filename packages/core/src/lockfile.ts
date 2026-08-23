import { createHash } from 'node:crypto';
import type { Skill } from './types.ts';

/**
 * `skyl.lock` records what was installed and the hash of what was written.
 *
 * The hash is of the installed content, not the source file: that is what `update` has
 * to compare against, and it is what tells local edits apart from upstream changes.
 */
export interface LockEntry {
  readonly version: string;
  /** sha256 of the installed text, `sha256:<hex>`. */
  readonly hash: string;
  /** Whether the user asked for this or it arrived through `requires`. */
  readonly reason: 'requested' | 'required';
}

export interface Lockfile {
  readonly lockfileVersion: 1;
  readonly target: string;
  readonly source?: string;
  readonly skills: Record<string, LockEntry>;
}

export const LOCKFILE_NAME = 'skyl.lock';

export function hashContent(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

export function emptyLockfile(target: string): Lockfile {
  return { lockfileVersion: 1, target, skills: {} };
}

export function parseLockfile(text: string): Lockfile {
  const data = JSON.parse(text) as Lockfile;
  if (data.lockfileVersion !== 1) {
    throw new Error(`unsupported lockfile version ${String(data.lockfileVersion)}`);
  }
  return data;
}

/** Serialised with sorted keys so a reinstall produces no diff. */
export function formatLockfile(lock: Lockfile): string {
  const skills: Record<string, LockEntry> = {};
  for (const name of Object.keys(lock.skills).sort()) skills[name] = lock.skills[name]!;
  const ordered = { lockfileVersion: lock.lockfileVersion, target: lock.target, ...(lock.source ? { source: lock.source } : {}), skills };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export function entryFor(skill: Skill, installed: string, reason: LockEntry['reason']): LockEntry {
  return { version: skill.version, hash: hashContent(installed), reason };
}

export type DriftKind = 'unchanged' | 'local-edit' | 'upstream-change' | 'both' | 'missing';

/**
 * What happened to an installed skill.
 *
 * `local-edit` and `upstream-change` are told apart because the fix differs: one is the
 * user's work to keep, the other is ours to offer. When both moved, neither can be
 * applied blindly.
 */
export function drift(
  entry: LockEntry | undefined,
  onDisk: string | undefined,
  upstream: Skill | undefined,
): DriftKind {
  if (!entry || onDisk === undefined) return 'missing';
  const localChanged = hashContent(onDisk) !== entry.hash;
  const upstreamChanged = upstream !== undefined && upstream.version !== entry.version;
  if (localChanged && upstreamChanged) return 'both';
  if (localChanged) return 'local-edit';
  if (upstreamChanged) return 'upstream-change';
  return 'unchanged';
}
