import type { TraitId } from '../types';
import type { GlobalEvent } from './events';

// =========================================================================
// ちびわふ特性（trait）定義
//   20種類。色はリングレンダリングに使う。
//   効果の大半は personality.ts の TRAIT_BIAS から param に乗る形で反映される。
//   一部（bo_meijin の棒会議免疫、nakimushi の cry 頻度など）は world.ts 側で
//   追加の挙動が入る。
// =========================================================================

export interface TraitDef {
  id: TraitId;
  name: string;
  color: number;          // 足元リング色
  baseWeight: number;     // 抽選の基礎重み
  // rare=true の特性は baseWeight が小さい＋環境バイアスが強い時だけ実用的
  rare?: boolean;
}

export const TRAIT_DEFS: Record<TraitId, TraitDef> = {
  // --- コア6種 -----------------------------------------------------
  bouken:       { id: 'bouken',       name: '冒険家',       color: 0xe04e2c, baseWeight: 1.0 },
  gourmand:     { id: 'gourmand',     name: '食いしん坊',   color: 0xf2a030, baseWeight: 1.0 },
  shinpai:      { id: 'shinpai',      name: '心配性',       color: 0x5ab2e8, baseWeight: 1.0 },
  ukiyo:        { id: 'ukiyo',        name: '浮世離れ',     color: 0x9b6de2, baseWeight: 0.9 },
  ikusa:        { id: 'ikusa',        name: '戦闘狂',       color: 0xb50d37, baseWeight: 0.08, rare: true },
  noumin:       { id: 'noumin',       name: '農民気質',     color: 0x7aa65e, baseWeight: 1.0 },
  // --- 行動系 -------------------------------------------------------
  tabikko:      { id: 'tabikko',      name: '旅っ子',       color: 0x5b9cd5, baseWeight: 0.7 },
  gunsuki:      { id: 'gunsuki',      name: '群好き',       color: 0xf3c678, baseWeight: 0.9 },
  hitoribochi:  { id: 'hitoribochi',  name: '一人ぼっち',   color: 0x7a6f88, baseWeight: 0.8 },
  bo_suki:      { id: 'bo_suki',      name: '棒好き',       color: 0x8b5a2b, baseWeight: 0.7 },
  taiko_kko:    { id: 'taiko_kko',    name: '太鼓っ子',     color: 0xc05a3a, baseWeight: 0.6 },
  // --- 性格系 -------------------------------------------------------
  nonbiri:      { id: 'nonbiri',      name: 'のんき',       color: 0x9fc3a0, baseWeight: 0.9 },
  sekkachi:     { id: 'sekkachi',     name: 'せっかち',     color: 0xe87070, baseWeight: 0.9 },
  oshaberi:     { id: 'oshaberi',     name: 'おしゃべり',   color: 0xffb347, baseWeight: 0.9 },
  mukuchi:      { id: 'mukuchi',      name: '無口',         color: 0x555566, baseWeight: 0.8 },
  nakimushi:    { id: 'nakimushi',    name: '泣き虫',       color: 0x7ec4e8, baseWeight: 0.9 },
  // --- 体質系 -------------------------------------------------------
  tsuyoi:       { id: 'tsuyoi',       name: '丈夫',         color: 0x8a8a7a, baseWeight: 0.6 },
  yowai:        { id: 'yowai',        name: '虚弱',         color: 0xb0a5b8, baseWeight: 0.9 },
  morashi:      { id: 'morashi',      name: 'もらし常習',   color: 0xd4b070, baseWeight: 0.9 },
  // --- レア -------------------------------------------------------
  bo_meijin:    { id: 'bo_meijin',    name: '棒名人',       color: 0x3a6b2e, baseWeight: 0.05, rare: true },
  tetsugakusha: { id: 'tetsugakusha', name: '哲学者',       color: 0x4a3070, baseWeight: 0.06, rare: true },
};

// 出生時の特性数の重み（30% 無し、45% 1個、20% 2個、5% 3個）
const COUNT_WEIGHTS = [0.30, 0.45, 0.20, 0.05];

export interface TraitEnv {
  buildingsNearFurana: number;
  koubaLevel: number;
  cocoonNearFurana: boolean;
  event: GlobalEvent['kind'] | null;
}

function pickCount(): number {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < COUNT_WEIGHTS.length; i++) {
    acc += COUNT_WEIGHTS[i]!;
    if (r < acc) return i;
  }
  return COUNT_WEIGHTS.length - 1;
}

// 環境バイアス。数値は軽め（個体差ではなく傾向を作るため）。
function applyEnvBias(weights: Record<TraitId, number>, env: TraitEnv) {
  if (env.buildingsNearFurana >= 2) weights.noumin += 0.20;
  if (env.koubaLevel >= 2)          weights.bouken += 0.15;
  if (env.cocoonNearFurana)         weights.ikusa  += 0.30;
  if (env.event === 'ondo' || env.event === 'taiko_festival') {
    weights.ukiyo += 0.15;
    weights.taiko_kko += 0.25;
  }
  if (env.buildingsNearFurana >= 3) weights.noumin += 0.1;
}

function initWeights(): Record<TraitId, number> {
  const w = {} as Record<TraitId, number>;
  for (const id of Object.keys(TRAIT_DEFS) as TraitId[]) {
    w[id] = TRAIT_DEFS[id]!.baseWeight;
  }
  return w;
}

export function rollTraits(env: TraitEnv): TraitId[] {
  const count = pickCount();
  if (count === 0) return [];
  const weights = initWeights();
  applyEnvBias(weights, env);
  const picked: TraitId[] = [];
  const available = Object.keys(weights) as TraitId[];
  for (let i = 0; i < count; i++) {
    const pool = available.filter((t) => !picked.includes(t));
    if (pool.length === 0) break;
    const total = pool.reduce((a, t) => a + weights[t], 0);
    let r = Math.random() * total;
    for (const t of pool) {
      r -= weights[t];
      if (r < 0) { picked.push(t); break; }
    }
  }
  return picked;
}
