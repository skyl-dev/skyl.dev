import { implied, normalise, resolve } from '@skyl/core';
import { loadRegistry } from '../registry.ts';
import { install, readLockfile, resolveTarget, writeLockfile } from '../install.ts';
import { bold, confirm, dim, green, out, tokens, yellow } from '../ui.ts';

export interface AddOptions {
  root: string;
  names: string[];
  target?: string | undefined;
  dir?: string | undefined;
  refresh?: boolean | undefined;
  yes?: boolean | undefined;
}

export async function add(opts: AddOptions): Promise<number> {
  if (opts.names.length === 0) {
    out(`${yellow('Nothing to add.')} Name a skill, or run ${bold('skyl scan')} to see what fits.`);
    return 1;
  }

  const { skills } = await loadRegistry({ dir: opts.dir, refresh: opts.refresh });
  const requested = normalise(skills, opts.names);
  const ordered = resolve(skills, requested);
  const extra = implied(ordered, requested);

  const lock = await readLockfile(opts.root);
  const target = resolveTarget(opts.target, lock);
  const already = new Set(Object.keys(lock?.skills ?? {}));

  out();
  for (const skill of ordered) {
    const state = already.has(skill.name) ? dim('reinstall') : green('install');
    const why = extra.some((e) => e.name === skill.name) ? dim('required by another skill') : '';
    out(`    ${bold(skill.name.padEnd(22))} ${skill.version.padEnd(8)} ${state.padEnd(18)} ${why}`);
  }

  const words = ordered.reduce((n, s) => n + s.installableWords, 0);
  out();
  out(`  ${ordered.length} skills, ${tokens(words)} ${dim(`into ${target.dir}`)}`);
  out();

  if (!(await confirm('  Write them?', opts.yes === true))) {
    out(`  ${dim('Nothing written.')}`);
    return 1;
  }

  const next = await install(opts.root, target, ordered, new Set(requested), lock);
  await writeLockfile(opts.root, next);

  out();
  out(`  ${green('Done.')} ${dim('Recorded in skyl.lock.')}`);
  out();
  return 0;
}
