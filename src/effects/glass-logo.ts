import { clock, effect, frameLoop, init, sampler, surface, texture } from 'vgpu';
import type { Effect, Gpu } from 'vgpu';
import logoShader from './logo.wgsl';
import { buildLogoSdf, LOGO_FILL, SDF_RANGE, SDF_SIZE } from './logo-sdf';
import { INITIAL_PARAMS } from './glass-params';

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


/** 화면 위 로고 자리: 중심(x, y)과 로고 한 변 길이(w), 모두 CSS px */
export type Rect = { x: number; y: number; w: number };

export type GlassLogo = {
  /**
   * 홈 화면 모드. getRect 로 로고 자리를 계속 따라감.
   * from 이 있으면 그 자리(헤더 로고)의 평면 로고에서 출발해 날아오면서 동시에 커지고 유리가 됨.
   * 없으면 그 자리에서 평면 → 유리로만 바뀜 (처음 접속).
   */
  enterHome(getRect: () => Rect, opts?: { from?: Rect; ms?: number }): void;
  /** 다른 페이지로 갈 때 쓰는 출발 자세: 지정한 자리에 평면 단색 로고만 그려 둠 (배경 없음) */
  holdAt(rect: Rect): void;
  /** 지금 모습에서 to 자리로 날아가면서 동시에 작아지고, 회전이 풀리고, 평면 단색이 됨. 끝나면 쉼 */
  leave(to: Rect, ms?: number): Promise<void>;
  /** 홈 화면 모드인지 (날아가는 중이거나 쉬는 중이 아니라) */
  readonly atHome: boolean;
  /** GPU 오류 없이 쓸 수 있는 상태인지 */
  readonly alive: boolean;
};

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
// 날아갈 때: 빠르게 출발해서 부드럽게 멈춤 (예전 평면 로고 전환과 같은 느낌)
const easeOut = (x: number) => 1 - Math.pow(1 - x, 4);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

let sdfCache: Uint8Array<ArrayBuffer> | undefined; // 로고 거리장은 한 번만 계산

/**
 * 페이지를 오가도 유지되는 캔버스(transition:persist)에 유리 로고를 그리는 렌더러를 만듭니다.
 * WebGPU를 못 쓰거나 '동작 줄이기' 설정이면 null — 그때는 평면 SVG 로고만 씀.
 */
