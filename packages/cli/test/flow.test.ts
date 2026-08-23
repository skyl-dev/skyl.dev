import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/cli.ts';

/**
 * The install lifecycle end to end, against a fixture registry rather than the published
 * one: these tests are about what happens when a version moves or a file is edited, and
 * that has to be arranged rather than waited for.
 */

const skill = (name: string, version: string, rule: string, requires = ''): string => `---
name: android/${name}
axis: framework
family: android
version: ${version}
${requires}agent_sections: [rules]
detect:
  gradle_dependency: ["com.example:${name}"]
---

## Rules

- **${name.toUpperCase()}-1** \`must\`: ${rule}
  *Why:* it breaks otherwise.
  *Not when:* never.

## Why

Because.
`;

async function registry(composeVersion = '1.0.0', rule = 'Do the thing.'): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'skyl-reg-'));
  await mkdir(join(root, 'android', 'core'), { recursive: true });
  await mkdir(join(root, 'android', 'compose'), { recursive: true });
  await writeFile(join(root, 'android', 'core', 'SKILL.md'), skill('core', '1.0.0', 'Keep the core rule.'));
  await writeFile(join(root, 'android', 'compose', 'SKILL.md'),
    skill('compose', composeVersion, rule, 'requires: [android/core]\n'));
  return root;
}

const quiet = async (fn: () => Promise<number>): Promise<number> => {
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = (() => true) as typeof process.stdout.write;
  try { return await fn(); } finally { process.stdout.write = write; }
};

const lockOf = async (root: string): Promise<{ skills: Record<string, { version: string; reason: string }> }> =>
  JSON.parse(await readFile(join(root, 'skyl.lock'), 'utf8')) as never;

const installedFile = (root: string, name: string): string =>
  join(root, '.claude', 'skills', `android-${name}`, 'SKILL.md');

async function installed(): Promise<{ root: string; reg: string }> {
  const root = await mkdtemp(join(tmpdir(), 'skyl-proj-'));
  const reg = await registry();
  assert.equal(await quiet(() => run(['add', 'compose', '-C', root, '--dir', reg, '-y'])), 0);
  return { root, reg };
}

test('update applies an upstream change and records the new version', async () => {
  const { root } = await installed();
  const next = await registry('1.1.0', 'Do the thing, differently.');

  assert.equal(await quiet(() => run(['update', '-C', root, '--dir', next, '-y'])), 0);
  assert.match(await readFile(installedFile(root, 'compose'), 'utf8'), /differently/);
  assert.equal((await lockOf(root)).skills['android/compose']?.version, '1.1.0');
});

test('a local edit is left alone when upstream has not moved', async () => {
  const { root, reg } = await installed();
  const file = installedFile(root, 'compose');
  await writeFile(file, `${await readFile(file, 'utf8')}\n- **MINE-1** \`must\`: my own.\n`);

  assert.equal(await quiet(() => run(['update', '-C', root, '--dir', reg, '-y'])), 0);
  assert.match(await readFile(file, 'utf8'), /MINE-1/);
});

test('a local edit plus an upstream change is a conflict, and nothing is written', async () => {
  const { root } = await installed();
  const file = installedFile(root, 'compose');
  await writeFile(file, `${await readFile(file, 'utf8')}\n- **MINE-1** \`must\`: my own.\n`);
  const next = await registry('1.1.0', 'Do the thing, differently.');

  assert.equal(await quiet(() => run(['update', '-C', root, '--dir', next, '-y'])), 0);
  const after = await readFile(file, 'utf8');
  assert.match(after, /MINE-1/);
  assert.doesNotMatch(after, /differently/);

  // --force is the explicit way to lose them
  assert.equal(await quiet(() => run(['update', '-C', root, '--dir', next, '-y', '--force'])), 0);
  assert.match(await readFile(file, 'utf8'), /differently/);
});

test('a version bump that changes nothing installed is recorded, not rewritten', async () => {
  const { root } = await installed();
  const before = await stat(installedFile(root, 'compose'));
  // same rules, new version: only the human-facing section moved
  const next = await registry('1.0.1');

  assert.equal(await quiet(() => run(['update', '-C', root, '--dir', next, '-y'])), 0);
  assert.equal((await lockOf(root)).skills['android/compose']?.version, '1.0.1');
  assert.equal((await stat(installedFile(root, 'compose'))).mtimeMs, before.mtimeMs);
});

test('a deleted file is put back', async () => {
  const { root, reg } = await installed();
  await rm(installedFile(root, 'core'));
  assert.equal(await quiet(() => run(['update', '-C', root, '--dir', reg, '-y'])), 0);
  assert.match(await readFile(installedFile(root, 'core'), 'utf8'), /CORE-1/);
});

test('removing something another skill requires is refused', async () => {
  const { root, reg } = await installed();
  assert.equal(await quiet(() => run(['remove', 'core', '-C', root, '--dir', reg, '-y'])), 1);
  assert.ok(await readFile(installedFile(root, 'core'), 'utf8'));

  assert.equal(await quiet(() => run(['remove', 'compose', '-C', root, '--dir', reg, '-y'])), 0);
  assert.equal(await quiet(() => run(['remove', 'core', '-C', root, '--dir', reg, '-y'])), 0);
  assert.deepEqual((await lockOf(root)).skills, {});
});

test('diff exits cleanly when nothing has moved', async () => {
  const { root, reg } = await installed();
  assert.equal(await quiet(() => run(['diff', '-C', root, '--dir', reg])), 0);
});

test('update on a project with nothing installed says so rather than failing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skyl-empty-'));
  assert.equal(await quiet(() => run(['update', '-C', root])), 0);
});
