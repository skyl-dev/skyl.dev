import { SkylError, TARGETS } from '@skyl/core';
import { add } from './commands/add.ts';
import { list } from './commands/list.ts';
import { scan } from './commands/scan.ts';
import { bold, cyan, dim, err, out, red } from './ui.ts';

const VERSION = '0.0.0';

const HELP = `
  ${bold('skyl')} ${dim('curated agent skills for what your project actually uses')}

  ${bold('skyl scan')}                 read the project and propose an install
  ${bold('skyl add')} <skill...>       install skills and what they require
  ${bold('skyl list')}                 what is installed, and what has moved since

  ${dim('Options')}
    --target <${TARGETS.map((t) => t.id).join('|')}>
    --dir <path>              read skills from a local checkout instead
    --refresh                 prefer the network over the bundled copy
    --json                    machine-readable output (scan)
    -y, --yes                 do not ask before writing
    -C <path>                 run as if in this directory
    -h, --help                -v, --version

  ${dim('Skills are proposed, never installed without asking.')}
`;

interface Parsed {
  command: string | undefined;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parse(argv: readonly string[]): Parsed {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  const takesValue = new Set(['target', 'dir', 'C']);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--') { positional.push(...argv.slice(i + 1)); break; }
    if (arg.startsWith('--')) {
      const [name, inline] = arg.slice(2).split('=', 2) as [string, string | undefined];
      if (inline !== undefined) flags[name] = inline;
      else if (takesValue.has(name)) { flags[name] = argv[i + 1] ?? ''; i += 1; }
      else flags[name] = true;
    } else if (arg.startsWith('-') && arg.length > 1) {
      const short = arg.slice(1);
      if (takesValue.has(short)) { flags[short] = argv[i + 1] ?? ''; i += 1; }
      else for (const c of short) flags[c] = true;
    } else positional.push(arg);
  }
  return { command: positional.shift(), positional, flags };
}

const str = (v: string | boolean | undefined): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

export async function run(argv: readonly string[]): Promise<number> {
  const { command, positional, flags } = parse(argv);

  // version before the no-command case, or `skyl --version` prints help
  if (flags['version'] === true || flags['v'] === true) { out(`skyl ${VERSION}`); return 0; }
  if (flags['help'] === true || flags['h'] === true || command === 'help') { out(HELP); return 0; }
  if (command === undefined) { out(HELP); return 1; }

  const root = str(flags['C']) ?? process.cwd();
  const dir = str(flags['dir']);
  const refresh = flags['refresh'] === true;

  try {
    switch (command) {
      case 'scan':
        return await scan({ root, dir, refresh, json: flags['json'] === true });
      case 'add':
        return await add({ root, names: positional, target: str(flags['target']), dir, refresh, yes: flags['yes'] === true || flags['y'] === true });
      case 'list':
        return await list({ root, dir, refresh });
      default:
        err(`${red('Unknown command')} ${bold(command)}`);
        err(`Try ${cyan('skyl --help')}`);
        return 1;
    }
  } catch (cause) {
    if (cause instanceof SkylError) {
      err(`${red('Error')} ${cause.message}`);
      return 1;
    }
    throw cause;
  }
}
