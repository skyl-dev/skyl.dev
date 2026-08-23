import { diffLines, hunks, stat } from '@skyl/core';
import { readLockfile, resolveTarget } from '../install.ts';
import { changedOnDisk, installedState, type Installed } from '../state.ts';
import { bold, cyan, dim, green, out, red, yellow } from '../ui.ts';

export interface DiffOptions {
  root: string;
  names?: string[];
  dir?: string | undefined;
  refresh?: boolean | undefined;
  full?: boolean | undefined;
}

/** Print one skill's installed-to-upstream diff. Returns true if anything differed. */
export function printDiff(item: Installed, full: boolean): boolean {
  if (item.upstream === undefined || item.onDisk === undefined) return false;
  const ops = diffLines(item.onDisk, item.upstream);
  const { added, removed } = stat(ops);
  if (added === 0 && removed === 0) return false;

  const versions = item.skill && item.skill.version !== item.entry.version
    ? dim(`${item.entry.version} to ${item.skill.version}`)
    : dim(`${item.entry.version}, edited here`);

  out();
  out(`  ${bold(item.name)} ${versions}  ${green(`+${added}`)} ${red(`-${removed}`)}`);
  out(`  ${dim('- what is in your file, + what upstream has')}`);
  out();

  for (const hunk of hunks(ops, full ? 999 : 3)) {
    out(`  ${cyan(`@@ -${hunk.beforeStart},${hunk.beforeCount} +${hunk.afterStart},${hunk.afterCount} @@`)}`);
    for (const line of hunk.lines) {
      const text = `${line.kind} ${line.text}`;
      out(`  ${line.kind === '+' ? green(text) : line.kind === '-' ? red(text) : dim(text)}`);
    }
  }
  return true;
}

export async function diff(opts: DiffOptions): Promise<number> {
  const lock = await readLockfile(opts.root);
  if (!lock || Object.keys(lock.skills).length === 0) {
    out(`${yellow('Nothing installed.')} Run ${bold('skyl scan')} to see what fits this project.`);
    return 0;
  }

  const target = resolveTarget(undefined, lock);
  // currency is the whole point of a diff, so prefer the network unless told otherwise
  const { items, from } = await installedState(opts.root, lock, target, {
    dir: opts.dir, refresh: opts.refresh ?? opts.dir === undefined,
  });

  if (from === undefined) {
    out(`  ${yellow('No registry reachable.')} ${dim('Nothing to compare against.')}`);
    return 1;
  }

  const wanted = new Set(opts.names ?? []);
  const subject = wanted.size === 0 ? items : items.filter((i) => wanted.has(i.name) || wanted.has(i.name.split('/')[1]!));
  if (subject.length === 0) {
    out(`  ${yellow('Not installed here.')} ${dim([...wanted].join(', '))}`);
    return 1;
  }

  let shown = 0;
  for (const item of subject) {
    if (item.skill === undefined) {
      out();
      out(`  ${bold(item.name)} ${yellow('is no longer in the registry')} ${dim('installed at ' + item.entry.version)}`);
      shown += 1;
      continue;
    }
    if (item.onDisk === undefined) {
      out();
      out(`  ${bold(item.name)} ${yellow('file is gone')} ${dim(`skyl add ${item.name} puts it back`)}`);
      shown += 1;
      continue;
    }
    if (printDiff(item, opts.full === true)) shown += 1;
  }

  out();
  if (shown === 0) {
    out(`  ${green('Up to date.')} ${dim(`${subject.length} skills, nothing changed here or upstream`)}`);
  } else {
    const editable = subject.filter((i) => changedOnDisk(i) && i.state !== 'local-edit').length;
    if (editable > 0) out(`  ${cyan('skyl update')} ${dim('applies the upstream side')}`);
  }
  out();
  return 0;
}
