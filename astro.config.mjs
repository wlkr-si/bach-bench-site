import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  build: { inlineStylesheets: 'never' },
  adapter: cloudflare({ imageService: 'passthrough' }),
  session: false,
  redirects: { '/results': '/analysis' },
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
});
