/**
 * How a wanted value is compared against a signal, chosen by the shape of the detect key.
 *
 * Substring matching everywhere looked simpler and is wrong in both directions:
 *
 *   - `androidx.compose.ui:ui-test-junit4` contains `androidx.compose.ui:ui`, so a
 *     project with only Compose test helpers would pull the whole Compose skill.
 *   - a file pattern is a glob, and `app/src/main/Main.kt` does not contain the literal
 *     text `**` + `/*.kt`, so file detection never fired at all.
 */

/** `group:artifact:version` reduced to `group:artifact`, which is the identity. */
function coordinate(value: string): string {
  const parts = value.split(':');
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : value;
}

function globToRegExp(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**/` spans directories, and also matches nothing so `**/*.kt` hits `a.kt`
        if (glob[i + 2] === '/') { out += '(?:.*/)?'; i += 2; } else { out += '.*'; i += 1; }
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') out += '[^/]';
    else if ('.+^${}()|[]\\'.includes(c)) out += `\\${c}`;
    else out += c;
  }
  return new RegExp(`^${out}$`);
}

const globCache = new Map<string, RegExp>();

function globMatch(pattern: string, path: string): boolean {
  let re = globCache.get(pattern);
  if (!re) { re = globToRegExp(pattern); globCache.set(pattern, re); }
  const normalised = path.replace(/^\.\//, '').replace(/\\/g, '/');
  return re.test(normalised) || re.test(`./${normalised}`.slice(2));
}

/**
 * A detect key's matching strategy. Unknown keys fall back to exact comparison, which
 * fails closed: a new key matches nothing until it is taught how, rather than matching
 * everything by accident.
 */
export type Strategy = 'coordinate' | 'glob' | 'exact';

export function strategyFor(key: string): Strategy {
  if (key.endsWith('dependency') || key.endsWith('dependencies')) return 'coordinate';
  if (key === 'file' || key.endsWith('_file') || key.endsWith('path')) return 'glob';
  return 'exact';
}

export function matches(key: string, wanted: string, signal: string): boolean {
  switch (strategyFor(key)) {
    case 'coordinate':
      return coordinate(signal) === coordinate(wanted);
    case 'glob':
      return globMatch(wanted, signal);
    case 'exact':
      return signal === wanted || signal.includes(wanted);
  }
}
