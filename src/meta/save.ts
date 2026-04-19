import type { Difficulty } from '../types';
import type { WorldState } from '../sim/world';
import { peekNextId, resetIdCounter } from '../sim/chibiwafu';

// 3 スロット制のローグライク向けセーブ。スロット毎に独立した run / difficulty を持つ。
export type SlotId = 1 | 2 | 3;

const OLD_SINGLE_KEY = 'kszkbk:save:v1';
const slotKey = (slot: SlotId) => `kszkbk:save:slot${slot}`;
const CURRENT_VERSION = 10;

// v1-v8 の履歴は README 省略。v9：スロット制、runId/difficulty 追加
// v10：weather / weatherForecast 追加
type SaveVersion = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

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
    if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10].includes(data.version)) return false;
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
    return true;
  } catch {
    return false;
  }
}

export function clearSave(slot: SlotId) {
  localStorage.removeItem(slotKey(slot));
}
