import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { scanSecrets, type ProjectSignals } from '@skyl/core';
import { loadIgnore } from './ignore.ts';
import { scanProject } from './scan.ts';

/**
 * Select what a model needs to describe this product, and nothing else.
 *
 * Everything here is deterministic: which files, in what order, under what budget. That
 * is the part worth owning, because the model that reads the bundle belongs to the user
 * and can be any of them. A bundle that is reproducible can be reviewed before it is
 * sent, which is the whole reason `--dry-run` exists.
 */
export interface Picked {
  readonly path: string;
  readonly why: string;
  readonly bytes: number;
}

export interface ContextBundle {
  readonly root: string;
  readonly tree: string;
  readonly signals: ProjectSignals;
  readonly installed: readonly string[];
  readonly files: readonly (Picked & { readonly text: string; readonly truncated: boolean })[];
  /** Files that were chosen and then refused, with the reason. */
  readonly withheld: readonly { readonly path: string; readonly why: string }[];
}

const MAX_FILES = 40;
const MAX_BYTES_PER_FILE = 16_000;
const MAX_TOTAL_BYTES = 400_000;
const SKIP_DIRS = new Set(['node_modules', 'build', '.git', '.gradle', '.idea', 'dist', 'out', 'target', 'vendor', '.next', '.venv']);

const DOC = /\.(md|mdx|adoc|rst)$/i;
const SCHEMA = /\.(sql|graphql|gql|prisma|proto)$/i;
const CODE = /\.(kt|kts|java|swift|ts|tsx|js|jsx|py|go|rb|rs|php|cs|dart|vue|svelte)$/i;
const LOCKISH = /(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Podfile\.lock|\.min\.js|\.map)$/i;

/**
 * Why a file is worth a slot, highest first.
 *
 * Documents outrank code deliberately. A README or an ADR states what the product is
 * meant to do; code only shows what it currently does, and the gap between those two is
 * exactly the knowledge that cannot be recovered by reading source.
 */
