import type { Season } from '../types';

export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

export const SEASON_LABEL: Record<Season, string> = {
  spring: '春',
  summer: '夏',
  autumn: '秋',
  winter: '冬',
};

export function seasonFromTime(totalSec: number, secondsPerSeason: number): Season {
  const idx = Math.floor(totalSec / secondsPerSeason) % SEASONS.length;
  return SEASONS[idx]!;
}

export interface GlobalEvent {
  kind: 'ondo' | 'bokaigi' | 'fire' | 'springwind';
  remaining: number;
  intensity: number;
}
