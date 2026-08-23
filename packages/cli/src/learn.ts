import { sections } from '@skyl/core';
import type { ContextBundle } from './context.ts';
import { renderContext } from './context.ts';

/**
 * The generated file is a skill like any other, so an installed agent reads it the same
 * way. What makes it different is that nobody can review it against a corpus: it is true
 * of one repository and only the people working there can say whether it is right.
 */
export const LEARNED_NAME = 'project/core';

/** Never overwritten by a refresh. If a refresh can eat hand-written text even once, nobody runs it again. */
export const MANUAL_SECTION = 'Manual';

const INSTRUCTIONS = `You are writing a project knowledge skill for an AI coding agent that will work in this
repository. The context bundle below was selected mechanically, not by a model.

Write **product knowledge**, not code quality advice. What the product is, what its terms mean, what
its parts are called, where things live. A rule about Compose or coroutines belongs in a community
skill and must not appear here.

Include only what you can point at in the bundle:

- **Glossary.** Domain terms and what they mean, with where each is defined. Usually the most
  valuable section, and the one nothing else can supply.
- **Features.** Modules and screens, and what each is called.
- **Entities.** The data model and how the pieces relate.
- **Integrations.** Third party services, and what each is used for.
- **Flows.** Named flows and their entry points, such as "withdrawal starts at WithdrawFragment and
  hits /api/withdraw".
- **Placement.** Where a new screen, a new model, a new test goes.
- **Commands.** Build, test, lint.

Leave out:

- Explanations of how code works. The agent reads the code faster than it reads a summary.
- Architecture justification. One sentence for the choice, none for the argument.
- Anything the installed skills already cover.
- Secrets, credentials, environment structure. If you see one, say so and do not copy it.

**Ask rather than assert.** Anything you cannot observe in the bundle is a question, never a claim.
Collect the questions at the end of the file under \`## Questions\`, each as a line ending in
\`<!-- unanswered -->\`. A business rule you inferred from a status enum is a question. This is the
part that keeps the file from decaying: it improves each run instead of drifting.

Output one markdown file and nothing else. No preamble, no explanation of what you did. Start at the
frontmatter and use this shape:

\`\`\`
---
name: project/core
axis: topic
family: project
version: 1.0.0
agent_sections: [rules]
generated: <date>
---

## Rules

- **PROJ-1** \`must\`: <instruction>
  *Why:* <the failure it prevents>
  *Not when:* <the boundary>

## Glossary
...
## Questions
- Can a withdrawal be cancelled after PROCESSING? <!-- unanswered -->
\`\`\`
`;

export function learnPrompt(bundle: ContextBundle, keep: { manual?: string; questions?: string }): string {
  const parts = [INSTRUCTIONS];

  if (keep.manual) {
    parts.push(`\n## Text to carry over unchanged\n\nThis was written by hand. Reproduce it verbatim as a \`## ${MANUAL_SECTION}\` section, and do not
edit, summarise, or reorder it.\n\n\`\`\`\n${keep.manual}\n\`\`\`\n`);
  }
  if (keep.questions) {
    parts.push(`\n## Questions still open from the last run\n\nCarry any that are still unanswered. Drop one only if the bundle now answers it.\n\n\`\`\`\n${keep.questions}\n\`\`\`\n`);
  }

  parts.push('\n---\n');
  parts.push(renderContext(bundle));
  return parts.join('\n');
}

/** What a refresh has to preserve out of the file that is already there. */
export function preserved(existing: string | undefined): { manual?: string; questions?: string } {
  if (!existing) return {};
  const found = sections(existing);
  const manual = found.get(MANUAL_SECTION);
  const questions = found.get('Questions');
  return {
    ...(manual ? { manual } : {}),
    ...(questions ? { questions: questions.split('\n').filter((l) => l.includes('<!-- unanswered -->')).join('\n') } : {}),
  };
}

/**
 * Take the markdown back out of whatever the agent printed.
 *
 * Headless CLIs vary in how much they wrap the answer, and a fenced block around the
 * whole file is the common case. Anything before the frontmatter is dropped.
 */
export function extractMarkdown(output: string): string | undefined {
  const fenced = /```(?:markdown|md)?\n([\s\S]*?)```/.exec(output);
  const text = (fenced?.[1] ?? output).trim();
  const start = text.indexOf('---');
  if (start < 0) return undefined;
  return `${text.slice(start).trim()}\n`;
}

/** Put back what the model was told to carry, in case it did not. */
export function reattach(generated: string, keep: { manual?: string; questions?: string }): string {
  let out = generated;
  const found = sections(out);
  if (keep.manual && !found.has(MANUAL_SECTION)) {
    out = `${out.trimEnd()}\n\n## ${MANUAL_SECTION}\n\n${keep.manual}\n`;
  }
  if (keep.questions) {
    const already = found.get('Questions') ?? '';
    const missing = keep.questions.split('\n').filter((q) => q.trim() !== '' && !already.includes(q.trim()));
    if (missing.length > 0) {
      out = found.has('Questions')
        ? out.replace(/^## Questions$/m, `## Questions\n\n${missing.join('\n')}`)
        : `${out.trimEnd()}\n\n## Questions\n\n${missing.join('\n')}\n`;
    }
  }
  return out;
}

/**
 * A header that travels with the file into the repository.
 *
 * Docs nobody opens cannot carry this warning. The file itself can, and the agent reading
 * it sees the date and can treat old content with the suspicion it deserves.
 */
export function caution(date: string, sha: string | undefined): string {
  return `<!--\nGenerated by \`skyl learn\` on ${date}${sha ? ` from commit ${sha}` : ''}.\nPartly inferred from the repository. Correct anything wrong.\nText under \`## ${MANUAL_SECTION}\` is written by hand and is preserved across refreshes.\n-->`;
}

/**
 * The caution goes after the frontmatter, not before it.
 *
 * A skill file starts at `---` and a parser that finds anything else gives up, so putting
 * the comment first would make the generated file the one skill nothing can read.
 */
export function withCaution(markdown: string, date: string, sha: string | undefined): string {
  const note = caution(date, sha);
  const end = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(markdown);
  if (!end) return `${note}\n\n${markdown}`;
  return `${markdown.slice(0, end[0].length)}\n${note}\n${markdown.slice(end[0].length)}`;
}
