import type { ChibiState, Season } from '../types';

// =========================================================================
// フレーバー特性 → 挙動テーブル
//   82 個のフレーバー全てに "何かしら" 挙動を持たせる。
//   主に：
//     - ambient : 条件なしで低確率に出るバブル or 状態遷移
//     - season  : 特定季節でだけ出る
//     - during  : 特定 state 中だけ出る（sleep中のいびき等）
//
//   全てのフィールドは optional。未指定なら何もしない。
// =========================================================================

export interface FlavorAmbient {
  chance: number;               // 1tick あたり確率
  bubble?: string;              // 吹き出し文字列
  state?: ChibiState;           // 入る状態
  duration?: number;            // state 持続秒
}

export interface FlavorSeasonal {
  season: Season;
  chance: number;
  bubble: string;
}

export interface FlavorDuringState {
  state: ChibiState;
  chance: number;
  bubble: string;
}

// 普遍的に出る（条件なし）
export const FLAVOR_AMBIENT: Record<string, FlavorAmbient> = {
  // --- 体質 ---
  // Σ-7-f もらし系（足元タイル waterLevel + 専用ボコ処理は world.ts 側）
  'おしっこもらし'      : { chance: 0.0008, bubble: 'しゃーわふ！' },
  'うんこもらし'        : { chance: 0.0005, bubble: 'ぶりぶりわふ…' },
  '汗かき'              : { chance: 0.0012, bubble: '💦' },
  '鼻血出やすい'        : { chance: 0.0015, bubble: '🩸', state: 'hurt', duration: 0.6 },
  'しゃっくりが止まらない': { chance: 0.0025, bubble: 'ひっく' },
  'よだれを垂らす'      : { chance: 0.002, bubble: 'だらぁ…わふ' },
  '屁をこく'            : { chance: 0.0015, bubble: 'ぷーわふ' },
  '指が変な角度に曲がる': { chance: 0.0006, bubble: 'ぽき…わふ' },
  '二重視'              : { chance: 0.0008, bubble: 'ふたつみえるわふ…' },
  'まばたきが遅い'      : { chance: 0.001, bubble: '……ぱちり' },
  'くしゃみが大きい'    : { chance: 0.0014, bubble: 'はくしょんわふ！' },
  // --- 頭脳 ---
  '字が読めない'        : { chance: 0.0008, bubble: 'よめないわふ…' },
  '計算がゼロ'          : { chance: 0.0008, bubble: 'いち、に、さん…わふ？' },
  '名前をすぐ忘れる'    : { chance: 0.001, bubble: 'なまえなんだっけわふ' },
  'ママの顔をたまに忘れる': { chance: 0.0008, bubble: 'ママどこだっけわふ' },
  '自分の歳を忘れてる'  : { chance: 0.0006, bubble: 'いまいくつわふ？' },
  '昨日を覚えてない'    : { chance: 0.0008, bubble: 'きのうなにしたわふ？' },
  '数が 3 までしか数えられない': { chance: 0.001, bubble: 'いち、に、さん、わふ！' },
  '左右がわからない'    : { chance: 0.0008, bubble: 'どっちがみぎわふ？' },
  // --- 癖 ---
  '石を集める'          : { chance: 0.0015, bubble: '🪨ほしいわふ' },
  '鈴を奪う'            : { chance: 0.0012, bubble: '🔔ほしいわふ' },
  '泥をなめる'          : { chance: 0.0012, bubble: 'どろぺろわふ' },
  '雲に話しかける'      : { chance: 0.0009, bubble: 'くもさん〜わふ' },
  '影を踏まない'        : { chance: 0.0008, bubble: 'かげこわいわふ' },
  '同じ場所をぐるぐる回る': { chance: 0.001, bubble: 'ぐるぐるわふ…' },
  '自分の尻尾を追う'    : { chance: 0.0012, bubble: 'しっぽ〜わふ！' },
  '地面に絵を描く'      : { chance: 0.0008, bubble: '✏️わふ' },
  '手を舐める'          : { chance: 0.0015, bubble: 'ぺろわふ' },
  // --- 身体能力 ---
  '足が妙に遅い'        : { chance: 0.0005, bubble: 'どっこいしょわふ' }, // speed modifier は別
  '足が妙に速い'        : { chance: 0.0006, bubble: 'しゅたたっわふ！' },
  '音のうるさいのが嫌い': { chance: 0.001, bubble: 'みみふさぐわふ' },
  '明るいのが苦手'      : { chance: 0.0005, bubble: 'まぶしいわふ' },
  '暗いのが苦手'        : { chance: 0.0005, bubble: 'くらいわふ…' },
  '階段で必ず転ぶ'      : { chance: 0.0006, bubble: 'またころんだわふ' },
  // --- 言語 ---
  '吃音がある'          : { chance: 0.0015, bubble: 'わ、わ、わふ' },
  '語尾が必ず上がる'    : { chance: 0.001, bubble: 'わふ↑？' },
  '「ママ…」ばかり呟く' : { chance: 0.003, bubble: 'ママ…わふ' },
  '常にささやき声'      : { chance: 0.0008, bubble: '（わふ）' },
  '大声で叫ぶ'          : { chance: 0.0015, bubble: 'わふーっ！！' },
  // --- 食 ---
  '葉っぱを食べる'      : { chance: 0.0015, bubble: '🍃たべるわふ' },
  'どんぐり蒐集'        : { chance: 0.0012, bubble: '🌰ひろったわふ' },
  '常に空腹そう'        : { chance: 0.0025, bubble: 'はらへったわふ…' },
  '食べ物を口に溜める'  : { chance: 0.001, bubble: 'もぐ…わふ' },
  '1日中何か噛んでる'   : { chance: 0.0018, bubble: 'かむかむわふ' },
  '虫は食べない主義'    : { chance: 0.0004, bubble: '虫はやめとくわふ' },
  '土を少しだけ食べる'  : { chance: 0.001, bubble: 'つちわふ…' },
  // --- 情緒 ---
  'すぐ怒る'            : { chance: 0.0015, state: 'angry', duration: 1, bubble: 'ぷんわふ！' },
  'すぐ忘れる'          : { chance: 0.0015, bubble: 'あれ？わふ' },
  '何にも興味がない'    : { chance: 0.0008, bubble: 'どうでもいいわふ' },
  '全部に興味がある'    : { chance: 0.002, bubble: 'なになに？わふ！' },
  '大きい物に怯える'    : { chance: 0.0008, bubble: 'でかいのこわいわふ' },
  '小さい物に怯える'    : { chance: 0.0008, bubble: 'ちいさいのこわいわふ' },
  // --- ネタ ---
  'まもりんの裏に何か入れてる': { chance: 0.0008, bubble: 'なかにあるわふ…' },
  'ポケットに石を溜めてる': { chance: 0.0008, bubble: '🪨🪨わふ' },
  '右足だけちょっと長い': { chance: 0.0004, bubble: 'みぎあしちょうわふ' },
  '左耳だけ垂れてる'    : { chance: 0.0004, bubble: 'みみたれるわふ…' },
  '鼻がたまに光る'      : { chance: 0.001, bubble: 'はなぴかぴかわふ ✨' },
  '他のちびわふの名前を間違える': { chance: 0.0012, bubble: 'きみだれだっけわふ？' },
  '「なぜわふ」と呟くのが癖': { chance: 0.002, bubble: 'なぜわふ' },
  '毎朝フラナに忘れられる': { chance: 0.0004, bubble: 'ママわすれられたわふ…' },
  '棒会議の議事進行を真似する': { chance: 0.001, bubble: 'ぎちょうわふ！' },
  '鈴を鳴らしたいが腕が届かない': { chance: 0.001, bubble: 'とどかないわふ…' },
  // P5 で既に手書きしてた分は flavorBehaviors には入れず、world.ts 側の特殊ロジックで処理：
  //   暑がり / 寒がり / 歌が壊滅的に下手 / 空をじっと見る / 棒で何でも叩く /
  //   うんこの形が気になる / すぐ寝る / すぐ笑う / いびきがうるさい / 方向音痴
};

