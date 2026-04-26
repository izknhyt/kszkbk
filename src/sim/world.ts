import type { Chibiwafu, DayPhase, DeathCauseId, DexEntry, Difficulty, Feature, FeatureKind, FlightState, FloodZone, Obstacle, ObstacleKind, PlacedBuilding, Season, TerrainMaterial, TerrainTile, TerraformJob, Vec2, VillageRank, Weather, WeatherForecastEntry, WeatherKind, Wolf } from '../types';
import { seedFromRunId } from './terrain/noise';
import { generateTerrain } from './terrain/generators';
import { findDryTile, isSeaAt, setQueryTerrain } from './terrain/query';
import { DEATH_CAUSES } from './deaths';
import { BUILDINGS, buildingsToHazards } from '../city/buildings';
import {
  distance,
  isAlive,
  peekNextId,
  resetIdCounter,
  setState,
  spawnChibiwafu,
  wanderStep,
} from './chibiwafu';
import { generateName } from './naming';
import { SEASONS, dayProgress, intensityAt, phaseFromProgress, seasonFromTime, type GlobalEvent } from './events';
import { HAZARDS, hazardActiveInSeason, pointInZone, type HazardZone } from './hazards';
import { CONFIG } from '../config';
import {
  CHIBI_TO_COCOON_LINES,
  CHIBI_TO_FURANA_LINES,
  CHIBI_TO_FURANA_SCARED_LINES,
  CHIBI_TO_SUZU_LINES,
  COCOON_DEATH_LINES,
  COCOON_LINES_ABUSE,
  COCOON_LINES_CHAT,
  COCOON_LINES_DEATH,
  FURANA_LINES_ANGRY,
  FURANA_LINES_CHAT,
  FURANA_LINES_CHAT_ANGRY,
  FURANA_LINES_DEATH,
  FURANA_LINES_DEATH_REACTION,
  FURANA_LINES_HAPPY,
  FURANA_LINES_HATE,
  FURANA_LINES_IDLE,
  FURANA_LINES_PAT,
  FURANA_LINES_THROW,
  FURANA_LINES_WEIRD_DEATH,
  LOU_LINES,
  NPC_DEFS,
  SUZU_LINES_BIRTH,
  SUZU_LINES_CHAT,
  SUZU_LINES_DEATH,
  SUZU_LINES_MAMA_DEATH,
  SUZU_LINES_MAMA_HURT,
  SUZU_LINES_ONDO,
  createNpcs,
  hurtLinesFor,
  pickLine,
  pushNpcLife,
  reviveLinesFor,
  wanderNpc,
  type NpcState,
} from './npcs';
import { spawnBubble, updateBubbles, type Bubble } from './bubbles';
import { rollTraits } from './traits';
import { computeRank, maxBuildingLevel, upgradeCostFor, type RankContext } from './rank';
import {
  CRY_REASONS,
  DAZED_REASONS,
  SLEEP_REASONS,
  maybeStartChat,
  pickActionAnnounce,
  pickAngryBystanderLine,
  pickBegFoodLine,
  pickCollisionVictimLine,
  pickComfortLine,
  pickCopyCryLine,
  pickConstructionAbandonLine,
  pickConstructionDeathReactionLine,
  pickConstructionDoneLine,
  pickConstructionFightLine,
  pickConstructionSabotageLine,
  pickCocoonConstructionFightLine,
  pickFuranaConstructionAccidentLine,
  pickSuzuConstructionAccidentLine,
  pickLuConstructionAccidentLine,
  pickMorashiDisgustLine,
  pickMorashiWipeLine,
  pickOshaberiLine,
  pickReason,
  pickRifujinStrikerLine,
  pickRifujinVictimLine,
  pickSchadenfreudeLine,
  pickSleepyContagionLine,
  pickStrikerLine,
  pickVictimHurtLine,
  pickWaterSteppedLine,
  pickDrownLastWords,
  pickPeeMorashiLine,
  pickPoopMorashiLine,
  pickBokoAttackerLine,
  pickBokoWitnessLine,
  pickFuranaScoldLine,
  pickCocoonBokoLine,
} from './chats';
import { EMBARRASSING_FLAVORS, FLAVOR_AMBIENT, FLAVOR_DURING, FLAVOR_SEASONAL, MORASHI_FLAVORS, applyFlavorSpeedMod } from './flavorBehaviors';
import { SpatialHash } from './spatialHash';
import { TRAIT_DEFS } from './traits';
import {
  applyTraitBias,
  derivedChatCooldown,
  derivedHazardSusceptibility,
  derivedSoloSpeakChance,
  rollParams,
} from './personality';
import { rollFlavors, rollFlavorCount } from './flavorTraits';

export interface DeathLogEntry {
  tick: number;
  name: string;
  causeId: DeathCauseId;
  text: string;
}

export interface WorldState {
  // ラン識別子・難度・開始時刻（ローグライクで run ごとに分ける）
  runId: string;
  runStartedAtMs: number;
  difficulty: Difficulty;
  tick: number;
  timeSec: number;
  secondsPerSeason: number;
  season: Season;
  // 1日の位相（朝/昼/夕/夜）。tick で計算。
  dayPhase: DayPhase;
  // 0-1 の進行度（見た目補間用、位相ティングで使う）。
  dayProgress: number;
  // 経過日数（整数）。UI表示・lv成長要因に使う。
  dayCount: number;
  // 前 tick の dayPhase（日付変わり／位相境界の検出用）。
  lastDayPhase: DayPhase;
  furanaPos: Vec2;
  chibis: Chibiwafu[];
  corpses: Chibiwafu[];
  maxCorpses: number;
  buildings: PlacedBuilding[];
  points: number;
  // 累計獲得くそざこポイント（建物に使っても減らない）。村Lv の成長源。
  totalPointsEarned: number;
  // 連続値の村レベル 1-99。totalPointsEarned から毎tick 再計算される。
  villageLv: number;
  // --- 開拓リソース（P1-C2）----------------------------------------------
  // 食料: 畑から生産、ちびわふが食べる / 空腹を下げる（将来）
  // 水:   水源 + 水路で補給、畑にも必要（将来）
  // 木材: 伐採で得る、建物の材料
  // 石材: 石切で得る、建物の材料
  resources: { food: number; water: number; wood: number; stone: number; plank: number; power: number; brick: number; wool: number; cloth: number; soil: number };
  totalDeaths: number;
  totalBirths: number;
  stompCount: number;
  // --- 統計（セッション累積。平均寿命・最長寿・最短寿）-------------------
  sumDeathAgeSec: number;
  longestLifeSec: number;
  longestLifeName: string;
  shortestLifeSec: number;
  shortestLifeName: string;
  // フラナがプレイヤーに掴まれている間だけ >0。mama 高めのちびわふが追いかける
  furanaGrabbedTimer: number;
  dex: Record<DeathCauseId, DexEntry>;
  recentDeaths: DeathLogEntry[];
  newDiscoveries: DeathCauseId[]; // 前フレームで新規発見された図鑑ID
  newConstructions: { id: string; kind: FeatureKind }[]; // 建設完了キュー（main.ts が drainしてトースト）
  villageRank: VillageRank; // 4段階のランク。tickWorld で計算される
  nameSet: Set<string>;
  bounds: { w: number; h: number };
  spawnCooldown: number;
  baseSpawnInterval: number;
  baseCap: number;
  event: GlobalEvent | null;
  pointMultiplier: number;
  // 産屋で伸びる出産速度倍率。1.0 = 通常、1.36 なら +36% 速い。
  spawnSpeedMultiplier: number;
  // 次の音頭／火事までの秒カウントダウン（イベント発動中は Infinity）。
  ondoCooldown: number;
  fireCooldown: number;
  // 棒会議の再発動まで秒。人口が閾値超えると棒会議が自動発動する。
  bokaigiCooldown: number;
  // 棒会議発動後の演出用タイマー（秒）。stage が読んでマーカーを表示する。
  bokaigiMarkerTimer: number;
  // 季節境界検出用。1tick前の季節。
  lastSeason: Season;
  npcs: NpcState[];
  bubbles: Bubble[];
  // 開拓要素（水源・水路・畑・道）。自由配置、距離ベースで接続判定。
  features: Feature[];
  // 障害物（マップに散在。ちびわふが叩いて消す）
  obstacles: Obstacle[];
  // 空間分割ハッシュ。tick 毎にちびわふ位置を再配置、近傍検索に使う。
  // 保存対象外（transient）。
  chibiHash: SpatialHash;
  // --- 気象（季節とは別レイヤー）---------------------------------------
  weather: Weather;
  weatherForecast: WeatherForecastEntry[];  // 3 日先までの予報
  // 前 tick の dayCount。境目で天気を更新するために比較する。
  lastWeatherDayCount: number;
  // --- 水理（Ω-2）------------------------------------------------------
  // 溢れた水路から広がる洪水セル（transient：保存不要）
  floodZones: FloodZone[];
  // --- オオカミ（Ω-5）---------------------------------------------------
  // 夜間のみ出現。野宿ちびわふを優先して狙う。transient（保存不要）。
  wolves: Wolf[];
  // 次のオオカミ群スポーンまで（秒）。夜開始で再設定、朝でクリア。
  wolfSpawnCooldown: number;
  // 撃破したオオカミ数（統計）
  wolvesKilled: number;
  // 直近の落雷ヒット位置（UI/FX 用。transient、保存しない）
  lastThunderStrikeAt?: { x: number; y: number; tick: number };
  // --- Σ-2 タイル式ハイトマップ -------------------------------------------
  // 32px セルの 2D タイル配列 [row][col]。100×57 = 5700 タイル。
  // getElevation(x,y) はここから bi-linear 補間で返す。persist 対象（RLE 圧縮）。
  terrain: TerrainTile[][];
  // Σ-2-b: ちびわふが盛り土・切り土を行うジョブキュー（persist 対象）
  terraformJobs: TerraformJob[];
  // --- Σ-3 地形シード ---------------------------------------------------
  // runId から派生。difficulty ごとに異なる地形プリセットを同一シードで再現可能。
  terrainSeed: number;
  // --- Σ-7 水動力 -------------------------------------------------------
  // 0.25 秒毎にフロー計算を行う duty cycle 用カウンタ（transient）。
  // 雨/蒸発/吸収は毎 tick、downhill flow と feature キャッシュは 0.25s 毎。
  hydroTimer: number;
}

// フリー配置障害物：陸地タイルのみ、フラナ拠点付近は除外。
function createInitialObstacles(bounds: { w: number; h: number }, target = 24): Obstacle[] {
  const list: Obstacle[] = [];
  const kinds: ObstacleKind[] = ['rock', 'stump', 'bush'];
  const hpMap: Record<ObstacleKind, number> = { rock: 30, stump: 25, bush: 15 };
  const centerX = bounds.w / 2;
  const centerY = bounds.h * 0.35;
  const minSpacing = 48;
  let attempts = 0;
  let seq = 0;
  while (list.length < target && attempts < 2000) {
    attempts++;
    const x = 60 + Math.random() * (bounds.w - 120);
    const y = 60 + Math.random() * (bounds.h - 120);
    if (isSeaAt(x, y)) continue;  // Σ-3-d: 海タイル除外
    // フラナ拠点から 120px 以内は避ける（初期村空間を確保）
    if (Math.hypot(x - centerX, y - centerY) < 120) continue;
    if (list.some((o) => Math.hypot(o.pos.x - x, o.pos.y - y) < minSpacing)) continue;
    const k = kinds[Math.floor(Math.random() * kinds.length)]!;
    list.push({
      id: `obs-${seq++}`,
      pos: { x, y },
      kind: k,
      hp: hpMap[k],
      maxHp: hpMap[k],
    });
  }
  return list;
}

// Σ-5-g: 朝に茂みが自然再生する。資源（特に wood）の枯渇対策として、
// 障害物が初期数 × 1.5 を超えない範囲で 1-2 本/朝 spawn。
// 既存障害物 / feature / 海タイル / フラナ拠点近辺は避ける。
let _bushSeq = 100000;  // 既存 obs-N 系と被らない名前空間
function growBushes(w: WorldState): void {
  const initialCount = DIFFICULTY_MODS[w.difficulty].obstacleCount;
  const cap = Math.floor(initialCount * 1.5);
  if (w.obstacles.length >= cap) return;
  // 難度別に毎朝何本生やすか：beginner 2, standard 1, hell 1
  const target = w.difficulty === 'beginner' ? 2 : 1;
  const bounds = w.bounds;
  const centerX = bounds.w / 2;
  const centerY = bounds.h * 0.35;
  const minSpacing = 48;
  let spawned = 0;
  let attempts = 0;
  while (spawned < target && attempts < 200) {
    attempts++;
    const x = 60 + Math.random() * (bounds.w - 120);
    const y = 60 + Math.random() * (bounds.h - 120);
    if (isSeaAt(x, y)) continue;
    if (Math.hypot(x - centerX, y - centerY) < 120) continue;
    if (w.obstacles.some((o) => Math.hypot(o.pos.x - x, o.pos.y - y) < minSpacing)) continue;
    if (w.features.some((f) => Math.hypot(f.pos.x - x, f.pos.y - y) < 32)) continue;
    w.obstacles.push({
      id: `bush-${_bushSeq++}`,
      pos: { x, y },
      kind: 'bush',
      hp: 15,
      maxHp: 15,
    });
    spawnBubble(w.bubbles, { x, y: y - 16 }, '🌱', 'speech', 1.6);
    spawned++;
  }
}

// 初期 feature 配置：フラナ拠点近くに 水源 1 / 水路 2 / 畑 1 を横並びに
// （広いマップの中央付近、ちびわふが最初からアクセスできる位置）
function createInitialFeatures(bounds: { w: number; h: number }): Feature[] {
  const features: Feature[] = [];
  let seq = 0;
  const mkId = () => `feat-${seq++}`;
  // 拠点中央の少し左に水源。フラナが bounds.w/2, bounds.h*0.35 付近にいる
  const centerY = bounds.h * 0.35;
  const waterPos: Vec2 = findDryTile(bounds.w / 2 - 180, centerY, 200);
  features.push({ id: mkId(), pos: waterPos, kind: 'water', devLevel: 3, workSec: 0 });
  features.push({ id: mkId(), pos: { x: waterPos.x + 55, y: waterPos.y }, kind: 'channel', devLevel: 2, workSec: 0 });
  features.push({ id: mkId(), pos: { x: waterPos.x + 110, y: waterPos.y }, kind: 'channel', devLevel: 2, workSec: 0 });
  features.push({ id: mkId(), pos: { x: waterPos.x + 165, y: waterPos.y }, kind: 'farm', devLevel: 2, workSec: 0 });
  return features;
}

// === 気象 ===============================================================
// 季節ごとの天気重みテーブル（確率分布）。合計は内部で正規化。
const WEATHER_WEIGHTS: Record<Season, Partial<Record<WeatherKind, number>>> = {
  spring: { clear: 40, cloudy: 25, light_rain: 20, heavy_rain: 7,  fog: 5,  storm: 2,  drought: 1 },
  summer: { clear: 35, cloudy: 15, light_rain: 10, heavy_rain: 10, storm: 10, drought: 10, heatwave: 10 },
  autumn: { clear: 25, cloudy: 30, light_rain: 20, heavy_rain: 10, fog: 10, storm: 5 },
  winter: { clear: 20, cloudy: 25, snow: 35, fog: 10, heavy_rain: 5, drought: 5 },
};
const WEATHER_LABEL: Record<WeatherKind, string> = {
  clear: '快晴',
  cloudy: '曇',
  light_rain: '小雨',
  heavy_rain: '大雨',
  storm: '嵐',
  fog: '霧',
  drought: '乾燥',
  snow: '雪',
  heatwave: '熱波',
};
const WEATHER_ICON: Record<WeatherKind, string> = {
  clear: '☀', cloudy: '☁', light_rain: '🌦', heavy_rain: '🌧',
  storm: '⛈', fog: '🌫', drought: '💨', snow: '❄', heatwave: '🥵',
};
export { WEATHER_LABEL, WEATHER_ICON };

// 季節の重みから天気を 1 つ抽選
function pickWeatherForSeason(season: Season): WeatherKind {
  const w = WEATHER_WEIGHTS[season];
  const entries = Object.entries(w) as Array<[WeatherKind, number]>;
  const total = entries.reduce((a, [, v]) => a + v, 0);
  let r = Math.random() * total;
  for (const [k, v] of entries) {
    r -= v;
    if (r <= 0) return k;
  }
  return 'clear';
}

// 次の 3 日分の予報を生成。日単位で pickWeatherForSeason。
function generateForecast(w: WorldState): WeatherForecastEntry[] {
  const out: WeatherForecastEntry[] = [];
  for (let i = 0; i < 3; i++) {
    // 未来の日時から季節を推定（簡略：現在の季節をそのまま使う）
    const future = w.timeSec + i * CONFIG.SECONDS_PER_DAY;
    const season = seasonFromTime(future, w.secondsPerSeason);
    out.push({ dayOffset: i, kind: pickWeatherForSeason(season) });
  }
  return out;
}

// 日付が変わったら天気更新：予報を 1 日シフト、今日分を採用、新しい明後日を追加
function advanceWeather(w: WorldState) {
  // 予報を 1 日進める。今日分 (dayOffset 0) が新しい天気に採用される。
  w.weatherForecast = w.weatherForecast
    .filter((e) => e.dayOffset > 0)
    .map((e) => ({ ...e, dayOffset: e.dayOffset - 1 }));
  while (w.weatherForecast.length < 3) {
    const lastOffset = w.weatherForecast.length === 0 ? 0 : w.weatherForecast[w.weatherForecast.length - 1]!.dayOffset + 1;
    const future = w.timeSec + lastOffset * CONFIG.SECONDS_PER_DAY;
    const season = seasonFromTime(future, w.secondsPerSeason);
    w.weatherForecast.push({ dayOffset: lastOffset, kind: pickWeatherForSeason(season) });
  }
  const today = w.weatherForecast.find((e) => e.dayOffset === 0);
  if (today) {
    w.weather = { kind: today.kind, remainingSec: CONFIG.SECONDS_PER_DAY };
  }
}

// 難度に応じた補正テーブル。createWorld / ensurePlots / updateChibi /
// runHazards / scheduleEvents 等で参照する。
export interface DifficultyMods {
  hazardMul: number;       // HAZARDS の ratePerSec 乗算
  hungerMul: number;       // 空腹上昇速度乗算
  fatigueMul: number;      // 疲労上昇速度乗算
  obstacleCount: number;   // 初期障害物数
  eventIntervalMul: number; // 音頭/火事のインターバル乗算（大きいほど間が空く）
  initialResources: { food: number; water: number; wood: number; stone: number; plank: number; power: number; brick: number; wool: number; cloth: number; soil: number };
}
export const DIFFICULTY_MODS: Record<Difficulty, DifficultyMods> = {
  beginner: {
    hazardMul: 0.45,
    hungerMul: 0.75,
    fatigueMul: 0.75,
    obstacleCount: 50,
    eventIntervalMul: 1.5,
    initialResources: { food: 40, water: 0, wood: 30, stone: 20, plank: 5, power: 10, brick: 5, wool: 5, cloth: 3, soil: 80 },
  },
  standard: {
    hazardMul: 1.0,
    hungerMul: 1.0,
    fatigueMul: 1.0,
    obstacleCount: 90,
    eventIntervalMul: 1.0,
    initialResources: { food: 25, water: 0, wood: 20, stone: 15, plank: 4, power: 5, brick: 2, wool: 2, cloth: 1, soil: 40 },
  },
  hell: {
    hazardMul: 1.8,
    hungerMul: 1.4,
    fatigueMul: 1.3,
    obstacleCount: 140,
    eventIntervalMul: 0.55,
    initialResources: { food: 0, water: 0, wood: 5, stone: 5, plank: 0, power: 0, brick: 0, wool: 0, cloth: 0, soil: 0 },
  },
};
export function currentMods(w: WorldState): DifficultyMods {
  return DIFFICULTY_MODS[w.difficulty];
}

// ============================================================
// 建設優先指示（Σ-6-x）：プレイヤーが「ここを優先して建てて」と指定した feature の
// 有効期限を timestamp で管理。期限切れは自動で通常扱いに戻る。
// wanderStep env の priorityConstructionPositions に反映される。
// ============================================================
const constructionPriorityExpire = new Map<string, number>();  // featureId → epoch(ms)

/** featureId に優先指示を付ける（期限 durationSec 秒、デフォ 300=5分） */
export function setConstructionPriority(featureId: string, durationSec = 300): void {
  constructionPriorityExpire.set(featureId, Date.now() + durationSec * 1000);
}

/** 現在優先中の featureId セット（期限切れを自動削除） */
function getActivePriorityIds(): Set<string> {
  const now = Date.now();
  const active = new Set<string>();
  for (const [id, expire] of constructionPriorityExpire) {
    if (expire < now) constructionPriorityExpire.delete(id);
    else active.add(id);
  }
  return active;
}

/** 外部（main.ts UI）から優先状態を問い合わせるためのヘルパー */
export function isConstructionPriority(featureId: string): boolean {
  const expire = constructionPriorityExpire.get(featureId);
  if (expire == null) return false;
  if (expire < Date.now()) {
    constructionPriorityExpire.delete(featureId);
    return false;
  }
  return true;
}

// 接続距離：water/channel 同士はこの半径以内で繋がる
const WATER_LINK_RADIUS = 70;
// 畑が water/channel の効果を受ける最大距離
const FARM_IRRIGATION_RADIUS = 65;

// Σ-5-e-e: 建設に必要な pt（1 worker = 1 pt/sec、複数人ボーナスで加速）
export const CONSTRUCTION_PTS: Partial<Record<FeatureKind, number>> = {
  channel:    25,
  path:       25,
  streetlamp: 25,
  powerline:  25,
  water:      45,
  farm:       45,
  house:      80,
  well:       80,
  firewatch:  80,
  pasture:    80,
  sawmill:    120,
  shrine:     120,
  kiln:       120,
  loom:       120,
  generator:  120,
};

// 後方互換のエイリアス（stage3d.ts の外部コードが参照している場合に備え）
/** @deprecated CONSTRUCTION_PTS を使うこと */
export const CONSTRUCTION_SEC = CONSTRUCTION_PTS;

// 複数人ボーナス倍率 [worker 数 0-4+]
export const CONSTRUCTION_BONUS_MUL = [0, 1.0, 1.8, 2.5, 3.0];

const CONSTRUCTION_WORKER_RADIUS = 28;

// 水が届いている feature id 集合を flood fill で計算する。
// water を種にして、channel/water 同士が WATER_LINK_RADIUS 以内なら伝播。
// devLevel < 2 の水源/水路は未完成のため水を供給しない。
export function computeWateredFeatureIds(w: WorldState): Set<string> {
  const watered = new Set<string>();
  const queue: Feature[] = [];
  for (const f of w.features) {
    if (f.devLevel < 2) continue;
    if (f.kind === 'water' || f.kind === 'well') { watered.add(f.id); queue.push(f); }
  }
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const f of w.features) {
      if (watered.has(f.id)) continue;
      if (f.devLevel < 2) continue;
      if (f.kind !== 'channel' && f.kind !== 'water' && f.kind !== 'well') continue;
      if (Math.hypot(f.pos.x - cur.pos.x, f.pos.y - cur.pos.y) <= WATER_LINK_RADIUS) {
        watered.add(f.id);
        queue.push(f);
      }
    }
  }
  return watered;
}

// 食料生産 + 畑の成長。watered な水路/水源から FARM_IRRIGATION_RADIUS 内にある
// farm feature は 0.08/秒で食料生産、workSec 蓄積で devLevel が上がる。
// 近くに well（井戸）があれば drought でも最低 0.4 倍生産を維持。
// 製材所（sawmill）は近くのちびわふが wood→plank に変換する。
const SAWMILL_WORKER_RADIUS = 45;
const SAWMILL_PLANK_PER_SEC_PER_WORKER = 0.06;  // 1 worker で 17 秒に 1 plank
const SAWMILL_WOOD_COST_PER_PLANK = 2;          // 木 2 → 板 1

// 精錬所（kiln）：近くのちびわふが働くと stone→brick 変換。
const KILN_WORKER_RADIUS = 45;
const KILN_BRICK_PER_SEC_PER_WORKER = 0.04;  // 1 worker で 25 秒に 1 brick
const KILN_STONE_COST_PER_BRICK = 3;         // 石 3 → レンガ 1

// 牧場（pasture）：ちびわふ不要で wool を自動生産。雪/乾燥で半減。
const PASTURE_WOOL_PER_SEC = 0.03;           // 単独で 33 秒に 1 wool
// 織機（loom）：近くのちびわふが wool→cloth 変換。
const LOOM_WORKER_RADIUS = 45;
const LOOM_CLOTH_PER_SEC_PER_WORKER = 0.05; // 1 worker で 20 秒に 1 cloth
const LOOM_WOOL_COST_PER_CLOTH = 2;         // 羊毛 2 → 布 1

// 発電所（generator）：近くのちびわふがペダル漕ぎして power を生成。
// 街灯（streetlamp）：夜間に power を消費して半径を照らし、オオカミ威圧＋野宿 HP ドレイン半減。
// 電線（powerline）：発電所から街灯まで BFS で接続されていないと街灯は光らない（P2a）。
const GENERATOR_WORKER_RADIUS = 40;
const GENERATOR_POWER_PER_SEC_PER_WORKER = 0.3;
const GENERATOR_WORKER_FATIGUE_PER_SEC = 0.15;
const GENERATOR_MAX_WORKERS = 3;
const POWER_CAPACITY = 30;
export const STREETLAMP_RADIUS = 140;
const STREETLAMP_POWER_PER_SEC = 0.2;
export const POWERLINE_CONNECT_RADIUS = 90;  // generator/powerline/streetlamp 間の接続距離

// 発電所から電線経由で電力到達可能な街灯 id を BFS で算出。
// O((g+p+l)²) の辺生成は powerline が 50 以下想定で十分軽い。
export function computePoweredLampIds(w: WorldState): Set<string> {
  const powered = new Set<string>();
  const sources = w.features.filter((f) => f.kind === 'generator');
  if (sources.length === 0) return powered;
  const nodes = w.features.filter(
    (f) => f.kind === 'generator' || f.kind === 'powerline' || f.kind === 'streetlamp',
  );
  // 接続判定：頂点間距離 <= POWERLINE_CONNECT_RADIUS
  const R2 = POWERLINE_CONNECT_RADIUS * POWERLINE_CONNECT_RADIUS;
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      const dx = a.pos.x - b.pos.x;
      const dy = a.pos.y - b.pos.y;
      if (dx * dx + dy * dy <= R2) {
        adj.get(a.id)!.push(b.id);
        adj.get(b.id)!.push(a.id);
      }
    }
  }
  // BFS from all generators
  const visited = new Set<string>();
  const queue: string[] = [];
  for (const g of sources) { visited.add(g.id); queue.push(g.id); }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head]!;
    const n = byId.get(id);
    if (n?.kind === 'streetlamp') powered.add(id);
    for (const nb of adj.get(id) ?? []) {
      if (visited.has(nb)) continue;
      visited.add(nb);
      queue.push(nb);
    }
  }
  return powered;
}

