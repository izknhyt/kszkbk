import type { WorldState } from '../sim/world';
import { peekNextId, resetIdCounter } from '../sim/chibiwafu';

const KEY = 'kszkbk:save:v1';

interface SaveData {
  version: 1;
  nextId: number;
  points: number;
  totalDeaths: number;
  totalBirths: number;
  timeSec: number;
  dex: WorldState['dex'];
  buildings: WorldState['buildings'];
  recentDeaths: WorldState['recentDeaths'];
}

export function save(w: WorldState) {
  const data: SaveData = {
    version: 1,
    nextId: peekNextId(),
    points: w.points,
    totalDeaths: w.totalDeaths,
    totalBirths: w.totalBirths,
    timeSec: w.timeSec,
    dex: w.dex,
    buildings: w.buildings,
    recentDeaths: w.recentDeaths.slice(0, 24),
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
    if (data.version !== 1) return false;
    resetIdCounter(data.nextId || 1);
    w.points = data.points;
    w.totalDeaths = data.totalDeaths;
    w.totalBirths = data.totalBirths ?? 0;
    w.timeSec = data.timeSec;
    if (data.dex) {
      for (const k of Object.keys(data.dex) as Array<keyof typeof data.dex>) {
        if (w.dex[k]) w.dex[k] = data.dex[k];
      }
    }
    w.buildings = data.buildings ?? [];
    w.recentDeaths = data.recentDeaths ?? [];
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  localStorage.removeItem(KEY);
}
