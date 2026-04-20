import type { ChibiState, FlightState, LifeEvent, Vec2 } from '../types';
import { findDryTile } from './terrain/query';

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
    // reactOnDeath は使われない（reactNpcsToDeath 内でフラナ専用分岐あり）
    reactOnDeath: false,
    reactOnBirth: true,
    reactOnOndo: false,
    // 村の要。高耐久。死ぬと村はパニック＋出産停止になるが、75秒で戻ってくる。
    maxHp: 220,
    respawnSec: 75,
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
  // 目的地（フラナはここへ向かって徐々に歩く。null なら停止中）
  target: Vec2 | null;
  // 移動速度（px/sec）。フラナのみ使用（他NPCはテレポート wanderNpc）
  speed: number;
  // 画像の左右反転フラグ
  faceLeft: boolean;
  // フラナの機嫌 0-100。他NPCは未使用だが一応持たせる。
  // 殴られる/うるさい/イベントで下がり、時間経過で 70 に向けて戻る。
  mood: number;
  // 最近の出来事（右クリックモーダル用、最大 20 件）
  lifeLog: LifeEvent[];
  // 投げられて飛行中（null = 地上）
  flight: FlightState | null;
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
    target: null,
    speed: id === 'furana' ? 22 : 0,
    faceLeft: false,
    mood: 70,
    lifeLog: [],
    flight: null,
  };
}

// NPC の lifeLog に 1 行追加（上限 20、古い物から削除）
export function pushNpcLife(n: NpcState, sec: number, text: string) {
  n.lifeLog.push({ sec, text });
  if (n.lifeLog.length > 20) n.lifeLog.shift();
}