export function updateInfra(w: WorldState, dt: number) {
  if (w.features.length === 0) return;
  const watered = computeWateredFeatureIds(w);
  const wateredFeatures = w.features.filter((f) => watered.has(f.id));
  const wells = w.features.filter((f) => f.kind === 'well');
  // 気象による生産倍率：乾燥/雪 → 停止、雨 → 加速
  const weatherMul = weatherFarmMul(w.weather.kind);
  for (const f of w.features) {
    if (f.kind !== 'farm') continue;
    if (f.devLevel < 2) continue; // 建設中は生産しない
    const featureIrrigated = wateredFeatures.some(
      (wf) => Math.hypot(wf.pos.x - f.pos.x, wf.pos.y - f.pos.y) <= FARM_IRRIGATION_RADIUS,
    );
    // Σ-7-c: 雨水/自然水でも潤う。farm 中心タイル + 8 近傍に waterLevel >=0.3 があれば irrigated
    let tileIrrigated = false;
    if (!featureIrrigated) {
      const { tx: ftx, ty: fty } = worldToTile(f.pos.x, f.pos.y);
      outer: for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = fty + dr, nc = ftx + dc;
          if (nr < 0 || nr >= TERRAIN_ROWS || nc < 0 || nc >= TERRAIN_COLS) continue;
          if (w.terrain[nr]![nc]!.waterLevel >= 0.3) { tileIrrigated = true; break outer; }
        }
      }
    }
    f.wateredByTile = !featureIrrigated && tileIrrigated;
    const irrigated = featureIrrigated || tileIrrigated;
    if (!irrigated) continue;
    // 井戸が近い farm は drought/snow でも 0.4 倍生産（耐災害ボーナス）
    let effectiveMul = weatherMul;
    if (effectiveMul < 0.4) {
      const nearWell = wells.some((wf) => Math.hypot(wf.pos.x - f.pos.x, wf.pos.y - f.pos.y) <= FARM_IRRIGATION_RADIUS);
      if (nearWell) effectiveMul = 0.4;
    }
    w.resources.food += dt * 0.08 * effectiveMul;
    f.workSec += dt;
    if (f.devLevel < 3 && f.workSec >= 30) f.devLevel = 3;
  }
  // 神社：たまに ✨ バブルを発生させて祝福感を演出（5秒に1回程度）
  for (const f of w.features) {
    if (f.kind !== 'shrine') continue;
    if (f.devLevel < 2) continue;
    if (Math.random() < dt / 5) {
      spawnBubble(w.bubbles, { x: f.pos.x + (Math.random() - 0.5) * 40, y: f.pos.y - 10 }, '✨', 'speech', 1.5);
    }
  }
  // 製材所：近くのちびわふが働くと wood→plank 変換。
  for (const f of w.features) {
    if (f.kind !== 'sawmill') continue;
    if (f.devLevel < 2) continue;
    // worker 数（alive, idle 以外の「移動可能」状態のみカウント）
    let workers = 0;
    for (const c of w.chibis) {
      if (!isAlive(c) || c.flight) continue;
      if (c.state === 'sleep' || c.state === 'dead') continue;
      if (Math.hypot(c.pos.x - f.pos.x, c.pos.y - f.pos.y) <= SAWMILL_WORKER_RADIUS) workers++;
    }
    if (workers === 0) continue;
    // 進捗を workSec に貯めて、1 plank 分溜まったら wood を消費して plank を生成
    const progress = dt * SAWMILL_PLANK_PER_SEC_PER_WORKER * Math.min(3, workers);
    f.workSec += progress;
    while (f.workSec >= 1 && w.resources.wood >= SAWMILL_WOOD_COST_PER_PLANK) {
      f.workSec -= 1;
      w.resources.wood -= SAWMILL_WOOD_COST_PER_PLANK;
      w.resources.plank += 1;
    }
    // wood 不足で止まっている場合は workSec が満タンで待機
    if (f.workSec > 1) f.workSec = 1;
  }
  // 精錬所（kiln）：近くのちびわふが働くと stone→brick 変換。製材所と同じ労働ループ。
  for (const f of w.features) {
    if (f.kind !== 'kiln') continue;
    if (f.devLevel < 2) continue;
    let workers = 0;
    for (const c of w.chibis) {
      if (!isAlive(c) || c.flight) continue;
      if (c.state === 'sleep' || c.state === 'dead') continue;
      if (Math.hypot(c.pos.x - f.pos.x, c.pos.y - f.pos.y) <= KILN_WORKER_RADIUS) workers++;
    }
    if (workers === 0) continue;
    const progress = dt * KILN_BRICK_PER_SEC_PER_WORKER * Math.min(3, workers);
    f.workSec += progress;
    while (f.workSec >= 1 && w.resources.stone >= KILN_STONE_COST_PER_BRICK) {
      f.workSec -= 1;
      w.resources.stone -= KILN_STONE_COST_PER_BRICK;
      w.resources.brick += 1;
    }
    if (f.workSec > 1) f.workSec = 1;
  }
  // 牧場：ちびわふ不要で wool を自動生産。雪/乾燥で半減。
  const pastureMul = (w.weather.kind === 'snow' || w.weather.kind === 'drought') ? 0.5 : 1.0;
  for (const f of w.features) {
    if (f.kind !== 'pasture') continue;
    if (f.devLevel < 2) continue;
    w.resources.wool += dt * PASTURE_WOOL_PER_SEC * pastureMul;
  }
  // 織機：近くのちびわふが wool→cloth 変換。
  for (const f of w.features) {
    if (f.kind !== 'loom') continue;
    if (f.devLevel < 2) continue;
    let workers = 0;
    for (const c of w.chibis) {
      if (!isAlive(c) || c.flight) continue;
      if (c.state === 'sleep' || c.state === 'dead') continue;
      if (Math.hypot(c.pos.x - f.pos.x, c.pos.y - f.pos.y) <= LOOM_WORKER_RADIUS) workers++;
    }
    if (workers === 0) continue;
    const progress = dt * LOOM_CLOTH_PER_SEC_PER_WORKER * Math.min(3, workers);
    f.workSec += progress;
    while (f.workSec >= 1 && w.resources.wool >= LOOM_WOOL_COST_PER_CLOTH) {
      f.workSec -= 1;
      w.resources.wool -= LOOM_WOOL_COST_PER_CLOTH;
      w.resources.cloth += 1;
    }
    if (f.workSec > 1) f.workSec = 1;
  }
  // 発電所：ワーカーがペダルを漕いで power を生成、ワーカーは追加疲労。
  for (const f of w.features) {
    if (f.kind !== 'generator') continue;
    if (f.devLevel < 2) continue;
    let workers = 0;
    for (const c of w.chibis) {
      if (!isAlive(c) || c.flight) continue;
      if (c.state === 'sleep' || c.state === 'dead') continue;
      if (Math.hypot(c.pos.x - f.pos.x, c.pos.y - f.pos.y) <= GENERATOR_WORKER_RADIUS) {
        if (workers < GENERATOR_MAX_WORKERS) {
          c.fatigue = Math.min(100, c.fatigue + dt * GENERATOR_WORKER_FATIGUE_PER_SEC);
        }
        workers++;
      }
    }
    if (workers === 0) { f.flow = 0; continue; }
    const active = Math.min(GENERATOR_MAX_WORKERS, workers);
    const gain = dt * GENERATOR_POWER_PER_SEC_PER_WORKER * active;
    w.resources.power = Math.min(POWER_CAPACITY, w.resources.power + gain);
    f.flow = active;  // 描画で歯車回転速度として利用
  }
  // 街灯：夜間のみ稼働、接続済み & power 消費で光る。飽和フラグで「光ってるかどうか」を保持。
  const lampActive = w.dayPhase === 'night' || w.dayPhase === 'evening';
  const poweredLamps = lampActive ? computePoweredLampIds(w) : null;
  for (const f of w.features) {
    if (f.kind !== 'streetlamp') continue;
    if (!lampActive || !poweredLamps || !poweredLamps.has(f.id)) { f.saturated = false; continue; }
    const need = dt * STREETLAMP_POWER_PER_SEC;
    if (w.resources.power >= need) {
      w.resources.power -= need;
      f.saturated = true;  // 光っている
    } else {
      f.saturated = false;  // 電力切れ
    }
  }
}

// ちびわふが稼働中の街灯半径内に居るか。オオカミターゲット回避・夜のHPドレイン半減に使う。
export function chibiUnderStreetlamp(w: WorldState, x: number, y: number): boolean {
  for (const f of w.features) {
    if (f.kind !== 'streetlamp') continue;
    if (!f.saturated) continue;
    if (Math.hypot(f.pos.x - x, f.pos.y - y) <= STREETLAMP_RADIUS) return true;
  }
  return false;
}

// 雷・感電（storm / 雨天中のみ発動）。
// - 感電死：稼働中の電線/街灯/発電所に半径内で触れていると確率死
// - 落雷：storm 中のみ、発電所がランダムに落雷直撃で爆発破壊 + 周囲の chibi にダメージ
const ELECTROCUTE_RADIUS_LAMP = 28;
const ELECTROCUTE_RADIUS_LINE = 22;
const ELECTROCUTE_RADIUS_GEN  = 35;
const THUNDER_BLAST_RADIUS = 80;
const THUNDER_BLAST_DAMAGE = 40;
function updateThunderstrike(w: WorldState, dt: number) {
  const wk = w.weather.kind;
  const isStorm = wk === 'storm';
  const isRainy = isStorm || wk === 'heavy_rain' || wk === 'light_rain';
  if (!isRainy) return;
  // 感電確率 (per sec)：storm 1.0 / heavy_rain 0.25 / light_rain 0.08 の基礎値
  const electroRate = isStorm ? 1.0 : wk === 'heavy_rain' ? 0.25 : 0.08;
  // 稼働中の街灯・電線（接続済みの両端で通電）・発電所（稼働=ワーカー>0）を「危険源」とする
  const poweredLamps = computePoweredLampIds(w);
  const liveLamps = w.features.filter((f) => f.kind === 'streetlamp' && f.saturated);
  // 電線：稼働中街灯に電気的に繋がっている電線を「通電中」とみなす（発電所起点 BFS 再利用）
  const liveLines = (() => {
    if (poweredLamps.size === 0) return [] as typeof w.features;
    // 発電所 BFS で辿れる電線を集める（computePoweredLampIds と同じアルゴを再実行、
    // ここでは powerline の id も拾う必要があるため inline）
    const gens = w.features.filter((f) => f.kind === 'generator');
    const nodes = w.features.filter(
      (f) => f.kind === 'generator' || f.kind === 'powerline' || f.kind === 'streetlamp',
    );
    const R2 = POWERLINE_CONNECT_RADIUS * POWERLINE_CONNECT_RADIUS;
    const adj = new Map<string, string[]>();
    for (const n of nodes) adj.set(n.id, []);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!, b = nodes[j]!;
        const dx = a.pos.x - b.pos.x, dy = a.pos.y - b.pos.y;
        if (dx * dx + dy * dy <= R2) {
          adj.get(a.id)!.push(b.id);
          adj.get(b.id)!.push(a.id);
        }
      }
    }
    const visited = new Set<string>();
    const queue: string[] = [];
    for (const g of gens) { visited.add(g.id); queue.push(g.id); }
    for (let h = 0; h < queue.length; h++) {
      for (const nb of adj.get(queue[h]!) ?? []) {
        if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
      }
    }
    return w.features.filter((f) => f.kind === 'powerline' && visited.has(f.id));
  })();
  const liveGens = w.features.filter((f) => f.kind === 'generator' && (f.flow ?? 0) > 0);
  // 各 chibi に最短危険源距離を判定し、感電ロール
  for (const c of w.chibis) {
    if (!isAlive(c) || c.flight) continue;
    let inZone = false;
    for (const f of liveLamps) {
      if (Math.hypot(f.pos.x - c.pos.x, f.pos.y - c.pos.y) <= ELECTROCUTE_RADIUS_LAMP) { inZone = true; break; }
    }
    if (!inZone) for (const f of liveLines) {
      if (Math.hypot(f.pos.x - c.pos.x, f.pos.y - c.pos.y) <= ELECTROCUTE_RADIUS_LINE) { inZone = true; break; }
    }
    if (!inZone) for (const f of liveGens) {
      if (Math.hypot(f.pos.x - c.pos.x, f.pos.y - c.pos.y) <= ELECTROCUTE_RADIUS_GEN) { inZone = true; break; }
    }
    if (!inZone) continue;
    const p = 1 - Math.exp(-electroRate * 0.04 * dt);  // 0.04 base = 「危険源に1秒いると storm 中 ~4% 死」
    if (Math.random() < p) {
      spawnBubble(w.bubbles, c.pos, '⚡', 'speech', 1.2);
      kill(w, c, 'electrocution');
    }
  }
  // 落雷：storm 中のみ発電所に直撃。平均 45 秒に 1 回。
  if (!isStorm) return;
  const gens = w.features.filter((f) => f.kind === 'generator');
  if (gens.length === 0) return;
  const strikeProb = 1 - Math.exp(-dt / 45);
  if (Math.random() < strikeProb) {
    const hit = gens[Math.floor(Math.random() * gens.length)]!;
    spawnBubble(w.bubbles, { x: hit.pos.x, y: hit.pos.y - 20 }, '⚡⚡', 'speech', 2.5);
    // 周囲の chibi にダメージ、死亡は thunder_blast
    for (const c of w.chibis) {
      if (!isAlive(c) || c.flight) continue;
      const d = Math.hypot(c.pos.x - hit.pos.x, c.pos.y - hit.pos.y);
      if (d > THUNDER_BLAST_RADIUS) continue;
      const falloff = 1 - d / THUNDER_BLAST_RADIUS;
      const dmg = THUNDER_BLAST_DAMAGE * falloff;
      damageChibi(w, c, dmg, 'thunder_blast');
    }
    // 発電所を破壊（features から削除）
    w.features = w.features.filter((f) => f.id !== hit.id);
    w.lastThunderStrikeAt = { x: hit.pos.x, y: hit.pos.y, tick: w.tick };
  }
}

// 天気による畑生産倍率：乾燥/雪 完全停止、雨 加速、熱波 半減
function weatherFarmMul(k: WeatherKind): number {
  switch (k) {
    case 'drought': return 0;
    case 'snow':    return 0;
    case 'heavy_rain':
    case 'storm':   return 1.4;
    case 'light_rain': return 1.2;
    case 'heatwave': return 0.5;
    default: return 1.0;
  }
}

// 天気による体力効果の倍率・ドレインを返す。updateChibi で使う。
function weatherChibiMods(k: WeatherKind): { hungerMul: number; fatigueMul: number; coldHpDrain: number } {
  switch (k) {
    case 'heatwave': return { hungerMul: 1.5, fatigueMul: 1.5, coldHpDrain: 0 };
    case 'snow':     return { hungerMul: 1.2, fatigueMul: 1.2, coldHpDrain: 0.2 };
    case 'storm':    return { hungerMul: 1.1, fatigueMul: 1.3, coldHpDrain: 0.1 };
    case 'heavy_rain':return { hungerMul: 1.0, fatigueMul: 1.2, coldHpDrain: 0.05 };
    case 'drought':  return { hungerMul: 1.3, fatigueMul: 1.1, coldHpDrain: 0 };
    default: return { hungerMul: 1.0, fatigueMul: 1.0, coldHpDrain: 0 };
  }
}
export { weatherChibiMods };

// ============================================================
// Ω-2 水理システム
// ============================================================

// 天気による水源湧出量倍率
function weatherWaterSourceMul(k: WeatherKind): number {
  switch (k) {
    case 'storm':      return 5.0;
    case 'heavy_rain': return 3.0;
    case 'light_rain': return 1.5;
    case 'drought':    return 0.15;
    case 'snow':       return 0.5;
    default:           return 1.0;
  }
}

// 水路チャンネル容量 = devLevel × 1.5 units/sec
const CHANNEL_CAPACITY_PER_LV = 1.5;

// 各水路/水源の flow・saturated を毎 tick 再計算する。
// 水源（kind='water'）が weatherMul × 1.0 の流量を生成し、
// BFS で接続先の水路に流量を伝播。容量超過 → saturated=true。
export function computeWaterFlow(w: WorldState): void {
  // リセット
  for (const f of w.features) {
    f.flow = 0;
    f.saturated = false;
  }
  if (w.features.length === 0) return;

  const weatherMul = weatherWaterSourceMul(w.weather.kind);

  // BFS：水源から接続水路へ流量を伝播。
  // well（井戸）は drought 耐性：weatherMul に関係なく 0.8 units/sec 維持。
  const visited = new Set<string>();
  const queue: Array<{ f: Feature; incoming: number }> = [];
  for (const f of w.features) {
    if (f.kind === 'water') {
      f.flow = weatherMul * 1.0;
      visited.add(f.id);
      queue.push({ f, incoming: f.flow });
    } else if (f.kind === 'well') {
      // 井戸は干魃に強い。最低 0.8、通常 1.0、雨天で少し増加。
      f.flow = Math.max(0.8, 0.8 + weatherMul * 0.3);
      visited.add(f.id);
      queue.push({ f, incoming: f.flow });
    }
  }

  // インデックスポインタで BFS（queue.shift() の O(n) コストを回避）
  let qi = 0;
  while (qi < queue.length) {
    const { f: cur } = queue[qi++];
    const curElev = getElevation(cur.pos.x, cur.pos.y);
    // 接続先（WATER_LINK_RADIUS 以内の未訪問 channel/water/well）。
    // 高低差ルール：下流（標高が 3 以上低い）にしか流れない。
    // 水平 or 微妙な上り（-3〜+3）は許容して詰まり防止。
    for (const nf of w.features) {
      if (visited.has(nf.id)) continue;
      if (nf.kind !== 'channel' && nf.kind !== 'water' && nf.kind !== 'well') continue;
      const dist = Math.hypot(nf.pos.x - cur.pos.x, nf.pos.y - cur.pos.y);
      if (dist > WATER_LINK_RADIUS) continue;
      const nfElev = getElevation(nf.pos.x, nf.pos.y);
      if (nfElev > curElev + 3) continue;  // 上り坂には流れない
      visited.add(nf.id);
      // 流量 = 上流から引き継ぎ（分岐は簡略化：全量伝播）
      nf.flow = (nf.flow ?? 0) + (cur.flow ?? 0);
      const capacity = (nf.devLevel || 1) * CHANNEL_CAPACITY_PER_LV;
      nf.saturated = (nf.flow ?? 0) > capacity;
      queue.push({ f: nf, incoming: nf.flow ?? 0 });
    }
  }
}

// 氾濫の最大半径 px
const FLOOD_MAX_RADIUS = 55;
// 氾濫が完全に消えるまでの秒数
const FLOOD_LIFE_SEC = 25;
// 同一水路から新規氾濫セルを追加するインターバル（秒）
const FLOOD_SPAWN_INTERVAL = 4;
// 氾濫に巻き込まれたちびわふを流す確率 / 秒
const FLOOD_SWEEP_CHANCE_PER_SEC = 0.28;

// 氾濫セルの生成・拡大・消滅と、ちびわふへの影響を処理する。
export function updateFloodZones(w: WorldState, dt: number): void {
  // 既存セルを更新
  for (const fz of w.floodZones) {
    fz.remainingSec -= dt;
    // 序盤は急拡大、後半は収束
    const lifeRatio = 1 - fz.remainingSec / FLOOD_LIFE_SEC;
    const targetRadius = FLOOD_MAX_RADIUS * Math.min(1, lifeRatio * 2.2);
    if (fz.radius < targetRadius) fz.radius = Math.min(targetRadius, fz.radius + 18 * dt);
  }
  // 期限切れ除去
  for (let i = w.floodZones.length - 1; i >= 0; i--) {
    if (w.floodZones[i]!.remainingSec <= 0) w.floodZones.splice(i, 1);
  }

  // 溢れている水路から新規氾濫セル生成
  for (const f of w.features) {
    if (!f.saturated) continue;
    // 同一水路の最新セルが FLOOD_SPAWN_INTERVAL 未満なら新規スポーン抑止
    // （Math.min で古い方を見ていたため毎tick spawn → 配列膨張で性能死のバグ修正）
    const nearby = w.floodZones.filter((fz) => fz.sourceFid === f.id);
    if (nearby.length > 0) {
      const youngest = Math.max(...nearby.map((fz) => fz.remainingSec));
      // 最新セルが「まだ 4s 経っていない」= remainingSec > 25-4=21 ならスキップ
      if (youngest > FLOOD_LIFE_SEC - FLOOD_SPAWN_INTERVAL) continue;
    }
    // 同一水路で同時に持てるセル上限（暴走防止のハードリミット）
    if (nearby.length >= 6) continue;
    // 水路の少し周囲にランダムオフセット
    const angle = Math.random() * Math.PI * 2;
    const off = 8 + Math.random() * 14;
    w.floodZones.push({
      x: f.pos.x + Math.cos(angle) * off,
      y: f.pos.y + Math.sin(angle) * off,
      radius: 6,
      remainingSec: FLOOD_LIFE_SEC,
      sourceFid: f.id,
    });
  }

  // ちびわふを洪水に巻き込む（ただし標高が洪水源より 15 以上高い子は安全）
  for (const c of w.chibis) {
    if (!isAlive(c) || c.flight) continue;
    const chibiElev = getElevation(c.pos.x, c.pos.y);
    for (const fz of w.floodZones) {
      const d = Math.hypot(c.pos.x - fz.x, c.pos.y - fz.y);
      if (d > fz.radius) continue;
      const floodElev = getElevation(fz.x, fz.y);
      if (chibiElev > floodElev + 15) continue;  // 高台は安全
      // 確率的に流す
      if (Math.random() > FLOOD_SWEEP_CHANCE_PER_SEC * dt) continue;
      // 中心から外側方向へ流す + 横流れ成分
      const angle = Math.atan2(c.pos.y - fz.y, c.pos.x - fz.x) + (Math.random() - 0.5) * 1.2;
      const speed = 180 + Math.random() * 120;
      launchFlight(c, Math.cos(angle) * speed, -80 + Math.random() * 40, 0.8, 20, 'flood_drown');
      spawnBubble(w.bubbles, c.pos, Math.random() < 0.5 ? 'たすけてー！' : 'ながされるー！', 'speech', 1.5);
      pushLife(c, Math.floor(c.ageSec), '洪水に流された');
      break;
    }
  }
}

// feature 近傍判定ヘルパ（他モジュール用）
export function isFarmFeature(f: Feature): boolean {
  return f.kind === 'farm';
}

// =========================================================================
// Σ-2 タイル式ハイトマップ
//
// 32px セルの 2D 配列を WorldState.terrain に保持。
// getElevation(x,y) は 4 近傍タイル間の bi-linear 補間を返す。
// Σ-1 の z 物理コードはシグネチャが同じなので無変更で動く。
//
// タイル座標 (col, row)：center = ((col+0.5)*32, (row+0.5)*32)
// 補間用分数タイル座標 tc = x/32-0.5, tr = y/32-0.5
// =========================================================================
export const TERRAIN_TILE_SIZE = 32;
export const TERRAIN_COLS = Math.ceil(CONFIG.WORLD_W / TERRAIN_TILE_SIZE);  // 100
export const TERRAIN_ROWS = Math.ceil(CONFIG.WORLD_H / TERRAIN_TILE_SIZE);  // 57

// モジュールレベルで保持するアクティブな地形参照。
// createWorld / ensurePlots で activateTerrain を呼んで更新する。
let _activeTerrain: TerrainTile[][] | null = null;

export function activateTerrain(terrain: TerrainTile[][]): void {
  _activeTerrain = terrain;
  setQueryTerrain(terrain);  // chibiwafu.ts など他モジュールも同期
}

// world.ts 内から呼ぶ isSeaAt は query.ts の実装を再エクスポート
export { isSeaAt };

// 既存の procedural 算出式（initTerrain の充填＆ v10 以前の load マイグレーション用）
export function proceduralElevation(x: number, y: number): number {
  const dryLimit = CONFIG.DRY_Y_LIMIT;
  const southness = Math.max(0, Math.min(1, y / dryLimit));
  let base = 70 - southness * 55;
  if (y > dryLimit - 150) base = Math.max(0, base - 20);
  if (y > dryLimit) base = 0;
  if (x < 600) base += (600 - x) / 600 * 15;
  const noise = Math.sin(x * 0.003) * 2 + Math.cos(y * 0.004 + x * 0.002) * 2;
  return Math.max(0, Math.min(100, base + noise));
}

// elev から材質を決定（初期充填で使う）
function elevToMaterial(elev: number, isRiver: boolean): TerrainMaterial {
  if (isRiver) return 'water';
  if (elev > 60) return 'rock';
  if (elev > 25) return 'grass';
  if (elev > 10) return 'soil';
  return 'sand';
}

// タイルを初期化する。
// difficulty + seed が渡された場合は Σ-3 ジェネレータを使用。
// 引数なし（fallback）は proceduralElevation で旧来動作（v11 以前セーブ互換）。
export function initTerrain(
  bounds: { w: number; h: number },
  difficulty?: Difficulty,
  seed?: number,
): TerrainTile[][] {
  if (difficulty !== undefined && seed !== undefined) {
    return generateTerrain(difficulty, seed, bounds);
  }
  // fallback: v11 以前 procedural
  const grid: TerrainTile[][] = [];
  for (let row = 0; row < TERRAIN_ROWS; row++) {
    const rowArr: TerrainTile[] = [];
    for (let col = 0; col < TERRAIN_COLS; col++) {
      const cx = (col + 0.5) * TERRAIN_TILE_SIZE;
      const cy = (row + 0.5) * TERRAIN_TILE_SIZE;
      const elev = proceduralElevation(cx, cy);
      const isRiver = cy > CONFIG.DRY_Y_LIMIT;
      rowArr.push({
        elev,
        material: elevToMaterial(elev, isRiver),
        stability: 1.0,
        waterLevel: isRiver ? 1.0 : 0,
        buryTimer: 0,
      });
    }
    grid.push(rowArr);
  }
  void bounds;
  return grid;
}

