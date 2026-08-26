#!/usr/bin/env node
/**
 * Freeze the registry into one JSON file that ships inside the npm package.
 *
 * The CLI has three routes to skill content and this is the middle one: it always works,
 * needs no network, and is exactly as old as the release. Without it the first run of
 * `npx skyl` on a plane, or behind a proxy, does nothing at all.
 *
 *   node scripts/build-bundle.mjs [--skills <dir>] [--out <file>]
 *
 * Defaults to a sibling checkout of the registry, which is how both repositories are
 * laid out in development and how CI checks them out.
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};

const skillsDir = resolve(flag('skills', join(here, '..', '..', 'skyl', 'skills')));
const outFile = resolve(flag('out', join(here, '..', 'packages', 'cli', 'bundle.json')));

const skills = {};
const references = {};
for (const family of (await readdir(skillsDir, { withFileTypes: true })).filter((e) => e.isDirectory())) {
  for (const entry of (await readdir(join(skillsDir, family.name), { withFileTypes: true })).filter((e) => e.isDirectory())) {
    const dir = join(skillsDir, family.name, entry.name);
    const name = `${family.name}/${entry.name}`;
    try {
      skills[name] = await readFile(join(dir, 'SKILL.md'), 'utf8');
    } catch (cause) {
      if (cause.code !== 'ENOENT') throw cause;
      continue;
    }
    // the rules say `see references/x.md`, so the bundle has to carry them or an offline
    // install writes a pointer to a file that is not there
    const files = (await readdir(join(dir, 'references')).catch(() => []))
      .filter((f) => f.endsWith('.md'))
      .sort();
    if (files.length === 0) continue;
    references[name] = {};
    for (const file of files) {
      references[name][file] = await readFile(join(dir, 'references', file), 'utf8');
    }
  }
}

const names = Object.keys(skills).sort();
if (names.length === 0) {
  console.error(`no skills found in ${skillsDir}`);
  process.exit(1);
}

// Keys sorted and no timestamp, so the file changes only when a skill does. A bundle
// that differs on every build makes the diff in a release PR unreadable.
const bundle = {
  version: 1,
  skills: Object.fromEntries(names.map((n) => [n, skills[n]])),
  references: Object.fromEntries(Object.keys(references).sort().map((n) => [n, references[n]])),
};

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, `${JSON.stringify(bundle, null, 0)}\n`, 'utf8');

const bytes = (await readFile(outFile)).length;
const refCount = Object.values(references).reduce((n, r) => n + Object.keys(r).length, 0);
console.log(
  `${names.length} skills, ${refCount} reference files, ${(bytes / 1024).toFixed(0)} KB -> ${outFile}`,
);
