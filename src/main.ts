import { createStage } from './render/stage';
import { bindUI, refreshUI, type UICallbacks } from './render/ui';
import {
  buildAt,
  createWorld,
  forceSpawn,
  kill as killChibi,
  tickWorld,
  triggerBokaigi,
  triggerFire,
  triggerOndo,
  upgradeOne,
} from './sim/world';
import { pushLife } from './sim/world';
import { isAlive as isChibiAlive, setState } from './sim/chibiwafu';
import { spawnBubble } from './sim/bubbles';
import type { WorldState } from './sim/world';
import { RANK_DEFS } from './sim/rank';
import { TRAIT_DEFS } from './sim/traits';
import { DEATH_CAUSES as DEATHS } from './sim/deaths';
import { PARAM_COLOR, PARAM_KEYS, PARAM_LABEL } from './sim/personality';
import type { Chibiwafu, VillageRank } from './types';
import { clearSave, load, save } from './meta/save';
import { CONFIG, type TimeScale } from './config';
import { DEATH_CAUSES } from './sim/deaths';

async function start() {
  const host = document.getElementById('stage') as HTMLElement;
  const world = createWorld();
  load(world);

  const stage = await createStage(host);
  stage.app.renderer.on('resize', (w: number, h: number) => {
    stage.resize(w, h);
  });

  let timeScale: TimeScale = 1;

  const cb: UICallbacks = {
    onBuild: (id) => {
      if (buildAt(world, id)) refreshUI(world, cb);
    },
    onUpgrade: (id) => {
      if (upgradeOne(world, id)) refreshUI(world, cb);
    },
    onOndo: () => triggerOndo(world),
    onBokaigi: () => triggerBokaigi(world),
    onFire: () => triggerFire(world),
    onSpawn: () => forceSpawn(world),
    onSave: () => {
      save(world);
      flashToast('セーブしました', 'info');
    },
    onReset: () => {
      skipUnloadSave = true;
      clearSave();
      location.reload();
    },
    onSpeed: (n) => {
      timeScale = n;
      refreshUI(world, cb);
    },
    getSpeed: () => timeScale,
  };
  bindUI(world, cb);

  let lastSave = 0;
  let uiTimer = 0;
  let lastRank: VillageRank = world.villageRank;
  const dtFixed = CONFIG.TICK_DT;
  let acc = 0;
  let prev = performance.now();

  // --- プレイヤー操作 --------------------------------------------------
  // 左クリック = 殴る、右クリック = 情報モーダル、ドラッグ = 持ち上げて放る
  let pinnedId: number | null = null;

  // Stage にちびわふ当たり判定を登録（stage 側で左クリック/ドラッグ対象を判定するため）
  stage.setHitTest((wx, wy) => {
    let bestId: number | null = null;
    let bestDist = 26;
    for (const c of world.chibis) {
      if (!isChibiAlive(c)) continue;
      const d = Math.hypot(c.pos.x - wx, c.pos.y - wy);
      if (d < bestDist) { bestId = c.id; bestDist = d; }
    }
    return bestId;
  });

  // 右クリック → 情報モーダル（生存なら life log、死体なら epitaph）
  stage.app.canvas.addEventListener('kszk-inspect', (e) => {
    const detail = (e as CustomEvent).detail as { chibiId: number | null; clientX: number; clientY: number };
    if (detail.chibiId != null) {
      const alive = world.chibis.find((c) => c.id === detail.chibiId);
      if (alive) { pinnedId = alive.id; showChibiModal(alive, false); return; }
    }
    // 生体ヒットなし → 死体からも探す
    const wp = stage.screenToWorld(detail.clientX, detail.clientY);
    for (const corpse of world.corpses) {
      const d = Math.hypot(corpse.pos.x - wp.x, corpse.pos.y - wp.y);
      if (d < 26) { showChibiModal(corpse, true); return; }
    }
    closeChibiModal();
    pinnedId = null;
  });

  // 左クリック（動かなかった場合）→ 殴る
  stage.app.canvas.addEventListener('kszk-chibi-punch', (e) => {
    const detail = (e as CustomEvent).detail as { chibiId: number };
    punchChibi(world, detail.chibiId);
  });

  // ドラッグ中：ちびわふをカーソル位置に移動
  stage.app.canvas.addEventListener('kszk-chibi-drag', (e) => {
    const detail = (e as CustomEvent).detail as { chibiId: number; worldX: number; worldY: number };
    const c = world.chibis.find((x) => x.id === detail.chibiId);
    if (!c) return;
    c.pos.x = detail.worldX;
    c.pos.y = detail.worldY;
    // target をクリアして、ドロップ後に wanderStep が再抽選するように
    c.target = null;
  });

  // ドロップ → 水中ならそのまま溺死、それ以外は surprised + life log
  stage.app.canvas.addEventListener('kszk-chibi-drop', (e) => {
    const detail = (e as CustomEvent).detail as { chibiId: number; worldX: number; worldY: number };
    dropChibi(world, detail.chibiId, detail.worldX, detail.worldY);
  });

  const modal = document.getElementById('chibi-modal')!;
  modal.querySelector('.chibi-modal-backdrop')!.addEventListener('click', closeChibiModal);
  document.getElementById('modal-close')!.addEventListener('click', closeChibiModal);

  function loop(now: number) {
    const dtReal = Math.min(0.2, (now - prev) / 1000);
    prev = now;
    acc += dtReal * timeScale;
    let steps = 0;
    const maxSteps = 256;
    while (acc >= dtFixed && steps < maxSteps) {
      tickWorld(world, dtFixed);
      acc -= dtFixed;
      steps += 1;
    }
    if (acc > dtFixed * maxSteps) acc = 0;
    stage.draw(world);

    // drain new dex discoveries → toast
    if (world.newDiscoveries.length > 0) {
      for (const id of world.newDiscoveries) {
        const def = DEATH_CAUSES[id];
        if (def) flashToast(`新図鑑: ${def.title}`, 'discovery');
      }
      world.newDiscoveries = [];
      flashTabHighlight('dex');
    }

    // detect rank promotion
    if (world.villageRank !== lastRank) {
      const nextDef = RANK_DEFS[world.villageRank];
      flashToast(`村が「${nextDef.name}」になった`, 'discovery');
      lastRank = world.villageRank;
    }

    // ピンした個体が死んだら自動で epitaph モーダルに切り替え
    if (pinnedId != null) {
      const living = world.chibis.find((c) => c.id === pinnedId);
      if (!living) {
        const corpse = world.corpses.find((c) => c.id === pinnedId);
        if (corpse) {
          showChibiModal(corpse, true);
        } else {
          pinnedId = null;
        }
      } else {
        // Liveで開きっぱなしなら内容を更新
        const isOpen = !modal.classList.contains('hidden');
        if (isOpen) showChibiModal(living, false);
      }
    }

    uiTimer += dtReal;
    if (uiTimer >= CONFIG.UI_REFRESH_SEC) {
      refreshUI(world, cb);
      uiTimer = 0;
    }
    lastSave += dtReal;
    if (lastSave >= CONFIG.AUTOSAVE_SEC) {
      save(world);
      lastSave = 0;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // beforeunload で自動セーブするが、リセット時はこの保存を飛ばす必要がある。
  // （clearSave → reload の間に上書きされて復活してしまうバグを防ぐ）
  let skipUnloadSave = false;
  const saveOnUnload = () => {
    if (skipUnloadSave) return;
    save(world);
  };
  window.addEventListener('beforeunload', saveOnUnload);
}

type ToastKind = 'info' | 'discovery';

function flashToast(msg: string, kind: ToastKind = 'info') {
  const el = document.createElement('div');
  el.textContent = msg;
  const bg = kind === 'discovery' ? '#e8735a' : '#3a2a1a';
  el.style.cssText =
    `position:fixed;top:10px;left:50%;transform:translateX(-50%) translateY(0);` +
    `background:${bg};color:#fff;padding:8px 14px;border-radius:4px;z-index:9999;` +
    `font-size:12px;font-weight:700;box-shadow:0 2px 4px #0004;` +
    `transition:opacity 0.4s, transform 0.4s;pointer-events:none;`;
  document.body.appendChild(el);
  // stagger by existing toasts count
  const existing = document.querySelectorAll('.kszk-toast').length;
  el.classList.add('kszk-toast');
  el.style.top = `${10 + existing * 40}px`;
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(-10px)';
  }, 1600);
  setTimeout(() => el.remove(), 2100);
}

