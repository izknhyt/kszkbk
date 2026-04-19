export type ChibiState =
  | 'idle'
  | 'cry'
  | 'surprised'
  | 'angry'
  | 'sleep'
  | 'dazed'
  | 'hurt'
  | 'exhausted'
  | 'dead'
  // --- P5: 生活ステート ---------------------------------------------------
  | 'chatting'   // すれ違い立ち話（移動停止）
  | 'staring'    // 浮世離れが空を見上げる
  | 'eating';    // 石パン岩／泥水池で飲食

export interface Vec2 {
  x: number;
  y: number;
}

export interface Chibiwafu {
  id: number;
  name: string;
  birthTick: number;
  ageSec: number;
  pos: Vec2;
  target: Vec2 | null;
  state: ChibiState;
  stateTimer: number;
  deathTick: number | null;
  deathCauseId: string | null;
  speed: number;
  maxAgeSec: number;
  faceLeft: boolean;
  traits: TraitId[];
  // 10軸のパーソナリティ（連続値 0-100）。挙動は基本これで決まる。
  params: import('./sim/personality').ChibiParams;
  // フレーバー特性（動きに効かない小さな性格ラベル、モーダル表示用）
  flavors: string[];
  // --- P5: 生活 --------------------------------------------------------
  // 最近誰と話したか等、個体のイベントログ。死亡時に墓碑として見せる。
  lifeLog: LifeEvent[];
  // 立ち話再発生までのクールダウン秒
  chatCooldown: number;
  // 目的地の種類（ランドマーク由来の場合、ランドマークID）
  targetLandmarkId: string | null;
  // --- HP（神様に殴られる／振り回される／投げられる時だけ減る）-------
  // 0 になったら死亡（kamisama_punch か kamisama_shake か kamisama_throw）。
  // 通常の事故死（ハザード・音頭・棒会議など）は HP を経由しない即死。
  hp: number;
  maxHp: number;
  // 投げられて飛行中（null = 地上）
  flight: FlightState | null;
  // --- サバイバル ---------------------------------------------------
  // 空腹度 0-100。時間で上昇、食料を食べれば減る。100 で starvation。
  hunger: number;
  // 疲労度 0-100。活動で上昇、睡眠で減る。100 で exhaustion。
  fatigue: number;
  // 割当て住居の feature id。null なら野宿組（夜に HP ドレイン + 疲労回復鈍化）
  homeFid: string | null;
}

export interface LifeEvent {
  sec: number;
  text: string;
}

// 投げられて空中を飛んでいる状態（ちびわふ・NPC 共用）。
// flightStep が毎 tick 座標を更新し、終わったら着地ダメージを入れて null に戻す。
export interface FlightState {
  vx: number;  // px/sec
  vy: number;
  leftSec: number;
  totalSec: number;
  hitKeys: string[];  // 同一個体を重ねて巻き添えしない
  landingDamage: number;
  landCauseId: string;  // HP 0 になった時の死因
}

export type DeathCauseId =
  | 'bokaigi'
  | 'ondo'
  | 'mudriver'
  | 'stonebread'
  | 'bridge'
  | 'fire'
  | 'roushuai'
  | 'philosophy'
  | 'summer_boil'
  | 'winter_snow'
  | 'spring_drunk'
  | 'autumn_harvest'
  | 'noukou_mud'
  | 'kouba_spark'
  | 'taiko_crush'
  | 'cocoon_abuse'
  // --- Uncommon（特性×状況で解禁）-----------------------------------------
  | 'bouken_cliff'
  | 'gourmand_choke'
  | 'shinpai_kashou'
  | 'ukiyo_shoushitsu'
  | 'ikusa_taezetsu'
  | 'noumin_umore'
  | 'suzu_kazoe_shikujiri'
  | 'taiko_tobikomi'
  // --- P6 追加 Uncommon ----------------------------------------------------
  | 'morashi_fall'           // もらし常習が自分の水たまりで溺れる
  | 'oshaberi_choked'        // おしゃべりが音頭中に喋り過ぎて息切れ
  | 'tabikko_boundary'       // 旅っ子がワールドの端で行方不明
  | 'tetsugakusha_shoushitsu'// 哲学者が考えすぎて輪郭が消えた
  | 'bo_meijin_tenka'         // 棒名人が棒会議でみんなを転倒させる
  | 'namaiki_boko'            // 生意気な発言をしてボコボコに殴られる
  | 'rifujin_boko'            // 屁・しゃっくり等の粗相で理不尽にボコボコにされる
  | 'kamisama_punch'          // プレイヤー（神様）の鉄槌で死亡
  | 'kamisama_drown'          // プレイヤーに水に投げ込まれて死亡
  | 'kamisama_shake'          // プレイヤーに掴まれて振り回され衰弱死
  | 'kamisama_throw'          // プレイヤーに投げつけられ地面に激突死
  | 'mama_lost'               // フラナ（ママ）を失って心が折れて死亡
  | 'hunger_death'            // 空腹で餓死
  | 'fatigue_death'           // 疲労で衰弱死
  | 'flood_drown'            // 洪水に流されて溺死
  | 'wolf_bite';             // オオカミに噛み殺された

export interface DeathCause {
  id: DeathCauseId;
  title: string;
  template: (name: string) => string;
  rare: boolean;
  // Uncommon 死因は特定の特性 × 状況で解禁される。図鑑UIでバケット分け。
  uncommon?: boolean;
  points: number;
}

