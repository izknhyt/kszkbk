const selfCalls = [
  'わふ', 'ぽわ', 'むに', 'ふぎ', 'ぴゃ', 'どぅ', 'もち', 'ぺこ', 'ずず',
  'ぬぷ', 'ぴよ', 'ころ', 'でこ', 'ほわ', 'きゅ', 'ぱふ', 'みゆ',
];

const adjectives = [
  'でかめの', 'ちいさい', 'へんな', '泥まみれ', 'くさい', 'まぬけな',
  'しめった', 'うるさい', 'ねむそう', 'おこの', 'むせた', 'ころんだ',
];

const contexts = [
  'いまうまれた', '木のうしろにいた', '泣きながら歩いてた', 'ころんだときの',
  '鈴を拾った', 'こけた', '寝てた', 'もらした', '棒を持ってた',
];

const longTemplates = [
  (base: string) => `${base}わふ`,
  (base: string) => `${base}ぽわ`,
  (base: string) => `わふ${base}わふ`,
  (base: string) => `${base}${base}`,
];

const philosophical = [
  'なぜわふ', 'これが人生', 'ぼくはだれ', 'ママとはなに',
  'きょうもだめ', '世界のはし', 'ころぶ意味',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function generateName(existingNames: Set<string>): string {
  for (let tries = 0; tries < 64; tries++) {
    const roll = Math.random();
    let name: string;
    if (roll < 0.45) {
      const base = pick(selfCalls);
      name = pick(longTemplates)(base);
    } else if (roll < 0.7) {
      name = `${pick(adjectives)}${pick(selfCalls)}わふ`;
    } else if (roll < 0.9) {
      name = `${pick(contexts)}${pick(selfCalls)}`;
    } else {
      name = pick(philosophical);
    }
    if (!existingNames.has(name)) return name;
  }
  return `名無しわふ${Math.floor(Math.random() * 9999)}`;
}
