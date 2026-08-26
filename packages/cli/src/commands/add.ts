import { implied, normalise, resolve } from '@skyl/core';
import { loadRegistry } from '../registry.ts';
import {
  install, overLimit, readLockfile, referencesDropped, resolveTarget, writeLockfile,
} from '../install.ts';
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
  const files = ordered.reduce((n, s) => n + s.references.length, 0);
  const alsoRefs = files > 0 && referencesDropped(target, ordered).length === 0
    ? dim(`, plus ${files} reference ${files === 1 ? 'file' : 'files'}`)
    : '';
  out();
  const count = `${ordered.length} ${ordered.length === 1 ? 'skill' : 'skills'}`;
  out(`  ${count}${alsoRefs}, ${tokens(words)} ${dim(`into ${target.dir}`)}`);
  out();

  // Said before the prompt, not after: both of these change what the user is agreeing to.
  const dropped = referencesDropped(target, ordered);
  if (dropped.length > 0) {
    out(`  ${yellow('References stay behind.')} ${dim(`${target.id} keeps one file per skill, so the`)}`);
    out(`  ${dim('files these rules point at cannot sit beside them:')}`);
    for (const skill of dropped) {
      out(`    ${dim(`${skill.name}  ${skill.references.map((r) => r.file).join(', ')}`)}`);
    }
    out(`  ${dim('Read them on https://skyl.dev/skills, under References.')}`);
    out();
  }

  const { over, total } = overLimit(target, ordered);
  if (target.limit && (over.length > 0 || total > target.limit.total)) {
    out(`  ${yellow('Past what this tool reads.')}`);
    for (const line of target.limit.says.split('\n')) out(`  ${dim(line)}`);
    for (const skill of over) {
      const size = skill.installable.length;
      out(`    ${dim(`${skill.name.padEnd(22)} ${size.toLocaleString()} characters`)}`);
    }
    if (total > target.limit.total) {
      out(`    ${dim(`all of them together    ${total.toLocaleString()} characters`)}`);
    }
    out(`  ${dim('Install fewer of them, or use a tool with no ceiling.')}`);
    out();
  }

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
