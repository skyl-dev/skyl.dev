import { ResolutionError } from './errors.ts';
import type { SkillMeta } from './types.ts';

/**
 * Expand a requested set to include everything it requires, and order it so a skill
 * always appears after what it depends on.
 *
 * Install order matters: `agent_sections` are concatenated in the order written, and a
 * layer that refers to its core reads wrong if it lands first.
 */
export function resolve(skills: readonly SkillMeta[], requested: readonly string[]): SkillMeta[] {
  const byName = new Map(skills.map((s) => [s.name, s]));
  const ordered: SkillMeta[] = [];
  const done = new Set<string>();
  const path: string[] = [];

  const visit = (name: string, from?: string): void => {
    if (done.has(name)) return;

    if (path.includes(name)) {
      throw new ResolutionError(
        'skills require each other in a cycle',
        [...path.slice(path.indexOf(name)), name].join(' -> '),
      );
    }

    const skill = byName.get(name);
    if (!skill) {
      throw new ResolutionError(
        `unknown skill \`${name}\``,
        from ? `required by \`${from}\`` : 'not in the index',
      );
    }

    path.push(name);
    for (const dep of skill.requires) visit(dep, name);
    path.pop();

    done.add(name);
    ordered.push(skill);
  };

  for (const name of requested) visit(name);
  return ordered;
}

/** What `resolve` added that the caller did not ask for, so a prompt can say so. */
export function implied(resolved: readonly SkillMeta[], requested: readonly string[]): SkillMeta[] {
  const asked = new Set(requested);
  return resolved.filter((s) => !asked.has(s.name));
}
