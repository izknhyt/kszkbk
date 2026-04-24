import { BUILDINGS } from '../city/buildings';
import { DEATH_CAUSES } from '../sim/deaths';
import type { WorldState } from '../sim/world';
import { averageLifespan, buildingCost, getUpgradeInfo, populationCap, totalDexCount, uniqueDexFound, WEATHER_ICON, WEATHER_LABEL } from '../sim/world';
import { DAY_PHASE_LABEL, SEASON_LABEL } from '../sim/events';
import { RANK_DEFS, nextRank } from '../sim/rank';
import type { DeathCauseId } from '../types';
import { CONFIG, type TimeScale } from '../config';

export interface UICallbacks {
  onBuild: (defId: string) => void;
  onUpgrade: (defId: string) => void;
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

// 危険天候（赤マーカー対象）
const DANGEROUS_WEATHER = new Set(['storm', 'heatwave', 'blizzard', 'drought']);

function renderStats(w: WorldState, cb: UICallbacks) {
  byId('stat-points').textContent = String(w.points);
  byId('stat-pop').textContent = String(w.chibis.length);
  byId('stat-cap').textContent = String(populationCap(w));
  byId('stat-deaths').textContent = String(w.totalDeaths);
  byId('stat-season').textContent = `${SEASON_LABEL[w.season]} ${w.dayCount}日目 ${DAY_PHASE_LABEL[w.dayPhase]}`;

  // 資源は updateResourceBar() (main.ts) で管理するが、
  // fallback として stat-* の値も保持（ui.ts が先に呼ばれる場合）
  const resIds = ['food','water','wood','stone'] as const;
  for (const k of resIds) {
    const el = document.getElementById(`stat-${k}`);
    if (el) el.textContent = String(Math.floor(w.resources[k]));
  }
  const optIds: Array<[string, keyof typeof w.resources]> = [
    ['plank','plank'],['power','power'],['brick','brick'],
    ['wool','wool'],['cloth','cloth'],['soil','soil'],
  ];
  for (const [id, key] of optIds) {
    const el = document.getElementById(`stat-${id}`);
    if (el) el.textContent = String(Math.floor(w.resources[key] ?? 0));
  }

  // 3日予報（forecast-row の各セル）
  const DANGER = DANGEROUS_WEATHER;
  const forecast = [w.weather, ...w.weatherForecast.filter((e) => e.dayOffset > 0)].slice(0, 3);
  for (let i = 0; i < 3; i++) {
    const fc = forecast[i];
    const iconEl = document.getElementById(`fc-icon-${i}`);
    const dayEl = iconEl?.closest('.fc-day');
    if (fc && iconEl) {
      iconEl.textContent = WEATHER_ICON[fc.kind] ?? '?';
      dayEl?.classList.toggle('danger', DANGER.has(fc.kind));
    }
  }
  // 旧 weather-row（後方互換、HTML から削除済みだが null セーフで保持）
  const weatherNow = document.getElementById('weather-now');
  if (weatherNow) weatherNow.textContent = `${WEATHER_ICON[w.weather.kind]} ${WEATHER_LABEL[w.weather.kind]}`;
  const weatherFc = document.getElementById('weather-fc');
  if (weatherFc) {
    const future = w.weatherForecast.filter((e) => e.dayOffset > 0).slice(0, 2);
    weatherFc.textContent = future.map((e) => `→${WEATHER_ICON[e.kind]}`).join('');
  }
  byId('stat-gen').textContent = String(w.totalBirths);
  byId('stat-stomp').textContent = String(w.stompCount);
  const wolvesKilledEl = document.getElementById('stat-wolves-killed');
  if (wolvesKilledEl) wolvesKilledEl.textContent = String(w.wolvesKilled ?? 0);
  const wolfBitesEl = document.getElementById('stat-wolf-bites');
  if (wolfBitesEl) wolfBitesEl.textContent = String(w.dex?.wolf_bite?.count ?? 0);
  // 統計：平均寿命 / 最長寿 / 最短寿
  const avgEl = document.getElementById('stat-avg-life');
  const longEl = document.getElementById('stat-longest-life');
  const shortEl = document.getElementById('stat-shortest-life');
  if (avgEl) avgEl.textContent = `${averageLifespan(w).toFixed(1)}s`;
  if (longEl) longEl.textContent = w.longestLifeSec > 0
    ? `${Math.floor(w.longestLifeSec)}s (${w.longestLifeName})`
    : '—';
  if (shortEl) shortEl.textContent = w.shortestLifeSec !== Infinity
    ? `${Math.floor(w.shortestLifeSec)}s (${w.shortestLifeName})`
    : '—';
  byId('stat-tick').textContent = String(w.tick);
  byId('stat-time').textContent = `${Math.floor(w.timeSec)}s`;

  // 村ランク表示と次ランクへの進捗
  const rankDef = RANK_DEFS[w.villageRank];
  byId('stat-rank').textContent = rankDef.name;
  byId('stat-village-lv').textContent = String(w.villageLv);
  const next = nextRank(w.villageRank);
  if (next) {
    const nextDef = RANK_DEFS[next];
    const progress = nextDef.progress({
      totalDeaths: w.totalDeaths,
      uniqueDexFound: uniqueDexFound(w),
      stompCount: w.stompCount,
    });
    byId('rank-progress').textContent = `${nextDef.name} まで：${nextDef.requirement}（${Math.floor(progress * 100)}%）`;
    const bar = byId('rank-bar-fill');
    bar.style.width = `${Math.floor(progress * 100)}%`;
  } else {
    byId('rank-progress').textContent = '最終ランク到達。全要素解禁済み。';
    byId('rank-bar-fill').style.width = '100%';
  }

  const speed = cb.getSpeed();
  const host = byId('speed-buttons');
  for (const btn of host.querySelectorAll<HTMLButtonElement>('button')) {
    btn.classList.toggle('active', Number(btn.dataset.speed) === speed);
  }
}

function renderBuildList(w: WorldState, cb: UICallbacks) {
  const host = byId('build-list');
  if (host.children.length === 0) {
    // セクションタイトルを一度だけ追加
    const title = document.createElement('div');
    title.className = 'build-section-title';
    title.style.marginTop = '8px';
    title.textContent = '🏛 建物（P コスト）';
    host.appendChild(title);
  }
  // 既存 build-row だけクリアして再描画
  Array.from(host.querySelectorAll('.build-row')).forEach((el) => el.remove());

  for (const def of Object.values(BUILDINGS)) {
    const cost = buildingCost(w, def.id);
    const owned = w.buildings.filter((b) => b.defId === def.id);
    const upgrade = getUpgradeInfo(w, def.id);
    const row = document.createElement('div');
    row.className = 'build-row';
    // ツールチップ用にコストと効果を data 属性に持たせる
    row.dataset.buildId = def.id;

    // Lv 表示（平均Lv or "Lv1,1,2" 列）
    let lvText = '';
    if (owned.length > 0) {
      const lvs = owned.map((b) => b.level).sort((a, b) => a - b);
      lvText = ` <small>Lv ${lvs.join(',')}</small>`;
    }

    const canBuild = w.points >= cost;
    const buildBtn = `<button class="build-btn" ${canBuild ? '' : 'disabled'} title="${canBuild ? '' : 'P が足りないわふ'}">建${cost}P</button>`;
    let upgradeBtn = '';
    if (upgrade) {
      if (upgrade.capped) {
        upgradeBtn = `<button class="upgrade-btn" disabled title="村ランクで頭打ち">Max</button>`;
      } else {
        upgradeBtn = `<button class="upgrade-btn" ${upgrade.possible ? '' : 'disabled'} title="Lv${upgrade.targetLevel} へ強化">▲${upgrade.cost}P</button>`;
      }
    }

    row.innerHTML = `
      <div>
        <div class="name">${escape(def.name)} <small>x${owned.length}</small>${lvText}</div>
        <div class="desc">${escape(def.desc)}</div>
      </div>
      <div class="build-actions">${buildBtn}${upgradeBtn}</div>
    `;
    row.querySelector<HTMLButtonElement>('.build-btn')!.addEventListener('click', () => cb.onBuild(def.id));
    const ub = row.querySelector<HTMLButtonElement>('.upgrade-btn');
    if (ub && upgrade && !upgrade.capped) {
      ub.addEventListener('click', () => cb.onUpgrade(def.id));
    }
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
  const allIds = Object.keys(DEATH_CAUSES) as DeathCauseId[];
  const buckets: Array<{ title: string; ids: DeathCauseId[] }> = [
    { title: 'Common', ids: allIds.filter((id) => !DEATH_CAUSES[id]!.rare && !DEATH_CAUSES[id]!.uncommon) },
    { title: 'Uncommon（特性条件）', ids: allIds.filter((id) => DEATH_CAUSES[id]!.uncommon) },
    { title: 'Rare', ids: allIds.filter((id) => DEATH_CAUSES[id]!.rare) },
  ];
  for (const bucket of buckets) {
    if (bucket.ids.length === 0) continue;
    const foundInBucket = bucket.ids.filter((id) => w.dex[id].count > 0).length;
    const header = document.createElement('div');
    header.className = 'dex-bucket-header';
    header.innerHTML = `<span>${escape(bucket.title)}</span><span class="count">${foundInBucket}/${bucket.ids.length}</span>`;
    host.appendChild(header);
    for (const id of bucket.ids) {
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
