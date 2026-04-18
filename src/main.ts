import { createStage } from './render/stage';
import { bindUI, refreshUI, type UICallbacks } from './render/ui';
import {
  buildAt,
  createWorld,
  damageChibi,
  damageNpc,
  forceSpawn,
  tickWorld,
  triggerBokaigi,
  triggerFire,
  triggerOndo,
  upgradeOne,
} from './sim/world';
import { pushLife } from './sim/world';
import { isAlive as isChibiAlive, setState } from './sim/chibiwafu';
import { spawnBubble } from './sim/bubbles';
import {
  pickGodLandedLine,
  pickGodPunchLine,
  pickGodShakeLine,
  pickGodThrowLine,
  pickGrabReaction,
} from './sim/chats';
import type { WorldState } from './sim/world';
import { RANK_DEFS } from './sim/rank';
import { TRAIT_DEFS } from './sim/traits';
import { DEATH_CAUSES as DEATHS } from './sim/deaths';
import { PARAM_COLOR, PARAM_KEYS, PARAM_LABEL } from './sim/personality';
import {
  NPC_DEFS,
  pickNpcLandedLine,
  pickNpcShakeLine,
  pickNpcThrowLine,
  type NpcId,
  type NpcState,
} from './sim/npcs';
import type { Chibiwafu, HitTarget, VillageRank } from './types';
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
  let lastVillageLv = world.villageLv;
  const dtFixed = CONFIG.TICK_DT;
  let acc = 0;
  let prev = performance.now();

  // --- プレイヤー操作 --------------------------------------------------
  // 左クリック = 殴る、右クリック = 情報モーダル、ドラッグ = 持ち上げて放る
  // 対象はちびわふ（世界.chibis）と NPC（世界.npcs）の両方。
  let pinnedId: number | null = null;

  // Stage に当たり判定を登録：ちびわふ優先、次に NPC。
  // ちびわふは半径 26px、NPC は NPC_DEFS.scale に応じたやや広め。
  stage.setHitTest((wx, wy): HitTarget | null => {
    // 1. ちびわふ優先
    let bestChibi: number | null = null;
    let bestDist = 26;
    for (const c of world.chibis) {
      if (!isChibiAlive(c)) continue;
      const d = Math.hypot(c.pos.x - wx, c.pos.y - wy);
      if (d < bestDist) { bestChibi = c.id; bestDist = d; }
    }
    if (bestChibi != null) return { kind: 'chibi', id: bestChibi };
    // 2. NPC（生きてるもののみ）
    let bestNpc: NpcState | null = null;
    let bestNpcDist = Infinity;
    for (const n of world.npcs) {
      if (n.dead) continue;
      const radius = 26 * NPC_DEFS[n.id].scale * 1.2;
      const d = Math.hypot(n.pos.x - wx, n.pos.y - wy);
      if (d < radius && d < bestNpcDist) { bestNpc = n; bestNpcDist = d; }
    }
    if (bestNpc) return { kind: 'npc', id: bestNpc.id };
    return null;
  });

  // 右クリック → 情報モーダル（ちびわふ: life log、NPC: 名前/HP、死体: epitaph）
  stage.app.canvas.addEventListener('kszk-inspect', (e) => {
    const detail = (e as CustomEvent).detail as { target: HitTarget | null; clientX: number; clientY: number };
    if (detail.target?.kind === 'chibi') {
      const alive = world.chibis.find((c) => c.id === detail.target!.id);
      if (alive) { pinnedId = alive.id; showChibiModal(alive, false); return; }
    }
    if (detail.target?.kind === 'npc') {
      const npc = world.npcs.find((n) => n.id === detail.target!.id);
      if (npc) { showNpcModal(npc); return; }
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
  stage.app.canvas.addEventListener('kszk-entity-punch', (e) => {
    const detail = (e as CustomEvent).detail as { target: HitTarget };
    if (detail.target.kind === 'chibi') punchChibi(world, detail.target.id);
    else punchNpc(world, detail.target.id as NpcId);
  });

  // ドラッグセッション：最初に掴んだ位置と振り回し総距離を追跡。
  // ちびわふと NPC 両方に対応（id は HitTarget で保持）。
  let dragSession: {
    target: HitTarget;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    swingDistAccum: number;
    bubbleCooldown: number;
  } | null = null;

  function dragTargetsSame(a: HitTarget, b: HitTarget): boolean {
    return a.kind === b.kind && a.id === b.id;
  }

  // ドラッグ中：対象をカーソル位置に移動 + 振り回しダメージ
  stage.app.canvas.addEventListener('kszk-entity-drag', (e) => {
    const detail = (e as CustomEvent).detail as { target: HitTarget; worldX: number; worldY: number };
    if (detail.target.kind === 'chibi') handleDragChibi(detail.target.id, detail.worldX, detail.worldY);
    else handleDragNpc(detail.target.id as NpcId, detail.worldX, detail.worldY);
  });

  function handleDragChibi(id: number, wx: number, wy: number) {
    const c = world.chibis.find((x) => x.id === id);
    if (!c || !isChibiAlive(c)) return;
    if (!dragSession || !dragTargetsSame(dragSession.target, { kind: 'chibi', id })) {
      dragSession = {
        target: { kind: 'chibi', id },
        startX: c.pos.x, startY: c.pos.y,
        lastX: c.pos.x, lastY: c.pos.y,
        swingDistAccum: 0, bubbleCooldown: 80,
      };
      pushLife(c, Math.floor(c.ageSec), '神様に掴まれた');
      spawnBubble(world.bubbles, { x: c.pos.x, y: c.pos.y - 14 }, pickGrabReaction(c), 'speech', 1.8);
    }
    const dx = wx - dragSession.lastX;
    const dy = wy - dragSession.lastY;
    const segment = Math.hypot(dx, dy);
    dragSession.swingDistAccum += segment;
    dragSession.lastX = wx; dragSession.lastY = wy;
    dragSession.bubbleCooldown -= segment;
    c.pos.x = wx; c.pos.y = wy;
    c.target = null;
    if (c.state !== 'hurt' && c.state !== 'dead') setState(c, 'hurt', 0.5);
    while (dragSession.swingDistAccum >= 40) {
      dragSession.swingDistAccum -= 40;
      const dmg = 1 + Math.floor(Math.random() * 2);
      const died = damageChibi(world, c, dmg, 'kamisama_shake');
      if (died) {
        pushLife(c, Math.floor(c.ageSec), '神様に振り回されて力尽きた');
        dragSession = null;
        return;
      }
    }
    if (dragSession.bubbleCooldown <= 0 && segment > 2) {
      spawnBubble(world.bubbles, c.pos, pickGodShakeLine(), 'speech', 0.9);
      dragSession.bubbleCooldown = 60;
    }
  }

  function handleDragNpc(id: NpcId, wx: number, wy: number) {
    const n = world.npcs.find((x) => x.id === id);
    if (!n || n.dead) return;
    if (!dragSession || !dragTargetsSame(dragSession.target, { kind: 'npc', id })) {
      dragSession = {
        target: { kind: 'npc', id },
        startX: n.pos.x, startY: n.pos.y,
        lastX: n.pos.x, lastY: n.pos.y,
        swingDistAccum: 0, bubbleCooldown: 80,
      };
      const reaction = npcGrabReaction(id);
      if (reaction) spawnBubble(world.bubbles, { x: n.pos.x, y: n.pos.y - 16 }, reaction, 'speech', 1.8);
    }
    const dx = wx - dragSession.lastX;
    const dy = wy - dragSession.lastY;
    const segment = Math.hypot(dx, dy);
    dragSession.swingDistAccum += segment;
    dragSession.lastX = wx; dragSession.lastY = wy;
    dragSession.bubbleCooldown -= segment;
    n.pos.x = wx; n.pos.y = wy;
    // NPC はちびわふより頑丈：振り回しダメージを半分に
    while (dragSession.swingDistAccum >= 60) {
      dragSession.swingDistAccum -= 60;
      const dmg = 1 + Math.floor(Math.random() * 2);
      const died = damageNpc(world, n, dmg);
      if (died) { dragSession = null; return; }
    }
    if (dragSession.bubbleCooldown <= 0 && segment > 2) {
      spawnBubble(world.bubbles, n.pos, pickNpcShakeLine(id), 'speech', 0.9);
      dragSession.bubbleCooldown = 80;
    }
  }

  // ドロップ → ちびわふ／NPC それぞれに適した処理へ
  stage.app.canvas.addEventListener('kszk-entity-drop', (e) => {
    const detail = (e as CustomEvent).detail as { target: HitTarget; worldX: number; worldY: number };
    const throwDist = dragSession && dragTargetsSame(dragSession.target, detail.target)
      ? Math.hypot(detail.worldX - dragSession.startX, detail.worldY - dragSession.startY)
      : 0;
    if (detail.target.kind === 'chibi') dropChibi(world, detail.target.id, detail.worldX, detail.worldY, throwDist);
    else dropNpc(world, detail.target.id as NpcId, detail.worldX, detail.worldY, throwDist);
    dragSession = null;
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
    // detect village Lv up (ranks are coarse labels, lv is the continuous feel)
    if (world.villageLv > lastVillageLv) {
      flashToast(`村Lv ${lastVillageLv} → ${world.villageLv}`, 'info');
      lastVillageLv = world.villageLv;
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
  spawnBubble(world.bubbles, c.pos, pickGodPunchLine(), 'speech', 1.2);
  spawnBubble(world.bubbles, { x: c.pos.x, y: c.pos.y - 30 }, '💥', 'stomp', 0.6);
  setState(c, 'hurt', 1.3);
  pushLife(c, Math.floor(c.ageSec), '神様に殴られた');
  // 殴打ダメージ 8-18、HP 0 で kamisama_punch
  const dmg = 8 + Math.floor(Math.random() * 11);
  const died = damageChibi(world, c, dmg, 'kamisama_punch');
  // 生き残ってても 10% で神の不興で追加即死（ドラマ用）
  if (!died && Math.random() < 0.1) {
    damageChibi(world, c, c.hp, 'kamisama_punch');
  }
}

// NPC 殴打：ちびわふより頑丈なのでダメージ低め、リアクション多め
function punchNpc(world: WorldState, id: NpcId) {
  const n = world.npcs.find((x) => x.id === id);
  if (!n || n.dead) return;
  spawnBubble(world.bubbles, { x: n.pos.x, y: n.pos.y - 30 }, '💥', 'stomp', 0.6);
  // NPC は 3-8 のダメージ（ちびわふ 8-18 より軽め）
  const dmg = 3 + Math.floor(Math.random() * 6);
  damageNpc(world, n, dmg);
}

function dropNpc(world: WorldState, id: NpcId, wx: number, wy: number, throwDist: number) {
  const n = world.npcs.find((x) => x.id === id);
  if (!n || n.dead) return;
  n.pos.x = wx;
  n.pos.y = wy;
  if (wy > 414) {
    // 水に投げ込まれた NPC は HP 関係なく即死（神話的）
    spawnBubble(world.bubbles, n.pos, 'わぷっ…', 'speech', 1.2);
    damageNpc(world, n, n.hp);
    return;
  }
  // 着地：距離に応じて NPC へのダメージ。ちびわふより倍率低め。
  const dmg = Math.round(3 + Math.min(20, throwDist * 0.06));
  if (throwDist > 80) {
    spawnBubble(world.bubbles, n.pos, pickNpcThrowLine(id), 'speech', 0.9);
  }
  const died = damageNpc(world, n, dmg);
  if (!died) {
    spawnBubble(world.bubbles, n.pos, pickNpcLandedLine(id), 'speech', 1.2);
  }
}

// NPC を掴んだ時の性格別リアクション（短く）
function npcGrabReaction(id: NpcId): string | null {
  if (id === 'furana') return 'きゃっわふ！？';
  if (id === 'suzu')   return 'ちょっとなに！？';
  if (id === 'lou')    return '……ぐぅ？';
  if (id === 'cocoon') return 'はなせー！';
  return null;
}

function showNpcModal(n: NpcState) {
  const modal = document.getElementById('chibi-modal')!;
  modal.classList.remove('hidden');
  const def = NPC_DEFS[n.id];
  (document.getElementById('modal-name')!).textContent = def.name;
  (document.getElementById('modal-age')!).textContent = `HP ${n.hp} / ${n.maxHp}`;
  (document.getElementById('modal-traits')!).innerHTML = '';
  (document.getElementById('modal-epitaph')!).textContent = '';
  (document.getElementById('modal-epitaph')!).classList.remove('show');
  (document.getElementById('modal-params')!).innerHTML =
    `<div class="param-row"><span class="label">HP</span>` +
    `<span class="bar"><span class="fill" style="width:${(n.hp / n.maxHp) * 100}%;background:#d85";></span></span>` +
    `<span class="value">${n.hp}</span></div>`;
  (document.getElementById('modal-flavors')!).innerHTML =
    n.id === 'furana' ? '<li>村の母。死ぬと出産停止＋ちびわふ大パニック。</li>'
    : n.id === 'cocoon' ? '<li>いじめっ子。ちびわふを叩く。</li>'
    : n.id === 'suzu' ? '<li>村の点呼係。</li>'
    : '<li>……</li>';
  (document.getElementById('modal-life')!).innerHTML = '';
}

function dropChibi(world: WorldState, chibiId: number, wx: number, wy: number, throwDist: number) {
  const c = world.chibis.find((x) => x.id === chibiId);
  if (!c || !isChibiAlive(c)) return;
  c.pos.x = wx;
  c.pos.y = wy;
  c.target = null;
  // 水中に落とされたら HP 関係なく即溺死
  if (wy > 414) {
    spawnBubble(world.bubbles, c.pos, 'わふぅ…', 'speech', 1.1);
    pushLife(c, Math.floor(c.ageSec), '神様に水へ投げ込まれた');
    // dropChibi から kill するために直接呼ぶ（hp 経由しない）
    damageChibi(world, c, c.hp, 'kamisama_drown');
    return;
  }
  // 陸地：投げ距離に応じて着地ダメージ 5-35
  const dmg = Math.round(5 + Math.min(30, throwDist * 0.10));
  // 距離 80px 以上で "空中で何か言う" 吹き出しを先に出す
  if (throwDist > 80) {
    spawnBubble(world.bubbles, c.pos, pickGodThrowLine(), 'speech', 0.9);
  }
  const died = damageChibi(world, c, dmg, 'kamisama_throw');
  if (died) {
    spawnBubble(world.bubbles, c.pos, pickGodLandedLine(), 'speech', 1.3);
    pushLife(c, Math.floor(c.ageSec), `神様に${Math.round(throwDist)}px 投げ飛ばされ墜死`);
  } else {
    setState(c, 'hurt', 1.4);
    spawnBubble(world.bubbles, c.pos, pickGodLandedLine(), 'speech', 1.2);
    pushLife(c, Math.floor(c.ageSec), `神様に投げられ地面に激突（-${dmg}HP）`);
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
