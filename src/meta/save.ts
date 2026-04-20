import type { Difficulty, TerrainMaterial, TerrainTile } from '../types';
import type { WorldState } from '../sim/world';
import { activateTerrain, TERRAIN_COLS, TERRAIN_ROWS } from '../sim/world';
import { peekNextId, resetIdCounter } from '../sim/chibiwafu';

// 3 スロット制のローグライク向けセーブ。スロット毎に独立した run / difficulty を持つ。
export type SlotId = 1 | 2 | 3;

const OLD_SINGLE_KEY = 'kszkbk:save:v1';
const slotKey = (slot: SlotId) => `kszkbk:save:slot${slot}`;
const CURRENT_VERSION = 11;

// v1-v8 の履歴は README 省略。v9：スロット制、runId/difficulty 追加
// v10：weather / weatherForecast 追加
// v11：Σ-2 タイル式ハイトマップ（terrain RLE + terraformJobs + soil リソース）
type SaveVersion = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

// =========================================================================
// Σ-2 地形 RLE 圧縮ユーティリティ
// =========================================================================
const MAT_CODES: TerrainMaterial[] = ['grass', 'soil', 'sand', 'rock', 'water'];

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
  elevRle: Array<[number, number]>;  // round(elev)
  matRle: Array<[number, number]>;   // MAT_CODES index
  stabRle: Array<[number, number]>;  // round(stability*100)
  waterRle: Array<[number, number]>; // 0 or 10 (waterLevel*10 rounded)
}

function serializeTerrain(terrain: TerrainTile[][]): TerrainSave {
  const rows = terrain.length;
  const cols = terrain[0]?.length ?? 0;
  const elevFlat: number[] = [];
  const matFlat: number[] = [];
  const stabFlat: number[] = [];
  const waterFlat: number[] = [];
  for (const row of terrain) {
    for (const tile of row) {
      elevFlat.push(Math.round(tile.elev));
      matFlat.push(MAT_CODES.indexOf(tile.material));
      stabFlat.push(Math.round(tile.stability * 100));
      waterFlat.push(tile.waterLevel >= 0.5 ? 10 : 0);
    }
  }
  return {
    cols,
    rows,
    elevRle: rleEncode(elevFlat),
    matRle: rleEncode(matFlat),
    stabRle: rleEncode(stabFlat),
    waterRle: rleEncode(waterFlat),
  };
}

function deserializeTerrain(s: TerrainSave): TerrainTile[][] {
  const elevFlat = rleDecode(s.elevRle);
  const matFlat = rleDecode(s.matRle);
  const stabFlat = rleDecode(s.stabRle);
  const waterFlat = rleDecode(s.waterRle);
  const terrain: TerrainTile[][] = [];
  for (let row = 0; row < s.rows; row++) {
    const rowArr: TerrainTile[] = [];
    for (let col = 0; col < s.cols; col++) {
      const idx = row * s.cols + col;
      rowArr.push({
        elev: elevFlat[idx] ?? 0,
        material: MAT_CODES[matFlat[idx] ?? 0] ?? 'grass',
        stability: (stabFlat[idx] ?? 100) / 100,
        waterLevel: (waterFlat[idx] ?? 0) / 10,
        buryTimer: 0,
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
  // v11+: Σ-2-a 地形タイル配列
  terrain?: TerrainSave;
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
    dex: w.dex,
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
    if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].includes(data.version)) return false;
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
      w.terrain = deserializeTerrain(data.terrain);
      activateTerrain(w.terrain);
    }
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
