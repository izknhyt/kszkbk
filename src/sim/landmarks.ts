import type { Season, Vec2 } from '../types';

// =========================================================================
// 活動スポット（ランドマーク）
//   ちびわふが「目的地」として向かうワールド上の固定点。
//   特性に応じた目的地を wanderStep が選ぶときの参照先になる。
//   見た目は stage.ts で render される（木札・小岩など）。
// =========================================================================

export type LandmarkKind =
  | 'stonebread_rock'   // 石パン岩（食いしん坊が寄る／誰でもたまに）
  | 'philosophy_stone'  // 哲学石（浮世離れが空を見上げる）
  | 'mudwater_pool'     // 泥水池（飲みに行く／夏は沸騰）
  | 'beer_barrel'       // 泥水ビール樽（春）
  | 'flower_patch'      // 花畑（春）
  | 'kusozako_totem';   // わふ棒（中央の村のシンボル、みんな時々集まる）

export interface Landmark {
  id: string;
  kind: LandmarkKind;
  pos: Vec2;
  // アクティブな季節（未指定=通年）
  seasons?: Season[];
  label: string;
}

// 既定のワールドレイアウト。createWorld の後に landmarkList() で取得する。
export function landmarkList(bounds: { w: number; h: number }): Landmark[] {
  return [
    {
      id: 'stonebread',
      kind: 'stonebread_rock',
      pos: { x: bounds.w * 0.18, y: 270 },
      label: '石パン岩',
    },
    {
      id: 'philosophy',
      kind: 'philosophy_stone',
      pos: { x: bounds.w * 0.88, y: 280 },
      label: '哲学石',
    },
    {
      id: 'mudpool',
      kind: 'mudwater_pool',
      pos: { x: bounds.w * 0.42, y: 370 },
      label: '泥水池',
    },
    {
      id: 'beer',
      kind: 'beer_barrel',
      pos: { x: bounds.w * 0.32, y: 260 },
      label: '泥水ビール樽',
      seasons: ['spring'],
    },
    {
      id: 'flowers',
      kind: 'flower_patch',
      pos: { x: bounds.w * 0.70, y: 310 },
      label: '花畑',
      seasons: ['spring'],
    },
    {
      id: 'totem',
      kind: 'kusozako_totem',
      pos: { x: bounds.w * 0.50, y: 280 },
      label: 'わふ棒（村の柱）',
    },
  ];
}

export function landmarkActive(l: Landmark, season: Season): boolean {
  return !l.seasons || l.seasons.includes(season);
}
