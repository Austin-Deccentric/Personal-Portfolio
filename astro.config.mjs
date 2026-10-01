import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'static',
  adapter: netlify(),
  // TODO: replace with the real Netlify subdomain once assigned,
  // then redeploy so OG tags and sitemap URLs resolve.
  site: 'https://chukwuaustin.dev',
  integrations: [sitemap()],
});
