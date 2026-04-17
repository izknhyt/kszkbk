import type { Vec2 } from '../types';

export type NpcId = 'suzu' | 'lou' | 'cocoon';

export interface NpcDef {
  id: NpcId;
  name: string;
  color: number;
  secondaryColor: number;
  scale: number;
  reactOnDeath: boolean;
  reactOnBirth: boolean;
  reactOnOndo: boolean;
}

export const NPC_DEFS: Record<NpcId, NpcDef> = {
  suzu: {
    id: 'suzu',
    name: 'スズ',
    color: 0xffe4e1,
    secondaryColor: 0xffb6c1,
    scale: 0.85,
    reactOnDeath: true,
    reactOnBirth: true,
    reactOnOndo: true,
  },
  lou: {
    id: 'lou',
    name: 'ルー',
    color: 0xcccccc,
    secondaryColor: 0x888888,
    scale: 1.0,
    reactOnDeath: false,
    reactOnBirth: false,
    reactOnOndo: false,
  },
  cocoon: {
    id: 'cocoon',
    name: 'ココン',
    color: 0xffb347,
    secondaryColor: 0xff7e3a,
    scale: 0.9,
    reactOnDeath: true,
    reactOnBirth: false,
    reactOnOndo: false,
  },
};

export interface NpcState {
  id: NpcId;
  pos: Vec2;
  home: Vec2;
  wanderTimer: number;
  abuseCooldown: number; // ココン専用
}

export const SUZU_LINES_DEATH = [
  'それ今やる!?',
  '点呼まだ途中!!',
  '数える前に死なないで',
  'ちょっと待って！',
  'また!?',
];

export const SUZU_LINES_BIRTH = [
  'また生まれた〜',
  'いちにさんし…もういいや',
  '今月で何匹目…',
];

export const SUZU_LINES_ONDO = [
  '踊るな！踊るな！',
  '音頭やめて！',
];

export const COCOON_LINES_DEATH = [
  'やだー！ママー！',
  'ちびわふこわい…',
  '棒返して！',
];

export const COCOON_LINES_ABUSE = [
  'ふんっ！',
  'どけどけ〜',
  'ママに言うよ！',
];

export const LOU_LINES = ['……がぅ'];

export function createNpcs(bounds: { w: number; h: number }): NpcState[] {
  return [
    {
      id: 'suzu',
      home: { x: bounds.w * 0.25, y: 240 },
      pos: { x: bounds.w * 0.25, y: 240 },
      wanderTimer: 0,
      abuseCooldown: 0,
    },
    {
      id: 'lou',
      home: { x: bounds.w * 0.82, y: 180 },
      pos: { x: bounds.w * 0.82, y: 180 },
      wanderTimer: 0,
      abuseCooldown: 0,
    },
    {
      id: 'cocoon',
      home: { x: bounds.w * 0.65, y: 300 },
      pos: { x: bounds.w * 0.65, y: 300 },
      wanderTimer: 0,
      abuseCooldown: 5,
    },
  ];
}

export function wanderNpc(n: NpcState, dt: number) {
  n.wanderTimer -= dt;
  if (n.wanderTimer <= 0) {
    n.wanderTimer = 1 + Math.random() * 3;
    const dx = (Math.random() - 0.5) * 40;
    const dy = (Math.random() - 0.5) * 40;
    n.pos.x = n.home.x + dx;
    n.pos.y = n.home.y + dy;
  }
}

export function pickLine(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)]!;
}
