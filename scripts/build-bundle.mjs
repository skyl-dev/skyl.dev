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
for (const family of (await readdir(skillsDir, { withFileTypes: true })).filter((e) => e.isDirectory())) {
  for (const entry of (await readdir(join(skillsDir, family.name), { withFileTypes: true })).filter((e) => e.isDirectory())) {
    const file = join(skillsDir, family.name, entry.name, 'SKILL.md');
    try {
      skills[`${family.name}/${entry.name}`] = await readFile(file, 'utf8');
    } catch (cause) {
      if (cause.code !== 'ENOENT') throw cause;
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
const bundle = { version: 1, skills: Object.fromEntries(names.map((n) => [n, skills[n]])) };

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, `${JSON.stringify(bundle, null, 0)}\n`, 'utf8');

const bytes = (await readFile(outFile)).length;
console.log(`${names.length} skills, ${(bytes / 1024).toFixed(0)} KB -> ${outFile}`);
