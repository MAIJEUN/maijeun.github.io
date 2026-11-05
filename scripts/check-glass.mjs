// 배포 전 검사: 유리 로고 셰이더가 요구하는 값(Params)이 초기값 목록에 다 있는지.
// GPU 없이 vgpu 의 가상 장치(mock)로 셰이더를 준비하고 effect 를 만들어 봅니다.
import { fileURLToPath } from 'node:url';
import { effect, init, sampler, texture } from 'vgpu/mock';
import { prepareShader } from '@vgpu/wgsl/prepare';
import { resolveShader } from '@vgpu/wgsl/runtime';
import { readFileSync } from 'node:fs';
import { INITIAL_PARAMS } from '../src/effects/glass-params.ts';
import { toLite } from './wgsl-lite.mjs';

const entry = fileURLToPath(new URL('../src/effects/logo.wgsl', import.meta.url));
// 보통 판과 가벼운 판(ARM Mali 등) 둘 다 검사
const shaders = {
  'logo.wgsl': prepareShader((await resolveShader({ entry })).wgsl),
  'logo-lite.wgsl': prepareShader(toLite(readFileSync(entry, 'utf8'))),
};
const gpu = await init();
try {
  const sdfTex = texture(gpu, { kind: '2d', size: [4, 4], format: 'rgba8unorm', usage: ['texture_binding', 'copy_dst'] });
  for (const [name, shader] of Object.entries(shaders)) {
    effect(gpu, shader, { label: name, set: { params: { ...INITIAL_PARAMS }, sdfTex, sdfSampler: sampler(gpu) } });
  }
  console.log('check:glass OK — 셰이더 값과 초기값이 맞습니다 (보통 판·가벼운 판).');
} catch (e) {
  console.error('check:glass 실패 — src/effects/glass-params.ts 의 INITIAL_PARAMS 를 셰이더(logo.wgsl)의 Params 와 맞춰 주세요.');
  console.error(e?.message ?? e);
  process.exitCode = 1;
} finally {
  gpu.dispose();
}
