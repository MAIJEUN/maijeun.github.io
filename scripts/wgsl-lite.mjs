// 유리 로고 셰이더의 가벼운 판 만들기.
// logo.wgsl 에서 '// #full' ~ '// #end' 사이 줄은 빼고, '// #lite ' 로 시작하는 줄은 주석을 풀어 넣음.
// 일부 GPU(ARM Mali 등) 드라이버가 원래 셰이더를 컴파일하다 멈춰서, 그런 기기용으로 작은 셰이더를 따로 둠.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function toLite(src) {
  const out = [];
  let skipping = false;
  for (const line of src.split('\n')) {
    const t = line.trim();
    if (t === '// #full') { skipping = true; continue; }
    if (t === '// #end') { skipping = false; continue; }
    if (skipping) continue;
    const m = line.match(/^(\s*)\/\/ #lite (.*)$/);
    out.push(m ? m[1] + m[2] : line);
  }
  if (skipping) throw new Error('wgsl-lite: "// #full" without matching "// #end"');
  return out.join('\n');
}

/** Vite 플러그인: './logo-lite.wgsl' 을 가져오면 옆의 logo.wgsl 로 가벼운 판을 만들어 줌 (파일은 따로 없음) */
export function glassLitePlugin() {
  return {
    name: 'glass-lite-wgsl',
    enforce: 'pre',
    resolveId(id, importer) {
      if (!id.endsWith('logo-lite.wgsl') || !importer) return null;
      return resolve(dirname(importer), id);
    },
    load(id) {
      if (!id.endsWith('/logo-lite.wgsl')) return null;
      const full = id.replace(/logo-lite\.wgsl$/, 'logo.wgsl');
      this.addWatchFile(full);
      return toLite(readFileSync(full, 'utf8'));
    },
  };
}