function punchChibi(world: WorldState, chibiId: number) {
  const c = world.chibis.find((x) => x.id === chibiId);
  if (!c || !isChibiAlive(c)) return;
  spawnBubble(world.bubbles, c.pos, 'ぎゃー！', 'speech', 1.2);
  spawnBubble(world.bubbles, { x: c.pos.x, y: c.pos.y - 30 }, '💥', 'stomp', 0.6);
  setState(c, 'hurt', 1.3);
  pushLife(c, Math.floor(c.ageSec), '神様に殴られた');
  // 20% で即死
  if (Math.random() < 0.2) killChibi(world, c, 'kamisama_punch');
}

function dropChibi(world: WorldState, chibiId: number, wx: number, wy: number) {
  const c = world.chibis.find((x) => x.id === chibiId);
  if (!c || !isChibiAlive(c)) return;
  c.pos.x = wx;
  c.pos.y = wy;
  c.target = null;
  // 水中に落とされたら溺死
  if (wy > 414) {
    spawnBubble(world.bubbles, c.pos, 'わふぅ…', 'speech', 1.1);
    pushLife(c, Math.floor(c.ageSec), '神様に水へ投げ込まれた');
    killChibi(world, c, 'kamisama_drown');
  } else {
    // 陸地に落とされたら驚いて数秒固まる
    setState(c, 'surprised', 1.4);
    spawnBubble(world.bubbles, c.pos, 'ぽわっ', 'speech', 1);
    pushLife(c, Math.floor(c.ageSec), '神様に掴まれて移動させられた');
  }
}

