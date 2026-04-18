import type { Chibiwafu, TraitId } from '../types';
import { derivedChatChance } from './personality';

// =========================================================================
// すれ違い立ち話
//   近くの2体が一定確率で「話す」状態になる。
//   数秒互いの位置で止まって吹き出しを出し合い、終わったらまた歩き出す。
//
//   会話セリフは特性カラーも反映：戦闘狂は威嚇気味、心配性は泣き気味…など。
// =========================================================================

const GENERIC_LINES = [
  'わふ？', 'おなかすいた', 'なぜわふ…', 'もらした', 'ママー！',
  'あのね…', 'わふ〜', 'ぽわ？', 'ふにゃ', 'ふぎゃ',
  '棒ほしい', 'くさい！', 'これが人生…', 'おしっこ出る',
  'ねむい…', 'あそぼ', 'ママどこ？',
];

const TRAIT_LINES: Partial<Record<TraitId, string[]>> = {
  bouken: ['川の向こう！', '行ってみたい', 'こわくない', '冒険！'],
  gourmand: ['石パン！', 'たべる', 'おかわり', 'ぜんぶ食べる'],
  shinpai: ['こわい…', 'ママの近くがいい…', '帰りたい…', 'やだやだ'],
  ukiyo: ['なぜわふ', 'わふとは…', '無だ…', '空きれい'],
  ikusa: ['やるか？', 'どけ！', 'ぶつぞ', '棒よこせ'],
  noumin: ['種まくよ', '泥のにおい…', '豊作だ', '逆さに植えよう'],
};

function pickLine(c: Chibiwafu): string {
  // 特性を持ってたら 60% で特性セリフ、それ以外は generic
  for (const t of c.traits) {
    const pool = TRAIT_LINES[t];
    if (pool && Math.random() < 0.6) {
      return pool[Math.floor(Math.random() * pool.length)]!;
    }
  }
  return GENERIC_LINES[Math.floor(Math.random() * GENERIC_LINES.length)]!;
}

export interface ChatAttempt {
  a: Chibiwafu;
  b: Chibiwafu;
  lineA: string;
  lineB: string;
  duration: number;
}

// 2体の位置が近く、かつ両方 idle 状態なら 10%/frame で立ち話させる。
export function maybeStartChat(c1: Chibiwafu, c2: Chibiwafu): ChatAttempt | null {
  if (c1.chatCooldown > 0 || c2.chatCooldown > 0) return null;
  if (c1.state !== 'idle' && c1.state !== 'surprised') return null;
  if (c2.state !== 'idle' && c2.state !== 'surprised') return null;
  // 社交性の平均で発動確率が決まる
  if (Math.random() > derivedChatChance(c1.params, c2.params)) return null;
  return {
    a: c1,
    b: c2,
    lineA: pickLine(c1),
    lineB: pickLine(c2),
    duration: 2.2 + Math.random() * 1.3,
  };
}
