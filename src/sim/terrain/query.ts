// 地形タイル状態の共有クエリ。
// world.ts と chibiwafu.ts の循環 import を避けるため、
// アクティブ地形への参照をここに一元管理する。

import type { RampDir, TerrainTile } from '../../types';
import { CONFIG } from '../../config';

const TILE_SIZE = 32;
const ELEV_STEP = CONFIG.ELEV_STEP;

// ramp 方向 + コーナー → そのコーナーが「高い側 (elev + STEP)」か「低い側 (elev)」か。
// 高い側 = 「ramp が向く方向」のコーナー 2 つ。
function isHighCorner(ramp: RampDir, isNorth: boolean, isEast: boolean): boolean {
  switch (ramp) {
    case 'N': return isNorth;
    case 'S': return !isNorth;
    case 'E': return isEast;
    case 'W': return !isEast;
  }
}

// タイルのコーナー (NW/NE/SW/SE) における ramp 加味済 elev を返す。
function tileCornerElev(tile: TerrainTile, isNorth: boolean, isEast: boolean): number {
  if (!tile.ramp) return tile.elev;
  return isHighCorner(tile.ramp, isNorth, isEast) ? tile.elev + ELEV_STEP : tile.elev;
}

/**
 * 共通 elevAt：sim と render が同じ地形ルールを見るための surface 高さ。
 *
 * Σ-8-c per-tile geometry に同期：
 *   - flat タイル (ramp なし): tile.elev 固定（タイル内は完全平面）
 *   - ramp タイル: 4 corner elev を対角線 NE-SW で 2 三角形分割した barycentric 補間
 *
 * これで描画メッシュ表面と sim 側 path/水流/cliff_fall 判定が完全に一致する。
 * 旧 world.ts#getElevation の bilinear や stage3d.ts の max-of-neighbors とは決別。
 *
 * 戻り値は terrain の生 elev（0-255 スケール）。描画側で ELEV_SCALE を掛ける。
 */
export function elevAtTileSurface(terrain: TerrainTile[][], wx: number, wy: number): number {
  const ROWS = terrain.length;
  const COLS = terrain[0]?.length ?? 0;
  if (ROWS === 0 || COLS === 0) return 0;
  const tx = Math.max(0, Math.min(COLS - 1, Math.floor(wx / TILE_SIZE)));
  const ty = Math.max(0, Math.min(ROWS - 1, Math.floor(wy / TILE_SIZE)));
  const tile = terrain[ty]![tx]!;
  if (!tile.ramp) return tile.elev;
  const fu = Math.max(0, Math.min(1, (wx - tx * TILE_SIZE) / TILE_SIZE));
  const fv = Math.max(0, Math.min(1, (wy - ty * TILE_SIZE) / TILE_SIZE));
  // corner elev：fv は南へ増えるので isNorth = (corner row == top)
  const eNW = tileCornerElev(tile, true,  false);
  const eNE = tileCornerElev(tile, true,  true);
  const eSW = tileCornerElev(tile, false, false);
  const eSE = tileCornerElev(tile, false, true);
  // 対角線 NE-SW で分割：fu + fv < 1 → NW三角 / 以上 → SE三角
  if (fu + fv < 1) {
    return eNW * (1 - fu - fv) + eSW * fv + eNE * fu;
  } else {
    return eNE * (1 - fv) + eSW * (1 - fu) + eSE * (fu + fv - 1);
  }
}

let _terrain: TerrainTile[][] | null = null;

export function setQueryTerrain(t: TerrainTile[][]): void {
  _terrain = t;
}

/**
 * ワールド座標 (x, y) が海タイルかどうか（永続的な海/水路）。
 * 雨水の dynamic な waterLevel は含まない（Σ-7 で waterLevel が連続値化したため、
 * これを含むと陸地の水たまりが海ハザード mudriver/bridge を誘発する）。
 * 雨水での溺死は drown_pond 死因が別途担当。
 * Σ-8 で TerrainTile.isSea へ移行（旧 material==='water' の判定を置換）。
 * アクティブ地形がない場合は旧 DRY_Y_LIMIT でフォールバック。
 */
export function isSeaAt(x: number, y: number): boolean {
  if (_terrain) {
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    const t = _terrain[row]?.[col];
    if (t) return t.isSea;
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
