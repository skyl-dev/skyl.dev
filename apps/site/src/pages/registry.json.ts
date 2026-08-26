import type { APIRoute } from 'astro';
import { loadSkills } from '../lib/registry.ts';

/**
 * What `skyl --refresh` fetches.
 *
 * The same shape the CLI ships inside its own package, so the network path and the
 * offline path cannot diverge: one file, keyed by skill name, holding the raw SKILL.md.
 * Sorted and without a timestamp, so it only changes when a skill does.
 */
export const GET: APIRoute = async () => {
  const skills = await loadSkills();
  const withReferences = skills.filter((s) => s.meta.references.length > 0);
  const body = {
    version: 1,
    skills: Object.fromEntries(
      skills.map((s) => [s.meta.name, s.meta.raw]).sort(([a], [b]) => String(a).localeCompare(String(b))),
    ),
    // a second map rather than a field on each skill, so a CLI written before references
    // existed still reads this file and a CLI written after it still reads an old one
    references: Object.fromEntries(
      withReferences
        .map((s) => [
          s.meta.name,
          Object.fromEntries(s.meta.references.map((r) => [r.file, r.body])),
        ])
        .sort(([a], [b]) => String(a).localeCompare(String(b))),
    ),
  };
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
