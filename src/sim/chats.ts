import type { Chibiwafu, TraitId } from '../types';
import { derivedChatChance } from './personality';

// =========================================================================
// すれ違い立ち話 & 独り言セリフプール
//   世界観ルール：ちびわふは 超純粋・無邪気・喜怒哀楽激しい・すぐ泣く・ママ大好き。
//   自虐や皮肉は言わない。観察・感情・好奇心・おねだり・ママ呼びが基本。
//   生意気セリフ（cheeky）は"子どもの自慢"系（「ぼくがいちばん」等）で、
//   出た瞬間に近くの仲間が「じぶんでいうなわふ！」とお仕置きに来る。
// =========================================================================

interface LinePool {
  normal: string[];
  cheeky: string[];
}

// 短い叫び・ママ呼び（純粋、非生意気）
const EXCLAMATIONS = [
  'ママー！', 'ママぁ！', 'ママー！', 'あっ！', 'わぁ！',
  'きゃー', 'ひぃ', 'ぴえん', 'ままぁ', 'ぽわっ',
  'ぽぽぽぽ', 'ひゃっ', 'ぴょん',
];

// 汎用：好奇心・感情・観察中心。たまに弱気・自虐も混じる。
const GENERIC: LinePool = {
  normal: [
    // --- 純粋な感嘆・好奇心（メイン） ---
    'わふ〜', 'わふ？', 'わふわふ！', 'ぽわわふ', 'ふにゃわふ',
    'あれなにわふ？', 'なんだろうわふ', 'ふしぎわふ', 'みてみてわふ！',
    'きれいわふ', 'ぴかぴかわふ', 'きらきらわふ', 'ふわふわわふ',
    'たのしいわふ', 'うれしいわふ！', 'すきわふ', 'だいすきわふ',
    'わぁきれいわふ', 'すごーいわふ', 'わくわくわふ',
    // --- ママ呼び ---
    'ママー！', 'ママみてわふ', 'ママだいすきわふ', 'ママこっちわふ',
    'ママのあしわふ', 'ママのにおいわふ', 'ママぎゅっわふ',
    // --- 好奇心 ---
    'はっぱわふ', 'くもわふ', 'ありわふ', 'おはなきれいわふ',
    'おてんきわふ', 'かぜわふ', 'ひかりわふ', 'ぷにぷにわふ',
    'おててみつけたわふ', 'あしあるわふ',
    // --- 感情 ---
    'かなしいわふ…', 'なきたいわふ', 'うぇんわふ', 'こわいわふ',
    'はずかしいわふ', 'さみしいわふ', 'どきどきわふ',
    // --- おねだり・シンプル願望 ---
    'おなかすいたわふ', 'ねむいわふ', 'あそぼわふ', 'いっしょにわふ',
    'てをつなごわふ', 'おともだちわふ', 'なかよしわふ', 'おいでわふ',
    // --- くそざこだけど純粋な観察 ---
    'ころんだわふ', 'こけたわふ', 'あたまごっつんわふ', 'まもりんずれたわふ',
    'ぬれちゃったわふ', 'もらしたわふ', 'おしっこ出たわふ', 'うんちしたいわふ',
    'いたいわふ', 'ちょっといたいわふ', 'あついわふ', 'さむいわふ',
    // --- 忘れっぽさ・注意散漫 ---
    'わすれたわふ', 'わかんないわふ', 'なにしてたんだっけわふ',
    'いまのなにわふ？', 'なんでわふ？',
    // --- 動作 ---
    'ぴょんぴょんわふ', 'とぶわふ！', 'はしるわふ', 'ぐるぐるわふ',
    'ねころがるわふ', 'もぐりこむわふ', 'まんまるわふ',
    // --- 匂い・触感 ---
    'いいにおいわふ', 'くさいにおいわふ', 'あまいわふ', 'ぬるぬるわふ',
    'ぽかぽかわふ', 'ひんやりわふ',
    // --- ネタ ---
    'うんちのかたちわふ', 'くもおいしそうわふ', 'そらあおいわふ',
    'おそらしろいわふ', 'てんとうむしわふ', 'ちょうちょわふ',
    // --- 弱気・自虐（幅のため少数混ぜる） ---
    'よわいわふ…', 'だめだめわふ', 'まけたわふ…', 'もうむりわふ',
    'ゆるしてわふ…', 'ごめんなさいわふ', 'ついていけないわふ',
    'ひとりぼっちわふ', 'だれもみてないわふ', 'どうせだめわふ',
  ],
  cheeky: [
    // --- 子どもの自慢（主力） ---
    'ぼくがいちばんわふ！', 'ぼくえらいわふ！', 'ぼくすごいでしょわふ！',
    'ぜんぶぼくのわふ！', 'ぼくさきわふ！', 'どいてわふ',
    'ママはぼくだけのわふ！', 'ぼくだけみてわふ！', 'ぼくのばんわふ！',
    'まけないもんわふ！',
    // --- 子どもの敵意（少数混ぜる、毒吐き） ---
    'しねわふ', 'しんじまえわふ', 'うるさいわふ', 'ばかにするなわふ',
    'どけよわふ', 'どっかいけわふ', 'ぶっとばすわふ', 'きらいわふ',
  ],
};

