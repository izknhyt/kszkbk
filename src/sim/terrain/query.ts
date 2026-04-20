// 地形タイル状態の共有クエリ。
// world.ts と chibiwafu.ts の循環 import を避けるため、
// アクティブ地形への参照をここに一元管理する。

import type { TerrainTile } from '../../types';
import { CONFIG } from '../../config';

const TILE_SIZE = 32;

let _terrain: TerrainTile[][] | null = null;

export function setQueryTerrain(t: TerrainTile[][]): void {
  _terrain = t;
}

/**
 * ワールド座標 (x, y) が海タイルかどうか。
 * アクティブ地形がない場合は旧 DRY_Y_LIMIT でフォールバック。
 */
export function isSeaAt(x: number, y: number): boolean {
  if (_terrain) {
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    const t = _terrain[row]?.[col];
    if (t) return t.waterLevel >= 0.5 || t.material === 'water';
  }
  return y > CONFIG.DRY_Y_LIMIT;
}
