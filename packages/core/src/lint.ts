import { parseSkill, body as bodyOf, sections } from './parse.ts';
import { SkillFormatError } from './errors.ts';
import type { Skill, SkillMeta } from './types.ts';

/**
 * The spec, checked mechanically.
 *
 * `error` is a violation of `spec/FORMAT.md` that breaks an installer or a reference.
 * `warn` is a violation of what a shipped skill is expected to carry: a rule with no
 * stated boundary still installs, it just gets applied everywhere.
 */
export interface Finding {
  readonly level: 'error' | 'warn';
  readonly message: string;
  readonly detail?: string;
  /** 1-indexed, when the finding belongs to a particular line. */
  readonly line?: number;
}

const HUMAN_SECTIONS = ['Why', 'Pitfalls', 'Provenance'];

/**
 * Words that make an instruction undecidable.
 *
 * The spec asks for text a reader can hold against a file and answer yes or no.
 * "Handle errors appropriately" cannot be checked, so it cannot be followed and cannot be
 * failed, which is worse than not being there: it costs context and changes nothing.
 */
const VAGUE = [
  'appropriately', 'properly', 'as needed', 'as appropriate', 'when appropriate',
  'best practice', 'best practices', 'if necessary', 'where possible', 'reasonable',
  'clean code', 'well-structured', 'avoid unnecessary',
];

const lineOf = (text: string, needle: string): number | undefined => {
  const at = text.indexOf(needle);
  return at < 0 ? undefined : text.slice(0, at).split('\n').length;
};

/**
 * Lint one skill file. `path` is only used to check that `name` matches where the file
 * lives, which is what keeps `family/skill` resolvable from the directory layout alone.
 */
export function lintSkill(text: string, path?: string): Finding[] {
  const found: Finding[] = [];
  let skill: Skill;
  try {
    skill = parseSkill(text);
  } catch (cause) {
    // SkylError folds detail into message, so take the first line back out
    const e = cause as SkillFormatError;
    return [{ level: 'error', message: e.message.split('\n')[0]!, ...(e.detail ? { detail: e.detail } : {}) }];
  }

  if (path) {
    const parts = path.split(/[\\/]/).filter(Boolean);
    const dir = parts.slice(-3, -1).join('/');
    if (dir !== '' && dir !== skill.name) {
      found.push({
        level: 'error',
        message: `name \`${skill.name}\` does not match its path`,
        detail: `the file lives in ${dir}/, so it can never be found by name`,
      });
    }
  }

  if (skill.description === '') {
    found.push({
      level: 'warn',
      message: 'no `description`',
      detail: 'nothing that lists this skill can say what it is for',
    });
  } else if (skill.description.length > 300) {
    found.push({
      level: 'warn',
      message: `description is ${String(skill.description.length)} characters`,
      detail: 'one line, read in a list next to a dozen others',
    });
  }

  const md = bodyOf(text);
  const all = sections(md);
  // line numbers are reported against the file, not the body, or they point at nothing
  const offset = text.slice(0, text.length - md.length).split('\n').length - 1;

  for (const s of HUMAN_SECTIONS) {
    if (!all.has(s)) {
      found.push({ level: 'warn', message: `no \`## ${s}\` section`, detail: 'required for a shipped skill' });
    }
  }

  if (skill.rules.length === 0) {
    found.push({
      level: 'error',
      message: 'no rules found',
      detail: 'a rule is `- **PREFIX-N** `must`: instruction`',
    });
  }

  const seen = new Set<string>();
  for (const rule of skill.rules) {
    if (seen.has(rule.id)) {
      found.push({ level: 'error', message: `duplicate rule id \`${rule.id}\``, ...lineFor(md, rule.id, offset) });
    }
    seen.add(rule.id);
  }

  for (const id of skill.retired) {
    if (!/^[A-Z0-9]+-\d+$/.test(id)) {
      found.push({
        level: 'error',
        message: `retired entry \`${id}\` is not a rule id`,
        detail: 'use the bare id, so reuse of it stays detectable',
      });
      continue;
    }
    if (seen.has(id)) {
      found.push({
        level: 'error',
        message: `retired id \`${id}\` is in use again`,
        detail: 'ids are never reused: published evidence points at the old one',
        ...lineFor(md, id, offset),
      });
    }
  }

  // each rule block: the boundary, the failure it names, and decidable wording
  for (const block of md.split(/^- \*\*/m).slice(1)) {
    const id = /^([A-Z0-9]+-\d+)/.exec(block)?.[1];
    if (!id) continue;
    const at = lineFor(md, id, offset);
    if (!block.includes('*Why:*')) {
      found.push({ level: 'warn', message: `${id}: no \`*Why:*\``, detail: 'the reader cannot recognise the bug in the wild', ...at });
    }
    if (!block.includes('*Not when:*')) {
      found.push({ level: 'warn', message: `${id}: no \`*Not when:*\``, detail: 'a rule with no stated boundary is applied everywhere', ...at });
    }
    // only the instruction has to be decidable: `*Why:*` is prose explaining a failure,
    // and "the timeout was not reasonable" is a fine thing to say there
    const instruction = block.split('*Why:*')[0]!.toLowerCase();
    for (const word of VAGUE) {
      if (instruction.includes(word)) {
        found.push({ level: 'warn', message: `${id}: "${word}" is not decidable`, detail: 'a reader cannot hold it against a file and answer yes or no', ...at });
        break;
      }
    }
  }

  // Skills are copied into files that hundreds of different models and editors read back.
  // Plain ASCII punctuation is the one form all of them round-trip unchanged.
  const dash = text.indexOf('—');
  if (dash >= 0) {
    found.push({
      level: 'warn',
      message: 'em dash in the text',
      detail: 'use a comma, a full stop, or a colon',
      line: text.slice(0, dash).split('\n').length,
    });
  }

  if (Object.keys(skill.detect).length === 0) {
    found.push({
      level: 'warn',
      message: 'no `detect` block',
      detail: 'nothing will ever propose this skill, it can only be installed by name',
    });
  }

  return found;
}