const TRAIT_POOLS: Partial<Record<TraitId, LinePool>> = {
  bouken: {
    normal: [
      'あっちなにわふ？', 'とおくみたいわふ', 'いってみるわふ',
      'かわむこうわふ', 'ぼうけんわふ！', 'ふしぎなのあるわふ',
      'みたことないのわふ', 'あそこきになるわふ',
    ],
    cheeky: [
      'ぼくならいけるわふ！', 'こわくないもんわふ！',
    ],
  },
  gourmand: {
    normal: [
      'おなかすいたわふ〜', 'たべたいわふ', 'もぐもぐわふ', 'おかわりわふ',
      'いしぱんおいしいわふ', 'どんぐりわふ', 'はっぱもぐもぐわふ',
      'なにかあるわふ？', 'あまいにおいわふ',
    ],
    cheeky: [
      'ぜんぶぼくのわふ！', 'たべつくすわふ！',
    ],
  },
  shinpai: {
    normal: [
      'こわいわふ…', 'ママのそばがいいわふ', 'ひとりやだわふ', 'どきどきわふ',
      'いまのなにわふ', 'ぶるぶるするわふ', 'ひえええわふ', 'ママぁわふ…',
      'だれかいるわふ？', 'うしろみたくないわふ',
    ],
    cheeky: [],
  },
  ukiyo: {
    normal: [
      'そらきれいわふ', 'くもながれるわふ', 'かぜわふ〜', 'ふしぎわふ',
      'ぼーっとわふ', 'はっぱくるくるわふ', 'なにかきこえるわふ', 'ひかりわふ',
      'なんでうまれたのわふ？', 'ぼくはだれわふ',
    ],
    cheeky: [],
  },
  ikusa: {
    normal: [
      'ぼうふるわふ！', 'ぱんちわふ！', 'つよいわふ！', 'どんわふ！',
      'ぶんぶんわふ', 'たたきたいわふ', 'ぼうさばきわふ', 'えいっわふ',
    ],
    cheeky: [
      'ぼくがいちばんつよいわふ！', 'かかってこいわふ！',
      'ぶっとばすわふ', 'うるさいわふ', 'どけよわふ',
    ],
  },
  noumin: {
    normal: [
      'つちほりほりわふ', 'たねまくわふ', 'みずやるわふ', 'はっぱみどりわふ',
      'しごとするわふ', 'たいへんわふ', 'ほうきたおれたわふ', 'つちたのしいわふ',
    ],
    cheeky: [
      'ぼくのはたけわふ！',
    ],
  },
  tabikko: {
    normal: [
      'とおくいきたいわふ', 'あのやまわふ', 'けもののみちわふ',
      'みずほしいわふ', 'おかのむこうわふ', 'いったことないとこわふ',
      'あしがすすむわふ', 'ママあとでねわふ',
    ],
    cheeky: [
      'ぼくじゆうわふ！',
    ],
  },
  gunsuki: {
    normal: [
      'まってよわふ', 'つれてってわふ', 'ひとりやだわふ', 'ぼくもいくわふ',
      'ついていくわふ', 'なかまにいれてわふ', 'いっしょにあそぼわふ',
      'みんなどこわふ？',
    ],
    cheeky: [],
  },
  hitoribochi: {
    normal: [
      '…', 'しずかにわふ', 'ひとりでいいわふ', 'ぼーっとするわふ',
      'みないでわふ', 'じぶんでできるわふ', 'ちかくにこなくていいわふ',
    ],
    cheeky: [
      'どっかいってわふ', 'ほっといてわふ', 'しねわふ', 'きらいわふ',
    ],
  },
  bo_suki: {
    normal: [
      'ぼうすきわふ', 'ぼうひろったわふ', 'ぼうだきしめるわふ', 'ぼうなでるわふ',
      'ぼうとねるわふ', 'ぼうかわいいわふ', 'ぼうつるつるわふ',
    ],
    cheeky: [
      'ぼうはぼくのわふ！',
    ],
  },
  taiko_kko: {
    normal: [
      'たいこわふ！', 'ドンドンわふ', 'やぐらのしたすきわふ',
      'たいこきこえるわふ', 'おんどすきわふ', 'リズムわふ',
      'したからみあげるわふ', 'ひびくわふ〜',
    ],
    cheeky: [],
  },
  nonbiri: {
    normal: [
      'ゆっくりでいいわふ〜', 'のんびりわふ', 'あとでやるわふ', 'まぁいいわふ',
      'きょうはいいわふ', 'ねむいわふ〜', 'ぽかぽかわふ', 'ひなたわふ',
    ],
    cheeky: [],
  },
  sekkachi: {
    normal: [
      'はやくしたいわふ！', 'まちきれないわふ', 'いまやるわふ！', 'じっとできないわふ',
      'そわそわわふ', 'もうはじめるわふ', 'いそぐわふ', 'はしるわふ',
    ],
    cheeky: [
      'おそーいわふ！',
    ],
  },
  oshaberi: {
    normal: [
      'あのねあのねわふ！', 'きいてきいてわふ！', 'それでねわふ！',
      'ぼくねわふ', 'ママがねわふ', 'あのこがねわふ', 'こないだわふ',
      'しってるわふ？', 'ほんとほんとわふ！', 'ねえねえわふ！',
    ],
    cheeky: [],
  },
  mukuchi: {
    normal: ['…', '……', '…わふ', '、、、', '（無言）'],
    cheeky: [],
  },
  nakimushi: {
    normal: [
      'わぁぁんわふ', 'えぇぇんわふ', 'なみだでるわふ', 'ママぁわふ',
      'いたいのわふ', 'ぐすぐすわふ', 'やだぁわふ', 'ぽろぽろわふ',
      'うぇんわふ', 'こわいわふ〜',
    ],
    cheeky: [],
  },
  tsuyoi: {
    normal: [
      'だいじょうぶわふ！', 'なかないわふ', 'おきれるわふ', 'まだがんばるわふ',
      'へっちゃらわふ', 'たおれないわふ', 'ふんばるわふ',
    ],
    cheeky: [
      'ぼくさいきょうわふ！', 'いたくないもんわふ！',
      'よわいのきえろわふ', 'ばかにするなわふ',
    ],
  },
  yowai: {
    normal: [
      'つかれたわふ…', 'ねむいわふ', 'よこになるわふ', 'はぁはぁわふ',
      'あしうごかないわふ', 'きょうはねるわふ', 'ぽてっとわふ',
    ],
    cheeky: [],
  },
  morashi: {
    normal: [
      '出ちゃったわふ', 'ぬれたわふ', 'あっわふ', 'ぴゅっわふ',
      'ぽたぽたわふ', 'きづかなかったわふ', 'あたたかいわふ', 'しまったわふ',
    ],
    cheeky: [],
  },
  bo_meijin: {
    normal: [
      'ぼうじょうずだよわふ', 'みてみてわふ', 'はっ！わふ', 'くるっとわふ',
      'こんどすごいわざやるわふ', 'ぼうたのしいわふ',
    ],
    cheeky: [
      'ぼくぼうのめいじんわふ！', 'みててねわふ！',
    ],
  },
  tetsugakusha: {
    normal: [
      'なんでうまれたのわふ？', 'ぼくはだれわふ？', 'そらがまるいわふ',
      'ふしぎふしぎわふ', 'かんがえてるわふ', 'ときがながれるわふ', '…',
    ],
    cheeky: [],
  },
};

