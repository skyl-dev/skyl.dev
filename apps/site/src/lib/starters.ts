import { loadSkills, tokens, type SkillPage } from './registry.ts';

/**
 * Presets for situations, not for stacks.
 *
 * One list, imported by both the page that shows them all and the home-page teaser. They
 * were written out twice, and the two copies had already begun to differ in their titles.
 *
 * A preset names its family once and its layers by bare name, so adding a family is a
 * block in this file and nothing anywhere else. Anything hand-written here is a claim
 * about a family that exists; `everythingIn` covers the rest, so a family published
 * tomorrow still has a starter tonight.
 */
export interface Starter {
  readonly title: string;
  readonly family: string;
  readonly when: string;
  /** Bare skill names inside `family`. */
  readonly picks: readonly string[];
}

const AUTHORED: readonly Starter[] = [
  {
    title: 'A new Android app',
    family: 'android',
    when: 'Kotlin and Compose, started this year, nothing legacy in it yet.',
    picks: ['core', 'kotlin', 'compose', 'mvvm'],
  },
  {
    title: 'A legacy codebase',
    family: 'android',
    when: 'Java, XML layouts, Fragments. The rules that matter here are different ones, not fewer.',
    picks: ['core', 'java', 'xml', 'mvvm'],
  },
  {
    title: 'An app with a backend',
    family: 'android',
    when: 'It talks to a server, caches what it fetches, and holds a token it must not leak.',
    picks: ['core', 'kotlin', 'networking', 'db', 'security'],
  },
  {
    title: 'A media-heavy app',
    family: 'android',
    when: 'Feeds, avatars, uploads. Where images are the product rather than decoration.',
    picks: ['core', 'kotlin', 'compose', 'images', 'permissions'],
  },
  {
    title: 'A team adding tests',
    family: 'android',
    when: 'The code exists and the suite does not, or it exists and nobody trusts it.',
    picks: ['core', 'kotlin', 'testing', 'di'],
  },
];

/**
 * One "everything" per family, rather than one for the registry.
 *
 * A single preset holding the whole registry stopped meaning anything the moment there
 * was a second family: it read as a recommendation to install two platforms at once, and
 * the command it produced named `core` twice, which is not a command the CLI accepts.
 */
function everythingIn(family: string, skills: readonly SkillPage[]): Starter {
  return {
    title: `Every ${family} skill`,
    family,
    when: 'The whole family, for a project that genuinely spans it. Read the cost before you do this.',
    picks: skills.filter((s) => s.meta.family === family).map((s) => s.meta.skill),
  };
}

export async function loadStarters(): Promise<Starter[]> {
  const skills = await loadSkills();
  const families = [...new Set(skills.map((s) => s.meta.family))];
  // authored first, in the order they are written, then each family's catch-all
  const out = AUTHORED.filter((s) => families.includes(s.family));
  const covered = new Set(out.map((s) => s.family));
  return [
    ...out,
    ...families
      .sort((a, b) => Number(covered.has(b)) - Number(covered.has(a)) || a.localeCompare(b))
      .map((f) => everythingIn(f, skills)),
  ];
}

export const qualified = (starter: Starter): string[] =>
  starter.picks.map((p) => `${starter.family}/${p}`);

/**
 * The command that installs a preset.
 *
 * A bare name resolves inside the family last named, so shortening every pick after the
 * first is only right while a command stays in one family. Across two it produces either
 * an ambiguity error or, on a name only one family has, a silent install of the wrong
 * skill. So the family is re-stated whenever it changes, and stays implied when it does
 * not.
 */
export function command(names: readonly string[]): string {
  let family = '';
  const parts = names.map((name) => {
    const at = name.indexOf('/');
    const owner = name.slice(0, at);
    if (owner === family) return name.slice(at + 1);
    family = owner;
    return name;
  });
  return `npx skyl.dev add ${parts.join(' ')}`;
}

export function summarise(starter: Starter, skills: readonly SkillPage[]) {
  const byName = new Map(skills.map((s) => [s.meta.name, s]));
  const chosen = qualified(starter).map((n) => byName.get(n)).filter(Boolean) as SkillPage[];
  return {
    skills: chosen,
    rules: chosen.reduce((n, s) => n + s.meta.rules.length, 0),
    tokens: tokens(chosen.reduce((n, s) => n + s.meta.installableWords, 0)),
  };
}
