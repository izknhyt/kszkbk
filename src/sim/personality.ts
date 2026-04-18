import type { TraitId } from '../types';

// =========================================================================
// ちびわふ性格パラメータ（10軸 0-100）
//   各個体が生まれた時にロールし、挙動の"傾き"を連続値で決める。
//   機械特性（trait）は baseline を押し上げ／押し下げる修飾子として作用する。
//
//   値の意味：
//     courage  : 危険な場所（川・橋）へ行く傾向
//     appetite : 食事ポイント（石パン岩・泥水池）を目指す傾向
//     social   : すれ違い立ち話の発生頻度
//     focus    : wander target を長く持続、状態遷移の遅さ
//     energy   : 移動速度、idle の短さ
//     philo    : 哲学石で止まる頻度、哲学死率
//     luck     : ハザード判定の運（低=ハザードに引っかかりやすい）
//     tough    : 全死亡率の基礎低減
//     mama     : フラナからの距離制限（高いほど張り付く）
//     zako     : くそざこ度（連鎖事故を起こしやすい）
// =========================================================================

export interface ChibiParams {
  courage: number;
  appetite: number;
  social: number;
  focus: number;
  energy: number;
  philo: number;
  luck: number;
  tough: number;
  mama: number;
  zako: number;
}

export const PARAM_KEYS = [
  'courage', 'appetite', 'social', 'focus', 'energy',
  'philo', 'luck', 'tough', 'mama', 'zako',
] as const satisfies readonly (keyof ChibiParams)[];

export const PARAM_LABEL: Record<keyof ChibiParams, string> = {
  courage: '勇気',
  appetite: '食欲',
  social: '社交',
  focus: '集中',
  energy: '元気',
  philo: '哲学',
  luck: '運',
  tough: '丈夫',
  mama: 'ママ',
  zako: 'くそざこ',
};

export const PARAM_COLOR: Record<keyof ChibiParams, number> = {
  courage: 0xe04e2c,
  appetite: 0xf2a030,
  social: 0x5ab2e8,
  focus: 0x7d6cd6,
  energy: 0xffd35a,
  philo: 0x9b6de2,
  luck: 0x7aa65e,
  tough: 0x888888,
  mama: 0xe8735a,
  zako: 0x6b4a2b,
};

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

// Box-Muller approximation. N(mean, stddev) を 0-100 にクランプ。
function normal(mean: number, stddev: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return clamp(Math.round(mean + z * stddev));
}

export function rollParams(): ChibiParams {
  return {
    courage:  normal(50, 22),
    appetite: normal(50, 20),
    social:   normal(50, 22),
    focus:    normal(45, 20),   // くそざこ設定：集中力は全体的に低め
    energy:   normal(55, 18),
    philo:    normal(30, 22),   // 哲学者は少数派
    luck:     normal(40, 18),   // くそざこなので全体的に不運寄り
    tough:    normal(40, 20),   // 弱めに寄せる
    mama:     normal(55, 22),
    zako:     normal(65, 18),   // くそざこ度ベースで高め
  };
}