function showChibiModal(c: Chibiwafu, isEpitaph: boolean) {
  const modal = document.getElementById('chibi-modal')!;
  modal.classList.remove('hidden');

  const nameEl = document.getElementById('modal-name')!;
  const ageEl = document.getElementById('modal-age')!;
  const traitsEl = document.getElementById('modal-traits')!;
  const epitaphEl = document.getElementById('modal-epitaph')!;
  const lifeEl = document.getElementById('modal-life')!;

  nameEl.textContent = c.name;
  ageEl.textContent = isEpitaph
    ? `${Math.floor(c.ageSec)}秒生きた`
    : `${Math.floor(c.ageSec)}秒目`;

  traitsEl.innerHTML = '';
  if (c.traits.length === 0) {
    const chip = document.createElement('span');
    chip.className = 'trait-chip';
    chip.style.background = '#888';
    chip.textContent = '無特性';
    traitsEl.appendChild(chip);
  } else {
    for (const t of c.traits) {
      const def = TRAIT_DEFS[t];
      const chip = document.createElement('span');
      chip.className = 'trait-chip';
      chip.style.background = '#' + def.color.toString(16).padStart(6, '0');
      chip.textContent = def.name;
      traitsEl.appendChild(chip);
    }
  }

  if (isEpitaph && c.deathCauseId) {
    const cause = DEATHS[c.deathCauseId as keyof typeof DEATHS];
    if (cause) {
      epitaphEl.textContent = `💀 ${cause.title} — ${cause.template(c.name)}`;
      epitaphEl.classList.add('show');
    }
  } else {
    epitaphEl.classList.remove('show');
    epitaphEl.textContent = '';
  }

  // パラメータバー
  const paramsEl = document.getElementById('modal-params')!;
  paramsEl.innerHTML = '';
  for (const key of PARAM_KEYS) {
    const val = c.params[key];
    const color = '#' + PARAM_COLOR[key].toString(16).padStart(6, '0');
    const row = document.createElement('div');
    row.className = 'param-row';
    row.innerHTML = `
      <span class="label">${PARAM_LABEL[key]}</span>
      <span class="bar"><span class="fill" style="width:${val}%;background:${color}"></span></span>
      <span class="value">${val}</span>
    `;
    paramsEl.appendChild(row);
  }

  // フレーバー
  const flavEl = document.getElementById('modal-flavors')!;
  flavEl.innerHTML = '';
  if (c.flavors.length === 0) {
    const li = document.createElement('li');
    li.textContent = '特になし';
    li.style.color = '#aaa';
    flavEl.appendChild(li);
  } else {
    for (const f of c.flavors) {
      const li = document.createElement('li');
      li.textContent = f;
      flavEl.appendChild(li);
    }
  }

  lifeEl.innerHTML = '';
  for (const ev of c.lifeLog) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="sec">${ev.sec}s</span><span>${escapeHtml(ev.text)}</span>`;
    lifeEl.appendChild(li);
  }
}

function closeChibiModal() {
  document.getElementById('chibi-modal')!.classList.add('hidden');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] ?? c));
}

function flashTabHighlight(tab: string) {
  const t = document.querySelector<HTMLElement>(`.tab[data-tab="${tab}"]`);
  if (!t) return;
  t.animate(
    [
      { background: 'transparent' },
      { background: '#ffe4b8' },
      { background: 'transparent' },
    ],
    { duration: 900, iterations: 1 },
  );
}

start().catch((err) => {
  console.error(err);
  const host = document.getElementById('stage');
  if (host) host.innerHTML = `<pre style="padding:12px;color:#a33">起動失敗: ${String(err)}</pre>`;
});
