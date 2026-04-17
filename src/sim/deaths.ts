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
  summer_boil: {
    id: 'summer_boil',
    title: '夏／沸騰池で煮え',
    rare: false,
    points: 14,
    template: (n) => `${n}は温泉と勘違いして沸騰寸前の泥水池に入り、そのまま出汁になった。`,
  },
  winter_snow: {
    id: 'winter_snow',
    title: '冬／雪を食べてそのまま',
    rare: false,
    points: 11,
    template: (n) => `${n}は雪を甘いと信じて食べ続け、内側から凍って動かなくなった。`,
  },
  spring_drunk: {
    id: 'spring_drunk',
    title: '春／泥水ビールで泥酔転倒',
    rare: false,
    points: 9,
    template: (n) => `${n}は花見のつもりで泥水ビールを一気飲みし、踊り出して即転倒した。`,
  },
  autumn_harvest: {
    id: 'autumn_harvest',
    title: '秋／棒会議農法で掘り出され',
    rare: false,
    points: 13,
    template: (n) => `${n}は収穫の最中、棒会議農法の一振りで根ごと掘り返された。`,
  },
} as const;

export const DEATH_IDS = Object.keys(DEATH_CAUSES) as Array<keyof typeof DEATH_CAUSES>;