// bi-linear 補間で任意点の標高を返す。Σ-1 z 物理と既存コード全域から呼ばれる。
export function getElevation(x: number, y: number): number {
  const terrain = _activeTerrain;
  if (!terrain) return proceduralElevation(x, y);

  const tc = x / TERRAIN_TILE_SIZE - 0.5;
  const tr = y / TERRAIN_TILE_SIZE - 0.5;
  const c0 = Math.floor(tc);
  const r0 = Math.floor(tr);
  const tx = tc - c0;
  const ty = tr - r0;
  const maxC = TERRAIN_COLS - 1;
  const maxR = TERRAIN_ROWS - 1;

  const e00 = terrain[Math.max(0, Math.min(maxR, r0))]?.[Math.max(0, Math.min(maxC, c0))]?.elev ?? 0;
  const e10 = terrain[Math.max(0, Math.min(maxR, r0))]?.[Math.max(0, Math.min(maxC, c0 + 1))]?.elev ?? 0;
  const e01 = terrain[Math.max(0, Math.min(maxR, r0 + 1))]?.[Math.max(0, Math.min(maxC, c0))]?.elev ?? 0;
  const e11 = terrain[Math.max(0, Math.min(maxR, r0 + 1))]?.[Math.max(0, Math.min(maxC, c0 + 1))]?.elev ?? 0;

  return e00 * (1 - tx) * (1 - ty)
       + e10 * tx * (1 - ty)
       + e01 * (1 - tx) * ty
       + e11 * tx * ty;
}

// タイル座標からインデックスを安全に返す。範囲外は null。
function getTile(terrain: TerrainTile[][], tx: number, ty: number): TerrainTile | null {
  return terrain[ty]?.[tx] ?? null;
}

// =========================================================================
// Σ-2-b 地形編集 API
// =========================================================================

// 世界座標 (x,y) → タイルインデックス (col, row)
export function worldToTile(x: number, y: number): { tx: number; ty: number } {
  return {
    tx: Math.floor(x / TERRAIN_TILE_SIZE),
    ty: Math.floor(y / TERRAIN_TILE_SIZE),
  };
}

const RAISE_COST_SOIL = 10;
const RAISE_ELEV_AMOUNT = 5;
export const LOWER_SOIL_GAIN = 18;
export const LOWER_STONE_GAIN = 7;  // rock タイルから

// 盛り土ジョブをキューに追加。soil 消費は即時（ジョブ登録時点で予約）。
// Σ-6-x: terraform ジョブ優先指示（Map で transient に管理、5 分で expire）。
// プレイヤーがクリックで置いたジョブは自動的に優先扱い → ちびわふが集まる。
const terraformPriorityExpire = new Map<string, number>();

function markTerraformPriority(jobId: string, durationSec = 300): void {
  terraformPriorityExpire.set(jobId, Date.now() + durationSec * 1000);
}

function getActiveTerraformPriorityIds(): Set<string> {
  const now = Date.now();
  const active = new Set<string>();
  for (const [id, expire] of terraformPriorityExpire) {
    if (expire < now) terraformPriorityExpire.delete(id);
    else active.add(id);
  }
  return active;
}

export function enqueueTerraformRaise(w: WorldState, tx: number, ty: number): boolean {
  if (tx < 0 || tx >= TERRAIN_COLS || ty < 0 || ty >= TERRAIN_ROWS) return false;
  if (w.resources.soil < RAISE_COST_SOIL) return false;
  // 同タイルへの重複ジョブは上書き（既存 raise なら先払い分を refund してから再消費）
  const existing = w.terraformJobs.findIndex((j) => j.tx === tx && j.ty === ty);
  if (existing >= 0) {
    if (w.terraformJobs[existing]!.target === 'raise') {
      w.resources.soil += RAISE_COST_SOIL;
    }
    terraformPriorityExpire.delete(w.terraformJobs[existing]!.id);
    w.terraformJobs.splice(existing, 1);
  }
  w.resources.soil -= RAISE_COST_SOIL;
  const jobId = `tj-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  w.terraformJobs.push({ id: jobId, tx, ty, target: 'raise', progress: 0 });
  markTerraformPriority(jobId, 300);  // 新規登録時は 5 分間優先
  return true;
}

export function enqueueTerraformLower(w: WorldState, tx: number, ty: number): boolean {
  if (tx < 0 || tx >= TERRAIN_COLS || ty < 0 || ty >= TERRAIN_ROWS) return false;
  const existing = w.terraformJobs.findIndex((j) => j.tx === tx && j.ty === ty);
  if (existing >= 0) {
    terraformPriorityExpire.delete(w.terraformJobs[existing]!.id);
    w.terraformJobs.splice(existing, 1);
  }
  const jobId = `tj-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  w.terraformJobs.push({ id: jobId, tx, ty, target: 'lower', progress: 0 });
  markTerraformPriority(jobId, 300);  // 新規登録時は 5 分間優先
  return true;
}

// タイルの elev を変更し stability を減衰
export function raiseTile(terrain: TerrainTile[][], tx: number, ty: number, amount: number): void {
  const tile = getTile(terrain, tx, ty);
  if (!tile) return;
  tile.elev = Math.min(100, tile.elev + amount);
  tile.stability = Math.min(tile.stability, 0.6);
  tile.material = elevToMaterial(tile.elev, tile.waterLevel >= 0.5);
}

export function lowerTile(terrain: TerrainTile[][], tx: number, ty: number, amount: number): void {
  const tile = getTile(terrain, tx, ty);
  if (!tile) return;
  tile.elev = Math.max(0, tile.elev - amount);
  tile.stability = Math.min(tile.stability, 0.75);
  tile.material = elevToMaterial(tile.elev, tile.waterLevel >= 0.5);
}

// ちびわふ労働：ジョブ近傍 28px 以内の生存ちびわふが進捗を進める
const TERRAFORM_WORKER_RADIUS = 28;
const TERRAFORM_PROGRESS_PER_WORKER_SEC = 0.05;  // 1 worker で 20 秒完了

// Σ-5-e-e: 建設進行を数値 pt ベースに変更。
//   1 人 = 1.0 pt/sec、2 人 = 1.8x、3 人 = 2.5x、4+ 人 = 3.0x
//   喧嘩・事故で pt が戻る演出は applyConstruction*Penalty() を参照。
export function updateConstructions(w: WorldState, dt: number): void {
  const diffMul = w.difficulty === 'beginner' ? 0.7 : w.difficulty === 'hell' ? 1.3 : 1.0;
  for (const f of w.features) {
    if (f.devLevel >= 2) continue;
    const needed = (CONSTRUCTION_PTS[f.kind] ?? 45) * diffMul;
    let workers = 0;
    const workerList: Chibiwafu[] = [];
    for (const c of w.chibis) {
      if (!isAlive(c) || c.flight || c.state === 'sleep' || c.state === 'dead') continue;
      if (Math.hypot(c.pos.x - f.pos.x, c.pos.y - f.pos.y) <= CONSTRUCTION_WORKER_RADIUS) {
        workers++;
        workerList.push(c);
      }
    }
    if (workers > 0) {
      const mul = CONSTRUCTION_BONUS_MUL[Math.min(4, workers)] ?? 3.0;
      f.workSec += dt * mul;
      // ランダムサボり：ワーカー一人あたり ~40 秒に 1 回の頻度でぼやく
      for (const c of workerList) {
        if (Math.random() < dt / 40) {
          spawnBubble(w.bubbles, c.pos, pickConstructionSabotageLine(), 'speech', 1.8);
        }
      }
    }
    // 離脱ペナルティ：focus<35 のちびわふが建設サイト付近（28-80px）に漂っている時、
    // 低確率で進捗を少し削る（注意散漫で邪魔をする演出）
    for (const c of w.chibis) {
      if (!isAlive(c) || c.flight || c.state === 'sleep' || c.state === 'dead') continue;
      if (c.params.focus >= 35) continue;
      const d = Math.hypot(c.pos.x - f.pos.x, c.pos.y - f.pos.y);
      if (d <= CONSTRUCTION_WORKER_RADIUS || d > 80) continue;
      if (Math.random() < dt / 80) {
        f.workSec = Math.max(0, f.workSec - 2);
        if (Math.random() < 0.3) {
          spawnBubble(w.bubbles, c.pos, pickConstructionAbandonLine(), 'speech', 1.8);
        }
      }
    }
    if (f.devLevel < 1 && f.workSec >= needed * 0.5) f.devLevel = 1;
    if (f.devLevel < 2 && f.workSec >= needed) {
      f.devLevel = 2;
      f.workSec = 0;
      // 最寄りのワーカーから完成バブル
      let bestWorker: Chibiwafu | null = null;
      let bestD = Infinity;
      for (const c of w.chibis) {
        if (!isAlive(c) || c.flight) continue;
        const d = Math.hypot(c.pos.x - f.pos.x, c.pos.y - f.pos.y);
        if (d <= CONSTRUCTION_WORKER_RADIUS + 10 && d < bestD) { bestWorker = c; bestD = d; }
      }
      const pos = bestWorker ? bestWorker.pos : f.pos;
      spawnBubble(w.bubbles, pos, pickConstructionDoneLine(), 'speech', 2.0);
      w.newConstructions.push({ id: f.id, kind: f.kind });
    }
  }
}

// 建設現場の死亡ペナルティ：死んだちびわふの近く（40px）の未完成 feature の workSec を -15。
// kill() から呼ぶ。
function applyConstructionDeathPenalty(w: WorldState, c: Chibiwafu): void {
  for (const f of w.features) {
    if (f.devLevel >= 2) continue;
    if (Math.hypot(c.pos.x - f.pos.x, c.pos.y - f.pos.y) > 40) continue;
    f.workSec = Math.max(0, f.workSec - 15);
    // 最寄りのワーカーから死亡反応バブル
    let bestWorker: Chibiwafu | null = null;
    let bestD = Infinity;
    for (const wk of w.chibis) {
      if (!isAlive(wk) || wk === c) continue;
      const d = Math.hypot(wk.pos.x - f.pos.x, wk.pos.y - f.pos.y);
      if (d <= CONSTRUCTION_WORKER_RADIUS && d < bestD) { bestWorker = wk; bestD = d; }
    }
    if (bestWorker) {
      spawnBubble(w.bubbles, bestWorker.pos, pickConstructionDeathReactionLine(c.name), 'speech', 2.5);
    }
    // 近くにいる NPC（フラナ/スズ/ルー）も反応（80px 内、1体ランダム）
    const nearNpcs = w.npcs.filter(
      (n) => !n.dead && Math.hypot(n.pos.x - f.pos.x, n.pos.y - f.pos.y) <= 80,
    );
    if (nearNpcs.length > 0 && Math.random() < 0.5) {
      const n = nearNpcs[Math.floor(Math.random() * nearNpcs.length)]!;
      if (n.id === 'furana') spawnBubble(w.bubbles, n.pos, pickFuranaConstructionAccidentLine(), 'npc-speech', 2.0);
      else if (n.id === 'suzu') spawnBubble(w.bubbles, n.pos, pickSuzuConstructionAccidentLine(c.name), 'npc-speech', 2.0);
      else if (n.id === 'lou') spawnBubble(w.bubbles, n.pos, pickLuConstructionAccidentLine(), 'npc-speech', 2.0);
    }
  }
}

// 建設現場の喧嘩ペナルティ：戦闘発生座標（40px）の未完成 feature の workSec を -5。
// updateCocoonAbuse など喧嘩イベントから呼ぶ。
function applyConstructionFightPenalty(w: WorldState, fightPos: Vec2): void {
  for (const f of w.features) {
    if (f.devLevel >= 2) continue;
    if (Math.hypot(fightPos.x - f.pos.x, fightPos.y - f.pos.y) > 40) continue;
    f.workSec = Math.max(0, f.workSec - 5);
    // ワーカーが喧嘩セリフを吐く
    let bestWorker: Chibiwafu | null = null;
    let bestD = Infinity;
    for (const c of w.chibis) {
      if (!isAlive(c) || c.flight) continue;
      const d = Math.hypot(c.pos.x - f.pos.x, c.pos.y - f.pos.y);
      if (d <= CONSTRUCTION_WORKER_RADIUS && d < bestD) { bestWorker = c; bestD = d; }
    }
    if (bestWorker) {
      spawnBubble(w.bubbles, bestWorker.pos, pickConstructionFightLine(), 'speech', 1.8);
    }
  }
}

export function updateTerraformJobs(w: WorldState, dt: number): void {
  if (w.terraformJobs.length === 0) return;
  for (let i = w.terraformJobs.length - 1; i >= 0; i--) {
    const job = w.terraformJobs[i]!;
    const cx = (job.tx + 0.5) * TERRAIN_TILE_SIZE;
    const cy = (job.ty + 0.5) * TERRAIN_TILE_SIZE;
    let workers = 0;
    for (const c of w.chibis) {
      if (!isAlive(c) || c.flight || c.state === 'sleep' || c.state === 'dead') continue;
      if (Math.hypot(c.pos.x - cx, c.pos.y - cy) <= TERRAFORM_WORKER_RADIUS) workers++;
    }
    if (workers > 0) {
      job.progress += dt * TERRAFORM_PROGRESS_PER_WORKER_SEC * Math.min(4, workers);
    }
    if (job.progress >= 1.0) {
      if (job.target === 'raise') {
        raiseTile(w.terrain, job.tx, job.ty, RAISE_ELEV_AMOUNT);
      } else {
        const tile = getTile(w.terrain, job.tx, job.ty);
        if (tile) {
          w.resources.soil += LOWER_SOIL_GAIN;
          if (tile.material === 'rock') w.resources.stone += LOWER_STONE_GAIN;
        }
        lowerTile(w.terrain, job.tx, job.ty, RAISE_ELEV_AMOUNT);
      }
      w.terraformJobs.splice(i, 1);
    }
  }
}

// =========================================================================
// Σ-2-c 土砂崩れ災害
// stability が低く隣接との標高差が大きいタイルが確率的に崩落する。
// 崩落 = 高タイル elev -10 / 低タイル elev +8 / 範囲ちびわふにダメージ。
// =========================================================================

const LANDSLIDE_STABILITY_THRESHOLD = 0.4;
const LANDSLIDE_ELEV_DIFF_MIN = 20;      // 崩落が起きる最低高低差
const LANDSLIDE_INSTANT_KILL_DIFF = 30;  // この差以上なら即死級
const LANDSLIDE_RATE_PER_SEC = 0.005;    // 不安定タイル 1 個あたりの崩落確率/sec
const LANDSLIDE_DAMAGE_RADIUS_PX = 48;
const LANDSLIDE_HP_DAMAGE = 40;
const LANDSLIDE_BURY_DURATION_SEC = 5;
const STABILITY_RECOVER_PER_SEC = 0.02;

export function updateTerrainStability(w: WorldState, dt: number): void {
  const terrain = w.terrain;
  if (!terrain || terrain.length === 0) return;

  // storm 時は stability 回復なし、heatwave は 1.5 倍速
  const recoverMul = w.weather.kind === 'storm' ? 0 : w.weather.kind === 'heatwave' ? 1.5 : 1.0;

  for (let row = 0; row < TERRAIN_ROWS; row++) {
    for (let col = 0; col < TERRAIN_COLS; col++) {
      const tile = terrain[row]![col]!;

      // buryTimer カウントダウン（transient）
      if (tile.buryTimer > 0) tile.buryTimer = Math.max(0, tile.buryTimer - dt);

      // stability 回復
      if (tile.stability < 1.0 && recoverMul > 0) {
        tile.stability = Math.min(1.0, tile.stability + STABILITY_RECOVER_PER_SEC * recoverMul * dt);
      }

      // 崩落判定：stability < 閾値 かつ 隣接との差が大きい
      if (tile.stability >= LANDSLIDE_STABILITY_THRESHOLD) continue;
      if (Math.random() > LANDSLIDE_RATE_PER_SEC * dt) continue;

      // 4 方向隣接で最も低いタイルを探す
      const dirs = [[-1,0],[1,0],[0,-1],[0,1]] as const;
      let lowest: TerrainTile | null = null;
      let lowestDiff = 0;
      let lowestDc = 0;
      let lowestDr = 0;
      for (const [dc, dr] of dirs) {
        const nb = getTile(terrain, col + dc, row + dr);
        if (!nb) continue;
        const diff = tile.elev - nb.elev;
        if (diff >= LANDSLIDE_ELEV_DIFF_MIN && diff > lowestDiff) {
          lowest = nb;
          lowestDiff = diff;
          lowestDc = dc;
          lowestDr = dr;
        }
      }
      if (!lowest) continue;

      // 崩落実行
      tile.elev = Math.max(0, tile.elev - 10);
      tile.stability = 0.3;
      lowest.elev = Math.min(100, lowest.elev + 8);
      lowest.stability = Math.min(lowest.stability, 0.5);
      tile.material = elevToMaterial(tile.elev, tile.waterLevel >= 0.5);
      lowest.material = elevToMaterial(lowest.elev, lowest.waterLevel >= 0.5);

      // 低タイルに buryTimer をセット（生き埋め判定用）
      const buriedTile = getTile(terrain, col + lowestDc, row + lowestDr);
      if (buriedTile) buriedTile.buryTimer = LANDSLIDE_BURY_DURATION_SEC;

      // 崩落エリアのちびわふにダメージ
      const epicX = (col + 0.5) * TERRAIN_TILE_SIZE;
      const epicY = (row + 0.5) * TERRAIN_TILE_SIZE;
      for (const c of w.chibis) {
        if (!isAlive(c) || c.flight) continue;
        if (Math.hypot(c.pos.x - epicX, c.pos.y - epicY) > LANDSLIDE_DAMAGE_RADIUS_PX) continue;
        if (lowestDiff >= LANDSLIDE_INSTANT_KILL_DIFF) {
          spawnBubble(w.bubbles, c.pos, 'つぶされるわふっ！！', 'speech', 1.8);
          pushLife(c, Math.floor(c.ageSec), '土砂崩れで押し潰された');
          kill(w, c, 'landslide_crush');
        } else {
          const died = damageChibi(w, c, LANDSLIDE_HP_DAMAGE, 'landslide_crush');
          if (!died) {
            spawnBubble(w.bubbles, c.pos, 'どどどわふっ！', 'speech', 1.5);
            setState(c, 'hurt', 1.5);
            pushLife(c, Math.floor(c.ageSec), `土砂崩れに巻き込まれた（HP-${LANDSLIDE_HP_DAMAGE}）`);
          }
        }
      }
      spawnBubble(w.bubbles, { x: epicX, y: epicY }, '⛰ドドドッ', 'speech', 2.0);
    }
  }

  // buried_alive 判定：buryTimer > 0 のタイル上にいるちびわふ
  for (const c of w.chibis) {
    if (!isAlive(c) || c.flight) continue;
    const { tx, ty } = worldToTile(c.pos.x, c.pos.y);
    const tile = getTile(terrain, tx, ty);
    if (!tile || tile.buryTimer <= 0) continue;
    if (Math.random() > dt * 0.15) continue;
    spawnBubble(w.bubbles, c.pos, 'むぐ…わふ……', 'speech', 1.8);
    pushLife(c, Math.floor(c.ageSec), '土砂に埋まって窒息した');
    kill(w, c, 'buried_alive');
  }
}

// =========================================================================
// Σ-7 タイル水動力（hydrology）
//
// TerrainTile.waterLevel (0-1) を雨/蒸発/吸収/downhill flow で動的更新する。
// 雨で低地に水たまりが溜まり、水源 feature が湧水を供給し、水路 feature が
// 流速を倍にする。海タイル（isSeaAt）は常に 1.0 固定。
// 重い処理（蒸発・吸収・flow）は 0.25s 毎にまとめて実行。
// =========================================================================

// 降雨強度（/sec）— 雨の種類で雨水蓄積速度が変わる。
// storm は嵐相当でやや過剰、低地に水たまりが急速に発達する。
function rainIntensity(k: WeatherKind): number {
  switch (k) {
    case 'storm':      return 0.025;
    case 'heavy_rain': return 0.012;
    case 'light_rain': return 0.005;
    default:           return 0;
  }
}

// 蒸発速度（/sec）— 晴天/heatwave で速く、雨天では蒸発しない
// 数値は体感優先：clear で 0.5 wl が約 3 分、heatwave で約 1.5 分かけて減る
function evapRate(k: WeatherKind): number {
  switch (k) {
    case 'heatwave': return 0.005;
    case 'clear':    return 0.0025;
    case 'cloudy':   return 0.0012;
    case 'fog':      return 0.0005;
    case 'snow':     return 0.0003;
    default:         return 0;  // 雨天時は蒸発しない
  }
}

// 材質×標高別の吸収速度（/sec）— sand は早抜け、rock はほぼ溜まる
function absorpRate(material: TerrainMaterial, elev: number): number {
  if (material === 'sand') return 0.010;
  if (material === 'rock') return 0.0005;
  if (material === 'water') return 0;  // 水路タイル → 漏出なし
  // soil / grass：標高で軽く変化
  if (elev > 60) return 0.001;
  if (elev > 40) return 0.003;
  return 0.004;
}

// downhill flow 用の delta バッファ（毎回 alloc しない）
let _hydroDelta: Float32Array | null = null;
// 水源 feature 位置キャッシュ（tick 毎に張り直し、updateHydrology 内で使い回す）
let _waterFeatTilesCache: { tick: number; tiles: Array<{ tx: number; ty: number }> } | null = null;
// channel feature の cell index set（同上）
let _channelTilesCache: { tick: number; set: Set<number> } | null = null;

export function updateHydrology(w: WorldState, dt: number): void {
  const terrain = w.terrain;
  if (!terrain || terrain.length === 0) return;
  const ROWS = terrain.length;
  const COLS = terrain[0]!.length;

  // --- 海/水路タイルは常時 1.0 固定（毎 tick 確認だけ）---
  for (let r = 0; r < ROWS; r++) {
    const row = terrain[r]!;
    for (let c = 0; c < COLS; c++) {
      const tile = row[c]!;
      const cx = (c + 0.5) * TERRAIN_TILE_SIZE;
      const cy = (r + 0.5) * TERRAIN_TILE_SIZE;
      if (isSeaAt(cx, cy)) tile.waterLevel = 1.0;
    }
  }

  // --- 降雨（毎 tick 積算）---
  const rain = rainIntensity(w.weather.kind);
  if (rain > 0) {
    const add = rain * dt;
    for (let r = 0; r < ROWS; r++) {
      const row = terrain[r]!;
      for (let c = 0; c < COLS; c++) {
        const tile = row[c]!;
        if (tile.material === 'rock' && tile.elev > 80) continue; // 岩肌は浸透せず流れる扱い
        tile.waterLevel = Math.min(1.0, tile.waterLevel + add);
      }
    }
  }

  // --- 水源 feature が周囲タイルに継続供給（毎 tick）---
  if (!_waterFeatTilesCache || _waterFeatTilesCache.tick !== w.tick) {
    const tiles: Array<{ tx: number; ty: number }> = [];
    for (const f of w.features) {
      if (f.kind === 'water' && f.devLevel >= 2) {
        tiles.push(worldToTile(f.pos.x, f.pos.y));
      }
    }
    _waterFeatTilesCache = { tick: w.tick, tiles };
  }
  const supplyAdd = 0.05 * dt;
  for (const { tx, ty } of _waterFeatTilesCache.tiles) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = ty + dr, nc = tx + dc;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        const tile = terrain[nr]![nc]!;
        tile.waterLevel = Math.min(1.0, tile.waterLevel + supplyAdd);
      }
    }
  }

  // --- 0.25s 毎の重い処理（蒸発/吸収/downhill flow/mud 化）---
  w.hydroTimer -= dt;
  if (w.hydroTimer > 0) return;
  w.hydroTimer = 0.25;
  const flowDt = 0.25;

  // channel タイル set 更新（流速 ×2 ブースト）
  if (!_channelTilesCache || _channelTilesCache.tick !== w.tick) {
    const set = new Set<number>();
    for (const f of w.features) {
      if (f.kind === 'channel' && f.devLevel >= 2) {
        const { tx, ty } = worldToTile(f.pos.x, f.pos.y);
        if (ty >= 0 && ty < ROWS && tx >= 0 && tx < COLS) {
          set.add(ty * COLS + tx);
        }
      }
    }
    _channelTilesCache = { tick: w.tick, set };
  }
  const channelSet = _channelTilesCache.set;

  // delta バッファ確保
  const N = ROWS * COLS;
  if (!_hydroDelta || _hydroDelta.length !== N) {
    _hydroDelta = new Float32Array(N);
  }
  _hydroDelta.fill(0);

  const eRate = evapRate(w.weather.kind);
  const DIRS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  for (let r = 0; r < ROWS; r++) {
    const row = terrain[r]!;
    for (let c = 0; c < COLS; c++) {
      const tile = row[c]!;
      const cx = (c + 0.5) * TERRAIN_TILE_SIZE;
      const cy = (r + 0.5) * TERRAIN_TILE_SIZE;
      if (isSeaAt(cx, cy)) continue;  // 海は処理スキップ（1.0 固定）

      const wl = tile.waterLevel;
      const idx = r * COLS + c;

      // 蒸発（水源近傍は半減）
      let eThis = eRate;
      if (eThis > 0 && _waterFeatTilesCache!.tiles.length > 0) {
        for (const wp of _waterFeatTilesCache!.tiles) {
          if (Math.abs(wp.tx - c) <= 1 && Math.abs(wp.ty - r) <= 1) { eThis *= 0.5; break; }
        }
      }
      // 吸収
      const aThis = absorpRate(tile.material, tile.elev);
      const loss = (eThis + aThis) * flowDt;
      if (loss > 0) _hydroDelta[idx] -= Math.min(wl, loss);

      if (wl < 0.01) continue;

      // downhill flow：水面高さ (elev + wl×5) が隣より高ければ流す
      // 全体の outflow を wl の 30% に制限（タイル丸ごと流れて水たまりが消える事を防ぐ）
      const myLevel = tile.elev + wl * 5;
      const flowBoost = channelSet.has(idx) ? 2.0 : 1.0;
      const maxOutflow = wl * 0.30;
      let outAcc = 0;

      for (const [dc, dr] of DIRS) {
        const nc = c + dc, nr = r + dr;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        const nIdx = nr * COLS + nc;
        const ntile = terrain[nr]![nc]!;
        const nLevel = ntile.elev + ntile.waterLevel * 5;
        if (nLevel >= myLevel) continue;

        const diff = myLevel - nLevel;
        let transfer = diff * 0.06 * flowBoost * flowDt;
        if (outAcc + transfer > maxOutflow) transfer = Math.max(0, maxOutflow - outAcc);
        if (transfer > 0.0005) {
          _hydroDelta[idx] -= transfer;
          _hydroDelta[nIdx] += transfer;
          outAcc += transfer;
        }
      }
    }
  }

  // delta 適用 + mud 化判定
  for (let r = 0; r < ROWS; r++) {
    const row = terrain[r]!;
    for (let c = 0; c < COLS; c++) {
      const tile = row[c]!;
      const cx = (c + 0.5) * TERRAIN_TILE_SIZE;
      const cy = (r + 0.5) * TERRAIN_TILE_SIZE;
      if (isSeaAt(cx, cy)) continue;
      const idx = r * COLS + c;
      tile.waterLevel = Math.max(0, Math.min(1.0, tile.waterLevel + _hydroDelta[idx]!));

      // material 遷移：waterLevel 高い soil/sand → 'water' 判定にしない（描画で泥色に）。
      // ここでは TerrainMaterial を切り替えず、render 側で waterLevel ベースで色付ける。
      // 例外：waterLevel が 0.85+ で 'sand' は 'soil' に降格（湿った砂は泥）。
      if (tile.waterLevel > 0.85 && tile.material === 'sand') tile.material = 'soil';
    }
  }
}

