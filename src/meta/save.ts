import type { Difficulty, RampDir, TerrainMaterial, TerrainTile, TerraformJob } from '../types';
import type { WorldState } from '../sim/world';
import { activateTerrain, TERRAIN_COLS, TERRAIN_ROWS } from '../sim/world';
import { peekNextId, resetIdCounter } from '../sim/chibiwafu';
import { CONFIG } from '../config';

// =========================================================================
// 3 スロット制のセーブ。スロット毎に独立した run / difficulty を持つ。
//
// ## 永続化スコープ（仕様）
//
// **persist する**:
//   - メタ: runId / runStartedAtMs / difficulty / nextId
//   - 進行: points / totalPointsEarned / totalDeaths / totalBirths / stompCount
//          / timeSec / spawnCooldown / event / dex / villageRank（buildings 経由）
//   - 統計: recentDeaths / sumDeathAgeSec / longestLife / shortestLife
//          / wolvesKilled
//   - 個体: chibis / corpses / npcs（A* path cache など transient は除外）
//   - 配置: buildings / features（transient flow/saturated は除外）/ obstacles
//   - 資源: resources（food/wood/stone/plank/power/brick/wool/cloth/soil 等）
//   - 気象: weather / weatherForecast / lastWeatherDayCount
//   - 地形: terrain RLE 圧縮（elev/material/stability/waterLevel/ramp/wetness/
//          mud/snow/isSea）/ terrainSeed / terraformJobs
//
// **persist しない（ロード時に再生成）**:
//   - wolves: 夜の襲撃は次ロード時に再キュー
//   - bubbles / floodZones: transient FX
//   - terrainVersion: ロード後 0 リセット、A* path も全 chibi で初期化される
//   - hydroTimer: 0 リセット
//   - terraformPriorityExpire / constructionPriorityExpire: モジュール状態、
//     ロード後は空（プレイヤーが再指示）
//
// 通常の「再開」では生存中個体・フラナ・死体ログも維持する。
// =========================================================================
export type SlotId = 1 | 2 | 3;

const OLD_SINGLE_KEY = 'kszkbk:save:v1';
const slotKey = (slot: SlotId) => `kszkbk:save:slot${slot}`;
const CURRENT_VERSION = 14;

// v1-v8 の履歴は README 省略。v9：スロット制、runId/difficulty 追加
// v10：weather / weatherForecast 追加
// v11：Σ-2 タイル式ハイトマップ（terrain RLE + terraformJobs + soil リソース）
// v12：Σ-3 terrainSeed（procedural ジェネレータ切り替え）
// v13：Σ-7 タイル水位を 0/10 binary → 0-100 細粒度化（雨/蒸発/flow を persist）
// v14：Σ-8 elev 0-100 → 0-255 (×2.55, ELEV_STEP=25 量子化) /
//      material から 'water' 撤去（isSea フラグへ） /
//      ramp/wetness/mud/snowCoverage/isSea を persist
type SaveVersion = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

// =========================================================================
// Σ-2 地形 RLE 圧縮ユーティリティ
// =========================================================================
// v14: 'snow' 追加、旧 v13 までの 'water' (旧 index 4) はロード時に isSea+sand に変換
const MAT_CODES: TerrainMaterial[] = ['grass', 'soil', 'sand', 'rock', 'snow'];
// 旧 v13 までは ['grass','soil','sand','rock','water']。互換用に index 4 = water として読む。
const LEGACY_MAT_INDEX_WATER = 4;
const RAMP_CODES: Array<RampDir | null> = [null, 'N', 'S', 'E', 'W'];

function rleEncode(arr: number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let i = 0;
  while (i < arr.length) {
    const v = arr[i]!;
    let count = 1;
    while (i + count < arr.length && arr[i + count] === v) count++;
    out.push([v, count]);
    i += count;
  }
  return out;
}

function rleDecode(rle: Array<[number, number]>): number[] {
  const out: number[] = [];
  for (const [v, c] of rle) {
    for (let i = 0; i < c; i++) out.push(v);
  }
  return out;
}

