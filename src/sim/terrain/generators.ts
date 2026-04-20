// Σ-3 地形ジェネレータ 3 種
// generateTerrain(difficulty, seed, bounds) → TerrainTile[][]
//
// plains   (beginner) : 起伏小、海なし、広い安全圏
// peninsula(standard) : 北山地・南東海・半島 2-3 本
// island   (hell)     : 四方海・中央小山・縁は切り立つ崖

import type { Difficulty, TerrainMaterial, TerrainTile } from '../../types';
import { noise2D, octaveNoise } from './noise';

const TILE_SIZE = 32;

function elevToMaterial(elev: number, isWater: boolean): TerrainMaterial {
  if (isWater) return 'water';
  if (elev > 60) return 'rock';
  if (elev > 25) return 'grass';
  if (elev > 10) return 'soil';
  return 'sand';
}

function tile(elev: number, isWater: boolean): TerrainTile {
  return {
    elev: Math.max(isWater ? 0 : 2, Math.min(100, elev)),
    material: elevToMaterial(Math.max(isWater ? 0 : 2, Math.min(100, elev)), isWater),
    stability: 1.0,
    waterLevel: isWater ? 1.0 : 0,
    buryTimer: 0,
  };
}

// -------------------------------------------------------------------------
// beginner: 平野
// 低周波ノイズ振幅 ±15、ベース elev 40、海なし
// -------------------------------------------------------------------------
function plains(seed: number, cols: number, rows: number): TerrainTile[][] {
  const grid: TerrainTile[][] = [];
  for (let row = 0; row < rows; row++) {
    const rowArr: TerrainTile[] = [];
    for (let col = 0; col < cols; col++) {
      const nx = col / cols;
      const ny = row / rows;
      const n = octaveNoise(nx * 5, ny * 5, seed, 4, 0.5);
      const elev = 40 + n * 15;
      rowArr.push(tile(elev, false));
    }
    grid.push(rowArr);
  }
  return grid;
}

// -------------------------------------------------------------------------
// standard: 半島
// 北部山地、南東海域、中央陸地から半島 2-3 本
// -------------------------------------------------------------------------
function peninsula(seed: number, cols: number, rows: number): TerrainTile[][] {
  const grid: TerrainTile[][] = [];
  for (let row = 0; row < rows; row++) {
    const rowArr: TerrainTile[] = [];
    for (let col = 0; col < cols; col++) {
      const nx = col / cols;
      const ny = row / rows;

      // 北部山地 (ny < 0.35)
      let elev: number;
      if (ny < 0.35) {
        const mtn = octaveNoise(nx * 5, ny * 8, seed, 4, 0.5);
        elev = 62 + mtn * 23;
      } else {
        const n = octaveNoise(nx * 7, ny * 6, seed + 17, 4, 0.5);
        elev = 35 + n * 18;
      }

      // 南東海域（nx > 0.52, ny > 0.48）
      let isWater = false;
      if (nx > 0.52 && ny > 0.48) {
        const seaDist = Math.sqrt(
          Math.pow((nx - 0.76) * 1.1, 2) +
          Math.pow((ny - 0.76) * 0.9, 2),
        );
        const seaN = noise2D(nx * 9, ny * 9, seed + 3);
        if (seaDist < 0.36 + seaN * 0.09) {
          isWater = true;
          elev = 0;
        }
      }

      // 半島 3 本（海域を陸地で貫通させる）
      if (isWater) {
        for (let pi = 0; pi < 3; pi++) {
          const ps = seed + 1000 + pi * 337;
          // 半島の向き（概ね南東向き）
          const ang = 0.6 + noise2D(pi * 3.7, 0.5, ps) * 0.5;
          const baseX = 0.52 + noise2D(pi * 1.3, 0.4, ps + 7) * 0.18;
          const baseY = 0.48 + noise2D(pi * 2.1, 0.6, ps + 13) * 0.18;
          const dx = nx - baseX;
          const dy = ny - baseY;
          const along = dx * Math.cos(ang) + dy * Math.sin(ang);
          const across = -dx * Math.sin(ang) + dy * Math.cos(ang);
          const pLen = 0.13 + noise2D(pi * 4.1, 0.2, ps + 5) * 0.05;
          const pWidth = 0.038 + noise2D(pi * 2.9, 0.8, ps + 11) * 0.01;
          if (along >= 0 && along < pLen && Math.abs(across) < pWidth * (1 - along / pLen)) {
            isWater = false;
            elev = 22 + noise2D(nx * 10, ny * 10, ps) * 8;
          }
        }
      }

      rowArr.push(tile(elev, isWater));
    }
    grid.push(rowArr);
  }
  return grid;
}

// -------------------------------------------------------------------------
// hell: くそざこ島
// 四方海、中央小山、縁は切り立つ崖
// -------------------------------------------------------------------------
function island(seed: number, cols: number, rows: number): TerrainTile[][] {
  const grid: TerrainTile[][] = [];
  for (let row = 0; row < rows; row++) {
    const rowArr: TerrainTile[] = [];
    for (let col = 0; col < cols; col++) {
      const nx = col / cols;
      const ny = row / rows;

      // 外周マージン
      const marginX = Math.min(nx, 1 - nx);
      const marginY = Math.min(ny, 1 - ny);
      const edgeDist = Math.min(marginX / 0.13, marginY / 0.10);

      // 中央からの楕円距離
      const cdx = (nx - 0.5) / 0.22;
      const cdy = (ny - 0.5) / 0.22;
      const centerDist = Math.sqrt(cdx * cdx + cdy * cdy);

      const n = octaveNoise(nx * 9, ny * 9, seed, 5, 0.5);
      const edgeN = noise2D(nx * 7, ny * 7, seed + 11);

      let elev = 0;
      let isWater = false;

      // 外周は海
      if (edgeDist < 1.0 + edgeN * 0.3) {
        isWater = true;
        elev = 0;
      } else {
        if (centerDist < 1.0) {
          // 中央山地：標高 60-85
          elev = 72 - centerDist * 32 + n * 12;
        } else if (edgeDist < 1.8) {
          // 崖帯：急激に低下（標高差 30+ を 1-2 タイルで）
          const cliffFactor = (edgeDist - 1.0) / 0.8;  // 0→1
          elev = 5 + cliffFactor * 20 + n * 4;
        } else {
          // 陸地内部（崖上）
          elev = 25 + n * 12;
        }
      }

      rowArr.push(tile(elev, isWater));
    }
    grid.push(rowArr);
  }
  return grid;
}

// -------------------------------------------------------------------------
// エクスポート
// -------------------------------------------------------------------------
export function generateTerrain(
  difficulty: Difficulty,
  seed: number,
  bounds: { w: number; h: number },
): TerrainTile[][] {
  const cols = Math.ceil(bounds.w / TILE_SIZE);
  const rows = Math.ceil(bounds.h / TILE_SIZE);
  switch (difficulty) {
    case 'beginner': return plains(seed, cols, rows);
    case 'standard': return peninsula(seed, cols, rows);
    case 'hell':     return island(seed, cols, rows);
  }
}

/** ワールド座標 (x, y) のタイルが海かどうかを判定する。Σ-3-c 以降で使う。 */
export function isSeaTile(terrain: TerrainTile[][], x: number, y: number): boolean {
  const col = Math.floor(x / TILE_SIZE);
  const row = Math.floor(y / TILE_SIZE);
  const t = terrain[row]?.[col];
  if (!t) return false;
  return t.waterLevel >= 0.5 || t.material === 'water';
}
