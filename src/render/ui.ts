import { BUILDINGS } from '../city/buildings';
import { DEATH_CAUSES } from '../sim/deaths';
import type { WorldState } from '../sim/world';
import { buildingCost, populationCap, totalDexCount, uniqueDexFound } from '../sim/world';
import { SEASON_LABEL } from '../sim/events';
import type { DeathCauseId } from '../types';

export interface UICallbacks {
  onBuild: (defId: string) => void;
  onOndo: () => void;
  onBokaigi: () => void;
}

export function bindUI(world: WorldState, cb: UICallbacks) {
  const ondoBtn = document.getElementById('btn-ondo') as HTMLButtonElement;
  const bokaiBtn = document.getElementById('btn-bokai') as HTMLButtonElement;
  ondoBtn.addEventListener('click', () => cb.onOndo());
  bokaiBtn.addEventListener('click', () => cb.onBokaigi());

  renderBuildList(world, cb);
  renderDex(world);
  renderRecent(world);
  renderStats(world);
}

export function refreshUI(world: WorldState, cb: UICallbacks) {
  renderStats(world);
  renderBuildList(world, cb);
  renderRecent(world);
  renderDex(world);
}

function renderStats(w: WorldState) {
  byId('stat-points').textContent = String(w.points);
  byId('stat-pop').textContent = String(w.chibis.length);
  byId('stat-cap').textContent = String(populationCap(w));
  byId('stat-deaths').textContent = String(w.totalDeaths);
  byId('stat-season').textContent = SEASON_LABEL[w.season];
}

function renderBuildList(w: WorldState, cb: UICallbacks) {
  const host = byId('build-list');
  host.innerHTML = '';
  for (const def of Object.values(BUILDINGS)) {
    const cost = buildingCost(w, def.id);
    const owned = w.buildings.filter((b) => b.defId === def.id).length;
    const row = document.createElement('div');
    row.className = 'build-row';
    row.innerHTML = `
      <div>
        <div class="name">${escape(def.name)} <small>x${owned}</small></div>
        <div class="desc">${escape(def.desc)}</div>
      </div>
      <button ${w.points < cost ? 'disabled' : ''}>建${cost}P</button>
    `;
    row.querySelector('button')!.addEventListener('click', () => cb.onBuild(def.id));
    host.appendChild(row);
  }
}

function renderRecent(w: WorldState) {
  const host = byId('recent-deaths');
  host.innerHTML = '';
  for (const e of w.recentDeaths.slice(0, 12)) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="name">${escape(e.name)}</span> — <span class="cause">${escape(DEATH_CAUSES[e.causeId]!.title)}</span>`;
    host.appendChild(li);
  }
}

function renderDex(w: WorldState) {
  const host = byId('dex-list');
  host.innerHTML = '';
  byId('dex-count').textContent = `${uniqueDexFound(w)}/${totalDexCount()}`;
  for (const id of Object.keys(DEATH_CAUSES) as DeathCauseId[]) {
    const entry = w.dex[id];
    const def = DEATH_CAUSES[id]!;
    const row = document.createElement('div');
    const locked = entry.count === 0;
    row.className = `dex-row ${locked ? 'locked' : ''}`;
    const label = locked ? '???' : escape(def.title);
    row.innerHTML = `<span>${label}</span><span class="count">${entry.count}</span>`;
    if (!locked && entry.firstContext) {
      row.title = `初発見: ${entry.firstVictim}\n${entry.firstContext}`;
    }
    host.appendChild(row);
  }
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] ?? c));
}
