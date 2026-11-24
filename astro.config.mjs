import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',
  adapter: netlify(),
  site: 'https://chukwuaugust.tech',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
