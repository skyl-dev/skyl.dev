import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matches, strategyFor } from '../src/match.ts';

test('a dependency matches on its coordinate, version ignored', () => {
  assert.ok(matches('gradle_dependency', 'androidx.room:room-runtime', 'androidx.room:room-runtime:2.6.1'));
});

test('a test artifact does not match the library it tests', () => {
  assert.ok(
    !matches('gradle_dependency', 'androidx.compose.ui:ui', 'androidx.compose.ui:ui-test-junit4:1.7.0'),
    'ui-test-junit4 must not satisfy a want for ui',
  );
});

test('a sibling artifact does not match by prefix', () => {
  assert.ok(!matches('gradle_dependency', 'io.ktor:ktor-client-core', 'io.ktor:ktor-client-core-jvm:3.0.0'));
  assert.ok(!matches('gradle_dependency', 'com.squareup.okhttp3:okhttp', 'com.squareup.okhttp3:okhttp-tls:4.12.0'));
});

test('file patterns are globs and span directories', () => {
  assert.ok(matches('file', '**/*.kt', 'app/src/main/java/com/x/Main.kt'));
  assert.ok(matches('file', '**/*.kt', 'Main.kt'), '**/ must also match nothing');
  assert.ok(matches('file', '**/src/main/AndroidManifest.xml', 'app/src/main/AndroidManifest.xml'));
  assert.ok(matches('file', '**/src/main/res/layout/*.xml', 'app/src/main/res/layout/activity_main.xml'));
});

test('a glob does not match across a path segment', () => {
  assert.ok(!matches('file', '**/src/main/res/layout/*.xml', 'app/src/main/res/layout/sub/a.xml'));
  assert.ok(!matches('file', '**/*.kt', 'app/src/main/java/Main.java'));
});

test('unknown keys fall back to a contains check', () => {
  assert.equal(strategyFor('manifest_element'), 'exact');
  assert.ok(matches('manifest_element', 'uses-permission', '<uses-permission android:name="INTERNET" />'));
});