interface TerrainSave {
  cols: number;
  rows: number;
  elevRle: Array<[number, number]>;  // round(elev) — v14 以降は 0-255 スケール
  matRle: Array<[number, number]>;   // MAT_CODES index
  stabRle: Array<[number, number]>;  // round(stability*100)
  // v12 以前：0 or 10（waterLevel * 10 rounded、binary 扱い）
  // v13 以降：0-100（waterLevel * 100 rounded、細粒度）
  waterRle: Array<[number, number]>;
  // v14+: Σ-8 拡張フィールド
  rampRle?: Array<[number, number]>;     // RAMP_CODES index (0=null, 1=N, 2=S, 3=E, 4=W)
  wetRle?:  Array<[number, number]>;     // wetness * 100
  mudRle?:  Array<[number, number]>;     // mud * 100
  snowRle?: Array<[number, number]>;     // snowCoverage * 100
  seaRle?:  Array<[number, number]>;     // isSea: 0 or 1
}

function serializeTerrain(terrain: TerrainTile[][]): TerrainSave {
  const rows = terrain.length;
  const cols = terrain[0]?.length ?? 0;
  const elevFlat: number[] = [];
  const matFlat: number[] = [];
  const stabFlat: number[] = [];
  const waterFlat: number[] = [];
  const rampFlat: number[] = [];
  const wetFlat: number[] = [];
  const mudFlat: number[] = [];
  const snowFlat: number[] = [];
  const seaFlat: number[] = [];
  for (const row of terrain) {
    for (const tile of row) {
      elevFlat.push(Math.round(tile.elev));
      matFlat.push(Math.max(0, MAT_CODES.indexOf(tile.material)));
      stabFlat.push(Math.round(tile.stability * 100));
      waterFlat.push(Math.max(0, Math.min(100, Math.round(tile.waterLevel * 100))));
      rampFlat.push(Math.max(0, RAMP_CODES.indexOf(tile.ramp)));
      wetFlat.push(Math.max(0, Math.min(100, Math.round(tile.wetness * 100))));
      mudFlat.push(Math.max(0, Math.min(100, Math.round(tile.mud * 100))));
      snowFlat.push(Math.max(0, Math.min(100, Math.round(tile.snowCoverage * 100))));
      seaFlat.push(tile.isSea ? 1 : 0);
    }
  }
  return {
    cols,
    rows,
    elevRle: rleEncode(elevFlat),
    matRle: rleEncode(matFlat),
    stabRle: rleEncode(stabFlat),
    waterRle: rleEncode(waterFlat),
    rampRle: rleEncode(rampFlat),
    wetRle: rleEncode(wetFlat),
    mudRle: rleEncode(mudFlat),
    snowRle: rleEncode(snowFlat),
    seaRle: rleEncode(seaFlat),
  };
}

// version 別に水スケール / elev スケール / 拡張フィールドを切り替え。
function deserializeTerrain(s: TerrainSave, version: number): TerrainTile[][] {
  const elevFlat = rleDecode(s.elevRle);
  const matFlat = rleDecode(s.matRle);
  const stabFlat = rleDecode(s.stabRle);
  const waterFlat = rleDecode(s.waterRle);
  const rampFlat = s.rampRle ? rleDecode(s.rampRle) : null;
  const wetFlat  = s.wetRle  ? rleDecode(s.wetRle)  : null;
  const mudFlat  = s.mudRle  ? rleDecode(s.mudRle)  : null;
  const snowFlat = s.snowRle ? rleDecode(s.snowRle) : null;
  const seaFlat  = s.seaRle  ? rleDecode(s.seaRle)  : null;
  const waterScale = version >= 13 ? 100 : 10;
  // v13 以下は elev が旧 0-100 スケール → 新 0-255 へ持ち上げて ELEV_STEP に量子化
  const STEP = CONFIG.ELEV_STEP;
  const MAX_E = CONFIG.MAX_ELEV;
  const upgradeElev = (e: number): number => {
    if (version >= 14) return Math.max(0, Math.min(MAX_E, e));
    const scaled = e * (MAX_E / 100);
    return Math.max(0, Math.min(MAX_E, Math.round(scaled / STEP) * STEP));
  };
  const terrain: TerrainTile[][] = [];
  for (let row = 0; row < s.rows; row++) {
    const rowArr: TerrainTile[] = [];
    for (let col = 0; col < s.cols; col++) {
      const idx = row * s.cols + col;
      const matIdx = matFlat[idx] ?? 0;
      // v13 以下では index 4 = 'water'（恒久水域）。v14+ では index 4 = 'snow'。
      let material: TerrainMaterial;
      let isSeaFromMat = false;
      if (version < 14 && matIdx === LEGACY_MAT_INDEX_WATER) {
        material = 'sand';   // 海底材質を砂で固定
        isSeaFromMat = true;
      } else {
        material = MAT_CODES[matIdx] ?? 'grass';
      }
      const isSea = seaFlat ? (seaFlat[idx] === 1) : isSeaFromMat;
      rowArr.push({
        elev: upgradeElev(elevFlat[idx] ?? 0),
        material,
        ramp: rampFlat ? (RAMP_CODES[rampFlat[idx] ?? 0] ?? null) : null,
        stability: (stabFlat[idx] ?? 100) / 100,
        waterLevel: (waterFlat[idx] ?? 0) / waterScale,
        wetness: wetFlat ? (wetFlat[idx] ?? 0) / 100 : 0,
        mud: mudFlat ? (mudFlat[idx] ?? 0) / 100 : 0,
        snowCoverage: snowFlat ? (snowFlat[idx] ?? 0) / 100 : 0,
        buryTimer: 0,
        isSea,
      });
    }
    terrain.push(rowArr);
  }
  return terrain;
}

