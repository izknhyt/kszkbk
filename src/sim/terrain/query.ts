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

/**
 * 指定した候補座標が海なら近傍の乾いたタイルを探して返す。
 * 最大 maxTries 回乱数で試して見つからなければ候補をそのまま返す（fallback）。
 *
 * @param cx     候補中心 X
 * @param cy     候補中心 Y
 * @param range  探索半径（px）
 * @param maxTries 試行回数
 */
export function findDryTile(
  cx: number,
  cy: number,
  range: number,
  maxTries = 40,
): { x: number; y: number } {
  if (!isSeaAt(cx, cy)) return { x: cx, y: cy };
  for (let i = 0; i < maxTries; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = (0.3 + Math.random() * 0.7) * range;
    const tx = cx + Math.cos(angle) * r;
    const ty = cy + Math.sin(angle) * r;
    if (!isSeaAt(tx, ty)) return { x: tx, y: ty };
  }
  return { x: cx, y: cy };
}
