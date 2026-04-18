import type { DeathCauseId, Season, TraitId, Vec2 } from '../types';
import type { GlobalEvent } from './events';

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
//
// --- Trait-aware 拡張（P2-b）---------------------------------------------
//   requiresAnyTrait : いずれかの特性を持つちびわふにしか発動しない
//   traitMultipliers : 特性ごとの rate 倍率（全員発動、一部だけ倍率UP/DOWN）
//   requiresEvent    : 指定 kind の global event 中だけ発動
//   requiresYoungSec : 生後この秒数未満のちびわふのみ対象
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
  // trait / event gates
  requiresAnyTrait?: TraitId[];
  traitMultipliers?: Partial<Record<TraitId, number>>;
  requiresEvent?: GlobalEvent['kind'];
  requiresYoungSec?: number;
}

export const HAZARDS: HazardZone[] = [
  // 特性ゲート付きのゾーンは先に評価する（共通ゾーンに吸収されないよう順序を前に）。
  // runHazards は「最初に判定が通ったゾーン」で kill するため、trait 特化のものを優先。
  {
    id: 'bouken_cliff',
    causeId: 'bouken_cliff',
    kind: 'rect',
    rect: { x: 0, y: 420, w: 9999, h: 9999 },
    ratePerSec: 3.0, // bridge (4.0) と競合するので高めに設定
    seasons: ['spring'],
    bypassSafeZone: true,
    requiresAnyTrait: ['bouken'],
    note: '春の川奥を覗く冒険家が墜落（bridge/mudriver と競合、順序で先に評価）',
  },
  {
    id: 'mudriver',
    causeId: 'mudriver',
    kind: 'rect',
    rect: { x: 0, y: 414, w: 9999, h: 9999 },
    ratePerSec: 0.35,
    traitMultipliers: { bouken: 1.5 },
    note: '泥川 — 冒険家は1.5倍の確率で溺れる',
  },
  {
    id: 'bridge',
    causeId: 'bridge',
    kind: 'rect',
    rect: { x: 178, y: 385, w: 34, h: 58 },
    ratePerSec: 4.0,
    traitMultipliers: { bouken: 1.5 },
    note: '丸太橋 — 渡ろうとすると落ちる（通過時間が短いので rate を高く）',
  },
  {
    id: 'stonebread',
    causeId: 'stonebread',
    kind: 'random',
    ratePerSec: 0.006,
    bypassSafeZone: true,
    traitMultipliers: { gourmand: 2.0, shinpai: 0.5 },
    note: '拾った石パンで歯折れ（食いしん坊2倍／心配性は避ける）',
  },
  {
    id: 'philosophy',
    causeId: 'philosophy',
    kind: 'random',
    ratePerSec: 0.0015,
    bypassSafeZone: true,
    traitMultipliers: { ukiyo: 2.0, shinpai: 0.5 },
    note: '「なぜわふ…」で静止→干からび（浮世離れ2倍）',
  },
  // --- 季節ゲート -----------------------------------------------------------
  {
    id: 'summer_boil',
    causeId: 'summer_boil',
    kind: 'random',
    ratePerSec: 0.006,
    seasons: ['summer'],
    bypassSafeZone: true,
    traitMultipliers: { gourmand: 2.0, shinpai: 0.5 },
    note: '夏 — 沸騰寸前の泥水池で煮え',
  },
  {
    id: 'winter_snow',
    causeId: 'winter_snow',
    kind: 'random',
    ratePerSec: 0.005,
    seasons: ['winter'],
    bypassSafeZone: true,
    traitMultipliers: { gourmand: 2.0, shinpai: 0.5 },
    note: '冬 — 雪を食べて倒れる',
  },
  {
    id: 'spring_drunk',
    causeId: 'spring_drunk',
    kind: 'random',
    ratePerSec: 0.004,
    seasons: ['spring'],
    bypassSafeZone: true,
    traitMultipliers: { shinpai: 0.5 },
    note: '春 — 泥水ビールで泥酔転倒',
  },
  {
    id: 'autumn_harvest',
    causeId: 'autumn_harvest',
    kind: 'random',
    ratePerSec: 0.005,
    seasons: ['autumn'],
    bypassSafeZone: true,
    traitMultipliers: { shinpai: 0.5 },
    note: '秋 — 棒会議農法で根ごと掘り返され巻添え',
  },

  // =========================================================================
  // Uncommon 死因 — 特性 × 状況で解禁されるゾーン
  //   bouken_cliff は配列先頭に移動済み（mudriver との順序優先）。
  // =========================================================================
  {
    id: 'gourmand_choke',
    causeId: 'gourmand_choke',
    kind: 'random',
    ratePerSec: 0.009,
    bypassSafeZone: true,
    requiresAnyTrait: ['gourmand'],
    note: '食いしん坊の早食い事故',
  },
  {
    id: 'shinpai_kashou',
    causeId: 'shinpai_kashou',
    kind: 'random',
    ratePerSec: 0.025,
    bypassSafeZone: true,
    requiresAnyTrait: ['shinpai'],
    requiresEvent: 'ondo',
    note: '音頭中の心配性が過呼吸',
  },
  {
    id: 'ukiyo_shoushitsu',
    causeId: 'ukiyo_shoushitsu',
    kind: 'random',
    ratePerSec: 0.003,
    bypassSafeZone: true,
    requiresAnyTrait: ['ukiyo'],
    note: '浮世離れが輪郭を失う',
  },
  {
    id: 'noumin_umore',
    causeId: 'noumin_umore',
    kind: 'random',
    ratePerSec: 0.012,
    seasons: ['autumn'],
    bypassSafeZone: true,
    requiresAnyTrait: ['noumin'],
    note: '秋の収穫祭で農民気質が自ら埋まる',
  },
  {
    id: 'taiko_tobikomi',
    causeId: 'taiko_tobikomi',
    kind: 'random',
    ratePerSec: 0.05,
    bypassSafeZone: true,
    requiresAnyTrait: ['bouken', 'ikusa', 'taiko_kko'],
    requiresEvent: 'taiko_festival',
    note: '太鼓祭にテンション上がった冒険家／戦闘狂／太鼓っ子がやぐらに飛び込む',
  },
  {
    id: 'suzu_kazoe_shikujiri',
    causeId: 'suzu_kazoe_shikujiri',
    kind: 'random',
    ratePerSec: 0.012,
    bypassSafeZone: true,
    requiresYoungSec: 4,
    note: '生後4秒以内に消えてしまい、スズの点呼に間に合わない',
  },

  // P6 追加 Uncommon
  {
    id: 'morashi_fall',
    causeId: 'morashi_fall',
    kind: 'random',
    ratePerSec: 0.006,
    bypassSafeZone: true,
    requiresAnyTrait: ['morashi'],
    note: 'もらし常習が自分の水たまりで滑って溺れる',
  },
  {
    id: 'oshaberi_choked',
    causeId: 'oshaberi_choked',
    kind: 'random',
    ratePerSec: 0.025,
    bypassSafeZone: true,
    requiresAnyTrait: ['oshaberi'],
    requiresEvent: 'ondo',
    note: 'おしゃべりが音頭中に喋り過ぎて息切れ',
  },
  {
    id: 'tabikko_boundary',
    causeId: 'tabikko_boundary',
    kind: 'rect',
    rect: { x: 0, y: 0, w: 60, h: 9999 },
    ratePerSec: 0.08,
    bypassSafeZone: true,
    requiresAnyTrait: ['tabikko'],
    note: 'ワールド左端に到達した旅っ子が行方不明になる',
  },
  {
    id: 'tabikko_boundary_r',
    causeId: 'tabikko_boundary',
    kind: 'rect',
    rect: { x: 1040, y: 0, w: 200, h: 9999 }, // WORLD_W=1100 のほぼ右端
    ratePerSec: 0.08,
    bypassSafeZone: true,
    requiresAnyTrait: ['tabikko'],
    note: 'ワールド右端に到達した旅っ子が行方不明になる',
  },
  {
    id: 'tetsugakusha_shoushitsu',
    causeId: 'tetsugakusha_shoushitsu',
    kind: 'random',
    ratePerSec: 0.008,
    bypassSafeZone: true,
    requiresAnyTrait: ['tetsugakusha'],
    note: '哲学者が深く考えすぎて消える',
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