function lineFor(md: string, id: string, offset: number): { line?: number } {
  const line = lineOf(md, `**${id}**`);
  return line === undefined ? {} : { line: line + offset };
}

/** `` `android/core WORK-3` `` inside any skill body. */
const XREF = /`([a-z0-9-]+\/[a-z0-9-]+)\s+([A-Z0-9]+-\d+)`/g;

/**
 * Checks that need the whole registry: what a skill requires, and what its rules cite.
 *
 * A dangling cross-reference is an error rather than a warning because the agent is told
 * to consult a rule that will not be in its context, and it has no way to notice.
 */
export function lintRegistry(skills: readonly Skill[]): Map<string, Finding[]> {
  const out = new Map<string, Finding[]>();
  const byName = new Map<string, SkillMeta>(skills.map((s) => [s.name, s]));
  const ruleIds = new Map<string, Set<string>>(
    skills.map((s) => [s.name, new Set([...s.rules.map((r) => r.id), ...s.retired])]),
  );

  for (const skill of skills) {
    const found: Finding[] = [];
    for (const dep of skill.requires) {
      if (!byName.has(dep)) {
        found.push({ level: 'error', message: `requires \`${dep}\`, which is not in the registry` });
      }
    }
    for (const m of skill.raw.matchAll(XREF)) {
      const [, target, rule] = m as unknown as [string, string, string];
      if (target === skill.name) continue;
      const ids = ruleIds.get(target);
      if (!ids) {
        found.push({ level: 'error', message: `cites \`${target} ${rule}\`, and \`${target}\` is not in the registry` });
      } else if (!ids.has(rule)) {
        found.push({ level: 'error', message: `cites \`${target} ${rule}\`, which does not exist` });
      }
    }
    if (found.length > 0) out.set(skill.name, found);
  }
  return out;
}
