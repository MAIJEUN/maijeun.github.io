import { defineConfig } from 'astro/config';
import { wgslVitePlugin } from '@vgpu/wgsl/loader-vite';

export default defineConfig({
  // GitHub Pages 주소
  site: 'https://maijeun.github.io',
  // 예전 주소는 새 주소로 넘김
  redirects: {
    '/links': '/sns',
  },
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
    },
  },
  vite: {
    plugins: [wgslVitePlugin()],
  },
});
