import { matches } from './match.ts';
import type { DetectBlock, Match, ProjectSignals, SkillMeta } from './types.ts';

/**
 * Detection is a lookup, not inference: a skill's `detect` block lists what to look for,
 * and a project matches if any signal under the same key satisfies one of them.
 *
 * How a value is compared depends on the key. See `match.ts`: dependencies compare on
 * their coordinate so a test artifact does not drag in the library it tests, and file
 * patterns are globs.
 */
function hits(detect: DetectBlock, signals: ProjectSignals): { key: string; value: string }[] {
  const found: { key: string; value: string }[] = [];
  for (const [key, wanted] of Object.entries(detect)) {
    const present = signals[key];
    if (!present || present.length === 0) continue;
    for (const w of wanted) {
      if (present.some((p) => matches(key, w, p))) found.push({ key, value: w });
    }
  }
  return found;
}

/**
 * Which skills a project matches.
 *
 * A `core` skill has no detect block by design: it applies to every project in its
 * family, so it is included whenever anything else in that family matched. Without that,
 * a project would resolve to a language skill and none of the foundation it layers on.
 */
export function detect(skills: readonly SkillMeta[], signals: ProjectSignals): Match[] {
  const matched: Match[] = [];
  const families = new Set<string>();

  for (const s of skills) {
    if (Object.keys(s.detect).length === 0) continue;
    const on = hits(s.detect, signals);
    if (on.length > 0) {
      matched.push({ skill: s.name, on });
      families.add(s.family);
    }
  }

  for (const s of skills) {
    if (s.axis !== 'core' || !families.has(s.family)) continue;
    if (matched.some((m) => m.skill === s.name)) continue;
    matched.push({ skill: s.name, on: [{ key: 'family', value: s.family }] });
  }

  return matched.sort((a, b) => a.skill.localeCompare(b.skill));
}

/**
 * Skills in the family that did *not* match, so `scan` can show what it considered and
 * rejected. A tool that only lists what it wants looks like it is guessing.
 */
export function unmatched(skills: readonly SkillMeta[], matched: readonly Match[]): SkillMeta[] {
  const taken = new Set(matched.map((m) => m.skill));
  const families = new Set(matched.map((m) => m.skill.split('/')[0]!));
  return skills
    .filter((s) => !taken.has(s.name) && families.has(s.family))
    .sort((a, b) => a.name.localeCompare(b.name));
}
