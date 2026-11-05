import { clock, effect, frameLoop, init, sampler, surface, texture } from 'vgpu';
import type { Effect, Gpu } from 'vgpu';
import logoShader from './logo.wgsl';
// 같은 셰이더의 가벼운 판 (빌드할 때 logo.wgsl 에서 만들어짐 — scripts/wgsl-lite.mjs)
import logoLiteShader from './logo-lite.wgsl';
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

// 이 기기(브라우저)에서 셰이더가 GPU 를 멈추게 한 기록: 판별 마지막 시각. 2주 지나면 다시 시도.
// 주소 끝에 #glass-reset 을 붙여 열면 지움.
const CRASH_KEY = 'glass-gpu-crash';
const CRASH_TTL = 14 * 24 * 3600 * 1000;
type CrashMemo = { full?: number; lite?: number };
function readCrashMemo(): CrashMemo {
  try {
    if (location.hash.includes('glass-reset')) localStorage.removeItem(CRASH_KEY);
    const m = JSON.parse(localStorage.getItem(CRASH_KEY) ?? '{}') as CrashMemo;
    const fresh = (t?: number) => (t && Date.now() - t < CRASH_TTL ? t : undefined);
    return { full: fresh(m.full), lite: fresh(m.lite) };
  } catch {
    return {};
  }
}
function writeCrashMemo(m: CrashMemo) {
  try {
    localStorage.setItem(CRASH_KEY, JSON.stringify(m));
  } catch {}
}

export type GlassOptions = {
  /** '동작 줄이기' 설정: 입력이 없을 때 혼자 흔들리지 않음 (유리 효과 자체는 그대로) */
  calm?: boolean;
  /** 가볍게 그림 (화면 밀도 1, 반복 횟수 줄임, 안티앨리어싱 끔) — GPU 가 버거워한 기기에서 다시 만들 때 */
  lite?: boolean;
  /** GPU 연결이 끊기거나 오류로 더 못 그리게 됐을 때 (다시 만들 수 있게 알려 줌) */
  onDead?: (why: string) => void;
  /** 진단용 기록 (GPU 정보, 몇 초마다 프레임 속도) */
  onLog?: (msg: string) => void;
};

/**
 * 페이지를 오가도 유지되는 캔버스(transition:persist)에 유리 로고를 그리는 렌더러를 만듭니다.
 * WebGPU를 못 쓰면 null 이거나 오류 — 그때는 평면 SVG 로고만 씀.
 */
