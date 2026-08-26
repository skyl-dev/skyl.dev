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
  // the frontmatter is what makes the file a skill rather than a file: without `name` and
  // `description` Claude Code passes the directory over and the install looks like it worked
  assert.match(text, /^---\nname: android-compose\ndescription: "[^\n]+"\n---\n\n## Rules/);
  assert.ok(!text.includes('## Provenance'), 'human-only sections must not be installed');

  const lock = JSON.parse(await readFile(join(root, 'skyl.lock'), 'utf8'));
  assert.equal(lock.skills['android/compose'].reason, 'requested');
  assert.equal(lock.skills['android/core'].reason, 'required');
});

test('every target writes the frontmatter its tool reads', async () => {
  const wanted: Record<string, RegExp> = {
    claude: /^---\nname: android-core\ndescription: "/,
    cursor: /^---\ndescription: "[^\n]+"\nalwaysApply: false\n---/,
    windsurf: /^---\ntrigger: model_decision\ndescription: "/,
    continue: /^---\nname: android\/core\ndescription: "[^\n]+"\nalwaysApply: false\n---/,
    agents: /^---\nname: android-core\ndescription: "/,
  };
  const at: Record<string, string> = {
    claude: '.claude/skills/android-core/SKILL.md',
    cursor: '.cursor/rules/android-core.mdc',
    windsurf: '.windsurf/rules/android-core.md',
    continue: '.continue/rules/android-core.md',
    agents: '.agents/skills/android-core/SKILL.md',
  };
  for (const [target, pattern] of Object.entries(wanted)) {
    const root = await project();
    const code = await quiet(() =>
      run(['add', 'android/core', '-C', root, '--dir', REGISTRY, '--target', target, '--yes']));
    assert.equal(code, 0, target);
    assert.match(await readFile(join(root, at[target]!), 'utf8'), pattern, target);
  }
});

test('a rule that points at a reference is installed with the file it points at', async () => {
  const root = await project();
  await quiet(() => run(['add', 'android/core', '-C', root, '--dir', REGISTRY, '--yes']));

  const skill = await readFile(join(root, '.claude/skills/android-core/SKILL.md'), 'utf8');
  const pointed = [...skill.matchAll(/references\/([a-z0-9-]+\.md)/g)].map((m) => m[1]!);
  assert.ok(pointed.length > 0, 'android/core points at references, or this test proves nothing');

  const there = await readdir(join(root, '.claude/skills/android-core/references'));
  for (const file of pointed) {
    assert.ok(there.includes(file), `${file} is pointed at and was not installed`);
  }
});

test('a flat target drops references rather than writing a pointer to nothing', async () => {
  const root = await project();
  await quiet(() =>
    run(['add', 'android/core', '-C', root, '--dir', REGISTRY, '--target', 'cursor', '--yes']));
  const written = await readdir(join(root, '.cursor/rules'));
  assert.deepEqual(written, ['android-core.mdc'], 'a rules directory takes rules, not references');
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

  // core is compiled into dist/skyl.js. Declaring it instead put a workspace package on the
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
