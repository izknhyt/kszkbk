import type { DeathCauseId, Vec2 } from '../types';
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
} as const;

export function buildingsToHazards(placed: { defId: string; pos: Vec2; level: number }[]): HazardZone[] {
  const out: HazardZone[] = [];
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i]!;
    const def = BUILDINGS[p.defId];
    if (!def?.hazard) continue;
    // Lv で危険度が伸びる：Lv1=1.0×, Lv2=1.2×, Lv3=1.4× レート。
    // 半径も微増（視覚的にも大きくなった建物が広く影響する）。
    // ※ Lv3 複数スタックで特定死因が支配的にならないよう、スケールは穏やかに。
    const lvMul = 0.8 + 0.2 * p.level;
    const radiusMul = 0.95 + 0.05 * p.level;
    const zone: HazardZone = {
      id: `${def.id}-${i}`,
      kind: 'circle',
      center: { ...p.pos },
      radius: def.hazard.radius * radiusMul,
      ratePerSec: def.hazard.ratePerSec * lvMul,
      causeId: def.hazard.causeId as DeathCauseId,
      bypassSafeZone: true,
      note: `${def.name}の危険地帯 (Lv${p.level})`,
    };
    if (def.hazard.traitMultipliers) zone.traitMultipliers = { ...def.hazard.traitMultipliers };
    if (def.hazard.requiresAnyTrait) zone.requiresAnyTrait = [...def.hazard.requiresAnyTrait];
    out.push(zone);
  }
  return out;
}
