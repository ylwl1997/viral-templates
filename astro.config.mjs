// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://viral-templates.pages.dev',
  trailingSlash: 'always',
  integrations: [sitemap()],
});