// 全体で「生意気セリフを引く確率」。zako param と「自慢したがりな特性」で上下。
const CHEEKY_BASE = 0.08;

export interface SpokenLine {
  text: string;
  cheeky: boolean;
}

function pickFromPool(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)]!;
}

function pickFromLinePool(p: LinePool, cheekyChance: number): SpokenLine {
  if (p.cheeky.length > 0 && Math.random() < cheekyChance) {
    return { text: pickFromPool(p.cheeky), cheeky: true };
  }
  return { text: pickFromPool(p.normal), cheeky: false };
}

function cheekyChanceFor(c: Chibiwafu): number {
  const base = CHEEKY_BASE + Math.max(0, c.params.zako - 50) * 0.0015;
  if (c.traits.includes('mukuchi')) return 0;
  if (c.traits.includes('nakimushi') || c.traits.includes('shinpai')) return base * 0.2;
  return base;
}

function pickLine(c: Chibiwafu): SpokenLine {
  const chance = cheekyChanceFor(c);
  // 無口：85% は沈黙
  if (c.traits.includes('mukuchi') && Math.random() < 0.85) {
    return { text: pickFromPool(TRAIT_POOLS.mukuchi!.normal), cheeky: false };
  }
  // 特性持ちは 60% で特性プール
  for (const t of c.traits) {
    const pool = TRAIT_POOLS[t];
    if (pool && Math.random() < 0.6) return pickFromLinePool(pool, chance);
  }
  // 10% で叫び（非生意気）
  if (Math.random() < 0.1) return { text: pickFromPool(EXCLAMATIONS), cheeky: false };
  return pickFromLinePool(GENERIC, chance);
}

