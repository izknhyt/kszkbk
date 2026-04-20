import { createStage } from './render/stage';
import { bindUI, refreshUI, type UICallbacks } from './render/ui';
import {
  buildAt,
  createWorld,
  damageChibi,
  damageNpc,
  damageWolf,
  ensurePlots,
  forceSpawn,
  launchFlight,
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
  pickGodDefianceLine,
  pickGodPunchLine,
  pickGodShakeLine,
  pickGodThrowLine,
  pickGrabReaction,
  pickWitnessLaughLine,
  pickWitnessShockLine,
} from './sim/chats';
import { distance as distVec } from './sim/chibiwafu';
import type { WorldState } from './sim/world';
import { RANK_DEFS } from './sim/rank';
import { TRAIT_DEFS } from './sim/traits';
import { DEATH_CAUSES as DEATHS } from './sim/deaths';
import { PARAM_COLOR, PARAM_KEYS, PARAM_LABEL } from './sim/personality';
import {
  NPC_DEFS,
  pickNpcShakeLine,
  pickNpcThrowLine,
  type NpcId,
  type NpcState,
} from './sim/npcs';
import type { Chibiwafu, HitTarget, VillageRank } from './types';
import { clearSave, listSlots, load, save, type SlotId } from './meta/save';
import { CONFIG, type TimeScale } from './config';
import { DEATH_CAUSES } from './sim/deaths';
import type { Difficulty } from './types';

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  beginner: '初心者',
  standard: '標準',
  hell: '地獄',
};

// スタート画面：3 スロット表示、既存セーブは RESUME 可、空は NEW で難度選択
function showStartScreen(): Promise<{ slot: SlotId; difficulty: Difficulty; resume: boolean }> {
  return new Promise((resolve) => {
    const screen = document.getElementById('start-screen')!;
    const slotsEl = document.getElementById('slot-cards')!;
    const diffChooser = document.getElementById('difficulty-chooser')!;
    const diffCancel = document.getElementById('diff-cancel')!;
    screen.classList.remove('hidden');
    diffChooser.classList.add('hidden');
    let pendingSlot: SlotId | null = null;

    function renderSlots() {
      const slots = listSlots();
      slotsEl.innerHTML = '';
      for (const s of slots) {
        const card = document.createElement('div');
        card.className = 'slot-card';
        const h = document.createElement('h3');
        h.textContent = `スロット ${s.slot}`;
        card.appendChild(h);
        const info = document.createElement('div');
        info.className = 'slot-info';
        if (s.exists) {
          const mins = Math.floor((s.timeSec || 0) / 60);
          info.textContent =
            `難度：${s.difficulty ? DIFFICULTY_LABEL[s.difficulty] : '—'}\n` +
            `時間：${mins}分\n` +
            `死者：${s.totalDeaths || 0}\n` +
            `誕生：${s.totalBirths || 0}`;
        } else {
          info.textContent = '空きスロット';
          info.style.color = '#a89060';
        }
        card.appendChild(info);
        const actions = document.createElement('div');
        actions.className = 'slot-actions';
        if (s.exists) {
          const btnResume = document.createElement('button');
          btnResume.textContent = '再開';
          btnResume.addEventListener('click', () => {
            screen.classList.add('hidden');
            resolve({ slot: s.slot, difficulty: s.difficulty ?? 'standard', resume: true });
          });
          actions.appendChild(btnResume);
          const btnDelete = document.createElement('button');
          btnDelete.textContent = '削除';
          btnDelete.className = 'danger';
          btnDelete.addEventListener('click', () => {
            if (confirm(`スロット ${s.slot} を削除？`)) {
              clearSave(s.slot);
              renderSlots();
            }
          });
          actions.appendChild(btnDelete);
        } else {
          const btnNew = document.createElement('button');
          btnNew.textContent = '新規ラン';
          btnNew.addEventListener('click', () => {
            pendingSlot = s.slot;
            diffChooser.classList.remove('hidden');
          });
          actions.appendChild(btnNew);
        }
        card.appendChild(actions);
        slotsEl.appendChild(card);
      }
    }

    renderSlots();

    diffChooser.querySelectorAll<HTMLButtonElement>('.diff-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (pendingSlot == null) return;
        const d = btn.dataset.difficulty as Difficulty;
        screen.classList.add('hidden');
        resolve({ slot: pendingSlot, difficulty: d, resume: false });
      });
    });
    diffCancel.addEventListener('click', () => {
      diffChooser.classList.add('hidden');
      pendingSlot = null;
    });
  });
}

