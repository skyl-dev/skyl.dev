import { writeFile } from 'node:fs/promises';
import { buildContext, renderContext } from '../context.ts';
import { readLockfile } from '../install.ts';
import { bold, dim, green, out, tokens, yellow } from '../ui.ts';

export interface ContextOptions {
  root: string;
  dryRun?: boolean | undefined;
  json?: boolean | undefined;
  outFile?: string | undefined;
  maxFiles?: number | undefined;
}

/**
 * Emit what a model would need to describe this product.
 *
 * A separate command rather than a step inside `learn`, because the selection is the
 * part worth trusting and it has to be reviewable on its own. `--dry-run` lists the
 * files without their contents, which is what anyone with a proprietary codebase will
 * run first.
 */
export async function context(opts: ContextOptions): Promise<number> {
  const lock = await readLockfile(opts.root);
  const bundle = await buildContext(opts.root, {
    installed: Object.keys(lock?.skills ?? {}),
    ...(opts.maxFiles === undefined ? {} : { maxFiles: opts.maxFiles }),
  });

  if (opts.dryRun === true) {
    out();
    out(`  ${bold('Would send')} ${dim(`${bundle.files.length} files`)}`);
    out();
    for (const file of bundle.files) {
      out(`    ${file.path.padEnd(52)} ${dim(`${file.why}${file.truncated ? ', truncated' : ''}`)}`);
    }
    if (bundle.withheld.length > 0) {
      out();
      out(`  ${yellow('Withheld')}`);
      for (const w of bundle.withheld) out(`    ${w.path.padEnd(52)} ${dim(w.why)}`);
    }
    const words = bundle.files.reduce((n, f) => n + f.text.split(/\s+/).length, 0);
    out();
    out(`  ${dim(`plus the directory tree and what the build declares, ${tokens(words)}`)}`);
    out();
    return 0;
  }

  const text = opts.json === true ? `${JSON.stringify(bundle, null, 2)}\n` : renderContext(bundle);
  if (opts.outFile) {
    await writeFile(opts.outFile, text, 'utf8');
    out(`  ${green('Written.')} ${opts.outFile} ${dim(`${bundle.files.length} files`)}`);
    return 0;
  }
  process.stdout.write(text);
  return 0;
}
