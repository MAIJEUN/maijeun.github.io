// public/logo.svg 의 path (viewBox 0 0 128 128)
const LOGO_PATH = 'M8.64258 1.06641C13.8739 -1.10035 19.8955 0.0977467 23.8994 4.10156L61.1719 41.373C62.734 42.9351 65.2661 42.9351 66.8281 41.373L82.0479 26.1533C84.2258 23.9753 88.0481 24.9697 89.5527 27.6572C94.3429 36.2151 103.495 42.001 114 42.001C116.645 42.001 119.204 41.6337 121.629 40.9482C124.593 40.1103 128 42.1078 128 45.1885V64.001L127.992 69.8467C127.966 75.6666 127.854 81.3684 127.38 86.5811C126.75 93.5135 125.391 100.907 121.873 107.552C113.736 122.921 97.9477 128.001 78 128.001C70.2684 128.001 64.0004 121.733 64 114.001C64.0001 106.269 70.2682 100.001 78 100.001C94.0496 100.001 96.2639 96.0803 97.127 94.4502C98.1088 92.5954 99.0004 89.4872 99.4951 84.0459C99.8649 79.9778 99.9638 75.3424 99.9902 69.8252L100 64.001V57.4561C99.9998 53.8926 95.6917 52.1082 93.1719 54.6279L73.8994 73.9004C71.3367 76.4629 68.0275 77.8252 64.6719 77.9854C62.8819 78.0708 61.0785 77.8139 59.3682 77.2158C58.9411 77.0665 58.5193 76.8961 58.1055 76.7041C57.8982 76.608 57.6926 76.5062 57.4893 76.3994C57.2863 76.2927 57.0854 76.1798 56.8867 76.0625C56.5885 75.8864 56.295 75.6982 56.0078 75.498C55.625 75.2313 55.252 74.9432 54.8916 74.6338C54.6211 74.4015 54.3569 74.1567 54.1006 73.9004L34.8281 54.6279C32.3083 52.1083 28.0001 53.8926 28 57.4561V100.001C27.9996 107.733 21.7317 114.001 14 114.001C6.26827 114.001 0.000413929 107.733 0 100.001V14.001C8.3109e-05 8.33869 3.41135 3.23338 8.64258 1.06641ZM114 0C121.732 0 128 6.26821 128 14C128 21.732 121.732 28 114 28C106.268 28 100 21.732 100 14C100 6.26821 106.268 0 114 0Z';

export const SDF_SIZE = 512; // SDF 텍스처 해상도
export const LOGO_FILL = 0.6; // 텍스처 안에서 로고가 차지하는 비율 (나머지는 일렁임/등장 여백)
export const SDF_RANGE = 40; // 텍스처 값 0..1 이 표현하는 거리 (texel, 한쪽)

/** 1차원 제곱 거리 변환 (Felzenszwalb & Huttenlocher) */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** 마스크에서 '안쪽 픽셀까지' 거리 (2차원) */
function edt2d(mask: Uint8Array, n: number, target: number): Float64Array {
  const INF = 1e20;
  const grid = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) grid[i] = mask[i] === target ? 0 : INF;
  const f = new Float64Array(n), d = new Float64Array(n), z = new Float64Array(n + 1);
  const v = new Int32Array(n);
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) f[y] = grid[y * n + x];
    edt1d(f, n, d, v, z);
    for (let y = 0; y < n; y++) grid[y * n + x] = d[y];
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) f[x] = grid[y * n + x];
    edt1d(f, n, d, v, z);
    for (let x = 0; x < n; x++) grid[y * n + x] = Math.sqrt(d[x]);
  }
  return grid;
}

/** 로고 path → 부호 있는 거리장 (rgba8, r 채널: 0.5 = 경계, 작을수록 안쪽) */
export function buildLogoSdf(): Uint8Array {
  const n = SDF_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const s = (n * LOGO_FILL) / 128;
  ctx.setTransform(s, 0, 0, s, (n - 128 * s) / 2, (n - 128 * s) / 2);
  ctx.fill(new Path2D(LOGO_PATH));
  const alpha = ctx.getImageData(0, 0, n, n).data;

  const mask = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) mask[i] = alpha[i * 4 + 3] > 127 ? 1 : 0;
  const toInside = edt2d(mask, n, 1);
  const toOutside = edt2d(mask, n, 0);

  const out = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const d = toInside[i] - toOutside[i]; // 안쪽 음수, 바깥 양수
    const v = Math.min(1, Math.max(0, 0.5 + d / (2 * SDF_RANGE)));
    out[i * 4] = Math.round(v * 255);
    out[i * 4 + 3] = 255;
  }
  return out;
}
