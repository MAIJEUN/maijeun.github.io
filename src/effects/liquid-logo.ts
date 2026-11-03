import { clock, effect, frameLoop, init, sampler, surface, texture } from 'vgpu';
import logoShader from './logo.wgsl';
import { buildLogoSdf, LOGO_FILL, SDF_RANGE, SDF_SIZE } from './logo-sdf';

function cssColor(name: string): [number, number, number, number] {
  const probe = document.createElement('span');
  probe.style.color = `var(${name})`;
  document.body.appendChild(probe);
  const m = getComputedStyle(probe).color.match(/[\d.]+/g) ?? ['0', '0', '0'];
  probe.remove();
  return [Number(m[0]) / 255, Number(m[1]) / 255, Number(m[2]) / 255, 1];
}

export async function mountLiquidLogo(canvas: HTMLCanvasElement, placeholder: Element) {
  if (!('gpu' in navigator)) return false;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;

  const gpu = await init();
  // GPU 쪽에서 문제가 생기면 원래 SVG 로고로 되돌림
  let loop: { stop(): void } | undefined;
  const fallback = (why: unknown) => {
    console.warn('[liquid-logo]', why);
    loop?.stop();
    document.documentElement.classList.remove('liquid-on');
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

  const screen = surface(gpu, canvas, { dpr: [1, 2] });

  // 레이아웃 기준값: 원래 SVG 자리를 그대로 따라감
  const layout = () => {
    const r = placeholder.getBoundingClientRect();
    const box = r.width / LOGO_FILL;
    return {
      res: [canvas.clientWidth, canvas.clientHeight],
      center: [r.left + r.width / 2, r.top + r.height / 2],
      box,
      range: (SDF_RANGE * box) / n,
      aa: 0.75 / Math.min(2, Math.max(1, devicePixelRatio)),
    };
  };
  const colors = () => ({ fg: cssColor('--fg'), bg: cssColor('--bg') });

  const liquid = effect(gpu, logoShader, {
    label: 'liquid-logo',
    set: {
      params: { ...layout(), ...colors(), mouse: [-1e4, -1e4], time: 0, intro: 0, drop: 0 },
      sdfTex: sdf,
      sdfSampler: sampler(gpu, { magFilter: 'linear', minFilter: 'linear' }),
    },
  });

  const relayout = () => liquid.set({ params: layout() });
  screen.onResize(relayout);
  addEventListener('resize', relayout);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => liquid.set({ params: colors() }));

  // 커서 물방울: 살짝 늦게 따라오는 스프링
  const target = { x: 0, y: 0 };
  const drop = { x: 0, y: 0, size: 0, want: 0, placed: false };
  const onMove = (e: PointerEvent) => {
    target.x = e.clientX;
    target.y = e.clientY;
    if (!drop.placed) {
      drop.x = target.x;
      drop.y = target.y;
      drop.placed = true;
    }
    drop.want = e.pointerType === 'touch' && e.type !== 'pointerdown' && e.buttons === 0 ? 0 : 1;
  };
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerdown', onMove, { passive: true });
  addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') drop.want = 0; });
  document.documentElement.addEventListener('pointerleave', () => (drop.want = 0));

  const time = clock(gpu);
  let last = 0;
  let shown = false;
  loop = frameLoop(gpu, (frame) => {
    const t = time.time;
    const dt = Math.min(0.05, Math.max(0, t - last));
    last = t;
    const follow = 1 - Math.exp(-dt * 9);
    drop.x += (target.x - drop.x) * follow;
    drop.y += (target.y - drop.y) * follow;
    drop.size += (drop.want - drop.size) * (1 - Math.exp(-dt * 6));
    const k = Math.min(1, t / 1.8);
    const intro = 1 - Math.pow(1 - k, 3);

    liquid.set({ params: { time: t, intro, mouse: [drop.x, drop.y], drop: drop.size } });
    frame.pass(screen, liquid);

    if (!shown) {
      shown = true;
      requestAnimationFrame(() => document.documentElement.classList.add('liquid-on'));
    }
  });

  gpu.lost.then(fallback);
  return true;
}
