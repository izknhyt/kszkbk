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
  // --- P5: 生活 --------------------------------------------------------
  // 最近誰と話したか等、個体のイベントログ。死亡時に墓碑として見せる。
  lifeLog: LifeEvent[];
  // 立ち話再発生までのクールダウン秒
  chatCooldown: number;
  // 目的地の種類（ランドマーク由来の場合、ランドマークID）
  targetLandmarkId: string | null;
}

export interface LifeEvent {
  sec: number;
  text: string;
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
  | 'taiko_tobikomi';

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

// =========================================================================
// 村ランク。累計進行で 4 段階を上がる。建物Lv上限とフレーバーに影響する。
// =========================================================================
export type VillageRank = 'mura' | 'shuraku' | 'machi' | 'to';

// =========================================================================
// ちびわふ個性（特性）。生まれた瞬間に 0〜2 個が付与される。
//   追加するときは types.ts → traits.ts → stage.ts のリング色、の3箇所。
// =========================================================================
export type TraitId =
  | 'bouken'    // 冒険家
  | 'gourmand'  // 食いしん坊
  | 'shinpai'   // 心配性
  | 'ukiyo'     // 浮世離れ
  | 'ikusa'     // 戦闘狂
  | 'noumin';   // 農民気質
