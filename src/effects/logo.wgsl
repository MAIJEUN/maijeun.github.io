// MAIJEUN — glass block logo
// 로고 외곽선을 두께가 있는 유리 블럭으로 돌출(extrude)시키고 레이마칭으로 그립니다.
// 외곽은 90°로 각진 블럭이고, 앞뒤 면은 애플 리퀴드 글래스처럼 가운데는 평평하고 가장자리만 렌즈처럼 휘어
// 뒤가 크게 굴절돼 보입니다. 빛이 들어갈 때·나올 때 굴절(나올 때 색별 분산), 선명한 스튜디오 반사·프레넬,
// 커서 쪽 가장자리에 맺히는 가는 빛선(림 라이트), 바닥의 그림자·커스틱(빛 맺힘)·점 격자.
// 점 격자는 사이트 전체 배경(CSS)이 그리고, 이 셰이더는 유리 너머로 보이는 점과 그림자·커스틱만 그림.

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
  solid: f32,      // 1 = 평면 단색 로고(SVG와 똑같이), 0 = 유리. 페이지 전환 때 이어지게
  thick: f32,      // 두께 비율 0 → 1 (0이면 종이처럼 얇음)
  bgA: f32,        // 바닥의 그림자·커스틱 세기. 1 = 홈 화면, 0 = 로고만 (다른 페이지 위를 날아갈 때)
  aa: f32,         // 1 = 모서리 안티앨리어싱 켬, 0 = 끔 (날아가는 동안 가볍게)
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
const TINT: vec3f = vec3f(0.90, 0.96, 0.97); // 유리 색 (두꺼울수록 진해짐)
const PERSPECTIVE: f32 = 4.0;   // 시점 거리 = box × 이 값
const FLOAT: f32 = 0.05;        // 바닥에서 떠 있는 높이 (box 비율)
const AA_SAMPLES: i32 = 4;      // 모서리 안티앨리어싱 (0 = 끔, 가벼워짐)
const LENS_WIDTH: f32 = 7.0;    // 리퀴드 글래스: 면 가장자리에서 렌즈처럼 휘는 폭
const LENS: f32 = 1.1;          // 리퀴드 글래스: 가장자리 휨 세기 (클수록 굴절 강함)
const RIM_WIDTH: f32 = 1.3;     // 가장자리 빛선 두께
const RIM_STRENGTH: f32 = 0.9;  // 가장자리 빛선 밝기
const GLASS_LIFT: f32 = 0.06;   // 유리 몸통을 살짝 밝게 띄움 (리퀴드 글래스의 뿌연 빛)

fn unit() -> f32 { return params.box / 128.0; }
fn halfDepth() -> f32 { return DEPTH * unit() * max(params.thick, 0.02); }

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
  let dz = abs(q.z) - halfDepth();
  return max(d2, dz);
}

// 외곽선의 바깥 방향 (2D)
fn grad2(pl: vec2f) -> vec2f {
  let e = 0.9 * unit();
  let g = vec2f(sdf2(pl + vec2f(e, 0.0)) - sdf2(pl - vec2f(e, 0.0)),
                sdf2(pl + vec2f(0.0, e)) - sdf2(pl - vec2f(0.0, e)));
  return g / max(length(g), 1e-5);
}

// 앞뒤 면 쪽인지(1) 옆면 쪽인지(0). 경계는 아주 좁게만 섞어서 모서리가 각지게 보이도록.
fn faceAmount(q: vec3f) -> f32 {
  let s = unit();
  return smoothstep(-0.3 * s, 0.3 * s, (abs(q.z) - halfDepth()) - sdf2(q.xy));
}

// 법선: 옆면은 외곽선 방향. 앞뒤 면은 가운데는 평평하고 가장자리 LENS_WIDTH 안쪽만 바깥으로 휘어짐 (리퀴드 글래스)
fn normal3(q: vec3f) -> vec3f {
  let s = unit();
  let d2 = sdf2(q.xy);
  let g = grad2(q.xy);
  let side = vec3f(g, 0.0);
  let face = vec3f(0.0, 0.0, select(-1.0, 1.0, q.z > 0.0));
  let rimT = clamp(1.0 + d2 / (LENS_WIDTH * s), 0.0, 1.0);
  let lensFace = normalize(face + vec3f(g * LENS * rimT * rimT, 0.0));
  return normalize(mix(side, lensFace, faceAmount(q)));
}

