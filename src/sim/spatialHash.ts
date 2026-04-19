import type { Chibiwafu, Vec2 } from '../types';

// 2D 空間分割ハッシュ。セルサイズ 100px でマップを格子状に区切り、
// 各セルにちびわふ配列を保持する。近傍検索は O(cells) になる。
// 探索半径 R に対し、セルサイズ >= R なら自分 + 周囲 3x3 の 9 セルで全候補を包含。
// R がセルサイズを超える場合は span で拡張する（ceil(R / cellSize)）。
export class SpatialHash {
  readonly cellSize: number;
  private buckets = new Map<string, Chibiwafu[]>();

  constructor(cellSize = 100) {
    this.cellSize = cellSize;
  }

  clear(): void {
    this.buckets.clear();
  }

  private keyFor(x: number, y: number): string {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }

  add(c: Chibiwafu): void {
    const key = this.keyFor(c.pos.x, c.pos.y);
    let list = this.buckets.get(key);
    if (!list) {
      list = [];
      this.buckets.set(key, list);
    }
    list.push(c);
  }

  rebuild(chibis: Iterable<Chibiwafu>): void {
    this.clear();
    for (const c of chibis) {
      this.add(c);
    }
  }

  // pos から radius 以内の "候補" を返す。呼び出し側は正確な距離判定を改めて行うこと。
  // 候補には exclude があれば除外。
  nearby(pos: Vec2, radius: number, exclude?: Chibiwafu): Chibiwafu[] {
    const result: Chibiwafu[] = [];
    const cx = Math.floor(pos.x / this.cellSize);
    const cy = Math.floor(pos.y / this.cellSize);
    const span = Math.max(1, Math.ceil(radius / this.cellSize));
    for (let dy = -span; dy <= span; dy++) {
      for (let dx = -span; dx <= span; dx++) {
        const list = this.buckets.get(`${cx + dx},${cy + dy}`);
        if (!list) continue;
        for (const c of list) {
          if (c === exclude) continue;
          result.push(c);
        }
      }
    }
    return result;
  }
}