async function start() {
  // スタート画面でスロット + 難度を決めてから world を作る
  const startResult = await showStartScreen();
  const currentSlot: SlotId = startResult.slot;
  const host = document.getElementById('stage') as HTMLElement;
  const world = createWorld(startResult.difficulty);
  if (startResult.resume) load(world, currentSlot);
  ensurePlots(world);
  // HUD 難度バッジ
  const diffBadge = document.getElementById('stat-difficulty');
  if (diffBadge) {
    diffBadge.textContent = DIFFICULTY_LABEL[world.difficulty];
    diffBadge.className = 'stat-difficulty ' + world.difficulty;
  }

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
      save(world, currentSlot);
      flashToast(`スロット${currentSlot}にセーブ`, 'info');
    },
    onReset: () => {
      skipUnloadSave = true;
      clearSave(currentSlot);
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
  let lastWolfCount = 0;
  let lastWolfDeaths = 0;
  let lastThunderTick = -1;
  let lastElectroDeaths = 0;
  const dtFixed = CONFIG.TICK_DT;
  let acc = 0;
  let prev = performance.now();

  // --- プレイヤー操作 --------------------------------------------------
  // 左クリック = 殴る、右クリック = 情報モーダル、ドラッグ = 持ち上げて放る
  // 対象はちびわふ（世界.chibis）と NPC（世界.npcs）の両方。
  let pinnedId: number | null = null;
  // 建設モード：null 以外の時、空クリックで cleared プロットを指定種に建設
  type BuildKind = 'farm' | 'channel' | 'path' | 'house' | 'well' | 'firewatch' | 'sawmill' | 'shrine' | 'generator' | 'streetlamp' | 'powerline' | 'kiln' | 'pasture' | 'loom';
  let buildMode: BuildKind | null = null;
  const plotBuildCosts: Record<BuildKind, { wood: number; stone: number; plank?: number }> = {
    farm:       { wood: 2, stone: 0 },
    channel:    { wood: 0, stone: 1 },
    path:       { wood: 0, stone: 1 },
    house:      { wood: 6, stone: 3 },
    well:       { wood: 1, stone: 8 },
    firewatch:  { wood: 10, stone: 2 },
    sawmill:    { wood: 8, stone: 4 },
    shrine:     { wood: 3, stone: 5, plank: 2 },
    generator:  { wood: 6, stone: 4, plank: 3 },
    streetlamp: { wood: 2, stone: 1, plank: 1 },
    powerline:  { wood: 1, stone: 0, plank: 1 },
    kiln:       { wood: 4, stone: 8 },
    pasture:    { wood: 3, stone: 2 },
    loom:       { wood: 6, stone: 0, plank: 2 },
  };
  const buildModeLabel: Record<BuildKind, string> = {
    farm: '畑', channel: '水路', path: '道', house: '家',
    well: '井戸', firewatch: '火の見やぐら', sawmill: '製材所', shrine: '神社',
    generator: 'ペダル発電所', streetlamp: '街灯', powerline: '電線', kiln: '精錬所',
    pasture: '牧場', loom: '織機',
  };
  function setBuildMode(m: typeof buildMode) {
    buildMode = m;
    document.querySelectorAll<HTMLButtonElement>('.plot-build-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.plotKind === m);
    });
    const hint = document.getElementById('plot-build-hint');
    if (hint) {
      hint.textContent = m
        ? `${buildModeLabel[m]} モード：地面を左クリックで設置／再押下で解除`
        : 'ボタンを押してから地面の好きな場所を左クリック';
    }
  }
  document.querySelectorAll<HTMLButtonElement>('.plot-build-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.plotKind as BuildKind;
      setBuildMode(buildMode === kind ? null : kind);
    });
  });
  // 空クリック → 建設モードならクリック位置に feature を置く
  stage.app.canvas.addEventListener('kszk-empty-click', (e) => {
    if (!buildMode) return;
    const detail = (e as CustomEvent).detail as { worldX: number; worldY: number };
    const x = detail.worldX;
    const y = detail.worldY;
    // 川エリアには建てられない（path は橋代わりにできるが今回は未実装）
    if (y > CONFIG.DRY_Y_LIMIT) {
      flashToast('川には建てられない', 'info');
      return;
    }
    // 陸地の外も拒否
    if (x < 20 || x > world.bounds.w - 20 || y < 20) {
      flashToast('範囲外です', 'info');
      return;
    }
    // 既存 feature と 28px 以上離す
    const TOO_CLOSE = 28;
    const conflicts = world.features.some(
      (f) => Math.hypot(f.pos.x - x, f.pos.y - y) < TOO_CLOSE,
    );
    if (conflicts) {
      flashToast('近くに建物あり', 'info');
      return;
    }
    const cost = plotBuildCosts[buildMode];
    const plankCost = cost.plank ?? 0;
    if (world.resources.wood < cost.wood || world.resources.stone < cost.stone || world.resources.plank < plankCost) {
      const parts: string[] = [];
      if (cost.wood > 0) parts.push(`🪵${cost.wood}`);
      if (cost.stone > 0) parts.push(`🪨${cost.stone}`);
      if (plankCost > 0) parts.push(`🪚${plankCost}`);
      flashToast(`資源不足 (${parts.join(' ')})`, 'info');
      return;
    }
    world.resources.wood -= cost.wood;
    world.resources.stone -= cost.stone;
    world.resources.plank -= plankCost;
    // feature 追加（id はランダム）
    const id = `feat-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    world.features.push({ id, pos: { x, y }, kind: buildMode, devLevel: 2, workSec: 0 });
    const emojiMap: Record<BuildKind, string> = {
      farm: '🌾 畑', channel: '💧 水路', path: '🛤 道', house: '🏠 家',
      well: '⛲ 井戸', firewatch: '🔥 火の見やぐら', sawmill: '🪚 製材所', shrine: '⛩ 神社',
      generator: '⚡ ペダル発電所', streetlamp: '💡 街灯', powerline: '🪜 電線', kiln: '🧱 精錬所',
      pasture: '🐑 牧場', loom: '🧶 織機',
    };
    flashToast(`${emojiMap[buildMode]} を建てた`, 'info');
    // 建設モードは継続
  });

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
    // 3. オオカミ（生きてるもののみ）
    let bestWolf: number | null = null;
    let bestWolfDist = 28;
    for (const wolf of world.wolves) {
      if (wolf.state === 'dead') continue;
      const d = Math.hypot(wolf.pos.x - wx, wolf.pos.y - wy);
      if (d < bestWolfDist) { bestWolf = wolf.id; bestWolfDist = d; }
    }
    if (bestWolf != null) return { kind: 'wolf', id: bestWolf };
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
    else if (detail.target.kind === 'npc') punchNpc(world, detail.target.id as NpcId);
    else if (detail.target.kind === 'wolf') punchWolf(world, detail.target.id);
  });

  // ドラッグセッション：最初に掴んだ位置と振り回し総距離を追跡。
  // ちびわふと NPC 両方に対応（id は HitTarget で保持）。
  // samples: 投げの速度計算用、最近のカーソル位置履歴（時刻付き）
  let dragSession: {
    target: HitTarget;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    swingDistAccum: number;
    bubbleCooldown: number;
    samples: Array<{ x: number; y: number; t: number }>;
  } | null = null;

  // 直近 120ms のサンプルから投げ速度 (px/sec) を推定
  function computeThrowVelocity(): { vx: number; vy: number } {
    if (!dragSession || dragSession.samples.length < 2) return { vx: 0, vy: 0 };
    const samples = dragSession.samples;
    const recent = samples[samples.length - 1]!;
    // 120ms 以上前の古いサンプルを探す
    let old = samples[0]!;
    for (let i = samples.length - 1; i >= 0; i--) {
      if (recent.t - samples[i]!.t >= 0.12) { old = samples[i]!; break; }
    }
    const dt = Math.max(0.02, recent.t - old.t);
    return { vx: (recent.x - old.x) / dt, vy: (recent.y - old.y) / dt };
  }

  function dragTargetsSame(a: HitTarget, b: HitTarget): boolean {
    return a.kind === b.kind && a.id === b.id;
  }

  // ドラッグ中：対象をカーソル位置に移動 + 振り回しダメージ
  stage.app.canvas.addEventListener('kszk-entity-drag', (e) => {
    const detail = (e as CustomEvent).detail as { target: HitTarget; worldX: number; worldY: number };
    if (detail.target.kind === 'chibi') handleDragChibi(detail.target.id, detail.worldX, detail.worldY);
    else if (detail.target.kind === 'npc') handleDragNpc(detail.target.id as NpcId, detail.worldX, detail.worldY);
    // オオカミはドラッグ不可（噛まれる可能性がある。打撃のみ対応）
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
        samples: [{ x: c.pos.x, y: c.pos.y, t: performance.now() / 1000 }],
      };
      pushLife(c, Math.floor(c.ageSec), '神様に掴まれた');
      spawnBubble(world.bubbles, { x: c.pos.x, y: c.pos.y - 14 }, pickGrabReaction(c), 'speech', 1.8);
    }
    dragSession.samples.push({ x: wx, y: wy, t: performance.now() / 1000 });
    if (dragSession.samples.length > 12) dragSession.samples.shift();
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
        samples: [{ x: n.pos.x, y: n.pos.y, t: performance.now() / 1000 }],
      };
      const reaction = npcGrabReaction(id);
      if (reaction) spawnBubble(world.bubbles, { x: n.pos.x, y: n.pos.y - 16 }, reaction, 'npc-speech', 1.8);
    }
    dragSession.samples.push({ x: wx, y: wy, t: performance.now() / 1000 });
    if (dragSession.samples.length > 12) dragSession.samples.shift();
    const dx = wx - dragSession.lastX;
    const dy = wy - dragSession.lastY;
    const segment = Math.hypot(dx, dy);
    dragSession.swingDistAccum += segment;
    dragSession.lastX = wx; dragSession.lastY = wy;
    dragSession.bubbleCooldown -= segment;
    n.pos.x = wx; n.pos.y = wy;
    // フラナが引きずられている間、mama 高めの子が追いかける合図を 1.5秒セット
    if (id === 'furana') world.furanaGrabbedTimer = 1.5;
    // NPC はちびわふより頑丈：振り回しダメージをさらに半分（120px 毎 1-2 HP）
    while (dragSession.swingDistAccum >= 120) {
      dragSession.swingDistAccum -= 120;
      const dmg = 1 + Math.floor(Math.random() * 2);
      const died = damageNpc(world, n, dmg);
      if (died) { dragSession = null; return; }
    }
    if (dragSession.bubbleCooldown <= 0 && segment > 2) {
      spawnBubble(world.bubbles, n.pos, pickNpcShakeLine(id), 'npc-speech', 0.9);
      dragSession.bubbleCooldown = 80;
    }
  }

  // ドロップ → カーソル速度をそのまま投射速度に。速くフリングすれば飛ぶ距離もスピードも増す。
  stage.app.canvas.addEventListener('kszk-entity-drop', (e) => {
    const detail = (e as CustomEvent).detail as { target: HitTarget; worldX: number; worldY: number };
    const { vx, vy } = dragSession && dragTargetsSame(dragSession.target, detail.target)
      ? computeThrowVelocity() : { vx: 0, vy: 0 };
    if (detail.target.kind === 'chibi') dropChibi(world, detail.target.id, detail.worldX, detail.worldY, vx, vy);
    else if (detail.target.kind === 'npc') dropNpc(world, detail.target.id as NpcId, detail.worldX, detail.worldY, vx, vy);
    // wolf はドロップ対象外
    dragSession = null;
  });

  const modal = document.getElementById('chibi-modal')!;
  // モーダルを閉じた時は pinnedId もクリア（でないと個体死亡時に再度開いてしまう）
  function closeAndUnpin() {
    closeChibiModal();
    pinnedId = null;
    pinnedWasAlive = false;
  }
  modal.querySelector('.chibi-modal-backdrop')!.addEventListener('click', closeAndUnpin);
  document.getElementById('modal-close')!.addEventListener('click', closeAndUnpin);

  // ピン中の個体が「生きている → 死んだ」の境界を 1 度だけ検出するためのフラグ
  let pinnedWasAlive = false;

  // --- ミニマップ（右下 240×135）---------------------------------------
  const minimap = document.getElementById('minimap') as HTMLCanvasElement | null;
  const mctx = minimap ? minimap.getContext('2d') : null;
  if (minimap && mctx) {
    minimap.addEventListener('click', (e) => {
      const rect = minimap.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      const cam = stage.getCamera();
      stage.focusOn(nx * cam.bounds.w, ny * cam.bounds.h);
    });
  }
  function drawMinimap() {
    if (!minimap || !mctx) return;
    const cam = stage.getCamera();
    const W = minimap.width, H = minimap.height;
    const sx = W / cam.bounds.w;
    const sy = H / cam.bounds.h;
    // 背景：陸地＋川
    mctx.fillStyle = '#c0a87a';
    mctx.fillRect(0, 0, W, H);
    const riverY = (CONFIG.DRY_Y_LIMIT) * sy;
    mctx.fillStyle = '#8a6a42';
    mctx.fillRect(0, riverY, W, H - riverY);
    // 障害物（茶の点）
    mctx.fillStyle = '#3a2a1a';
    for (const o of world.obstacles) {
      mctx.fillRect(o.pos.x * sx - 1, o.pos.y * sy - 1, 2, 2);
    }
    // feature：水源青・水路水色・畑緑・道茶・家赤茶・井戸水色・火の見赤・製材所茶
    for (const f of world.features) {
      mctx.fillStyle = f.kind === 'water' ? '#3a6ea0'
        : f.kind === 'channel' ? '#6ba2d2'
        : f.kind === 'farm' ? '#6ea241'
        : f.kind === 'house' ? '#b85a3a'
        : f.kind === 'well' ? '#4a7898'
        : f.kind === 'firewatch' ? '#b0553a'
        : f.kind === 'sawmill' ? '#8d6238'
        : f.kind === 'shrine' ? '#c44a4a'
        : f.kind === 'generator' ? '#9a8a5a'
        : f.kind === 'streetlamp' ? (f.saturated ? '#ffe070' : '#6a604a')
        : f.kind === 'powerline' ? '#6a5848'
        : f.kind === 'kiln' ? '#b86030'
        : f.kind === 'pasture' ? '#7ab060'
        : f.kind === 'loom' ? '#a07858'
        : '#8b7048';
      mctx.fillRect(f.pos.x * sx - 2, f.pos.y * sy - 2, 4, 4);
    }
    // ちびわふ（白点）
    mctx.fillStyle = '#f8f0d0';
    for (const c of world.chibis) {
      mctx.fillRect(c.pos.x * sx - 1, c.pos.y * sy - 1, 2, 2);
    }
    // オオカミ（赤点、夜間危険度マーカー）
    mctx.fillStyle = '#ff3322';
    for (const wolf of world.wolves) {
      if (wolf.state === 'dead') continue;
      mctx.fillRect(wolf.pos.x * sx - 2, wolf.pos.y * sy - 2, 4, 4);
    }
    // NPC：フラナ白大・ココン橙・スズ桃・ルー灰
    for (const n of world.npcs) {
      if (n.dead) continue;
      mctx.fillStyle = n.id === 'furana' ? '#ffffff'
        : n.id === 'cocoon' ? '#ff7e3a'
        : n.id === 'suzu' ? '#ffb6c1'
        : '#888';
      const r = n.id === 'furana' ? 4 : 3;
      mctx.fillRect(n.pos.x * sx - r/2, n.pos.y * sy - r/2, r, r);
    }
    // 現在カメラビューの矩形
    mctx.strokeStyle = '#ffd580';
    mctx.lineWidth = 1.5;
    mctx.strokeRect(cam.x * sx, cam.y * sy, cam.w * sx, cam.h * sy);
  }

  // --- キーボードカメラ操作 ---------------------------------------------
  // WASD / 矢印キーで保持中はカメラをパン。F でフラナ即フォーカス、R でリセット。
  const heldKeys = new Set<string>();
  window.addEventListener('keydown', (e) => {
    // input 要素にフォーカスしている時は無視（モーダルなど）
    if (document.activeElement && (document.activeElement as HTMLElement).tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    heldKeys.add(k);
    if (k === 'f') {
      const f = world.npcs.find((n) => n.id === 'furana');
      if (f) stage.focusOn(f.pos.x, f.pos.y);
    } else if (k === 'r') {
      stage.resetCamera();
    }
  });
  window.addEventListener('keyup', (e) => {
    heldKeys.delete(e.key.toLowerCase());
  });

  function loop(now: number) {
    const dtReal = Math.min(0.2, (now - prev) / 1000);
    prev = now;
    acc += dtReal * timeScale;
    let steps = 0;
    // 1 フレーム内での最大 sim ステップ。高時間倍率 (×64) × 200 chibi だと
    // 256 はブラウザをフリーズさせるので 32 に絞り、超過分は捨てる（catch-up 諦め）。
    const maxSteps = 32;
    while (acc >= dtFixed && steps < maxSteps) {
      tickWorld(world, dtFixed);
      acc -= dtFixed;
      steps += 1;
    }
    // catch-up を打ち切り、溜まった時間は破棄（背景タブ復帰やスタッターを吸収）
    if (steps >= maxSteps) acc = 0;

    // キーボードパン：保持中のキーで dtReal 秒ぶんカメラ移動
    const panSpeed = 800;  // world px / sec
    let pdx = 0, pdy = 0;
    if (heldKeys.has('a') || heldKeys.has('arrowleft'))  pdx -= 1;
    if (heldKeys.has('d') || heldKeys.has('arrowright')) pdx += 1;
    if (heldKeys.has('w') || heldKeys.has('arrowup'))    pdy -= 1;
    if (heldKeys.has('s') || heldKeys.has('arrowdown'))  pdy += 1;
    if (pdx !== 0 || pdy !== 0) {
      const len = Math.hypot(pdx, pdy);
      stage.panCamera((pdx / len) * panSpeed * dtReal, (pdy / len) * panSpeed * dtReal);
    }

    stage.draw(world);
    drawMinimap();

    // drain new dex discoveries → toast
    if (world.newDiscoveries.length > 0) {
      for (const id of world.newDiscoveries) {
        const def = DEATH_CAUSES[id];
        if (def) flashToast(`新図鑑: ${def.title}`, 'discovery');
      }
      world.newDiscoveries = [];
      flashTabHighlight('dex');
    }

    // detect wolf appearance / kill
    const wolfCount = world.wolves.filter((w) => w.state !== 'dead').length;
    if (wolfCount > lastWolfCount && lastWolfCount === 0) {
      flashToast(`🐺 オオカミ出現！(${wolfCount})`, 'discovery');
    }
    lastWolfCount = wolfCount;
    const wolfDeaths = world.dex.wolf_bite?.count ?? 0;
    if (wolfDeaths > lastWolfDeaths) {
      flashToast(`🐺 噛まれて ${wolfDeaths - lastWolfDeaths} 人死亡…`, 'info');
      lastWolfDeaths = wolfDeaths;
    }

    // 落雷：発電所が爆破されたら toast。lastThunderStrikeAt.tick を監視
    const thunderTick = world.lastThunderStrikeAt?.tick ?? -1;
    if (thunderTick > lastThunderTick) {
      flashToast('⚡ 発電所に落雷直撃！', 'info');
      lastThunderTick = thunderTick;
    }
    // 感電死の累計
    const electroDeaths = world.dex.electrocution?.count ?? 0;
    if (electroDeaths > lastElectroDeaths) {
      flashToast(`⚡ 感電死 ${electroDeaths - lastElectroDeaths} 人…`, 'info');
      lastElectroDeaths = electroDeaths;
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
    // 毎フレーム再描画すると閉じられなくなるので、生→死の境界で1度だけ表示、
    // 以降は isOpen の時だけ内容を更新する。
    if (pinnedId != null) {
      const living = world.chibis.find((c) => c.id === pinnedId);
      const isOpen = !modal.classList.contains('hidden');
      if (living) {
        pinnedWasAlive = true;
        if (isOpen) showChibiModal(living, false);
      } else {
        const corpse = world.corpses.find((c) => c.id === pinnedId);
        if (corpse && pinnedWasAlive) {
          // 死んだ瞬間 1 度だけ epitaph を出す。閉じた後は再表示しない。
          showChibiModal(corpse, true);
          pinnedWasAlive = false;
        } else if (!corpse) {
          pinnedId = null;
          pinnedWasAlive = false;
        } else if (isOpen) {
          // 死後、モーダルが開きっぱなしなら内容だけ追従させる
          showChibiModal(corpse, true);
        }
      }
    }

    uiTimer += dtReal;
    if (uiTimer >= CONFIG.UI_REFRESH_SEC) {
      refreshUI(world, cb);
      uiTimer = 0;
    }
    lastSave += dtReal;
    if (lastSave >= CONFIG.AUTOSAVE_SEC) {
      save(world, currentSlot);
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
    save(world, currentSlot);
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
  if (!died && Math.random() < 0.1) {
    damageChibi(world, c, c.hp, 'kamisama_punch');
    return;
  }
  if (!died && Math.random() < 0.25) {
    setState(c, 'angry', 1.2);
    spawnBubble(world.bubbles, c.pos, pickGodDefianceLine(), 'speech', 1.6);
    pushLife(c, Math.floor(c.ageSec), '神様に怒った');
  }
  // 周囲 60px の目撃者が反応
  spawnWitnessReactions(world, c.pos, c.id);
}

// 殴打／投げの近くで見ていた子達のリアクション。60px 以内の idle を 2人まで反応させる。
function spawnWitnessReactions(world: WorldState, epicenter: { x: number; y: number }, excludeId?: number) {
  const witnesses = world.chibis.filter(
    (o) => isChibiAlive(o) && o.id !== excludeId && distVec(o.pos, epicenter) < 60 && o.state === 'idle',
  );
  if (witnesses.length === 0) return;
  const count = Math.min(2, witnesses.length);
  for (let i = 0; i < count; i++) {
    const w = witnesses.splice(Math.floor(Math.random() * witnesses.length), 1)[0]!;
    // zako が高い子はドライに笑う、それ以外は驚く
    if (w.params.zako > 55 && Math.random() < 0.3) {
      spawnBubble(world.bubbles, w.pos, pickWitnessLaughLine(), 'speech', 1.4);
      pushLife(w, Math.floor(w.ageSec), '殴打を目撃して笑った');
    } else {
      spawnBubble(world.bubbles, w.pos, pickWitnessShockLine(), 'speech', 1.4);
      if (Math.random() < 0.3) setState(w, 'dazed', 0.8);
      pushLife(w, Math.floor(w.ageSec), '殴打を目撃した');
    }
  }
  // NPC も近くにいたら反応（Suzu が特に）
  for (const n of world.npcs) {
    if (n.dead) continue;
    if (distVec(n.pos, epicenter) > 80) continue;
    if (n.id === 'suzu' && Math.random() < 0.5) {
      spawnBubble(world.bubbles, n.pos, 'なにやってるの！？', 'npc-speech', 2);
    } else if (n.id === 'cocoon' && Math.random() < 0.4) {
      spawnBubble(world.bubbles, n.pos, 'ざまあみろ！', 'npc-speech', 1.8);
    } else if (n.id === 'furana' && Math.random() < 0.6) {
      spawnBubble(world.bubbles, n.pos, 'あらあらわふ…', 'npc-speech', 1.8);
    }
  }
}

// NPC 殴打：ちびわふより頑丈なのでダメージ低め、リアクション多め
function punchNpc(world: WorldState, id: NpcId) {
  const n = world.npcs.find((x) => x.id === id);
  if (!n || n.dead) return;
  spawnBubble(world.bubbles, { x: n.pos.x, y: n.pos.y - 30 }, '💥', 'stomp', 0.6);
  const dmg = 3 + Math.floor(Math.random() * 6);
  damageNpc(world, n, dmg);
  // 周囲の目撃者が反応
  spawnWitnessReactions(world, n.pos);
}

function dropNpc(world: WorldState, id: NpcId, releasedX: number, releasedY: number, vx: number, vy: number) {
  const n = world.npcs.find((x) => x.id === id);
  if (!n || n.dead) return;
  n.pos.x = releasedX;
  n.pos.y = releasedY;
  const speed = Math.hypot(vx, vy);
  const flightSec = 0.55;
  const expectedDist = speed * flightSec;
  const dmg = Math.round(1 + Math.min(16, speed * 0.01));
  if (expectedDist > 60) {
    spawnBubble(world.bubbles, n.pos, pickNpcThrowLine(id), 'npc-speech', 0.9);
  }
  launchFlight(n, vx, vy, flightSec, dmg, 'kamisama_throw');
  spawnWitnessReactions(world, { x: releasedX, y: releasedY });
}

// オオカミ殴打：神様のパンチで 12-20 ダメージ。HP 30 なので 2-3 発で倒せる。
function punchWolf(world: WorldState, wolfId: number) {
  const wolf = world.wolves.find((x) => x.id === wolfId);
  if (!wolf || wolf.state === 'dead') return;
  spawnBubble(world.bubbles, { x: wolf.pos.x, y: wolf.pos.y - 30 }, '💥', 'stomp', 0.6);
  const dmg = 12 + Math.floor(Math.random() * 9);
  damageWolf(world, wolf, dmg);
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
  (document.getElementById('modal-age')!).textContent = `HP ${Math.round(n.hp)} / ${n.maxHp}`;
  (document.getElementById('modal-traits')!).innerHTML = '';
  (document.getElementById('modal-epitaph')!).textContent = '';
  (document.getElementById('modal-epitaph')!).classList.remove('show');
  const hpPct = (n.hp / n.maxHp) * 100;
  let paramsHtml =
    `<div class="param-row"><span class="label">HP</span>` +
    `<span class="bar"><span class="fill" style="width:${hpPct}%;background:#d85"></span></span>` +
    `<span class="value">${Math.round(n.hp)}</span></div>`;
  // フラナは機嫌も表示
  if (n.id === 'furana') {
    const moodPct = Math.max(0, Math.min(100, n.mood));
    const moodColor = moodPct >= 60 ? '#6bc47a' : moodPct >= 30 ? '#f0b94a' : '#d85c5c';
    const moodLabel = moodPct >= 70 ? 'ごきげん' : moodPct >= 40 ? 'ふつう' : moodPct >= 20 ? 'イライラ' : 'ぶち切れ';
    paramsHtml +=
      `<div class="param-row"><span class="label">機嫌</span>` +
      `<span class="bar"><span class="fill" style="width:${moodPct}%;background:${moodColor}"></span></span>` +
      `<span class="value">${Math.round(moodPct)} (${moodLabel})</span></div>`;
  }
  (document.getElementById('modal-params')!).innerHTML = paramsHtml;
  (document.getElementById('modal-flavors')!).innerHTML =
    n.id === 'furana' ? '<li>村の母。死ぬと出産停止＋ちびわふ大パニック。機嫌が悪くなると手加減しなくなる。</li>'
    : n.id === 'cocoon' ? '<li>いじめっ子。ちびわふを叩く。たまに返り討ちで死ぬ。</li>'
    : n.id === 'suzu' ? '<li>村の点呼係。ママ想い。</li>'
    : '<li>……無口で何してるか分からない。</li>';
  // 最近の出来事（新しい順に最大 12 件）
  const lifeEl = document.getElementById('modal-life')!;
  lifeEl.innerHTML = '';
  const recent = n.lifeLog.slice(-12).reverse();
  for (const ev of recent) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="sec">${ev.sec}s</span><span>${escapeHtml(ev.text)}</span>`;
    lifeEl.appendChild(li);
  }
  if (recent.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'まだ何も記録されていない';
    li.style.color = '#aaa';
    lifeEl.appendChild(li);
  }
}

