import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',
  redirects: { '/results': '/analysis' },
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
});