const REASONS: readonly { why: string; test: (path: string, base: string) => boolean; weight: number }[] = [
  { why: 'documentation', weight: 100, test: (p, b) => DOC.test(b) && !/changelog|license|contributing|code_of_conduct/i.test(b) && (p.split('/').length <= 3 || /docs?\//i.test(p)) },
  { why: 'schema', weight: 90, test: (_p, b) => SCHEMA.test(b) },
  // `AppModule.kt` starts like an entry point and is wiring, so the exclusion is explicit
  { why: 'entry point', weight: 80, test: (_p, b) => (/^(Main|App|Application|index|main)[A-Za-z]*\.(kt|java|ts|tsx|js|jsx|py|go|swift|dart)$/.test(b) && !/(Module|Component|Config|Test)\./.test(b)) || /Activity\.(kt|java)$/.test(b) },
  { why: 'dependency wiring', weight: 70, test: (p, b) => /(Module|Component|Injection|di)\.(kt|java|ts)$/.test(b) || /\/di\//.test(p) },
  { why: 'shared foundation', weight: 60, test: (p) => /(^|\/)(core|common|base|shared|lib)\//i.test(p) },
  { why: 'navigation or routing', weight: 55, test: (_p, b) => /(Nav|Navigation|Router|Routes|Screen)[A-Za-z]*\.(kt|java|ts|tsx)$/.test(b) },
  { why: 'data model', weight: 50, test: (p, b) => /(Entity|Dto|Model|Repository|Dao|Api|Service)\.(kt|java|ts)$/.test(b) || /\/(model|domain|entity)\//i.test(p) },
  { why: 'configuration', weight: 40, test: (_p, b) => /^(build\.gradle(\.kts)?|settings\.gradle(\.kts)?|libs\.versions\.toml|package\.json|pyproject\.toml|Cargo\.toml|go\.mod|Makefile|docker-compose\.ya?ml)$/.test(b) },
];

async function walk(root: string, ignore: Awaited<ReturnType<typeof loadIgnore>>): Promise<{ path: string; bytes: number }[]> {
  const out: { path: string; bytes: number }[] = [];
  const step = async (dir: string, depth: number): Promise<void> => {
    if (depth > 8) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.github') continue;
      const full = join(dir, entry.name);
      const rel = relative(root, full).split(sep).join('/');
      if (ignore.ignored(rel, entry.isDirectory())) continue;
      if (entry.isDirectory()) await step(full, depth + 1);
      else if (!LOCKISH.test(entry.name)) {
        const info = await stat(full).catch(() => undefined);
        if (info) out.push({ path: rel, bytes: info.size });
      }
    }
  };
  await step(root, 0);
  return out;
}

/**
 * The tree, always included: it is the cheapest thing in the bundle and often the most
 * informative, because file names carry the vocabulary of the product.
 *
 * File names are listed, not just directories. `WithdrawRequest.kt` and `PkBattleScreen.kt`
 * say what the product is about; a count of files in a directory says nothing.
 */
export function renderTree(paths: readonly string[], limit = 500, perDirectory = 12): string {
  const byDir = new Map<string, string[]>();
  for (const p of paths) {
    const at = p.lastIndexOf('/');
    const dir = at < 0 ? '' : p.slice(0, at);
    (byDir.get(dir) ?? byDir.set(dir, []).get(dir)!).push(p.slice(at + 1));
    for (let d = dir; d.includes('/'); d = d.slice(0, d.lastIndexOf('/'))) {
      if (!byDir.has(d.slice(0, d.lastIndexOf('/')))) byDir.set(d.slice(0, d.lastIndexOf('/')), []);
    }
    if (dir !== '' && !byDir.has('')) byDir.set('', []);
  }

  const lines: string[] = [];
  let shown = 0;
  for (const dir of [...byDir.keys()].sort()) {
    const depth = dir === '' ? 0 : dir.split('/').length;
    if (dir !== '') lines.push(`${'  '.repeat(depth - 1)}${dir.split('/').pop()}/`);
    const files = byDir.get(dir)!.sort();
    for (const file of files.slice(0, perDirectory)) {
      if (shown >= limit) break;
      lines.push(`${'  '.repeat(depth)}${file}`);
      shown += 1;
    }
    if (files.length > perDirectory) lines.push(`${'  '.repeat(depth)}... ${files.length - perDirectory} more files`);
    if (shown >= limit) { lines.push(`... ${paths.length - shown} more files`); break; }
  }
  return lines.join('\n');
}

export async function buildContext(
  root: string,
  opts: { installed?: readonly string[]; maxFiles?: number } = {},
): Promise<ContextBundle> {
  const ignore = await loadIgnore(root);
  const all = await walk(root, ignore);

  const scored: (Picked & { weight: number })[] = [];
  for (const file of all) {
    const base = file.path.split('/').pop()!;
    const reason = REASONS.find((r) => r.test(file.path, base));
    if (!reason) continue;
    if (!DOC.test(base) && !SCHEMA.test(base) && !CODE.test(base) && reason.why !== 'configuration') continue;
    scored.push({ path: file.path, why: reason.why, bytes: file.bytes, weight: reason.weight });
  }

  // largest first within a reason, as a rough proxy for how central a file is
  scored.sort((a, b) => b.weight - a.weight || b.bytes - a.bytes);

  const limit = opts.maxFiles ?? MAX_FILES;
  const files: (Picked & { text: string; truncated: boolean })[] = [];
  const withheld: { path: string; why: string }[] = [];
  let total = 0;

  for (const pick of scored) {
    if (files.length >= limit || total >= MAX_TOTAL_BYTES) break;
    const text = await readFile(join(root, pick.path), 'utf8').catch(() => undefined);
    if (text === undefined) continue;

    // a credential in a file is a refusal, not a warning: what leaves cannot come back
    const secrets = scanSecrets(text);
    if (secrets.length > 0) {
      withheld.push({ path: pick.path, why: `${secrets[0]!.what} on line ${secrets[0]!.line}` });
      continue;
    }

    const truncated = text.length > MAX_BYTES_PER_FILE;
    const body = truncated ? `${text.slice(0, MAX_BYTES_PER_FILE)}\n... truncated` : text;
    total += body.length;
    files.push({ path: pick.path, why: pick.why, bytes: pick.bytes, text: body, truncated });
  }

  return {
    root,
    tree: renderTree(all.map((f) => f.path)),
    signals: await scanProject(root),
    installed: opts.installed ?? [],
    files,
    withheld,
  };
}

/** The bundle as one markdown document, which is what a model is handed. */
export function renderContext(bundle: ContextBundle): string {
  const parts: string[] = [];
  parts.push('# Project context bundle\n');
  parts.push(`Collected by \`skyl context\` from \`${bundle.root}\`. Files were selected by rule, not by a model.\n`);

  parts.push('## Directory tree\n');
  parts.push('```\n' + bundle.tree + '\n```\n');

  const signals = Object.entries(bundle.signals).filter(([, v]) => v.length > 0);
  if (signals.length > 0) {
    parts.push('## What the build declares\n');
    for (const [key, values] of signals) {
      parts.push(`**${key}**\n`);
      parts.push(values.map((v) => `- ${v}`).join('\n') + '\n');
    }
  }

  if (bundle.installed.length > 0) {
    parts.push('## Skills already installed\n');
    parts.push('Do not restate anything these cover.\n');
    parts.push(bundle.installed.map((s) => `- ${s}`).join('\n') + '\n');
  }

  parts.push('## Files\n');
  for (const file of bundle.files) {
    parts.push(`### ${file.path}\n`);
    parts.push(`_selected as ${file.why}${file.truncated ? ', truncated' : ''}_\n`);
    parts.push('```\n' + file.text.replace(/```/g, '``​`') + '\n```\n');
  }

  if (bundle.withheld.length > 0) {
    parts.push('## Withheld\n');
    parts.push('These matched the selection rules and were not included.\n');
    parts.push(bundle.withheld.map((w) => `- ${w.path}, ${w.why}`).join('\n') + '\n');
  }

  return parts.join('\n');
}
