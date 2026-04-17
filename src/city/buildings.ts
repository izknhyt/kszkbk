import type { BuildingDef } from '../types';

export const BUILDINGS: Record<string, BuildingDef> = {
  noukou: {
    id: 'noukou',
    name: '農業区（泥畑）',
    desc: '人口キャップ +4、石パン食中毒率 UP',
    cost: 40,
    costGrowth: 1.7,
    effect: 'pop+4, eat+',
  },
  kouba: {
    id: 'kouba',
    name: '鍛冶場（くそざこ工業）',
    desc: '人口キャップ +3、火事の発生率 UP',
    cost: 90,
    costGrowth: 1.8,
    effect: 'pop+3, fire+',
  },
  hakaba: {
    id: 'hakaba',
    name: '墓地の拡張',
    desc: 'くそざこP獲得 +10%／建てるほど村の敬意が深まる',
    cost: 60,
    costGrowth: 1.9,
    effect: 'pmult+0.10',
  },
  taiko: {
    id: 'taiko',
    name: 'わふ太鼓やぐら',
    desc: '音頭イベント発生率 UP、人口キャップ +2',
    cost: 130,
    costGrowth: 2.0,
    effect: 'pop+2, ondo+',
  },
} as const;
