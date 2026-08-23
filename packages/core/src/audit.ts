import { sections } from './parse.ts';
import type { Skill } from './types.ts';

/**
 * What a hand-written context file contains, measured against the registry.
 *
 * Analysis only. There is no rewriting here and there should not be: prose passed
 * through a model reliably comes back longer and more generic, and the file being
 * audited is usually one someone tuned by hand over months.
 *
 * Everything reported is lexical. Overlap means the section and the skill talk about the
 * same things in the same words, which is a reason for a human to look, not a finding on
 * its own. The matched terms are always shown, because a claim of overlap that cannot be
 * checked is worth nothing.
 */
export interface SectionReport {
  readonly heading: string;
  readonly words: number;
  /** Registry skills whose distinctive vocabulary this section shares. */
  readonly overlaps: readonly { readonly skill: string; readonly share: number; readonly terms: readonly string[] }[];
  /** No imperative wording anywhere in the section. */
  readonly noInstruction: boolean;
}

export interface AuditReport {
  readonly words: number;
  readonly sections: readonly SectionReport[];
  /** Things a context file is expected to carry that are not here. */
  readonly missing: readonly string[];
  /** Lines that look like a credential. Reported first, and never quoted in full. */
  readonly secrets: readonly { readonly line: number; readonly what: string }[];
}

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'is', 'are', 'was', 'be', 'been', 'to', 'of',
  'in', 'on', 'for', 'with', 'as', 'at', 'by', 'from', 'that', 'this', 'it', 'its', 'not', 'no',
  'do', 'does', 'use', 'using', 'used', 'when', 'where', 'which', 'you', 'your', 'we', 'our', 'can',
  'will', 'should', 'must', 'never', 'always', 'all', 'any', 'each', 'per', 'into', 'out', 'up',
  'has', 'have', 'they', 'them', 'their', 'one', 'two', 'more', 'than', 'so', 'only', 'also',
]);

const words = (text: string): string[] =>
  text.toLowerCase().match(/[a-z][a-z0-9_.]{2,}/g)?.filter((w) => !STOP.has(w)) ?? [];

const IMPERATIVE = /\b(must|never|always|do not|don't|avoid|prefer|require[sd]?|should|use\b)/i;

/**
 * Terms that identify a skill: ones that appear in it and in few others.
 *
 * Without the rarity weighting every section matches every Android skill on words like
 * "android" and "compose", and the report says nothing.
 */
function distinctive(skills: readonly Skill[]): Map<string, Set<string>> {
  const perSkill = new Map<string, Set<string>>();
  const documents = new Map<string, number>();

  for (const skill of skills) {
    const set = new Set(words(skill.installable));
    perSkill.set(skill.name, set);
    for (const term of set) documents.set(term, (documents.get(term) ?? 0) + 1);
  }

  const limit = Math.max(1, Math.floor(skills.length / 4));
  const out = new Map<string, Set<string>>();
  for (const [name, set] of perSkill) {
    out.set(name, new Set([...set].filter((t) => (documents.get(t) ?? 0) <= limit)));
  }
  return out;
}

const SECRET = [
  { what: 'private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { what: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { what: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { what: 'GitHub token', re: /\bgh[pousr]_[0-9A-Za-z]{36,}\b/ },
  { what: 'Slack token', re: /\bxox[abprs]-[0-9A-Za-z-]{10,}\b/ },
  { what: 'bearer token', re: /\b(?:bearer|authorization)\s*[:=]\s*["']?[A-Za-z0-9._-]{20,}/i },
  { what: 'assignment that looks like a secret', re: /\b(?:api[_-]?key|secret|password|passwd|token|credential)s?\s*[:=]\s*["'][^"'\s]{8,}["']/i },
];

const EXPECTS = [
  { what: 'placement, where new code goes', re: /\b(place|placement|goes in|belongs in|live[s]? in|directory structure|module layout)\b/i },
  { what: 'build, test or lint commands', re: /\b(\.\/gradlew|npm run|pnpm |yarn |make |pytest|cargo )/ },
  { what: 'entry points or flow names', re: /\b(entry point|starts (at|in)|flow|screen|endpoint)\b/i },
];

/**
 * Lines that look like a credential.
 *
 * Shared with the context bundler, where a hit is a hard refusal rather than a warning:
 * a file that reaches a model has left the machine, and there is no taking it back.
 */
export function scanSecrets(text: string): { line: number; what: string }[] {
  const out: { line: number; what: string }[] = [];
  text.split('\n').forEach((line, i) => {
    for (const s of SECRET) {
      if (s.re.test(line)) { out.push({ line: i + 1, what: s.what }); break; }
    }
  });
  return out;
}

export function audit(text: string, skills: readonly Skill[]): AuditReport {
  const secrets = scanSecrets(text);

  const vocab = distinctive(skills);
  const found = sections(text);
  // a file with no headings is still worth auditing, as one section
  const parts: [string, string][] = found.size > 0 ? [...found] : [['(whole file)', text]];

  const reports: SectionReport[] = parts.map(([heading, content]) => {
    const terms = words(content);
    const unique = new Set(terms);
    const overlaps: { skill: string; share: number; terms: string[] }[] = [];

    for (const [name, set] of vocab) {
      const hit = [...unique].filter((t) => set.has(t));
      if (hit.length < 4) continue;
      const share = hit.length / Math.max(unique.size, 1);
      if (share < 0.04) continue;
      overlaps.push({ skill: name, share, terms: hit.slice(0, 8) });
    }
    overlaps.sort((a, b) => b.share - a.share);

    return {
      heading,
      words: content.split(/\s+/).filter(Boolean).length,
      overlaps: overlaps.slice(0, 3),
      noInstruction: !IMPERATIVE.test(content),
    };
  });

  return {
    words: text.split(/\s+/).filter(Boolean).length,
    sections: reports,
    missing: EXPECTS.filter((e) => !e.re.test(text)).map((e) => e.what),
    secrets,
  };
}
