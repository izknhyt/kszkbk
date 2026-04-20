// Seeded value noise  noise2D(x, y, seed) → [-1, 1]
// 外部依存なし。同一 seed なら完全再現性あり。

function u32(n: number): number {
  return n >>> 0;
}

// Wang hash — 整数 → 均一分布整数
function wangHash(n: number): number {
  n = u32(n);
  n = u32((u32(n >> 16) ^ n) * 0x45d9f3b);
  n = u32((u32(n >> 16) ^ n) * 0x45d9f3b);
  n = u32(u32(n >> 16) ^ n);
  return n;
}

// グリッド点 (ix, iy) の擬似乱数値  →  [-1, 1]
function grad(ix: number, iy: number, seed: number): number {
  const h = wangHash(u32(u32(ix * 1619) + u32(iy * 31337) + u32(seed * 1000003)));
  return (h & 0xffff) / 32767.5 - 1.0;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 2D value noise。連続性あり、区間 [-1, 1]。
 * 同一 seed なら完全再現。
 */
export function noise2D(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = smoothstep(fx);
  const uy = smoothstep(fy);

  const v00 = grad(ix,     iy,     seed);
  const v10 = grad(ix + 1, iy,     seed);
  const v01 = grad(ix,     iy + 1, seed);
  const v11 = grad(ix + 1, iy + 1, seed);

  return lerp(lerp(v00, v10, ux), lerp(v01, v11, ux), uy);
}

/**
 * フラクタルノイズ（複数オクターブ合成）。区間 [-1, 1]。
 * @param octaves オクターブ数（多いほど細かい）
 * @param persistence 振幅減衰率（0.5 が標準）
 */
export function octaveNoise(
  x: number,
  y: number,
  seed: number,
  octaves: number,
  persistence: number,
): number {
  let value = 0;
  let amplitude = 1;
  let freq = 1;
  let maxValue = 0;
  for (let i = 0; i < octaves; i++) {
    value += noise2D(x * freq, y * freq, u32(seed + i * 13337)) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    freq *= 2;
  }
  return value / maxValue;
}

/** runId 文字列 → 安定した整数シード */
export function seedFromRunId(runId: string): number {
  let h = 5381;
  for (let i = 0; i < runId.length; i++) {
    h = u32(Math.imul(h, 33) ^ runId.charCodeAt(i));
  }
  return h >>> 0;
}
