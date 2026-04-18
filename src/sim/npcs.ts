import type { ChibiState, Vec2 } from '../types';

export type NpcId = 'suzu' | 'lou' | 'cocoon' | 'furana';

export interface NpcDef {
  id: NpcId;
  name: string;
  color: number;
  secondaryColor: number;
  scale: number;
  reactOnDeath: boolean;
  reactOnBirth: boolean;
  reactOnOndo: boolean;
  // HP（プレイヤー殴打・投げで減る）。0 でキャラ死亡。
  maxHp: number;
  // 死亡時の復活までの秒数（即復活なら小さい値、フラナは Infinity で蘇らない）
  respawnSec: number;
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
    maxHp: 30,
    respawnSec: 45,
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
    maxHp: 30,
    respawnSec: 45,
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
    maxHp: 40,
    respawnSec: 35,
  },
  furana: {
    id: 'furana',
    name: 'フラナ',
    color: 0xffffff,
    secondaryColor: 0xffc7b3,
    scale: 1.3,
    reactOnDeath: false,
    reactOnBirth: true,
    reactOnOndo: false,
    // 村の要。高耐久だが死んだら復活しない（Infinity）。
    maxHp: 220,
    respawnSec: Infinity,
  },
};

export interface NpcState {
  id: NpcId;
  pos: Vec2;
  home: Vec2;
  wanderTimer: number;
  // ココン（叩き）・フラナ（撫で or お仕置き）の発動クールダウン。秒。
  abuseCooldown: number;
  // --- P6: ココン死亡・復活 -------------------------------------------
  dead: boolean;          // true の間は wander/abuse を停止、描画も変わる
  respawnTimer: number;   // dead 時にカウントダウン。0 以下で復活（Infinity で復活しない）
  // HP。プレイヤーが殴る／投げる／振り回すで減少。
  hp: number;
  maxHp: number;
  // 表示用ステート（フラナのスプライト切替に使う。他NPCは現状描画に影響しない）
  state: ChibiState;
  stateTimer: number;
}

export const SUZU_LINES_DEATH = [
  'それ今やる!?',
  '点呼まだ途中!!',
  '数える前に死なないで',
  'ちょっと待って！',
  'また!?',
];

export const SUZU_LINES_BIRTH = [
  'ママまた生んだ〜',
  'ママ〜いちにさんし…もういいや',
  'ママ今月で何匹目〜',
];

export const SUZU_LINES_ONDO = [
  '踊るな！踊るな！',
  '音頭やめて！',
];

// フラナ（ママ）関連でスズが叫ぶ台詞。ママ呼びで統一。
export const SUZU_LINES_MAMA_HURT = [
  'ママ！？', 'ママに何するわふ！', 'やめて！ママ痛いって！',
];
export const SUZU_LINES_MAMA_DEATH = [
  'ママーーー！', 'ママ！！しんじゃうの！？', 'ママ…ママぁ…',
  'うそ…ママが…',
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

function mkNpc(id: NpcId, home: Vec2, abuseCooldown = 0): NpcState {
  const def = NPC_DEFS[id];
  return {
    id,
    home,
    pos: { ...home },
    wanderTimer: 0,
    abuseCooldown,
    dead: false,
    respawnTimer: 0,
    hp: def.maxHp,
    maxHp: def.maxHp,
    state: 'idle',
    stateTimer: 0,
  };
}

export function createNpcs(bounds: { w: number; h: number }): NpcState[] {
  return [
    mkNpc('furana', { x: bounds.w / 2, y: 220 }, 10),
    mkNpc('suzu',   { x: bounds.w * 0.25, y: 240 }),
    mkNpc('lou',    { x: bounds.w * 0.82, y: 180 }),
    mkNpc('cocoon', { x: bounds.w * 0.65, y: 300 }, 2),
  ];
}

export function wanderNpc(n: NpcState, dt: number) {
  n.wanderTimer -= dt;
  if (n.wanderTimer <= 0) {
    // id ごとに動きの range / テンポを変える
    let range = 40;
    let tempoMin = 1;
    let tempoMax = 4;
    if (n.id === 'cocoon') { range = 220; tempoMin = 1; tempoMax = 4; }
    else if (n.id === 'furana') { range = 70; tempoMin = 3; tempoMax = 7; }  // ゆったり歩き回る
    n.wanderTimer = tempoMin + Math.random() * (tempoMax - tempoMin);
    const dx = (Math.random() - 0.5) * range;
    const dy = (Math.random() - 0.5) * range;
    n.pos.x = n.home.x + dx;
    n.pos.y = n.home.y + dy;
  }
}

export function pickLine(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)]!;
}

// 各NPC共通の復活台詞（ココン/スズ/ルー 用）。id ごとに分岐させる。
export const COCOON_REVIVE_LINES = [
  'ただいま〜', 'あれ？ いきてる', 'なぜかいるわふ', 'ママぁ…もどってきた',
  'かえってきちゃった', '…？',
];
export const SUZU_REVIVE_LINES = [
  'あれ？生きてる', '点呼再開！', 'ママ心配かけた…', 'ふっかつ！',
];
export const LOU_REVIVE_LINES = [
  '……がぅ', '………', '……もそ',
];

// NPCId から復活台詞を返す
export function reviveLinesFor(id: NpcId): string[] {
  if (id === 'cocoon') return COCOON_REVIVE_LINES;
  if (id === 'suzu') return SUZU_REVIVE_LINES;
  if (id === 'lou') return LOU_REVIVE_LINES;
  // furana は復活しないのでここに来ないが、念のため
  return ['……'];
}

export const COCOON_DEATH_LINES = [
  'やられたー！', 'うぎゃー', 'ママぁ…しぬ…', 'ひどいわふ！',
  'ちびわふにまけた…',
];

// --- フラナ（ママ）のセリフ ----------------------------------------------
// フラナはちびわふに時々お仕置き（甘噛み・ぺちっ）する。そのときの台詞。
export const FURANA_LINES_PAT = [
  'こら〜', 'めっ', 'しずかに', 'こっちおいで',
  'だめよ', 'ぷんっ', 'もう〜', 'だーめ',
];

// 普段の独り言（のんびり）
export const FURANA_LINES_IDLE = [
  'ふぁ〜', 'みんな元気〜？', 'ねむいわね〜', 'おひるね〜',
  'ぬくいわ〜', 'おなかすいた〜',
];

// フラナが痛がる（プレイヤーに殴られた時）
export const FURANA_LINES_HURT = [
  'きゃっ！？', 'いた…！', 'なにするのぉ', 'やめなさい！',
  'うそでしょ…', 'あなた何者…', 'ひどっ',
];

// フラナがイライラしてちびわふを本気で殴る時
export const FURANA_LINES_ANGRY = [
  'うるさい！', 'しつこい！', 'いいかげんにして！', 'もう限界！',
  'どうしてこうなの…', 'だめって言ってるでしょ！', 'ぎゃー！',
];

// フラナの死亡台詞
export const FURANA_LINES_DEATH = [
  'みんな…ごめんね…', 'さよなら…', 'ママは…ここまでね…',
  '元気でね…', 'あぁ…',
];