// =========================================================================
// オオカミ襲撃（Ω-5）
// 夜間のみ出現。map 端から湧き、野宿ちびわふを優先的に狩る。
// 朝になると撤退。プレイヤーは左クリックで殴って追い払える。
// =========================================================================

const WOLF_MAX_HP = 30;
const WOLF_SPEED = 75;  // Σ-6-x：55 → 75（ちびわふ最速 28 に対して 2.7 倍、より狩猟本能を強調）
const WOLF_BITE_RANGE = 22;
const WOLF_BITE_DAMAGE = 28;  // HP 20 の弱い子は一撃、HP 40+ の丈夫は2発必要
const WOLF_SPAWN_INTERVAL_NIGHT_BASE = 75;  // 夜の平均スポーン間隔（秒）
const WOLF_GROUP_SIZE_MIN = 1;
const WOLF_GROUP_SIZE_MAX = 2;
const WOLF_MAX_ALIVE = 6;  // 同時存在数のハードリミット（性能安全網）

let _wolfIdSeq = 1;
export function resetWolfIdSeq(n: number) { _wolfIdSeq = n; }

function spawnWolfGroup(w: WorldState) {
  if (w.wolves.length >= WOLF_MAX_ALIVE) return;
  const mods = currentMods(w);
  // 地獄 ×1.8 で群が大きくなる
  const bias = mods.hazardMul;
  const countBase = WOLF_GROUP_SIZE_MIN + Math.floor(Math.random() * (WOLF_GROUP_SIZE_MAX - WOLF_GROUP_SIZE_MIN + 1));
  const count = Math.min(WOLF_MAX_ALIVE - w.wolves.length, Math.max(1, Math.round(countBase * Math.min(1.6, bias))));
  // map 端からまとまって入ってくる。edge は 4 方向からランダム
  const edge = Math.floor(Math.random() * 4);
  const baseX = edge === 0 ? 20 : edge === 1 ? w.bounds.w - 20 : Math.random() * w.bounds.w;
  // 陸地端: 旧 DRY_Y_LIMIT の代わりに bounds.h * 0.85 を安全な陸地上限として使う
  const safeBottom = w.bounds.h * 0.85;
  const baseY = edge === 2 ? 40 : edge === 3 ? safeBottom - 40 : 60 + Math.random() * (safeBottom - 120);
  for (let i = 0; i < count; i++) {
    w.wolves.push({
      id: _wolfIdSeq++,
      pos: { x: baseX + (Math.random() - 0.5) * 40, y: baseY + (Math.random() - 0.5) * 40 },
      targetChibiId: null,
      state: 'stalk',
      stateTimer: 0,
      hp: WOLF_MAX_HP,
      maxHp: WOLF_MAX_HP,
      speed: WOLF_SPEED * (0.9 + Math.random() * 0.2),
      biteCooldown: 0,
      faceLeft: false,
      spawnTick: w.tick,
    });
  }
  // 群で現れた瞬間、近くのちびわふが悲鳴
  const nearbyChibi = w.chibis.find((c) => isAlive(c) && Math.hypot(c.pos.x - baseX, c.pos.y - baseY) < 260);
  if (nearbyChibi) {
    spawnBubble(w.bubbles, nearbyChibi.pos, 'オオカミがきたわふ！！', 'speech', 2.5);
  }
}

// オオカミのターゲット選定。野宿ちびわふ（homeFid=null）を最優先、
// 次に夜なのに家に入ってない奴、最後に誰でも。
function pickWolfTarget(w: WorldState, wolf: Wolf): Chibiwafu | null {
  const candidates = w.chibis.filter((c) => isAlive(c) && !c.flight);
  if (candidates.length === 0) return null;
  // 優先度付きでソート
  const scored = candidates.map((c) => {
    let priority = 0;
    if (!c.homeFid) priority += 200;  // 野宿は絶好の獲物
    // 家で寝てる子は強く忌避（家が盾）。野宿で寝てる子は好物。
    if (c.state === 'sleep' && c.homeFid) priority -= 300;
    if (c.state === 'sleep' && !c.homeFid) priority += 80;  // 寝てる野宿は狩りやすい
    // 稼働中の街灯の明かりの下ならオオカミは警戒して避ける
    if (chibiUnderStreetlamp(w, c.pos.x, c.pos.y)) priority -= 220;
    const d = Math.hypot(c.pos.x - wolf.pos.x, c.pos.y - wolf.pos.y);
    priority -= d * 0.04;  // 近いほど優先
    return { c, priority };
  });
  scored.sort((a, b) => b.priority - a.priority);
  // priority がマイナスのみの場合はノーターゲット（家で寝てる子しかいない → 徘徊するだけ）
  if (scored[0]!.priority < 0) return null;
  return scored[0]!.c;
}

export function updateWolves(w: WorldState, dt: number) {
  // 夜のみスポーンタイマー進行
  if (w.dayPhase === 'night') {
    w.wolfSpawnCooldown -= dt;
    if (w.wolfSpawnCooldown <= 0 && w.chibis.length > 0) {
      spawnWolfGroup(w);
      const mods = currentMods(w);
      const interval = WOLF_SPAWN_INTERVAL_NIGHT_BASE * mods.eventIntervalMul;
      w.wolfSpawnCooldown = interval * (0.7 + Math.random() * 0.6);
    }
  } else if (w.dayPhase === 'morning') {
    // 朝になったら全オオカミ撤退モードへ
    for (const wolf of w.wolves) {
      if (wolf.state !== 'dead' && wolf.state !== 'flee') {
        wolf.state = 'flee';
        wolf.stateTimer = 6;
      }
    }
  }

  // 個別更新
  for (let i = w.wolves.length - 1; i >= 0; i--) {
    const wolf = w.wolves[i]!;
    wolf.biteCooldown = Math.max(0, wolf.biteCooldown - dt);
    wolf.stateTimer -= dt;

    if (wolf.state === 'dead') {
      // 死体は 3 秒残して消す
      if (wolf.stateTimer <= 0) w.wolves.splice(i, 1);
      continue;
    }

    if (wolf.state === 'flee') {
      // 最寄り map 端へ逃げる
      const leftDist = wolf.pos.x;
      const rightDist = w.bounds.w - wolf.pos.x;
      const topDist = wolf.pos.y;
      const edgeTarget = leftDist < rightDist
        ? (leftDist < topDist ? { x: -20, y: wolf.pos.y } : { x: wolf.pos.x, y: -20 })
        : (rightDist < topDist ? { x: w.bounds.w + 20, y: wolf.pos.y } : { x: wolf.pos.x, y: -20 });
      const dx = edgeTarget.x - wolf.pos.x;
      const dy = edgeTarget.y - wolf.pos.y;
      const d = Math.max(0.001, Math.hypot(dx, dy));
      wolf.pos.x += (dx / d) * wolf.speed * 1.4 * dt;
      wolf.pos.y += (dy / d) * wolf.speed * 1.4 * dt;
      wolf.faceLeft = dx < 0;
      // 端に着いたら消える
      if (wolf.pos.x < -10 || wolf.pos.x > w.bounds.w + 10 || wolf.pos.y < -10) {
        w.wolves.splice(i, 1);
      }
      continue;
    }

    if (wolf.state === 'bite') {
      // 硬直中は動かない
      if (wolf.stateTimer <= 0) wolf.state = 'stalk';
      continue;
    }

    // stalk：ターゲット再評価（1秒おき or 未設定）
    let target = wolf.targetChibiId !== null
      ? (chibiById(w, wolf.targetChibiId) ?? null)
      : null;
    if (target && (!isAlive(target) || target.flight)) target = null;
    if (!target || Math.random() < dt * 0.5) {
      target = pickWolfTarget(w, wolf);
      wolf.targetChibiId = target ? target.id : null;
    }
    if (!target) {
      // 獲物なし：適当に徘徊
      wolf.pos.x += (Math.random() - 0.5) * wolf.speed * 0.3 * dt;
      wolf.pos.y += (Math.random() - 0.5) * wolf.speed * 0.3 * dt;
      continue;
    }

    const dx = target.pos.x - wolf.pos.x;
    const dy = target.pos.y - wolf.pos.y;
    const d = Math.max(0.001, Math.hypot(dx, dy));
    wolf.faceLeft = dx < 0;

    if (d <= WOLF_BITE_RANGE && wolf.biteCooldown <= 0) {
      // 噛む
      wolf.state = 'bite';
      wolf.stateTimer = 1.2;  // 噛んだあと 1.2 秒硬直（ストレス緩和）
      wolf.biteCooldown = 2.5;  // 再噛み抑止（連続即死防止）
      wolf.targetChibiId = null;  // 次のターゲットを再選定
      spawnBubble(w.bubbles, target.pos, 'ぎゃわふー！！', 'speech', 2.0);
      pushLife(target, Math.floor(target.ageSec), 'オオカミに噛まれた');
      // 逃げ疲れて倒れてた（scared/exhausted）ところを食われた → fled_to_exhaustion
      const biteDeathCause: DeathCauseId =
        (target.state === 'scared' || target.state === 'exhausted') && target.fatigue >= 50
          ? 'fled_to_exhaustion'
          : 'wolf_bite';
      damageChibi(w, target, WOLF_BITE_DAMAGE, biteDeathCause);
      // 近くのちびわふが叫ぶ
      for (const c of w.chibis) {
        if (c === target || !isAlive(c)) continue;
        if (Math.hypot(c.pos.x - target.pos.x, c.pos.y - target.pos.y) > 120) continue;
        if (Math.random() < 0.3) {
          spawnBubble(w.bubbles, c.pos, Math.random() < 0.5 ? 'オオカミわふー！' : 'にげろわふ！', 'speech', 1.8);
        }
      }
      continue;
    }

    // 接近
    wolf.pos.x += (dx / d) * wolf.speed * dt;
    wolf.pos.y += (dy / d) * wolf.speed * dt;
    // 海タイルには入らない（DRY_Y_LIMIT 旧境界の代わりにタイル判定）
    if (isSeaAt(wolf.pos.x, wolf.pos.y)) wolf.pos.y -= wolf.speed * dt * 2;
  }
}

// プレイヤーがオオカミをクリックした時のダメージ処理。
// HP 0 で撃破 → 3秒後に消滅、ポイント加算。
export function damageWolf(w: WorldState, wolf: Wolf, amount: number): boolean {
  if (wolf.state === 'dead') return false;
  wolf.hp = Math.max(0, wolf.hp - amount);
  if (wolf.hp <= 0) {
    wolf.state = 'dead';
    wolf.stateTimer = 3;
    w.wolvesKilled += 1;
    const gained = 35;
    w.points += gained;
    w.totalPointsEarned += gained;
    spawnBubble(w.bubbles, wolf.pos, 'ぎゃん…', 'speech', 1.8);
    return true;
  }
  // 怯ませる：一時的に flee
  wolf.state = 'flee';
  wolf.stateTimer = 2;
  return false;
}

function createDex(): Record<DeathCauseId, DexEntry> {
  const out = {} as Record<DeathCauseId, DexEntry>;
  for (const id of Object.keys(DEATH_CAUSES) as DeathCauseId[]) {
    out[id] = { id, count: 0 };
  }
  return out;
}

export function createWorld(difficulty: Difficulty = 'standard'): WorldState {
  const bounds = { w: CONFIG.WORLD_W, h: CONFIG.WORLD_H };
  const runId = `run-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000).toString(36)}`;
  const terrainSeed = seedFromRunId(runId);
  const terrain = initTerrain(bounds, difficulty, terrainSeed);
  activateTerrain(terrain);
  return {
    runId,
    runStartedAtMs: Date.now(),
    difficulty,
    tick: 0,
    timeSec: 0,
    secondsPerSeason: CONFIG.SECONDS_PER_SEASON,
    season: 'spring',
    dayPhase: 'morning',
    dayProgress: 0,
    dayCount: 1,
    lastDayPhase: 'morning',
    furanaPos: { x: bounds.w / 2, y: bounds.h * 0.35 },
    chibis: [],
    corpses: [],
    maxCorpses: CONFIG.MAX_CORPSES_VISIBLE,
    buildings: [],
    points: 0,
    totalPointsEarned: 0,
    villageLv: 1,
    resources: { ...DIFFICULTY_MODS[difficulty].initialResources },
    totalDeaths: 0,
    totalBirths: 0,
    stompCount: 0,
    sumDeathAgeSec: 0,
    longestLifeSec: 0,
    longestLifeName: '—',
    shortestLifeSec: Infinity,
    shortestLifeName: '—',
    furanaGrabbedTimer: 0,
    dex: createDex(),
    recentDeaths: [],
    newDiscoveries: [],
    newConstructions: [],
    villageRank: 'mura',
    nameSet: new Set(),
    bounds,
    spawnCooldown: 2,
    baseSpawnInterval: CONFIG.BASE_SPAWN_INTERVAL_SEC,
    baseCap: CONFIG.BASE_POP_CAP,
    event: null,
    pointMultiplier: CONFIG.GLOBAL_POINT_MULT_BASE,
    spawnSpeedMultiplier: 1,
    // 最初の音頭／火事はフルインターバルを待たず「先行き短め」で1発目を見せる。
    ondoCooldown: CONFIG.ONDO_BASE_INTERVAL_SEC * 0.45,
    fireCooldown: CONFIG.FIRE_BASE_INTERVAL_SEC * 0.45,
    bokaigiCooldown: CONFIG.BOKAIGI_COOLDOWN_SEC * 0.6,
    bokaigiMarkerTimer: 0,
    lastSeason: 'spring',
    npcs: createNpcs(bounds),
    bubbles: [],
    features: [] as Feature[],
    obstacles: [] as Obstacle[],
    chibiHash: new SpatialHash(100),
    weather: { kind: 'clear', remainingSec: CONFIG.SECONDS_PER_DAY },
    weatherForecast: [
      { dayOffset: 0, kind: 'clear' },
      { dayOffset: 1, kind: 'cloudy' },
      { dayOffset: 2, kind: 'light_rain' },
    ],
    lastWeatherDayCount: 1,
    floodZones: [],
    wolves: [],
    wolfSpawnCooldown: 0,
    wolvesKilled: 0,
    terrain,
    terrainSeed,
    terraformJobs: [],
    hydroTimer: 0,
  };
}

// 初期 feature/障害物 を生成してワールドに載せる。createWorld / load 後に呼ぶ。
export function ensurePlots(w: WorldState) {
  if (!w.features || w.features.length === 0) {
    w.features = createInitialFeatures(w.bounds);
  }
  if (!w.obstacles || w.obstacles.length === 0) {
    w.obstacles = createInitialObstacles(w.bounds, DIFFICULTY_MODS[w.difficulty].obstacleCount);
  }
  // 天気予報を実際の季節に合わせて再生成（ロード直後の不整合対策）
  w.weatherForecast = generateForecast(w);
  const today = w.weatherForecast.find((e) => e.dayOffset === 0);
  if (today) w.weather = { kind: today.kind, remainingSec: CONFIG.SECONDS_PER_DAY };
  // transient フィールドのロード後初期化
  if (!w.floodZones) w.floodZones = [];
  if (!w.wolves) w.wolves = [];
  if (w.wolfSpawnCooldown === undefined) w.wolfSpawnCooldown = 0;
  if (w.wolvesKilled === undefined) w.wolvesKilled = 0;
  // Σ-2/3: ロード後に地形タイルを再アクティブ化（v11 以前のセーブは seed で再生成）
  if (!w.terrain || w.terrain.length === 0) {
    if (!w.terrainSeed) w.terrainSeed = seedFromRunId(w.runId);
    w.terrain = initTerrain(w.bounds, w.difficulty, w.terrainSeed);
  }
  if (!w.terraformJobs) w.terraformJobs = [];
  if (!w.newConstructions) w.newConstructions = []; // Σ-5-e-b: transient キュー
  // buryTimer は transient なのでロード後リセット
  for (const row of w.terrain) for (const tile of row) tile.buryTimer = 0;
  activateTerrain(w.terrain);
  // Σ-3-d: ロード済み障害物が海タイルにある場合は陸地へ移動
  for (const obs of w.obstacles) {
    if (isSeaAt(obs.pos.x, obs.pos.y)) {
      const dry = findDryTile(obs.pos.x, obs.pos.y, 200);
      obs.pos = dry;
    }
  }
  // オオカミID連番をリセット（ラン毎に 1 から始め直す）
  resetWolfIdSeq(1);
  // モジュールレベルキャッシュをクリア（セーブロード後に旧参照が残らないよう）
  _wanderEnvCache = null;
  _featureIdCache = null;
  _chibiIdCache = null;
}

export function populationCap(w: WorldState): number {
  let cap = w.baseCap;
  for (const b of w.buildings) {
    const def = BUILDINGS[b.defId];
    if (!def) continue;
    const m = /pop\+(\d+)/.exec(def.effect);
    if (m) cap += Number(m[1]) * b.level;
  }
  return cap;
}

function countBuildingLevels(w: WorldState, defId: string): number {
  return w.buildings.filter((b) => b.defId === defId).reduce((a, b) => a + b.level, 0);
}

function applyBuildingMods(w: WorldState) {
  let mult = CONFIG.GLOBAL_POINT_MULT_BASE;
  let spawnMul = 1;
  for (const b of w.buildings) {
    const def = BUILDINGS[b.defId];
    if (!def) continue;
    const pm = /pmult\+([0-9.]+)/.exec(def.effect);
    if (pm) mult += Number(pm[1]) * b.level;
    // 産屋など：'spawn+0.18' → spawnSpeedMultiplier に線形加算
    const sp = /spawn\+([0-9.]+)/.exec(def.effect);
    if (sp) spawnMul += Number(sp[1]) * b.level;
  }
  w.pointMultiplier = mult;
  w.spawnSpeedMultiplier = spawnMul;
}

// --- Event scheduling -----------------------------------------------------
// 建物の数でインターバルが短くなる。下限あり。±10秒のランダム揺らぎ。
function computeOndoInterval(w: WorldState): number {
  const taiko = countBuildingLevels(w, 'taiko');
  const base = CONFIG.ONDO_BASE_INTERVAL_SEC + CONFIG.ONDO_INTERVAL_PER_TAIKO * taiko;
  const floored = Math.max(CONFIG.ONDO_INTERVAL_MIN_SEC, base);
  return (floored + (Math.random() - 0.5) * 20) * DIFFICULTY_MODS[w.difficulty].eventIntervalMul;
}

function computeFireInterval(w: WorldState): number {
  const kouba = countBuildingLevels(w, 'kouba');
  const base = CONFIG.FIRE_BASE_INTERVAL_SEC + CONFIG.FIRE_INTERVAL_PER_KOUBA * kouba;
  const floored = Math.max(CONFIG.FIRE_INTERVAL_MIN_SEC, base);
  return (floored + (Math.random() - 0.5) * 20) * DIFFICULTY_MODS[w.difficulty].eventIntervalMul;
}

function scheduleEvents(w: WorldState, dt: number) {
  if (w.event) return;
  w.ondoCooldown -= dt;
  w.fireCooldown -= dt;
  const ondoReady = w.ondoCooldown <= 0;
  const fireReady = w.fireCooldown <= 0;
  if (!ondoReady && !fireReady) return;
  // 両方来たら先に来てたほう（より負のほう）を選ぶ
  const pickOndo = ondoReady && (!fireReady || w.ondoCooldown <= w.fireCooldown);
  if (pickOndo) {
    w.event = {
      kind: 'ondo',
      duration: CONFIG.ONDO_DURATION_SEC,
      remaining: CONFIG.ONDO_DURATION_SEC,
      intensity: CONFIG.ONDO_KILL_RATE,
    };
    reactNpcsToOndo(w);
    dampenFuranaMood(w, 5);
  } else {
    w.event = {
      kind: 'fire',
      duration: CONFIG.FIRE_DURATION_SEC,
      remaining: CONFIG.FIRE_DURATION_SEC,
      intensity: CONFIG.FIRE_KILL_RATE,
    };
    dampenFuranaMood(w, 10);
  }
}

function getActiveHazards(w: WorldState): HazardZone[] {
  const zones = HAZARDS.concat(buildingsToHazards(w.buildings));
  // 太鼓祭り中は taiko 関連ハザードの半径とレートを一時的にバースト。
  if (w.event?.kind === 'taiko_festival') {
    for (const z of zones) {
      if (z.id.startsWith('taiko-')) {
        z.radius = CONFIG.TAIKO_FESTIVAL_RADIUS;
        z.ratePerSec = CONFIG.TAIKO_FESTIVAL_RATE_PER_SEC;
      }
    }
  }
  return zones;
}

// 棒会議：人口が閾値以上＆CDが切れてたら自動発動。1〜N人を即処刑する。
function maybeTriggerBokaigi(w: WorldState, dt: number) {
  if (w.event) return;
  w.bokaigiCooldown -= dt;
  if (w.bokaigiCooldown > 0) return;
  const alive = w.chibis.filter(isAlive);
  if (alive.length < CONFIG.BOKAIGI_CLUSTER_MIN) return;
  // 棒会議は夜／夕で発動率↑。朝昼だと 30% に絞る（くそざこ村では夜間棒会議が本番）
  if (w.dayPhase === 'morning' || w.dayPhase === 'noon') {
    if (Math.random() > 0.3) { w.bokaigiCooldown = 6 + Math.random() * 6; return; }
  }
  const suzu = w.npcs.find((n) => n.id === 'suzu');
  if (suzu && !suzu.dead) spawnBubble(w.bubbles, suzu.pos, '棒会議ひらくよ', 'npc-speech', 2.2);
  w.bokaigiMarkerTimer = 2.5;
  const victimCount = Math.min(alive.length, 1 + Math.floor(Math.random() * CONFIG.BOKAIGI_VICTIMS_MAX));

  // 棒名人がいれば、70% で通常犠牲者をひねり出した上で棒名人が生還。
  // 棒好きは逆に志願して犠牲になりやすい（重み2倍）。
  const weights = alive.map((c) => {
    if (c.traits.includes('bo_meijin')) return 0.05;  // ほぼ選ばれない
    if (c.traits.includes('bo_suki'))   return 2.5;   // 志願
    return 1.0;
  });
  const picked = new Set<number>();
  const pickOneIndex = (): number | null => {
    const remaining = alive.map((_, i) => i).filter((i) => !picked.has(i));
    if (remaining.length === 0) return null;
    const total = remaining.reduce((a, i) => a + weights[i]!, 0);
    let r = Math.random() * total;
    for (const i of remaining) {
      r -= weights[i]!;
      if (r <= 0) return i;
    }
    return remaining[remaining.length - 1]!;
  };

  // 棒名人による返り討ち：居れば1人はその棒名人が横で振って他の子を巻添え
  const meijin = alive.find((c) => c.traits.includes('bo_meijin'));
  if (meijin && Math.random() < 0.7) {
    const idx = pickOneIndex();
    if (idx != null) {
      picked.add(idx);
      const victim = alive[idx]!;
      if (victim !== meijin) {
        pushLife(meijin, Math.floor(meijin.ageSec), '棒会議で棒を振って1体を巻添えにした');
        kill(w, victim, 'bo_meijin_tenka');
      }
    }
  }

  for (let i = 0; i < victimCount; i++) {
    const idx = pickOneIndex();
    if (idx == null) break;
    picked.add(idx);
    kill(w, alive[idx]!, 'bokaigi');
  }
  w.bokaigiCooldown = CONFIG.BOKAIGI_COOLDOWN_SEC + Math.random() * 15;
}

// 太鼓祭り：太鼓やぐら所持＆季節が夏/秋に入る瞬間に発動。
function maybeStartTaikoFestival(w: WorldState) {
  if (w.event) return;
  if (w.season === w.lastSeason) return;
  if (w.season !== 'summer' && w.season !== 'autumn') return;
  if (countBuildingLevels(w, 'taiko') <= 0) return;
  w.event = {
    kind: 'taiko_festival',
    duration: CONFIG.TAIKO_FESTIVAL_DURATION_SEC,
    remaining: CONFIG.TAIKO_FESTIVAL_DURATION_SEC,
    intensity: CONFIG.TAIKO_FESTIVAL_KILL_RATE,
  };
  const suzu = w.npcs.find((n) => n.id === 'suzu');
  if (suzu && !suzu.dead) spawnBubble(w.bubbles, suzu.pos, '太鼓祭〜！', 'npc-speech', 2.5);
}

function logDeath(w: WorldState, c: Chibiwafu, causeId: DeathCauseId) {
  const cause = DEATH_CAUSES[causeId]!;
  const text = cause.template(c.name);
  const entry = w.dex[causeId];
  const wasNew = entry.count === 0;
  entry.count += 1;
  if (wasNew) {
    entry.firstVictim = c.name;
    entry.firstContext = text;
    entry.firstDiscoveredTick = w.tick;
    w.newDiscoveries.push(causeId);
  }
  w.recentDeaths.unshift({ tick: w.tick, name: c.name, causeId, text });
  if (w.recentDeaths.length > 24) w.recentDeaths.pop();
  const gained = Math.round(cause.points * w.pointMultiplier);
  w.points += gained;
  w.totalPointsEarned += gained;
  w.totalDeaths += 1;
  // 統計：寿命の合計・最長・最短を更新
  const ageSec = c.ageSec;
  w.sumDeathAgeSec += ageSec;
  if (ageSec > w.longestLifeSec) {
    w.longestLifeSec = ageSec;
    w.longestLifeName = c.name;
  }
  if (ageSec < w.shortestLifeSec) {
    w.shortestLifeSec = ageSec;
    w.shortestLifeName = c.name;
  }
}

