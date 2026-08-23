/**
 * A line diff, so `diff` and `update` can show what actually moved.
 *
 * Written here rather than pulled in because the whole package is dependency-free and
 * this is the one diff shape the CLI needs: whole lines, no rename detection, no word
 * level highlighting. A skill file is prose and bullet lists, where a line is the unit a
 * reader thinks in anyway.
 */
export interface Hunk {
  readonly beforeStart: number;
  readonly beforeCount: number;
  readonly afterStart: number;
  readonly afterCount: number;
  readonly lines: readonly { readonly kind: ' ' | '-' | '+'; readonly text: string }[];
}

type Op = { kind: ' ' | '-' | '+'; text: string };

/**
 * Longest common subsequence over lines.
 *
 * Quadratic, which is fine for files of this size: the largest skill is under 400 lines,
 * so the table is under 160k cells. Guarded anyway, because a caller could point this at
 * something else and a silent 30 second hang is worse than a coarse diff.
 */
const MAX_CELLS = 4_000_000;

export function diffLines(before: string, after: string): Op[] {
  const a = before.split('\n');
  const b = after.split('\n');

  if (a.length * b.length > MAX_CELLS) {
    return [
      ...a.map((text) => ({ kind: '-' as const, text })),
      ...b.map((text) => ({ kind: '+' as const, text })),
    ];
  }

  // trim the common head and tail first, which is most of the work on a small edit
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) tail += 1;

  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);

  const table: number[][] = Array.from({ length: midA.length + 1 }, () =>
    new Array<number>(midB.length + 1).fill(0));
  for (let i = midA.length - 1; i >= 0; i -= 1) {
    for (let j = midB.length - 1; j >= 0; j -= 1) {
      table[i]![j] = midA[i] === midB[j]
        ? table[i + 1]![j + 1]! + 1
        : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }

  const ops: Op[] = a.slice(0, head).map((text) => ({ kind: ' ' as const, text }));
  let i = 0;
  let j = 0;
  while (i < midA.length && j < midB.length) {
    if (midA[i] === midB[j]) { ops.push({ kind: ' ', text: midA[i]! }); i += 1; j += 1; }
    else if (table[i + 1]![j]! >= table[i]![j + 1]!) { ops.push({ kind: '-', text: midA[i]! }); i += 1; }
    else { ops.push({ kind: '+', text: midB[j]! }); j += 1; }
  }
  while (i < midA.length) { ops.push({ kind: '-', text: midA[i]! }); i += 1; }
  while (j < midB.length) { ops.push({ kind: '+', text: midB[j]! }); j += 1; }
  for (const text of a.slice(a.length - tail)) ops.push({ kind: ' ', text });

  return ops;
}

/** Group a diff into hunks with `context` unchanged lines around each change. */
export function hunks(ops: readonly Op[], context = 3): Hunk[] {
  const changed = ops.map((o) => o.kind !== ' ');
  if (!changed.some(Boolean)) return [];

  const keep = new Array<boolean>(ops.length).fill(false);
  for (let i = 0; i < ops.length; i += 1) {
    if (!changed[i]) continue;
    for (let j = Math.max(0, i - context); j <= Math.min(ops.length - 1, i + context); j += 1) {
      keep[j] = true;
    }
  }

  const out: Hunk[] = [];
  let beforeLine = 1;
  let afterLine = 1;
  let current: { lines: Op[]; beforeStart: number; afterStart: number } | undefined;

  for (let i = 0; i < ops.length; i += 1) {
    const op = ops[i]!;
    if (keep[i]) {
      current ??= { lines: [], beforeStart: beforeLine, afterStart: afterLine };
      current.lines.push(op);
    } else if (current) {
      out.push(close(current));
      current = undefined;
    }
    if (op.kind !== '+') beforeLine += 1;
    if (op.kind !== '-') afterLine += 1;
  }
  if (current) out.push(close(current));
  return out;
}

function close(c: { lines: Op[]; beforeStart: number; afterStart: number }): Hunk {
  return {
    beforeStart: c.beforeStart,
    beforeCount: c.lines.filter((l) => l.kind !== '+').length,
    afterStart: c.afterStart,
    afterCount: c.lines.filter((l) => l.kind !== '-').length,
    lines: c.lines,
  };
}

/** How many lines were added and removed, for a one line summary. */
export function stat(ops: readonly Op[]): { added: number; removed: number } {
  return {
    added: ops.filter((o) => o.kind === '+').length,
    removed: ops.filter((o) => o.kind === '-').length,
  };
}
