import { defineConfig } from 'astro/config';
import { wgslVitePlugin } from '@vgpu/wgsl/loader-vite';

export default defineConfig({
  // GitHub Pages 주소
  site: 'https://maijeun.github.io',
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
    },
  },
  vite: {
    plugins: [wgslVitePlugin()],
  },
});