fn toLocal(v: vec3f) -> vec3f { return vec3f(dot(v, params.axisU.xyz), dot(v, params.axisV.xyz), dot(v, params.axisW.xyz)); }
fn toWorld(v: vec3f) -> vec3f { return params.axisU.xyz * v.x + params.axisV.xyz * v.y + params.axisW.xyz * v.z; }

fn eyePos() -> vec3f { return vec3f(params.center, -params.box * PERSPECTIVE); }
fn pageZ() -> f32 { return DEPTH * unit() + params.box * FLOAT; }

// 바닥(페이지) 점 격자 — 사이트 전체 배경(global.css 의 body::before)과 똑같이: 캔버스 왼쪽 위 기준
// DOT_GAP 간격, 칸 가운데에 반지름 DOT_R0~DOT_R1 로 흐려지는 점, 글자색을 DOT_INK 만큼 섞은 색
const DOT_GAP: f32 = 22.0;
const DOT_R0: f32 = 1.35;
const DOT_R1: f32 = 2.35;
const DOT_INK: f32 = 0.16;

// 바닥 위 한 점이 화면(z = 0)에서는 어디로 보이는지 — 점 격자를 화면 배경과 같은 자리에 맞추기 위해
fn floorToScreen(q: vec2f) -> vec2f {
  let e = params.box * PERSPECTIVE;
  return params.center + (q - params.center) * e / (pageZ() + e);
}

fn dotAmount(q: vec2f, soft: f32) -> f32 {
  let p = floorToScreen(q);
  let dd = length(fract(p / DOT_GAP) - 0.5) * DOT_GAP;
  // soft: 유리를 거쳐 본 바닥은 살짝 흐리게 (굴절로 늘어난 점이 줄무늬가 되지 않도록)
  return (1.0 - smoothstep(DOT_R0 - soft, DOT_R1 + soft, dd)) * DOT_INK * DOT_R1 / (DOT_R1 + soft);
}

// 블럭이 바닥에 드리우는 빛: rgb = 더해지는 커스틱, a = 그림자 진하기
fn floorLight(q: vec2f, soft: f32) -> vec4f {
  let s = unit();
  // 키 라이트(왼쪽 위 앞) 방향으로 블럭 가운데 면을 찾아 그림자
  let toLight = normalize(vec3f(-0.22, -0.38, -1.0));
  let o = toLocal(vec3f(q, pageZ()) - vec3f(params.center, 0.0));
  let dl = toLocal(toLight);
  let tt = -o.z / dl.z;
  let d = sdf2(o.xy + dl.xy * tt);
  let blur = s * 7.0 + soft;
  let shadow = (1.0 - smoothstep(-blur, blur, d)) * (0.07 + 0.08 * smoothstep(-s * 14.0, 0.0, d));
  let on = params.intro * (1.0 - params.solid);

  // 커스틱: 유리를 통과한 빛이 그림자 안쪽 가장자리에 색깔 띠로 맺힘
  let k = vec3f(
    exp(-pow((d + s * 3.0) / (s * 1.6), 2.0)),
    exp(-pow((d + s * 3.8) / (s * 1.6), 2.0)),
    exp(-pow((d + s * 4.6) / (s * 1.6), 2.0)),
  );
  let shimmer = 0.75 + 0.25 * sin(params.time * 1.3 + (o.x + o.y) / (s * 9.0));
  return vec4f(k * 0.12 * shimmer * on, shadow * on);
}

// 바닥 색 (유리를 거쳐 보이는 곳): 점 격자 위에 그림자·커스틱
fn backdrop(q: vec2f, soft: f32) -> vec3f {
  let l = floorLight(q, soft);
  return mix(params.bg.rgb, params.fg.rgb, dotAmount(q, soft)) * (1.0 - l.a) + l.rgb;
}

