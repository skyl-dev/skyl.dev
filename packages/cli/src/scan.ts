import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { ProjectSignals } from '@skyl/core';

/**
 * Collect what a project declares, without building it.
 *
 * Reading build files as text rather than invoking Gradle is the whole point: it is
 * instant, works on a project that does not currently compile, and needs no toolchain.
 * The cost is that a dependency assembled at runtime from variables is missed, which is
 * why `scan` proposes and never installs on its own.
 */

const SKIP = new Set(['node_modules', 'build', '.git', '.gradle', '.idea', 'dist', 'out', '.kotlin']);
const MAX_DEPTH = 6;
const BUILD_FILES = ['build.gradle.kts', 'build.gradle', 'settings.gradle.kts', 'settings.gradle'];
const CATALOGS = ['libs.versions.toml'];

async function walk(root: string, depth = 0, acc: string[] = []): Promise<string[]> {
  if (depth > MAX_DEPTH) return acc;
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.claude') {
      if (SKIP.has(e.name)) continue;
    }
    if (SKIP.has(e.name)) continue;
    const full = join(root, e.name);
    if (e.isDirectory()) await walk(full, depth + 1, acc);
    else acc.push(full);
  }
  return acc;
}

/** `implementation("group:artifact:1.2.3")` and the `libs.` alias form. */
const DEP = /["']([a-zA-Z][\w.-]*(?:\.[\w-]+)+:[\w.-]+)(?::[^"']*)?["']/g;
const PLUGIN_ID = /id\s*\(?\s*["']([\w.-]+)["']/g;
const PLUGIN_ALIAS = /^\s*([\w-]+)\s*=\s*\{[^}]*id\s*=\s*["']([\w.-]+)["']/gm;
const TOML_DEP = /^\s*[\w-]+\s*=\s*\{[^}]*module\s*=\s*["']([\w.:-]+)["']/gm;
const TOML_GROUP = /^\s*[\w-]+\s*=\s*\{[^}]*group\s*=\s*["']([\w.-]+)["'][^}]*name\s*=\s*["']([\w.-]+)["']/gm;

export async function scanProject(root: string): Promise<ProjectSignals> {
  const files = await walk(root);
  const rel = files.map((f) => relative(root, f).split(sep).join('/'));

  const dependencies = new Set<string>();
  const plugins = new Set<string>();
  const manifestElements = new Set<string>();
  const manifestAttributes = new Set<string>();
  const properties = new Set<string>();

  for (const f of files) {
    const name = f.split(sep).pop()!;
    const isBuild = BUILD_FILES.includes(name);
    const isCatalog = CATALOGS.includes(name);
    const isManifest = name === 'AndroidManifest.xml';
    const isProps = name === 'gradle.properties';
    if (!isBuild && !isCatalog && !isManifest && !isProps) continue;

    let text: string;
    try { text = await readFile(f, 'utf8'); } catch { continue; }

    if (isBuild || isCatalog) {
      for (const m of text.matchAll(DEP)) dependencies.add(m[1]!);
      for (const m of text.matchAll(TOML_DEP)) dependencies.add(m[1]!);
      for (const m of text.matchAll(TOML_GROUP)) dependencies.add(`${m[1]}:${m[2]}`);
      for (const m of text.matchAll(PLUGIN_ID)) plugins.add(m[1]!);
      for (const m of text.matchAll(PLUGIN_ALIAS)) plugins.add(m[2]!);
    }
    if (isManifest) {
      for (const m of text.matchAll(/<([a-zA-Z-]+)[\s>]/g)) manifestElements.add(m[1]!);
      for (const m of text.matchAll(/\s(android:[\w]+)\s*=/g)) manifestAttributes.add(m[1]!);
    }
    if (isProps) {
      for (const line of text.split('\n')) {
        const eq = line.indexOf('=');
        if (eq > 0 && !line.trimStart().startsWith('#')) properties.add(line.slice(0, eq).trim());
      }
    }
  }

  return {
    file: rel,
    gradle_dependency: [...dependencies],
    gradle_plugin: [...plugins],
    manifest_element: [...manifestElements],
    manifest_attribute: [...manifestAttributes],
    gradle_property: [...properties],
  };
}
