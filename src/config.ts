// =========================================================================
// くそざこ村 — balance config
//   全てここで一元管理。テストプレイ後の微調整はまずこのファイルを触る。
//   値を変えても型エラーや挙動破綻を起こしにくいよう、構造はフラットに保つ。
// =========================================================================

export const CONFIG = {
  // --- 時間 -----------------------------------------------------------------
  // 1tickあたりの秒数（固定tick）。小さくすると滑らか・CPU負荷UP。
  TICK_DT: 1 / 20,
  // 1シーズンの実時間秒数。短くすると季節イベントを素早く確認できる。
  SECONDS_PER_SEASON: 60,
  // UI再描画の間隔（秒）。HUDの更新頻度。
  UI_REFRESH_SEC: 0.25,
  // オートセーブ間隔（秒）。
  AUTOSAVE_SEC: 5,

  // --- 人口 -----------------------------------------------------------------
  BASE_POP_CAP: 10,
  MAX_CORPSES_VISIBLE: 40,
  // 出産の基礎インターバル（秒）。人口不足で短縮される。
  BASE_SPAWN_INTERVAL_SEC: 5,
  // 出産インターバルの揺らぎ（秒）。毎回±rand()*この値。
  SPAWN_INTERVAL_JITTER_SEC: 1.5,
  // 出生率の人口連動：生存数がキャップに近いほど1.0、空に近いほどこの値（下限）。
  // 例: 0.35 だと空っぽの時は通常の35%の間隔で次々産む。
  BIRTH_DEFICIT_BOOST_MIN: 0.35,
  // 生存数 / キャップ がこの比率未満なら、1回の出産で burst を許可する。
  BIRTH_BURST_THRESHOLD: 0.15,
  // 緊急時 burst の最大同時出産数。
  BIRTH_BURST_MAX: 3,

  // --- ちびわふ個体 ----------------------------------------------------------
  CHIBI_SPEED_MIN: 18,
  CHIBI_SPEED_RANGE: 10,
  CHIBI_MAX_AGE_MIN_SEC: 40,
  CHIBI_MAX_AGE_RANGE_SEC: 80,

  // --- ポイント --------------------------------------------------------------
  // 死因ごとの基本獲得Pは deaths.ts 側で定義。ここは共通倍率のみ。
  GLOBAL_POINT_MULT_BASE: 1.0,

  // --- グローバルイベント（スケジュール駆動の離散バースト） ------------------
  //  以前は「毎tick コイン投げ」で、20Hz × 建物マルチで常時ドリップ状態だった。
  //  今は「N秒ごとに1回発動、発動中はエンベロープで強度変化」モデル。
  ONDO_DURATION_SEC: 10,
  FIRE_DURATION_SEC: 8,
  // イベント中の「ピーク強度」（envelopeの最大値）。
  // 実際の瞬間killレートは intensityAt() でピークから山形に補間される。
  ONDO_KILL_RATE: 0.08,
  FIRE_KILL_RATE: 0.12,

  // 音頭のスケジュール：basis +（太鼓やぐら数×per）、min で下限ガード。
  ONDO_BASE_INTERVAL_SEC: 180,
  ONDO_INTERVAL_PER_TAIKO: -30,
  ONDO_INTERVAL_MIN_SEC: 60,
  // 火事のスケジュール：basis +（鍛冶場数×per）、min で下限ガード。
  FIRE_BASE_INTERVAL_SEC: 220,
  FIRE_INTERVAL_PER_KOUBA: -35,
  FIRE_INTERVAL_MIN_SEC: 80,

  // --- 棒会議（自動発動の密度ベース）---------------------------------------
  // 村の生存数がこの閾値以上＆CD 0で発動。ちびわふ 1〜N 匹を犠牲に選ぶ。
  BOKAIGI_CLUSTER_MIN: 6,
  BOKAIGI_VICTIMS_MAX: 3,
  BOKAIGI_COOLDOWN_SEC: 45,

  // --- 太鼓祭り（季節境界で発動、太鼓やぐら1つ以上で有効）-------------------
  TAIKO_FESTIVAL_DURATION_SEC: 12,
  TAIKO_FESTIVAL_KILL_RATE: 0.10,
  // 祭り中、taiko ハザードはこの値にバーストする（通常は buildings.ts 側の値）。
  TAIKO_FESTIVAL_RADIUS: 60,
  TAIKO_FESTIVAL_RATE_PER_SEC: 0.08,

  // --- ハザード（詳細は hazards.ts）-----------------------------------------
  // Safe zone（フラナ周辺は即死ゾーン無効）
  SAFE_ZONE_R: 70,

  // --- デバッグ --------------------------------------------------------------
  DEFAULT_TIME_SCALES: [1, 4, 16, 64] as const,
} as const;

export type TimeScale = (typeof CONFIG.DEFAULT_TIME_SCALES)[number];
