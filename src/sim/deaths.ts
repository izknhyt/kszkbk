import type { DeathCause } from '../types';

export const DEATH_CAUSES: Record<string, DeathCause> = {
  bokaigi: {
    id: 'bokaigi',
    title: '棒会議で極刑',
    rare: false,
    points: 12,
    template: (n) => `${n}は議題がわからないまま棒で殴られ続け倒れた。`,
  },
  ondo: {
    id: 'ondo',
    title: 'くそざこ音頭で転倒',
    rare: false,
    points: 8,
    template: (n) => `${n}は音頭の最中に前の個体の足に引っかかり転倒、動かなくなった。`,
  },
  mudriver: {
    id: 'mudriver',
    title: '泥川溺水',
    rare: false,
    points: 6,
    template: (n) => `${n}は泥川の光る何かに吸い寄せられ、静かに沈んだ。`,
  },
  stonebread: {
    id: 'stonebread',
    title: '石パンで歯折れ',
    rare: false,
    points: 7,
    template: (n) => `${n}は石パンに噛みつき、歯と意識を同時に失った。`,
  },
  bridge: {
    id: 'bridge',
    title: '丸太橋崩壊',
    rare: false,
    points: 9,
    template: (n) => `${n}が渡り始めた直後、橋は泥川へ帰っていった。`,
  },
  fire: {
    id: 'fire',
    title: '鍛冶場からの延焼',
    rare: false,
    points: 10,
    template: (n) => `${n}は火事の方向へ行き、火事の方向から戻って来なかった。`,
  },
  roushuai: {
    id: 'roushuai',
    title: '老衰（くそざこ寿命）',
    rare: false,
    points: 4,
    template: (n) => `${n}はまもりんを握りしめ、わふっと呟いて息絶えた。`,
  },
  philosophy: {
    id: 'philosophy',
    title: 'なぜわふ…で干からび',
    rare: true,
    points: 25,
    template: (n) => `${n}は「なぜわふ…」と立ち止まり、そのまま三日干からびた。`,
  },
} as const;

export const DEATH_IDS = Object.keys(DEATH_CAUSES) as Array<keyof typeof DEATH_CAUSES>;
