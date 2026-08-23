import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffLines, hunks, stat } from '../src/diff.ts';

test('an unchanged file produces no hunks', () => {
  const ops = diffLines('a\nb\nc\n', 'a\nb\nc\n');
  assert.deepEqual(stat(ops), { added: 0, removed: 0 });
  assert.equal(hunks(ops).length, 0);
});

test('one changed line in a long file is one small hunk', () => {
  const before = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
  const after = before.replace('line 20', 'line twenty');
  const ops = diffLines(before, after);
  assert.deepEqual(stat(ops), { added: 1, removed: 1 });

  const [hunk, ...rest] = hunks(ops, 3);
  assert.equal(rest.length, 0);
  assert.ok(hunk);
  // 3 lines of context each side, plus the pair that changed
  assert.equal(hunk.lines.length, 8);
  assert.equal(hunk.beforeStart, 18);
});

test('an insertion is reported as added lines, not as a rewrite', () => {
  const ops = diffLines('a\nb\n', 'a\nnew\nb\n');
  assert.deepEqual(stat(ops), { added: 1, removed: 0 });
  // 'a\nb\n' is three lines, the last of them empty
  assert.deepEqual(ops.map((o) => o.kind).join(''), ' +  ');
});

test('two edits far apart are two hunks, not one', () => {
  const before = Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n');
  const after = before.replace('line 5', 'x').replace('line 50', 'y');
  assert.equal(hunks(diffLines(before, after), 3).length, 2);
});

test('a file with nothing in common still diffs rather than hanging', () => {
  const ops = diffLines('a\nb\nc\n', 'x\ny\nz\n');
  assert.deepEqual(stat(ops), { added: 3, removed: 3 });
});
