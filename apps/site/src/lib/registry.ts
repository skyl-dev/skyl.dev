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

const render = (md: string): string => marked.parse(md, { async: false });

export interface Reference {
  readonly slug: string;
  readonly title: string;
  readonly html: string;
}

export interface SkillPage {
  readonly meta: Skill;
  /** `## Rules` and the rest, in the order the file writes them. */
  readonly parts: readonly { readonly heading: string; readonly html: string; readonly forAgent: boolean }[];
  readonly references: readonly Reference[];
  /** The published evidence for this skill, if there is any. */
  readonly evidence: string | undefined;
  readonly rulesCount: { readonly must: number; readonly should: number };
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

    pages.push({
      meta,
      parts,
      references: await loadReferences(meta),
      evidence: await readIfPresent(join(REGISTRY_ROOT, 'evidence', meta.family, 'skills', `${meta.skill}.md`)),
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
      html: render(text.replace(/^#\s+.+$/m, '')),
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
  return html.replace(/href="(\.\/[^"]+|[^":/][^":]*\.md)"/g, (_all, href: string) => {
    const clean = String(href).replace(/^\.\//, '');
    return `href="${REPO}/${dir}/${clean}"`;
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
    out[row[1]!] = row[2]!;
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
