import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audit, scanSecrets } from '../src/audit.ts';
import { parseSkill } from '../src/parse.ts';
import type { Skill } from '../src/types.ts';

const make = (name: string, text: string): Skill => parseSkill(`---
name: android/${name}
axis: framework
family: android
version: 1.0.0
agent_sections: [rules]
---

## Rules

- **X-1** \`must\`: ${text}
  *Why:* x.
  *Not when:* y.
`);

const registry = [
  make('compose', 'Hoist state out of the composable, remember derivedStateOf recomposition stable immutable lambda'),
  make('db', 'Every migration is tested, room dao transaction schema index query'),
];

test('a section that repeats a skill is matched to it, with the words that matched', () => {
  const text = `# Notes

## UI

Use remember and derivedStateOf. Hoist state. Keep lambdas stable and state immutable
to avoid recomposition in every composable.
`;
  const report = audit(text, registry);
  const ui = report.sections.find((s) => s.heading === 'UI');
  assert.equal(ui?.overlaps[0]?.skill, 'android/compose');
  assert.ok(ui!.overlaps[0]!.terms.includes('recomposition'));
});

test('a section about the product matches nothing in the registry', () => {
  const report = audit('## Glossary\n\nA bean is the internal currency. A host earns beans from gifts.\n', registry);
  assert.deepEqual(report.sections[0]?.overlaps, []);
});

test('a section with no instruction in it is flagged', () => {
  const words = 'the service reads from the queue and writes to the store '.repeat(6);
  const report = audit(`## Architecture\n\n${words}\n`, registry);
  assert.equal(report.sections[0]?.noInstruction, true);
});

test('credentials are found by shape, and reported by line', () => {
  const found = scanSecrets('ok\nAPI_KEY = "sk_live_2b8f2a91c77d4e1a9"\n');
  assert.equal(found.length, 1);
  assert.equal(found[0]?.line, 2);
});

test('a file with no headings is still audited, as one section', () => {
  const report = audit('remember derivedStateOf recomposition stable immutable composable hoist\n', registry);
  assert.equal(report.sections.length, 1);
  assert.equal(report.sections[0]?.heading, '(whole file)');
});
