import { clock, effect, frameLoop, init, sampler, surface, texture } from 'vgpu';
import type { Effect, Gpu } from 'vgpu';
import logoShader from './logo.wgsl';
import { buildLogoSdf, LOGO_FILL, SDF_RANGE, SDF_SIZE } from './logo-sdf';

const ON_CLASS = 'glass-on';

function cssColor(name: string): [number, number, number, number] {
  const probe = document.createElement('span');
  probe.style.color = `var(${name})`;
  document.body.appendChild(probe);
  const m = getComputedStyle(probe).color.match(/[\d.]+/g) ?? ['0', '0', '0'];
  probe.remove();
  return [Number(m[0]) / 255, Number(m[1]) / 255, Number(m[2]) / 255, 1];
}

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

/** 스프링으로 부드럽게 따라가기 (damping 1 = 출렁임 없음, 1보다 작으면 살짝 출렁임) */
function spring(stiffness: number, damping = 1) {
  const s = { x: 0, y: 0, vx: 0, vy: 0 };
  return Object.assign(s, {
    step(tx: number, ty: number, dt: number) {
      const k = stiffness, c = 2 * damping * Math.sqrt(k);
      s.vx += ((tx - s.x) * k - s.vx * c) * dt;
      s.vy += ((ty - s.y) * k - s.vy * c) * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    },
  });
}

const MAX_TILT = 0.42; // 마우스 쪽으로 최대 기울기 (rad, ≈ 24°)

/** yaw(좌우)·pitch(상하) 회전 → 블럭의 로컬 x/y/z 축 (월드 방향) */
function axes(yaw: number, pitch: number) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  return {
    axisU: [cy, 0, -sy, 0],
    axisV: [sy * sp, cp, cy * sp, 0],
    axisW: [sy * cp, -sp, cy * cp, 0],
  };
}

// 입력(마우스/터치 위치, 기기 기울기)은 페이지를 오가도 계속 기억해 둠.
// 다른 페이지에서 돌아왔을 때 로고가 바로 커서 쪽을 바라보도록.
const pointer = { x: 0, y: 0, at: -1e9 };
const orient = { x: 0, y: 0, at: -1e9 };
if (typeof window !== 'undefined') {
  const onPointer = (e: PointerEvent) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.at = performance.now();
  };
  addEventListener('pointermove', onPointer, { passive: true });
  addEventListener('pointerdown', onPointer, { passive: true });
  addEventListener('deviceorientation', (e) => {
    if (e.gamma == null || e.beta == null) return;
    orient.x = clamp1(e.gamma / 25);
    orient.y = clamp1((e.beta - 40) / 25);
    orient.at = performance.now();
  });
}

let sdfCache: Uint8Array | undefined; // 로고 거리장은 한 번만 계산
let mountedBefore = false; // 두 번째부터는 등장 애니메이션 없이 바로

// GPU 장치·로고 텍스처·셰이더는 페이지를 오가도 켜 둔 채로 다시 씀.
// 홈으로 돌아올 때 새로 켜느라 평면 로고가 오래 보이지 않도록.
type Shared = { gpu: Gpu; glass: Effect; dead: boolean };
let shared: Shared | undefined;

async function getShared(): Promise<Shared> {
  if (shared && !shared.dead) return shared;
  const gpu = await init();
  const n = SDF_SIZE;
  const sdf = texture(gpu, {
    kind: '2d',
    size: [n, n],
    format: 'rgba8unorm',
    usage: ['texture_binding', 'copy_dst'],
    label: 'logo-sdf',
  });
  sdfCache ??= buildLogoSdf();
  gpu.gpu.queue.writeTexture({ texture: sdf.gpu }, sdfCache, { bytesPerRow: n * 4 }, [n, n]);
  const glass = effect(gpu, logoShader, {
    label: 'glass-logo',
    set: {
      params: {
        res: [1, 1], center: [0, 0], box: 1, range: 1,
        fg: [0, 0, 0, 1], bg: [1, 1, 1, 1],
        ...axes(0, 0), light: [0, 0], time: 0, intro: 0,
      },
      sdfTex: sdf,
      sdfSampler: sampler(gpu, { magFilter: 'linear', minFilter: 'linear' }),
    },
  });
  const s: Shared = { gpu, glass, dead: false };
  gpu.lost.then(() => {
    s.dead = true;
    if (shared === s) shared = undefined;
  });
  shared = s;
  return s;
}

/**
 * 원래 SVG 로고(placeholder) 자리에 WebGPU 유리 블럭 로고를 그립니다.
 * 정리 함수를 돌려줍니다 (페이지를 떠날 때 호출).
 * WebGPU를 못 쓰거나 '동작 줄이기' 설정이면 false를 반환하고 SVG가 그대로 남습니다.
 */
