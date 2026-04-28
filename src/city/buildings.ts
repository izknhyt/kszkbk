import type { Vec2 } from '../types';
import type { HazardZone } from '../sim/hazards';

export interface BuildingDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  costGrowth: number;
  effect: string;
  // 建物の周囲に発生するハザードを指定する。1建物1ゾーン。
  // 建てるたびに個別ゾーンが追加され、指数関数的に死に場所が増える。
  hazard?: Omit<HazardZone, 'id' | 'kind' | 'center' | 'radius' | 'rect'> & {
    radius: number;
  };
}

export const BUILDINGS: Record<string, BuildingDef> = {
  noukou: {
    id: 'noukou',
    name: '農業区（泥畑）',
    desc: '人口キャップ +4／自区画で「泥畑に埋もれ」事故発生',
    cost: 40,
    costGrowth: 1.7,
    effect: 'pop+4',
    hazard: {
      causeId: 'noukou_mud',
      ratePerSec: 0.06,
      radius: 38,
      traitMultipliers: { noumin: 1.5 },
    },
  },
  kouba: {
    id: 'kouba',
    name: '鍛冶場（くそざこ工業）',
    desc: '人口キャップ +3／火事の発生率UP／自区画で「火花発火」事故',
    cost: 90,
    costGrowth: 1.8,
    effect: 'pop+3',
    hazard: {
      causeId: 'kouba_spark',
      ratePerSec: 0.04,
      radius: 40,
      traitMultipliers: { noumin: 0.7 },
    },
  },
  hakaba: {
    id: 'hakaba',
    name: '墓地の拡張',
    desc: 'くそざこP獲得 +10%／村の敬意が深まる（ハザードなし）',
    cost: 60,
    costGrowth: 1.9,
    effect: 'pmult+0.10',
  },
  taiko: {
    id: 'taiko',
    name: 'わふ太鼓やぐら',
    desc: '音頭の発生率UP／人口キャップ +2／真下で「圧死」事故',
    cost: 130,
    costGrowth: 2.0,
    effect: 'pop+2',
    hazard: {
      causeId: 'taiko_crush',
      ratePerSec: 0.03,
      radius: 40,
    },
  },
  ubuya: {
    id: 'ubuya',
    name: '産屋（うぶや）',
    desc: 'フラナの出産速度 +18%（Lv ごとに加算）／ハザードなし',
    cost: 80,
    costGrowth: 1.85,
    // 'spawn+0.18' を applyBuildingMods がパースして spawnSpeedMultiplier に反映する
    effect: 'spawn+0.18',
  },
} as const;

export function buildingsToHazards(placed: { defId: string; pos: Vec2; level: number }[]): HazardZone[] {
  // M2.1 Step 4.3: 旧 BUILDINGS 起源のハザード（noukou_mud / kouba_spark /
  // taiko_crush 等）は新規発火停止。新 Feature 起源のハザードは別関数で管理する。
  // 既存セーブ由来の `placed` 配列は読み取りで残るが、ここから zone を出さない
  // ことで「既に建っている旧建物の周辺で死ぬ」事故が止まる。
  void placed;
  return [];
  // --- LEGACY M2.1 旧ロジック（unreachable、復元するならこのコメント解除）---
  /*
  const out: HazardZone[] = [];
  for (let i = 0; i < placed.length; i++) { ... }
  return out;
  */
}
