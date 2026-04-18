import type { VillageRank } from '../types';
import type { BuildingDef } from '../city/buildings';

// =========================================================================
// 村ランク（4段階）
//   現在のランクは WorldState から RankContext を切り出して computeRank()
//   で計算する。循環インポートを避けるため、評価に必要な数値だけを渡す。
//   各ランクの到達条件・建物Lv上限・説明文は RANK_DEFS に集約。
// =========================================================================

export interface RankContext {
  totalDeaths: number;
  uniqueDexFound: number;
  stompCount: number;
}

export interface RankDef {
  id: VillageRank;
  name: string;
  flavor: string;
  maxBuildingLevel: number;
  check: (ctx: RankContext) => boolean;
  // 進捗ゲージ用：0〜1 の達成率を返す（1.0 で到達）
  progress: (ctx: RankContext) => number;
  // 到達条件の人間向け説明
  requirement: string;
}

export const RANK_ORDER: VillageRank[] = ['mura', 'shuraku', 'machi', 'to'];

export const RANK_DEFS: Record<VillageRank, RankDef> = {
  mura: {
    id: 'mura',
    name: '村',
    flavor: '始まりの集落。建物は Lv3 まで。',
    maxBuildingLevel: 3,
    check: () => true,
    progress: () => 1,
    requirement: '初期状態',
  },
  shuraku: {
    id: 'shuraku',
    name: '集落',
    flavor: '建物は Lv10 まで。',
    maxBuildingLevel: 10,
    check: (c) => c.totalDeaths >= 50,
    progress: (c) => Math.min(1, c.totalDeaths / 50),
    requirement: '累計死亡 50',
  },
  machi: {
    id: 'machi',
    name: '町',
    flavor: '建物は Lv30 まで。村の伝承が成立し始める。',
    maxBuildingLevel: 30,
    check: (c) => c.totalDeaths >= 300 && c.uniqueDexFound >= 18,
    progress: (c) => Math.min(1, Math.min(c.totalDeaths / 300, c.uniqueDexFound / 18)),
    requirement: '累計死亡 300 & 図鑑 18 以上',
  },
  to: {
    id: 'to',
    name: 'くそざこ都',
    flavor: '完成形態。Lv99 解禁。',
    maxBuildingLevel: 99,
    check: (c) => c.totalDeaths >= 1000 && c.uniqueDexFound >= 24 && c.stompCount >= 50,
    progress: (c) => Math.min(1, Math.min(c.totalDeaths / 1000, c.uniqueDexFound / 24, c.stompCount / 50)),
    requirement: '累計死亡 1000 & 全24図鑑 & 踏まれ 50',
  },
};

export function computeRank(ctx: RankContext): VillageRank {
  let highest: VillageRank = 'mura';
  for (const r of RANK_ORDER) {
    if (RANK_DEFS[r].check(ctx)) highest = r;
  }
  return highest;
}

export function maxBuildingLevel(rank: VillageRank): number {
  return RANK_DEFS[rank].maxBuildingLevel;
}

export function nextRank(current: VillageRank): VillageRank | null {
  const idx = RANK_ORDER.indexOf(current);
  return idx >= 0 && idx < RANK_ORDER.length - 1 ? RANK_ORDER[idx + 1]! : null;
}

// 建物アップグレードのコスト。
// 高レベル帯まで現実的にスケールするよう、level*0.6 の指数に緩和。
// cost = base * costGrowth^((level) * 0.6)
// 例 (noukou 40, growth 1.7):
//   Lv1→2: 56 / Lv5→6: 147 / Lv10→11: 553 / Lv30→31: 89K / Lv99→100: 巨大
export function upgradeCostFor(def: BuildingDef, currentLevel: number): number {
  return Math.round(def.cost * Math.pow(def.costGrowth, currentLevel * 0.6));
}
