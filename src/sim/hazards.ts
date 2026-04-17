import type { DeathCauseId, Season, Vec2 } from '../types';

// =========================================================================
// ハザード＝データ定義
//   村の「ここに行くと死ぬ」を zones として列挙する。
//   新しい危険を足したい時はこの配列に1つ追加するだけでOK。
//
//   kind:
//     - 'circle'   指定座標から radius 内で判定
//     - 'rect'     指定矩形内で判定
//     - 'random'   場所問わず毎tickでランダム抽選（季節ゲート用）
//   seasons: 未指定なら全季節でアクティブ
//   ratePerSec: 1秒あたりの死亡確率（個体ごと）。tick内で dt を掛けて評価。
//   bypassSafeZone: true なら安全ゾーン無視（＝どこでも発動）。
// =========================================================================

export interface HazardZone {
  id: string;
  causeId: DeathCauseId;
  kind: 'circle' | 'rect' | 'random';
  // circle
  center?: Vec2;
  radius?: number;
  // rect
  rect?: { x: number; y: number; w: number; h: number };
  // common
  ratePerSec: number;
  seasons?: Season[];
  bypassSafeZone?: boolean;
  note?: string;
}

export const HAZARDS: HazardZone[] = [
  {
    id: 'mudriver',
    causeId: 'mudriver',
    kind: 'rect',
    rect: { x: 0, y: 414, w: 9999, h: 9999 },
    ratePerSec: 0.35,
    note: '泥川 — 踏み込んだちびわふは溺れる',
  },
  {
    id: 'bridge',
    causeId: 'bridge',
    kind: 'rect',
    rect: { x: 182, y: 390, w: 30, h: 50 },
    ratePerSec: 0.28,
    note: '丸太橋 — 渡ろうとすると落ちる',
  },
  {
    id: 'stonebread',
    causeId: 'stonebread',
    kind: 'random',
    ratePerSec: 0.006,
    bypassSafeZone: true,
    note: '拾った石パンで歯折れ',
  },
  {
    id: 'philosophy',
    causeId: 'philosophy',
    kind: 'random',
    ratePerSec: 0.0015,
    bypassSafeZone: true,
    note: '「なぜわふ…」で静止→干からび',
  },
  // --- 季節ゲート -----------------------------------------------------------
  {
    id: 'summer_boil',
    causeId: 'summer_boil',
    kind: 'random',
    ratePerSec: 0.006,
    seasons: ['summer'],
    bypassSafeZone: true,
    note: '夏 — 沸騰寸前の泥水池で煮え',
  },
  {
    id: 'winter_snow',
    causeId: 'winter_snow',
    kind: 'random',
    ratePerSec: 0.005,
    seasons: ['winter'],
    bypassSafeZone: true,
    note: '冬 — 雪を食べて倒れる',
  },
  {
    id: 'spring_drunk',
    causeId: 'spring_drunk',
    kind: 'random',
    ratePerSec: 0.004,
    seasons: ['spring'],
    bypassSafeZone: true,
    note: '春 — 泥水ビールで泥酔転倒',
  },
  {
    id: 'autumn_harvest',
    causeId: 'autumn_harvest',
    kind: 'random',
    ratePerSec: 0.005,
    seasons: ['autumn'],
    bypassSafeZone: true,
    note: '秋 — 棒会議農法で根ごと掘り返され巻添え',
  },
];

export function hazardActiveInSeason(zone: HazardZone, season: Season): boolean {
  return !zone.seasons || zone.seasons.includes(season);
}

export function pointInZone(zone: HazardZone, p: Vec2): boolean {
  if (zone.kind === 'random') return true;
  if (zone.kind === 'circle') {
    if (!zone.center || zone.radius == null) return false;
    const dx = p.x - zone.center.x;
    const dy = p.y - zone.center.y;
    return dx * dx + dy * dy <= zone.radius * zone.radius;
  }
  if (zone.kind === 'rect') {
    const r = zone.rect;
    if (!r) return false;
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }
  return false;
}