// リリース位置とカーソル速度をそのまま飛行に反映。
// 指を速く離すほど速く＆遠くに飛ぶ（flightSec は 0.5 固定、速度で飛距離が決まる）。
function dropChibi(world: WorldState, chibiId: number, releasedX: number, releasedY: number, vx: number, vy: number) {
  const c = world.chibis.find((x) => x.id === chibiId);
  if (!c || !isChibiAlive(c)) return;
  c.pos.x = releasedX;
  c.pos.y = releasedY;
  c.target = null;
  const speed = Math.hypot(vx, vy);
  const flightSec = 0.55;  // 固定：速い速度 = そのまま飛ぶ距離が伸びる
  const expectedDist = speed * flightSec;
  const dmg = Math.round(2 + Math.min(40, speed * 0.025));
  setState(c, 'surprised', flightSec + 0.3);
  if (expectedDist > 60) {
    spawnBubble(world.bubbles, c.pos, pickGodThrowLine(), 'speech', 0.9);
  }
  pushLife(c, Math.floor(c.ageSec), `神様に投げ飛ばされた（速度${Math.round(speed)}）`);
  launchFlight(c, vx, vy, flightSec, dmg, 'kamisama_throw');
  spawnWitnessReactions(world, { x: releasedX, y: releasedY }, c.id);
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
  // HP / 空腹 / 疲労 をまず表示（生死に直結するゲージ）
  const statusRows: Array<{ label: string; value: number; max: number; color: string; warn?: boolean }> = [
    { label: 'HP',   value: c.hp,      max: c.maxHp, color: '#d85' },
    { label: '空腹', value: c.hunger,  max: 100, color: '#f0a030', warn: c.hunger >= 70 },
    { label: '疲労', value: c.fatigue, max: 100, color: '#6a7c8a', warn: c.fatigue >= 70 },
  ];
  for (const s of statusRows) {
    const pct = s.max > 0 ? (s.value / s.max) * 100 : 0;
    const row = document.createElement('div');
    row.className = 'param-row';
    row.innerHTML = `
      <span class="label">${s.label}</span>
      <span class="bar"><span class="fill" style="width:${pct}%;background:${s.warn ? '#d84' : s.color}"></span></span>
      <span class="value">${Math.round(s.value)}${s.label === 'HP' ? `/${s.max}` : ''}</span>
    `;
    paramsEl.appendChild(row);
  }
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