// 独り言用。chibi 指定があればその個体の性格で選ぶ。
export function pickOshaberiLine(c?: Chibiwafu): SpokenLine {
  if (c) return pickLine(c);
  return { text: pickFromPool(GENERIC.normal), cheeky: false };
}

// =========================================================================
// 状態遷移の"理由"セリフ
//   cry/dazed/sleep/surprised に入る時に 50-70% で理由バブルを出す。
//   「なぜ今その状態になったの？」が画面だけで読めるように。
// =========================================================================
export const CRY_REASONS = [
  'かなしいわふ…', 'さみしいわふ…', 'なきたくなったわふ', 'ママこいしいわふ',
  'ころんだわふ…', 'おなかすいたわふ', 'こわいわふ…', 'もらしたわふ',
  'いたいわふ…', 'だれもみてないわふ', 'ひとりやだわふ', 'ぽつんわふ',
];
export const SLEEP_REASONS = [
  'ねむいわふ…', 'おやすみわふ', 'ちょっとねるわふ', 'つかれたわふ',
  'ぽえーわふ', 'もうむりわふ…', 'ねちゃおわふ',
];
export const DAZED_REASONS = [
  'ぼーっとわふ', 'わすれたわふ', 'なにしてたんだっけわふ', '…わふ',
  'ふわーっわふ', 'きのうのこと…わふ',
];
export const SURPRISED_REASONS = [
  'ぽわっわふ！', 'びっくりしたわふ', 'なにわふ？', 'わぁ！',
];
export function pickReason(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)]!;
}