interface SaveData {
  version: SaveVersion;
  // v9+: run / difficulty
  runId?: string;
  runStartedAtMs?: number;
  difficulty?: Difficulty;
  nextId: number;
  points: number;
  totalPointsEarned?: number;
  totalDeaths: number;
  totalBirths: number;
  stompCount: number;
  timeSec: number;
  chibis?: WorldState['chibis'];
  corpses?: WorldState['corpses'];
  npcs?: WorldState['npcs'];
  spawnCooldown?: number;
  baseSpawnInterval?: number;
  baseCap?: number;
  furanaGrabbedTimer?: number;
  event?: WorldState['event'];
  ondoCooldown?: number;
  fireCooldown?: number;
  bokaigiCooldown?: number;
  bokaigiMarkerTimer?: number;
  dex: WorldState['dex'];
  buildings: WorldState['buildings'];
  recentDeaths: WorldState['recentDeaths'];
  sumDeathAgeSec?: number;
  longestLifeSec?: number;
  longestLifeName?: string;
  shortestLifeSec?: number;
  shortestLifeName?: string;
  resources?: WorldState['resources'];
  obstacles?: WorldState['obstacles'];
  features?: WorldState['features'];
  // v10+: 気象
  weather?: WorldState['weather'];
  weatherForecast?: WorldState['weatherForecast'];
  lastWeatherDayCount?: number;
  wolvesKilled?: number;
  // v11+: Σ-2 地形
  terrain?: TerrainSave;
  terraformJobs?: TerraformJob[];
  // v12+: Σ-3 地形シード
  terrainSeed?: number;
}

function serializeChibi(c: WorldState['chibis'][number]): WorldState['chibis'][number] {
  const {
    pathPoints: _pathPoints,
    pathVersion: _pathVersion,
    pathFailedSec: _pathFailedSec,
    wolfAlarmIgnoredTick: _wolfAlarmIgnoredTick,
    ...rest
  } = c;
  return {
    ...rest,
    pos: { ...c.pos },
    target: c.target ? { ...c.target } : null,
    traits: [...c.traits],
    params: { ...c.params },
    flavors: [...c.flavors],
    lifeLog: c.lifeLog.slice(-30).map((ev) => ({ ...ev })),
    flight: c.flight ? { ...c.flight, hitKeys: [...c.flight.hitKeys] } : null,
    pathPoints: undefined,
    pathVersion: undefined,
    pathFailedSec: undefined,
  };
}

function deserializeChibi(c: WorldState['chibis'][number]): WorldState['chibis'][number] {
  return {
    ...c,
    pos: { ...c.pos },
    target: c.target ? { ...c.target } : null,
    traits: [...(c.traits ?? [])],
    params: { ...c.params },
    flavors: [...(c.flavors ?? [])],
    lifeLog: (c.lifeLog ?? []).slice(-30).map((ev) => ({ ...ev })),
    flight: c.flight ? { ...c.flight, hitKeys: [...c.flight.hitKeys] } : null,
    pathPoints: undefined,
    pathVersion: undefined,
    pathFailedSec: undefined,
    wolfAlarmIgnoredTick: undefined,
  };
}

function serializeNpc(n: WorldState['npcs'][number]): WorldState['npcs'][number] {
  return {
    ...n,
    pos: { ...n.pos },
    home: { ...n.home },
    target: n.target ? { ...n.target } : null,
    lifeLog: n.lifeLog.slice(-20).map((ev) => ({ ...ev })),
    flight: n.flight ? { ...n.flight, hitKeys: [...n.flight.hitKeys] } : null,
  };
}