fn rect(az: f32, el: f32, c: vec2f, h: vec2f, soft: f32) -> f32 {
  return (1.0 - smoothstep(h.x - soft, h.x + soft, abs(az - c.x))) *
         (1.0 - smoothstep(h.y - soft, h.y + soft, abs(el - c.y)));
}

// 반사되는 스튜디오 환경. 유리답게 경계가 또렷한 조명(소프트박스·세로 띠)과 어두운 바닥/밝은 위쪽.
// 커서를 움직이면 조명 방향도 살짝 따라 돌아서 반사가 미끄러짐.
fn env(r: vec3f) -> vec3f {
  let az = atan2(r.x, -r.z) + (params.light.x - params.center.x) / params.res.x * 0.9;
  let el = asin(clamp(-r.y, -1.0, 1.0)) - (params.light.y - params.center.y) / params.res.y * 0.6;
  var c = mix(vec3f(0.03), vec3f(0.16), smoothstep(-0.04, 0.04, el)); // 지평선
  c += vec3f(0.22) * smoothstep(0.1, 1.3, el);
  c += vec3f(1.7) * rect(az, el, vec2f(-0.55, 0.55), vec2f(0.40, 0.16), 0.02); // 왼쪽 위 큰 조명
  c += vec3f(1.3) * rect(az, el, vec2f(0.95, 0.20), vec2f(0.06, 0.45), 0.015); // 오른쪽 세로 띠
  let sweepX = sin(params.time * 0.3) * 1.4;
  c += vec3f(1.1) * rect(az, el, vec2f(sweepX, 0.3), vec2f(0.025, 0.7), 0.01); // 천천히 지나가는 빛줄기
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

struct Sample { col: vec4f, edge: bool } // col: 미리 알파를 곱한 색 (premultiplied)

// 화면 한 점(p, CSS px)의 색. edge = 모서리 근처라서 더 촘촘히 샘플링할 필요가 있음
fn shadeAt(p: vec2f, px: f32) -> Sample {
  let s = unit();
  let E = eyePos();
  let rdW = normalize(vec3f(p, 0.0) - E);

  // 블럭 없는 곳: 바닥(점 격자)은 페이지 배경이 이미 그리므로, 그 위에 그림자·커스틱만 덧그림
  let under = floorLight(E.xy + rdW.xy * ((pageZ() - E.z) / rdW.z), 0.0);

  // 로컬 공간 광선 + 바운딩 박스
  let C = vec3f(params.center, 0.0);
  let ro = toLocal(E - C);
  let rd = toLocal(rdW);
  let half = vec3f(params.box * 0.5, params.box * 0.5, halfDepth());
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

  var logo = vec3f(0.0); // 로고 색 × 덮은 정도 (미리 알파를 곱한 색)
  var cov = 0.0; // 로고가 덮은 정도
  // 바깥 윤곽선 근처 (스치듯 지나간 광선)
  var edge = tn < tf && !hit && minD < 2.5 * px;
  let cover = select(1.0 - smoothstep(0.0, px, minD), 1.0, hit);
  if (cover > 0.0) {
    let ph = ro + rd * select(tMin, t, hit);
    let n = normal3(ph);
    // 앞면과 옆면이 만나는 각진 모서리, 또는 옆면을 비스듬히 스치는 곳 (윤곽선)
    let fe = abs((abs(ph.z) - halfDepth()) - sdf2(ph.xy));
    edge = edge || fe < 2.0 * px || abs(dot(rd, n)) < 0.3;
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
    // 유리 너머로 보이는 모서리
    edge = edge || abs((abs(pe.z) - halfDepth()) - sdf2(pe.xy)) < 2.0 * px;
    let peW = toWorld(pe) + C;
    var trans = vec3f(0.0);
    let oMid = refract(rIn, -ne, IOR);
    if (!exited || dot(oMid, oMid) < 1e-4) {
      // 전반사(빛이 안에서 튕김) — 잡음 대신 부드러운 빛으로
      let r = toWorld(reflect(rIn, -ne));
      trans = mix(params.bg.rgb * 0.6 + 0.08, vec3f(0.9), smoothstep(-0.3, 0.6, -r.y));
    } else {
      for (var k = 0; k < 3; k++) {
        let eta = IOR + (f32(k) - 1.0) * DISPERSION;
        var o = refract(rIn, -ne, eta);
        if (dot(o, o) < 1e-4) { o = oMid; }
        let sc = sceneRay(peW, toWorld(o), 2.5 * s);
        trans[k] = sc[k];
      }
    }
    let absorb = exp(-(t2 / s) * 0.02 * (1.0 - TINT));
    trans *= absorb;

    var glass = mix(trans, refl, fres);

    // 가장자리 빛선 (리퀴드 글래스): 커서 쪽을 향한 가장자리가 가장 밝고, 반대쪽도 은은하게
    let d2h = sdf2(ph.xy);
    let g2 = grad2(ph.xy);
    let Ld = toLocal(vec3f(params.light - params.center, 0.0)).xy;
    let L2 = Ld / max(length(Ld), 1e-3);
    let a = dot(g2, L2);
    let rimLine = (1.0 - smoothstep(0.0, RIM_WIDTH * s, -d2h)) * faceAmount(ph);
    let rimI = rimLine * (0.18 + pow(max(a, 0.0), 1.5) + 0.45 * pow(max(-a, 0.0), 1.5));
    glass += vec3f(rimI * RIM_STRENGTH);
    // 가장자리 렌즈 부분의 은은한 안쪽 빛 + 몸통을 살짝 밝게
    let lensT = clamp(1.0 + d2h / (LENS_WIDTH * s), 0.0, 1.0) * faceAmount(ph);
    let lum = dot(params.bg.rgb, vec3f(0.3333));
    glass += vec3f(lensT * lensT * 0.10 + GLASS_LIFT) * (1.0 - lum);
    // 라이트 모드: 가장자리 안쪽에 옅은 그림자를 넣어 흰 배경에서도 형태가 보이게
    glass *= 1.0 - lensT * lensT * 0.16 * lum;

    // solid = 1 이면 SVG 로고와 똑같은 단색 → 0 으로 가며 유리로
    let look = mix(clamp(glass, vec3f(0.0), vec3f(1.0)), params.fg.rgb, params.solid);
    cov = cover * smoothstep(0.0, 1.0, params.intro);
    logo = look * cov;
  }
  // 로고 바깥: 그림자(검게 덮는 정도 = 알파)와 커스틱(더하는 빛)만 bgA 만큼. 나머지는 투명해 페이지 배경이 그대로 보임
  let ov = under * params.bgA * (1.0 - cov);
  return Sample(vec4f(logo + ov.rgb, cov + ov.a), edge);
}

// 안티앨리어싱: 모서리 근처 픽셀만 한 픽셀 안을 4점 더 (회전 격자) 샘플링해 평균
@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = uv * params.res;
  let px = max(fwidth(p.x), 1e-3); // 화면 픽셀 1개 = CSS px
  // 가운데 1점 + (모서리면) 4점. shadeAt 을 한 곳에서만 불러야 셰이더가 작게 컴파일됨
  // (여러 곳에서 부르면 무거운 계산이 통째로 여러 벌 복사돼, 휴대폰 GPU 드라이버가 컴파일하다 멈출 수 있음)
  var offs = array<vec2f, 5>(vec2f(0.0), vec2f(0.125, 0.375), vec2f(-0.375, 0.125), vec2f(-0.125, -0.375), vec2f(0.375, -0.125));
  let aaOn = AA_SAMPLES > 0 && params.aa > 0.5;
  var acc = vec4f(0.0);
  var count = 0.0;
  var edge = false;
  for (var i = 0; i < 5; i++) {
    if (i > 0 && !(edge && aaOn)) { break; }
    let s = shadeAt(p + offs[i] * px, px);
    if (i == 0) { edge = s.edge; }
    acc += s.col;
    count += 1.0;
  }
  return acc / count; // 미리 알파를 곱한 색 — 캔버스는 premultiplied 모드
}