// =========================================================================
// 行動予告セリフ（〜するわふ！系）
//   「これから何するのか」を本人が短く宣言するプール。
//   説明口調にならないよう短く、1〜2語＋わふ。
//   各行動に 3〜5 パターン用意し、random で引く。
// =========================================================================
export const ACTION_ANNOUNCE: Record<string, string[]> = {
  // 目的地別
  landmark_stonebread : ['いしぱんわふ！', 'たべるわふ！', 'かじるわふ'],
  landmark_philosophy : ['そらみるわふ', 'かんがえるわふ', 'ぼーっとするわふ'],
  landmark_mudpool    : ['のむわふ', 'おみずわふ'],
  landmark_beer       : ['いっぱいいくわふ！', 'のむぞわふ'],
  landmark_flowers    : ['おはなわふ！', 'きれいなのわふ'],
  landmark_totem      : ['ぼうのとこわふ', 'むらのちゅうしんわふ'],
  river_bouken        : ['はしわたるわふ！', 'かわみるわふ', 'ぼうけんわふ！'],
  cocoon_ikusa        : ['やっつけるわふ！', 'ぶつぞわふ', 'せんとうわふ！'],
  mama                : ['ママのとこわふ', 'ママみるわふ', 'ママー！'],
  noukou              : ['しごとするわふ', 'つちほりわふ', 'たねまくわふ'],
  taiko               : ['たいこわふ！', 'ドンドンわふ', 'やぐらわふ！'],
  edge_tabikko        : ['たびだつわふ！', 'むこうへわふ', 'いってくるわふ！'],
  // 状態遷移別
  state_eating        : ['もぐもぐわふ', 'いただきますわふ'],
  state_staring       : ['…', 'なにかあるわふ…', 'そらわふ'],
  state_sleep         : ['ねむいわふ…', 'おやすみわふ', 'ねるわふ'],
  state_cry           : ['うぇんわふ', 'ないちゃうわふ', 'かなしいわふ…'],
};

