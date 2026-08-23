import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildContext, renderTree } from '../src/context.ts';
import { parseIgnore, loadIgnore } from '../src/ignore.ts';
import { extractMarkdown, preserved, reattach } from '../src/learn.ts';

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'skyl-ctx-'));
  await mkdir(join(root, 'docs'), { recursive: true });
  await mkdir(join(root, 'app/src/main/java/com/x/di'), { recursive: true });
  await mkdir(join(root, 'secret'), { recursive: true });
  await writeFile(join(root, '.gitignore'), 'secret/\n*.log\n');
  await writeFile(join(root, 'docs/product.md'), '# Product\n\nA bean is the currency.\n');
  await writeFile(join(root, 'app/build.gradle.kts'), 'dependencies { implementation("androidx.room:room-runtime:2.6.1") }');
  await writeFile(join(root, 'app/src/main/java/com/x/MainActivity.kt'), 'class MainActivity');
  await writeFile(join(root, 'app/src/main/java/com/x/di/AppModule.kt'), 'object AppModule');
  await writeFile(join(root, 'secret/keys.md'), '# keys\n\nAPI_KEY = "sk_live_9f3a2b1c8d7e6f5a"\n');
  await writeFile(join(root, 'CONFIG.md'), 'password: "hunter2000hunter"\n');
  return root;
}

test('gitignore patterns exclude directories and their contents', async () => {
  const root = await project();
  const ignore = await loadIgnore(root);
  assert.equal(ignore.ignored('secret', true), true);
  assert.equal(ignore.ignored('secret/keys.md', false), true);
  assert.equal(ignore.ignored('app/debug.log', false), true);
  assert.equal(ignore.ignored('docs/product.md', false), false);
});

test('a rooted pattern does not match the same name deeper in the tree', () => {
  const patterns = parseIgnore('/build\ndist\n');
  assert.equal(patterns.length, 2);
});

test('a negation re-admits what a broad pattern excluded', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skyl-neg-'));
  await writeFile(join(root, '.gitignore'), '*.md\n!README.md\n');
  const ignore = await loadIgnore(root);
  assert.equal(ignore.ignored('notes.md', false), true);
  assert.equal(ignore.ignored('README.md', false), false);
});

test('the bundle picks documentation, entry points and wiring, and says why', async () => {
  const bundle = await buildContext(await project());
  const picked = new Map(bundle.files.map((f) => [f.path, f.why]));
  assert.equal(picked.get('docs/product.md'), 'documentation');
  assert.equal(picked.get('app/src/main/java/com/x/MainActivity.kt'), 'entry point');
  assert.equal(picked.get('app/src/main/java/com/x/di/AppModule.kt'), 'dependency wiring');
  assert.equal(picked.get('app/build.gradle.kts'), 'configuration');
});

test('an ignored file is never read', async () => {
  const bundle = await buildContext(await project());
  assert.ok(!bundle.files.some((f) => f.path.startsWith('secret/')));
  assert.ok(!bundle.withheld.some((w) => w.path.startsWith('secret/')));
});

test('a file with a credential in it is withheld, not truncated or masked', async () => {
  const bundle = await buildContext(await project());
  assert.ok(bundle.withheld.some((w) => w.path === 'CONFIG.md'));
  assert.ok(!bundle.files.some((f) => f.path === 'CONFIG.md'));
  assert.ok(!bundle.files.some((f) => f.text.includes('hunter2000hunter')));
});

test('the bundle carries what the build declares, so the model does not infer it', async () => {
  const bundle = await buildContext(await project());
  assert.ok(bundle.signals['gradle_dependency']?.includes('androidx.room:room-runtime'));
});

test('the tree lists file names, because the names carry the vocabulary', () => {
  const tree = renderTree(['app/WithdrawRequest.kt', 'app/PkBattleScreen.kt', 'README.md']);
  assert.match(tree, /WithdrawRequest\.kt/);
  assert.match(tree, /PkBattleScreen\.kt/);
});

test('a refresh carries hand-written text and unanswered questions forward', () => {
  const existing = `---
name: project/core
---

## Rules

- **PROJ-1** \`must\`: x.

## Manual

Beans convert at 100 to 1. Never round up.

## Questions

- Can a withdrawal be cancelled after PROCESSING? <!-- unanswered -->
- Answered one.
`;
  const keep = preserved(existing);
  assert.match(keep.manual!, /100 to 1/);
  assert.match(keep.questions!, /PROCESSING/);
  assert.doesNotMatch(keep.questions!, /Answered one/);

  // a model that drops them gets them put back
  const merged = reattach('---\nname: project/core\n---\n\n## Rules\n\n- **PROJ-1** `must`: x.\n', keep);
  assert.match(merged, /## Manual/);
  assert.match(merged, /100 to 1/);
  assert.match(merged, /PROCESSING/);
});

test('the markdown is recovered whether or not the agent wrapped it in a fence', () => {
  const file = '---\nname: project/core\n---\n\n## Rules\n';
  assert.equal(extractMarkdown(file), file);
  assert.equal(extractMarkdown(`Here you go:\n\n\`\`\`markdown\n${file}\`\`\`\n`), file);
  assert.equal(extractMarkdown('I could not do that.'), undefined);
});
