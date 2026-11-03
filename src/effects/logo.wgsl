// MIJ Studio — liquid logo
// 로고의 SDF(거리장) 텍스처를 읽어 가장자리를 노이즈로 일렁이게 하고,
// 마우스 커서를 작은 물방울로 만들어 로고와 끈적하게(smooth union) 합칩니다.
import { simplex3d } from "@vgpu/wgsl-std/noise/simplex";

struct Params {
  res: vec2f,      // 화면 크기 (CSS px)
  mouse: vec2f,    // 물방울 위치 (CSS px)
  center: vec2f,   // 로고 중심 (CSS px)
  box: f32,        // SDF 텍스처가 덮는 정사각형 한 변 (CSS px)
  range: f32,      // 텍스처 값 1.0 이 의미하는 거리 (CSS px)
  time: f32,
  intro: f32,      // 0 → 1 : 등장 애니메이션
  drop: f32,       // 0 → 1 : 커서 물방울 크기
  aa: f32,         // 안티앨리어싱 폭 (CSS px)
  fg: vec4f,
  bg: vec4f,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var sdfTex: texture_2d<f32>;
@group(0) @binding(2) var sdfSampler: sampler;

fn smin(a: f32, b: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

fn logoDistance(p: vec2f) -> f32 {
  let q = (p - params.center) / params.box + 0.5;
  let inside = clamp(q, vec2f(0.0), vec2f(1.0));
  // 0.5 = 가장자리, 0 = 안쪽 끝, 1 = 바깥 끝
  let s = textureSampleLevel(sdfTex, sdfSampler, inside, 0.0).r;
  let d = (s - 0.5) * 2.0 * params.range;
  return d + length(q - inside) * params.box;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = uv * params.res;
  let t = params.time;
  let scale = params.box / 128.0; // 로고 1 단위(viewBox 128 기준)당 px

  var d = logoDistance(p);

  // 가장자리 일렁임
  let n = simplex3d(vec3f(p / (scale * 22.0), t * 0.35));
  d += n * scale * 0.5;

  // 등장: 노이즈 덩어리들이 모여 로고가 됨
  let e = 1.0 - params.intro;
  let n2 = simplex3d(vec3f(p / (scale * 14.0), t * 0.8 + 3.0));
  d += e * e * (scale * 40.0) * (0.75 + 0.45 * n2);

  // 커서 물방울
  let r = params.drop * scale * 7.0;
  let wobble = simplex3d(vec3f((p - params.mouse) / (scale * 6.0), t * 1.4)) * scale * 0.8 * params.drop;
  let dc = length(p - params.mouse) - r + wobble;
  d = smin(d, dc, scale * 16.0 * params.drop + 0.0001);

  let a = 1.0 - smoothstep(-params.aa, params.aa, d);
  let col = mix(params.bg.rgb, params.fg.rgb, a);
  return vec4f(col, 1.0);
}