// 平均寿命（秒）を返す。死者 0 なら 0。
export function averageLifespan(w: WorldState): number {
  return w.totalDeaths > 0 ? w.sumDeathAgeSec / w.totalDeaths : 0;
}

// 累計ポイント → 村Lv (1-99)。緩やかに伸びる平方根曲線（徐々に発展する感）。
// 目安:
//   0P→Lv1, 1kP→Lv3, 10kP→Lv7, 50kP→Lv15, 250kP→Lv32, 1MP→Lv64, 2.4MP→Lv99
// 実プレイの death rate から、×1 等倍で Lv99 到達まで数十時間を想定。
export function villageLvFromPoints(totalPointsEarned: number): number {
  const lv = Math.floor(Math.sqrt(Math.max(0, totalPointsEarned) / 250) + 1);
  return Math.max(1, Math.min(99, lv));
}

// 村Lv → 実効ワールド幅。Lv 1→1100, Lv 99→1694。Lv +1 ごと +6px。
export function effectiveBoundsFor(villageLv: number): { w: number; h: number } {
  const extraW = (villageLv - 1) * 6;
  const extraH = Math.floor((villageLv - 1) * 1.5); // 高さは少しだけ
  return { w: CONFIG.WORLD_W + extraW, h: CONFIG.WORLD_H + extraH };
}

export function kill(w: WorldState, c: Chibiwafu, causeId: DeathCauseId) {
  if (!isAlive(c)) return;
  c.state = 'dead';
  c.deathTick = w.tick;
  c.deathCauseId = causeId;
  c.hp = 0;
  pushLife(c, Math.floor(c.ageSec), `死んだ（${DEATH_CAUSES[causeId]!.title}）`);
  logDeath(w, c, causeId);
  reactNpcsToDeath(w, c);
  chibiSchadenfreude(w, c);
  applyConstructionDeathPenalty(w, c);
}

// HP を減らす。0 以下で causeId で死亡。戻り値 = 死んだか。
// 神様の殴打／振り回し／投げ の3系統で使う。通常事故死は経由しない。
export function damageChibi(w: WorldState, c: Chibiwafu, amount: number, causeId: DeathCauseId): boolean {
  if (!isAlive(c)) return false;
  c.hp = Math.max(0, c.hp - amount);
  if (c.hp <= 0) {
    kill(w, c, causeId);
    return true;
  }
  return false;
}

// ちびわふ／NPC を "空中に投げ飛ばす" 物理的な飛行を起動する。
// 指定した速度で飛び、毎 tick 当たり判定を行い、landTime 経過で着地処理。
// Σ-1-a: z物理も同時に初期化。重力加速度 CLIFF_GRAVITY で posZ が地形高度以下になると崖落下着地。
const CLIFF_GRAVITY = 200; // terrain-units/sec²

export function launchFlight(
  entity: Chibiwafu | NpcState,
  vx: number,
  vy: number,
  flightSec: number,
  landingDamage: number,
  landCauseId: DeathCauseId,
): void {
  const startElev = getElevation(entity.pos.x, entity.pos.y);
  // posZ 初期値：頂点から自由落下開始→ flightSec 後に地面に到達する高さ
  // posZ(t) = startElev + posZOffset - 0.5*CLIFF_GRAVITY*t²
  // 着地（posZ = startElev）: t = flightSec → posZOffset = 0.5*CLIFF_GRAVITY*flightSec²
  const posZOffset = 0.5 * CLIFF_GRAVITY * flightSec * flightSec;
  const flight: FlightState = {
    vx,
    vy,
    vz: 0,                       // 頂点スタート（初速なし、重力のみ）
    posZ: startElev + posZOffset, // 平地着地ならちょうど flightSec で地面到達
    startElev,
    leftSec: flightSec,
    totalSec: flightSec,
    hitKeys: [],
    landingDamage,
    landCauseId,
  };
  entity.flight = flight;
}

// 毎 tick の飛行処理。isChibi=true でちびわふ、false で NPC。
function flightStep(
  w: WorldState,
  entity: Chibiwafu | NpcState,
  isChibi: boolean,
  dt: number,
): void {
  const f = entity.flight;
  if (!f) return;
  // 移動 + 重力ちょい弱
  entity.pos.x += f.vx * dt;
  entity.pos.y += f.vy * dt;
  f.vy += 180 * dt;
  f.leftSec -= dt;
  // Σ-1-a z物理：重力で posZ を下降、地形以下になると崖着地
  f.vz -= CLIFF_GRAVITY * dt;
  f.posZ += f.vz * dt;
  // 横方向は画面内にクランプ（反射はしない、端で止まる）
  if (entity.pos.x < 16) { entity.pos.x = 16; f.vx = Math.abs(f.vx) * 0.5; }
  if (entity.pos.x > w.bounds.w - 16) { entity.pos.x = w.bounds.w - 16; f.vx = -Math.abs(f.vx) * 0.5; }

  // 衝突判定：半径 22px、同一個体は hitKeys で一度だけ
  const hitRadius = 22;
  for (const c of w.chibis) {
    if (!isAlive(c) || c === entity) continue;
    const key = `c:${c.id}`;
    if (f.hitKeys.includes(key)) continue;
    const d = Math.hypot(c.pos.x - entity.pos.x, c.pos.y - entity.pos.y);
    if (d >= hitRadius) continue;
    f.hitKeys.push(key);
    setState(c, 'hurt', 1);
    spawnBubble(w.bubbles, c.pos, pickCollisionVictimLine(), 'speech', 1.3);
    pushLife(c, Math.floor(c.ageSec), '飛んできた誰かに激突された');
    damageChibi(w, c, 4 + Math.floor(Math.random() * 5), 'cocoon_abuse');
  }
  for (const n of w.npcs) {
    if (n.dead || n === entity) continue;
    const key = `n:${n.id}`;
    if (f.hitKeys.includes(key)) continue;
    const d = Math.hypot(n.pos.x - entity.pos.x, n.pos.y - entity.pos.y);
    if (d >= hitRadius) continue;
    f.hitKeys.push(key);
    spawnBubble(w.bubbles, n.pos, pickLine(hurtLinesFor(n.id)), 'npc-speech', 1.3);
    damageNpc(w, n, 3 + Math.floor(Math.random() * 4));
  }

  // 着地：leftSec 切れ or 画面下端 or z軸で地形以下（崖落下）
  const groundZ = getElevation(entity.pos.x, entity.pos.y);
  const zLanded = f.posZ <= groundZ;
  if (f.leftSec <= 0 || entity.pos.y >= w.bounds.h - 10 || zLanded) {
    // Σ-1-a 崖落下チェック：発射地点 vs 着地地点の高低差 >= 15 で即死級ダメージ
    if (isChibi) {
      const drop = f.startElev - groundZ;
      if (drop >= 15) {
        const cliffDmg = Math.floor(30 + drop * 1.5);
        f.landingDamage = Math.max(f.landingDamage, cliffDmg);
        f.landCauseId = 'cliff_fall';
      }
    }
    // 位置クランプ（水＝泥川ゾーンはそのまま、陸は地面に）
    entity.pos.y = Math.min(entity.pos.y, w.bounds.h - 16);
    entity.flight = null;
    // 着地処理：海タイルなら溺死（ちびわふ）or 水HP削り（NPC）
    if (isChibi) {
      const c = entity as Chibiwafu;
      if (isSeaAt(c.pos.x, c.pos.y)) {
        spawnBubble(w.bubbles, c.pos, 'わふぅ…', 'speech', 1.1);
        pushLife(c, Math.floor(c.ageSec), '水に落ちて沈んだ');
        damageChibi(w, c, c.hp, 'kamisama_drown');
        return;
      }
      setState(c, 'hurt', 1.4);
      const isCliff = f.landCauseId === 'cliff_fall';
      spawnBubble(w.bubbles, c.pos, isCliff ? 'ぎゃーわふっ！！' : 'どさっわふ', 'speech', 1.2);
      const died = damageChibi(w, c, f.landingDamage, f.landCauseId as DeathCauseId);
      const action = isCliff ? '崖から落下して激突' : '投げられて地面に激突';
      if (died) {
        pushLife(c, Math.floor(c.ageSec), `${action}死（-${f.landingDamage}HP）`);
      } else {
        pushLife(c, Math.floor(c.ageSec), `${action}（-${f.landingDamage}HP）`);
      }
    } else {
      const n = entity as NpcState;
      if (isSeaAt(n.pos.x, n.pos.y)) {
        spawnBubble(w.bubbles, n.pos, 'わぷっ…', 'npc-speech', 1.2);
        damageNpc(w, n, 10);
        return;
      }
      damageNpc(w, n, f.landingDamage);
    }
  }
}

// NPC に HP ダメージ。0 以下で dead フラグを立てる。戻り値 = 死んだか。
// フラナが死ぬと panic モード発動。復活は npcs 側の respawnSec に従う（フラナは Infinity）。
export function damageNpc(w: WorldState, n: NpcState, amount: number): boolean {
  if (n.dead) return false;
  n.hp = Math.max(0, n.hp - amount);
  pushNpcLife(n, Math.floor(w.timeSec), `殴られた（-${amount} HP）`);
  if (n.hp <= 0) {
    n.dead = true;
    n.state = 'dead';
    n.stateTimer = 0;
    n.respawnTimer = NPC_DEFS[n.id].respawnSec;
    pushNpcLife(n, Math.floor(w.timeSec), '死んだ');
    // 死亡セリフ
    if (n.id === 'furana') {
      spawnBubble(w.bubbles, n.pos, pickLine(FURANA_LINES_DEATH), 'npc-speech', 3);
      onFuranaDeath(w);
    } else if (n.id === 'cocoon') {
      spawnBubble(w.bubbles, n.pos, pickLine(COCOON_DEATH_LINES), 'npc-speech', 2.5);
    } else {
      spawnBubble(w.bubbles, n.pos, 'やられた…', 'npc-speech', 2);
    }
    return true;
  }
  // HP 残ってるときの "いた！" 反応
  n.state = 'hurt';
  n.stateTimer = 1.2;
  // どのNPCでも専用の hurt 台詞を吐く
  spawnBubble(w.bubbles, n.pos, pickLine(hurtLinesFor(n.id)), 'npc-speech', 1.6);
  if (n.id === 'furana') {
    // 殴られると機嫌が大幅に下がる
    n.mood = Math.max(0, n.mood - 18);
    // スズが近くにいたらママ心配で反応（35%）
    const suzu = w.npcs.find((x) => x.id === 'suzu');
    if (suzu && !suzu.dead && Math.random() < 0.35) {
      spawnBubble(w.bubbles, suzu.pos, pickLine(SUZU_LINES_MAMA_HURT), 'npc-speech', 2);
    }
    // 近くのちびわふも反応：40px 以内の mama 40 超え の子が "ママー！" 30%
    for (const c of w.chibis) {
      if (!isAlive(c)) continue;
      if (distance(c.pos, n.pos) > 50) continue;
      if (c.params.mama < 40) continue;
      if (Math.random() < 0.3) {
        setState(c, 'cry', 1.2);
        spawnBubble(w.bubbles, c.pos, 'ママー！', 'speech', 1.4);
      }
    }
  }
  return false;
}

// フラナ死亡時の一斉リアクション：ちびわふ全員に衝撃。スズとココンも嘆く。
function onFuranaDeath(w: WorldState) {
  for (const c of w.chibis) {
    if (!isAlive(c)) continue;
    setState(c, 'cry', 3);
    if (Math.random() < 0.6) {
      const line = pickLine(['ママー！', 'うそわふ！', 'ママしんじゃったわふ…', 'なんでわふ！？', 'ぎゃーわふ！']);
      spawnBubble(w.bubbles, c.pos, line, 'speech', 2.2);
    }
    pushLife(c, Math.floor(c.ageSec), 'ママが死んだ');
  }
  const suzu = w.npcs.find((x) => x.id === 'suzu');
  if (suzu && !suzu.dead) spawnBubble(w.bubbles, suzu.pos, pickLine(SUZU_LINES_MAMA_DEATH), 'npc-speech', 3);
  const cocoon = w.npcs.find((x) => x.id === 'cocoon');
  if (cocoon && !cocoon.dead) spawnBubble(w.bubbles, cocoon.pos, 'ママ…ママ…', 'npc-speech', 3);
}

// lifeLog に1行追加。上限30件（古いものから削除）。
const LIFE_LOG_MAX = 30;
function pushLife(c: Chibiwafu, sec: number, text: string) {
  c.lifeLog.push({ sec, text });
  if (c.lifeLog.length > LIFE_LOG_MAX) c.lifeLog.shift();
}
export { pushLife };

// 出産：人口不足率に応じてインターバル短縮。空に近ければ burst 出産。
// フラナ（ママ）が死亡中はそもそも生まれない。
function spawnIfRoom(w: WorldState) {
  if (!isFuranaAlive(w)) return;
  const living = w.chibis.filter(isAlive).length;
  const cap = populationCap(w);
  if (living >= cap) return;
  w.spawnCooldown -= CONFIG.TICK_DT;
  if (w.spawnCooldown > 0) return;

  const deficitRatio = cap > 0 ? 1 - living / cap : 1;
  const scale = 1 + (CONFIG.BIRTH_DEFICIT_BOOST_MIN - 1) * deficitRatio;

  let burst = 1;
  if (living / cap < CONFIG.BIRTH_BURST_THRESHOLD) {
    burst = 1 + Math.floor(Math.random() * CONFIG.BIRTH_BURST_MAX);
  }
  for (let i = 0; i < burst; i++) {
    if (w.chibis.filter(isAlive).length >= cap) break;
    forceSpawn(w);
  }
  // 産屋で伸びる spawnSpeedMultiplier で実インターバル短縮
  const nextInterval = ((w.baseSpawnInterval + Math.random() * CONFIG.SPAWN_INTERVAL_JITTER_SEC) * scale) / Math.max(0.5, w.spawnSpeedMultiplier);
  w.spawnCooldown = nextInterval;
}

export function forceSpawn(w: WorldState) {
  const name = generateName(w.nameSet);
  w.nameSet.add(name);
  const jitter = () => (Math.random() - 0.5) * 40;
  const cocoon = w.npcs.find((n) => n.id === 'cocoon');
  const traits = rollTraits({
    buildingsNearFurana: w.buildings.filter((b) => distance(b.pos, w.furanaPos) < 120).length,
    koubaLevel: countBuildingLevels(w, 'kouba'),
    cocoonNearFurana: cocoon ? distance(cocoon.pos, w.furanaPos) < 100 : false,
    event: w.event?.kind ?? null,
  });
  // 10軸パラメータを生成→特性で baseline 補正。
  const rawParams = rollParams();
  const params = applyTraitBias(rawParams, traits);
  // ライフスパン：心配性は寿命半分、toughness が高いほど長生き。
  let maxAge = CONFIG.CHIBI_MAX_AGE_MIN_SEC + Math.random() * CONFIG.CHIBI_MAX_AGE_RANGE_SEC;
  if (traits.includes('shinpai')) maxAge *= 0.5;
  maxAge *= 0.7 + params.tough * 0.006; // tough 0 → ×0.7, tough 100 → ×1.3
  // フレーバー特性（動きに効かない小さな性格メモ）
  const flavors = rollFlavors(rollFlavorCount());
  const child = spawnChibiwafu({
    name,
    birthTick: w.tick,
    pos: findDryTile(w.furanaPos.x + jitter(), w.furanaPos.y + 30 + Math.abs(jitter()), 120),
    maxAgeSec: maxAge,
    traits,
    params,
    flavors,
  });
  // フレーバー由来の速度補正（足が妙に速い／遅い）
  child.speed *= applyFlavorSpeedMod(flavors);
  setState(child, 'surprised', 1.5);
  const traitLabel = traits.length > 0 ? `（${traits.map((t) => TRAIT_DEFS[t].name).join('・')}）` : '';
  pushLife(child, 0, `生まれた${traitLabel}`);
  w.chibis.push(child);
  w.totalBirths += 1;
  reactNpcsToBirth(w);
}

function resolveEvent(w: WorldState, dt: number) {
  if (!w.event) return;
  w.event.remaining -= dt;
  const elapsed = w.event.duration - w.event.remaining;
  const peak = intensityAt(w.event.intensity, elapsed, w.event.duration);
  for (const c of w.chibis) {
    if (!isAlive(c)) continue;
    if (w.event.kind === 'ondo') {
      // 浮世離れは音頭に反応しない（免疫）。
      if (c.traits.includes('ukiyo')) continue;
      setState(c, 'dazed', 0.5);
      if (Math.random() < peak * dt) kill(w, c, 'ondo');
    } else if (w.event.kind === 'fire') {
      // 農民気質は火に強い（-30%）。
      let rate = c.traits.includes('noumin') ? peak * 0.7 : peak;
      // 火の見やぐら（firewatch）半径 180px 以内は延焼を大幅減（×0.25）
      const firewatches = w.features.filter((f) => f.kind === 'firewatch');
      for (const fw of firewatches) {
        if (Math.hypot(fw.pos.x - c.pos.x, fw.pos.y - c.pos.y) <= 180) {
          rate *= 0.25;
          break;
        }
      }
      if (Math.random() < rate * dt) kill(w, c, 'fire');
      else if (Math.random() < 0.08) setState(c, 'hurt', 1);
    } else if (w.event.kind === 'taiko_festival') {
      // 太鼓やぐら近くのちびわふを眩惑状態に。実際のkillは taiko_crush ハザードに任せる。
      for (const b of w.buildings) {
        if (b.defId !== 'taiko') continue;
        if (distance(c.pos, b.pos) < 70) {
          setState(c, 'dazed', 0.4);
          break;
        }
      }
    }
  }
  if (w.event.remaining <= 0) {
    const ended = w.event.kind;
    w.event = null;
    if (ended === 'ondo') { w.ondoCooldown = computeOndoInterval(w); dampenFuranaMood(w, -8); }  // 音頭終わり → 解放感 +8
    else if (ended === 'fire') w.fireCooldown = computeFireInterval(w);
    // taiko_festival はクールダウン再設定不要（次の季節境界で再発動）。
  }
}

export function triggerOndo(w: WorldState) {
  w.event = {
    kind: 'ondo',
    duration: CONFIG.ONDO_DURATION_SEC,
    remaining: CONFIG.ONDO_DURATION_SEC,
    intensity: CONFIG.ONDO_KILL_RATE + 0.05,
  };
  reactNpcsToOndo(w);
}

export function triggerBokaigi(w: WorldState) {
  const alive = w.chibis.filter(isAlive);
  if (alive.length === 0) return;
  const victims = Math.min(alive.length, 1 + Math.floor(Math.random() * 3));
  for (let i = 0; i < victims; i++) {
    const pick = alive[Math.floor(Math.random() * alive.length)]!;
    kill(w, pick, 'bokaigi');
  }
}

export function triggerFire(w: WorldState) {
  // 火の見やぐらがあれば火事の持続時間を 60% に短縮（消火活動の抽象化）
  const hasFirewatch = w.features.some((f) => f.kind === 'firewatch');
  const dur = hasFirewatch ? CONFIG.FIRE_DURATION_SEC * 0.6 : CONFIG.FIRE_DURATION_SEC;
  w.event = {
    kind: 'fire',
    duration: dur,
    remaining: dur,
    intensity: CONFIG.FIRE_KILL_RATE + 0.05,
  };
}

function runHazards(w: WorldState, c: Chibiwafu, dt: number, hazards: HazardZone[]): boolean {
  const insideSafe = distance(c.pos, w.furanaPos) < CONFIG.SAFE_ZONE_R;
  for (const zone of hazards) {
    if (!hazardActiveInSeason(zone, w.season)) continue;
    if (insideSafe && !zone.bypassSafeZone) continue;
    // 'sea' kind は isSeaAt で判定（DRY_Y_LIMIT rect の代替）
    if (zone.kind === 'sea') {
      if (!isSeaAt(c.pos.x, c.pos.y)) continue;
    } else {
      if (!pointInZone(zone, c.pos)) continue;
    }
    // trait gate
    if (zone.requiresAnyTrait && !zone.requiresAnyTrait.some((t) => c.traits.includes(t))) continue;
    // event gate
    if (zone.requiresEvent && zone.requiresEvent !== w.event?.kind) continue;
    // age gate
    if (zone.requiresYoungSec != null && c.ageSec >= zone.requiresYoungSec) continue;
    // trait multipliers
    let rate = zone.ratePerSec;
    if (zone.traitMultipliers) {
      for (const t of c.traits) {
        const m = zone.traitMultipliers[t];
        if (m != null) rate *= m;
      }
    }
    // パラメータ補正（運の悪さ・丈夫さ）
    rate *= derivedHazardSusceptibility(c.params);
    // 難度補正（災害頻度）
    rate *= DIFFICULTY_MODS[w.difficulty].hazardMul;
    if (Math.random() < rate * dt) {
      kill(w, c, zone.causeId);
      return true;
    }
  }
  return false;
}

// ============================================================
// Ω-3 住居・夜（家 feature + 帰宅 AI）
// ============================================================

// 夜型の特性ラベル（夜間に起きて徘徊する）
const NIGHT_OWL_FLAVORS = new Set([
  '深夜徘徊癖', '昼夜逆転', '夜ふかし常習', '夜だけ元気',
]);
function isNightOwl(c: Chibiwafu): boolean {
  if (c.flavors.some((f) => NIGHT_OWL_FLAVORS.has(f))) return true;
  // energy 高 + mama 低 の稀ケース（フラナ離れ＋元気過剰）
  return c.params.energy > 80 && c.params.mama < 25;
}

// 家1棟の収容人数
const HOUSE_CAPACITY = 4;
// 家に「到着」とみなす距離
const HOUSE_ARRIVAL_RADIUS = 26;
// 帰宅途中の walking 状態として target を設定する距離（遠すぎたら諦めて野宿）
const HOUSE_MAX_WALK_DIST = 1400;

// 各家の現在使用人数を数える（O(chibis)）。夜開始時 or 10秒おきに呼ぶ前提。
function isAtHome(w: WorldState, c: Chibiwafu): boolean {
  if (!c.homeFid) return false;
  const h = featureById(w, c.homeFid);
  if (!h) return false;
  return Math.hypot(h.pos.x - c.pos.x, h.pos.y - c.pos.y) <= HOUSE_ARRIVAL_RADIUS;
}

// feature id → Feature のキャッシュ。ホットパス（updateChibi 内で
// 200+ chibi × 2 呼び出し）で w.features.find の O(n) を避ける。
// 配列参照 + length で差分検知、要素追加/削除があれば自動再構築。
let _featureIdCache: { features: Feature[]; len: number; map: Map<string, Feature> } | null = null;
function featureById(w: WorldState, id: string): Feature | undefined {
  if (!_featureIdCache
      || _featureIdCache.features !== w.features
      || _featureIdCache.len !== w.features.length) {
    const map = new Map<string, Feature>();
    for (const f of w.features) map.set(f.id, f);
    _featureIdCache = { features: w.features, len: w.features.length, map };
  }
  return _featureIdCache.map.get(id);
}

// chibi id → Chibiwafu のキャッシュ。オオカミのターゲット追跡（tick 毎に O(n) find）を O(1) に。
// 配列参照 + length で差分検知。
let _chibiIdCache: { chibis: Chibiwafu[]; len: number; map: Map<number, Chibiwafu> } | null = null;
function chibiById(w: WorldState, id: number): Chibiwafu | undefined {
  if (!_chibiIdCache
      || _chibiIdCache.chibis !== w.chibis
      || _chibiIdCache.len !== w.chibis.length) {
    const map = new Map<number, Chibiwafu>();
    for (const c of w.chibis) map.set(c.id, c);
    _chibiIdCache = { chibis: w.chibis, len: w.chibis.length, map };
  }
  return _chibiIdCache.map.get(id);
}

// 毎 tick 同じ値になるワーカー入力（畑/農耕舎/太鼓/障害物/神社の位置リスト）を
// chibi ごとに filter/map し直すと O(chibis × features) で高くつく。tick 単位にキャッシュ。
interface WanderEnvCache {
  tick: number;
  farmPositions: Vec2[];
  noukouPositions: Vec2[];
  taikoPositions: Vec2[];
  obstaclePositions: Vec2[];
  shrinePositions: Vec2[];
  terraformJobPositions: Vec2[];
  priorityTerraformJobPositions: Vec2[]; // Σ-6-x: 直近 5 分の terraform ジョブ（自動優先）
  constructionPositions: Vec2[]; // Σ-5-e-b: 建設中 feature（devLevel < 2）の位置
  priorityConstructionPositions: Vec2[]; // Σ-6-x: プレイヤー指示「優先建設」の位置
}
let _wanderEnvCache: WanderEnvCache | null = null;
function getWanderEnv(w: WorldState): WanderEnvCache {
  if (_wanderEnvCache && _wanderEnvCache.tick === w.tick) return _wanderEnvCache;
  const farmPositions: Vec2[] = [];
  const shrinePositions: Vec2[] = [];
  const constructionPositions: Vec2[] = [];
  const priorityConstructionPositions: Vec2[] = [];
  const priorityIds = getActivePriorityIds();
  for (const f of w.features) {
    if (f.kind === 'farm') farmPositions.push(f.pos);
    else if (f.kind === 'shrine') shrinePositions.push(f.pos);
    if (f.devLevel < 2) {
      constructionPositions.push(f.pos);
      if (priorityIds.has(f.id)) priorityConstructionPositions.push(f.pos);
    }
  }
  const noukouPositions: Vec2[] = [];
  const taikoPositions: Vec2[] = [];
  for (const b of w.buildings) {
    if (b.defId === 'noukou') noukouPositions.push(b.pos);
    else if (b.defId === 'taiko') taikoPositions.push(b.pos);
  }
  // 作業対象：障害物 + 製材所（chibiwafu.ts の wanderStep は「労働」として
  // obstaclePositions の近くへ歩く。sawmill も労働対象として混ぜておく）
  const obstaclePositions: Vec2[] = w.obstacles.map((o) => o.pos);
  for (const f of w.features) if (f.kind === 'sawmill' || f.kind === 'kiln' || f.kind === 'loom') obstaclePositions.push(f.pos);
  // Σ-5-a: terraform ジョブのタイル中心座標
  // Σ-6-x: 直近置かれたジョブは priorityTerraformJobPositions に入れる（自動 5 分優先）
  const terraformJobPositions: Vec2[] = [];
  const priorityTerraformJobPositions: Vec2[] = [];
  const terraformPriorityIds = getActiveTerraformPriorityIds();
  for (const j of w.terraformJobs) {
    const p = { x: (j.tx + 0.5) * TERRAIN_TILE_SIZE, y: (j.ty + 0.5) * TERRAIN_TILE_SIZE };
    terraformJobPositions.push(p);
    if (terraformPriorityIds.has(j.id)) priorityTerraformJobPositions.push(p);
  }
  _wanderEnvCache = {
    tick: w.tick, farmPositions, noukouPositions, taikoPositions, obstaclePositions,
    shrinePositions, terraformJobPositions, priorityTerraformJobPositions,
    constructionPositions, priorityConstructionPositions,
  };
  return _wanderEnvCache;
}

