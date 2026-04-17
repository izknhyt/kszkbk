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
import { HAZARDS, hazardActiveInSeason, pointInZone } from './hazards';
import { CONFIG } from '../config';

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
  totalBirths: number; // 世代カウンタ的指標
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
    secondsPerSeason: CONFIG.SECONDS_PER_SEASON,
    season: 'spring',
    furanaPos: { x: bounds.w / 2, y: 200 },
    chibis: [],
    corpses: [],
    maxCorpses: CONFIG.MAX_CORPSES_VISIBLE,
    buildings: [],
    points: 0,
    totalDeaths: 0,
    totalBirths: 0,
    dex: createDex(),
    recentDeaths: [],
    nameSet: new Set(),
    bounds,
    spawnCooldown: 2,
    baseSpawnInterval: CONFIG.BASE_SPAWN_INTERVAL_SEC,
    baseCap: CONFIG.BASE_POP_CAP,
    event: null,
    pointMultiplier: CONFIG.GLOBAL_POINT_MULT_BASE,
    fireChance: CONFIG.FIRE_CHANCE_BASE,
    ondoChance: CONFIG.ONDO_CHANCE_BASE,
  };
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

function applyBuildingMods(w: WorldState) {
  let mult = CONFIG.GLOBAL_POINT_MULT_BASE;
  let fire = CONFIG.FIRE_CHANCE_BASE;
  let ondo = CONFIG.ONDO_CHANCE_BASE;
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

export function kill(w: WorldState, c: Chibiwafu, causeId: DeathCauseId) {
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
  w.spawnCooldown -= CONFIG.TICK_DT;
  if (w.spawnCooldown > 0) return;
  forceSpawn(w);
  w.spawnCooldown = w.baseSpawnInterval + Math.random() * CONFIG.SPAWN_INTERVAL_JITTER_SEC;
}

export function forceSpawn(w: WorldState) {
  const name = generateName(w.nameSet);
  w.nameSet.add(name);
  const jitter = () => (Math.random() - 0.5) * 40;
  const child = spawnChibiwafu({
    name,
    birthTick: w.tick,
    pos: { x: w.furanaPos.x + jitter(), y: w.furanaPos.y + 30 + Math.abs(jitter()) },
    maxAgeSec: CONFIG.CHIBI_MAX_AGE_MIN_SEC + Math.random() * CONFIG.CHIBI_MAX_AGE_RANGE_SEC,
  });
  setState(child, 'surprised', 1.5);
  w.chibis.push(child);
  w.totalBirths += 1;
}

function maybeTriggerOndo(w: WorldState) {
  if (w.event) return;
  if (Math.random() < w.ondoChance) {
    w.event = { kind: 'ondo', remaining: CONFIG.ONDO_DURATION_SEC, intensity: CONFIG.ONDO_KILL_RATE };
  }
}

function maybeTriggerFire(w: WorldState) {
  if (w.event) return;
  if (Math.random() < w.fireChance) {
    w.event = { kind: 'fire', remaining: CONFIG.FIRE_DURATION_SEC, intensity: CONFIG.FIRE_KILL_RATE };
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
  w.event = { kind: 'ondo', remaining: CONFIG.ONDO_DURATION_SEC, intensity: CONFIG.ONDO_KILL_RATE + 0.05 };
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
  w.event = { kind: 'fire', remaining: CONFIG.FIRE_DURATION_SEC, intensity: CONFIG.FIRE_KILL_RATE + 0.05 };
}

function runHazards(w: WorldState, c: Chibiwafu, dt: number): boolean {
  const insideSafe = distance(c.pos, w.furanaPos) < CONFIG.SAFE_ZONE_R;
  for (const zone of HAZARDS) {
    if (!hazardActiveInSeason(zone, w.season)) continue;
    if (insideSafe && !zone.bypassSafeZone) continue;
    if (!pointInZone(zone, c.pos)) continue;
    if (Math.random() < zone.ratePerSec * dt) {
      kill(w, c, zone.causeId);
      return true;
    }
  }
  return false;
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
  runHazards(w, c, dt);
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
