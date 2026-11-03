import { clock, effect, frameLoop, init, sampler, surface, texture } from 'vgpu';
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

/**
 * 원래 SVG 로고(placeholder) 자리에 WebGPU 유리 블럭 로고를 그립니다.
 * WebGPU를 못 쓰거나 '동작 줄이기' 설정이면 false를 반환하고 SVG가 그대로 남습니다.
 */
export async function mountGlassLogo(canvas: HTMLCanvasElement, placeholder: Element) {
  if (!('gpu' in navigator)) return false;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;

  const gpu = await init();
  // GPU 쪽에서 문제가 생기면 원래 SVG 로고로 되돌림
  let loop: { stop(): void } | undefined;
  const fallback = (why: unknown) => {
    console.warn('[glass-logo]', why);
    loop?.stop();
    document.documentElement.classList.remove(ON_CLASS);
  };
  gpu.onError(fallback);

  const n = SDF_SIZE;
  const sdf = texture(gpu, {
    kind: '2d',
    size: [n, n],
    format: 'rgba8unorm',
    usage: ['texture_binding', 'copy_dst'],
    label: 'logo-sdf',
  });
  gpu.gpu.queue.writeTexture({ texture: sdf.gpu }, buildLogoSdf(), { bytesPerRow: n * 4 }, [n, n]);

  const screen = surface(gpu, canvas, { dpr: [1, 1.75] });

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
      range: (SDF_RANGE * box) / n,
    };
  };
  const colors = () => ({ fg: cssColor('--fg'), bg: cssColor('--bg') });

  const glass = effect(gpu, logoShader, {
    label: 'glass-logo',
    set: {
      params: { ...layout(), ...colors(), ...axes(0, 0), light: [0, 0], time: 0, intro: 0 },
      sdfTex: sdf,
      sdfSampler: sampler(gpu, { magFilter: 'linear', minFilter: 'linear' }),
    },
  });

  const relayout = () => glass.set({ params: layout() });
  screen.onResize(relayout);
  addEventListener('resize', relayout);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => glass.set({ params: colors() }));

  // 입력: 마우스/터치 위치, (안드로이드 등) 기기 기울기
  const pointer = { x: 0, y: 0, at: -1e9 };
  const onPointer = (e: PointerEvent) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.at = performance.now();
  };
  addEventListener('pointermove', onPointer, { passive: true });
  addEventListener('pointerdown', onPointer, { passive: true });
  const orient = { x: 0, y: 0, at: -1e9 };
  addEventListener('deviceorientation', (e) => {
    if (e.gamma == null || e.beta == null) return;
    orient.x = clamp1(e.gamma / 25);
    orient.y = clamp1((e.beta - 40) / 25);
    orient.at = performance.now();
  });

  // 클릭/탭하면 한 바퀴 회전
  let spinTarget = 0;
  addEventListener('click', () => (spinTarget += Math.PI * 2));

  const tilt = spring(40); // 로고 방향
  const spin = spring(18, 0.55); // 회전 (살짝 출렁이며 멈춤)
  const light = spring(90); // 하이라이트 위치
  tilt.x = -0.7; // 등장할 때 비스듬한 각도에서 정면으로
  tilt.y = 0.6;
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

    const k = Math.min(1, t / 0.9);
    const intro = 1 - Math.pow(1 - k, 3);

    glass.set({ params: { time: t, intro, ...axes(yaw, pitch), light: [light.x, light.y] } });
    frame.pass(screen, glass);

    if (!shown) {
      shown = true;
      requestAnimationFrame(() => document.documentElement.classList.add(ON_CLASS));
    }
  });

  gpu.lost.then(fallback);
  return true;
}