function countHomeOccupants(w: WorldState): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of w.chibis) {
    if (!isAlive(c) || !c.homeFid) continue;
    map.set(c.homeFid, (map.get(c.homeFid) ?? 0) + 1);
  }
  return map;
}

// 家が無い（or 割当家が消された）ちびわふに、最も近い空き家を割り当てる。
// 家がなければ null のまま（野宿）。
function assignHomeIfNeeded(w: WorldState, c: Chibiwafu, occupants: Map<string, number>): void {
  // 既に家があって、その家がまだ存在＋定員内なら維持
  if (c.homeFid) {
    const h = w.features.find((f) => f.id === c.homeFid && f.kind === 'house');
    if (h && (occupants.get(c.homeFid) ?? 0) <= HOUSE_CAPACITY) return;
    c.homeFid = null;
  }
  // 空き家から最寄りを選ぶ
  let best: Feature | null = null;
  let bestDist = Infinity;
  for (const f of w.features) {
    if (f.kind !== 'house') continue;
    const used = occupants.get(f.id) ?? 0;
    if (used >= HOUSE_CAPACITY) continue;
    const d = Math.hypot(f.pos.x - c.pos.x, f.pos.y - c.pos.y);
    if (d < bestDist) { bestDist = d; best = f; }
  }
  if (best) {
    c.homeFid = best.id;
    occupants.set(best.id, (occupants.get(best.id) ?? 0) + 1);
  }
}

function updateChibi(w: WorldState, c: Chibiwafu, dt: number, hazards: HazardZone[]) {
  if (!isAlive(c)) return;
  c.ageSec += dt;
  c.chatCooldown -= dt;
  // 寿命（maxAgeSec）による老衰は廃止。hunger / fatigue / 災害 / 事故で十分死ぬ。
  // maxAgeSec フィールド自体は save 互換性のため残す（UI 表示「XX秒目」で参照される）。
  if (false && c.ageSec >= c.maxAgeSec) {
    kill(w, c, 'roushuai');
    return;
  }
  // --- サバイバル（空腹・疲労） ---------------------------------------
  // 空腹は時間で上昇（tough が高いと耐性↑）。疲労は活動系ステートで上昇、睡眠で回復。
  const toughMul = 1 - Math.max(0, c.params.tough - 50) * 0.006;  // tough100=0.7倍
  const mods = DIFFICULTY_MODS[w.difficulty];
  const wmods = weatherChibiMods(w.weather.kind);
  // 神社（shrine）半径 200px 以内は士気ボーナスで空腹・疲労が -30%（tick キャッシュ利用）
  const env = getWanderEnv(w);
  let shrineMul = 1.0;
  for (const sp of env.shrinePositions) {
    if (Math.hypot(sp.x - c.pos.x, sp.y - c.pos.y) <= 200) {
      shrineMul = 0.7;
      break;
    }
  }
  c.hunger += dt * 1.2 * toughMul * mods.hungerMul * wmods.hungerMul * shrineMul;
  // sleep 以外は疲労が溜まる（hurt/cry でも休息にならない）
  if (c.state !== 'sleep') c.fatigue += dt * 0.55 * toughMul * mods.fatigueMul * wmods.fatigueMul * shrineMul;
  // 寒冷天候では HP が軽くドレイン（凍傷）
  if (wmods.coldHpDrain > 0 && c.state !== 'sleep') {
    c.hp = Math.max(0, c.hp - dt * wmods.coldHpDrain);
    if (c.hp <= 0) { kill(w, c, 'fatigue_death'); return; }  // TODO: 凍傷専用死因は後ほど
  }
  // 睡眠回復：家で寝てると 1.6×、野宿（夜＋家なし）は 0.4× + 冷気 HP ドレイン
  if (c.state === 'sleep') {
    const atHome = c.homeFid && isAtHome(w, c);
    const isOpenAir = w.dayPhase === 'night' && !atHome;
    const recoveryMul = atHome ? 1.6 : isOpenAir ? 0.4 : 1.0;
    c.fatigue = Math.max(0, c.fatigue - dt * 0.70 * recoveryMul);
    if (isOpenAir) {
      // 野宿の寒さ HP ドレイン。街灯の明かりの下なら半減。
      const lit = chibiUnderStreetlamp(w, c.pos.x, c.pos.y);
      const drain = lit ? 0.075 : 0.15;
      c.hp = Math.max(0, c.hp - dt * drain);
      if (c.hp <= 0) { kill(w, c, 'fatigue_death'); return; }
    }
  }
  if (c.state === 'eating') c.hunger = Math.max(0, c.hunger - dt * 6);   // 食事で一気に回復
  c.hunger = Math.max(0, Math.min(100, c.hunger));
  c.fatigue = Math.max(0, Math.min(100, c.fatigue));
  if (c.hunger >= 100) { kill(w, c, 'hunger_death'); return; }
  if (c.fatigue >= 100) { kill(w, c, 'fatigue_death'); return; }
  // Σ-7-d 水たまり溺死：踏んだタイルの waterLevel が深く、courage 判定失敗で沈む
  // 新生児（ageSec<5）と既に飛行中は対象外
  if (c.ageSec >= 5 && !c.flight && c.state !== 'sleep' && c.state !== 'dead') {
    const { tx, ty } = worldToTile(c.pos.x, c.pos.y);
    const tile = w.terrain[ty]?.[tx];
    if (tile && tile.waterLevel >= 0.30 && !isSeaAt(c.pos.x, c.pos.y)) {
      // 浅い帯（0.30-0.40）：水を踏んだバブル（10% per second）
      if (tile.waterLevel < 0.40 && Math.random() < dt * 0.10) {
        spawnBubble(w.bubbles, c.pos, pickWaterSteppedLine(), 'speech', 1.2);
      }
      // 深い水たまり（0.4+）：勇気が低いほど溺れる
      // chance = dt * 0.004 * (wl-0.3)^2 * 25 * courageFactor
      // wl=0.4 → 0.0001/sec * cf, wl=0.5 → 0.001 * cf, wl=0.7 → 0.0064 * cf, wl=1.0 → 0.024 * cf
      if (tile.waterLevel >= 0.40) {
        const courageFactor = Math.max(0, (60 - c.params.courage) / 60); // courage 0=1.0, 60+=0
        const depth = tile.waterLevel - 0.3;
        const drownChance = dt * 0.004 * depth * depth * 25 * courageFactor;
        if (Math.random() < drownChance) {
          spawnBubble(w.bubbles, c.pos, pickDrownLastWords(), 'speech', 1.5);
          pushLife(c, Math.floor(c.ageSec), '水たまりに沈んでしまった');
          kill(w, c, 'drown_pond');
          return;
        }
      }
    }
  }
  // 畑に 24px 以内で立ってる空腹のちびわふ：1 food 消費して食事状態に入る
  if (c.state === 'idle' && c.hunger > 30 && w.resources.food >= 1) {
    for (const f of w.features) {
      if (f.kind !== 'farm') continue;
      if (Math.hypot(c.pos.x - f.pos.x, c.pos.y - f.pos.y) > 24) continue;
      w.resources.food -= 1;
      setState(c, 'eating', 2.5);
      spawnBubble(w.bubbles, c.pos, 'もぐもぐわふ', 'speech', 1.2);
      pushLife(c, Math.floor(c.ageSec), '畑で食事した');
      break;
    }
  }
  // 飛行中は wander/state transition を止めて物理だけ動かす
  if (c.flight) {
    flightStep(w, c, true, dt);
    return;
  }
  // 夕夜の帰宅 AI：家があれば target を家にセット、到着で sleep に入る。
  // 夜は「基本全員寝る、深夜徘徊の子だけ起きる」運用。
  const nightOwl = isNightOwl(c);
  if ((w.dayPhase === 'evening' || w.dayPhase === 'night') && c.state === 'idle') {
    if (c.homeFid) {
      const home = featureById(w, c.homeFid);
      if (home) {
        const d = Math.hypot(home.pos.x - c.pos.x, home.pos.y - c.pos.y);
        if (d <= HOUSE_ARRIVAL_RADIUS) {
          // 到着：夜なら長めに寝る（夜型は浅い睡眠）
          if (w.dayPhase === 'night' && !nightOwl) setState(c, 'sleep', 18);
          else if (w.dayPhase === 'night' && nightOwl && Math.random() < 0.45) {
            setState(c, 'sleep', 4);  // 夜型もたまに軽く寝る
          }
        } else if (d <= HOUSE_MAX_WALK_DIST && !nightOwl) {
          // 家へ向かって target を書き換え（wanderStep が次 tick で使う）
          c.target = { x: home.pos.x, y: home.pos.y };
        }
      }
    } else if (w.dayPhase === 'night' && !nightOwl) {
      // 野宿の子：その場で丸まって寝る（狼に狙われやすい）
      setState(c, 'sleep', 15);
    }
  }
  c.stateTimer -= dt;
  if (c.stateTimer <= 0 && c.state !== 'dead') {
    const roll = Math.random();
    // 夜は寝る確率が大きく上がる。夜型フレーバーの子だけは例外で昼と同じ挙動。
    let sleepThreshold = 0.10;
    if (w.dayPhase === 'evening') sleepThreshold = 0.15;
    else if (w.dayPhase === 'night') sleepThreshold = nightOwl ? 0.10 : 0.80;  // 夜は 80% で寝直す
    const dazedThreshold = 0.08;
    const cryThreshold = 0.05;
    if (roll < cryThreshold) {
      setState(c, 'cry', 0.8);
      if (Math.random() < 0.95) spawnBubble(w.bubbles, c.pos, pickReason(CRY_REASONS), 'speech', 1.4);
    }
    else if (roll < dazedThreshold) {
      setState(c, 'dazed', 0.6);
      if (Math.random() < 0.85) spawnBubble(w.bubbles, c.pos, pickReason(DAZED_REASONS), 'speech', 1.2);
    }
    else if (roll < sleepThreshold) {
      // 夜の睡眠は長め（中断されにくい）、それ以外は従来通り
      const sleepSec = w.dayPhase === 'night' && !nightOwl ? 8 + Math.random() * 6 : 1.5;
      setState(c, 'sleep', sleepSec);
      if (Math.random() < 0.9) spawnBubble(w.bubbles, c.pos, pickReason(SLEEP_REASONS), 'speech', 1.3);
    }
    else setState(c, 'idle', 0.4 + Math.random());
  }

  // --- 特性別の可視挙動 ---------------------------------------------------
  // 泣き虫：idle 中にランダムで泣き出す（15-30秒に1回程度）
  if (c.traits.includes('nakimushi') && c.state === 'idle' && Math.random() < 0.0025) {
    setState(c, 'cry', 1.6);
    spawnBubble(w.bubbles, c.pos, 'わふぅ〜', 'speech', 1.4);
  }
  // もらし常習：💧 吹き出しが周期的に出る（15-20秒毎くらい）
  if (c.traits.includes('morashi') && Math.random() < 0.003) {
    spawnBubble(w.bubbles, c.pos, '💧', 'stomp', 1.1);
    pushLife(c, Math.floor(c.ageSec), 'もらした');
    // 周囲 50px に生きた他の子がいれば反応（35% 優しく拭く / 65% ドン引き）
    const witness = w.chibiHash.nearby(c.pos, 50, c).find(
      (o) => distance(o.pos, c.pos) < 50 && o.state === 'idle',
    );
    if (witness) {
      if (Math.random() < 0.35) {
        // 優しい子：拭いてあげる（idle に留まり台詞のみ）
        spawnBubble(w.bubbles, witness.pos, pickMorashiWipeLine(), 'speech', 1.6);
        pushLife(witness, Math.floor(witness.ageSec), `${c.name} のもらしを拭いた`);
      } else {
        // ドン引きする子：dazed 状態 + 暴言
        setState(witness, 'dazed', 1);
        spawnBubble(w.bubbles, witness.pos, pickMorashiDisgustLine(), 'speech', 1.6);
        pushLife(witness, Math.floor(witness.ageSec), `${c.name} のもらしにドン引きした`);
      }
    }
  }
  // おしゃべり：idle 中、相手がいなくても一人で喋る
  if (c.traits.includes('oshaberi') && c.state === 'idle' && c.chatCooldown <= 0 && Math.random() < 0.005) {
    const line = pickOshaberiLine(c);
    spawnBubble(w.bubbles, c.pos, line.text, 'speech', 1.3);
    if (line.cheeky) maybePunishCheeky(w, c);
  }
  // 全員：社交 param に応じて独り言を漏らす（oshaberi 無くても少しは喋る）
  if (!c.traits.includes('oshaberi') && c.state === 'idle' && c.chatCooldown <= 0 && Math.random() < derivedSoloSpeakChance(c.params)) {
    const line = pickOshaberiLine(c);
    spawnBubble(w.bubbles, c.pos, line.text, 'speech', 1.6);
    c.chatCooldown = 1 + Math.random() * 2;
    if (line.cheeky) maybePunishCheeky(w, c);
  }
  // 哲学者：場所関係なく突然立ち止まって空を見る（20-30秒に1回程度）
  if (c.traits.includes('tetsugakusha') && c.state === 'idle' && Math.random() < 0.0015) {
    setState(c, 'staring', 3);
    spawnBubble(w.bubbles, c.pos, '…', 'speech', 1.5);
    pushLife(c, Math.floor(c.ageSec), '突然立ち止まって空を見つめた');
  }

  // --- フレーバー特性由来の小挙動 --------------------------------------
  // 季節×flavor 連動の自然発話
  if (c.state === 'idle') {
    // 暑がり × 夏：ため息
    if (w.season === 'summer' && c.flavors.includes('暑がり') && Math.random() < 0.002) {
      spawnBubble(w.bubbles, c.pos, 'あついわふ…', 'speech', 1.3);
    }
    // 寒がり × 冬
    if (w.season === 'winter' && c.flavors.includes('寒がり') && Math.random() < 0.002) {
      spawnBubble(w.bubbles, c.pos, 'さむいわふ…', 'speech', 1.3);
    }
    // 鼻血出やすい：🩸 絵文字＋ hurt 軽め
    if (c.flavors.includes('鼻血出やすい') && Math.random() < 0.0015) {
      spawnBubble(w.bubbles, c.pos, '🩸', 'stomp', 1);
      setState(c, 'hurt', 0.6);
    }
    // しゃっくりが止まらない
    if (c.flavors.includes('しゃっくりが止まらない') && Math.random() < 0.0025) {
      spawnBubble(w.bubbles, c.pos, 'ひっく', 'speech', 0.9);
    }
    // 歌が壊滅的に下手：♪を出す
    if (c.flavors.includes('歌が壊滅的に下手') && Math.random() < 0.0015) {
      spawnBubble(w.bubbles, c.pos, '♪？', 'speech', 1.4);
    }
    // 空をじっと見る：staring に突入
    if (c.flavors.includes('空をじっと見る') && Math.random() < 0.0012) {
      setState(c, 'staring', 2);
    }
    // 棒で何でも叩く：近くの誰かを叩く
    if (c.flavors.includes('棒で何でも叩く') && Math.random() < 0.0015) {
      const near = w.chibis.find((o) => o !== c && isAlive(o) && distance(o.pos, c.pos) < 40);
      if (near) {
        spawnBubble(w.bubbles, c.pos, 'えいっ！', 'speech', 1);
        spawnBubble(w.bubbles, near.pos, 'いたっ', 'speech', 0.8);
        setState(near, 'hurt', 0.8);
      }
    }
    // うんこの形が気になる：近くの死体で立ち止まる
    if (c.flavors.includes('うんこの形が気になる') && Math.random() < 0.0015) {
      const corpse = w.corpses.find((cc) => distance(cc.pos, c.pos) < 30);
      if (corpse) setState(c, 'staring', 2);
    }
    // すぐ寝る：sleep 頻発
    if (c.flavors.includes('すぐ寝る') && Math.random() < 0.003) {
      setState(c, 'sleep', 2);
    }
    // すぐ笑う：笑い bubble
    if (c.flavors.includes('すぐ笑う') && Math.random() < 0.002) {
      spawnBubble(w.bubbles, c.pos, 'ふふっわふ', 'speech', 1.1);
    }
  }

  // sleep 中のいびきうるさい
  if (c.state === 'sleep' && c.flavors.includes('いびきがうるさい') && Math.random() < 0.005) {
    spawnBubble(w.bubbles, c.pos, 'ぐーぐーわふ', 'speech', 1.3);
  }

  // --- テーブル駆動のフレーバー挙動 ----------------------------------
  for (const f of c.flavors) {
    const amb = FLAVOR_AMBIENT[f];
    if (amb && c.state === 'idle' && Math.random() < amb.chance) {
      if (amb.bubble) spawnBubble(w.bubbles, c.pos, amb.bubble, 'speech', 1.2);
      if (amb.state) setState(c, amb.state, amb.duration ?? 1);
      // Σ-7-f もらし系：足元タイルに waterLevel +0.2、専用ボコ
      if (MORASHI_FLAVORS.has(f)) {
        if (f === 'おしっこもらし') {
          const { tx, ty } = worldToTile(c.pos.x, c.pos.y);
          const tile = w.terrain[ty]?.[tx];
          if (tile && !isSeaAt(c.pos.x, c.pos.y)) {
            tile.waterLevel = Math.min(1.0, tile.waterLevel + 0.2);
          }
        }
        maybePunishMorashi(w, c, f);
      } else if (EMBARRASSING_FLAVORS.has(f)) {
        // 粗相系フレーバー：周囲から理不尽にボコられる可能性
        maybePunishRifujin(w, c, f);
      }
    }
    const seasonals = FLAVOR_SEASONAL[f];
    if (seasonals) {
      for (const s of seasonals) {
        if (s.season === w.season && Math.random() < s.chance) {
          spawnBubble(w.bubbles, c.pos, s.bubble, 'speech', 1.3);
        }
      }
    }
    const during = FLAVOR_DURING[f];
    if (during && c.state === during.state && Math.random() < during.chance) {
      spawnBubble(w.bubbles, c.pos, during.bubble, 'speech', 1.2);
    }
  }

  // --- 感情の伝染 / 野次 ------------------------------------------------
  // idle なちびわふが 45px 以内の "反応可能な" 子を見つけて反応する。
  // 泣いてる子 → 慰め / もらい泣き
  // 食べてる子 → おねだり
  // 寝てる子  → あくび伝染
  // 怒ってる子 → 怯える
  emergentPeerReactions(w, c);

  // Σ-5-d: 狼検知と逃走 AI
  if (!c.flight && c.state !== 'dead' && c.state !== 'sleep') {
    const WOLF_DETECT_RADIUS = 80;
    let nearestWolf: { pos: { x: number; y: number } } | null = null;
    let nearestWolfDist = Infinity;
    for (const wolf of w.wolves) {
      if (wolf.state === 'dead') continue;
      const wd = Math.hypot(wolf.pos.x - c.pos.x, wolf.pos.y - c.pos.y);
      if (wd < WOLF_DETECT_RADIUS && wd < nearestWolfDist) {
        nearestWolfDist = wd;
        nearestWolf = wolf;
      }
    }

    if (nearestWolf) {
      // sanctuary（家・火の見やぐら 40px 以内）に居れば safe
      const inSanctuary = w.features.some((f) =>
        (f.kind === 'house' || f.kind === 'firewatch') && Math.hypot(f.pos.x - c.pos.x, f.pos.y - c.pos.y) <= 40
      );
      if (!inSanctuary) {
        // scared ステートに遷移
        if (c.state !== 'scared') {
          setState(c, 'scared', 0.6);
          if (Math.random() < 0.4) {
            const FLEE_LINES = ['ぎゃああわふ！', '狼こわいわふ！', 'むり！もうむり！', 'たすけてわふ〜！', 'ひぃぃぃわふ！'];
            spawnBubble(w.bubbles, c.pos, FLEE_LINES[Math.floor(Math.random() * FLEE_LINES.length)]!, 'speech', 1.5);
          }
        }
        // 狼から離れる方向に移動（1.3 倍速）
        const fdx = c.pos.x - nearestWolf.pos.x;
        const fdy = c.pos.y - nearestWolf.pos.y;
        const fLen = Math.max(0.001, Math.hypot(fdx, fdy));
        const fleeSpeed = c.speed * 1.3;

        // sanctuary がある方向は優先して逃げ込む
        let sx = fdx / fLen, sy = fdy / fLen;
        for (const f of w.features) {
          if (f.kind !== 'house' && f.kind !== 'firewatch') continue;
          const sd = Math.hypot(f.pos.x - c.pos.x, f.pos.y - c.pos.y);
          if (sd < 200) {
            sx = (f.pos.x - c.pos.x) / Math.max(1, sd);
            sy = (f.pos.y - c.pos.y) / Math.max(1, sd);
            c.target = { x: f.pos.x, y: f.pos.y };
            break;
          }
        }

        c.pos.x += sx * fleeSpeed * dt;
        c.pos.y += sy * fleeSpeed * dt;
        c.faceLeft = sx < 0;
        c.fatigue = Math.min(100, c.fatigue + dt * 18);  // 全力疾走で疲労 +18/sec

        // 疲労 >= 60 で collapse → fled_to_exhaustion
        if (c.fatigue >= 60) {
          setState(c, 'exhausted', 2.0);
          pushLife(c, Math.floor(c.ageSec), '狼に追われて走り疲れた');
          // 近くに狼がいてかつ fatigue 高すぎ → 食われる
          if (nearestWolfDist < 60 && Math.random() < 0.65) {
            spawnBubble(w.bubbles, c.pos, 'もう……だめ……わふ', 'speech', 1.8);
            kill(w, c, 'fled_to_exhaustion');
            return;
          }
        }
      }
    } else if (c.state === 'scared') {
      // 狼が去ったら idle に戻る
      setState(c, 'idle', 0.3);
    }
  }

  // 移動（止まってるステート中は動かない）
  if (c.state === 'idle' || c.state === 'surprised' || c.state === 'angry') {
    const cocoon = w.npcs.find((n) => n.id === 'cocoon');
    const env = getWanderEnv(w);
    const announcementKey = wanderStep(c, dt, w.bounds, {
      season: w.season,
      furana: w.furanaPos,
      cocoonPos: cocoon ? cocoon.pos : null,
      noukouPositions: env.noukouPositions,
      taikoPositions: env.taikoPositions,
      obstaclePositions: env.obstaclePositions,
      farmPositions: env.farmPositions,
      terraformJobPositions: env.terraformJobPositions,
      priorityTerraformJobPositions: env.priorityTerraformJobPositions,
      constructionPositions: env.constructionPositions,
      priorityConstructionPositions: env.priorityConstructionPositions,
      terrain: w.terrain,
    });
    // 40% で行動予告（毎回だと説明口調になるので抑制）
    if (announcementKey && Math.random() < 0.4) {
      const line = pickActionAnnounce(announcementKey);
      if (line) spawnBubble(w.bubbles, c.pos, line, 'speech', 1.3);
    }

    // Σ-1-b 坂勾配ペナルティ：進行方向 20px 先との標高差でチェック
    // 勾配 > 0.3 → 速度半減 + fatigue、> 0.6 → courage 判定で滑落
    if (c.target && !c.flight) {
      const tdx = c.target.x - c.pos.x;
      const tdy = c.target.y - c.pos.y;
      const tLen = Math.max(1, Math.hypot(tdx, tdy));
      const nx = tdx / tLen;
      const ny = tdy / tLen;
      const curElev = getElevation(c.pos.x, c.pos.y);
      const fwdElev = getElevation(c.pos.x + nx * 20, c.pos.y + ny * 20);
      const slope = Math.abs((fwdElev - curElev) / 20);

      if (slope > 0.3) {
        // 急坂：このティックの移動量の半分を戻す（実質 0.5× 速度）
        c.pos.x -= nx * c.speed * dt * 0.5;
        c.pos.y -= ny * c.speed * dt * 0.5;
        c.fatigue = Math.min(100, c.fatigue + dt * 1.5);
      }
      if (slope > 0.6 && !c.flight && Math.random() < dt * 0.008) {
        // 急坂から滑落：courage チェック、失敗したら下方向に launchFlight
        if (Math.random() > c.params.courage / 100) {
          const gx = getElevation(c.pos.x + 5, c.pos.y) - getElevation(c.pos.x - 5, c.pos.y);
          const gy = getElevation(c.pos.x, c.pos.y + 5) - getElevation(c.pos.x, c.pos.y - 5);
          const gLen = Math.max(0.001, Math.hypot(gx, gy));
          const slideSpeed = 70 + Math.random() * 50;
          spawnBubble(w.bubbles, c.pos, 'すべるわふーっ！', 'speech', 1.5);
          pushLife(c, Math.floor(c.ageSec), '急坂で足を滑らせて滑落した');
          setState(c, 'surprised', 0.9);
          launchFlight(c, -gx / gLen * slideSpeed, -gy / gLen * slideSpeed, 0.7, 5, 'slope_fall');
        }
      }
    }
  }
  // Σ-1-c 激流もがき：flow > 1.5 の water/channel 上にいると流される
  // 川に流されながら courage+tough で必死に岸へ向かうが、失敗すると HP ドレイン →溺死
  if (!c.flight && isAlive(c) && c.state !== 'sleep' && c.state !== 'eating') {
    for (const feat of w.features) {
      if (feat.kind !== 'water' && feat.kind !== 'channel') continue;
      const fflow = feat.flow ?? 0;
      if (fflow <= 1.5) continue;
      if (Math.hypot(c.pos.x - feat.pos.x, c.pos.y - feat.pos.y) > 28) continue;

      // 流れ方向：水路 feature 地点の標高勾配の下り方向
      const gx = getElevation(feat.pos.x + 5, feat.pos.y) - getElevation(feat.pos.x - 5, feat.pos.y);
      const gy = getElevation(feat.pos.x, feat.pos.y + 5) - getElevation(feat.pos.x, feat.pos.y - 5);
      const gLen = Math.max(0.001, Math.hypot(gx, gy));
      const strength = Math.min(1.5, (fflow - 1.5) / 2.0); // 流量超過分を 0〜1.5 にスケール

      // 下流方向へ押し流す
      c.pos.x += (-gx / gLen) * 20 * strength * dt;
      c.pos.y += (-gy / gLen) * 20 * strength * dt;

      // もがき抵抗：courage + tough の合計が高いほど耐える
      const resistChance = (c.params.courage + c.params.tough) / 200;
      if (Math.random() > resistChance) {
        c.hp = Math.max(0, c.hp - 0.35 * (1 + strength) * dt);
        if (c.hp <= 0) {
          spawnBubble(w.bubbles, c.pos, 'たすけ…わふ……', 'speech', 2.0);
          pushLife(c, Math.floor(c.ageSec), `増水した水路の激流に飲まれた（flow:${fflow.toFixed(1)}）`);
          kill(w, c, 'river_swept');
          return;
        }
      }

      // 崖端判定：流れ方向 15px 先が 20+ 急落なら滝落下（cliff_fall）
      const downX = -gx / gLen;
      const downY = -gy / gLen;
      const curElev = getElevation(c.pos.x, c.pos.y);
      const aheadElev = getElevation(c.pos.x + downX * 15, c.pos.y + downY * 15);
      if (curElev - aheadElev >= 20) {
        spawnBubble(w.bubbles, c.pos, 'たきわふっ！！', 'speech', 1.5);
        pushLife(c, Math.floor(c.ageSec), '激流に押されて崖から落下した');
        launchFlight(c, downX * 80, downY * 80, 0.8, 0, 'cliff_fall');
      }
      break; // 1 feature で処理完了
    }
  }
  runHazards(w, c, dt, hazards);
}

