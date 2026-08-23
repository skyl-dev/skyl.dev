/**
 * Where an installer writes, per agent tool.
 *
 * Vendor neutrality is cheap here and expensive to retrofit: the same resolved skill is
 * written to a different directory with a different extension, and nothing above this
 * layer needs to know which tool is in use.
 */
export interface Target {
  readonly id: string;
  /** Directory, relative to the project root. */
  readonly dir: string;
  /** File name for a skill, given its `family/skill` name. */
  fileFor(name: string): string;
  /** Some tools want their own frontmatter on each file. */
  header?(name: string, version: string): string;
}

const flat = (name: string) => name.replace('/', '-');

export const TARGETS: readonly Target[] = [
  {
    id: 'claude',
    dir: '.claude/skills',
    fileFor: (name) => `${flat(name)}/SKILL.md`,
  },
  {
    id: 'cursor',
    dir: '.cursor/rules',
    fileFor: (name) => `${flat(name)}.mdc`,
    // Cursor decides when to apply a rule from its own frontmatter, so a skill that
    // arrives without one is either always on or never on, depending on the version.
    header: (name) => `---\ndescription: ${name}\nalwaysApply: false\n---\n\n`,
  },
  { id: 'windsurf', dir: '.windsurf/rules', fileFor: (name) => `${flat(name)}.md` },
  { id: 'continue', dir: '.continue/rules', fileFor: (name) => `${flat(name)}.md` },
  { id: 'agents', dir: '.agents/skills', fileFor: (name) => `${flat(name)}.md` },
];

export const DEFAULT_TARGET = 'claude';

export function targetById(id: string): Target | undefined {
  return TARGETS.find((t) => t.id === id);
}
