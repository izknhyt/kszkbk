import type { TraitId } from '../types';
import type { GlobalEvent } from './events';

// =========================================================================
// ちびわふ特性（trait）定義
//   色はリングレンダリングに使う（stage.ts からも参照）。
//   効果は P2-b で hazards.ts の traitMultipliers / requiresAnyTrait から
//   適用される（このファイルは純粋にメタデータ＋抽選のみ）。
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
  bouken:   { id: 'bouken',   name: '冒険家',       color: 0xe04e2c, baseWeight: 1.0 },
  gourmand: { id: 'gourmand', name: '食いしん坊',   color: 0xf2a030, baseWeight: 1.0 },
  shinpai:  { id: 'shinpai',  name: '心配性',       color: 0x5ab2e8, baseWeight: 1.0 },
  ukiyo:    { id: 'ukiyo',    name: '浮世離れ',     color: 0x9b6de2, baseWeight: 0.9 },
  ikusa:    { id: 'ikusa',    name: '戦闘狂',       color: 0xb50d37, baseWeight: 0.08, rare: true },
  noumin:   { id: 'noumin',   name: '農民気質',     color: 0x7aa65e, baseWeight: 1.0 },
};

// 出生時の特性数の重み（40% 無し、45% 1個、15% 2個）
const COUNT_WEIGHTS = [0.40, 0.45, 0.15];

export interface TraitEnv {
  buildingsNearFurana: number;   // 半径120 以内の建物数
  koubaLevel: number;            // 鍛冶場の level 合計
  cocoonNearFurana: boolean;     // ココンがフラナ近傍にいるか
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

// 環境バイアスで重みを一時的に足す。数値は ultraplan 記述どおり。
function applyEnvBias(weights: Record<TraitId, number>, env: TraitEnv) {
  if (env.buildingsNearFurana >= 2) weights.noumin += 0.20;
  if (env.koubaLevel >= 2)          weights.bouken += 0.15;
  if (env.cocoonNearFurana)         weights.ikusa  += 0.30;
  if (env.event === 'ondo' || env.event === 'taiko_festival') weights.ukiyo += 0.15;
}

export function rollTraits(env: TraitEnv): TraitId[] {
  const count = pickCount();
  if (count === 0) return [];
  const weights: Record<TraitId, number> = {
    bouken:   TRAIT_DEFS.bouken.baseWeight,
    gourmand: TRAIT_DEFS.gourmand.baseWeight,
    shinpai:  TRAIT_DEFS.shinpai.baseWeight,
    ukiyo:    TRAIT_DEFS.ukiyo.baseWeight,
    ikusa:    TRAIT_DEFS.ikusa.baseWeight,
    noumin:   TRAIT_DEFS.noumin.baseWeight,
  };
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
