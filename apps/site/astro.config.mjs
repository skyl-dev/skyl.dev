// @ts-check
import { defineConfig } from 'astro/config';

/**
 * Static output, deployed to Cloudflare Pages.
 *
 * There is no server and there should not be: the whole site is a rendering of a git
 * repository, so anything dynamic would be a cache of something already static. That is
 * also what keeps a broken skill from breaking a deploy, since the content is validated
 * where it lives rather than here.
 */
export default defineConfig({
  site: 'https://skyl.dev',
  trailingSlash: 'never',
  build: { format: 'file' },
  devToolbar: { enabled: false },
});
