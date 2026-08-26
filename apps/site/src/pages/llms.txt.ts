import type { APIRoute } from 'astro';
import { AXIS_ORDER, loadFamilies, loadSkills, tokens } from '../lib/registry.ts';

/**
 * The site, for the thing the site is about.
 *
 * A registry of rules for AI agents whose own pages an agent has to scrape is a bad joke, so
 * this is the llms.txt convention: one plain-text summary, the pages worth reading, and every
 * skill with what it costs. Generated from the registry, so it cannot describe a skill that
 * is not there.
 *
 * It deliberately does not carry the rules themselves. Those are `/registry.json`, which is
 * the machine-readable form and the one the CLI installs from; duplicating them here would
 * give two answers to one question and let them drift.
 */
export const GET: APIRoute = async ({ site }) => {
  const skills = await loadSkills();
  const families = await loadFamilies();
  const url = (path: string) => new URL(path, site).href;
  const rules = skills.reduce((n, s) => n + s.meta.rules.length, 0);

  const lines = [
    '# Skyl',
    '',
    '> A composable registry of rules for AI coding agents. Rules are split along five axes,',
    '> so a project loads the intersection that applies to it rather than one file covering a',
    '> whole domain. Every rule was measured against a model that had not been told it, and',
    '> kept only if that model got it wrong.',
    '',
    `${skills.length} skills and ${rules} rules across ${families.length} ${families.length === 1 ? 'family' : 'families'}.`,
    'Install with `npx skyl.dev scan`, which reads the project and proposes.',
    '',
    '## Machine-readable',
    '',
    `- [Registry](${url('/registry.json')}): every skill as raw SKILL.md, plus the reference files their rules point at. This is what the CLI installs from.`,
    `- [Sitemap](${url('/sitemap.xml')}): every page.`,
    '',
    '## Pages',
    '',
    `- [How it works](${url('/how-it-works')}): the axis model, and what the CLI does and does not do.`,
    `- [Skills](${url('/skills')}): every skill, filterable by family and axis.`,
    `- [Install](${url('/install')}): per agent tool, and what each one can and cannot carry.`,
    `- [Commands](${url('/docs')}): the CLI reference.`,
    `- [Spec](${url('/spec')}): the file format, the axes, and the admission tests.`,
    `- [Evidence](${url('/evidence')}): what was run, and what was found.`,
    `- [About](${url('/about')}): what this is and what it refuses to do.`,
    '',
    '## Skills',
    '',
  ];

  for (const family of families) {
    lines.push(`### ${family.name}`, '');
    const ordered = [...family.skills].sort(
      (a, b) =>
        AXIS_ORDER.indexOf(a.meta.axis) - AXIS_ORDER.indexOf(b.meta.axis) ||
        a.meta.name.localeCompare(b.meta.name),
    );
    for (const s of ordered) {
      const cost = tokens(s.meta.installableWords).toLocaleString();
      lines.push(
        `- [${s.meta.name}](${url(`/skills/${s.meta.family}/${s.meta.skill}`)}): ` +
          `${s.meta.axis} axis, ${s.meta.rules.length} rules, ~${cost} tokens. ${s.meta.description}`,
      );
    }
    lines.push('');
  }

  lines.push(
    '## Notes',
    '',
    '- A rule is admitted because a model gets it wrong unprompted, not because it is true.',
    '- 17 rules have been retired because a control arm already did the right thing.',
    '- The reasoning, pitfalls and evidence behind each rule are not installed. Only rules are.',
    '- Nothing is written to a repository without asking. `--yes` exists for scripts.',
    '',
  );

  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