export function pickActionAnnounce(key: string): string | null {
  const pool = ACTION_ANNOUNCE[key];
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

// 生意気な子が殴られる時、殴る側の吹き出し
const STRIKER_LINES = [
  'じぶんでいうなわふ！', 'ずるいわふ！', 'おこったわふ！',
  'ぼくもえらいわふ！', 'なまいきわふ！', 'だめわふ！',
];
export function pickStrikerLine(): string {
  return STRIKER_LINES[Math.floor(Math.random() * STRIKER_LINES.length)]!;
}

// ボコボコにされる側の吹き出し
const VICTIM_HURT_LINES = [
  'わぁぁんわふ！', 'いたいわふ〜', 'ママーわふ！', 'ごめんわふ', 'ぎゃーわふ',
];
export function pickVictimHurtLine(): string {
  return VICTIM_HURT_LINES[Math.floor(Math.random() * VICTIM_HURT_LINES.length)]!;
}

// 粗相（屁・しゃっくり・よだれ等）で理不尽に殴る側の吹き出し
const RIFUJIN_STRIKER_LINES = [
  'くさいわふ！', 'きたないわふ！', 'うるさいわふ！', 'はずかしいわふ！',
  'みっともないわふ！', 'やめろわふ！', 'ゆるせないわふ！', 'ばっちいわふ！',
];
export function pickRifujinStrikerLine(): string {
  return RIFUJIN_STRIKER_LINES[Math.floor(Math.random() * RIFUJIN_STRIKER_LINES.length)]!;
}

// 粗相でボコられる側（理由が理不尽なので困惑）
const RIFUJIN_VICTIM_LINES = [
  'なんでわふ！？', 'りふじんわふ…', 'ゆるしてわふ…', 'わるいことしたわふ？',
  'ひどいわふ…', 'ごめんなさいわふ…', 'なにもしてないわふ…',
];
export function pickRifujinVictimLine(): string {
  return RIFUJIN_VICTIM_LINES[Math.floor(Math.random() * RIFUJIN_VICTIM_LINES.length)]!;
}

// =========================================================================
// 神様（プレイヤー）に殴られた／振り回された／投げられた時の悲鳴プール
//   ダメージを受けた瞬間にランダムで出す。同じ"ぎゃー"だけにならないように。
// =========================================================================

// 殴打された瞬間（左クリック）
const GOD_PUNCH_LINES = [
  'ぎゃーわふ！', 'いたいわふ！', 'ひどいわふ…', 'なんでわふ！？',
  'ゆるしてわふ〜', 'ママーわふ！', 'たすけてわふ！', 'もうやめてわふ',
  'かみさまひどいわふ', 'ぐぇっわふ', 'いてぇわふ！', 'ぼくなにしたわふ？',
  'ぎゃわっ', 'いたたたわふ', 'わふん！', 'どいてよわふ…',
];
export function pickGodPunchLine(): string {
  return GOD_PUNCH_LINES[Math.floor(Math.random() * GOD_PUNCH_LINES.length)]!;
}

// 掴まれて振り回されている最中（ドラッグ中、連続的に）
const GOD_SHAKE_LINES = [
  'ぐえええわふ', 'くるしいわふ！', 'めがまわるわふ…', 'やめてええわふ',
  'たすけてわふ！', 'はなしてわふ〜', 'きもちわるいわふ…', 'ぐるぐるわふ',
  'ぺろぺろわふ…', 'うぷっわふ', 'もどしそうわふ', 'ぐぇええ',
  'ひえええわふ', 'おちるわふー！', 'しぬわふ…', 'ままああああ',
];
export function pickGodShakeLine(): string {
  return GOD_SHAKE_LINES[Math.floor(Math.random() * GOD_SHAKE_LINES.length)]!;
}

// 投げ飛ばされて宙を飛んでいる瞬間（ドロップ時、着地前）
const GOD_THROW_LINES = [
  'とんでるわふ〜！', 'わあああわふ！', 'どこいくわふ！？', 'そらわふ！？',
  'ひええええわふ', 'ぴゃーわふ！', 'まっさかさまわふ', 'ぽーんわふ！',
];
export function pickGodThrowLine(): string {
  return GOD_THROW_LINES[Math.floor(Math.random() * GOD_THROW_LINES.length)]!;
}

// =========================================================================
// 生き生きリアクション用のプール
//   他のちびわふが泣いてる／怒ってる／食べてる／寝てるのを見た時、
//   または悪い子が死んだ時、周りが何か言う。
// =========================================================================

// 慰め系（誰かが泣いてる時）
const COMFORT_LINES = [
  'よしよしわふ', 'なかないでわふ', 'だいじょうぶわふ', 'いっしょにいるわふ',
  'ぼくもいるわふ', 'ぎゅっわふ', 'なみだふくわふ',
];
// もらい泣き系
const COPY_CRY_LINES = [
  'うぇんわふ…', 'ぼくもかなしいわふ', 'ぽろぽろわふ', 'なんだかなきたいわふ',
];
// 食べ物おねだり系
const BEGFOOD_LINES = [
  'いいなわふ', 'ちょうだいわふ', 'ぼくもたべたいわふ', 'ひとくちわふ',
  'おなかすいたわふ', 'わけてわふ',
];
// あくび伝染系
const SLEEPY_CONTAGION_LINES = [
  'ふぁ〜わふ', 'ぼくもねむくなったわふ', 'つられてあくびわふ', 'めがおもいわふ',
];
// 怒ってる子を見た時（びびる／引く）
const ANGRY_BYSTANDER_LINES = [
  'こわいわふ…', 'ひぃぃわふ', 'はなれるわふ', 'どうしたわふ？',
  'ちかよらないわふ', 'きげんわるいわふ…',
];
// 目の前で殴られた／投げられた子を見た時の反応
const WITNESS_SHOCK_LINES = [
  'えっ！わふ', 'きゃー！わふ', 'なんで！？わふ', 'ひどいわふ！',
  'かみさまこわいわふ…', 'ぎゃっわふ', 'にげるわふ！', 'まもりんよ〜',
];
const WITNESS_LAUGH_LINES = [
  'わははわふ', 'おもしろいわふ', 'どんくさいわふ', 'もっとわふ！',
];
export function pickWitnessShockLine(): string {
  return WITNESS_SHOCK_LINES[Math.floor(Math.random() * WITNESS_SHOCK_LINES.length)]!;
}
export function pickWitnessLaughLine(): string {
  return WITNESS_LAUGH_LINES[Math.floor(Math.random() * WITNESS_LAUGH_LINES.length)]!;
}

// 悪い子が死んだ時のざまあみろ系
const SCHADENFREUDE_LINES = [
  'ざまあみろわふ', 'じごうじとくわふ', 'バチあたったわふ', 'いいきみわふ',
  'いばってたからわふ', 'そうなるとおもったわふ', 'しったことかわふ',
];
export function pickComfortLine(): string { return COMFORT_LINES[Math.floor(Math.random() * COMFORT_LINES.length)]!; }
export function pickCopyCryLine(): string { return COPY_CRY_LINES[Math.floor(Math.random() * COPY_CRY_LINES.length)]!; }
export function pickBegFoodLine(): string { return BEGFOOD_LINES[Math.floor(Math.random() * BEGFOOD_LINES.length)]!; }
export function pickSleepyContagionLine(): string { return SLEEPY_CONTAGION_LINES[Math.floor(Math.random() * SLEEPY_CONTAGION_LINES.length)]!; }
export function pickAngryBystanderLine(): string { return ANGRY_BYSTANDER_LINES[Math.floor(Math.random() * ANGRY_BYSTANDER_LINES.length)]!; }
export function pickSchadenfreudeLine(): string { return SCHADENFREUDE_LINES[Math.floor(Math.random() * SCHADENFREUDE_LINES.length)]!; }

// 殴られた後、反抗して神様に吠える時の一言
const GOD_DEFIANCE_LINES = [
  'いたすぎるわふ！', 'ゆるさないわふ', 'ぷんっわふ！', 'おこったわふ！',
  'かみさまばかわふ', 'しんじゃえわふ', 'もういやわふ', 'ぼくだってこえあるわふ',
  'もうなぐらないでわふ！',
];
export function pickGodDefianceLine(): string {
  return GOD_DEFIANCE_LINES[Math.floor(Math.random() * GOD_DEFIANCE_LINES.length)]!;
}

// --- もらし系 ----------------------------------------------------------------
// もらした子が出した 💧 に対する周囲の反応。ふく/ドン引き の2パターン。
const MORASHI_WIPE_LINES = [
  'ふいてあげるわふ', 'きれいにするわふ', 'だいじょうぶわふ',
  'こっちおいでわふ', 'きにしないわふ',
];
const MORASHI_DISGUST_LINES = [
  'くさいわふ！', 'きたないわふ', 'ドンびきわふ', 'ぎゃーわふ',
  'よるなわふ', 'またかわふ…', 'さいあくわふ', 'あっちいくわふ',
];
export function pickMorashiWipeLine(): string {
  return MORASHI_WIPE_LINES[Math.floor(Math.random() * MORASHI_WIPE_LINES.length)]!;
}
export function pickMorashiDisgustLine(): string {
  return MORASHI_DISGUST_LINES[Math.floor(Math.random() * MORASHI_DISGUST_LINES.length)]!;
}

// 着地した瞬間（ドロップで陸地にぶつかった時）
const GOD_LANDED_LINES = [
  'どさっわふ', 'ぐへぇわふ', 'いたたたわふ…', 'あたまうったわふ',
  'ぺしゃんわふ', 'うごけないわふ…', 'ぽてっわふ', 'めがまわるわふ…',
];
export function pickGodLandedLine(): string {
  return GOD_LANDED_LINES[Math.floor(Math.random() * GOD_LANDED_LINES.length)]!;
}

// =========================================================================
// 掴まれた瞬間のリアクション（無邪気に喜ぶ／怯える／威嚇／困惑）
//   ドラッグ開始時に、個体の性格で系統を切り替えて 1 行出す。
//   同じちびわふでも毎回ランダム。
// =========================================================================

// 喜ぶ系：courage 高 or bouken / gourmand / nonbiri
const GRAB_EXCITED_LINES = [
  'わーいたかいわふ！', 'ぴゅーんわふ！', 'たのしーわふ！', 'もっとわふ！',
  'そらちかいわふ！', 'ママにみせるわふ！', 'ふわふわわふ〜！', 'ぶーんわふ！',
  'とんでるわふ！', 'やったーわふ！', 'きもちいいわふ〜', 'あはははわふ',
];

// 怯える系：shinpai / nakimushi / morashi / yowai / zako高
const GRAB_SCARED_LINES = [
  'ひええええわふ！', 'たすけてわふ！', 'こわいわふー！', 'ママどこわふ！？',
  'おりたいわふ…', 'やめてわふ〜', 'ぶるぶるわふ', 'ぴえんわふ…',
  'もうむりわふ', 'ぽたぽたわふ…', 'ごめんなさいわふ…', 'しぬわふ…',
];

// 威嚇系：ikusa / tsuyoi / bo_meijin
const GRAB_DEFIANT_LINES = [
  'はなせわふ！', 'たたかうわふ！', 'なめるなわふ！', 'おとしてみろわふ！',
  'ぶっとばすわふ！', 'こわくないわふ！', 'ぼくさいきょうわふ！',
];

// 困惑系：上記どれにも当てはまらない時
const GRAB_CONFUSED_LINES = [
  'わふ？', 'なにわふ！？', 'へ？わふ', 'ぽわっわふ', 'どうしたわふ？',
  'あれっわふ', 'もちあがったわふ！？', 'ぷかぷかわふ',
];

export function pickGrabReaction(c: Chibiwafu): string {
  // 1. 怖がり系特性は必ず怯える
  if (c.traits.includes('shinpai') || c.traits.includes('nakimushi')) {
    return pickFromPool(GRAB_SCARED_LINES);
  }
  // 2. 威嚇系特性は威嚇
  if (c.traits.includes('ikusa') || c.traits.includes('tsuyoi') || c.traits.includes('bo_meijin')) {
    return pickFromPool(GRAB_DEFIANT_LINES);
  }
  // 3. 冒険家 or 勇気高めは喜ぶ
  if (c.traits.includes('bouken') || c.params.courage > 65) {
    return pickFromPool(GRAB_EXCITED_LINES);
  }
  // 4. zako 高 or courage 低は怯える
  if (c.params.zako > 60 || c.params.courage < 35) {
    return pickFromPool(GRAB_SCARED_LINES);
  }
  // 5. それ以外は困惑、たまに喜び・怯えが混じる
  const r = Math.random();
  if (r < 0.15) return pickFromPool(GRAB_EXCITED_LINES);
  if (r < 0.30) return pickFromPool(GRAB_SCARED_LINES);
  return pickFromPool(GRAB_CONFUSED_LINES);
}

export interface ChatAttempt {
  a: Chibiwafu;
  b: Chibiwafu;
  lineA: SpokenLine;
  lineB: SpokenLine;
  duration: number;
}

export function maybeStartChat(c1: Chibiwafu, c2: Chibiwafu): ChatAttempt | null {
  if (c1.chatCooldown > 0 || c2.chatCooldown > 0) return null;
  if (c1.state !== 'idle' && c1.state !== 'surprised') return null;
  if (c2.state !== 'idle' && c2.state !== 'surprised') return null;
  if (Math.random() > derivedChatChance(c1.params, c2.params)) return null;
  return {
    a: c1,
    b: c2,
    lineA: pickLine(c1),
    lineB: pickLine(c2),
    duration: 2.2 + Math.random() * 1.3,
  };
}
