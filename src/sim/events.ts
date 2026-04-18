import type { DayPhase, Season } from '../types';

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

// --- Day phase ------------------------------------------------------------
// 1日の進行を 0-1 で返す（朝→昼→夕→夜）。見た目ティングや挙動スケールで使う。
export function dayProgress(totalSec: number, secondsPerDay: number): number {
  return (totalSec % secondsPerDay) / secondsPerDay;
}

// 4 位相に分ける。morning 0-25% / noon 25-55% / evening 55-80% / night 80-100%
export function phaseFromProgress(p: number): DayPhase {
  if (p < 0.25) return 'morning';
  if (p < 0.55) return 'noon';
  if (p < 0.80) return 'evening';
  return 'night';
}

export const DAY_PHASE_LABEL: Record<DayPhase, string> = {
  morning: '朝',
  noon: '昼',
  evening: '夕',
  night: '夜',
};

export interface GlobalEvent {
  kind: 'ondo' | 'bokaigi' | 'fire' | 'springwind' | 'taiko_festival';
  // 残り秒数。0以下になったら終了。
  remaining: number;
  // 全体の秒数。intensity envelope の計算に使う。
  duration: number;
  // ピーク kill レート。実際の瞬間レートは intensityAt() で envelope に補間される。
  intensity: number;
}

// イベント強度のエンベロープ（立ち上がり30%・ピーク40%・減衰30%）。
// 「イベントが始まって→盛り上がって→静まる」を1山で表現し、
// 発生初tickで即全員死亡する事態を防ぐ。
export function intensityAt(peak: number, elapsed: number, duration: number): number {
  if (duration <= 0) return peak;
  const t = Math.max(0, Math.min(1, elapsed / duration));
  if (t < 0.3) return peak * (t / 0.3);
  if (t > 0.7) return peak * ((1 - t) / 0.3);
  return peak;
}
