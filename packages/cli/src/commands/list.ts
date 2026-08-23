import { drift, type DriftKind } from '@skyl/core';
import { loadRegistry } from '../registry.ts';
import { readInstalled, readLockfile, resolveTarget } from '../install.ts';
import { bold, cyan, dim, out, tokens, yellow } from '../ui.ts';

const LABEL: Record<DriftKind, (s: string) => string> = {
  unchanged: dim,
  'local-edit': yellow,
  'upstream-change': cyan,
  both: yellow,
  missing: yellow,
};

const SAYS: Record<DriftKind, string> = {
  unchanged: '',
  'local-edit': 'edited here',
  'upstream-change': 'update available',
  both: 'edited here, and updated upstream',
  missing: 'file is gone',
};

export async function list(opts: { root: string; dir?: string | undefined; refresh?: boolean | undefined }): Promise<number> {
  const lock = await readLockfile(opts.root);
  if (!lock || Object.keys(lock.skills).length === 0) {
    out(`${yellow('Nothing installed.')} Run ${bold('skyl scan')} to see what fits this project.`);
    return 0;
  }

  const target = resolveTarget(undefined, lock);
  let upstream = new Map<string, Awaited<ReturnType<typeof loadRegistry>>['skills'][number]>();
  try {
    const reg = await loadRegistry({ dir: opts.dir, refresh: opts.refresh });
    upstream = new Map(reg.skills.map((s) => [s.name, s]));
  } catch {
    // offline is fine: local state is still worth showing, drift just cannot be judged
  }

  out();
  out(`  ${bold('Installed')} ${dim(`for ${target.id}, in ${target.dir}`)}`);
  out();

  let words = 0;
  for (const name of Object.keys(lock.skills).sort()) {
    const entry = lock.skills[name]!;
    const remote = upstream.get(name);
    const onDisk = remote ? await readInstalled(opts.root, target, remote) : undefined;
    const state = upstream.size === 0 ? 'unchanged' : drift(entry, onDisk, remote);
    const note = SAYS[state];
    if (remote) words += remote.installableWords;
    out(`    ${bold(name.padEnd(22))} ${entry.version.padEnd(8)} ${dim(entry.reason.padEnd(10))} ${LABEL[state](note)}`);
  }

  out();
  if (words > 0) out(`  ${Object.keys(lock.skills).length} skills, ${tokens(words)}`);
  const stale = Object.keys(lock.skills).some((n) => {
    const r = upstream.get(n);
    return r && r.version !== lock.skills[n]!.version;
  });
  if (stale) out(`  ${cyan('skyl add')} ${dim('reinstalls at the current version')}`);
  out();
  return 0;
}
