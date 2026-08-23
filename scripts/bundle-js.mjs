#!/usr/bin/env node
/**
 * Compile the CLI and everything it imports into one file.
 *
 * `@skyl/core` is a workspace package, so a published CLI that merely depends on it names
 * something nobody can resolve. Shipping it as a bundled dependency worked for install and
 * broke `npm audit signatures`, which walks the tree and asks the registry about a package
 * that was never published. Compiling it in removes the question: the published package has
 * no runtime dependencies, and the site keeps importing the same source through the
 * workspace.
 */
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, stat } from 'node:fs/promises';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', 'packages', 'cli');

const result = await build({
  entryPoints: [join(cli, 'src', 'bin.ts')],
  outfile: join(cli, 'dist', 'bin.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  // node builtins stay external; nothing else is imported
  packages: 'external',
  external: ['node:*'],
  alias: { '@skyl/core': join(here, '..', 'packages', 'core', 'src', 'index.ts') },
  legalComments: 'none',
  metafile: true,
});

const out = join(cli, 'dist', 'bin.js');
const text = await readFile(out, 'utf8');
if (!text.startsWith('#!')) {
  throw new Error('the shebang did not survive bundling, and the binary will not run');
}
if (/from ['"]@skyl\/core['"]/.test(text)) {
  throw new Error('@skyl/core is still imported rather than compiled in');
}
const { size } = await stat(out);
console.log(`bundled -> dist/bin.js, ${(size / 1024).toFixed(0)} KB`);
