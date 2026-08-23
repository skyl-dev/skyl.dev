import { SkillFormatError } from './errors.ts';
import { AXES, type Axis, type DetectBlock, type Rule, type Skill } from './types.ts';

/**
 * The frontmatter shapes this format uses: scalars, inline arrays, and one level of
 * nested map-of-arrays for `detect`. Parsed here rather than with a YAML library so
 * `@skyl/core` stays dependency-free, and because accepting only these shapes means a
 * malformed skill fails loudly instead of parsing into something surprising.
 */
type Scalar = string;
type FrontmatterValue = Scalar | string[] | Record<string, string[]>;

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function stripQuotes(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1);
  }
  return t;
}

function inlineList(v: string): string[] {
  const inner = v.trim().slice(1, -1).trim();
  if (inner === '') return [];
  return inner.split(',').map(stripQuotes).filter((s) => s !== '');
}

export function parseFrontmatter(text: string): Record<string, FrontmatterValue> {
  const m = FRONTMATTER.exec(text);
  if (!m) throw new SkillFormatError('no frontmatter', 'a skill starts with a --- delimited block');

  const out: Record<string, FrontmatterValue> = {};
  const lines = m[1]!.split('\n');
  let currentKey: string | null = null;
  let currentSub: string | null = null;

  for (const raw of lines) {
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) continue;

    const top = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(raw);
    if (top && !/^\s/.test(raw)) {
      const [, key, rest] = top as unknown as [string, string, string];
      currentKey = key;
      currentSub = null;
      const value = rest.trim();
      if (value === '') out[key] = {};
      else if (value.startsWith('[')) out[key] = inlineList(value);
      else out[key] = stripQuotes(value);
      continue;
    }

    const nested = /^\s+([A-Za-z_][\w-]*):\s*(.*)$/.exec(raw);
    if (nested && currentKey) {
      const [, sub, rest] = nested as unknown as [string, string, string];
      const bucket = (out[currentKey] ??= {}) as Record<string, string[]>;
      if (typeof bucket !== 'object' || Array.isArray(bucket)) {
        throw new SkillFormatError(`\`${currentKey}\` has both a value and nested keys`);
      }
      const value = rest.trim();
      bucket[sub] = value.startsWith('[') ? inlineList(value) : value === '' ? [] : [stripQuotes(value)];
      currentSub = sub;
      continue;
    }

    const item = /^\s*-\s+(.*)$/.exec(raw);
    if (item && currentKey) {
      const value = stripQuotes(item[1]!);
      const bucket = out[currentKey];
      if (Array.isArray(bucket)) bucket.push(value);
      else if (currentSub && bucket && typeof bucket === 'object') {
        ((bucket as Record<string, string[]>)[currentSub] ??= []).push(value);
      } else out[currentKey] = [value];
      continue;
    }
  }
  return out;
}

/** Everything after the frontmatter. */
export function body(text: string): string {
  const m = FRONTMATTER.exec(text);
  return m ? text.slice(m[0].length) : text;
}

/**
 * Split a markdown body into its `##` sections, keyed by heading text.
 * Content before the first heading is dropped: the format puts nothing there.
 */
export function sections(markdown: string): Map<string, string> {
  const out = new Map<string, string>();
  const parts = markdown.split(/^## (.+)$/m);
  for (let i = 1; i < parts.length; i += 2) {
    out.set(parts[i]!.trim(), (parts[i + 1] ?? '').trim());
  }
  return out;
}

const RULE = /^- \*\*([A-Z0-9]+-\d+)\*\*\s+`(must|should)`/gm;

export function rules(markdown: string): Rule[] {
  const out: Rule[] = [];
  for (const m of markdown.matchAll(RULE)) {
    out.push({ id: m[1]!, priority: m[2] as 'must' | 'should' });
  }
  return out;
}

function requireString(fm: Record<string, FrontmatterValue>, key: string): string {
  const v = fm[key];
  if (typeof v !== 'string' || v === '') {
    throw new SkillFormatError(`frontmatter is missing \`${key}\``);
  }
  return v;
}

function list(fm: Record<string, FrontmatterValue>, key: string): string[] {
  const v = fm[key];
  if (v === undefined) return [];
  if (Array.isArray(v)) return v;
  throw new SkillFormatError(`\`${key}\` must be a list`);
}

/** Parse one SKILL.md into the shape everything else in this package consumes. */
export function parseSkill(text: string): Skill {
  const fm = parseFrontmatter(text);
  const md = body(text);

  const name = requireString(fm, 'name');
  const slash = name.indexOf('/');
  if (slash <= 0 || slash === name.length - 1) {
    throw new SkillFormatError(`name \`${name}\` is not \`family/skill\``);
  }

  const axis = requireString(fm, 'axis');
  if (!AXES.includes(axis as Axis)) {
    throw new SkillFormatError(`axis \`${axis}\` is not one of ${AXES.join(', ')}`);
  }

  const version = requireString(fm, 'version');
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new SkillFormatError(`version \`${version}\` is not semver`);
  }

  const agentSections = list(fm, 'agent_sections');
  if (agentSections.length === 0) {
    throw new SkillFormatError('frontmatter is missing `agent_sections`', 'nothing would be installed');
  }

  const detectRaw = fm['detect'];
  const detect: DetectBlock =
    detectRaw && typeof detectRaw === 'object' && !Array.isArray(detectRaw)
      ? (detectRaw as DetectBlock)
      : {};

  const all = sections(md);
  const installable = agentSections
    .map((s) => {
      const heading = s.charAt(0).toUpperCase() + s.slice(1);
      const found = all.get(heading) ?? all.get(s);
      if (found === undefined) {
        throw new SkillFormatError(
          `\`agent_sections\` names \`${s}\` but the file has no \`## ${heading}\``,
        );
      }
      return `## ${heading}\n\n${found}`;
    })
    .join('\n\n');

  return {
    name,
    family: name.slice(0, slash),
    skill: name.slice(slash + 1),
    axis: axis as Axis,
    version,
    requires: list(fm, 'requires'),
    agentSections,
    retired: list(fm, 'retired'),
    detect,
    authors: list(fm, 'authors'),
    rules: rules(md),
    installable,
    installableWords: installable.split(/\s+/).filter(Boolean).length,
    raw: text,
  };
}