// 特性によるパラメータ補正。trait が決まった後に applyTraitBias() を呼ぶ。
// 同じ特性が複数の軸に効く（冒険家は勇気↑、ママ依存↓、元気↑）。
const TRAIT_BIAS: Partial<Record<TraitId, Partial<ChibiParams>>> = {
  // コア6
  bouken:       { courage: +30, mama: -25, energy: +15 },
  gourmand:     { appetite: +40, zako: +10 },
  shinpai:      { courage: -35, mama: +40, social: -10, tough: -10 },
  ukiyo:        { philo: +45, social: -20, energy: -20, focus: +15 },
  ikusa:        { courage: +40, social: -15, tough: +10, zako: +10 },
  noumin:       { focus: +20, appetite: +10, mama: -5 },
  // 行動系
  tabikko:      { courage: +20, mama: -40, energy: +10 },
  gunsuki:      { social: +40, mama: -5 },
  hitoribochi:  { social: -50, mama: -10, focus: +10 },
  bo_suki:      { courage: +15, zako: +20 },
  taiko_kko:    { focus: -20, zako: +25, social: +10 },
  // 性格系
  nonbiri:      { focus: +10, energy: -25, tough: +10 },
  sekkachi:     { energy: +30, focus: -20, courage: +10 },
  oshaberi:     { social: +45 },
  mukuchi:      { social: -45, focus: +15 },
  nakimushi:    { tough: -15, mama: +20, social: -5 },
  // 体質
  tsuyoi:       { tough: +40, energy: +10 },
  yowai:        { tough: -40, energy: -10 },
  morashi:      { zako: +30, social: -5, tough: -5 },
  // レア
  bo_meijin:    { courage: +30, tough: +25, focus: +25 },
  tetsugakusha: { philo: +60, social: -30, focus: +30, zako: +5 },
};

export function applyTraitBias(p: ChibiParams, traits: TraitId[]): ChibiParams {
  const out: ChibiParams = { ...p };
  for (const t of traits) {
    const bias = TRAIT_BIAS[t];
    if (!bias) continue;
    for (const [k, v] of Object.entries(bias) as [keyof ChibiParams, number][]) {
      out[k] = clamp(out[k] + v);
    }
  }
  return out;
}

// =========================================================================
// 派生値（挙動を計算するための util）
// =========================================================================

// 移動速度：energy だけで決まる。18-43 の範囲。
export function derivedSpeed(p: ChibiParams): number {
  return 18 + p.energy * 0.25;
}

// フラナからの許容距離：mama が高いほど小さい（＝強く張り付く）。
export function derivedMamaRadius(p: ChibiParams, worldMaxDim: number): number {
  const base = worldMaxDim * 0.35; // ワールド対角の ~35% が中央値
  const shrink = (p.mama / 100) * base * 0.8;
  return Math.max(50, base - shrink);
}

// 川に足を伸ばす確率（1回の target 抽選で）
export function derivedRiverTrespass(p: ChibiParams): number {
  return Math.max(0, Math.min(0.6, 0.04 + (p.courage - 40) * 0.006));
}

// すれ違い会話の発動確率（ちょい上げ、より発生しやすく）
export function derivedChatChance(p1: ChibiParams, p2: ChibiParams): number {
  const avg = (p1.social + p2.social) / 2;
  return Math.max(0.05, Math.min(0.7, 0.08 + avg * 0.006));
}

// 会話後のクールダウン秒。social 高いほど短い（どんどん喋る）。
export function derivedChatCooldown(p: ChibiParams): number {
  return Math.max(2, 8 - p.social * 0.07);
}

// 独り言（ambient speech）の 1tick あたり発生確率
// 社交が高いと少し出やすい。oshaberi 特性は別途上乗せで発生する。
export function derivedSoloSpeakChance(p: ChibiParams): number {
  return 0.0004 + p.social * 0.00004; // social 0→0.0004, social 100→0.0044
}

// 哲学石で止まる確率
export function derivedStareChance(p: ChibiParams): number {
  return Math.max(0.05, Math.min(0.85, 0.15 + p.philo * 0.006));
}

// 食事スポットで食事状態に入る確率
export function derivedEatChance(p: ChibiParams): number {
  return Math.max(0.1, Math.min(0.9, 0.2 + p.appetite * 0.005));
}

// 食事系・哲学死など個別ハザードを受ける時の倍率（luck / tough / zako から合成）
export function derivedHazardSusceptibility(p: ChibiParams): number {
  const luckPart = 1 + (50 - p.luck) * 0.008; // luck 低い→倍率↑
  const toughPart = 1 - (p.tough - 40) * 0.006;
  return Math.max(0.4, Math.min(2.0, luckPart * toughPart));
}
