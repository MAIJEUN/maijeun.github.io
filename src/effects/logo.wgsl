// MIJ Studio — glass block logo
// 로고 외곽선을 두께가 있는 유리 블럭으로 돌출(extrude)시키고 레이마칭으로 그립니다.
// 앞뒤 면은 평평하고 모서리는 90°로 각진 블럭. 빛이 블럭에 들어갈 때·나올 때 굴절(나올 때 색별 분산),
// 표면 반사·프레넬, 커서 하이라이트, 바닥의 그림자·커스틱(빛 맺힘)·점 격자.

struct Params {
  res: vec2f,      // 화면 크기 (CSS px)
  center: vec2f,   // 로고 중심 (CSS px)
  light: vec2f,    // 커서 광원 위치 (CSS px)
  axisU: vec4f,    // 블럭의 회전 (로컬 x/y/z 축의 월드 방향)
  axisV: vec4f,
  axisW: vec4f,
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

// ── 조절용 값 (로고 단위: viewBox 128 기준) ──
const DEPTH: f32 = 14.0;        // 블럭 두께의 절반
const IOR: f32 = 1.5;           // 굴절률
const DISPERSION: f32 = 0.03;  // 색 분산 (클수록 무지개 강함)
const TINT: vec3f = vec3f(0.80, 0.93, 0.95); // 유리 색 (두꺼울수록 진해짐)
const PERSPECTIVE: f32 = 4.0;   // 시점 거리 = box × 이 값
const FLOAT: f32 = 0.05;        // 바닥에서 떠 있는 높이 (box 비율)

fn unit() -> f32 { return params.box / 128.0; }

fn sdf2(pl: vec2f) -> f32 {
  let q = pl / params.box + 0.5;
  let inside = clamp(q, vec2f(0.0), vec2f(1.0));
  let t = textureSampleLevel(sdfTex, sdfSampler, inside, 0.0);
  let s = (t.r * 65280.0 + t.g * 255.0) / 65535.0; // 16비트 = r(상위) + g(하위)
  return (s - 0.5) * 2.0 * params.range + length(q - inside) * params.box;
}

// 로컬 좌표의 블럭 SDF: 로고 외곽선을 그대로 돌출 (모서리 90°)
fn sdf3(q: vec3f) -> f32 {
  let d2 = sdf2(q.xy);
  let dz = abs(q.z) - DEPTH * unit();
  return max(d2, dz);
}

// 법선: 앞뒤 면은 정확히 평평하게, 옆면은 외곽선 방향으로.
// 둘 사이 경계는 아주 좁게만 섞어서 모서리가 각지게 보이도록.
fn normal3(q: vec3f) -> vec3f {
  let s = unit();
  let d2 = sdf2(q.xy);
  let dz = abs(q.z) - DEPTH * s;
  let e = 0.9 * s;
  let g = vec2f(sdf2(q.xy + vec2f(e, 0.0)) - sdf2(q.xy - vec2f(e, 0.0)),
                sdf2(q.xy + vec2f(0.0, e)) - sdf2(q.xy - vec2f(0.0, e)));
  let side = vec3f(g / max(length(g), 1e-5), 0.0);
  let face = vec3f(0.0, 0.0, select(-1.0, 1.0, q.z > 0.0));
  let k = smoothstep(-0.3 * s, 0.3 * s, dz - d2);
  return normalize(mix(side, face, k));
}

fn toLocal(v: vec3f) -> vec3f { return vec3f(dot(v, params.axisU.xyz), dot(v, params.axisV.xyz), dot(v, params.axisW.xyz)); }
fn toWorld(v: vec3f) -> vec3f { return params.axisU.xyz * v.x + params.axisV.xyz * v.y + params.axisW.xyz * v.z; }

fn eyePos() -> vec3f { return vec3f(params.center, -params.box * PERSPECTIVE); }
fn pageZ() -> f32 { return DEPTH * unit() + params.box * FLOAT; }

// 바닥(페이지) — 점 격자, 그림자, 커스틱
fn backdrop(q: vec2f, soft: f32) -> vec3f {
  let s = unit();
  let fade = 1.0 - smoothstep(params.box * 0.45, params.box * 1.25, length(q - params.center));

  // 점 격자
  let g = s * 9.0;
  let cell = (q - params.center) / g;
  let dd = length(fract(cell + 0.5) - 0.5) * g;
  // soft: 유리를 거쳐 본 바닥은 살짝 흐리게 (굴절로 늘어난 점이 줄무늬가 되지 않도록)
  let dots = (1.0 - smoothstep(0.55 * s - soft, 0.95 * s + soft, dd)) * 0.16 * fade * (0.95 * s) / (0.95 * s + soft);
  var col = mix(params.bg.rgb, params.fg.rgb, dots);

  // 키 라이트(왼쪽 위 앞) 방향으로 블럭 가운데 면을 찾아 그림자
  let toLight = normalize(vec3f(-0.22, -0.38, -1.0));
  let o = toLocal(vec3f(q, pageZ()) - vec3f(params.center, 0.0));
  let dl = toLocal(toLight);
  let tt = -o.z / dl.z;
  let d = sdf2(o.xy + dl.xy * tt);
  let blur = s * 7.0 + soft;
  let shadow = (1.0 - smoothstep(-blur, blur, d)) * (0.07 + 0.08 * smoothstep(-s * 14.0, 0.0, d));
  col *= 1.0 - shadow * params.intro;

  // 커스틱: 유리를 통과한 빛이 그림자 안쪽 가장자리에 색깔 띠로 맺힘
  let k = vec3f(
    exp(-pow((d + s * 3.0) / (s * 1.6), 2.0)),
    exp(-pow((d + s * 3.8) / (s * 1.6), 2.0)),
    exp(-pow((d + s * 4.6) / (s * 1.6), 2.0)),
  );
  let shimmer = 0.75 + 0.25 * sin(params.time * 1.3 + (o.x + o.y) / (s * 9.0));
  col += k * 0.12 * shimmer * params.intro;
  return col;
}

// 반사되는 스튜디오 환경: 위는 밝고 아래는 어두움 + 소프트박스 + 천천히 지나가는 빛줄기
fn env(r: vec3f) -> vec3f {
  var c = mix(vec3f(0.22), vec3f(0.95), smoothstep(-0.6, 0.7, -r.y));
  let box1 = smoothstep(0.90, 0.99, dot(r, normalize(vec3f(-0.6, -0.55, -0.6))));
  let box2 = smoothstep(0.95, 0.995, dot(r, normalize(vec3f(0.8, -0.1, -0.6))));
  let a = params.time * 0.35;
  let sweep = smoothstep(0.975, 0.998, dot(r, normalize(vec3f(sin(a) * 0.9, -0.25, -0.55))));
  c += vec3f(1.0) * (box1 * 1.1 + box2 * 0.7 + sweep * 1.4);
  return c;
}

// 월드 광선이 바닥에 닿으면 바닥색, 아니면 환경
fn sceneRay(o: vec3f, d: vec3f, soft: f32) -> vec3f {
  if (d.z > 0.02) {
    let t = (pageZ() - o.z) / d.z;
    return backdrop(o.xy + d.xy * t, soft);
  }
  return env(d);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = uv * params.res;
  let px = max(fwidth(p.x), 1e-3); // 화면 픽셀 1개 = CSS px
  let s = unit();
  let E = eyePos();
  let rdW = normalize(vec3f(p, 0.0) - E);

  // 블럭 없는 곳의 바닥
  let base = sceneRay(E, rdW, 0.0);

  // 로컬 공간 광선 + 바운딩 박스
  let C = vec3f(params.center, 0.0);
  let ro = toLocal(E - C);
  let rd = toLocal(rdW);
  let half = vec3f(params.box * 0.5, params.box * 0.5, DEPTH * s);
  let inv = 1.0 / rd;
  let t0 = (-half - ro) * inv;
  let t1 = (half - ro) * inv;
  let tn = max(max(min(t0.x, t1.x), min(t0.y, t1.y)), min(t0.z, t1.z));
  let tf = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z));

  var t = max(tn, 0.0);
  var hit = false;
  var minD = 1e9;
  var tMin = t;
  if (tn < tf) {
    var done = false;
    for (var i = 0; i < 128; i++) {
      if (t > tf) { done = true; break; }
      let d = sdf3(ro + rd * t);
      if (d < minD) { minD = d; tMin = t; }
      if (d < 0.25 * px) { hit = true; break; }
      t += d;
    }
    // 좁은 틈에서 스텝을 다 쓴 경우: 표면에 거의 닿은 것으로 처리
    if (!hit && !done && minD < 2.0 * px) { hit = true; t = tMin; }
  }

  var col = base;
  let cover = select(1.0 - smoothstep(0.0, px, minD), 1.0, hit);
  if (cover > 0.0) {
    let ph = ro + rd * select(tMin, t, hit);
    let n = normal3(ph);
    let nW = toWorld(n);
    let phW = toWorld(ph) + C;

    // 반사
    let refl = sceneRay(phW, reflect(rdW, nW), 2.0 * s);
    let cosv = clamp(dot(-rd, n), 0.0, 1.0);
    let fres = 0.04 + 0.96 * pow(1.0 - cosv, 5.0);

    // 투과: 들어가며 굴절 → 블럭 안을 지나 → 나오며 색별 굴절
    let rIn = refract(rd, n, 1.0 / IOR);
    var t2 = 0.6 * s;
    var exited = false;
    for (var j = 0; j < 64; j++) {
      let d = -sdf3(ph + rIn * t2);
      if (d < 0.25 * px) { exited = true; break; }
      t2 += max(d, 0.12 * s);
    }
    let pe = ph + rIn * t2;
    let ne = normal3(pe);
    let peW = toWorld(pe) + C;
    var trans = vec3f(0.0);
    let oMid = refract(rIn, -ne, IOR);
    if (!exited || dot(oMid, oMid) < 1e-4) {
      // 전반사(빛이 안에서 튕김) — 잡음 대신 부드러운 빛으로
      let r = toWorld(reflect(rIn, -ne));
      trans = mix(params.bg.rgb * 0.7 + 0.15, vec3f(0.92), smoothstep(-0.6, 0.7, -r.y));
    } else {
      for (var k = 0; k < 3; k++) {
        let eta = IOR + (f32(k) - 1.0) * DISPERSION;
        var o = refract(rIn, -ne, eta);
        if (dot(o, o) < 1e-4) { o = oMid; }
        let sc = sceneRay(peW, toWorld(o), 2.5 * s);
        trans[k] = sc[k];
      }
    }
    let absorb = exp(-(t2 / s) * 0.035 * (1.0 - TINT));
    trans *= absorb;

    var glass = mix(trans, refl, fres);

    // 커서 하이라이트
    // 평평한 면에서도 작은 점으로 맺히도록 광원을 멀리 두고 날카롭게
    let L = normalize(vec3f(params.light, -params.box * 5.0) - phW);
    let H = normalize(L - rdW);
    let nh = max(dot(nW, H), 0.0);
    glass += vec3f(pow(nh, 900.0) * 1.8 + pow(nh, 120.0) * 0.12);

    col = mix(base, clamp(glass, vec3f(0.0), vec3f(1.0)), cover * smoothstep(0.0, 1.0, params.intro));
  }
  return vec4f(col, 1.0);
}
