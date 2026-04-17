import type { Chibiwafu, DeathCauseId, DexEntry, PlacedBuilding, Season, Vec2 } from '../types';
import { DEATH_CAUSES } from './deaths';
import { BUILDINGS } from '../city/buildings';
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
import { SEASONS, seasonFromTime, type GlobalEvent } from './events';

export interface DeathLogEntry {
  tick: number;
  name: string;
  causeId: DeathCauseId;
  text: string;
}

export interface WorldState {
  tick: number;
  timeSec: number;
  secondsPerSeason: number;
  season: Season;
  furanaPos: Vec2;
  chibis: Chibiwafu[];
  corpses: Chibiwafu[];
  maxCorpses: number;
  buildings: PlacedBuilding[];
  points: number;
  totalDeaths: number;
  dex: Record<DeathCauseId, DexEntry>;
  recentDeaths: DeathLogEntry[];
  nameSet: Set<string>;
  bounds: { w: number; h: number };
  spawnCooldown: number;
  baseSpawnInterval: number;
  baseCap: number;
  event: GlobalEvent | null;
  pointMultiplier: number;
  fireChance: number;
  ondoChance: number;
}

const SAFE_ZONE = { x: 350, y: 180, r: 90 };
const MUD_RIVER_Y = 420;
const BRIDGE_X = 200;

function createDex(): Record<DeathCauseId, DexEntry> {
  const out = {} as Record<DeathCauseId, DexEntry>;
  for (const id of Object.keys(DEATH_CAUSES) as DeathCauseId[]) {
    out[id] = { id, count: 0 };
  }
  return out;
}

export function createWorld(bounds: { w: number; h: number }): WorldState {
  return {
    tick: 0,
    timeSec: 0,
    secondsPerSeason: 60,
    season: 'spring',
    furanaPos: { x: bounds.w / 2, y: 200 },
    chibis: [],
    corpses: [],
    maxCorpses: 40,
    buildings: [],
    points: 0,
    totalDeaths: 0,
    dex: createDex(),
    recentDeaths: [],
    nameSet: new Set(),
    bounds,
    spawnCooldown: 2,
    baseSpawnInterval: 4,
    baseCap: 8,
    event: null,
    pointMultiplier: 1.0,
    fireChance: 0,
    ondoChance: 0,
  };
}

export function populationCap(w: WorldState): number {
  let cap = w.baseCap;
  for (const b of w.buildings) {
    const def = BUILDINGS[b.defId];
    if (!def) continue;
    if (def.effect.includes('pop+')) {
      const m = /pop\+(\d+)/.exec(def.effect);
      if (m) cap += Number(m[1]) * b.level;
    }
  }
  return cap;
}

function applyBuildingMods(w: WorldState) {
  let mult = 1.0;
  let fire = 0;
  let ondo = 0;
  for (const b of w.buildings) {
    const def = BUILDINGS[b.defId];
    if (!def) continue;
    const m = /pmult\+([0-9.]+)/.exec(def.effect);
    if (m) mult += Number(m[1]) * b.level;
    if (def.id === 'kouba') fire += 0.0015 * b.level;
    if (def.id === 'noukou') fire += 0.0003 * b.level;
    if (def.id === 'taiko') ondo += 0.002 * b.level;
  }
  w.pointMultiplier = mult;
  w.fireChance = fire;
  w.ondoChance = ondo;
}

function logDeath(w: WorldState, c: Chibiwafu, causeId: DeathCauseId) {
  const cause = DEATH_CAUSES[causeId]!;
  const text = cause.template(c.name);
  const entry = w.dex[causeId];
  entry.count += 1;
  if (entry.count === 1) {
    entry.firstVictim = c.name;
    entry.firstContext = text;
    entry.firstDiscoveredTick = w.tick;
  }
  w.recentDeaths.unshift({ tick: w.tick, name: c.name, causeId, text });
  if (w.recentDeaths.length > 24) w.recentDeaths.pop();
  const gained = Math.round(cause.points * w.pointMultiplier);
  w.points += gained;
  w.totalDeaths += 1;
}

function kill(w: WorldState, c: Chibiwafu, causeId: DeathCauseId) {
  if (!isAlive(c)) return;
  c.state = 'dead';
  c.deathTick = w.tick;
  c.deathCauseId = causeId;
  logDeath(w, c, causeId);
}

function spawnIfRoom(w: WorldState) {
  const living = w.chibis.filter(isAlive).length;
  const cap = populationCap(w);
  if (living >= cap) return;
  w.spawnCooldown -= 1;
  if (w.spawnCooldown > 0) return;
  const name = generateName(w.nameSet);
  w.nameSet.add(name);
  const jitter = () => (Math.random() - 0.5) * 40;
  const child = spawnChibiwafu({
    name,
    birthTick: w.tick,
    pos: { x: w.furanaPos.x + jitter(), y: w.furanaPos.y + 30 + Math.abs(jitter()) },
    maxAgeSec: 40 + Math.random() * 80,
  });
  setState(child, 'surprised', 1.5);
  w.chibis.push(child);
  w.spawnCooldown = w.baseSpawnInterval + Math.random() * 2;
}

