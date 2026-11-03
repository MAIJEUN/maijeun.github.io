// MIJ Studio — glass logo
// 로고 SDF(거리장)로 둥근 유리 단면을 만들고, 마우스 방향으로 3D로 기울입니다.
// 굴절(프리즘 분산 포함) · 반사 · 프레넬 · 커서 하이라이트 · 바닥 그림자.

struct Params {
  res: vec2f,      // 화면 크기 (CSS px)
  center: vec2f,   // 로고 중심 (CSS px)
  tilt: vec2f,     // -1..1 : 로고가 바라보는 방향 (마우스 쪽)
  light: vec2f,    // 하이라이트 광원 위치 (CSS px, 보통 커서)
  box: f32,        // SDF 텍스처가 덮는 정사각형 한 변 (CSS px)
  range: f32,      // 텍스처 값 1.0 이 의미하는 거리 (CSS px)
  time: f32,
  intro: f32,      // 0 → 1 : 등장
  fg: vec4f,
  bg: vec4f,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var sdfTex: texture_2d<f32>;
@group(0) @binding(2) var sdfSampler: sampler;

const MAX_TILT: f32 = 0.5;     // 최대 기울기 (≈ 27°)
const PERSPECTIVE: f32 = 4.0;  // 시점 거리 = box × 이 값 (작을수록 원근 강함)

struct Frame { u: vec3f, v: vec3f, n: vec3f, eye: vec3f, c: vec3f }

fn plane() -> Frame {
  // 로고 면의 법선(n)이 마우스 쪽을 바라봄. 화면 쪽(시청자)이 -z.
  let n = normalize(vec3f(params.tilt * MAX_TILT, -1.0));
  let u = normalize(cross(n, vec3f(0.0, 1.0, 0.0)));
  let v = cross(u, n);
  let c = vec3f(params.center, 0.0);
  let eye = vec3f(params.center, -params.box * PERSPECTIVE);
  return Frame(u, v, n, eye, c);
}

// 화면 점 p 에서 나온 시선이 기울어진 로고 면과 만나는 곳 (로고 로컬 좌표, px)
fn toLocal(f: Frame, p: vec2f) -> vec2f {
  let dir = vec3f(p, 0.0) - f.eye;
  let t = dot(f.c - f.eye, f.n) / dot(dir, f.n);
  let h = f.eye + dir * t - f.c;
  return vec2f(dot(h, f.u), dot(h, f.v));
}

fn sdfAt(local: vec2f) -> f32 {
  let q = local / params.box + 0.5;
  let inside = clamp(q, vec2f(0.0), vec2f(1.0));
  let t = textureSampleLevel(sdfTex, sdfSampler, inside, 0.0);
  let s = (t.r * 65280.0 + t.g * 255.0) / 65535.0; // 16비트 = r(상위) + g(하위)
  return (s - 0.5) * 2.0 * params.range + length(q - inside) * params.box;
}

// 바닥(배경) — 기울어진 로고의 부드러운 그림자 포함
fn backdrop(f: Frame, p: vec2f, scale: f32) -> vec3f {
  let shift = vec2f(-params.tilt.x * 6.0, 10.0 - params.tilt.y * 6.0) * scale;
  let d = sdfAt(toLocal(f, p - shift));
  let blur = scale * 7.0;
  let shadow = (1.0 - smoothstep(-blur, blur * 1.4, d)) * 0.16 * params.intro;
  return params.bg.rgb * (1.0 - shadow);
}

// 반사되는 가상의 스튜디오 환경: 위는 밝고 아래는 어두움 + 띠 조명 두 줄
fn env(r: vec3f) -> vec3f {
  let up = -r.y;
  var c = mix(vec3f(0.08), vec3f(0.97), smoothstep(-0.45, 0.55, up));
  let strip1 = smoothstep(0.93, 0.995, dot(r, normalize(vec3f(-0.55, -0.6, -0.58))));
  let strip2 = smoothstep(0.96, 0.998, dot(r, normalize(vec3f(0.75, -0.15, -0.64))));
  c += vec3f(1.0) * (strip1 * 0.9 + strip2 * 0.6);
  return c;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = uv * params.res;
  let scale = params.box / 128.0;
  let f = plane();

  let local = toLocal(f, p);
  let d = sdfAt(local);
  let w = max(fwidth(d), 0.001) * 0.75;

  // SDF 기울기 = 가장자리에서 바깥쪽을 가리키는 방향
  let e = params.box / 128.0;
  let g2 = vec2f(sdfAt(local + vec2f(e, 0.0)) - sdfAt(local - vec2f(e, 0.0)),
                 sdfAt(local + vec2f(0.0, e)) - sdfAt(local - vec2f(0.0, e)));
  let g = g2 / max(length(g2), 1e-5);

  // 둥근 유리 단면 (가장자리에서 bevel 폭만큼 둥글게)
  let bevel = scale * 11.0;
  let s = clamp(-d / bevel, 0.0, 1.0);
  let hgt = sqrt(max(1.0 - (1.0 - s) * (1.0 - s), 0.0));
  let slope = (1.0 - s) / max(hgt, 0.3);
  let nl = normalize(vec3f(g * slope, -1.0));
  let N = normalize(f.u * nl.x + f.v * nl.y + f.n * (-nl.z));

  let hit = f.eye + (vec3f(p, 0.0) - f.eye) * (dot(f.c - f.eye, f.n) / dot(vec3f(p, 0.0) - f.eye, f.n));
  let V = normalize(hit - f.eye);

  // 굴절 — 채널별로 굴절률을 달리해 프리즘 무지개 경계
  let thick = scale * 16.0 * (0.35 + hgt);
  let rr = refract(V, N, 1.0 / 1.42);
  let rg = refract(V, N, 1.0 / 1.47);
  let rb = refract(V, N, 1.0 / 1.53);
  let body = vec3f(
    backdrop(f, p + rr.xy / max(abs(rr.z), 0.6) * thick, scale).r,
    backdrop(f, p + rg.xy / max(abs(rg.z), 0.6) * thick, scale).g,
    backdrop(f, p + rb.xy / max(abs(rb.z), 0.6) * thick, scale).b,
  );
  // 유리의 옅은 색감 (두꺼울수록 조금 더)
  var glass = mix(body, params.fg.rgb, 0.025 + 0.06 * hgt);

  // 반사 + 프레넬
  let R = reflect(V, N);
  let cosv = clamp(dot(-V, N), 0.0, 1.0);
  let fres = 0.04 + 0.96 * pow(1.0 - cosv, 4.0);
  glass = mix(glass, env(R), clamp(fres * 0.9, 0.0, 1.0));

  // 커서 하이라이트 (커서를 광원으로)
  let L = normalize(vec3f(params.light, -params.box * 1.6) - hit);
  let H = normalize(L - V);
  let spec = pow(max(dot(N, H), 0.0), 90.0) * 1.3 + pow(max(dot(N, H), 0.0), 12.0) * 0.12;
  glass += vec3f(spec);

  // 외곽선 살짝 (흰 배경에서도 형태가 보이도록)
  let rim = 1.0 - smoothstep(0.0, scale * 1.6, -d);
  glass = mix(glass, params.fg.rgb, rim * 0.22);

  let a = (1.0 - smoothstep(-w, w, d)) * smoothstep(0.0, 1.0, params.intro);
  let col = mix(backdrop(f, p, scale), clamp(glass, vec3f(0.0), vec3f(1.0)), a);
  return vec4f(col, 1.0);
}