// スロット概要（スタート画面で 3 枚のカードに表示）
export interface SlotSummary {
  slot: SlotId;
  exists: boolean;
  difficulty?: Difficulty;
  timeSec?: number;
  totalDeaths?: number;
  totalBirths?: number;
  villageLv?: number;
  runStartedAtMs?: number;
}

// スタート画面用：全スロットの概要を取得
export function listSlots(): SlotSummary[] {
  // 旧単一キーが残っていれば slot1 に自動マイグレーション
  migrateOldSaveIfAny();
  const out: SlotSummary[] = [];
  for (const slot of [1, 2, 3] as SlotId[]) {
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) {
      out.push({ slot, exists: false });
      continue;
    }
    try {
      const d = JSON.parse(raw) as SaveData;
      out.push({
        slot,
        exists: true,
        difficulty: d.difficulty,
        timeSec: d.timeSec,
        totalDeaths: d.totalDeaths,
        totalBirths: d.totalBirths,
        runStartedAtMs: d.runStartedAtMs,
      });
    } catch {
      out.push({ slot, exists: false });
    }
  }
  return out;
}

function migrateOldSaveIfAny() {
  const old = localStorage.getItem(OLD_SINGLE_KEY);
  if (!old) return;
  if (localStorage.getItem(slotKey(1))) return;  // slot1 にすでにあれば触らない
  localStorage.setItem(slotKey(1), old);
  localStorage.removeItem(OLD_SINGLE_KEY);
}

