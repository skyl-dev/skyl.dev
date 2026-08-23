import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Enough of `.gitignore` to be trustworthy on a real repository.
 *
 * Not a complete implementation, and it does not need to be: the consequence of getting
 * a pattern wrong here is that a file is read and possibly sent to a model, so the rule
 * is that anything uncertain is excluded rather than included. Negation is supported
 * because `!` is how people re-admit a directory they excluded broadly, and dropping it
 * would silently send nothing at all.
 */
export interface Ignore {
  ignored(relativePath: string, isDirectory: boolean): boolean;
}

interface Pattern {
  re: RegExp;
  negated: boolean;
  directoryOnly: boolean;
}

function toRegExp(glob: string): RegExp {
  let source = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**/` spans directories, a bare `**` is the same as `*` for our purpose
        if (glob[i + 2] === '/') { source += '(?:.*/)?'; i += 2; }
        else { source += '.*'; i += 1; }
      } else source += '[^/]*';
    } else if (c === '?') source += '[^/]';
    else if ('\\^$.|+()[]{}'.includes(c)) source += `\\${c}`;
    else source += c;
  }
  return new RegExp(`^${source}$`);
}

export function parseIgnore(text: string): Pattern[] {
  const out: Pattern[] = [];
  for (const raw of text.split('\n')) {
    let line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const negated = line.startsWith('!');
    if (negated) line = line.slice(1);
    const directoryOnly = line.endsWith('/');
    if (directoryOnly) line = line.slice(0, -1);
    // a pattern without a slash matches at any depth, one with a slash is rooted
    const anchored = line.includes('/');
    if (line.startsWith('/')) line = line.slice(1);
    out.push({ re: toRegExp(anchored ? line : `**/${line}`), negated, directoryOnly });
  }
  return out;
}

export async function loadIgnore(root: string, extra: readonly string[] = []): Promise<Ignore> {
  const patterns: Pattern[] = [];
  for (const file of ['.gitignore', '.skylignore']) {
    const text = await readFile(join(root, file), 'utf8').catch(() => undefined);
    if (text !== undefined) patterns.push(...parseIgnore(text));
  }
  patterns.push(...parseIgnore(extra.join('\n')));

  return {
    ignored(path: string, isDirectory: boolean): boolean {
      // every ancestor directory, so `build/` excludes what is inside it as well
      const parents = segments(path);
      let result = false;
      for (const p of patterns) {
        const self = (!p.directoryOnly || isDirectory) && p.re.test(path);
        const under = parents.some((s) => p.re.test(s));
        if (self || under) result = !p.negated;
      }
      return result;
    },
  };
}

/** Every parent path, so a match on a directory excludes what is inside it. */
function segments(path: string): string[] {
  const parts = path.split('/');
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
}
