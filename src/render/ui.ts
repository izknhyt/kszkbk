// M2.1 Step 4.1: 旧 BUILDINGS の P-cost 建設リストは UI 描画停止。
// import は残すが renderBuildList は legacy 化で実体使用なし。
// import { BUILDINGS } from '../city/buildings';
// import { buildingCost, getUpgradeInfo } ... も同様に未使用に
import { DEATH_CAUSES } from '../sim/deaths';
import type { WorldState } from '../sim/world';
import { averageLifespan, populationCap, totalDexCount, uniqueDexFound, WEATHER_ICON, WEATHER_LABEL } from '../sim/world';
import { DAY_PHASE_LABEL, SEASON_LABEL } from '../sim/events';
import { RANK_DEFS, nextRank } from '../sim/rank';
import type { DeathCauseId } from '../types';
import { CONFIG, type TimeScale } from '../config';

export interface UICallbacks {
  onBuild: (defId: string) => void;
  onUpgrade: (defId: string) => void;
  onBokaigi: () => void;
  onFire: () => void;
  onSpawn: () => void;
  onSave: () => void;
  onReset: () => void;
  onSpeed: (n: TimeScale) => void;
  getSpeed: () => number;
}

export function bindUI(world: WorldState, cb: UICallbacks) {
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
  renderSigma8TimeHud(world);
}

// =========================================================================
// Σ-8 Time / Risk HUD（左上、最小骨格）
// SIGMA-8-UI-ASSET-SPEC.md の "Time / Risk HUD" 仕様に準拠。
// season / day / HH:MM / weather / 水位 / 崩落 / 次位相カウントダウン。
// =========================================================================
const PHASE_LABELS_SHORT: Record<string, string> = {
  morning: '昼まで',
  noon:    '夕まで',
  evening: '夜まで',
  night:   '朝まで',
};
function nextPhaseFromProgress(p: number): { label: string; remaining: number } {
  // dayProgress 0-1 → morning(0-0.25)/noon(0.25-0.55)/evening(0.55-0.80)/night(0.80-1.0)
  let nextThr: number;
  let phase: string;
  if (p < 0.25) { phase = 'morning'; nextThr = 0.25; }
  else if (p < 0.55) { phase = 'noon'; nextThr = 0.55; }
  else if (p < 0.80) { phase = 'evening'; nextThr = 0.80; }
  else { phase = 'night'; nextThr = 1.0; }
  const remaining = (nextThr - p) * CONFIG.SECONDS_PER_DAY;
  return { label: PHASE_LABELS_SHORT[phase] ?? '次まで', remaining };
}
function fmtMMSS(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return `${m}:${ss}`;
}
function fmtClockHHMM(progress: number): string {
  // progress 0-1 を 00:00-23:59 に写像
  const totalMin = Math.floor(progress * 24 * 60);
  const hh = String(Math.floor(totalMin / 60) % 24).padStart(2, '0');
  const mm = String(totalMin % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
function renderSigma8TimeHud(w: WorldState) {
  const root = document.getElementById('sigma8-time-hud');
  if (!root) return;
  const seasonEl = document.getElementById('s8-season');
  const dayEl = document.getElementById('s8-day');
  const clockEl = document.getElementById('s8-clock');
  const weatherEl = document.getElementById('s8-weather');
  const waterEl = document.getElementById('s8-water-risk');
  const collapseEl = document.getElementById('s8-collapse-risk');
  const phaseEl = document.getElementById('s8-phase-count');

  if (seasonEl) seasonEl.textContent = SEASON_LABEL[w.season];
  if (dayEl) dayEl.textContent = `${w.dayCount}日`;
  if (clockEl) clockEl.textContent = fmtClockHHMM(w.dayProgress);
  if (weatherEl) weatherEl.textContent = `${WEATHER_ICON[w.weather.kind]} ${WEATHER_LABEL[w.weather.kind]}`;

  // --- 水位リスク：terrain.waterLevel の最大値で判定 ---
  let maxWl = 0;
  let riskTiles = 0;
  if (w.terrain && w.terrain.length > 0) {
    for (const row of w.terrain) {
      for (const t of row) {
        if (t.isSea) continue;
        if (t.waterLevel > maxWl) maxWl = t.waterLevel;
        if (t.waterLevel >= 0.35) riskTiles++;
      }
    }
  }
  let waterLabel = '水位: 通常';
  let waterClass = '';
  if (maxWl >= 0.85) { waterLabel = `水位: 洪水危険 (${riskTiles})`; waterClass = 's8-danger'; }
  else if (maxWl >= 0.5) { waterLabel = `水位: 高い (${riskTiles})`; waterClass = 's8-warn'; }
  else if (maxWl >= 0.3) { waterLabel = `水位: やや高い`; waterClass = 's8-warn'; }
  if (waterEl) {
    waterEl.textContent = waterLabel;
    waterEl.className = waterClass;
  }
  root.classList.toggle('is-water-warn', maxWl >= 0.5);

  // --- 崩落リスク：stability < 0.5 のタイル数 ---
  let unstable = 0;
  if (w.terrain && w.terrain.length > 0) {
    for (const row of w.terrain) {
      for (const t of row) {
        if (!t.isSea && t.stability < 0.5) unstable++;
      }
    }
  }
  let collapseLabel = '崩落: なし';
  let collapseClass = '';
  if (unstable > 12) { collapseLabel = `崩落: 危険 (${unstable})`; collapseClass = 's8-danger'; }
  else if (unstable > 4) { collapseLabel = `崩落: 注意 (${unstable})`; collapseClass = 's8-warn'; }
  if (collapseEl) {
    collapseEl.textContent = collapseLabel;
    collapseEl.className = collapseClass;
  }
  root.classList.toggle('is-collapse-warn', unstable > 12);

  // --- 位相カウントダウン ---
  const np = nextPhaseFromProgress(w.dayProgress);
  if (phaseEl) phaseEl.textContent = `${np.label} ${fmtMMSS(np.remaining)}`;

  root.classList.toggle('is-night', w.dayPhase === 'night');
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

// M2.1 Step 4.1: 旧 `BUILDINGS` の P-cost 建設リストは廃止予定。
// 新建設は main.ts の Feature 建設パネル（build-cat-tabs / build-cards）が担う。
// 既存セーブ由来の `w.buildings` 数値効果は legacy として残るが、ここから新規建設できない。
// 旧 row 描画ロジックは履歴のため関数内に保持するが unreachable。
function renderBuildList(_w: WorldState, _cb: UICallbacks) {
  const host = byId('build-list');
  host.innerHTML = '';
  return;
  // --- LEGACY M2.1 旧描画ロジック（呼ばれない、復元するならこのコメント解除）---
  /*
  const host2 = byId('build-list');
  if (host2.children.length === 0) {
    const title = document.createElement('div');
    title.className = 'build-section-title';
    title.style.marginTop = '8px';
    title.textContent = '🏛 建物（P コスト）';
    host2.appendChild(title);
  }
  Array.from(host2.querySelectorAll('.build-row')).forEach((el) => el.remove());
  for (const def of Object.values(BUILDINGS)) { ... }
  */
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