export async function createGlassLogo(canvas: HTMLCanvasElement): Promise<GlassLogo | null> {
  if (!('gpu' in navigator)) return null;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return null;

  const gpu: Gpu = await init();
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
  const glass: Effect = effect(gpu, logoShader, {
    label: 'glass-logo',
    set: {
      params: { ...INITIAL_PARAMS },
      sdfTex: sdf,
      sdfSampler: sampler(gpu, { magFilter: 'linear', minFilter: 'linear' }),
    },
  });
  const screen = surface(gpu, canvas, { dpr: [1, 1.75], alphaMode: 'premultiplied' });
  await glass.compile(screen).catch(() => {}); // 미리 준비해 두어 첫 등장 때 끊기지 않게

  let dead = false;
  const die = (why: unknown) => {
    if (dead) return;
    dead = true;
    console.warn('[glass-logo]', why);
    stopLoop();
    document.documentElement.classList.remove('glass-on');
  };
  gpu.onError(die);
  gpu.lost.then(() => die('GPU device lost'));

  const colors = () => ({ fg: cssColor('--fg'), bg: cssColor('--bg') });
  glass.set({ params: colors() });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => glass.set({ params: colors() }));

  // 클릭/탭하면 한 바퀴 회전 (홈 화면에서만, 링크 클릭 제외)
  let spinTarget = 0;
  addEventListener('click', (e) => {
    if (mode !== 'home' || (e.target as Element | null)?.closest?.('a')) return;
    spinTarget += Math.PI * 2;
  });

  // ── 상태 ──
  type Mode = 'idle' | 'hold' | 'home' | 'leave';
  let mode: Mode = 'idle';
  let getHomeRect: () => Rect = () => ({ x: 0, y: 0, w: 1 });
  // 움직임 (자리·평면 정도·배경) 한 번에
  type Tween = { from: Rect; to: () => Rect; m0: number; m1: number; b0: number; b1: number; yaw0: number; pitch0: number; el: number; dur: number; ease: (x: number) => number; done?: () => void };
  let tween: Tween | undefined;
  let rect: Rect = { x: 0, y: 0, w: 1 };
  let m = 1; // 1 = 평면 단색, 0 = 유리
  let bgA = 0; // 배경 불투명도
  let yaw = 0;
  let pitch = 0;
  const tilt = spring(40); // 로고 방향
  const spin = spring(18, 0.55); // 회전 (살짝 출렁이며 멈춤)
  const light = spring(90); // 하이라이트 위치

  const time = clock(gpu);
  let last = 0;
  let lastNow = 0;
  // 한 프레임이 오래 걸려도(페이지가 바뀌는 순간 등) 움직임은 이만큼까지만 진행 — 로고가 건너뛰지 않게
  const MAX_STEP_MS = 34; // 30fps 까지는 제 속도, 그보다 긴 끊김은 건너뛰지 않음
  let loop: { stop(): void } | undefined;
  const stopLoop = () => {
    loop?.stop();
    loop = undefined;
  };
  const startLoop = () => {
    if (loop || dead) return;
    loop = frameLoop(gpu, (frame) => {
      const t = time.time;
      const dt = Math.min(1 / 30, Math.max(0, t - last));
      last = t;
      const now = performance.now();
      const frameMs = lastNow ? now - lastNow : 0;
      lastNow = now;

      // 자리·평면 정도·배경: 움직이는 중이면 그 사이 값, 아니면 홈 자리
      let e = 1;
      if (tween) {
        tween.el += Math.min(frameMs, MAX_STEP_MS);
        const k = Math.min(1, tween.el / tween.dur);
        e = tween.ease(k);
        const to = tween.to();
        rect = { x: lerp(tween.from.x, to.x, e), y: lerp(tween.from.y, to.y, e), w: lerp(tween.from.w, to.w, e) };
        m = lerp(tween.m0, tween.m1, e);
        bgA = lerp(tween.b0, tween.b1, e);
      } else if (mode === 'home') {
        rect = getHomeRect();
      }

      if (mode === 'leave') {
        // 떠나는 중: 지금 기울기에서 정면으로 풀림
        yaw = tween ? tween.yaw0 * (1 - e) : 0;
        pitch = tween ? tween.pitch0 * (1 - e) : 0;
      } else if (mode === 'home') {
        const w = innerWidth, h = innerHeight;
        let tx: number, ty: number, lx: number, ly: number;
        if (now - pointer.at < 4000) {
          // 마우스 쪽을 바라봄
          tx = clamp1((pointer.x - rect.x) / (w * 0.5));
          ty = clamp1((pointer.y - rect.y) / (h * 0.5));
          lx = pointer.x;
          ly = pointer.y;
        } else if (now - orient.at < 1000) {
          tx = orient.x;
          ty = orient.y;
          lx = rect.x + tx * w * 0.4;
          ly = rect.y + ty * h * 0.4;
        } else {
          // 입력이 없으면 천천히 혼자 흔들림
          tx = Math.sin(t * 0.45) * 0.45;
          ty = Math.sin(t * 0.31 + 1.3) * 0.3;
          lx = rect.x + tx * w * 0.45;
          ly = rect.y + ty * h * 0.45;
        }
        // 평면일 때는 정면, 유리가 되어 갈수록 커서 쪽으로 기울어짐
        tilt.step(tx * (1 - m), ty * (1 - m), dt);
        light.step(lx, ly, dt);
        spin.step(spinTarget, 0, dt);
        // 마우스 쪽을 바라보도록: 오른쪽이면 yaw<0, 아래쪽이면 pitch>0
        yaw = -tilt.x * MAX_TILT + spin.x;
        pitch = tilt.y * MAX_TILT;
      } else {
        yaw = 0;
        pitch = 0;
      }

      const box = rect.w / LOGO_FILL;
      glass.set({
        params: {
          res: [canvas.clientWidth, canvas.clientHeight],
          center: [rect.x, rect.y],
          box,
          range: (SDF_RANGE * box) / SDF_SIZE,
          time: t,
          solid: m,
          thick: Math.min(1, (1 - m) * 1.25), // 두께는 단색이 빠지는 것보다 조금 먼저 생기게
          bgA,
          aa: tween ? 0 : 1, // 움직이는 동안은 모서리 안티앨리어싱을 꺼서 가볍게
          ...axes(yaw, pitch),
          light: [light.x, light.y],
        },
      });
      frame.pass(screen, glass);
      // 디버그용: window.__glassTrace 배열이 있으면 매 프레임 상태를 남김
      (window as unknown as { __glassTrace?: unknown[] }).__glassTrace?.push({ t: Math.round(now), mode, x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), m: +m.toFixed(2), bg: +bgA.toFixed(2) });

      if (tween && tween.el >= tween.dur) {
        const done = tween.done;
        tween = undefined;
        done?.();
      }
    });
  };

  return {
    get atHome() {
      return mode === 'home' && !dead;
    },
    get alive() {
      return !dead;
    },
    enterHome(getRect, opts = {}) {
      if (dead) return;
      getHomeRect = getRect;
      const start = opts.from ?? getRect();
      // 처음 접속: 평면에서 유리로 (배경은 처음부터). 다른 페이지에서 옴: 배경도 같이 차오름
      tween = { from: start, to: getRect, m0: 1, m1: 0, b0: opts.from ? 0 : 1, b1: 1, yaw0: 0, pitch0: 0, el: 0, dur: opts.ms ?? 750, ease: opts.from ? easeOut : easeInOut };
      tilt.x = tilt.y = tilt.vx = tilt.vy = 0;
      light.x = start.x - 200;
      light.y = start.y - 200;
      rect = start;
      m = 1;
      bgA = tween.b0;
      mode = 'home';
      startLoop();
    },
    holdAt(r) {
      if (dead) return;
      tween = undefined;
      rect = r;
      m = 1;
      bgA = 0;
      mode = 'hold';
      startLoop();
    },
    leave(to, ms = 420) {
      if (dead) return Promise.resolve();
      return new Promise<void>((resolve) => {
        tween = { from: rect, to: () => to, m0: m, m1: 1, b0: bgA, b1: 0, yaw0: wrapAngle(yaw), pitch0: pitch, el: 0, dur: ms, ease: easeOut };
        mode = 'leave';
        startLoop();
        tween.done = () => {
          mode = 'idle';
          stopLoop();
          resolve();
        };
      });
    },
  };
}