export function createNpcs(bounds: { w: number; h: number }): NpcState[] {
  return [
    mkNpc('furana', findDryTile(bounds.w / 2,       bounds.h * 0.35, 160), 10),
    mkNpc('suzu',   findDryTile(bounds.w * 0.4,     bounds.h * 0.38, 160)),
    mkNpc('lou',    findDryTile(bounds.w * 0.72,    bounds.h * 0.28, 160)),
    mkNpc('cocoon', findDryTile(bounds.w * 0.58,    bounds.h * 0.45, 160), 2),
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
    else if (n.id === 'furana') { range = 140; tempoMin = 1.4; tempoMax = 3; }  // やや活発に動く
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

// 各NPC共通の復活台詞。id ごとに分岐させる。
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
// フラナは "ママ帰還" 感のある台詞（村全体の大イベント）。〜わふ語尾で統一。
export const FURANA_REVIVE_LINES = [
  'ただいまわふ', 'ママかえってきたわふよ', 'まだしねないわふ',
  '……ふぅ、ゆめわふ', 'ママわふよー',
];

// NPCId から復活台詞を返す
export function reviveLinesFor(id: NpcId): string[] {
  if (id === 'cocoon') return COCOON_REVIVE_LINES;
  if (id === 'suzu') return SUZU_REVIVE_LINES;
  if (id === 'lou') return LOU_REVIVE_LINES;
  if (id === 'furana') return FURANA_REVIVE_LINES;
  return ['……'];
}

// =========================================================================
// NPC が掴まれ／振り回され／投げられ／着地した時のセリフ（個性別）
//   ちびわふの "わふ" 語尾は使わず、各 NPC のキャラに合わせた発話にする。
// =========================================================================
export interface NpcGrabLineSets {
  shake: string[];   // 振り回され最中
  thrown: string[];  // 空中を飛んでる瞬間
  landed: string[];  // 着地した瞬間
}

export const NPC_GRAB_LINES: Record<NpcId, NpcGrabLineSets> = {
  furana: {
    shake: [
      'やめなさいわふ！', 'ふにゃーわふ！', 'くらくらするわふ〜', 'まわるわふ！',
      'きゃあわふ！', 'やめてわふ！', 'ごめんなさいわふ！',
    ],
    thrown: [
      'とんでるわふ！？', 'きゃああわふ！', 'なんでわたしわふ…', 'いやあああわふ',
    ],
    landed: [
      'どさっわふ', 'いたたたわふ…', 'おぼえてろわふ', 'ぐぬぬわふ…',
    ],
  },
  suzu: {
    shake: [
      'ちょっとー！', 'ひぎ！', 'やめ…やめて！', 'てちょうが！',
      'ひっ', 'データとれない！', 'ぐるぐるしないで！',
    ],
    thrown: [
      '飛んでる！？', 'てちょうがーー', 'ぎゃー', 'ママー助けて！',
    ],
    landed: [
      'ど…どさ', 'あたたた', 'ママ呼ぶからね！', 'もうしらない！',
    ],
  },
  cocoon: {
    shake: [
      'はなせー！', 'くそー！', 'ちくしょう！', 'ママーー！',
      'ぶっとばすぞ！', 'めがまわるー', 'うるさい！はなせ！',
    ],
    thrown: [
      'うわああ！', 'どこーー！？', 'ぎゃああ', 'ママあ！',
    ],
    landed: [
      'どさっ', 'いてー', 'やったなー覚えてろー', 'ひどいー！',
    ],
  },
  lou: {
    shake: ['……', '……ぐぅ', '……？', '……う', '…ねかせて'],
    thrown: ['……！？', '……ぇ', '…ふわ'],
    landed: ['……', '……ぐ', '……まだ寝てる', '…ん'],
  },
};

export function pickNpcShakeLine(id: NpcId): string {
  const p = NPC_GRAB_LINES[id].shake;
  return p[Math.floor(Math.random() * p.length)]!;
}
export function pickNpcThrowLine(id: NpcId): string {
  const p = NPC_GRAB_LINES[id].thrown;
  return p[Math.floor(Math.random() * p.length)]!;
}
export function pickNpcLandedLine(id: NpcId): string {
  const p = NPC_GRAB_LINES[id].landed;
  return p[Math.floor(Math.random() * p.length)]!;
}

export const COCOON_DEATH_LINES = [
  'やられたー！', 'うぎゃー', 'ママぁ…しぬ…', 'ひどいわふ！',
  'ちびわふにまけた…',
];

// --- フラナ（ママ）のセリフ ----------------------------------------------
// フラナもちびわふ族なので〜わふ語尾で統一。ちびわふより落ち着いた調子。
// soft "めっ"
export const FURANA_LINES_PAT = [
  'こらわふ', 'めっ、めっわふ', 'しずかにわふ', 'こっちおいでわふ',
  'だめわふ', 'ぷんっわふ', 'もうわふ〜', 'だーめわふ',
];

// 普段の独り言（中間テンション、特にポジティブでもネガティブでもない）
export const FURANA_LINES_IDLE = [
  'ふぁ〜わふ', 'ねむいわふね〜', 'おひるねわふ', 'ぬくいわふ〜',
  'おなかすいたわふ', 'そらをみあげるわふ', 'ぼんやりわふ',
];

// フラナが痛がる（プレイヤーに殴られた時）
export const FURANA_LINES_HURT = [
  'きゃっわふ！？', 'いたっわふ！', 'なにするわふ…', 'やめるわふ！',
  'うそわふ…', 'あなたなにものわふ', 'ひどいわふ',
];
// 他NPCの殴られたリアクション
export const SUZU_LINES_HURT = [
  'いたい！', 'やめて！', 'てちょうが！', '数えてたのに！',
  'なにすんの！？', 'ひぃ！', 'ばか！',
];
export const COCOON_LINES_HURT = [
  'ぐぉ…！', 'ぶっ殺すぞ！', 'てめぇ！', 'ママー！',
  'しぬ…', 'くそっ！', 'うるせえ！',
];
export const LOU_LINES_HURT = ['……！', '…ぐぅ', '……ぇ', '…いた'];
export function hurtLinesFor(id: NpcId): string[] {
  if (id === 'furana') return FURANA_LINES_HURT;
  if (id === 'suzu') return SUZU_LINES_HURT;
  if (id === 'cocoon') return COCOON_LINES_HURT;
  return LOU_LINES_HURT;
}

// フラナがイライラしてちびわふを本気で殴る時
export const FURANA_LINES_ANGRY = [
  'うるさいわふ！', 'しつこいわふ！', 'いいかげんにするわふ！', 'もうげんかいわふ！',
  'どうしてわふ…', 'だめっていってるわふ！', 'ぎゃーわふ！',
];
// 機嫌最悪時にちびわふを川へ投げる／嫌う時の台詞
export const FURANA_LINES_HATE = [
  'もうやだわふ！', 'あっちいけわふ！', 'きらいわふ！', 'きえてわふ！',
  'あなたなんてしらないわふ！', 'もうイヤわふ！', 'でていってわふ！',
];
// ぶん投げ時の掛け声
export const FURANA_LINES_THROW = [
  'えいっわふ！', 'そらっわふ！', 'どっかいけわふ！', 'とんでけわふ！',
];
// 機嫌が良い時の独り言・称賛
export const FURANA_LINES_HAPPY = [
  'いい子わふ〜', 'みんなかわいいわふ', 'きょうもへいわわふ', 'しあわせわふ',
  'ママさいこうわふ', 'ぽかぽかわふ〜',
];

// フラナの死亡台詞
export const FURANA_LINES_DEATH = [
  'みんな…ごめんわふ…', 'さよならわふ…', 'ママは…ここまでわふ…',
  'げんきでねわふ…', 'あぁ…わふ',
];

// フラナがちびわふに話しかける時（機嫌良い：撫でる／褒める／尋ねる）
export const FURANA_LINES_CHAT = [
  'いい子わふ〜', 'げんきわふ？', 'なでなでわふ', 'がんばってるわふね',
  'ぎゅっしたいわふ', 'おなかすいてないわふ？', 'ねむくないわふ？',
  'あたまなでなでわふ', 'よちよちわふ', 'じょうずわふ〜',
];
// 機嫌悪い時のフラナの話しかけ（険しい／ため息／命令）
export const FURANA_LINES_CHAT_ANGRY = [
  'あっちいってわふ', 'じゃまなんだけどわふ', 'ちょっと離れてわふ',
  '話しかけないでわふ', 'いまムリわふ', 'あとにしてわふ',
  'しつこいわふ', 'うるさいわふね',
];
// スズがちびわふに話しかける時（点呼／注意）
export const SUZU_LINES_CHAT = [
  '元気？数えるよ〜', '今日もいるね', 'あんた名前なんだっけ',
  '死なないでね〜', '点呼の邪魔しないで', 'はい、いち、に、さん…',
];
// ココンがちびわふに話しかける時（威嚇／子ども）
export const COCOON_LINES_CHAT = [
  'どけよ！', 'ぼくのほうがえらい！', 'ママに言いつけるぞ！',
  'ぶっとばすぞ！', 'こっちみるな！',
];
// ちびわふがフラナ／スズ／ココンに答える時の一般返答
export const CHIBI_TO_FURANA_LINES = [
  'ママー！', 'だいすきわふ！', 'なでてわふ〜', 'ぎゅっしてわふ',
  'ごはんほしいわふ', 'ねむいわふ', 'おはなしきいてわふ', 'はーいわふ！',
];
// フラナが不機嫌で話しかけてきた時の怯えた返答
export const CHIBI_TO_FURANA_SCARED_LINES = [
  'ご、ごめんわふ', 'ひぃわふ', 'ママおこらないでわふ', 'ゆるしてわふ',
  'どっかいくわふ', 'わふぅ…', 'ないちゃうわふ',
];
export const CHIBI_TO_SUZU_LINES = [
  'はいわふ', 'ぼくここにいるわふ', 'かぞえてわふ', 'なまえなんだっけわふ',
];
export const CHIBI_TO_COCOON_LINES = [
  'こわいわふ…', 'ひぃわふ', 'ママ〜わふ', 'ゆるしてわふ', 'ぶっころすわふ',
];

// ちびわふが死んだ時のフラナの追悼コメント
export const FURANA_LINES_DEATH_REACTION = [
  'あらら…かわいそうわふ', 'また一人わふ…', 'ねむれわふ', 'さみしくなるわふ',
  'あ〜あ…わふ', 'やすらかにわふ…', 'ママの子だったのに…わふ',
  'なんまんだぶわふ', 'いってらっしゃいわふ', 'まもりんがあるわふ…',
];

// 変な死に方に対するフラナのびっくり反応
export const FURANA_LINES_WEIRD_DEATH = [
  'えっ！？わふ', 'なんでそうなるわふ！？', 'しんじられないわふ',
  'うそでしょわふ…', 'そんな死に方ある！？わふ', 'ちょっとまってわふ',
  'どうしてこうなるわふ…', 'ママ困惑わふ',
];
