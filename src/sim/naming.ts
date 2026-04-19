// =========================================================================
// 命名ルール（世界観 §4.5.1 準拠）
//   「基本は〜わふ だが、例外／長文化／抽象化／文章化を強く許可」
//   「下ネタ／哲学／意味不明／過度に長い名前も許可」
//   重複NG。同名・酷似名は避ける。
//
//   ルート比率（weights）を触れば名前文化の雰囲気を即調整できる。
// =========================================================================

const ROUTE_WEIGHTS = {
  classic: 22,    // 〜わふ の定番
  adjective: 14,  // 形容詞 + 〜わふ
  situation: 14,  // 状況ログ系
  philosophy: 8,  // 哲学
  shimoneta: 10,  // 下ネタ
  sentence: 16,   // 文章化
  doubled: 6,     // 音繰り返し
  journal: 10,    // 「橋で落ちた3号」のような通し番号
} as const;

const selfCalls = [
  'わふ', 'ぽわ', 'むに', 'ふぎ', 'ぴゃ', 'どぅ', 'もち', 'ぺこ',
  'ずず', 'ぬぷ', 'ぴよ', 'ころ', 'でこ', 'ほわ', 'きゅ', 'ぱふ',
  'みゆ', 'にょ', 'ふみ', 'ぽぺ', 'たま', 'ぼろ',
];

const adjectives = [
  'でかめの', 'ちいさい', 'へんな', '泥まみれ', 'くさい', 'まぬけな',
  'しめった', 'うるさい', 'ねむそう', 'おこの', 'むせた', 'ころんだ',
  'ビビりの', 'ばっちい', 'もうだめな', 'なまぬるい',
];

const situations = [
  'いまうまれた', '木のうしろにいた', '泣きながら歩いてた', 'ころんだ',
  '鈴を拾った', 'こけた', '寝てた', 'もらした', '棒を持ってた',
  '泥水のんだ', '木の実かじった', '橋を見てた',
];

const philosophical = [
  'なぜわふ', 'これが人生', 'ぼくはだれ', 'ママとはなに',
  'きょうもだめ', '世界のはし', 'ころぶ意味', 'わふとはなにか',
  'もう疲れた', 'どうでもいい',
];

const shimoneta = [
  'おちんわふ', 'おしっこわふ', 'うんこわふ', 'おならわふ',
  'もらしわふ', 'でたわふ', 'ちびったわふ', 'ぬれたわふ',
  'ぷりっとわふ', 'どっぴゅんわふ', 'くっさいわふ',
];

const sentenceVerbs = [
  'ころんだ', 'こけた', 'ないた', 'しんだ', 'わらった',
  'もらした', 'はしった', 'ふんだ', 'ぶつかった', 'ねた',
];
const sentenceSubjects = [
  'ママが', 'パパが', 'だれかが', 'ともだちが',
  'スズが', 'ココンが', 'ぼくが', 'わたしが',
];
const sentenceObjects = [
  'ころんだら', 'ないたら', 'わらったら', 'しんだら',
  'ふんだら', 'おしっこかけたら',
];

const journalKeys = ['橋で落ちた', '泥川の', '棒会議生き残り', '音頭中こけた', 'うんこ踏んだ'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function weightedRoute(): keyof typeof ROUTE_WEIGHTS {
  const total = Object.values(ROUTE_WEIGHTS).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [k, w] of Object.entries(ROUTE_WEIGHTS) as [keyof typeof ROUTE_WEIGHTS, number][]) {
    r -= w;
    if (r < 0) return k;
  }
  return 'classic';
}

const journalCounters: Record<string, number> = {};

function generateOne(): string {
  const route = weightedRoute();
  switch (route) {
    case 'classic': {
      const base = pick(selfCalls);
      const tpl = Math.random() < 0.3 ? `わふ${base}わふ` : `${base}わふ`;
      return tpl;
    }
    case 'adjective':
      return `${pick(adjectives)}${pick(selfCalls)}わふ`;
    case 'situation':
      return `${pick(situations)}${pick(selfCalls)}`;
    case 'philosophy':
      return pick(philosophical);
    case 'shimoneta':
      return pick(shimoneta);
    case 'doubled': {
      const a = pick(selfCalls);
      return `${a}${a}わふ`;
    }
    case 'sentence': {
      const kind = Math.floor(Math.random() * 3);
      if (kind === 0) return `${pick(sentenceSubjects)}${pick(sentenceVerbs)}わふ`;
      if (kind === 1) return `${pick(sentenceObjects)}${pick(sentenceVerbs)}わふ`;
      return `${pick(sentenceSubjects)}${pick(sentenceObjects)}${pick(sentenceVerbs)}わふ`;
    }
    case 'journal': {
      const key = pick(journalKeys);
      journalCounters[key] = (journalCounters[key] ?? 0) + 1;
      return `${key}${journalCounters[key]}号`;
    }
  }
}

export function generateName(existingNames: Set<string>): string {
  for (let tries = 0; tries < 32; tries++) {
    const n = generateOne();
    if (!existingNames.has(n)) return n;
  }
  return `名無しわふ${Math.floor(Math.random() * 99999)}`;
}
