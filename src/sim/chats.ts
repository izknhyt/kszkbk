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
