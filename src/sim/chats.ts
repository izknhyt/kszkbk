import type { Chibiwafu, TraitId } from '../types';
import { derivedChatChance } from './personality';

// =========================================================================
// すれ違い立ち話 & 独り言セリフプール
//   世界観ルール：ちびわふはくそざこ。基本は弱音・泣き言・自虐。
//   たまに（CHEEKY_CHANCE 分だけ）生意気なセリフを吐く。
//   生意気セリフが出ると world 側で「ボコボコにされる」処理が走る。
// =========================================================================

interface LinePool {
  normal: string[];
  cheeky: string[];
}

// 短い叫び系（わふ語尾の例外、非生意気）
const EXCLAMATIONS = [
  'ママー！', 'ママぁ！', 'ママどこ？', 'うわぁ！', 'きゃー',
  'あ！', 'ひぃ', 'わあ', 'え？', 'ママ…', 'ひええ', 'ぴえん',
];

// 汎用：くそざこ弱音＋稀に生意気
const GENERIC: LinePool = {
  normal: [
    'わふ？', 'わふ〜', 'わふぅ', 'わふわふ', 'ぽわわふ',
    'ふにゃわふ', 'ふぎゃわふ', 'ぴゃわふ', 'きゅわふ', 'もちわふ',
    'おなかすいたわふ', 'ねむいわふ…', 'さむいわふ', 'あついわふ', 'くさいわふ',
    'もらしたわふ', 'おしっこ出るわふ', 'うんちしたいわふ', 'まもりんずれるわふ', 'おしりかゆいわふ',
    'なぜわふ…', 'これが人生わふ', 'きょうもだめわふ', 'つかれたわふ…',
    'あそぼわふ', 'てをつなごわふ', 'いっしょにわふ', 'おともだちわふ',
    'いたいわふ…', 'やめてわふ…', 'かなしいわふ…', 'こわいわふ',
    'ママ大好きわふ', 'ママやめてわふ…', 'ママどこいったわふ',
    '棒ほしいわふ', 'なんかほしいわふ', 'たべものほしいわふ',
    'ころんだわふ', 'ぶつかったわふ', 'たちあがれないわふ', 'ぐらぐらするわふ', 'めまいわふ',
    'ぽんぽんわふ', 'ぬれたわふ', 'かわいたわふ',
    'おぼえてないわふ', 'いまのなにわふ', 'さっきのなにわふ',
    'くさいにおいわふ', 'やばいにおいわふ',
    'おうちかえるわふ', 'もうかえりたいわふ', 'ここどこわふ', 'まよったわふ',
    'ねるわふ', 'めがあかないわふ', 'あくびわふ',
    'なんもできないわふ', 'ぼーっとするわふ', 'よわいわふ', 'だめだめわふ',
    'ゆるしてわふ', 'ごめんなさいわふ', 'まけたわふ', 'ついていけないわふ',
    'たすけてわふ', 'もうむりわふ', 'なきたいわふ', 'ぐすん…わふ',
    'すぐころぶわふ', 'たおれそうわふ', 'うごけないわふ', 'いきたくないわふ',
    'わすれたわふ', 'なにもわからないわふ', 'つまらないわふ',
  ],
  cheeky: [
    'わたしすごいわふ', 'つよいからへいきわふ', 'ばかにするなわふ', 'さわるなわふ',
    'おれのほうがうえわふ', 'しねわふ', 'うるさいわふ', 'どけよわふ',
    'おとなだぞわふ', 'ままなんていらんわふ',
  ],
};

