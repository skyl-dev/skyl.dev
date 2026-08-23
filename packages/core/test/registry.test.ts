import { test } from 'node:test';
import assert from 'node:assert/strict';
import { directorySource } from '../src/source.ts';
import { detect, unmatched } from '../src/detect.ts';
import { resolve, implied } from '../src/resolve.ts';
import type { Skill } from '../src/types.ts';

/**
 * Runs against the published registry rather than a fixture. The point of building the
 * parser first was to find out whether the real skills parse and whether their detect
 * blocks resolve a real project, so the test uses them.
 */
const REGISTRY = new URL('../../../../skyl/skills', import.meta.url).pathname;

let skills: Skill[] = [];
try {
  skills = await directorySource(REGISTRY).load();
} catch {
  // the sibling checkout is not always present
}
const has = skills.length > 0;

test('every published skill parses', { skip: !has && 'no registry checkout' }, () => {
  assert.equal(skills.length, 13);
  for (const s of skills) {
    assert.ok(s.rules.length > 0, `${s.name} has no rules`);
    assert.ok(s.installable.startsWith('## Rules'), `${s.name} installs something other than Rules`);
  }
});

test('nothing human-only is installable', { skip: !has && 'no registry checkout' }, () => {
  for (const s of skills) {
    assert.ok(!s.installable.includes('## Provenance'), `${s.name} would install its Provenance`);
    assert.ok(!s.installable.includes('## Why'), `${s.name} would install its Why`);
  }
});

test('a Compose project resolves to the right set', { skip: !has && 'no registry checkout' }, () => {
  const matched = detect(skills, {
    file: ['app/src/main/java/com/x/Main.kt'],
    gradle_plugin: ['org.jetbrains.kotlin.android'],
    gradle_dependency: [
      'androidx.compose.material3:material3:1.3.1',
      'androidx.room:room-runtime:2.6.1',
      'com.squareup.retrofit2:retrofit:2.11.0',
    ],
  });
  const names = matched.map((m) => m.skill);
  assert.ok(names.includes('android/core'), 'core must come in with the family');
  assert.ok(names.includes('android/kotlin'));
  assert.ok(names.includes('android/compose'));
  assert.ok(names.includes('android/db'));
  assert.ok(names.includes('android/networking'));
  assert.ok(!names.includes('android/java'), 'a Kotlin project must not pull the Java skill');
});

test('a token-only app does not pull the database skill', { skip: !has && 'no registry checkout' }, () => {
  const matched = detect(skills, {
    file: ['app/src/main/java/com/x/Main.kt'],
    gradle_plugin: ['org.jetbrains.kotlin.android'],
    gradle_dependency: ['androidx.security:security-crypto:1.1.0'],
  });
  const names = matched.map((m) => m.skill);
  assert.ok(names.includes('android/security'));
  assert.ok(!names.includes('android/db'), 'db is detected by a database, and there is none');
});

test('every match says what it matched on', { skip: !has && 'no registry checkout' }, () => {
  const matched = detect(skills, { gradle_plugin: ['org.jetbrains.kotlin.android'] });
  for (const m of matched) assert.ok(m.on.length > 0, `${m.skill} matched on nothing`);
});

test('resolve pulls in requires and orders dependencies first', { skip: !has && 'no registry checkout' }, () => {
  const order = resolve(skills, ['android/compose']).map((s) => s.name);
  assert.ok(order.includes('android/core'), 'compose requires core');
  assert.ok(order.indexOf('android/core') < order.indexOf('android/compose'));
  assert.deepEqual(implied(resolve(skills, ['android/compose']), ['android/compose']).map((s) => s.name), ['android/core']);
});

test('unmatched lists what was considered and rejected', { skip: !has && 'no registry checkout' }, () => {
  const matched = detect(skills, { gradle_plugin: ['org.jetbrains.kotlin.android'] });
  const rest = unmatched(skills, matched);
  assert.ok(rest.some((s) => s.name === 'android/compose'), 'compose was not detected and should be listed');
});
