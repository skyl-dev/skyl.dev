import { ResolutionError } from './errors.ts';
import type { SkillMeta } from './types.ts';

/**
 * Accept `android/kotlin` and bare `kotlin`, because typing the family once is the
 * natural way to ask: `skyl add android/core kotlin compose`.
 *
 * A bare name resolves against the families already named in the same request, then
 * against the whole index. Ambiguity is an error rather than a guess: silently picking
 * one of two families would install the wrong thing and look like it worked.
 */
export function normalise(skills: readonly SkillMeta[], requested: readonly string[]): string[] {
  const known = new Set(skills.map((s) => s.name));
  const families = new Set(requested.filter((r) => r.includes('/')).map((r) => r.split('/')[0]!));

  return requested.map((raw) => {
    const name = raw.trim();
    if (name.includes('/')) {
      if (!known.has(name)) throw new ResolutionError(`unknown skill \`${name}\``);
      return name;
    }

    const inNamedFamily = skills.filter((s) => families.has(s.family) && s.skill === name);
    if (inNamedFamily.length === 1) return inNamedFamily[0]!.name;

    const anywhere = skills.filter((s) => s.skill === name);
    if (anywhere.length === 1) return anywhere[0]!.name;
    if (anywhere.length === 0) throw new ResolutionError(`unknown skill \`${name}\``);

    throw new ResolutionError(
      `\`${name}\` is ambiguous`,
      `it exists in ${anywhere.map((s) => s.family).join(', ')}. Name the family.`,
    );
  });
}