export interface DexEntry {
  id: DeathCauseId;
  count: number;
  firstVictim?: string;
  firstContext?: string;
  firstDiscoveredTick?: number;
}

export interface BuildingDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  costGrowth: number;
  effect: string;
}

export interface PlacedBuilding {
  defId: string;
  level: number;
  pos: Vec2;
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

// フリー配置の開拓要素（水源・水路・畑・道）。
// タイル/グリッド無しで任意の座標に置ける。水の伝播は距離ベースで判定。
export type FeatureKind = 'water' | 'channel' | 'path' | 'farm' | 'house' | 'well' | 'firewatch' | 'sawmill' | 'shrine';

export interface Feature {
  id: string;
  pos: Vec2;
  kind: FeatureKind;
  devLevel: number;   // 0-3（畑の成長段階・道の使用摩耗など）
  workSec: number;    // 作業累積秒
  // 水理計算（transient: tick毎に再計算、保存不要）
  flow?: number;       // 現在の通水量 units/sec
  saturated?: boolean; // 許容量超過 → 氾濫中
}

// 氾濫セル（水路が溢れた場所から広がる洪水範囲）
export interface FloodZone {
  x: number;
  y: number;
  radius: number;     // 現在の氾濫半径 px
  remainingSec: number;
  sourceFid: string;  // どの水路/水源が溢れたか
}

// 障害物（荒地に散在。ちびわふが叩いて減らす、破壊で木材/石材を生産）
export type ObstacleKind = 'rock' | 'stump' | 'bush';

export interface Obstacle {
  id: string;
  pos: Vec2;
  kind: ObstacleKind;
  hp: number;
  maxHp: number;
}

// プレイヤー操作の対象（ちびわふ or NPC）。
// stage.ts の hitTest と main.ts の punch/drag/drop イベントで共有。
export type HitTarget =
  | { kind: 'chibi'; id: number }
  | { kind: 'npc'; id: string }
  | { kind: 'wolf'; id: number };
// 1日の位相。time-of-day で挙動・見た目を変える。
// morning(0-25%) / noon(25-55%) / evening(55-80%) / night(80-100%)
export type DayPhase = 'morning' | 'noon' | 'evening' | 'night';

// ラン開始時に選ぶ難度。災害頻度・初期資源・ちびわふ能力を変える。
// 初心者：普通の村シム級 / 標準：激ムズ（設計基準） / 地獄：無理ゲー
export type Difficulty = 'beginner' | 'standard' | 'hell';

// 気象（季節とは別レイヤー）。1 日単位で変化、季節で確率が変わる。
export type WeatherKind =
  | 'clear'        // 快晴
  | 'cloudy'       // 曇
  | 'light_rain'   // 小雨
  | 'heavy_rain'   // 大雨
  | 'storm'        // 嵐
  | 'fog'          // 霧
  | 'drought'      // 乾燥
  | 'snow'         // 雪
  | 'heatwave';    // 熱波

export interface Weather {
  kind: WeatherKind;
  remainingSec: number;  // この天気があと何秒続くか
}

// 今日＋明日＋明後日の 3 日先予報。精度は先になるほど下がるが、表示用。
export interface WeatherForecastEntry {
  dayOffset: number;  // 0=今日 / 1=明日 / 2=明後日
  kind: WeatherKind;
}

// オオカミ（夜間のみ出現、野宿ちびわふを優先的に狙う）
// 朝になると map 端へ撤退する。プレイヤーの左クリックでダメージ。
export type WolfState =
  | 'stalk'      // ターゲットへ接近中
  | 'bite'       // 攻撃直後の硬直
  | 'flee'       // 朝の撤退 or ダメージ後
  | 'dead';

export interface Wolf {
  id: number;
  pos: Vec2;
  targetChibiId: number | null;
  state: WolfState;
  stateTimer: number;
  hp: number;
  maxHp: number;
  speed: number;             // px/sec 基礎速度
  biteCooldown: number;      // 噛みついた直後の再噛み抑止（秒）
  faceLeft: boolean;
  spawnTick: number;
}

// =========================================================================
// 村ランク。累計進行で 4 段階を上がる。建物Lv上限とフレーバーに影響する。
// =========================================================================
export type VillageRank = 'mura' | 'shuraku' | 'machi' | 'to';

// =========================================================================
// ちびわふ個性（特性）。生まれた瞬間に 0〜2 個が付与される。
//   追加するときは types.ts → traits.ts → stage.ts のリング色、の3箇所。
// =========================================================================
export type TraitId =
  // コア6種
  | 'bouken'       // 冒険家
  | 'gourmand'     // 食いしん坊
  | 'shinpai'      // 心配性
  | 'ukiyo'        // 浮世離れ
  | 'ikusa'        // 戦闘狂
  | 'noumin'       // 農民気質
  // --- P6 追加14種 ---------------------------------------------------
  | 'tabikko'      // 旅っ子
  | 'gunsuki'      // 群好き
  | 'hitoribochi'  // 一人ぼっち
  | 'bo_suki'      // 棒好き
  | 'taiko_kko'    // 太鼓っ子
  | 'nonbiri'      // のんき
  | 'sekkachi'     // せっかち
  | 'oshaberi'     // おしゃべり
  | 'mukuchi'      // 無口
  | 'nakimushi'    // 泣き虫
  | 'tsuyoi'       // 丈夫
  | 'yowai'        // 虚弱
  | 'morashi'      // もらし常習
  | 'bo_meijin'    // 棒名人（レア）
  | 'tetsugakusha';// 哲学者（レア）
