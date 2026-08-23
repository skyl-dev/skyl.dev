import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSkill, sections, rules } from '../src/parse.ts';
import { SkillFormatError } from '../src/errors.ts';

const MINIMAL = `---
name: android/demo
axis: topic
family: android
requires: [android/core]
version: 1.0.0
authors: [someone]
agent_sections: [rules]
retired: [OLD-1]
detect:
  gradle_dependency: ["com.example:thing"]
---

## Rules

- **DEMO-1** \`must\`: do the thing.
  *Why:* because.
  *Not when:* never.

## Why

Human only.
`;

test('parses frontmatter, rules and the installable section', () => {
  const s = parseSkill(MINIMAL);
  assert.equal(s.name, 'android/demo');
  assert.equal(s.family, 'android');
  assert.equal(s.skill, 'demo');
  assert.equal(s.axis, 'topic');
  assert.deepEqual(s.requires, ['android/core']);
  assert.deepEqual(s.retired, ['OLD-1']);
  assert.deepEqual(s.detect['gradle_dependency'], ['com.example:thing']);
  assert.equal(s.rules.length, 1);
  assert.equal(s.rules[0]?.id, 'DEMO-1');
  assert.equal(s.rules[0]?.priority, 'must');
});

test('installable carries only the agent sections', () => {
  const s = parseSkill(MINIMAL);
  assert.ok(s.installable.includes('DEMO-1'));
  assert.ok(!s.installable.includes('Human only'), 'the Why section must not be installed');
  assert.ok(s.installableWords > 0);
});

test('rejects a version that is not semver', () => {
  assert.throws(() => parseSkill(MINIMAL.replace('version: 1.0.0', 'version: 1.0')), SkillFormatError);
});

test('rejects an unknown axis', () => {
  assert.throws(() => parseSkill(MINIMAL.replace('axis: topic', 'axis: nonsense')), SkillFormatError);
});

test('rejects agent_sections naming a section that does not exist', () => {
  assert.throws(
    () => parseSkill(MINIMAL.replace('agent_sections: [rules]', 'agent_sections: [patterns]')),
    SkillFormatError,
  );
});

test('a section split keeps headings and drops the preamble', () => {
  const got = sections('intro\n\n## One\n\na\n\n## Two\n\nb\n');
  assert.deepEqual([...got.keys()], ['One', 'Two']);
  assert.equal(got.get('One'), 'a');
});

test('rules ignores a mention that is not a rule line', () => {
  assert.equal(rules('see **DEMO-1** `must` elsewhere').length, 0);
});