export function save(w: WorldState, slot: SlotId) {
  const data: SaveData = {
    version: CURRENT_VERSION,
    runId: w.runId,
    runStartedAtMs: w.runStartedAtMs,
    difficulty: w.difficulty,
    nextId: peekNextId(),
    points: w.points,
    totalPointsEarned: w.totalPointsEarned,
    totalDeaths: w.totalDeaths,
    totalBirths: w.totalBirths,
    stompCount: w.stompCount,
    timeSec: w.timeSec,
    chibis: w.chibis.map(serializeChibi),
    corpses: w.corpses.map(serializeChibi),
    // M2.1: 旧NPCは復元しない設計なので、保存側もフラナだけに絞る。
    npcs: w.npcs.filter((n) => n.id === 'furana').map(serializeNpc),
    spawnCooldown: w.spawnCooldown,
    baseSpawnInterval: w.baseSpawnInterval,
    baseCap: w.baseCap,
    furanaGrabbedTimer: w.furanaGrabbedTimer,
    event: w.event,
    ondoCooldown: w.ondoCooldown,
    fireCooldown: w.fireCooldown,
    bokaigiCooldown: w.bokaigiCooldown,
    bokaigiMarkerTimer: w.bokaigiMarkerTimer,
    dex: w.dex,
    // M2.1 Step 4.4: 旧 BUILDINGS 由来の w.buildings は display-only として
    // persist 維持（既存セーブの旧建物が消えると数値効果も急変するため）。
    // 新規 buildAt / upgradeOne は no-op 化済み、UI からも入口なし。
    // 将来 Feature 系へ完全置換した時点で migration（空配列化）を別 step で実施。
    buildings: w.buildings,
    recentDeaths: w.recentDeaths.slice(0, 24),
    sumDeathAgeSec: w.sumDeathAgeSec,
    longestLifeSec: w.longestLifeSec,
    longestLifeName: w.longestLifeName,
    shortestLifeSec: w.shortestLifeSec,
    shortestLifeName: w.shortestLifeName,
    resources: w.resources,
    obstacles: w.obstacles,
    // flow / saturated は tick 毎に再計算される transient フィールド。保存不要。
    features: w.features.map(({ flow: _f, saturated: _s, ...rest }) => rest),
    weather: w.weather,
    weatherForecast: w.weatherForecast,
    lastWeatherDayCount: w.lastWeatherDayCount,
    wolvesKilled: w.wolvesKilled,
    terrain: serializeTerrain(w.terrain),
    terraformJobs: w.terraformJobs,
    terrainSeed: w.terrainSeed,
  };
  try {
    localStorage.setItem(slotKey(slot), JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
}

export function load(w: WorldState, slot: SlotId): boolean {
  migrateOldSaveIfAny();
  const raw = localStorage.getItem(slotKey(slot));
  if (!raw) return false;
  try {
    const data = JSON.parse(raw) as SaveData;
    if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].includes(data.version)) return false;
    if (data.runId) w.runId = data.runId;
    if (typeof data.runStartedAtMs === 'number') w.runStartedAtMs = data.runStartedAtMs;
    if (data.difficulty) w.difficulty = data.difficulty;
    resetIdCounter(data.nextId || 1);
    w.points = data.points;
    w.totalPointsEarned = data.totalPointsEarned ?? data.points ?? 0;
    w.totalDeaths = data.totalDeaths;
    w.totalBirths = data.totalBirths ?? 0;
    w.stompCount = data.stompCount ?? 0;
    w.timeSec = data.timeSec;
    if (Array.isArray(data.chibis)) w.chibis = data.chibis.map(deserializeChibi);
    if (Array.isArray(data.corpses)) w.corpses = data.corpses.map(deserializeChibi);
    if (Array.isArray(data.npcs)) {
      const restoredNpcs = data.npcs
        .filter((n) => n && n.id === 'furana')
        .map(serializeNpc);
      if (restoredNpcs.length > 0) w.npcs = restoredNpcs;
    }
    w.nameSet = new Set([
      ...w.nameSet,
      ...w.chibis.map((c) => c.name),
      ...w.corpses.map((c) => c.name),
    ]);
    const furana = w.npcs.find((n) => n.id === 'furana' && !n.dead);
    if (furana) w.furanaPos = { ...furana.pos };
    if (typeof data.spawnCooldown === 'number') w.spawnCooldown = data.spawnCooldown;
    if (typeof data.baseSpawnInterval === 'number') w.baseSpawnInterval = data.baseSpawnInterval;
    if (typeof data.baseCap === 'number') w.baseCap = data.baseCap;
    if (typeof data.furanaGrabbedTimer === 'number') w.furanaGrabbedTimer = data.furanaGrabbedTimer;
    if (data.event !== undefined) w.event = data.event;
    if (typeof data.ondoCooldown === 'number') w.ondoCooldown = data.ondoCooldown;
    if (typeof data.fireCooldown === 'number') w.fireCooldown = data.fireCooldown;
    if (typeof data.bokaigiCooldown === 'number') w.bokaigiCooldown = data.bokaigiCooldown;
    if (typeof data.bokaigiMarkerTimer === 'number') w.bokaigiMarkerTimer = data.bokaigiMarkerTimer;
    if (data.dex) {
      for (const k of Object.keys(data.dex) as Array<keyof typeof data.dex>) {
        if (w.dex[k]) w.dex[k] = data.dex[k];
      }
    }
    w.buildings = data.buildings ?? [];
    w.recentDeaths = data.recentDeaths ?? [];
    if (typeof data.sumDeathAgeSec === 'number') w.sumDeathAgeSec = data.sumDeathAgeSec;
    if (typeof data.longestLifeSec === 'number') w.longestLifeSec = data.longestLifeSec;
    if (typeof data.longestLifeName === 'string') w.longestLifeName = data.longestLifeName;
    if (typeof data.shortestLifeSec === 'number') w.shortestLifeSec = data.shortestLifeSec;
    if (typeof data.shortestLifeName === 'string') w.shortestLifeName = data.shortestLifeName;
    if (data.resources) w.resources = { ...w.resources, ...data.resources };
    if (Array.isArray(data.features) && data.features.length > 0) w.features = data.features;
    if (Array.isArray(data.obstacles)) w.obstacles = data.obstacles;
    if (data.weather) w.weather = data.weather;
    if (Array.isArray(data.weatherForecast) && data.weatherForecast.length > 0) w.weatherForecast = data.weatherForecast;
    if (typeof data.lastWeatherDayCount === 'number') w.lastWeatherDayCount = data.lastWeatherDayCount;
    if (typeof data.wolvesKilled === 'number') w.wolvesKilled = data.wolvesKilled;
    // v11+: 地形。旧セーブは ensurePlots で procedural 再生成されるので null のままでよい
    if (data.terrain && data.terrain.cols === TERRAIN_COLS && data.terrain.rows === TERRAIN_ROWS) {
      w.terrain = deserializeTerrain(data.terrain, data.version);
      activateTerrain(w.terrain);
    }
    if (Array.isArray(data.terraformJobs)) w.terraformJobs = data.terraformJobs;
    // v12+: terrainSeed。旧セーブは ensurePlots で runId から再導出
    if (typeof data.terrainSeed === 'number') w.terrainSeed = data.terrainSeed;
    // soil が古いセーブにない場合のデフォルト
    if (typeof w.resources.soil !== 'number') w.resources.soil = 0;
    return true;
  } catch {
    return false;
  }
}

export function clearSave(slot: SlotId) {
  localStorage.removeItem(slotKey(slot));
}
