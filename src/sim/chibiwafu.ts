import type { ChibiState, Chibiwafu, TraitId, Vec2 } from '../types';
import { CONFIG } from '../config';

let nextId = 1;

export function resetIdCounter(n: number) { nextId = n; }
export function peekNextId() { return nextId; }

export interface SpawnArgs {
  name: string;
  birthTick: number;
  pos: Vec2;
  maxAgeSec: number;
  traits: TraitId[];
}

export function spawnChibiwafu(args: SpawnArgs): Chibiwafu {
  return {
    id: nextId++,
    name: args.name,
    birthTick: args.birthTick,
    ageSec: 0,
    pos: { ...args.pos },
    target: null,
    state: 'idle',
    stateTimer: 0,
    deathTick: null,
    deathCauseId: null,
    speed: CONFIG.CHIBI_SPEED_MIN + Math.random() * CONFIG.CHIBI_SPEED_RANGE,
    maxAgeSec: args.maxAgeSec,
    faceLeft: Math.random() < 0.5,
    traits: [...args.traits],
  };
}

export function setState(c: Chibiwafu, s: ChibiState, seconds: number) {
  c.state = s;
  c.stateTimer = seconds;
}

export function isAlive(c: Chibiwafu): boolean {
  return c.state !== 'dead';
}

// 陸地の上限 y（これより下は泥川）。wanderStep の target 計算で利用。
// 川に落ちる奴はたまにはいる（冒険家など）ので target 抽選で 6% だけ越境を許す。
const DRY_Y_LIMIT = 410;
const RIVER_TRESPASS_CHANCE = 0.06;

export function wanderStep(c: Chibiwafu, dt: number, bounds: { w: number; h: number }) {
  if (!c.target || distance(c.pos, c.target) < 4) {
    const margin = 30;
    const allowRiver = Math.random() < RIVER_TRESPASS_CHANCE || c.traits.includes('bouken');
    const maxY = allowRiver ? bounds.h - margin : Math.min(DRY_Y_LIMIT, bounds.h - margin);
    c.target = {
      x: margin + Math.random() * (bounds.w - margin * 2),
      y: margin + Math.random() * (maxY - margin),
    };
    c.faceLeft = c.target.x < c.pos.x;
  }
  const dx = c.target.x - c.pos.x;
  const dy = c.target.y - c.pos.y;
  const d = Math.max(0.001, Math.hypot(dx, dy));
  c.pos.x += (dx / d) * c.speed * dt;
  c.pos.y += (dy / d) * c.speed * dt;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
