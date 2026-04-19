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
  // 広いマップなので上下も散らす（h 割合を使う）
  return [
    {
      id: 'stonebread',
      kind: 'stonebread_rock',
      pos: { x: bounds.w * 0.18, y: bounds.h * 0.28 },
      label: '石パン岩',
    },
    {
      id: 'philosophy',
      kind: 'philosophy_stone',
      pos: { x: bounds.w * 0.88, y: bounds.h * 0.30 },
      label: '哲学石',
    },
    {
      id: 'mudpool',
      kind: 'mudwater_pool',
      pos: { x: bounds.w * 0.42, y: bounds.h * 0.55 },
      label: '泥水池',
    },
    {
      id: 'beer',
      kind: 'beer_barrel',
      pos: { x: bounds.w * 0.32, y: bounds.h * 0.25 },
      label: '泥水ビール樽',
      seasons: ['spring'],
    },
    {
      id: 'flowers',
      kind: 'flower_patch',
      pos: { x: bounds.w * 0.70, y: bounds.h * 0.42 },
      label: '花畑',
      seasons: ['spring'],
    },
    {
      id: 'totem',
      kind: 'kusozako_totem',
      pos: { x: bounds.w * 0.50, y: bounds.h * 0.32 },
      label: 'わふ棒（村の柱）',
    },
  ];
}

export function landmarkActive(l: Landmark, season: Season): boolean {
  return !l.seasons || l.seasons.includes(season);
}