export async function mountGlassLogo(canvas: HTMLCanvasElement, placeholder: Element): Promise<(() => void) | false> {
  if (!('gpu' in navigator)) return false;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;

  const firstTime = !mountedBefore;
  mountedBefore = true;

  const sh = await getShared();
  const { gpu, glass } = sh;
  const ac = new AbortController();
  const { signal } = ac;
  let loop: { stop(): void } | undefined;
  let unsubResize: (() => void) | undefined;
  let disposed = false;

  const screen = surface(gpu, canvas, { dpr: [1, 1.75] });

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    ac.abort();
    loop?.stop();
    unsubResize?.();
    offError();
    screen.dispose();
    document.documentElement.classList.remove(ON_CLASS);
  };
  // GPU 쪽에서 문제가 생기면 원래 SVG 로고로 되돌리고, 다음에는 GPU를 새로 켬
  const fallback = (why: unknown) => {
    if (disposed) return;
    console.warn('[glass-logo]', why);
    dispose();
    sh.dead = true;
    if (shared === sh) shared = undefined;
    gpu.dispose();
  };
  const offError = gpu.onError(fallback);

  // 레이아웃 기준값: 원래 SVG 자리를 그대로 따라감
  let center = { x: 0, y: 0 };
  const layout = () => {
    const r = placeholder.getBoundingClientRect();
    const box = r.width / LOGO_FILL;
    center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    return {
      res: [canvas.clientWidth, canvas.clientHeight],
      center: [center.x, center.y],
      box,
      range: (SDF_RANGE * box) / SDF_SIZE,
    };
  };
  const colors = () => ({ fg: cssColor('--fg'), bg: cssColor('--bg') });
  glass.set({ params: { ...layout(), ...colors(), ...axes(0, 0), time: 0, intro: firstTime ? 0 : 1 } });

  const relayout = () => glass.set({ params: layout() });
  unsubResize = screen.onResize(relayout);
  addEventListener('resize', relayout, { signal });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => glass.set({ params: colors() }), { signal });

  // 클릭/탭하면 한 바퀴 회전
  let spinTarget = 0;
  addEventListener(
    'click',
    (e) => {
      if ((e.target as Element | null)?.closest?.('a')) return; // 링크 클릭은 회전하지 않음
      spinTarget += Math.PI * 2;
    },
    { signal },
  );

  const tilt = spring(40); // 로고 방향
  const spin = spring(18, 0.55); // 회전 (살짝 출렁이며 멈춤)
  const light = spring(90); // 하이라이트 위치
  if (firstTime) {
    tilt.x = -0.7; // 처음 등장할 때는 비스듬한 각도에서 정면으로
    tilt.y = 0.6;
  }
  light.x = center.x - 200;
  light.y = center.y - 200;

  const time = clock(gpu);
  let last = 0;
  let shown = false;
  loop = frameLoop(gpu, (frame) => {
    const t = time.time;
    const dt = Math.min(1 / 30, Math.max(0, t - last));
    last = t;
    const now = performance.now();
    const w = innerWidth, h = innerHeight;

    let tx: number, ty: number, lx: number, ly: number;
    if (now - pointer.at < 4000) {
      // 마우스 쪽을 바라봄
      tx = clamp1((pointer.x - center.x) / (w * 0.5));
      ty = clamp1((pointer.y - center.y) / (h * 0.5));
      lx = pointer.x;
      ly = pointer.y;
    } else if (now - orient.at < 1000) {
      tx = orient.x;
      ty = orient.y;
      lx = center.x + tx * w * 0.4;
      ly = center.y + ty * h * 0.4;
    } else {
      // 입력이 없으면 천천히 혼자 흔들림
      tx = Math.sin(t * 0.45) * 0.45;
      ty = Math.sin(t * 0.31 + 1.3) * 0.3;
      lx = center.x + tx * w * 0.45;
      ly = center.y + ty * h * 0.45;
    }
    tilt.step(tx, ty, dt);
    light.step(lx, ly, dt);
    spin.step(spinTarget, 0, dt);
    // 마우스 쪽을 바라보도록: 오른쪽이면 yaw<0, 아래쪽이면 pitch>0
    const yaw = -tilt.x * MAX_TILT + spin.x;
    const pitch = tilt.y * MAX_TILT;

    const k = firstTime ? Math.min(1, t / 0.9) : 1;
    const intro = 1 - Math.pow(1 - k, 3);

    glass.set({ params: { time: t, intro, ...axes(yaw, pitch), light: [light.x, light.y] } });
    frame.pass(screen, glass);

    if (!shown) {
      shown = true;
      requestAnimationFrame(() => !disposed && document.documentElement.classList.add(ON_CLASS));
    }
  });

  gpu.lost.then(() => fallback('GPU device lost'));
  return dispose;
}
