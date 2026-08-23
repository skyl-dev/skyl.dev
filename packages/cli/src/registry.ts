import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bundleSource, directorySource, firstAvailable, httpBundleSource,
  type Bundle, type Skill, type Source,
} from '@skyl/core';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Where the registry is fetched from when nothing local is available. */
const REMOTE = 'https://skyl.dev/registry.json';

/**
 * Sources in the order they are tried.
 *
 * A local directory first, so someone editing skills sees their edit immediately. Then
 * the bundle shipped inside this package, which always works and is as old as the
 * release. Then the network, which is current and may not be reachable.
 *
 * The bundle before the network means the common path never blocks on a request, and
 * `--refresh` reverses the last two when currency matters more than speed.
 */
export function sources(opts: { dir?: string | undefined; refresh?: boolean | undefined }): Source[] {
  const list: Source[] = [];
  if (opts.dir) list.push(directorySource(resolvePath(opts.dir), 'local'));

  const bundlePath = join(HERE, '..', 'bundle.json');
  const bundled = bundleSource(
    async () => JSON.parse(await readFile(bundlePath, 'utf8')) as Bundle,
    'bundled',
  );
  const remote = httpBundleSource(REMOTE, 'skyl.dev');

  if (opts.refresh) list.push(remote, bundled);
  else if (existsSync(bundlePath)) list.push(bundled, remote);
  else list.push(remote);

  return list;
}

export async function loadRegistry(
  opts: { dir?: string | undefined; refresh?: boolean | undefined },
): Promise<{ skills: Skill[]; from: string }> {
  const { skills, from } = await firstAvailable(sources(opts));
  return { skills, from: from.name };
}
