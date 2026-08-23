import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalise } from '../src/names.ts';
import { drift, hashContent, formatLockfile, parseLockfile, emptyLockfile } from '../src/lockfile.ts';
import { targetById, TARGETS } from '../src/targets.ts';
import type { Skill, SkillMeta } from '../src/types.ts';

const meta = (name: string): SkillMeta => {
  const [family, skill] = name.split('/') as [string, string];
  return { name, family, skill, axis: 'topic', version: '1.0.0', requires: [], agentSections: ['rules'], retired: [], detect: {}, authors: [] };
};
const INDEX = [meta('android/core'), meta('android/kotlin'), meta('android/db'), meta('web/core')];

test('a bare name resolves inside a family already named', () => {
  assert.deepEqual(normalise(INDEX, ['android/core', 'kotlin']), ['android/core', 'android/kotlin']);
});

test('a bare name unique across the index resolves without a family', () => {
  assert.deepEqual(normalise(INDEX, ['db']), ['android/db']);
});

test('an ambiguous bare name is an error, not a guess', () => {
  assert.throws(() => normalise(INDEX, ['core']), /ambiguous/);
});

test('naming the family disambiguates', () => {
  assert.deepEqual(normalise(INDEX, ['web/core', 'core']), ['web/core', 'web/core']);
});

test('an unknown name is rejected', () => {
  assert.throws(() => normalise(INDEX, ['android/nope']), /unknown skill/);
});

test('a lockfile round-trips and sorts its keys', () => {
  const lock = { ...emptyLockfile('claude'), skills: {
    'android/kotlin': { version: '1.0.0', hash: hashContent('b'), reason: 'requested' as const },
    'android/core': { version: '1.0.0', hash: hashContent('a'), reason: 'required' as const },
  } };
  const text = formatLockfile(lock);
  assert.ok(text.indexOf('android/core') < text.indexOf('android/kotlin'), 'keys must be sorted');
  assert.deepEqual(parseLockfile(text).skills['android/core']?.reason, 'required');
});

test('drift tells a local edit from an upstream change', () => {
  const entry = { version: '1.0.0', hash: hashContent('installed'), reason: 'requested' as const };
  const same = { version: '1.0.0' } as Skill;
  const newer = { version: '1.1.0' } as Skill;
  assert.equal(drift(entry, 'installed', same), 'unchanged');
  assert.equal(drift(entry, 'edited by hand', same), 'local-edit');
  assert.equal(drift(entry, 'installed', newer), 'upstream-change');
  assert.equal(drift(entry, 'edited by hand', newer), 'both');
  assert.equal(drift(entry, undefined, same), 'missing');
});

test('every target writes somewhere distinct', () => {
  const dirs = new Set(TARGETS.map((t) => t.dir));
  assert.equal(dirs.size, TARGETS.length);
  assert.equal(targetById('claude')?.fileFor('android/core'), 'android-core/SKILL.md');
  assert.ok(targetById('cursor')?.header?.('android/core', '1.0.0').startsWith('---'));
});
