import type { WorldState } from '../sim/world';
import { peekNextId, resetIdCounter } from '../sim/chibiwafu';

const KEY = 'kszkbk:save:v1';
const CURRENT_VERSION = 5;

// v1: P2-a 前。16 dex。
// v2: P2-a 以降。24 dex（Uncommon 含む）。live chibis は persist しないので
//     trait フィールドのマイグレーションは不要。未知の dex id は createDex()
//     側で 0 埋めされる（load は id ごとに上書き、欠けたものはそのまま残る）。
// v3: totalPointsEarned を追加（村Lv の成長源）。v1/v2 からの load では
//     `points` 初期値をそのまま totalPointsEarned として引き継ぐ。
type SaveVersion = 1 | 2 | 3 | 4 | 5;

interface SaveData {
  version: SaveVersion;
  nextId: number;
  points: number;
  totalPointsEarned?: number;  // v3+
  totalDeaths: number;
  totalBirths: number;
  stompCount: number;
  timeSec: number;
  dex: WorldState['dex'];
  buildings: WorldState['buildings'];
  recentDeaths: WorldState['recentDeaths'];
  // v4+: 寿命統計
  sumDeathAgeSec?: number;
  longestLifeSec?: number;
  longestLifeName?: string;
  shortestLifeSec?: number;
  shortestLifeName?: string;
  // v5+: 開拓リソース
  resources?: WorldState['resources'];
}

export function save(w: WorldState) {
  const data: SaveData = {
    version: CURRENT_VERSION,
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
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
}

export function load(w: WorldState): boolean {
  const raw = localStorage.getItem(KEY);
  if (!raw) return false;
  try {
    const data = JSON.parse(raw) as SaveData;
    if (![1, 2, 3, 4, 5].includes(data.version)) return false;
    resetIdCounter(data.nextId || 1);
    w.points = data.points;
    // v3+: totalPointsEarned あり / 旧版: points をそのまま累計として流用
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
    // v4+ 統計が無ければ 0/Infinity で初期化（すでに createWorld で設定済み）
    if (typeof data.sumDeathAgeSec === 'number') w.sumDeathAgeSec = data.sumDeathAgeSec;
    if (typeof data.longestLifeSec === 'number') w.longestLifeSec = data.longestLifeSec;
    if (typeof data.longestLifeName === 'string') w.longestLifeName = data.longestLifeName;
    if (typeof data.shortestLifeSec === 'number') w.shortestLifeSec = data.shortestLifeSec;
    if (typeof data.shortestLifeName === 'string') w.shortestLifeName = data.shortestLifeName;
    if (data.resources) w.resources = { ...w.resources, ...data.resources };
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  localStorage.removeItem(KEY);
}
