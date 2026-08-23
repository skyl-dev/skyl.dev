/** Terminal output. Colour only when a terminal is attached and NO_COLOR is unset. */
const on = process.stdout.isTTY === true && !process.env['NO_COLOR'];
const wrap = (code: string) => (s: string) => (on ? `\u001b[${code}m${s}\u001b[0m` : s);

export const bold = wrap('1');
export const dim = wrap('2');
export const green = wrap('32');
export const yellow = wrap('33');
export const red = wrap('31');
export const cyan = wrap('36');

export function out(line = ''): void { process.stdout.write(`${line}\n`); }
export function err(line: string): void { process.stderr.write(`${line}\n`); }

/**
 * A token estimate, shown before anything is written.
 *
 * Deliberately approximate and labelled as such: the real count depends on the model's
 * tokenizer, and a precise-looking number nobody can reproduce is worse than a rough one.
 */
export function tokens(words: number): string {
  return `~${(Math.round((words * 4) / 300) * 100).toLocaleString()} tokens`;
}

export async function confirm(question: string, assumeYes: boolean): Promise<boolean> {
  if (assumeYes) return true;
  if (!process.stdin.isTTY) return false;
  process.stdout.write(`${question} [y/N] `);
  const answer = await new Promise<string>((resolve) => {
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (d) => resolve(String(d)));
    process.stdin.resume();
  });
  process.stdin.pause();
  return /^y(es)?$/i.test(answer.trim());
}
