// Headless simulation for balance / content audit.
// Runs N simulated minutes of the real sim loop (same code the game uses).

import {
  createWorld,
  tickWorld,
  buildAt,
  buildingCost,
  uniqueDexFound,
  totalDexCount,
  triggerOndo,
  triggerBokaigi,
  triggerFire,
} from '../src/sim/world';
import { BUILDINGS } from '../src/city/buildings';
import { DEATH_CAUSES } from '../src/sim/deaths';
import { CONFIG } from '../src/config';
import type { DeathCauseId } from '../src/types';

const SIM_MINUTES = 60;
const INTERACT = process.argv.includes('--interact');

const w = createWorld({ w: 800, h: 500 });
const dt = CONFIG.TICK_DT;
const totalTicks = Math.floor((SIM_MINUTES * 60) / dt);

const firstDex: Partial<Record<DeathCauseId, number>> = {};
const buildingsBought: Array<{ sec: number; id: string; cost: number }> = [];
const secondaryInteractions: Array<{ sec: number; what: string }> = [];

function tryAutoBuild() {
  const candidates = Object.values(BUILDINGS).map((def) => ({
    id: def.id,
    cost: buildingCost(w, def.id),
  }));
  candidates.sort((a, b) => a.cost - b.cost);
  for (const c of candidates) {
    if (w.points >= c.cost) {
      const ok = buildAt(w, c.id);
      if (ok) {
        buildingsBought.push({ sec: Math.floor(w.timeSec), id: c.id, cost: c.cost });
        return;
      }
    }
  }
}

let nextInteract = 30;

for (let t = 0; t < totalTicks; t++) {
  tickWorld(w, dt);

  for (const id of w.newDiscoveries) {
    if (!(id in firstDex)) firstDex[id] = Math.floor(w.timeSec);
  }
  w.newDiscoveries = [];

  if (t % 20 === 0) tryAutoBuild();

  if (INTERACT && w.timeSec >= nextInteract) {
    // simulate player firing an event every 30s
    const picks = [triggerOndo, triggerBokaigi, triggerFire];
    const f = picks[Math.floor(Math.random() * picks.length)]!;
    f(w);
    secondaryInteractions.push({ sec: Math.floor(w.timeSec), what: f.name });
    nextInteract += 30;
  }
}

const totalDex = totalDexCount();
const rate = (w.totalDeaths / SIM_MINUTES).toFixed(1);
const ppm = (w.points / SIM_MINUTES).toFixed(0);

console.log('');
console.log('====================================================================');
console.log(`  HEADLESS SIM REPORT  (${SIM_MINUTES} min,  interact=${INTERACT})`);
console.log('====================================================================');
console.log(`  births         : ${w.totalBirths}`);
console.log(`  deaths         : ${w.totalDeaths}   (${rate}/min)`);
console.log(`  points (final) : ${w.points}        (+${ppm}/min gross inflow)`);
console.log(`  dex            : ${uniqueDexFound(w)} / ${totalDex}`);
console.log(`  stomps         : ${w.stompCount}`);
console.log(`  pop cap final  : ${w.chibis.length} alive, cap = ${w.baseCap + w.buildings.reduce((a, b) => {
  const def = BUILDINGS[b.defId];
  const m = def?.effect.match(/pop\+(\d+)/);
  return a + (m ? Number(m[1]) * b.level : 0);
}, 0)}`);
console.log(`  season final   : ${w.season}`);
console.log('');

console.log('--- First discovery time (seconds) ---');
const sortedDex = Object.entries(firstDex).sort((a, b) => a[1]! - b[1]!);
for (const [id, sec] of sortedDex) {
  console.log(`   ${String(sec).padStart(5)}s   ${id.padEnd(16)}  "${DEATH_CAUSES[id as DeathCauseId]!.title}"`);
}
const missing = (Object.keys(DEATH_CAUSES) as DeathCauseId[]).filter((id) => !(id in firstDex));
if (missing.length) {
  console.log('   UNDISCOVERED:');
  for (const id of missing) console.log(`     ---     ${id.padEnd(16)}  "${DEATH_CAUSES[id]!.title}"`);
}
console.log('');

console.log('--- Buildings bought (auto) ---');
for (const b of buildingsBought) {
  console.log(`   ${String(b.sec).padStart(5)}s   ${b.id.padEnd(10)}  ${b.cost}P`);
}
console.log(`   (${buildingsBought.length} total purchases)`);
console.log('');

console.log('--- Dex counts (total kills by cause) ---');
const rows = (Object.keys(DEATH_CAUSES) as DeathCauseId[])
  .map((id) => ({ id, count: w.dex[id].count }))
  .sort((a, b) => b.count - a.count);
for (const r of rows) {
  console.log(`   ${String(r.count).padStart(5)}   ${r.id.padEnd(16)}  ${DEATH_CAUSES[r.id]!.title}`);
}
console.log('');

console.log('--- Building spread ---');
const counts: Record<string, number> = {};
for (const b of w.buildings) counts[b.defId] = (counts[b.defId] ?? 0) + 1;
for (const [id, c] of Object.entries(counts)) {
  console.log(`   ${id.padEnd(10)}  x${c}`);
}
console.log('');

if (INTERACT) {
  console.log(`--- Player interactions simulated: ${secondaryInteractions.length}`);
  for (const i of secondaryInteractions.slice(0, 6)) {
    console.log(`   ${i.sec}s  ${i.what}`);
  }
  console.log('');
}
