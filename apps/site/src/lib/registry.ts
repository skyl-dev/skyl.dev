import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { marked } from 'marked';
import { body, directorySource, sections, type Skill } from '@skyl/core';

/**
 * The registry, read once at build time.
 *
 * The site and the CLI share `@skyl/core`, so what is shown here is parsed by the same
 * code that installs it. If they had separate parsers, the site would eventually display
 * a skill the CLI does not install, and that bug is invisible until someone hits it.
 */
/**
 * A sibling checkout in development and in CI, overridable for a build pinned to a tag.
 *
 * Found by walking up from the working directory rather than from `import.meta.url`: this
 * module is bundled before it runs, so its own path at build time is inside `dist` and
 * points nowhere useful.
 */
function findRegistry(): string {
  const named = process.env['SKYL_REGISTRY'];
  if (named) return resolve(named);

  let dir = process.cwd();
  for (let up = 0; up < 6; up += 1) {
    const candidate = join(dir, 'skyl');
    if (existsSync(join(candidate, 'skills'))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    'no registry found. Check out github.com/skyl-dev/skyl beside this repository, ' +
      'or set SKYL_REGISTRY to where it lives.',
  );
}

export const REGISTRY_ROOT = findRegistry();

marked.use({ gfm: true, breaks: false });

/**
 * A table scrolls inside itself, not inside the prose around it.
 *
 * The pages that carry registry markdown put `.scroller` on the whole prose block, so a
 * table wider than the column dragged every paragraph sideways with it. Wrapping happens
 * here rather than in each page because the markdown arrives from the registry and no page
 * knows in advance whether it contains a table.
 */
const wrapTables = (html: string): string =>
  html.replace(/<table>/g, '<div class="table-scroll"><table>').replace(/<\/table>/g, '</table></div>');

const render = (md: string): string => wrapTables(marked.parse(md, { async: false }));

export interface Reference {
  readonly slug: string;
  readonly title: string;
  readonly html: string;
}

/**
 * A rule, taken apart.
 *
 * `@skyl/core` reads the id and the priority, which is all an installer needs: it writes the
 * section through whole. A page needs the pieces, because a rule is the unit a reader arrives
 * for and the unit they link to, and neither works while twenty of them are one block of
 * markdown. The format is fixed and the linter holds it, so this reads it rather than guesses.
 */
export interface RuleDetail {
  readonly id: string;
  readonly priority: 'must' | 'should';
  /** The `###` group it sits under, empty when a skill has too few rules to group. */
  readonly group: string;
  readonly statement: string;
  readonly why: string | undefined;
  readonly notWhen: string | undefined;
}

export interface SkillPage {
  readonly meta: Skill;
  /** `## Rules` and the rest, in the order the file writes them. */
  readonly parts: readonly { readonly heading: string; readonly html: string; readonly forAgent: boolean }[];
  readonly references: readonly Reference[];
  /** The published evidence for this skill, if there is any. */
  readonly evidence: string | undefined;
  readonly rulesCount: { readonly must: number; readonly should: number };
  /** Every rule, in file order, taken apart. */
  readonly rules: readonly RuleDetail[];
  /** What the `## Rules` section says before the first rule: scope, priority, when not to apply. */
  readonly rulesIntro: string;
  /** The group headings in file order, for a table of contents. */
  readonly ruleGroups: readonly { readonly name: string; readonly slug: string; readonly count: number }[];
}

const inline = (md: string): string => marked.parseInline(md, { async: false }) as string;

export const groupSlug = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const RULE_HEAD = /^- \*\*([A-Z0-9]+-\d+)\*\*\s+`(must|should)`:\s*/;

/** Split the `## Rules` section into its intro, its `###` groups, and one object per bullet. */
function takeRulesApart(markdown: string): {
  intro: string;
  rules: RuleDetail[];
  groups: { name: string; slug: string; count: number }[];
} {
  const chunks = markdown.split(/^### (.+)$/m);
  const intro = chunks[0]!.trim();
  const rules: RuleDetail[] = [];
  const groups: { name: string; slug: string; count: number }[] = [];

  // an ungrouped skill is one chunk; a grouped one alternates heading, body
  const blocks: { name: string; body: string }[] =
    chunks.length === 1 ? [{ name: '', body: intro }] : [];
  for (let i = 1; i < chunks.length; i += 2) {
    blocks.push({ name: chunks[i]!.trim(), body: chunks[i + 1] ?? '' });
  }

  for (const block of blocks) {
    let count = 0;
    // a bullet runs until the next one starts at the margin
    for (const bullet of block.body.split(/\n(?=- \*\*[A-Z0-9]+-\d+\*\*)/)) {
      const head = RULE_HEAD.exec(bullet);
      if (!head) continue;
      const rest = bullet.slice(head[0].length).replace(/\s*\n\s*/g, ' ').trim();
      const why = /\*Why:\*\s*/.exec(rest);
      const not = /\*Not when:\*\s*/.exec(rest);
      const cut = Math.min(why?.index ?? rest.length, not?.index ?? rest.length);
      const whyEnd = not && why && not.index > why.index ? not.index : rest.length;
      rules.push({
        id: head[1]!,
        priority: head[2] as 'must' | 'should',
        group: block.name,
        statement: inline(rest.slice(0, cut).trim()),
        why: why ? inline(rest.slice(why.index + why[0].length, whyEnd).trim()) : undefined,
        notWhen: not ? inline(rest.slice(not.index + not[0].length).trim()) : undefined,
      });
      count += 1;
    }
    if (block.name && count) groups.push({ name: block.name, slug: groupSlug(block.name), count });
  }

  return { intro: render(intro), rules, groups };
}

let cached: SkillPage[] | undefined;

export async function loadSkills(): Promise<SkillPage[]> {
  if (cached) return cached;

  const skills = await directorySource(join(REGISTRY_ROOT, 'skills')).load();
  const pages: SkillPage[] = [];

  for (const meta of skills) {
    const found = sections(body(meta.raw));
    const forAgent = new Set(meta.agentSections.map((s) => s.charAt(0).toUpperCase() + s.slice(1)));

    const parts = [...found].map(([heading, markdown]) => ({
      heading,
      // the human sections carry a marker saying they are not installed, which is useful
      // in the file and noise on a page that says the same thing in its own layout
      html: render(markdown.replace(/^<!--[\s\S]*?-->\s*/m, '')),
      forAgent: forAgent.has(heading),
    }));

    const taken = takeRulesApart(found.get('Rules') ?? '');

    pages.push({
      meta,
      parts,
      rules: taken.rules,
      rulesIntro: taken.intro,
      ruleGroups: taken.groups,
      references: await loadReferences(meta),
      evidence: await loadDoc('evidence', meta.family, 'skills', `${meta.skill}.md`),
      rulesCount: {
        must: meta.rules.filter((r) => r.priority === 'must').length,
        should: meta.rules.filter((r) => r.priority === 'should').length,
      },
    });
  }

  pages.sort((a, b) => a.meta.name.localeCompare(b.meta.name));
  cached = pages;
  return pages;
}

async function loadReferences(meta: Skill): Promise<Reference[]> {
  const dir = join(REGISTRY_ROOT, 'skills', meta.family, meta.skill, 'references');
  const files = await readdir(dir).catch(() => []);
  const out: Reference[] = [];
  for (const file of files.filter((f) => f.endsWith('.md')).sort()) {
    const text = await readFile(join(dir, file), 'utf8');
    out.push({
      slug: file.replace(/\.md$/, ''),
      title: /^#\s+(.+)$/m.exec(text)?.[1] ?? file.replace(/\.md$/, '').replace(/-/g, ' '),
      html: absolutise(render(text.replace(/^#\s+.+$/m, '')), `skills/${meta.family}/${meta.skill}/references`),
    });
  }
  return out;
}

const readIfPresent = (path: string): Promise<string | undefined> =>
  readFile(path, 'utf8').then((t) => render(t), () => undefined);

/**
 * Registry markdown links to its neighbours by relative path, which resolves to nothing on
 * a site that renders those files at different URLs. They are rewritten to the file on
 * GitHub, which is where that content actually lives.
 */
const REPO = 'https://github.com/skyl-dev/skyl/blob/main';

function absolutise(html: string, dir: string): string {
  // resolved rather than pattern-matched: `../model-matrix.md` from evidence/android/skills
  // has to climb, and a regex that only strips `./` leaves it broken
  return html.replace(/href="((?:\.\.?\/)[^"]+|[^":/][^":]*\.md)"/g, (_all, href: string) => {
    const parts = `${dir}/${href}`.split('/');
    const out: string[] = [];
    for (const part of parts) {
      if (part === '' || part === '.') continue;
      if (part === '..') out.pop();
      else out.push(part);
    }
    return `href="${REPO}/${out.join('/')}"`;
  });
}

/** Families, in the order a reader meets them: the one with the most skills first. */
export async function loadFamilies(): Promise<{ name: string; skills: SkillPage[] }[]> {
  const skills = await loadSkills();
  const byFamily = new Map<string, SkillPage[]>();
  for (const s of skills) {
    (byFamily.get(s.meta.family) ?? byFamily.set(s.meta.family, []).get(s.meta.family)!).push(s);
  }
  return [...byFamily]
    .map(([name, list]) => ({ name, skills: list }))
    .sort((a, b) => b.skills.length - a.skills.length || a.name.localeCompare(b.name));
}

export async function loadDoc(...path: string[]): Promise<string | undefined> {
  const html = await readIfPresent(join(REGISTRY_ROOT, ...path));
  if (!html) return undefined;
  // the file's own H1 repeats the heading the page already shows above it
  return absolutise(html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/, ''), path.slice(0, -1).join('/'));
}

/**
 * The headline table from a family's evidence README, read rather than restated, so the
 * site cannot claim a number the registry does not.
 */
export async function evidenceFacts(family: string): Promise<Record<string, string>> {
  const text = await readFile(join(REGISTRY_ROOT, 'evidence', family, 'README.md'), 'utf8')
    .catch(() => undefined);
  if (!text) return {};
  const out: Record<string, string> = {};
  for (const row of text.matchAll(/^\|\s*([a-z][a-z ]*?)\s*\|\s*(.+?)\s*\|$/gm)) {
    // the cell is markdown, so its inline code has to become inline code
    out[row[1]!] = row[2]!.replace(/`([^`]+)`/g, '<code>$1</code>');
  }
  return out;
}

export interface RuleParts {
  readonly id: string;
  readonly priority: string;
  readonly instruction: string;
  readonly why: string;
  readonly notWhen: string;
}

/**
 * One rule, split into the three parts the format requires.
 *
 * Read from the registry rather than copied into the page, so the example cannot drift
 * from the rule it claims to be quoting.
 */
export async function loadRule(name: string, id: string): Promise<RuleParts | undefined> {
  const skills = await loadSkills();
  const skill = skills.find((s) => s.meta.name === name);
  if (!skill) return undefined;

  const block = skill.meta.raw.split(/^- \*\*/m).find((b) => b.startsWith(`${id}**`));
  if (!block) return undefined;

  const tidy = (text: string) => text.replace(/\s+/g, ' ').trim();
  const priority = /^[^`]*`(must|should)`/.exec(block)?.[1] ?? 'must';
  const instruction = tidy(block.slice(block.indexOf(':') + 1).split('*Why:*')[0] ?? '');
  const why = tidy(block.split('*Why:*')[1]?.split('*Not when:*')[0] ?? '');
  const notWhen = tidy(block.split('*Not when:*')[1] ?? '');

  return { id, priority, instruction, why, notWhen };
}

/** The token estimate the CLI prints, so the two never disagree in front of a user. */
export function tokens(words: number): number {
  return Math.round((words * 4) / 300) * 100;
}

export const AXIS_ORDER = ['core', 'language', 'framework', 'service', 'topic'] as const;
