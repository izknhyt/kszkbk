// =========================================================================
// Σ-8-b A* pathfinding（タイルベース）
//
// SIGMA-8-DEVELOPMENT-SPEC.md §通行ルール / §A* Pathfinding に準拠。
// - 通行判定は隣接タイルで行う（bilinear slope では判定しない）
// - 4 方向、Manhattan ヒューリスティック、対角禁止
// - 1 タイル 1 ramp、ramp は「高い側」を向く
// - waterLevel >= 0.35、isSea、2 段差以上、不正 ramp は通行不可
// =========================================================================

import type { TerrainTile } from '../types';
import { CONFIG } from '../config';

const TILE_SIZE = 32;
const ELEV_STEP = CONFIG.ELEV_STEP;

export interface TilePoint { tx: number; ty: number; }

// =========================================================================
// 通行コスト（隣接 1 マス）
// =========================================================================
export function passCost(
  terrain: TerrainTile[][],
  fromTx: number, fromTy: number,
  toTx: number, toTy: number,
): number {
  const fromRow = terrain[fromTy];
  const toRow = terrain[toTy];
  if (!fromRow || !toRow) return Infinity;
  const from = fromRow[fromTx];
  const to = toRow[toTx];
  if (!from || !to) return Infinity;

  if (to.isSea) return Infinity;
  if (to.waterLevel >= 0.35) return Infinity;

  const absE = Math.abs(to.elev - from.elev);

  let baseCost: number;
  if (absE === 0) {
    baseCost = 1.0;
  } else if (absE === ELEV_STEP) {
    // 1 段差 → ramp 経由でのみ通行可
    if (canRampConnect(from, to, fromTx, fromTy, toTx, toTy)) {
      baseCost = 1.8;
    } else {
      return Infinity;
    }
  } else {
    // 2 段差以上 = 崖
    return Infinity;
  }

  // 表面状態の追加コスト
  baseCost += (to.mud ?? 0) * 2.0;
  baseCost += (to.snowCoverage ?? 0) * 1.5;
  return baseCost;
}

// 高い側を向く ramp の接続判定
function canRampConnect(
  from: TerrainTile, to: TerrainTile,
  fromTx: number, fromTy: number,
  toTx: number, toTy: number,
): boolean {
  const fromLower = from.elev < to.elev;
  const lower = fromLower ? from : to;
  const lTx = fromLower ? fromTx : toTx;
  const lTy = fromLower ? fromTy : toTy;
  const hTx = fromLower ? toTx : fromTx;
  const hTy = fromLower ? toTy : fromTy;
  if (!lower.ramp) return false;
  const dx = hTx - lTx;
  const dy = hTy - lTy;
  if (lower.ramp === 'N' && dx === 0 && dy === -1) return true;
  if (lower.ramp === 'S' && dx === 0 && dy === 1)  return true;
  if (lower.ramp === 'E' && dx === 1 && dy === 0)  return true;
  if (lower.ramp === 'W' && dx === -1 && dy === 0) return true;
  return false;
}

// =========================================================================
// Min-heap（priority, payload）— A* の open set 用
// =========================================================================
class MinHeap {
  private p: number[] = [];
  private v: number[] = [];
  push(pr: number, val: number) {
    this.p.push(pr);
    this.v.push(val);
    this.bubbleUp(this.p.length - 1);
  }
  pop(): { p: number; v: number } | null {
    if (this.p.length === 0) return null;
    const out = { p: this.p[0]!, v: this.v[0]! };
    const lastP = this.p.pop()!;
    const lastV = this.v.pop()!;
    if (this.p.length > 0) {
      this.p[0] = lastP;
      this.v[0] = lastV;
      this.sinkDown(0);
    }
    return out;
  }
  size(): number { return this.p.length; }
  private bubbleUp(i: number) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.p[parent]! <= this.p[i]!) break;
      const tp = this.p[i]!; this.p[i] = this.p[parent]!; this.p[parent] = tp;
      const tv = this.v[i]!; this.v[i] = this.v[parent]!; this.v[parent] = tv;
      i = parent;
    }
  }
  private sinkDown(i: number) {
    const n = this.p.length;
    while (true) {
      const l = i * 2 + 1, r = i * 2 + 2;
      let best = i;
      if (l < n && this.p[l]! < this.p[best]!) best = l;
      if (r < n && this.p[r]! < this.p[best]!) best = r;
      if (best === i) break;
      const tp = this.p[i]!; this.p[i] = this.p[best]!; this.p[best] = tp;
      const tv = this.v[i]!; this.v[i] = this.v[best]!; this.v[best] = tv;
      i = best;
    }
  }
}