export async function createGlassLogo(canvas: HTMLCanvasElement, opts: GlassOptions = {}): Promise<GlassLogo | null> {
  if (!('gpu' in navigator)) return null;

  // 이 기기에서 전에 셰이더 준비 중에 GPU 가 멈춘 적이 있는지 (멈추면 크롬이 한동안 GPU 를 막으므로 같은 실수를 반복하지 않음)
  const memo = readCrashMemo();
  if (memo.lite) {
    opts.onLog?.('disabled: the lite shader crashed this GPU before (open #glass-reset to try again)');
    return null;
  }

  const gpu: Gpu = await init();
  const info = gpu.device.adapterInfo;
  // ARM(Mali)·퀄컴(Adreno)·PowerVR GPU 이거나, 전에 보통 판이 멈췄거나, 끊긴 뒤 다시 만드는 중이면 가벼운 판
  const riskyGpu = /arm|qualcomm|img-tec|imagination|powervr|mali|adreno/i.test(`${info?.vendor} ${info?.architecture}`);
  const variant: 'full' | 'lite' = opts.lite || riskyGpu || memo.full ? 'lite' : 'full';
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
  const glass: Effect = effect(gpu, variant === 'lite' ? logoLiteShader : logoShader, {
    label: `glass-logo-${variant}`,
    set: {
      params: { ...INITIAL_PARAMS },
      sdfTex: sdf,
      sdfSampler: sampler(gpu, { magFilter: 'linear', minFilter: 'linear' }),
    },
  });
  // 휴대폰·태블릿(터치)은 화면 밀도를 조금 낮춰 GPU 부담을 줄임. 가볍게 모드는 1
  const maxDpr = variant === 'lite' ? 1 : matchMedia('(pointer: coarse)').matches ? 1.5 : 1.75;
  const screen = surface(gpu, canvas, { dpr: [1, maxDpr], alphaMode: 'premultiplied' });
  glass.set({ params: { quality: opts.lite ? 0 : 1 } });
  opts.onLog?.(`gpu ${info?.vendor || '?'} / ${info?.architecture || '?'}${info?.device ? ` / ${info.device}` : ''} · ${variant} shader · dpr≤${maxDpr}`);

  // 셰이더 준비 ~ 처음 몇십 프레임 사이에 멈추면 이 기기에서 이 판은 안 되는 것으로 기억
  let framesDrawn = 0;
  const STARTUP_FRAMES = 30;
  const t0 = performance.now();
  let compileFailed = false;
  await glass.compile(screen).catch((e) => {
    compileFailed = true;
    opts.onLog?.(`compile failed: ${e?.message ?? e}`);
  }); // 미리 준비해 두어 첫 등장 때 끊기지 않게
  if (compileFailed) {
    // 셰이더를 준비하다 실패 (GPU 가 같이 멈춘 경우가 많음): 기억해 두고 여기서 그만 — 평면 로고만 씀
    writeCrashMemo({ ...readCrashMemo(), [variant]: Date.now() });
    opts.onLog?.(`remembered: ${variant} shader fails on this GPU${variant === 'full' ? ' → lite next time' : ' → flat logo from now on'}`);
    try {
      gpu.gpu.destroy?.();
    } catch {}
    throw new Error(`${variant} shader failed to compile`);
  }
  opts.onLog?.(`compiled in ${Math.round(performance.now() - t0)}ms`);

  let dead = false;
  const listeners = new AbortController();
  const die = (why: unknown, crashed = false) => {
    if (dead) return;
    dead = true;
    console.warn('[glass-logo]', why);
    if (compileFailed || (crashed && framesDrawn < STARTUP_FRAMES)) {
      writeCrashMemo({ ...readCrashMemo(), [variant]: Date.now() });
      opts.onLog?.(`remembered: ${variant} shader fails on this GPU${variant === 'full' ? ' → lite next time' : ' → flat logo from now on'}`);
    }
    stopLoop();
    listeners.abort();
    document.documentElement.classList.remove('glass-on');
    try {
      gpu.gpu.destroy?.(); // 오류가 난 장치는 놓아 줌 (다시 만들 때 새 장치를 받게)
    } catch {}
    opts.onDead?.(why instanceof Error ? why.message : String((why as { message?: string })?.message ?? why));
  };
  gpu.onError((e) => die(e));
  // reason 'destroyed' = 일부러 놓아 준 것, 그 밖('unknown') = GPU 가 멈춤
  gpu.lost.then((lost: GPUDeviceLostInfo) => die(`GPU device lost (${lost?.reason ?? '?'})${lost?.message ? `: ${lost.message}` : ''}`, lost?.reason !== 'destroyed'));

  const colors = () => ({ fg: cssColor('--fg'), bg: cssColor('--bg') });
  glass.set({ params: colors() });
  // 라이트/다크가 바뀌면 (전환 버튼 또는 기기 설정) 색을 다시 읽음
  // (이 렌더러가 멈추면 함께 떼어 냄 — 다시 만들 때 겹치지 않게)
  const { signal } = listeners;
  addEventListener('site-themechange', () => glass.set({ params: colors() }), { signal });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => glass.set({ params: colors() }), { signal });

  // 클릭/탭하면 한 바퀴 회전 (홈 화면에서만, 링크 클릭 제외)
  let spinTarget = 0;
  addEventListener(
    'click',
    (e) => {
      if (mode !== 'home' || (e.target as Element | null)?.closest?.('a, button')) return; // 링크·버튼 클릭은 회전하지 않음
      spinTarget += Math.PI * 2;
    },
    { signal },
  );

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
  const stats = { n: 0, sum: 0, worst: 0, from: performance.now() };
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
      // 진단: 5초마다 평균 프레임 속도와 가장 긴 프레임
      if (opts.onLog && frameMs > 0 && frameMs < 1000) {
        stats.n++;
        stats.sum += frameMs;
        stats.worst = Math.max(stats.worst, frameMs);
        if (now - stats.from > 5000) {
          opts.onLog(`${Math.round((1000 * stats.n) / stats.sum)}fps, worst ${Math.round(stats.worst)}ms, ${canvas.width}×${canvas.height}px`);
          stats.n = stats.sum = stats.worst = 0;
          stats.from = now;
        }
      }

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
          // 입력이 없으면 천천히 혼자 흔들림 ('동작 줄이기'면 살짝 기운 채 가만히)
          tx = opts.calm ? -0.25 : Math.sin(t * 0.45) * 0.45;
          ty = opts.calm ? -0.15 : Math.sin(t * 0.31 + 1.3) * 0.3;
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
      // 로고 자리는 화면(viewport) 기준이지만 셰이더는 캔버스 기준으로 그림.
      // 스크롤바 자리를 비워 두면 캔버스가 화면 왼쪽 끝이 아니라 그만큼 안쪽에서 시작하므로 빼 줌.
      const cr = canvas.getBoundingClientRect();
      glass.set({
        params: {
          res: [canvas.clientWidth, canvas.clientHeight],
          center: [rect.x - cr.left, rect.y - cr.top],
          box,
          range: (SDF_RANGE * box) / SDF_SIZE,
          time: t,
          solid: m,
          thick: Math.min(1, (1 - m) * 1.25), // 두께는 단색이 빠지는 것보다 조금 먼저 생기게
          bgA,
          aa: tween ? 0 : 1, // 움직이는 동안은 모서리 안티앨리어싱을 꺼서 가볍게
          ...axes(yaw, pitch),
          light: [light.x - cr.left, light.y - cr.top],
        },
      });
      frame.pass(screen, glass);
      framesDrawn++;
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
