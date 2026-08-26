import type { APIRoute } from 'astro';
import { loadSkills } from '../lib/registry.ts';

/**
 * The sitemap, generated rather than integrated.
 *
 * `@astrojs/sitemap` would do this, and would emit the URLs the way the build writes them,
 * `/skills.html`, which is the same mistake the canonical tag was making: a sitemap listing
 * URLs that answer 308 tells a crawler the redirect is the page. Twenty lines here name the
 * URLs the site actually serves, and the skill pages come from the registry, so a family
 * published tomorrow is in the sitemap without anyone remembering to add it.
 */
const STATIC = [
  { path: '/', priority: '1.0' },
  { path: '/skills', priority: '0.9' },
  { path: '/install', priority: '0.9' },
  { path: '/docs', priority: '0.8' },
  { path: '/how-it-works', priority: '0.8' },
  { path: '/starters', priority: '0.7' },
  { path: '/evidence', priority: '0.7' },
  { path: '/spec', priority: '0.6' },
  { path: '/about', priority: '0.6' },
  { path: '/contact', priority: '0.5' },
  { path: '/contributors', priority: '0.4' },
];

export const GET: APIRoute = async ({ site }) => {
  const skills = await loadSkills();
  const entries = [
    ...STATIC,
    ...skills.map((s) => ({ path: `/skills/${s.meta.family}/${s.meta.skill}`, priority: '0.8' })),
  ];

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(({ path, priority }) =>
      `  <url><loc>${new URL(path, site).href}</loc><priority>${priority}</priority></url>`,
    ),
    '</urlset>',
    '',
  ].join('\n');

  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