// 季節連動
export const FLAVOR_SEASONAL: Record<string, FlavorSeasonal[]> = {
  'しもやけ持ち': [{ season: 'winter', chance: 0.0015, bubble: 'ひりひりわふ…' }],
  '水がこわい'  : [{ season: 'summer', chance: 0.0006, bubble: 'みずこわいわふ' }],
  '雨の日だけ元気': [{ season: 'spring', chance: 0.001, bubble: 'あめきたいわふ！' }],
  '朝に弱い'    : [{ season: 'winter', chance: 0.0008, bubble: 'さむくてうごけないわふ' }],
};

// 特定 state 中だけ発火
export const FLAVOR_DURING: Record<string, FlavorDuringState> = {
  '寝相が悪い'   : { state: 'sleep', chance: 0.003, bubble: 'ねがえりわふ' },
  // いびき は world.ts 側で既に処理済み
};

// ambient で発火したら "くそざこ村の理不尽裁判" の対象になる粗相系フレーバー。
// 屁・しゃっくり・よだれ・鼻血・泥舐め・手舐め・うんこ気にしなど、
// 周囲がブチ切れても不思議じゃない（けど実際には理不尽）行動。
// Σ-7-f もらし系：別途 maybePunishMorashi を呼び、bo_suki/ikusa/ココン参戦の専用ボコ。
// EMBARRASSING_FLAVORS とは別管理（こちらは普通の理不尽ボコ）。
export const MORASHI_FLAVORS = new Set<string>(['おしっこもらし', 'うんこもらし']);

export const EMBARRASSING_FLAVORS = new Set<string>([
  '屁をこく',
  'しゃっくりが止まらない',
  'よだれを垂らす',
  '鼻血出やすい',
  '汗かき',
  'くしゃみが大きい',
  '泥をなめる',
  '土を少しだけ食べる',
  '手を舐める',
  '鼻がたまに光る',
  '大声で叫ぶ',
  '指が変な角度に曲がる',
  '同じ場所をぐるぐる回る',
  '自分の尻尾を追う',
  'ポケットに石を溜めてる',
  'まもりんの裏に何か入れてる',
]);

// speed を変える flavor（spawn時適用）
export const FLAVOR_SPEED_MOD: Record<string, number> = {
  '足が妙に遅い': 0.8,
  '足が妙に速い': 1.2,
};

export function applyFlavorSpeedMod(flavors: string[]): number {
  let m = 1;
  for (const f of flavors) {
    const mod = FLAVOR_SPEED_MOD[f];
    if (mod) m *= mod;
  }
  return m;
}