function maybeTriggerOndo(w: WorldState) {
  if (w.event) return;
  if (Math.random() < w.ondoChance) {
    w.event = { kind: 'ondo', remaining: 6, intensity: 0.35 };
  }
}

function maybeTriggerFire(w: WorldState) {
  if (w.event) return;
  if (Math.random() < w.fireChance) {
    w.event = { kind: 'fire', remaining: 5, intensity: 0.2 };
  }
}

function resolveEvent(w: WorldState, dt: number) {
  if (!w.event) return;
  w.event.remaining -= dt;
  const intensity = w.event.intensity;
  for (const c of w.chibis) {
    if (!isAlive(c)) continue;
    if (w.event.kind === 'ondo') {
      setState(c, 'dazed', 0.5);
      if (Math.random() < intensity * dt) {
        kill(w, c, 'ondo');
      }
    } else if (w.event.kind === 'fire') {
      if (Math.random() < intensity * dt) {
        kill(w, c, 'fire');
      } else if (Math.random() < 0.1) {
        setState(c, 'hurt', 1);
      }
    }
  }
  if (w.event.remaining <= 0) {
    w.event = null;
  }
}

export function triggerOndo(w: WorldState) {
  w.event = { kind: 'ondo', remaining: 6, intensity: 0.4 };
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

function ambientHazards(w: WorldState, c: Chibiwafu, dt: number) {
  const insideSafe = distance(c.pos, { x: SAFE_ZONE.x, y: SAFE_ZONE.y }) < SAFE_ZONE.r;
  if (!insideSafe) {
    if (c.pos.y > MUD_RIVER_Y - 6) {
      if (Math.random() < 0.1 * dt) { kill(w, c, 'mudriver'); return; }
    }
    if (c.pos.y > MUD_RIVER_Y - 30 && Math.abs(c.pos.x - BRIDGE_X) < 18) {
      if (Math.random() < 0.08 * dt) { kill(w, c, 'bridge'); return; }
    }
  }
  if (Math.random() < 0.003 * dt) {
    kill(w, c, 'stonebread');
    return;
  }
  if (Math.random() < 0.0008 * dt) {
    kill(w, c, 'philosophy');
  }
}

function updateChibi(w: WorldState, c: Chibiwafu, dt: number) {
  if (!isAlive(c)) return;
  c.ageSec += dt;
  if (c.ageSec >= c.maxAgeSec) {
    kill(w, c, 'roushuai');
    return;
  }
  c.stateTimer -= dt;
  if (c.stateTimer <= 0 && c.state !== 'dead') {
    const roll = Math.random();
    if (roll < 0.05) setState(c, 'cry', 0.8);
    else if (roll < 0.08) setState(c, 'dazed', 0.6);
    else if (roll < 0.10) setState(c, 'sleep', 1.5);
    else setState(c, 'idle', 0.4 + Math.random());
  }
  if (c.state === 'idle' || c.state === 'surprised' || c.state === 'angry') {
    wanderStep(c, dt, w.bounds);
  }
  ambientHazards(w, c, dt);
}

function compactCorpses(w: WorldState) {
  const newlyDead = w.chibis.filter((c) => c.state === 'dead');
  if (newlyDead.length > 0) {
    w.corpses.push(...newlyDead);
    w.chibis = w.chibis.filter((c) => c.state !== 'dead');
    while (w.corpses.length > w.maxCorpses) w.corpses.shift();
  }
}

export function tickWorld(w: WorldState, dt: number) {
  w.tick += 1;
  w.timeSec += dt;
  w.season = seasonFromTime(w.timeSec, w.secondsPerSeason);
  applyBuildingMods(w);
  spawnIfRoom(w);
  maybeTriggerOndo(w);
  maybeTriggerFire(w);
  resolveEvent(w, dt);
  for (const c of w.chibis) updateChibi(w, c, dt);
  compactCorpses(w);
}

export function buildingCost(w: WorldState, defId: string): number {
  const def = BUILDINGS[defId];
  if (!def) return Infinity;
  const count = w.buildings.filter((b) => b.defId === defId).length;
  return Math.round(def.cost * Math.pow(def.costGrowth, count));
}

export function buildAt(w: WorldState, defId: string): boolean {
  const cost = buildingCost(w, defId);
  if (w.points < cost) return false;
  const def = BUILDINGS[defId];
  if (!def) return false;
  w.points -= cost;
  const count = w.buildings.filter((b) => b.defId === defId).length;
  const row = Math.floor(count / 4);
  const col = count % 4;
  const baseX = 60 + col * 70;
  const baseY = 300 + row * 50;
  w.buildings.push({ defId, level: 1, pos: { x: baseX, y: baseY } });
  return true;
}

export function uniqueDexFound(w: WorldState): number {
  return Object.values(w.dex).filter((d) => d.count > 0).length;
}

export function totalDexCount(): number {
  return SEASONS.length > 0 ? Object.keys(DEATH_CAUSES).length : 0;
}

export { resetIdCounter, peekNextId };
