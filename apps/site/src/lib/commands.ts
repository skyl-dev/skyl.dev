/**
 * The CLI, documented once.
 *
 * Written here rather than scraped from `--help`, because help text is a reminder for
 * someone who already knows what they want and documentation has to explain why the
 * command exists. The examples are all real and all runnable.
 */
export interface Flag {
  readonly flag: string;
  readonly says: string;
}

export interface CommandDoc {
  readonly name: string;
  readonly usage: string;
  readonly summary: string;
  readonly group: 'install' | 'current' | 'yours' | 'authoring';
  readonly body: readonly string[];
  readonly flags?: readonly Flag[];
  readonly examples?: readonly { readonly run: string; readonly does: string }[];
}

export const GROUPS: Record<CommandDoc['group'], string> = {
  install: 'Getting skills in',
  current: 'Keeping them current',
  yours: 'Your own files',
  authoring: 'Authoring',
};

export const COMMANDS: readonly CommandDoc[] = [
  {
    name: 'scan',
    usage: 'skyl scan',
    summary: 'Read the project and propose an install.',
    group: 'install',
    body: [
      'Reads build files as text rather than invoking a build. That is instant, works on a project that does not currently compile, and needs no toolchain installed. The cost is that a dependency assembled at runtime from variables is missed, which is why scan proposes and never installs on its own.',
      'It prints what it matched on, what it considered and rejected, and the token cost, before anything is written. Running it again is safe: it shows what is already installed, what is new, and what is no longer detected because a dependency was dropped.',
    ],
    flags: [
      { flag: '--json', says: 'machine-readable output, for a script or a CI check' },
      { flag: '--dir <path>', says: 'read skills from a local checkout instead of the bundled registry' },
      { flag: '--refresh', says: 'prefer the network over the copy shipped in the package' },
      { flag: '-C <path>', says: 'run as if in this directory' },
    ],
    examples: [
      { run: 'npx skyl.dev scan', does: 'propose an install for the current project' },
      { run: 'npx skyl.dev scan --json', does: 'the same, as JSON' },
    ],
  },
  {
    name: 'add',
    usage: 'skyl add <skill...>',
    summary: 'Install skills and everything they require.',
    group: 'install',
    body: [
      'Resolves requires and orders dependencies first, because sections are concatenated in the order written and a layer that refers to its core reads wrong if it lands first.',
      'Bare names work once a family has been named, so `add android/core kotlin compose` resolves inside android. An ambiguous bare name is an error rather than a guess: silently picking one of two families installs the wrong thing and looks like it worked.',
      'Only the sections named by agent_sections are written. The reasoning, the pitfalls and the evidence stay in the registry for a human to read and never reach the model.',
    ],
    flags: [
      { flag: '--target <name>', says: 'claude, cursor, windsurf, continue or agents' },
      { flag: '-y, --yes', says: 'do not ask before writing' },
      { flag: '--dir <path>', says: 'install from a local checkout' },
    ],
    examples: [
      { run: 'npx skyl.dev add android/core kotlin compose', does: 'three layers, dependencies first' },
      { run: 'npx skyl.dev add compose --target cursor', does: 'write .cursor/rules/ instead' },
    ],
  },
  {
    name: 'remove',
    usage: 'skyl remove <skill...>',
    summary: 'Take skills back out.',
    group: 'install',
    body: [
      'Refuses to orphan a dependency. If something still installed requires the skill being removed, that other skill is left citing rules the agent will not have, which is worse than either keeping both or removing both.',
    ],
    examples: [{ run: 'npx skyl.dev remove compose', does: 'remove it, and refuse if something needs it' }],
  },
  {
    name: 'list',
    usage: 'skyl list',
    summary: 'What is installed, and what has moved since.',
    group: 'current',
    body: [
      'Reads skyl.lock and compares it against both the files on disk and the registry. It reports a local edit and an upstream change differently, because the fix differs: one is your work to keep, the other is ours to offer.',
    ],
  },
  {
    name: 'diff',
    usage: 'skyl diff [skill...]',
    summary: 'What changed here, and what changed upstream.',
    group: 'current',
    body: [
      'A line diff between the file in your repository and what the registry would write today. Read-only. It prefers the network, because currency is the entire point of asking.',
    ],
    flags: [{ flag: '--full', says: 'the whole file rather than hunks' }],
  },
  {
    name: 'update',
    usage: 'skyl update [skill...]',
    summary: 'Apply the upstream side, keeping local edits.',
    group: 'current',
    body: [
      'Three cases, handled differently. Upstream moved and the file is untouched: it applies. The file was edited here and upstream did not move: it is left alone. Both moved: it stops, shows the diff, and requires --force, which is the only way to lose the edits.',
      'A version bump that changes nothing installed, a patch that only touched a human-facing section, is recorded in the lockfile and not rewritten. Otherwise every patch release would report an update to something that did not change.',
    ],
    flags: [
      { flag: '--force', says: 'take the upstream side of a conflict' },
      { flag: '--diff', says: 'show what will change before asking' },
    ],
  },
  {
    name: 'audit',
    usage: 'skyl audit [file]',
    summary: 'Read a hand-written CLAUDE.md and say what is in it.',
    group: 'yours',
    body: [
      'Analysis, never rewriting. Prose passed through a model comes back longer and more generic, and the file being audited is usually one somebody tuned by hand over months.',
      'It reports which sections share vocabulary with skills in the registry, and always prints the words it matched on, because a claim of overlap that cannot be checked is worth nothing. It also flags sections with no instruction in them, lists what a context file is expected to carry and does not, and refuses to stay quiet about anything that looks like a credential.',
      'It does not claim to find contradictions. That needs a model, and a confident wrong answer about your file is worse than no answer.',
    ],
    examples: [{ run: 'npx skyl.dev audit', does: 'find and read the obvious candidates' }],
  },
  {
    name: 'context',
    usage: 'skyl context',
    summary: 'Emit what a model needs to describe this project.',
    group: 'yours',
    body: [
      'Selects files by rule: documentation and schema above code, entry points, dependency wiring, shared foundations, one representative per layer, plus the full tree. Deterministic, so the same repository produces the same bundle and you can review it before it goes anywhere.',
      'A file containing something that looks like a credential is withheld rather than masked. What leaves cannot come back.',
    ],
    flags: [
      { flag: '--dry-run', says: 'list what would be sent, and send nothing' },
      { flag: '--json', says: 'the bundle as structured data' },
      { flag: '--out <file>', says: 'write to a file instead of stdout' },
    ],
    examples: [{ run: 'npx skyl.dev context --dry-run', does: 'see the selection before trusting it' }],
  },
  {
    name: 'learn',
    usage: 'skyl learn',
    summary: 'Derive a project knowledge skill from this repository.',
    group: 'yours',
    body: [
      'Product knowledge, not code quality: what the product is, what its terms mean, what its parts are called, where things go. The one kind of context a community registry can never supply.',
      'There is no API key anywhere in it. Selecting the files, preserving your hand-written text and merging the result happen locally; the reading is done by whichever model you already pay for, through --agent, or by pasting what --print-prompt gives you.',
      'Anything the model cannot observe becomes a question rather than a claim, marked in the file so it resurfaces on the next run. Text under ## Manual is yours and is never overwritten, because a refresh that eats hand-written rules once is a refresh nobody runs again.',
    ],
    flags: [
      { flag: '--agent <cmd>', says: 'pipe the prompt to an agent CLI, for example claude' },
      { flag: '--print-prompt', says: 'print it instead, to paste anywhere' },
      { flag: '--out <file>', says: 'write the prompt to a file' },
    ],
    examples: [
      { run: 'npx skyl.dev learn --agent claude', does: 'use your own Claude Code login' },
      { run: 'npx skyl.dev learn --print-prompt', does: 'paste it into any model you like' },
    ],
  },
  {
    name: 'lint',
    usage: 'skyl lint [path...]',
    summary: 'Check skills against the spec.',
    group: 'authoring',
    body: [
      'Frontmatter, rule shape, id stability, retired ids never reused, cross-references that resolve, and the sections a shipped skill is expected to carry. It also flags wording a reader cannot decide, since a rule nobody can check is a rule nobody can follow.',
      'Run it before opening a pull request. The registry runs an independent second validator in CI, and a disagreement between the two fails the build rather than passing quietly.',
    ],
    flags: [{ flag: '--strict', says: 'warnings fail the run' }],
    examples: [{ run: 'npx skyl.dev lint skills', does: 'check a whole registry checkout' }],
  },
];
