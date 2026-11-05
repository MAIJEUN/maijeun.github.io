import { defineConfig } from 'astro/config';
import { wgslVitePlugin } from '@vgpu/wgsl/loader-vite';
import { glassLitePlugin } from './scripts/wgsl-lite.mjs';

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
    // glassLitePlugin: 유리 로고 셰이더의 가벼운 판(logo-lite.wgsl)을 logo.wgsl 에서 만들어 줌
    plugins: [glassLitePlugin(), wgslVitePlugin()],
  },
});
