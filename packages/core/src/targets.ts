import type { Skill } from './types.ts';

/**
 * Where an installer writes, per agent tool.
 *
 * Vendor neutrality is cheap here and expensive to retrofit: the same resolved skill is
 * written to a different directory with a different extension, and nothing above this
 * layer needs to know which tool is in use.
 *
 * Every tool here decides whether to load a file by reading its frontmatter, and none of
 * them treat a file without one as a rule that is on. A skill installed without a header
 * is therefore written, listed, hashed, and never read, which is the worst of the
 * available failures: it looks installed. The header is per tool because the field names
 * are.
 */
export interface Target {
  readonly id: string;
  /** Directory, relative to the project root. */
  readonly dir: string;
  /** File name for a skill, given its `family/skill` name. */
  fileFor(name: string): string;
  /** The frontmatter this tool reads to decide whether the file applies. */
  header(skill: Skill): string;
  /**
   * A ceiling the tool imposes on what it will actually read, in characters, where it has
   * one. Past it the tool truncates or drops the rule rather than reporting anything.
   */
  readonly limit?: { readonly perFile: number; readonly total: number; readonly says: string };
}

const flat = (name: string) => name.replace('/', '-');

/**
 * A description is one line of prose with colons in it, so it is written as a quoted YAML
 * scalar. `JSON.stringify` produces exactly that: double quotes, with everything inside
 * escaped the way YAML expects. It is also what the registry's own plugin builder emits,
 * and the two have to agree or the same skill loads under one route and not the other.
 */
const quoted = (text: string) => JSON.stringify(text);

/** A target that gives a skill its own directory can also carry the files a rule points at. */
export const takesReferences = (target: Target): boolean => target.fileFor('x/y').includes('/');

export const TARGETS: readonly Target[] = [
  {
    // Claude Code finds a skill by reading `name` and `description` out of the
    // frontmatter. Without them the directory is passed over silently at startup.
    id: 'claude',
    dir: '.claude/skills',
    fileFor: (name) => `${flat(name)}/SKILL.md`,
    header: (s) => `---\nname: ${flat(s.name)}\ndescription: ${quoted(s.description)}\n---\n\n`,
  },
  {
    // Cursor decides when to apply a rule from its own frontmatter, so a skill that
    // arrives without one is either always on or never on, depending on the version.
    // The description is what it matches against, which is why this is the description
    // and not the name: the name says `android/core` and answers no question.
    id: 'cursor',
    dir: '.cursor/rules',
    fileFor: (name) => `${flat(name)}.mdc`,
    header: (s) => `---\ndescription: ${quoted(s.description)}\nalwaysApply: false\n---\n\n`,
  },
  {
    // Windsurf reads one `trigger` field, and `model_decision` is the mode that means
    // "read the description and decide", which is what a skill is for. It also caps a
    // rule at 6,000 characters and the whole active set at 12,000, and enforces both by
    // truncating rather than by saying anything.
    id: 'windsurf',
    dir: '.windsurf/rules',
    fileFor: (name) => `${flat(name)}.md`,
    header: (s) => `---\ntrigger: model_decision\ndescription: ${quoted(s.description)}\n---\n\n`,
    limit: {
      perFile: 6000,
      total: 12000,
      says:
        'Windsurf reads 6,000 characters of a rule and 12,000 across all of them,\nand truncates the rest without saying so.',
    },
  },
  {
    id: 'continue',
    dir: '.continue/rules',
    fileFor: (name) => `${flat(name)}.md`,
    header: (s) =>
      `---\nname: ${s.name}\ndescription: ${quoted(s.description)}\nalwaysApply: false\n---\n\n`,
  },
  {
    // The vendor-neutral Agent Skills layout: a directory per skill holding SKILL.md,
    // with the same two fields Claude Code reads. This was a flat file until the
    // frontmatter went in, and a flat file has nowhere to put a skill's references.
    id: 'agents',
    dir: '.agents/skills',
    fileFor: (name) => `${flat(name)}/SKILL.md`,
    header: (s) => `---\nname: ${flat(s.name)}\ndescription: ${quoted(s.description)}\n---\n\n`,
  },
];

export const DEFAULT_TARGET = 'claude';

export function targetById(id: string): Target | undefined {
  return TARGETS.find((t) => t.id === id);
}