const TRAIT_POOLS: Partial<Record<TraitId, LinePool>> = {
  bouken: {
    normal: [
      'こわいけどいくわふ', 'たぶんいけるわふ', 'ころぶかもわふ', 'ちょっとだけいくわふ',
      'ままのとこもどってくるわふ', 'しるしをつけておくわふ', 'ちずないわふ', 'おなかがすいたわふ',
    ],
    cheeky: [
      '川の向こうわふ！', '冒険わふ！', 'こわくないわふ', 'ついてくるなわふ',
    ],
  },
  gourmand: {
    normal: [
      'おなかぺこぺこわふ', 'たべたいわふ', 'なんでもいいわふ', 'いっこちょうだいわふ',
      'のこしてないわふ', 'はらへったわふ', 'なにか…わふ', 'どんぐりでいいわふ',
    ],
    cheeky: [
      '石パン全部わふ', 'よこせわふ', 'ぜんぶおれのわふ',
    ],
  },
  shinpai: {
    normal: [
      'こわいわふ…', 'ママの近くがいいわふ', '帰りたいわふ…', 'やだやだわふ',
      'むりむりわふ', 'もうだめわふ…', 'いやなよかんわふ', 'おなかこわれたわふ',
      'たすけてわふ', 'よくないきがするわふ', 'ふるえるわふ', 'じっとしてるわふ',
    ],
    cheeky: [],
  },
  ukiyo: {
    normal: [
      'なぜわふ', 'わふとはなにかわふ…', '空きれいわふ', 'そらがもえてるわふ',
      'わたしはだれわふ', 'きょうもわかんないわふ', '星がきこえるわふ', 'かぜにとけるわふ',
    ],
    cheeky: [
      '無だわふ…', 'おまえもわふだわふ',
    ],
  },
  ikusa: {
    normal: [
      'こぶしあがらないわふ', 'ほんとはこわいわふ', 'めまいわふ', 'しびれたわふ',
      'ひざがわらうわふ', 'いきがきれたわふ', 'たおれそうわふ', 'もうむりわふ',
    ],
    cheeky: [
      'やるかわふ？', 'どけわふ！', 'ぶつぞわふ', '棒よこせわふ', 'かかってこいわふ',
    ],
  },
  noumin: {
    normal: [
      '種まくわふ', '泥のにおいわふ…', '豊作いいなわふ', '逆さに植えちゃったわふ',
      'しごとわふ', 'くわおもいわふ', 'みずやるわふ', 'ほうきたおれたわふ',
    ],
    cheeky: [
      'みてろよ大豊作わふ',
    ],
  },
  tabikko: {
    normal: [
      'とおくいきたいわふ', 'つかれたわふ', 'おうちかえれないわふ',
      'けもののみちこわいわふ', 'おかのむこうわふ', 'みずほしいわふ', 'まよったわふ',
    ],
    cheeky: [
      'にどとかえらないわふ', 'じゆうわふ',
    ],
  },
  gunsuki: {
    normal: [
      'まってよわふ', 'つれてってわふ', 'ひとりやだわふ', 'ぼくもいくわふ',
      'ついていくわふ', 'なかまにいれてわふ', 'いっしょでおねがいわふ', 'ひとりこわいわふ',
    ],
    cheeky: [],
  },
  hitoribochi: {
    normal: [
      '…', 'しずかにわふ', 'ちかくにこないでわふ', 'つかれるわふ',
      'ひとりでいいわふ', 'さみしくないわふ', 'かまわんでわふ',
    ],
    cheeky: [
      'どっかいけわふ', 'みないでわふ', 'うるさいわふ',
    ],
  },
  bo_suki: {
    normal: [
      '棒ほしいわふ', '棒ちょっとだけ…わふ', 'ぼうひろったわふ', 'ぼうかわいいわふ',
      'ぼうをなでるわふ', 'ぼうだきしめるわふ', 'ぼうとねるわふ',
    ],
    cheeky: [
      '棒わふ！', '棒で叩こうわふ', 'ぼうは僕のわふ',
    ],
  },
  taiko_kko: {
    normal: [
      'たいこきこえるわふ', 'やぐらのしたすきわふ', 'したからみあげるわふ', 'リズムわふ',
      'からだうごくわふ', 'おんどすきわふ', 'なかにはいりたいわふ',
    ],
    cheeky: [
      'ドンドンわふ！',
    ],
  },
  nonbiri: {
    normal: [
      'ゆっくりでいいわふ', 'いそがないわふ', 'まぁいいわふ', 'あとでやるわふ',
      'ねむいわふ', 'のんびりわふ', 'たべてからでいいわふ', 'きょうおわりわふ',
    ],
    cheeky: [],
  },
  sekkachi: {
    normal: [
      'はやくしたいわふ', 'まちきれないわふ', 'いまやるわふ', 'じっとできないわふ',
      'そわそわわふ', 'いそいそわふ',
    ],
    cheeky: [
      'もたもたするなわふ', 'おそーいわふ', 'どけわふ',
    ],
  },
  oshaberi: {
    normal: [
      'あのねわふ', 'それでねわふ', 'こないだねわふ', 'ママがねわふ',
      'あのこがねわふ', 'きいたわふ？', 'しってるわふ？', 'おもしろいはなしわふ',
    ],
    cheeky: [
      'ねえねえわふ！', 'きいてわふ！', 'すごいでしょわふ！', 'ほんとほんとわふ！',
    ],
  },
  mukuchi: {
    normal: ['…', '……', '…わふ', '、、、', '（無言）'],
    cheeky: [],
  },
  nakimushi: {
    normal: [
      'わふぅ〜', 'ふえぇわふ…', 'いたいのわふ…', 'ママぁわふ…',
      'うぇんわふ', 'なみだわふ', 'ぐすぐすわふ', 'やだぁわふ',
      'うあぁわふ', 'ぽろぽろわふ', 'だれかきてわふ', 'ひとりやだわふ',
    ],
    cheeky: [],
  },
  tsuyoi: {
    normal: [
      'まだだいじょうぶわふ', 'いたくないふりわふ', 'がんばるわふ', 'ほんとはしんどいわふ',
      '…痛いわふ', 'へとへとわふ', 'ちょっとだけ…わふ',
    ],
    cheeky: [
      'もっとこいわふ', 'しんじゃうのはよわいやつわふ', 'へっちゃらわふ',
    ],
  },
  yowai: {
    normal: [
      'つかれたわふ…', 'いたいわふ…', 'めまいわふ', 'もうだめわふ',
      'びょうきわふ', 'からだおもいわふ', 'はぁはぁわふ',
      'たすけてわふ…', 'よこになりたいわふ', 'もどっていいわふ？',
    ],
    cheeky: [],
  },
  morashi: {
    normal: [
      '出ちゃったわふ', 'なんか濡れるわふ', 'あっわふ', 'ぴゅっわふ',
      'ぽたぽたわふ', 'とまらないわふ', 'ごめんわふ', 'ぱんつべちゃわふ',
      'みずたまりわふ', 'あたたかいわふ…',
    ],
    cheeky: [],
  },
  bo_meijin: {
    normal: [
      'ぼうがおもいわふ', 'つかれたわふ', 'ほんとはあぶないわふ', 'ままにみせたいわふ',
      'もうすこしれんしゅうわふ',
    ],
    cheeky: [
      'みてろわふ', 'ぜんいんおしかえすわふ', 'ぼうとひとつわふ', 'だれにもまけないわふ',
      'ゆるがないわふ',
    ],
  },
  tetsugakusha: {
    normal: [
      '存在とはわふ…', 'なぜ在るのかわふ', '時は流れるわふ…', '…',
      'わふとして在るわふ', 'いきるとはわふ', 'ぼくはだれわふ',
    ],
    cheeky: [
      'きょうもわかったわふ', 'これがしんじつわふ',
    ],
  },
};

// 全体で「生意気セリフを引く確率」。個体の zako param で下駄を履かせる。
const CHEEKY_BASE = 0.1;

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
  // くそざこ度が高いほど生意気になりやすい（自己評価と実力のズレ）
  const base = CHEEKY_BASE + Math.max(0, c.params.zako - 50) * 0.002;
  // 無口は絶対生意気らしくない
  if (c.traits.includes('mukuchi')) return 0;
  // 泣き虫・心配性も生意気じゃない
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
