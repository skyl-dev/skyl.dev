import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintRegistry, lintSkill } from '../src/lint.ts';
import { parseSkill } from '../src/parse.ts';

const skill = (extra: string, rules: string): string => `---
name: android/demo
axis: framework
family: android
version: 1.0.0
agent_sections: [rules]
detect:
  gradle_dependency: ["com.example:demo"]
${extra}---

## Rules

${rules}

## Why

Because.

## Pitfalls

None.

## Provenance

Eval 1.
`;

const ok = `- **DEMO-1** \`must\`: Do the one specific thing.
  *Why:* it breaks silently otherwise.
  *Not when:* the thing is already done.`;

test('a skill that follows the spec produces nothing', () => {
  assert.deepEqual(lintSkill(skill('', ok)), []);
});

test('a reused retired id is an error, with the line it is on', () => {
  const found = lintSkill(skill('retired: [DEMO-1]\n', ok));
  const reuse = found.find((f) => f.message.includes('in use again'));
  assert.ok(reuse);
  assert.equal(reuse.level, 'error');
  // counted against the whole file, frontmatter included, or it points at the wrong line
  assert.equal(reuse.line, 14);
});

test('a retired entry that is not a bare id is an error, because it hides reuse', () => {
  const found = lintSkill(skill('retired: [DEMO-3-ask-in-context]\n', ok));
  assert.ok(found.some((f) => f.level === 'error' && f.message.includes('is not a rule id')));
});

test('a rule with no boundary warns, and does not fail', () => {
  const found = lintSkill(skill('', '- **DEMO-1** `must`: Do the thing.\n  *Why:* it breaks.'));
  assert.ok(found.some((f) => f.level === 'warn' && f.message.includes('*Not when:*')));
  assert.ok(!found.some((f) => f.level === 'error'));
});

test('vague wording is flagged in the instruction and allowed in the explanation', () => {
  const vague = lintSkill(skill('', '- **DEMO-1** `must`: Handle errors appropriately.\n  *Why:* x.\n  *Not when:* y.'));
  assert.ok(vague.some((f) => f.message.includes('not decidable')));

  const prose = lintSkill(skill('', '- **DEMO-1** `must`: Cancel the job in onCleared.\n  *Why:* a timeout that is not reasonable strands the request.\n  *Not when:* y.'));
  assert.ok(!prose.some((f) => f.message.includes('not decidable')));
});

test('a name that does not match its path is an error', () => {
  const found = lintSkill(skill('', ok), '/x/skills/android/other/SKILL.md');
  assert.ok(found.some((f) => f.level === 'error' && f.message.includes('does not match its path')));
});

test('a cross-reference to a rule that does not exist fails', () => {
  const a = parseSkill(skill('', ok));
  const b = parseSkill(skill('', '- **DEMO-1** `must`: See `android/demo NOPE-9`.\n  *Why:* x.\n  *Not when:* y.').replace('android/demo', 'android/other'));
  const found = lintRegistry([a, b]);
  assert.ok(found.get('android/other')?.some((f) => f.message.includes('NOPE-9')));
});

test('a cross-reference to a retired id resolves, because published evidence points at it', () => {
  const a = parseSkill(skill('retired: [DEMO-7]\n', ok));
  const b = parseSkill(skill('', '- **DEMO-1** `must`: See `android/demo DEMO-7`.\n  *Why:* x.\n  *Not when:* y.').replace('android/demo\n', 'android/other\n'));
  assert.equal(lintRegistry([a, b]).get('android/other'), undefined);
});
