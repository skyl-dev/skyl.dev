import { SourceError } from './errors.ts';
import { parseSkill } from './parse.ts';
import type { Skill } from './types.ts';

/**
 * Where skill content comes from.
 *
 * Three routes, tried in order, because each fails in a different way: a bundle shipped
 * inside the package always works and goes stale, a fetched artifact is current and needs
 * a network, and a local directory is what a contributor is editing. Resolution order is
 * configuration rather than something baked into the CLI.
 */
export interface Source {
  readonly name: string;
  /** Every skill this source can supply. */
  load(): Promise<Skill[]>;
}

/** A directory laid out as `<root>/<family>/<skill>/SKILL.md`. */
export function directorySource(root: string, label = 'directory'): Source {
  return {
    name: `${label} (${root})`,
    async load() {
      const { readdir, readFile } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const out: Skill[] = [];

      let families: string[];
      try {
        families = (await readdir(root, { withFileTypes: true }))
          .filter((e) => e.isDirectory())
          .map((e) => e.name);
      } catch (cause) {
        throw new SourceError(`cannot read ${root}`, String(cause));
      }

      for (const family of families) {
        const dir = join(root, family);
        const entries = (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory());
        for (const entry of entries) {
          const file = join(dir, entry.name, 'SKILL.md');
          try {
            out.push(parseSkill(await readFile(file, 'utf8')));
          } catch (cause) {
            if ((cause as NodeJS.ErrnoException).code === 'ENOENT') continue;
            throw new SourceError(`cannot parse ${file}`, (cause as Error).message);
          }
        }
      }
      return out;
    },
  };
}

/** A JSON bundle: `{ "skills": { "android/core": "<raw SKILL.md>" } }`. */
export interface Bundle {
  readonly version?: string;
  readonly skills: Record<string, string>;
}

export function bundleSource(load: () => Promise<Bundle>, label: string): Source {
  return {
    name: label,
    async load() {
      const bundle = await load();
      return Object.entries(bundle.skills).map(([name, raw]) => {
        try {
          return parseSkill(raw);
        } catch (cause) {
          throw new SourceError(`cannot parse \`${name}\` from ${label}`, (cause as Error).message);
        }
      });
    },
  };
}

export function httpBundleSource(url: string, label = 'remote'): Source {
  return bundleSource(async () => {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new SourceError(`${label} returned ${res.status}`, url);
    return (await res.json()) as Bundle;
  }, `${label} (${url})`);
}

/**
 * Try sources in order and take the first that yields anything.
 *
 * Failures are collected rather than thrown as they happen: falling back from a network
 * source to a bundled one is the normal path, not an error, and a caller only needs to
 * hear about it when every route failed.
 */
export async function firstAvailable(sources: readonly Source[]): Promise<{ skills: Skill[]; from: Source }> {
  const failures: string[] = [];
  for (const source of sources) {
    try {
      const skills = await source.load();
      if (skills.length > 0) return { skills, from: source };
      failures.push(`${source.name}: empty`);
    } catch (cause) {
      failures.push(`${source.name}: ${(cause as Error).message}`);
    }
  }
  throw new SourceError('no source could supply the registry', failures.join('\n  '));
}
