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
  maxBuildingLevel: 1 | 2 | 3;
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
    flavor: '始まりの集落。棒会議もまだ形だけ。',
    maxBuildingLevel: 1,
    check: () => true,
    progress: () => 1,
    requirement: '初期状態',
  },
  shuraku: {
    id: 'shuraku',
    name: '集落',
    flavor: '建物の Lv2 が解禁される。死因が増えて村の性格が出始める。',
    maxBuildingLevel: 2,
    check: (c) => c.totalDeaths >= 50,
    progress: (c) => Math.min(1, c.totalDeaths / 50),
    requirement: '累計死亡 50',
  },
  machi: {
    id: 'machi',
    name: '町',
    flavor: '建物の Lv3 が解禁される。村の伝承が成立し始める。',
    maxBuildingLevel: 3,
    check: (c) => c.totalDeaths >= 300 && c.uniqueDexFound >= 18,
    progress: (c) => Math.min(1, Math.min(c.totalDeaths / 300, c.uniqueDexFound / 18)),
    requirement: '累計死亡 300 & 図鑑 18 以上',
  },
  to: {
    id: 'to',
    name: 'くそざこ都',
    flavor: '完成形態。すべての死因を抱えた、くそざこの都。',
    maxBuildingLevel: 3,
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

export function maxBuildingLevel(rank: VillageRank): 1 | 2 | 3 {
  return RANK_DEFS[rank].maxBuildingLevel;
}

export function nextRank(current: VillageRank): VillageRank | null {
  const idx = RANK_ORDER.indexOf(current);
  return idx >= 0 && idx < RANK_ORDER.length - 1 ? RANK_ORDER[idx + 1]! : null;
}

// 建物アップグレードのコスト。Lv1→Lv2 と Lv2→Lv3 で指数的に伸ばす。
// cost = base * costGrowth^(current_level * 2)
export function upgradeCostFor(def: BuildingDef, currentLevel: number): number {
  return Math.round(def.cost * Math.pow(def.costGrowth, currentLevel * 2));
}
