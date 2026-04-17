import { BUILDINGS } from '../city/buildings';
import { DEATH_CAUSES } from '../sim/deaths';
import type { WorldState } from '../sim/world';
import { buildingCost, populationCap, totalDexCount, uniqueDexFound } from '../sim/world';
import { SEASON_LABEL } from '../sim/events';
import type { DeathCauseId } from '../types';
import { CONFIG, type TimeScale } from '../config';

export interface UICallbacks {
  onBuild: (defId: string) => void;
  onOndo: () => void;
  onBokaigi: () => void;
  onFire: () => void;
  onSpawn: () => void;
  onSave: () => void;
  onReset: () => void;
  onSpeed: (n: TimeScale) => void;
  getSpeed: () => number;
}

export function bindUI(world: WorldState, cb: UICallbacks) {
  byBtn('btn-ondo').addEventListener('click', () => cb.onOndo());
  byBtn('btn-bokai').addEventListener('click', () => cb.onBokaigi());
  byBtn('btn-fire').addEventListener('click', () => cb.onFire());
  byBtn('btn-spawn').addEventListener('click', () => cb.onSpawn());
  byBtn('btn-save').addEventListener('click', () => cb.onSave());
  byBtn('btn-reset').addEventListener('click', () => {
    if (confirm('セーブを消してリロードしますか？')) cb.onReset();
  });

  const speedHost = byId('speed-buttons');
  speedHost.innerHTML = '';
  for (const n of CONFIG.DEFAULT_TIME_SCALES) {
    const b = document.createElement('button');
    b.textContent = `×${n}`;
    b.dataset.speed = String(n);
    b.addEventListener('click', () => cb.onSpeed(n));
    speedHost.appendChild(b);
  }

  // tab switching
  const tabs = document.querySelectorAll<HTMLElement>('.tab');
  const panels = document.querySelectorAll<HTMLElement>('.tab-panel');
  for (const t of tabs) {
    t.addEventListener('click', () => {
      const target = t.dataset.tab;
      for (const tt of tabs) tt.classList.toggle('active', tt === t);
      for (const p of panels) p.classList.toggle('active', p.dataset.panel === target);
    });
  }

  renderBuildList(world, cb);
  renderDex(world);
  renderRecent(world);
  renderStats(world, cb);
}

export function refreshUI(world: WorldState, cb: UICallbacks) {
  renderStats(world, cb);
  renderBuildList(world, cb);
  renderRecent(world);
  renderDex(world);
}

function renderStats(w: WorldState, cb: UICallbacks) {
  byId('stat-points').textContent = String(w.points);
  byId('stat-pop').textContent = String(w.chibis.length);
  byId('stat-cap').textContent = String(populationCap(w));
  byId('stat-deaths').textContent = String(w.totalDeaths);
  byId('stat-season').textContent = SEASON_LABEL[w.season];
  byId('stat-gen').textContent = String(w.totalBirths);
  byId('stat-stomp').textContent = String(w.stompCount);
  byId('stat-tick').textContent = String(w.tick);
  byId('stat-time').textContent = `${Math.floor(w.timeSec)}s`;

  const speed = cb.getSpeed();
  const host = byId('speed-buttons');
  for (const btn of host.querySelectorAll<HTMLButtonElement>('button')) {
    btn.classList.toggle('active', Number(btn.dataset.speed) === speed);
  }
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
  for (const e of w.recentDeaths.slice(0, 20)) {
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

function byBtn(id: string): HTMLButtonElement {
  return byId(id) as HTMLButtonElement;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] ?? c));
}