// 屁・しゃっくり・よだれ等の粗相 → 理不尽ボコ。
// 近くに誰かいると 35% で発動、そのうち 30% で死亡（rifujin_boko）。
// "なぜか殴られた"が画面で読めるよう、両者に理由バブル + lifeLog を残す。
// Σ-7-f おしっこ／うんこもらし → 棒でボコ。
// bo_suki/ikusa 持ちを優先攻撃者に選ぶ（60%）。ココン参戦、フラナ叱り、目撃者ドン引き。
// kill 確率は理不尽ボコ（30%）より低めの 10%。
const MORASHI_PUNISH_CHANCE = 0.35;
const MORASHI_KILL_CHANCE = 0.10;
function maybePunishMorashi(w: WorldState, victim: Chibiwafu, flavor: string) {
  if (Math.random() > MORASHI_PUNISH_CHANCE) return;
  // 新生児（ageSec<5）は対象外（誕生直後にボコられないように）
  if (victim.ageSec < 5) return;
  const nearby = w.chibis.filter((o) => o !== victim && isAlive(o)
    && o.ageSec >= 5 && distance(o.pos, victim.pos) < 60);
  if (nearby.length === 0) return;

  // bo_suki/ikusa を 60% で優先選択
  const aggressive = nearby.filter((o) => o.traits.includes('bo_suki') || o.traits.includes('ikusa'));
  const striker = aggressive.length > 0 && Math.random() < 0.6
    ? aggressive[Math.floor(Math.random() * aggressive.length)]!
    : nearby[Math.floor(Math.random() * nearby.length)]!;

  const selfLine = flavor === 'おしっこもらし' ? pickPeeMorashiLine() : pickPoopMorashiLine();
  spawnBubble(w.bubbles, victim.pos, selfLine, 'speech', 1.3);
  spawnBubble(w.bubbles, striker.pos, pickBokoAttackerLine(), 'speech', 1.5);
  setState(victim, 'hurt', 1.5);
  setState(striker, 'angry', 1.0);
  pushLife(victim, Math.floor(victim.ageSec), `${flavor}で ${striker.name} にボコボコにされた`);
  pushLife(striker, Math.floor(striker.ageSec), `${victim.name} が${flavor}をやっていたのでボコった`);

  // ココン 70% で参加（120px 以内）
  const cocoon = w.npcs.find((n) => n.id === 'cocoon');
  if (cocoon && !cocoon.dead && distance(cocoon.pos, victim.pos) < 120 && Math.random() < 0.7) {
    spawnBubble(w.bubbles, cocoon.pos, pickCocoonBokoLine(), 'npc-speech', 1.5);
    cocoon.mood = Math.min(100, (cocoon.mood ?? 50) + 8);
  }

  // フラナ 50% で叱る（120px 以内）
  const furana = w.npcs.find((n) => n.id === 'furana');
  if (furana && !furana.dead && distance(furana.pos, victim.pos) < 120 && Math.random() < 0.5) {
    spawnBubble(w.bubbles, furana.pos, pickFuranaScoldLine(), 'npc-speech', 1.5);
  }

  // 目撃者の 1 体がドン引き（60%）
  const witnesses = nearby.filter((o) => o !== striker);
  if (witnesses.length > 0 && Math.random() < 0.6) {
    const wit = witnesses[Math.floor(Math.random() * witnesses.length)]!;
    spawnBubble(w.bubbles, wit.pos, pickBokoWitnessLine(), 'speech', 1.2);
  }

  if (Math.random() < MORASHI_KILL_CHANCE) {
    kill(w, victim, 'rifujin_boko');
  }
}

const RIFUJIN_PUNISH_CHANCE = 0.35;
const RIFUJIN_KILL_CHANCE = 0.30;
function maybePunishRifujin(w: WorldState, victim: Chibiwafu, flavor: string) {
  if (Math.random() > RIFUJIN_PUNISH_CHANCE) return;
  const nearby = w.chibis.filter((o) => o !== victim && isAlive(o) && distance(o.pos, victim.pos) < 55);
  if (nearby.length === 0) return;
  const striker = nearby[Math.floor(Math.random() * nearby.length)]!;
  spawnBubble(w.bubbles, striker.pos, pickRifujinStrikerLine(), 'speech', 1.5);
  spawnBubble(w.bubbles, victim.pos, pickRifujinVictimLine(), 'speech', 1.3);
  setState(victim, 'hurt', 1.2);
  setState(striker, 'angry', 0.8);
  pushLife(victim, Math.floor(victim.ageSec), `${flavor}で ${striker.name} に理不尽に殴られた`);
  pushLife(striker, Math.floor(striker.ageSec), `${victim.name} が${flavor}をやっていたので殴った`);
  if (Math.random() < RIFUJIN_KILL_CHANCE) {
    kill(w, victim, 'rifujin_boko');
  }
}

// 感情伝染：idle なちびわふが近くの子の状態を見て反応する。
// ～1秒に 1回前後のペースで発火するよう、per-tick 確率を抑え目に設定。
function emergentPeerReactions(w: WorldState, c: Chibiwafu) {
  if (c.state !== 'idle') return;
  if (c.chatCooldown > 0) return;          // おしゃべり CD を共有
  if (Math.random() > 0.004) return;        // 50秒に 1回程度（per chibi）
  // 45px 以内で "反応したくなる" ステートの子を探す
  const targets = w.chibiHash.nearby(c.pos, 45, c).filter(
    (o) => distance(o.pos, c.pos) < 45
      && (o.state === 'cry' || o.state === 'eating' || o.state === 'sleep' || o.state === 'angry'),
  );
  if (targets.length === 0) return;
  const t = targets[Math.floor(Math.random() * targets.length)]!;

  if (t.state === 'cry') {
    // 40% 慰め / 60% もらい泣き
    if (Math.random() < 0.4) {
      spawnBubble(w.bubbles, c.pos, pickComfortLine(), 'speech', 1.4);
      pushLife(c, Math.floor(c.ageSec), `${t.name} を慰めた`);
    } else {
      setState(c, 'cry', 1.2);
      spawnBubble(w.bubbles, c.pos, pickCopyCryLine(), 'speech', 1.3);
      pushLife(c, Math.floor(c.ageSec), `${t.name} につられて泣いた`);
    }
  } else if (t.state === 'eating') {
    spawnBubble(w.bubbles, c.pos, pickBegFoodLine(), 'speech', 1.3);
    pushLife(c, Math.floor(c.ageSec), `${t.name} の食事をねだった`);
  } else if (t.state === 'sleep') {
    // 25% で自分もあくび（dazed 短時間）
    spawnBubble(w.bubbles, c.pos, pickSleepyContagionLine(), 'speech', 1.3);
    if (Math.random() < 0.25) setState(c, 'dazed', 1);
  } else if (t.state === 'angry') {
    // 怒ってる子を見て怯える
    spawnBubble(w.bubbles, c.pos, pickAngryBystanderLine(), 'speech', 1.3);
    setState(c, 'dazed', 0.8);
  }
  c.chatCooldown = 4 + Math.random() * 3;
}

// "悪い死に方" 一覧：この causeId で死んだ子には周囲が "ざまあみろ" と言いがち
const SCHADENFREUDE_CAUSES = new Set<DeathCauseId>([
  'namaiki_boko',      // 生意気言ってボコられた
  'rifujin_boko',      // 粗相で理不尽に殴られた（でもこれは気の毒？一応混ぜる）
  'bo_meijin_tenka',   // 棒名人が巻き添え→自業自得
  'kamisama_punch',    // 神様にボコられた（子どもの野次的）
  'cocoon_abuse',      // ココンに叩き殺された
]);

// 悪い死に方をした子の近くにいるちびわふが、まれに野次を飛ばす
function chibiSchadenfreude(w: WorldState, victim: Chibiwafu) {
  if (victim.deathCauseId == null || !SCHADENFREUDE_CAUSES.has(victim.deathCauseId as DeathCauseId)) return;
  // hash からの近傍候補で idle な子を拾う（死の瞬間はまだ hash に victim が居る可能性あり）
  const witnesses = w.chibiHash.nearby(victim.pos, 70, victim).filter(
    (o) => isAlive(o) && distance(o.pos, victim.pos) < 70 && o.state === 'idle',
  );
  if (witnesses.length === 0) return;
  // 1人だけランダムに選び 12% の確率で野次
  const w1 = witnesses[Math.floor(Math.random() * witnesses.length)]!;
  if (Math.random() > 0.12) return;
  spawnBubble(w.bubbles, w1.pos, pickSchadenfreudeLine(), 'speech', 1.6);
  pushLife(w1, Math.floor(w1.ageSec), `${victim.name} の死を笑った`);
}

// 生意気セリフが出ると"たまに"ボコられる。毎回ではない。
// PUNISH_CHANCE: 近くに誰かいても無視される確率が大半。
// ボコ確定した時は 35% で死亡（namaiki_boko）。
const PUNISH_CHANCE = 0.25;
function maybePunishCheeky(w: WorldState, victim: Chibiwafu) {
  if (Math.random() > PUNISH_CHANCE) return;
  const nearby = w.chibis.filter((o) => o !== victim && isAlive(o) && distance(o.pos, victim.pos) < 60);
  if (nearby.length === 0) return;
  const striker = nearby[Math.floor(Math.random() * nearby.length)]!;
  spawnBubble(w.bubbles, striker.pos, pickStrikerLine(), 'speech', 1.5);
  spawnBubble(w.bubbles, victim.pos, pickVictimHurtLine(), 'speech', 1);
  setState(victim, 'hurt', 1.2);
  setState(striker, 'angry', 0.8);
  pushLife(victim, Math.floor(victim.ageSec), `自慢して ${striker.name} に殴られた`);
  pushLife(striker, Math.floor(striker.ageSec), `自慢屋の ${victim.name} を殴った`);
  if (Math.random() < 0.35) {
    kill(w, victim, 'namaiki_boko');
  }
}

// 立ち話：近接2体をO(n²)で検査（人口数十までは無視できるコスト）
function processChats(w: WorldState, dt: number) {
  // 空間分割ハッシュで各 a に対し近傍 b のみ試す（O(n²) → O(n*k)）
  const seenPair = new Set<number>();  // chibi id を 1 度 chat したら除外
  for (let i = 0; i < w.chibis.length; i++) {
    const a = w.chibis[i]!;
    if (!isAlive(a) || a.state === 'chatting' || a.chatCooldown > 0) continue;
    if (seenPair.has(a.id)) continue;
    const candidates = w.chibiHash.nearby(a.pos, 70, a);
    for (const b of candidates) {
      if (!isAlive(b) || b.state === 'chatting' || b.chatCooldown > 0) continue;
      if (b.id <= a.id) continue;  // 二重処理防止（元の j>i と同等）
      if (seenPair.has(b.id)) continue;
      if (distance(a.pos, b.pos) > 70) continue;
      const chat = maybeStartChat(a, b);
      if (!chat) continue;
      // 両者を chatting 状態に、向き合わせる、吹き出しを出す
      setState(a, 'chatting', chat.duration);
      setState(b, 'chatting', chat.duration);
      a.chatCooldown = 8 + Math.random() * 6;
      b.chatCooldown = 8 + Math.random() * 6;
      a.faceLeft = b.pos.x < a.pos.x;
      b.faceLeft = a.pos.x < b.pos.x;
      // A が先に喋る（長めTTL）。B は少し遅れて喋る（短めTTL＋位置が動いてないので即座に表示OK）
      spawnBubble(w.bubbles, a.pos, chat.lineA.text, 'speech', chat.duration * 0.6);
      spawnBubble(w.bubbles, { x: b.pos.x, y: b.pos.y + 6 }, chat.lineB.text, 'speech', chat.duration * 0.4);
      pushLife(a, Math.floor(a.ageSec), `${b.name} と話した`);
      pushLife(b, Math.floor(b.ageSec), `${a.name} と話した`);
      a.chatCooldown = derivedChatCooldown(a.params);
      b.chatCooldown = derivedChatCooldown(b.params);
      // 生意気セリフは報復対象
      if (chat.lineA.cheeky) maybePunishCheeky(w, a);
      if (chat.lineB.cheeky) maybePunishCheeky(w, b);
      seenPair.add(a.id); seenPair.add(b.id);
      break; // a は1人と話せば十分
    }
  }
  // NPC とちびわふの会話：フラナ/スズ/ココン が 40px 以内の idle な子に話しかける
  for (const n of w.npcs) {
    if (n.dead) continue;
    if (n.id === 'lou') continue; // ルーは無口
    if (Math.random() > 0.004) continue; // per-tick 発火率
    const nearChibis = w.chibiHash.nearby(n.pos, 50);
    const partner = nearChibis.find(
      (c) => isAlive(c) && c.state === 'idle' && c.chatCooldown <= 0 && distance(c.pos, n.pos) < 50,
    );
    if (!partner) continue;
    // フラナは機嫌で話しかけ内容が変わる
    const furanaAngry = n.id === 'furana' && n.mood < 45;
    const npcPool = n.id === 'furana'
        ? (furanaAngry ? FURANA_LINES_CHAT_ANGRY : FURANA_LINES_CHAT)
      : n.id === 'suzu' ? SUZU_LINES_CHAT
      : COCOON_LINES_CHAT;
    const chibiPool = n.id === 'furana'
        ? (furanaAngry ? CHIBI_TO_FURANA_SCARED_LINES : CHIBI_TO_FURANA_LINES)
      : n.id === 'suzu' ? CHIBI_TO_SUZU_LINES
      : CHIBI_TO_COCOON_LINES;
    const duration = 2.2 + Math.random() * 1.2;
    setState(partner, 'chatting', duration);
    partner.chatCooldown = 8 + Math.random() * 6;
    partner.faceLeft = n.pos.x < partner.pos.x;
    spawnBubble(w.bubbles, n.pos, pickLine(npcPool), 'npc-speech', duration * 0.6);
    spawnBubble(w.bubbles, { x: partner.pos.x, y: partner.pos.y + 6 }, pickLine(chibiPool), 'speech', duration * 0.4);
    pushLife(partner, Math.floor(partner.ageSec), `${NPC_DEFS[n.id].name} と話した`);
    // ココンに話しかけられた場合、たまにそのまま殴られる流れに（50%）
    if (n.id === 'cocoon' && Math.random() < 0.5) {
      setState(partner, 'hurt', 1);
      spawnBubble(w.bubbles, partner.pos, 'いたわふ！', 'speech', 1);
      pushLife(partner, Math.floor(partner.ageSec), 'ココンに殴られた（会話中）');
    }
  }
  // 雑に dt を使った減衰は updateChibi 側で実施済み
  void dt;
}

function compactCorpses(w: WorldState) {
  const newlyDead = w.chibis.filter((c) => c.state === 'dead');
  if (newlyDead.length > 0) {
    w.corpses.push(...newlyDead);
    w.chibis = w.chibis.filter((c) => c.state !== 'dead');
    while (w.corpses.length > w.maxCorpses) w.corpses.shift();
  }
}

// --- NPC reactions --------------------------------------------------------

function updateNpcs(w: WorldState, dt: number) {
  for (const n of w.npcs) {
    // 飛行中は物理だけ動かして normal updates はスキップ
    if (n.flight) {
      flightStep(w, n, false, dt);
      continue;
    }
    if (n.dead) {
      n.state = 'dead';
      // respawnSec が Infinity のNPC（フラナ）は復活しない
      if (Number.isFinite(n.respawnTimer)) {
        n.respawnTimer -= dt;
        if (n.respawnTimer <= 0) {
          n.dead = false;
          n.hp = n.maxHp;
          n.state = 'idle';
          n.stateTimer = 0;
          n.pos = { ...n.home };
          n.abuseCooldown = 4;
          pushNpcLife(n, Math.floor(w.timeSec), 'なぜか蘇った');
          spawnBubble(w.bubbles, n.pos, pickLine(reviveLinesFor(n.id)), 'npc-speech', 2.5);
        }
      }
      continue;
    }
    // ステート timer を減らして、切れたら idle に戻す（dead は上でキープ）
    if (n.state !== 'idle') {
      n.stateTimer -= dt;
      if (n.stateTimer <= 0) { n.state = 'idle'; n.stateTimer = 0; }
    }
    // 夜は NPC 全員基本寝る（深夜徘徊はフラナの機嫌悪時のみ例外）
    if (w.dayPhase === 'night' && n.state === 'idle') {
      const furanaAngry = n.id === 'furana' && n.mood < 25;
      if (!furanaAngry) {
        n.state = 'sleep';
        n.stateTimer = 10 + Math.random() * 8;
        n.target = null;
        continue;
      }
    }
    // 寝てる間は移動処理をスキップ
    if (n.state === 'sleep') continue;
    if (n.id === 'furana') {
      updateFuranaMovement(w, n, dt);
      updateFuranaBehavior(w, n, dt);
    } else {
      wanderNpc(n, dt);
      if (n.id === 'cocoon') updateCocoonAbuse(w, n, dt);
      if (n.id === 'lou' && Math.random() < 0.0007) {
        spawnBubble(w.bubbles, n.pos, pickLine(LOU_LINES), 'npc-speech', 1.6);
      }
    }
  }
  // world.furanaPos は後方互換のため npc フラナの pos を常にミラーする
  const furana = w.npcs.find((n) => n.id === 'furana');
  if (furana && !furana.dead) w.furanaPos = { ...furana.pos };
}

// フラナの意思的移動：目的地を決め、徐々に歩く（テレポートしない）。
// 機嫌悪い時は近くのちびわふに向かって積極的に突進する。
function updateFuranaMovement(w: WorldState, n: NpcState, dt: number) {
  // 機嫌悪い時は速度 1.6 倍（怒りの突進）
  const currentSpeed = n.mood < 35 ? n.speed * 1.6 : n.speed;
  // 目的地に近づいてきたら到着扱い
  if (n.target && distance(n.pos, n.target) < 6) {
    n.target = null;
  }
  if (n.target == null) {
    n.wanderTimer -= dt;
    if (n.wanderTimer > 0) return;
    // 機嫌悪いほど次の目的地を早く決める（突進モード）
    n.wanderTimer = n.mood < 35 ? 0.3 + Math.random() * 0.4 : 0.8 + Math.random() * 1.2;
    n.target = pickFuranaTarget(w, n);
  }
  // 目的地に向かってじわじわ歩く
  if (n.target) {
    const dx = n.target.x - n.pos.x;
    const dy = n.target.y - n.pos.y;
    const d = Math.max(0.001, Math.hypot(dx, dy));
    n.pos.x += (dx / d) * currentSpeed * dt;
    n.pos.y += (dy / d) * currentSpeed * dt;
    n.faceLeft = dx < 0;
  }
}

function pickFuranaTarget(w: WorldState, n: NpcState): Vec2 {
  // 機嫌悪い時（<35）は、画面中どこでも最寄りのちびわふに突進（ロックオン）
  if (n.mood < 35) {
    const chibis = w.chibis.filter((c) => isAlive(c));
    if (chibis.length > 0) {
      let nearest: Chibiwafu | undefined;
      let bestD = Infinity;
      for (const c of chibis) {
        const d = distance(c.pos, n.pos);
        if (d < bestD) { nearest = c; bestD = d; }
      }
      if (nearest) {
        return {
          x: nearest.pos.x + (Math.random() - 0.5) * 12,
          y: nearest.pos.y + (Math.random() - 0.5) * 10,
        };
      }
    }
  }
  const roll = Math.random();
  // 40% ちびわふ集団へ（最寄りの子の近く）
  if (roll < 0.4) {
    const chibis = w.chibis.filter((c) => isAlive(c));
    if (chibis.length > 0) {
      let nearest: Chibiwafu | undefined;
      let bestD = Infinity;
      for (const c of chibis) {
        const d = distance(c.pos, n.pos);
        if (d < bestD) { nearest = c; bestD = d; }
      }
      if (nearest) {
        return {
          x: nearest.pos.x + (Math.random() - 0.5) * 40,
          y: nearest.pos.y + (Math.random() - 0.5) * 30,
        };
      }
    }
  }
  // 20% スズの所へ
  if (roll < 0.6) {
    const suzu = w.npcs.find((x) => x.id === 'suzu' && !x.dead);
    if (suzu) return { x: suzu.pos.x + (Math.random() - 0.5) * 40, y: suzu.pos.y + (Math.random() - 0.5) * 30 };
  }
  // 15% ココンの様子見
  if (roll < 0.75) {
    const cocoon = w.npcs.find((x) => x.id === 'cocoon' && !x.dead);
    if (cocoon) return { x: cocoon.pos.x + (Math.random() - 0.5) * 40, y: cocoon.pos.y + (Math.random() - 0.5) * 30 };
  }
  // 残り 25%：自宅付近ランダム（range 120）
  return {
    x: n.home.x + (Math.random() - 0.5) * 120,
    y: n.home.y + (Math.random() - 0.5) * 120,
  };
}

// フラナの挙動：通常は "めっ" と優しく叱る / まれにイライラして本気で殴る。
// たまに独り言。ちびわふの多数派 mama param が高い個体はすでに自然に集まってくる。
// 近くに密集してるほど（まとわりつき過多）イライラ率が上がる。
function updateFuranaBehavior(w: WorldState, n: NpcState, dt: number) {
  n.abuseCooldown -= dt;
  // HP 自然回復：hurt 以外の時 +1 HP / 秒（maxHp を上限）。
  if (n.state !== 'hurt' && n.hp < n.maxHp) {
    n.hp = Math.min(n.maxHp, n.hp + dt * 1);
  }
  // 機嫌が 70（平常値）に向けて自然に戻る（10秒で 0.5 程度）
  const drift = (70 - n.mood) * 0.003 * dt * 20;  // dt*20 で tick 補正
  n.mood += drift;
  // 近くのちびわふが多すぎると徐々に不機嫌（まとわりつき疲れ）
  const nearbyChibis = w.chibis.filter((c) => isAlive(c) && distance(c.pos, n.pos) < 60);
  if (nearbyChibis.length >= 5) n.mood -= dt * 0.3 * (nearbyChibis.length - 4);
  // 近くで平和に食べてる／寝てる子がいると和む（+0.15 / 秒 per 子）
  const peaceful = nearbyChibis.filter((c) => c.state === 'eating' || c.state === 'sleep').length;
  if (peaceful > 0) n.mood += dt * 0.15 * peaceful;
  n.mood = Math.max(0, Math.min(100, n.mood));

  // 独り言：機嫌で使い分け（8秒に 1回くらい）
  if (Math.random() < 0.005) {
    const pool = n.mood >= 70 ? FURANA_LINES_HAPPY
      : n.mood < 30 ? FURANA_LINES_HATE
      : FURANA_LINES_IDLE;
    spawnBubble(w.bubbles, n.pos, pickLine(pool), 'npc-speech', 2);
  }
  if (n.abuseCooldown > 0) return;
  // 攻撃候補（70px 以内）は空間分割で絞る。フラナの "最寄りを追う" 移動は
  // pickFuranaTarget が全走査で行うので、遠くの子へも向かって行ける。
  // Σ-6-x: 新生児保護（ageSec < 5）→ 生まれた瞬間にぶん投げられて即死を防ぐ
  const candidates = w.chibiHash.nearby(n.pos, 70)
    .filter((c) => distance(c.pos, n.pos) < 70 && c.ageSec >= 5);
  if (candidates.length === 0) {
    n.abuseCooldown = 2 + Math.random() * 2;
    return;
  }
  // 機嫌悪いほど連続攻撃の間隔が短い
  n.abuseCooldown = n.mood < 25 ? 1.5 + Math.random() * 1.5
    : n.mood < 45 ? 2.5 + Math.random() * 2.5
    : 4 + Math.random() * 5;

  // 発動率：機嫌悪いほど行動したがる（unhappy = キレやすい）
  //   mood 90→0.2  (ごきげんで手を出さない)
  //   mood 70→0.35 (平常)
  //   mood 30→0.7  (イライラでちょくちょく手を出す)
  //   mood 0 →0.95 (常に手が出る)
  let triggerChance = 0.35 + (60 - n.mood) * 0.01;
  triggerChance = Math.max(0.1, Math.min(0.95, triggerChance));
  if (Math.random() > triggerChance) return;

  // ターゲット数：機嫌悪いほど "手当たり次第" になる。
  //   mood >= 60 → 1 人
  //   mood 35-59 → 1-2 人
  //   mood 15-34 → 2-3 人
  //   mood < 15  → 3-4 人（暴走）
  let maxTargets: number;
  if (n.mood >= 60) maxTargets = 1;
  else if (n.mood >= 35) maxTargets = 1 + (Math.random() < 0.5 ? 1 : 0);
  else if (n.mood >= 15) maxTargets = 2 + (Math.random() < 0.5 ? 1 : 0);
  else maxTargets = 3 + (Math.random() < 0.5 ? 1 : 0);
  maxTargets = Math.min(maxTargets, candidates.length);

  // ターゲット選択
  //   機嫌悪い (<45)：距離が近い子から順に狙う（手当たり次第パニック）
  //   機嫌良い時：mama 高い子ほど狙われやすい
  const pool = candidates.slice();
  const targets: Chibiwafu[] = [];
  if (n.mood < 45) {
    pool.sort((a, b) => distance(a.pos, n.pos) - distance(b.pos, n.pos));
    for (let k = 0; k < maxTargets && k < pool.length; k++) {
      targets.push(pool[k]!);
    }
  } else {
    const weights = pool.map((c) => 1 + Math.max(0, c.params.mama - 50) * 0.03);
    for (let k = 0; k < maxTargets; k++) {
      if (pool.length === 0) break;
      const total = weights.reduce((a, b) => a + b, 0);
      let roll = Math.random() * total;
      let idx = 0;
      for (let i = 0; i < pool.length; i++) {
        roll -= weights[i]!;
        if (roll < 0) { idx = i; break; }
      }
      targets.push(pool[idx]!);
      pool.splice(idx, 1);
      weights.splice(idx, 1);
    }
  }
  if (targets.length === 0) return;

  // 機嫌に応じて撫で／殴り／ぶん投げの比率を変える（撫では機嫌良い時のみ）
  let punchR: number, throwR: number;
  if (n.mood >= 70)      { punchR = 0.15; throwR = 0.05; }
  else if (n.mood >= 45) { punchR = 0.40; throwR = 0.15; }
  else if (n.mood >= 25) { punchR = 0.52; throwR = 0.40; }
  else                   { punchR = 0.40; throwR = 0.60; }

  // 各ターゲットに対して行動を決めて実行
  for (const target of targets) {
    if (!isAlive(target)) continue;
    applyFuranaActionTo(w, n, target, punchR, throwR);
  }
}