// =========================================================================
// findPath: A* でタイル単位 waypoint 列を返す
// 失敗時は null。maxNodes を超える探索は打ち切る（孤立タイル/遠隔ターゲット保険）
// =========================================================================
export function findPath(
  terrain: TerrainTile[][],
  start: TilePoint, goal: TilePoint,
  maxNodes = 800,
): TilePoint[] | null {
  const ROWS = terrain.length;
  const COLS = terrain[0]?.length ?? 0;
  if (!ROWS || !COLS) return null;
  if (start.tx < 0 || start.tx >= COLS || start.ty < 0 || start.ty >= ROWS) return null;
  if (goal.tx < 0  || goal.tx >= COLS  || goal.ty < 0  || goal.ty >= ROWS)  return null;
  if (start.tx === goal.tx && start.ty === goal.ty) return [start];

  // 目標タイルが通行不可なら諦める
  const goalTile = terrain[goal.ty]![goal.tx]!;
  if (goalTile.isSea || goalTile.waterLevel >= 0.35) return null;

  const N = ROWS * COLS;
  const startKey = start.ty * COLS + start.tx;
  const goalKey  = goal.ty  * COLS + goal.tx;

  const gScore = new Float32Array(N);
  for (let i = 0; i < N; i++) gScore[i] = Infinity;
  const cameFrom = new Int32Array(N);
  for (let i = 0; i < N; i++) cameFrom[i] = -1;
  const closed = new Uint8Array(N);

  gScore[startKey] = 0;
  const open = new MinHeap();
  open.push(Math.abs(start.tx - goal.tx) + Math.abs(start.ty - goal.ty), startKey);

  let visited = 0;
  while (open.size() > 0 && visited < maxNodes) {
    const { v: cur } = open.pop()!;
    if (closed[cur]) continue;
    if (cur === goalKey) {
      // reconstruct
      const out: TilePoint[] = [];
      let k: number = cur;
      while (k !== -1) {
        out.push({ tx: k % COLS, ty: Math.floor(k / COLS) });
        if (k === startKey) break;
        k = cameFrom[k]!;
      }
      out.reverse();
      return out;
    }
    closed[cur] = 1;
    visited++;

    const cx = cur % COLS;
    const cy = Math.floor(cur / COLS);
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      const nk = ny * COLS + nx;
      if (closed[nk]) continue;
      const cost = passCost(terrain, cx, cy, nx, ny);
      if (!isFinite(cost)) continue;
      const tentative = gScore[cur]! + cost;
      if (tentative >= gScore[nk]!) continue;
      gScore[nk] = tentative;
      cameFrom[nk] = cur;
      const h = Math.abs(nx - goal.tx) + Math.abs(ny - goal.ty);
      open.push(tentative + h, nk);
    }
  }
  return null;
}

// =========================================================================
// world 座標 ↔ タイル座標ヘルパー
// =========================================================================
export function tileToWorld(p: TilePoint): { x: number; y: number } {
  return { x: (p.tx + 0.5) * TILE_SIZE, y: (p.ty + 0.5) * TILE_SIZE };
}

export function worldToTilePoint(x: number, y: number): TilePoint {
  return { tx: Math.floor(x / TILE_SIZE), ty: Math.floor(y / TILE_SIZE) };
}

// 計算済み path をワールド座標 waypoint 列に変換。
// 終端は呼び出し側で「最終 target」に差し替え推奨（タイル中心ではなく実際の目的地）。
export function pathToWorldWaypoints(path: TilePoint[]): Array<{ x: number; y: number }> {
  return path.map(tileToWorld);
}
