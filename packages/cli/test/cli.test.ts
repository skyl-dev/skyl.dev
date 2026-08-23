import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanProject } from '../src/scan.ts';
import { run } from '../src/cli.ts';

const REGISTRY = new URL('../../../../skyl/skills', import.meta.url).pathname;

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'skyl-'));
  await mkdir(join(root, 'app/src/main/java/com/x'), { recursive: true });
  await writeFile(join(root, 'app/build.gradle.kts'), `
plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
dependencies {
  implementation("androidx.compose.material3:material3")
  implementation("androidx.room:room-runtime:2.6.1")
  testImplementation("androidx.compose.ui:ui-test-junit4:1.7.0")
}
`);
  await writeFile(join(root, 'app/src/main/AndroidManifest.xml'),
    '<manifest><uses-permission android:name="android.permission.INTERNET" /></manifest>');
  await writeFile(join(root, 'app/src/main/java/com/x/Main.kt'), 'class Main');
  return root;
}

const quiet = async (fn: () => Promise<number>): Promise<number> => {
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = (() => true) as typeof process.stdout.write;
  try { return await fn(); } finally { process.stdout.write = write; }
};

test('the scanner reads dependencies, plugins and manifest facts without building', async () => {
  const root = await project();
  const s = await scanProject(root);
  assert.ok(s['gradle_dependency']?.includes('androidx.room:room-runtime'));
  assert.ok(s['gradle_plugin']?.includes('org.jetbrains.kotlin.android'));
  assert.ok(s['manifest_element']?.includes('uses-permission'));
  assert.ok(s['file']?.some((f) => f.endsWith('Main.kt')));
});

test('a test-only dependency does not drag in the library it tests', async () => {
  const root = await project();
  const code = await quiet(() => run(['scan', '-C', root, '--dir', REGISTRY, '--json']));
  assert.equal(code, 0);
});

test('add installs, writes a lockfile, and installs only the agent sections', async () => {
  const root = await project();
  const code = await quiet(() => run(['add', 'compose', '-C', root, '--dir', REGISTRY, '--yes']));
  assert.equal(code, 0);

  const installed = await readdir(join(root, '.claude/skills'));
  assert.ok(installed.includes('android-compose'));
  assert.ok(installed.includes('android-core'), 'requires must be pulled in');

  const text = await readFile(join(root, '.claude/skills/android-compose/SKILL.md'), 'utf8');
  assert.ok(text.startsWith('## Rules'));
  assert.ok(!text.includes('## Provenance'), 'human-only sections must not be installed');

  const lock = JSON.parse(await readFile(join(root, 'skyl.lock'), 'utf8'));
  assert.equal(lock.skills['android/compose'].reason, 'requested');
  assert.equal(lock.skills['android/core'].reason, 'required');
});

test('add refuses an unknown skill rather than writing something', async () => {
  const root = await project();
  const code = await quiet(() => run(['add', 'android/nonexistent', '-C', root, '--dir', REGISTRY, '--yes']));
  assert.equal(code, 1);
  await assert.rejects(() => readFile(join(root, 'skyl.lock'), 'utf8'));
});

test('add writes nothing when not confirmed', async () => {
  const root = await project();
  const code = await quiet(() => run(['add', 'compose', '-C', root, '--dir', REGISTRY]));
  assert.equal(code, 1, 'a non-interactive run without --yes must decline');
  await assert.rejects(() => readFile(join(root, 'skyl.lock'), 'utf8'));
});

test('list reports nothing installed before an add', async () => {
  const root = await project();
  assert.equal(await quiet(() => run(['list', '-C', root, '--dir', REGISTRY])), 0);
});

test('an unknown command fails rather than doing something', async () => {
  assert.equal(await quiet(() => run(['wat'])), 1);
});

test('the version the CLI prints is the version that is published', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  const source = await readFile(new URL('../src/cli.ts', import.meta.url), 'utf8');
  assert.match(source, new RegExp(`const VERSION = '${manifest.version}'`));
});

test('the published package declares no runtime dependencies', async () => {
  const cli = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as
    { version: string; dependencies?: Record<string, string> };
  const core = JSON.parse(await readFile(new URL('../../core/package.json', import.meta.url), 'utf8')) as
    { version: string };

  // core is compiled into dist/bin.js. Declaring it instead put a workspace package on the
  // npm page as a dependency that resolves to nothing, and broke `npm audit signatures`
  // for anyone who ran it.
  assert.equal(cli.dependencies, undefined);
  assert.equal(cli.version, core.version);
});

test('--version prints a version, not the help text', async () => {
  let printed = '';
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((s: string) => { printed += s; return true; }) as typeof process.stdout.write;
  try {
    assert.equal(await run(['--version']), 0);
  } finally { process.stdout.write = write; }
  assert.match(printed, /^skyl \d+\.\d+\.\d+/);
});

test('no command exits non-zero so a script notices', async () => {
  assert.equal(await quiet(() => run([])), 1);
  assert.equal(await quiet(() => run(['--help'])), 0);
});

test('--target writes where that tool looks', async () => {
  const root = await project();
  await quiet(() => run(['add', 'compose', '-C', root, '--dir', REGISTRY, '--target', 'cursor', '--yes']));
  const text = await readFile(join(root, '.cursor/rules/android-compose.mdc'), 'utf8');
  assert.ok(text.startsWith('---'), 'cursor needs its own frontmatter');
  assert.ok(text.includes('## Rules'));
});