// 1人のちびわふに対するフラナの行動実行（pat/punch/throw）
function applyFuranaActionTo(w: WorldState, n: NpcState, target: Chibiwafu, punchR: number, throwR: number) {
  const action = Math.random();

  if (action < throwR) {
    // ぶん投げ：遠くへぶっ飛ばす（250-450px）。50% 川へ / 50% ランダム遠投
    n.state = 'angry';
    n.stateTimer = 1.8;
    spawnBubble(w.bubbles, n.pos, pickLine(FURANA_LINES_THROW), 'npc-speech', 1.8);
    spawnBubble(w.bubbles, { x: n.pos.x, y: n.pos.y - 20 }, '💨', 'stomp', 0.7);
    pushNpcLife(n, Math.floor(w.timeSec), `${target.name} をぶん投げた（機嫌${Math.round(n.mood)}）`);

    const startPos = { x: target.pos.x, y: target.pos.y };
    // 目的地：50% 水辺へ / 50% ランダム遠投
    // 水辺: フラナから離れた方向に向かって海タイルが最初に現れる座標を探す
    let landX: number, landY: number;
    if (Math.random() < 0.5) {
      const dir = target.pos.x < w.bounds.w / 2 ? 1 : -1;
      landX = Math.max(40, Math.min(w.bounds.w - 40, target.pos.x + dir * (250 + Math.random() * 150)));
      // 海マスクで水辺を探す（最大 bounds.h まで走査）
      let waterY = w.bounds.h * 0.75;
      for (let sy = Math.round(target.pos.y); sy < w.bounds.h - 20; sy += 16) {
        if (isSeaAt(landX, sy)) { waterY = sy + 16; break; }
      }
      landY = waterY + Math.random() * 40;
      pushLife(target, Math.floor(target.ageSec), 'フラナに海へぶん投げられた');
    } else {
      const ang = Math.random() * Math.PI * 2;
      const dist = 280 + Math.random() * 170;
      landX = Math.max(40, Math.min(w.bounds.w - 40, target.pos.x + Math.cos(ang) * dist));
      landY = Math.max(40, Math.min(w.bounds.h - 20, target.pos.y + Math.sin(ang) * dist));
      pushLife(target, Math.floor(target.ageSec), 'フラナにぶん投げられた');
    }
    target.target = null;
    // 発射点のエフェクト
    spawnBubble(w.bubbles, startPos, '💫', 'stomp', 0.6);
    spawnBubble(w.bubbles, target.pos, 'とんでるわふ〜！', 'speech', 1);
    // 飛行起動：飛行時間は固定 0.55 秒、距離から速度が直接決まる。
    // これで遠くに投げるほど同じ時間内により速く飛ぶ（見た目にも迫力）
    const flightSec = 0.55;
    const vx = (landX - startPos.x) / flightSec;
    const vy = (landY - startPos.y) / flightSec - 90 * flightSec;  // 軽い弧
    const throwDmg = n.mood < 25 ? 10 + Math.floor(Math.random() * 10) : 4 + Math.floor(Math.random() * 6);
    setState(target, 'surprised', flightSec + 0.3);
    launchFlight(target, vx, vy, flightSec, throwDmg, 'cocoon_abuse');
    return;
  }

  if (action < throwR + punchR) {
    // パンチ／キック。機嫌低いほど痛い。
    n.state = 'angry';
    n.stateTimer = 1.5;
    spawnBubble(w.bubbles, n.pos, pickLine(FURANA_LINES_ANGRY), 'npc-speech', 1.8);
    // dmg 基本 6-14、mood が 40 以下なら +4〜+8（本気ブチギレ）
    let dmg = 6 + Math.floor(Math.random() * 9);
    if (n.mood < 40) dmg += 4 + Math.floor(Math.random() * 5);
    setState(target, 'hurt', 1.3);
    spawnBubble(w.bubbles, target.pos, 'ぎゃーわふ！', 'speech', 1.2);
    pushLife(target, Math.floor(target.ageSec), `フラナ(機嫌${Math.round(n.mood)})に殴られた`);
    pushNpcLife(n, Math.floor(w.timeSec), `${target.name} を殴った（機嫌${Math.round(n.mood)}）`);
    damageChibi(w, target, dmg, 'cocoon_abuse');
    return;
  }

  // 撫で（soft "めっ"）。機嫌良い時しかやらない。
  spawnBubble(w.bubbles, n.pos, pickLine(FURANA_LINES_PAT), 'npc-speech', 1.6);
  setState(target, 'hurt', 0.8);
  spawnBubble(w.bubbles, target.pos, 'きゃんわふ！', 'speech', 1.1);
  pushLife(target, Math.floor(target.ageSec), 'フラナにめっされた');
  pushNpcLife(n, Math.floor(w.timeSec), `${target.name} をめっした`);
}

// イベント発生時にフラナの機嫌を下げる
function dampenFuranaMood(w: WorldState, amount: number) {
  const f = w.npcs.find((n) => n.id === 'furana');
  if (f) f.mood = Math.max(0, f.mood - amount);
}

// フラナが死ぬとちびわふ界は地獄。出産停止＋パニック継続。
export function isFuranaAlive(w: WorldState): boolean {
  const f = w.npcs.find((n) => n.id === 'furana');
  return !!f && !f.dead;
}

// フラナがプレイヤーに掴まれて動いてる間、mama 高めの子が全力で追いかける。
// tickWorld で furanaGrabbedTimer が >0 の時に呼ばれる。
function applyFuranaChaseBehavior(w: WorldState) {
  const furana = w.npcs.find((n) => n.id === 'furana');
  if (!furana || furana.dead) return;
  for (const c of w.chibis) {
    if (!isAlive(c)) continue;
    if (c.params.mama < 45) continue;
    // 距離が遠ければ追跡 target を上書き
    const d = distance(c.pos, furana.pos);
    if (d > 20 && (c.state === 'idle' || c.state === 'surprised')) {
      c.target = {
        x: furana.pos.x + (Math.random() - 0.5) * 20,
        y: furana.pos.y + (Math.random() - 0.5) * 14,
      };
    }
    // 低頻度で "ママー！まって！" の悲痛な叫び
    if (Math.random() < 0.006) {
      const line = pickLine(['ママー！', 'まってわふ！', 'おいていかないでわふ！', 'どこいくのわふ！？', 'ママぁぁ！']);
      spawnBubble(w.bubbles, c.pos, line, 'speech', 1.3);
      if (c.state === 'idle') setState(c, 'cry', 1);
    }
  }
}

// パニック：フラナが死んで以降、ちびわふは徐々に心が折れる。
// 毎 tick 小確率で cry 状態、低確率で mama_lost 死亡。
// mama 高い子は死体に寄り添いに行く。
function applyFuranaLossPanic(w: WorldState, dt: number) {
  if (isFuranaAlive(w)) return;
  const furanaCorpse = w.npcs.find((x) => x.id === 'furana');
  for (const c of w.chibis) {
    if (!isAlive(c)) continue;
    // 50秒に 1度くらい cry 誘発、長引く
    if (c.state !== 'cry' && Math.random() < 0.003) {
      setState(c, 'cry', 2.5);
      if (Math.random() < 0.5) {
        const line = Math.random() < 0.5 ? 'ママいないわふ…' : 'ママどこわふ！？';
        spawnBubble(w.bubbles, c.pos, line, 'speech', 1.8);
      }
    }
    // ママ寄り添い：mama > 55 の子はフラナ死体に歩み寄る
    if (furanaCorpse && c.state === 'idle' && c.params.mama > 55) {
      const d = distance(c.pos, furanaCorpse.pos);
      if (d > 24 && Math.random() < 0.012) {
        // ママの側へ歩き出す（wanderStep が次の tick で走る）
        c.target = {
          x: furanaCorpse.pos.x + (Math.random() - 0.5) * 40,
          y: furanaCorpse.pos.y + (Math.random() - 0.5) * 24,
        };
      } else if (d <= 24 && Math.random() < 0.006) {
        // 近くに来てる：寄り添って泣く
        setState(c, 'cry', 3);
        const line = pickLine(['ママ…', 'おきてよママ…', 'ままぁ…わふ', 'どうしてわふ…', 'さみしいわふ…']);
        spawnBubble(w.bubbles, c.pos, line, 'speech', 2);
        pushLife(c, Math.floor(c.ageSec), 'ママの死体に寄り添った');
      }
    }
    // 低確率で心折れ死（大体 60-120 秒に 1体くらい、全体）
    // 個体の mama param が高いほど折れやすい
    const brokenRate = 0.00008 * (1 + c.params.mama * 0.03);
    if (Math.random() < brokenRate * dt * 20) {  // dt*20 で tick 補正
      kill(w, c, 'mama_lost');
    }
  }
  void dt;
}

function updateCocoonAbuse(w: WorldState, n: NpcState, dt: number) {
  n.abuseCooldown -= dt;
  if (n.abuseCooldown > 0) return;
  // Σ-6-x: 新生児保護（ageSec < 5）→ 生まれた瞬間に棒で突かれるのを防ぐ
  const candidates = w.chibiHash.nearby(n.pos, 90)
    .filter((c) => distance(c.pos, n.pos) < 90 && c.ageSec >= 5);
  if (candidates.length === 0) {
    n.abuseCooldown = 0.6;
    return;
  }
  // 特性でターゲット優先度を重み付け：
  //   心配性は狙われやすい、戦闘狂は絡みに行くので衝突率↑
  const weights = candidates.map((c) => {
    if (c.traits.includes('shinpai')) return 2.0;
    if (c.traits.includes('ikusa')) return 1.5;
    return 1.0;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  let target: Chibiwafu | undefined;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) { target = candidates[i]!; break; }
  }
  if (!target) return;
  // CD 短めで、頻繁に叩く
  n.abuseCooldown = 2 + Math.random() * 2;
  spawnBubble(w.bubbles, n.pos, pickLine(COCOON_LINES_ABUSE), 'npc-speech', 1.8);
  setState(target, 'cry', 1);
  pushLife(target, Math.floor(target.ageSec), 'ココンに棒で突かれた');
  pushNpcLife(n, Math.floor(w.timeSec), `${target.name} を棒で突いた`);
  // 喧嘩ペナルティ：近くの建設現場で workSec -5 + ワーカーがぼやく
  applyConstructionFightPenalty(w, n.pos);
  // ココン 本人も建設現場喧嘩セリフ（30% で）
  if (Math.random() < 0.3) {
    spawnBubble(w.bubbles, n.pos, pickCocoonConstructionFightLine(), 'npc-speech', 1.5);
  }

  // 包囲カウンター：ココン 周辺に 4匹以上いると 20% で逆襲され死亡
  if (candidates.length >= 4 && Math.random() < 0.2) {
    killCocoon(w, n);
    for (const c of candidates.slice(0, 5)) {
      pushLife(c, Math.floor(c.ageSec), 'ココンをみんなで倒した');
    }
    return;
  }

  // 戦闘狂相手：70% で絡みが発生。そのうち 25% はココン が負けて死ぬ。
  if (target.traits.includes('ikusa') && Math.random() < 0.7) {
    if (Math.random() < 0.25) {
      killCocoon(w, n);
      pushLife(target, Math.floor(target.ageSec), 'ココンを返り討ちにした');
      return;
    }
    kill(w, target, 'ikusa_taezetsu');
    return;
  }
  if (Math.random() < 0.35) {
    kill(w, target, 'cocoon_abuse');
  }
}

function killCocoon(w: WorldState, n: NpcState) {
  n.dead = true;
  n.respawnTimer = 30 + Math.random() * 20;
  spawnBubble(w.bubbles, n.pos, pickLine(COCOON_DEATH_LINES), 'npc-speech', 2.5);
  const suzu = w.npcs.find((x) => x.id === 'suzu');
  if (suzu && !suzu.dead) spawnBubble(w.bubbles, suzu.pos, 'ココン！？', 'npc-speech', 2);
}

function reactNpcsToBirth(w: WorldState) {
  const suzu = w.npcs.find((n) => n.id === 'suzu');
  if (!suzu || suzu.dead) return;
  if (Math.random() < 0.3) {
    spawnBubble(w.bubbles, suzu.pos, pickLine(SUZU_LINES_BIRTH), 'npc-speech', 2);
  }
}

// 変な死に方と判定する死因（哲学・境界消失・奇妙な事故）。
// フラナがびっくり反応（state='surprised'）を出す対象。
// 神様 (プレイヤー) 系とフラナ自身の暴行 (cocoon_abuse) は "よく起きる暴力" 扱いで除外、
// フラナが自分の行動に対して驚かないようにする。
const WEIRD_DEATH_CAUSES = new Set<DeathCauseId>([
  'philosophy', 'tetsugakusha_shoushitsu', 'ukiyo_shoushitsu',
  'bouken_cliff', 'tabikko_boundary', 'bo_meijin_tenka',
  'taiko_tobikomi',
]);

function reactNpcsToDeath(w: WorldState, c: Chibiwafu) {
  const weird = c.deathCauseId != null && WEIRD_DEATH_CAUSES.has(c.deathCauseId as DeathCauseId);
  for (const n of w.npcs) {
    if (n.dead) continue;
    const def = NPC_DEFS[n.id];
    // フラナは特別扱い：ほぼ毎回追悼コメント、変な死に方なら驚く
    if (n.id === 'furana') {
      if (weird) {
        n.state = 'surprised';
        n.stateTimer = 1.2;
        spawnBubble(w.bubbles, n.pos, pickLine(FURANA_LINES_WEIRD_DEATH), 'npc-speech', 2.2);
      } else if (Math.random() < 0.45) {
        spawnBubble(w.bubbles, n.pos, pickLine(FURANA_LINES_DEATH_REACTION), 'npc-speech', 2);
      }
      continue;
    }
    if (!def.reactOnDeath) continue;
    if (Math.random() < 0.35) {
      const pool = n.id === 'suzu' ? SUZU_LINES_DEATH : COCOON_LINES_DEATH;
      spawnBubble(w.bubbles, n.pos, pickLine(pool), 'npc-speech', 2);
    }
  }
}

function reactNpcsToOndo(w: WorldState) {
  for (const n of w.npcs) {
    if (n.dead) continue;
    if (!NPC_DEFS[n.id].reactOnOndo) continue;
    spawnBubble(w.bubbles, n.pos, pickLine(SUZU_LINES_ONDO), 'npc-speech', 2.2);
  }
}

// --- Corpse stomp gag -----------------------------------------------------

// 労働ループ：障害物の近くに居るちびわふが HP を削る。破壊で木材/石材が増える。
// 全障害物が消えた荒地プロットは cleared に昇格（devLevel 1）。
const OBSTACLE_DROPS: Record<ObstacleKind, 'wood' | 'stone'> = {
  rock: 'stone',
  stump: 'wood',
  bush: 'wood',
};
const OBSTACLE_DROP_AMOUNT: Record<ObstacleKind, number> = {
  rock: 3,
  stump: 3,
  bush: 2,
};
function updateLabor(w: WorldState, dt: number) {
  if (w.obstacles.length === 0) return;
  for (const obs of w.obstacles) {
    // 28px 以内のちびわふ（活動可能な状態のみ）をカウント
    let workers = 0;
    const near = w.chibiHash.nearby(obs.pos, 28);
    for (const c of near) {
      if (c.state === 'sleep' || c.state === 'dead' || c.state === 'hurt') continue;
      if (distance(c.pos, obs.pos) > 28) continue;
      workers++;
      // 作業中のちびわふは空腹・疲労が早める（ちびわふ側に直接加算）
      c.fatigue += dt * 0.25;
      c.hunger += dt * 0.10;
    }
    if (workers === 0) continue;
    // ちびわふ 1 人あたり 1.0 HP/秒（Σ-2.5-c 倍速）。多いほど速く片付く
    obs.hp -= dt * 1.0 * workers;
    // バブル：作業中の気配（5% * workers / 秒）
    if (Math.random() < dt * 0.5 * workers) {
      const near = w.chibiHash.nearby(obs.pos, 28).find((c) => distance(c.pos, obs.pos) < 28);
      if (near) {
        const line = obs.kind === 'rock' ? 'えいっわふ' : obs.kind === 'stump' ? 'ぬくわふ！' : 'むしるわふ';
        spawnBubble(w.bubbles, near.pos, line, 'speech', 0.8);
      }
    }
  }
  // 破壊判定
  const cleared = w.obstacles.filter((o) => o.hp <= 0);
  if (cleared.length > 0) {
    for (const c of cleared) {
      const drop = OBSTACLE_DROPS[c.kind];
      w.resources[drop] += OBSTACLE_DROP_AMOUNT[c.kind];
    }
    w.obstacles = w.obstacles.filter((o) => o.hp > 0);
  }
}

function updateStomps(w: WorldState, dt: number) {
  if (w.corpses.length === 0) return;
  // sparse sampling: 5% of frames only checks
  if (Math.random() > 0.05) return;
  const c = w.chibis[Math.floor(Math.random() * w.chibis.length)];
  if (!c || !isAlive(c)) return;
  const corpse = w.corpses[Math.floor(Math.random() * w.corpses.length)];
  if (!corpse) return;
  if (distance(c.pos, corpse.pos) < 14) {
    if (Math.random() < 0.5 * dt * 20) {
      spawnBubble(w.bubbles, corpse.pos, 'ぺちっ', 'stomp', 0.8);
      w.stompCount += 1;
    }
  }
}

export function tickWorld(w: WorldState, dt: number) {
  w.tick += 1;
  w.timeSec += dt;
  const prevSeason = w.season;
  const prevPhase = w.dayPhase;
  w.season = seasonFromTime(w.timeSec, w.secondsPerSeason);
  w.dayProgress = dayProgress(w.timeSec, CONFIG.SECONDS_PER_DAY);
  w.dayPhase = phaseFromProgress(w.dayProgress);
  w.dayCount = 1 + Math.floor(w.timeSec / CONFIG.SECONDS_PER_DAY);
  // 日付境目で天気を進める
  if (w.dayCount !== w.lastWeatherDayCount) {
    advanceWeather(w);
    w.lastWeatherDayCount = w.dayCount;
  }
  w.weather.remainingSec = Math.max(0, w.weather.remainingSec - dt);
  // 位相境界で NPC リアクション（朝礼／夜の静まり）
  if (w.dayPhase !== prevPhase) onPhaseChange(w, prevPhase, w.dayPhase);
  // 累計ポイントから村Lv を再計算。Lv 上昇でワールドが広がる。
  const prevLv = w.villageLv;
  w.villageLv = villageLvFromPoints(w.totalPointsEarned);
  if (w.villageLv !== prevLv) {
    w.bounds = effectiveBoundsFor(w.villageLv);
  }
  w.villageRank = computeRank(rankContext(w));
  applyBuildingMods(w);
  spawnIfRoom(w);
  maybeStartTaikoFestival(w);
  maybeTriggerBokaigi(w, dt);
  scheduleEvents(w, dt);
  resolveEvent(w, dt);
  const hazards = getActiveHazards(w);
  // 住居割当：2 秒毎（20Hz * 2 = 40 ticks）に 1 回だけスキャン。毎 tick は過剰。
  if (w.tick % 40 === 0) {
    const homeOccupants = countHomeOccupants(w);
    for (const c of w.chibis) if (isAlive(c)) assignHomeIfNeeded(w, c, homeOccupants);
  }
  for (const c of w.chibis) updateChibi(w, c, dt, hazards);
  // ちびわふ移動後に空間分割ハッシュを再構築（以降の近傍検索はこれを使う）
  w.chibiHash.rebuild(w.chibis.filter(isAlive));
  if (w.furanaGrabbedTimer > 0) {
    w.furanaGrabbedTimer = Math.max(0, w.furanaGrabbedTimer - dt);
    applyFuranaChaseBehavior(w);
  }
  processChats(w, dt);
  compactCorpses(w);
  updateNpcs(w, dt);
  applyFuranaLossPanic(w, dt);
  updateLabor(w, dt);
  computeWaterFlow(w);
  updateHydrology(w, dt);
  updateInfra(w, dt);
  updateThunderstrike(w, dt);
  updateFloodZones(w, dt);
  updateWolves(w, dt);
  updateConstructions(w, dt);
  updateTerraformJobs(w, dt);
  updateTerrainStability(w, dt);
  updateStomps(w, dt);
  updateBubbles(w.bubbles, dt);
  if (w.bokaigiMarkerTimer > 0) w.bokaigiMarkerTimer = Math.max(0, w.bokaigiMarkerTimer - dt);
  w.lastSeason = prevSeason;
  w.lastDayPhase = prevPhase;
}

// 位相境界で発火する小イベント（朝礼・夜の寝静まり・夕の呼び戻し）
function onPhaseChange(w: WorldState, prev: DayPhase, next: DayPhase) {
  const suzu = w.npcs.find((n) => n.id === 'suzu');
  if (next === 'morning') {
    // 朝はフラナの気分がリセット気味に（+10 mood）
    const f = w.npcs.find((n) => n.id === 'furana');
    if (f && !f.dead) f.mood = Math.min(100, f.mood + 10);
    // 朝礼：スズが全員を起こす
    if (suzu && !suzu.dead) {
      spawnBubble(w.bubbles, suzu.pos, 'あさだよ〜！', 'npc-speech', 2.6);
    }
    // 寝ているちびわふを idle に戻す（目覚めバブル）
    for (const c of w.chibis) {
      if (c.state === 'sleep' && isAlive(c)) {
        setState(c, 'idle', 0.5);
        if (Math.random() < 0.3) spawnBubble(w.bubbles, c.pos, 'おはようわふ', 'speech', 1.2);
      }
    }
    // Σ-5-g: 茂み自然再生。難度別に毎朝 1-2 本生やす（resource 枯渇対策）。
    // 障害物上限 = 初期数 × 1.5 を超えない（無限増殖防止）。
    growBushes(w);
  } else if (next === 'evening') {
    // 夕暮れ：お腹が空いた雰囲気
    if (suzu && !suzu.dead && Math.random() < 0.6) {
      spawnBubble(w.bubbles, suzu.pos, 'ゆうはんのじかんだよ〜', 'npc-speech', 2.4);
    }
  } else if (next === 'night') {
    // 夜の挨拶：ランダムで寝入る子を出す
    if (suzu && !suzu.dead && Math.random() < 0.6) {
      spawnBubble(w.bubbles, suzu.pos, 'よるだよ、ねんねしよ', 'npc-speech', 2.4);
    }
  }
  void prev;
}

export function buildingCost(w: WorldState, defId: string): number {
  const def = BUILDINGS[defId];
  if (!def) return Infinity;
  const count = w.buildings.filter((b) => b.defId === defId).length;
  return Math.round(def.cost * Math.pow(def.costGrowth, count));
}

export function rankContext(w: WorldState): RankContext {
  return {
    totalDeaths: w.totalDeaths,
    uniqueDexFound: uniqueDexFound(w),
    stompCount: w.stompCount,
  };
}

// 指定種の建物のうち、Lv最小のものを1段階アップグレードする。
// ランクで解禁されている Lv までしか上がらない。成功時 true。
export function upgradeOne(w: WorldState, defId: string): boolean {
  const def = BUILDINGS[defId];
  if (!def) return false;
  const info = getUpgradeInfo(w, defId);
  if (!info || !info.possible || !info.target) return false;
  w.points -= info.cost;
  info.target.level += 1;
  return true;
}

export interface UpgradeInfo {
  possible: boolean;
  cost: number;
  targetLevel: number; // 成功時の新Lv
  target: PlacedBuilding | null;
  capped: boolean; // ランクのLv上限で全個体が頭打ち
}

export function getUpgradeInfo(w: WorldState, defId: string): UpgradeInfo | null {
  const def = BUILDINGS[defId];
  if (!def) return null;
  const maxLv = maxBuildingLevel(w.villageRank);
  const owned = w.buildings.filter((b) => b.defId === defId);
  if (owned.length === 0) return null;
  const upgradeable = owned.filter((b) => b.level < maxLv);
  if (upgradeable.length === 0) {
    return { possible: false, cost: 0, targetLevel: maxLv, target: null, capped: true };
  }
  upgradeable.sort((a, b) => a.level - b.level);
  const target = upgradeable[0]!;
  const cost = upgradeCostFor(def, target.level);
  return { possible: w.points >= cost, cost, targetLevel: target.level + 1, target, capped: false };
}

export function buildAt(w: WorldState, defId: string): boolean {
  const cost = buildingCost(w, defId);
  if (w.points < cost) return false;
  const def = BUILDINGS[defId];
  if (!def) return false;
  w.points -= cost;
  // 建物は type ごとに別の帯に並べる。横はワールド幅をほぼ埋めるように伸ばす。
  const typeOrder = ['noukou', 'kouba', 'hakaba', 'taiko'];
  const typeIdx = Math.max(0, typeOrder.indexOf(defId));
  const sameCount = w.buildings.filter((b) => b.defId === defId).length;
  const laneY = 300 + typeIdx * 30;
  const laneMargin = 80;
  const laneW = w.bounds.w - laneMargin * 2;
  const laneX = laneMargin + ((sameCount * 80) % laneW);
  w.buildings.push({ defId, level: 1, pos: { x: laneX, y: laneY } });
  return true;
}

export function uniqueDexFound(w: WorldState): number {
  return Object.values(w.dex).filter((d) => d.count > 0).length;
}

export function totalDexCount(): number {
  return SEASONS.length > 0 ? Object.keys(DEATH_CAUSES).length : 0;
}

export { resetIdCounter, peekNextId };
