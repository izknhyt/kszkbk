import { createStage } from './render/stage3d';
import { bindUI, refreshUI, type UICallbacks } from './render/ui';
import {
  buildAt,
  createWorld,
  damageChibi,
  damageNpc,
  damageWolf,
  enqueueTerraformLower,
  enqueueTerraformRaise,
  ensurePlots,
  setRampOnTile,
  forceSpawn,
  launchFlight,
  LOWER_SOIL_GAIN,
  tickWorld,
  triggerBokaigi,
  triggerFire,
  triggerOndo,
  upgradeOne,
  worldToTile,
} from './sim/world';
import { pushLife } from './sim/world';
import { isAlive as isChibiAlive, setState } from './sim/chibiwafu';
import { spawnBubble } from './sim/bubbles';
import {
  pickConstructionCancelLine,
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
import type { Chibiwafu, Feature, HitTarget, VillageRank } from './types';
import { clearSave, listSlots, load, save, type SlotId } from './meta/save';
import { CONFIG, type TimeScale } from './config';
import { DEATH_CAUSES } from './sim/deaths';
import type { Difficulty } from './types';
import { BUILDINGS } from './city/buildings';
import { CONSTRUCTION_SEC, isConstructionPriority, setConstructionPriority } from './sim/world';

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
  stage.onResize((w: number, h: number) => {
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
  type BuildKind = 'water' | 'farm' | 'channel' | 'path' | 'house' | 'well' | 'firewatch' | 'sawmill' | 'shrine' | 'generator' | 'streetlamp' | 'powerline' | 'kiln' | 'pasture' | 'loom';
  let buildMode: BuildKind | null = null;
  const plotBuildCosts: Record<BuildKind, { wood: number; stone: number; plank?: number; soil?: number }> = {
    water:      { wood: 0, stone: 5, soil: 10 },
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
    water: '水源', farm: '畑', channel: '水路', path: '道', house: '家',
    well: '井戸', firewatch: '火の見やぐら', sawmill: '製材所', shrine: '神社',
    generator: 'ペダル発電所', streetlamp: '街灯', powerline: '電線', kiln: '精錬所',
    pasture: '牧場', loom: '織機',
  };
  const FEAT_EMOJI_MAP: Record<BuildKind, string> = {
    water:'💧', farm:'🌾', channel:'🌊', path:'🛤', house:'🏠',
    well:'⛲', firewatch:'🔥', sawmill:'🪚', shrine:'⛩',
    generator:'⚡', streetlamp:'💡', powerline:'🪜', kiln:'🧱',
    pasture:'🐑', loom:'🧶',
  };
  const FEAT_EFFECT_DESC: Record<BuildKind, string> = {
    water:      '周囲 70px の水路に水を供給',
    farm:       'watered で 🍞 0.08/秒生産',
    channel:    '水源↔畑 70px 以内で通水',
    path:       '移動ルート（将来実装）',
    house:      '定員 4 人、夜間野宿ペナルティ回避',
    well:       '乾燥でも畑が 0.4 倍生産を維持',
    firewatch:  '半径 180px の火事ダメージ ×0.25',
    sawmill:    '🪵×2 → 🪚×1（ちびわふ労働）',
    shrine:     '半径 200px で空腹・疲労 −30%',
    generator:  'ちびわふが漕いで ⚡ を生産',
    streetlamp: '夜間照明、⚡ 消費、🐺 忌避',
    powerline:  '発電所↔街灯を 90px で中継',
    kiln:       '🪨×3 → 🧱×1（ちびわふ労働）',
    pasture:    '🐑 0.03/秒 自動生産',
    loom:       '🐑×2 → 🧶×1（ちびわふ労働）',
  };
  // ツールチップ詳細説明
  function buildTooltipHtml(kind: BuildKind): string {
    const cost = plotBuildCosts[kind];
    const pts = CONSTRUCTION_SEC[kind as keyof typeof CONSTRUCTION_SEC] ?? 45;
    const parts: string[] = [];
    if (cost.wood  > 0) parts.push(`🪵×${cost.wood}`);
    if (cost.stone > 0) parts.push(`🪨×${cost.stone}`);
    if ((cost.plank ?? 0) > 0) parts.push(`🪚×${cost.plank}`);
    if ((cost.soil  ?? 0) > 0) parts.push(`🟫×${cost.soil}`);
    const costStr = parts.join(' ') || 'なし';
    const have = {
      wood: Math.floor(world.resources.wood),
      stone: Math.floor(world.resources.stone),
      plank: Math.floor(world.resources.plank),
      soil: Math.floor(world.resources.soil),
    };
    const shortage: string[] = [];
    if (cost.wood  > have.wood)  shortage.push(`🪵あと${cost.wood - have.wood}`);
    if (cost.stone > have.stone) shortage.push(`🪨あと${cost.stone - have.stone}`);
    if ((cost.plank ?? 0) > have.plank) shortage.push(`🪚あと${(cost.plank ?? 0) - have.plank}`);
    if ((cost.soil  ?? 0) > have.soil)  shortage.push(`🟫あと${(cost.soil  ?? 0) - have.soil}`);
    const shortageHtml = shortage.length > 0
      ? `<div class="tt-rule"></div><div class="tt-row"><span class="tt-k tt-short">不足</span><span class="tt-v">${shortage.join('、')}ほしいわふ</span></div>`
      : '';
    return `<b>${FEAT_EMOJI_MAP[kind]} ${buildModeLabel[kind]}</b>` +
      `<div class="tt-rule"></div>` +
      `<div class="tt-row"><span class="tt-k">コスト</span><span class="tt-v">${escapeHtml(costStr)}</span></div>` +
      `<div class="tt-row"><span class="tt-k">建設目安</span><span class="tt-v">1人で約${pts}秒、4人で約${Math.ceil(pts/3)}秒</span></div>` +
      `<div class="tt-row"><span class="tt-k">効果</span><span class="tt-v">${escapeHtml(FEAT_EFFECT_DESC[kind])}</span></div>` +
      shortageHtml;
  }
  function terraformTooltipHtml(mode: 'raise' | 'lower'): string {
    if (mode === 'raise') {
      return `<b>⛰ 盛り土</b>` +
        `<div class="tt-rule"></div>` +
        `<div class="tt-row"><span class="tt-k">コスト</span><span class="tt-v">🟫×10（即時消費）</span></div>` +
        `<div class="tt-row"><span class="tt-k">作業</span><span class="tt-v">ちびわふが 28px 内で進行</span></div>` +
        `<div class="tt-row"><span class="tt-k">効果</span><span class="tt-v">タイル elev +5</span></div>` +
        `<div class="tt-note">⚠ stability 低下 → 土砂崩れで死人が出るわふ</div>`;
    }
    return `<b>⛏ 切り土</b>` +
      `<div class="tt-rule"></div>` +
      `<div class="tt-row"><span class="tt-k">コスト</span><span class="tt-v">なし（報酬あり）</span></div>` +
      `<div class="tt-row"><span class="tt-k">作業</span><span class="tt-v">ちびわふが 28px 内で進行</span></div>` +
      `<div class="tt-row"><span class="tt-k">報酬</span><span class="tt-v">🟫 soil +18、岩なら 🪨 stone +7</span></div>` +
      `<div class="tt-row"><span class="tt-k">効果</span><span class="tt-v">タイル elev −5</span></div>`;
  }

  // ========= Σ-6-UI-a: カテゴリタブ + ビルドカード ========================
  const BUILD_CATEGORIES: Array<{ id: string; kinds: BuildKind[] }> = [
    { id: 'water',    kinds: ['water', 'channel', 'path'] },
    { id: 'food',     kinds: ['farm', 'pasture'] },
    { id: 'home',     kinds: ['house', 'well'] },
    { id: 'defense',  kinds: ['firewatch'] },
    { id: 'industry', kinds: ['sawmill', 'kiln', 'loom'] },
    { id: 'power',    kinds: ['generator', 'streetlamp', 'powerline'] },
    { id: 'faith',    kinds: ['shrine'] },
  ];
  let activeBuildCategory = 'water';

  function costHtml(kind: BuildKind): string {
    const cost = plotBuildCosts[kind];
    const have = {
      wood: world.resources.wood, stone: world.resources.stone,
      plank: world.resources.plank, soil: world.resources.soil,
    };
    const fmt = (emoji: string, need: number, cur: number) => {
      if (need <= 0) return '';
      const short = cur < need;
      return `<span${short ? ' class="short"' : ''}>${emoji}×${need}</span>`;
    };
    const parts = [
      fmt('🪵', cost.wood, have.wood),
      fmt('🪨', cost.stone, have.stone),
      fmt('🪚', cost.plank ?? 0, have.plank),
      fmt('🟫', cost.soil ?? 0, have.soil),
    ].filter(Boolean);
    return parts.join(' ') || 'なし';
  }

  function canAffordBuild(kind: BuildKind): boolean {
    const cost = plotBuildCosts[kind];
    return world.resources.wood  >= cost.wood &&
           world.resources.stone >= cost.stone &&
           world.resources.plank >= (cost.plank ?? 0) &&
           world.resources.soil  >= (cost.soil  ?? 0);
  }

  function renderBuildCards() {
    const host = document.getElementById('build-cards');
    if (!host) return;
    host.innerHTML = '';
    const cat = BUILD_CATEGORIES.find((c) => c.id === activeBuildCategory);
    if (!cat) return;
    for (const kind of cat.kinds) {
      const affordable = canAffordBuild(kind);
      const isActive = buildMode === kind;
      const card = document.createElement('div');
      card.className = `build-card${!affordable ? ' cant-afford' : ''}${isActive ? ' active' : ''}`;
      card.dataset.plotKind = kind;
      card.innerHTML =
        `<div class="build-card-name">${FEAT_EMOJI_MAP[kind]} ${buildModeLabel[kind]}</div>` +
        `<div class="build-card-cost">${costHtml(kind)}</div>` +
        `<div class="build-card-effect">${escapeHtml(FEAT_EFFECT_DESC[kind])}</div>`;
      host.appendChild(card);
    }
  }

  // カテゴリタブ切替
  document.getElementById('build-cat-tabs')?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.build-cat-tab');
    if (!btn?.dataset.cat) return;
    activeBuildCategory = btn.dataset.cat;
    document.querySelectorAll('.build-cat-tab').forEach((b) => b.classList.toggle('active', b === btn));
    renderBuildCards();
  });

  // ビルドカードクリック（イベント委譲）
  document.getElementById('build-cards')?.addEventListener('click', (e) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('.build-card');
    if (!card) return;
    if (card.classList.contains('cant-afford')) {
      const kind = card.dataset.plotKind as BuildKind;
      const cost = plotBuildCosts[kind];
      const shortage: string[] = [];
      if (cost.wood  > world.resources.wood)  shortage.push(`🪵あと${Math.ceil(cost.wood - world.resources.wood)}本ほしいわふ`);
      if (cost.stone > world.resources.stone) shortage.push(`🪨あと${Math.ceil(cost.stone - world.resources.stone)}個ほしいわふ`);
      if ((cost.plank ?? 0) > world.resources.plank) shortage.push(`🪚あと${Math.ceil((cost.plank ?? 0) - world.resources.plank)}枚ほしいわふ`);
      if ((cost.soil  ?? 0) > world.resources.soil)  shortage.push(`🟫あと${Math.ceil((cost.soil  ?? 0) - world.resources.soil)}ほしいわふ`);
      flashToast(shortage.join(' '), 'info');
      return;
    }
    const kind = card.dataset.plotKind as BuildKind;
    setTerraformMode(null);
    setBuildMode(buildMode === kind ? null : kind);
    renderBuildCards();
  });

  // リソース変動でカードの disabled 状態を更新
  function updateBuildCards() {
    document.querySelectorAll<HTMLElement>('.build-card').forEach((card) => {
      const kind = card.dataset.plotKind as BuildKind;
      if (!kind) return;
      const affordable = canAffordBuild(kind);
      card.classList.toggle('cant-afford', !affordable);
      // コスト表示も更新（不足/充足の色変わり）
      const costEl = card.querySelector('.build-card-cost');
      if (costEl) costEl.innerHTML = costHtml(kind);
    });
  }

  // ========= Σ-6-UI-b: ツールチップ =======================================
  const tooltipEl = document.getElementById('kszk-tooltip')!;
  let tooltipTimer: ReturnType<typeof setTimeout> | null = null;
  let tooltipMouseX = 0;
  let tooltipMouseY = 0;

  function showTooltip(html: string) {
    tooltipEl.innerHTML = html;
    tooltipEl.classList.remove('hidden');
    positionTooltip(tooltipMouseX, tooltipMouseY);
  }
  function hideTooltip() {
    if (tooltipTimer !== null) { clearTimeout(tooltipTimer); tooltipTimer = null; }
    tooltipEl.classList.add('hidden');
  }
  function positionTooltip(x: number, y: number) {
    const margin = 14;
    const tw = Math.min(tooltipEl.scrollWidth + 2, 240);
    const th = tooltipEl.scrollHeight + 2;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x + margin;
    let top  = y + margin;
    if (left + tw > vw - 4) left = x - tw - margin;
    if (top  + th > vh - 4) top  = y - th - margin;
    tooltipEl.style.left = `${Math.max(4, left)}px`;
    tooltipEl.style.top  = `${Math.max(4, top)}px`;
  }

  // マウス移動でトラッキング
  document.addEventListener('mousemove', (e) => {
    tooltipMouseX = e.clientX;
    tooltipMouseY = e.clientY;
    if (!tooltipEl.classList.contains('hidden')) {
      positionTooltip(tooltipMouseX, tooltipMouseY);
    }
  });

  // HUD パネルにホバーイベント（委譲）
  document.getElementById('build-cards')?.addEventListener('mouseover', (e) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('.build-card');
    if (!card?.dataset.plotKind) { hideTooltip(); return; }
    if (tooltipTimer) clearTimeout(tooltipTimer);
    tooltipTimer = setTimeout(() => showTooltip(buildTooltipHtml(card.dataset.plotKind as BuildKind)), 420);
  });
  document.getElementById('build-cards')?.addEventListener('mouseleave', hideTooltip);

  document.querySelectorAll<HTMLElement>('.terraform-btn').forEach((btn) => {
    btn.addEventListener('mouseover', () => {
      if (tooltipTimer) clearTimeout(tooltipTimer);
      const mode = btn.dataset.terraform as 'raise' | 'lower';
      tooltipTimer = setTimeout(() => showTooltip(terraformTooltipHtml(mode)), 420);
    });
    btn.addEventListener('mouseleave', hideTooltip);
  });

  // ========= Σ-6-UI-c: 警告パネル =========================================
  type WarnId = 'food-low' | 'wolf-near' | 'construction-stalled';
  const dismissedWarnings = new Set<WarnId>();

  function updateWarningPanel() {
    const panel = document.getElementById('warning-panel');
    if (!panel) return;
    const warnings: Array<{ id: WarnId; icon: string; text: string; critical?: boolean }> = [];

    // 食料残量と消費速度から余命を計算
    const food = world.resources.food;
    // 食料消費をざっくり推定: ちびわふ数 × 0.04/sec (hunger tick ベース概算)
    const foodConsRate = world.chibis.length * 0.04;
    if (food < 15) {
      const lifetimeSec = foodConsRate > 0 ? Math.floor(food / foodConsRate) : 999;
      warnings.push({
        id: 'food-low',
        icon: '🍞',
        text: `おなかすいたわふ…！食料あと約${lifetimeSec}秒分 (${Math.floor(food)})`,
        critical: food < 5,
      });
    }

    // オオカミ出現
    const wolfCount = world.wolves.filter((w) => w.state !== 'dead').length;
    if (wolfCount > 0) {
      warnings.push({ id: 'wolf-near', icon: '🐺', text: `オオカミ出現！${wolfCount}匹いるわふ！逃げてー！` });
    }

    // 建設滞留：devLevel < 2 で workSec が 60 秒以上停止している feature
    const stalledCount = world.features.filter((f) => f.devLevel < 2 && (f.workSec ?? 0) === 0).length;
    if (stalledCount > 0) {
      warnings.push({ id: 'construction-stalled', icon: '🔨', text: `建設が${stalledCount}件止まってるわふ…ちびわふ近くに呼んでね` });
    }

    // DOM 更新：既存 item を保持しつつ差分更新
    const existing = new Map<WarnId, HTMLElement>();
    panel.querySelectorAll<HTMLElement>('[data-warn-id]').forEach((el) => {
      existing.set(el.dataset.warnId as WarnId, el);
    });

    for (const [id, el] of existing) {
      if (!warnings.find((w) => w.id === id) || dismissedWarnings.has(id)) {
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.3s';
        setTimeout(() => el.remove(), 310);
        existing.delete(id);
      }
    }

    for (const w of warnings) {
      if (dismissedWarnings.has(w.id)) continue;
      let el = existing.get(w.id);
      const isNew = !el;
      if (!el) {
        el = document.createElement('div');
        el.className = `warning-item${w.critical ? ' warn-critical' : ''}`;
        el.dataset.warnId = w.id;
        el.innerHTML =
          `<span class="warn-icon">${w.icon}</span>` +
          `<span class="warn-text"></span>` +
          `<button class="warn-dismiss" title="閉じる">×</button>`;
        el.querySelector('.warn-dismiss')!.addEventListener('click', () => {
          dismissedWarnings.add(w.id);
          el!.style.opacity = '0';
          el!.style.transition = 'opacity 0.3s';
          setTimeout(() => el!.remove(), 310);
        });
        panel.appendChild(el);
        // non-critical は 8 秒後に自動フェードアウト（条件が続いていれば次の refresh で再表示）
        if (!w.critical && isNew) {
          setTimeout(() => {
            if (el && el.isConnected) {
              el.style.opacity = '0';
              el.style.transition = 'opacity 0.4s';
              setTimeout(() => el?.remove(), 410);
            }
          }, 8000);
        }
      }
      el.querySelector<HTMLElement>('.warn-text')!.textContent = w.text;
      el.classList.toggle('warn-critical', !!w.critical);
    }
    // dismissed セットは 60 秒でリセット（food が回復したら再警告）
    if (world.tick % 3600 === 0) dismissedWarnings.clear();
  }

  // ========= Σ-6-UI-c: リソース傾向（trend arrows） =======================
  interface ResSnapshot {
    t: number;
    food: number; water: number; wood: number; stone: number;
    plank: number; power: number; brick: number; wool: number; cloth: number; soil: number;
  }
  const resHistory: ResSnapshot[] = [];

  function updateResHistory() {
    const r = world.resources;
    resHistory.push({
      t: world.timeSec,
      food: r.food, water: r.water, wood: r.wood, stone: r.stone,
      plank: r.plank ?? 0, power: r.power ?? 0, brick: r.brick ?? 0,
      wool: r.wool ?? 0, cloth: r.cloth ?? 0, soil: r.soil ?? 0,
    });
    while (resHistory.length > 1 && world.timeSec - resHistory[0]!.t > 30) resHistory.shift();
  }

  function resTrend(key: keyof ResSnapshot): string {
    if (key === 't') return '';
    if (resHistory.length < 2) return '';
    const now = resHistory[resHistory.length - 1]!;
    const old = resHistory[0]!;
    if (world.timeSec - old.t < 5) return '';
    const diff = (now[key] as number) - (old[key] as number);
    if (diff > 1)  return '▲';
    if (diff < -1) return '▼';
    return '';
  }

  function updateResourceBar() {
    updateResHistory();
    const r = world.resources;
    const entries: Array<{ id: string; val: number; trend: keyof ResSnapshot; low?: number; critical?: number }> = [
      { id: 'food',  val: r.food,         trend: 'food',  low: 10, critical: 5 },
      { id: 'water', val: r.water,        trend: 'water' },
      { id: 'wood',  val: r.wood,         trend: 'wood',  low: 3 },
      { id: 'stone', val: r.stone,        trend: 'stone', low: 3 },
      { id: 'plank', val: r.plank ?? 0,   trend: 'plank' },
      { id: 'power', val: r.power ?? 0,   trend: 'power' },
      { id: 'brick', val: r.brick ?? 0,   trend: 'brick' },
      { id: 'wool',  val: r.wool ?? 0,    trend: 'wool' },
      { id: 'cloth', val: r.cloth ?? 0,   trend: 'cloth' },
      { id: 'soil',  val: r.soil ?? 0,    trend: 'soil',  low: 5 },
    ];
    for (const e of entries) {
      const valEl = document.getElementById(`stat-${e.id}`);
      if (valEl) {
        valEl.textContent = String(Math.floor(e.val));
        valEl.classList.toggle('low',      e.low      != null && e.val < e.low);
        valEl.classList.toggle('critical', e.critical != null && e.val < e.critical);
      }
      const resItem = document.getElementById(`stat-${e.id}`)?.closest('.res-item');
      if (resItem) {
        resItem.classList.toggle('res-critical', e.critical != null && e.val < e.critical);
      }
      const trendEl = document.getElementById(`trend-${e.id}`);
      if (trendEl) {
        const t = resTrend(e.trend);
        trendEl.textContent = t;
        trendEl.className = `res-trend ${t === '▲' ? 'up' : t === '▼' ? 'down' : 'flat'}`;
      }
    }
  }

  // ========= Σ-6-UI-c: アクションバー =====================================
  document.getElementById('ab-build')?.addEventListener('click', () => {
    // build タブを開く
    const buildTab = document.querySelector<HTMLButtonElement>('.tab[data-tab="build"]');
    buildTab?.click();
  });
  document.getElementById('ab-terrain')?.addEventListener('click', () => {
    // build タブを開いてから terraform mode を toggle
    const buildTab = document.querySelector<HTMLButtonElement>('.tab[data-tab="build"]');
    buildTab?.click();
    setTerraformMode(terraformMode === 'raise' ? null : 'raise');
  });
  document.getElementById('ab-ondo')?.addEventListener('click', () => triggerOndo(world));
  document.getElementById('ab-bokai')?.addEventListener('click', () => triggerBokaigi(world));
  document.getElementById('ab-fire')?.addEventListener('click', () => triggerFire(world));

  // 等高線 ON/OFF トグル
  let contourOn = false;
  const contourBtn = document.getElementById('ab-contour') as HTMLButtonElement | null;
  const toggleContour = () => {
    contourOn = !contourOn;
    stage.setContourVisible(contourOn);
    if (contourBtn) contourBtn.classList.toggle('active', contourOn);
    flashToast(contourOn ? '📐 等高線 ON' : '📐 等高線 OFF', 'info');
  };
  contourBtn?.addEventListener('click', toggleContour);
  document.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'c' || e.key === 'C') toggleContour();
  });

  // build mode indicator の解除ボタン
  document.getElementById('build-mode-cancel')?.addEventListener('click', () => {
    setBuildMode(null);
    setTerraformMode(null);
    renderBuildCards();
  });

  // ビルドカードを初期描画（全クロージャ定義後）
  renderBuildCards();

  // 建設キャンセル：devLevel<2 の feature を解体、半額返金。
  // 既に投入済みの wood/stone/plank/soil を ceil(cost/2) で返す。
  function cancelConstruction(fid: string) {
    const fi = world.features.findIndex((f) => f.id === fid);
    if (fi < 0) return;
    const f = world.features[fi]!;
    if (f.devLevel >= 2) return;  // 完成済みはキャンセル不可
    const cost = plotBuildCosts[f.kind as BuildKind];
    if (!cost) return;
    const refundWood  = Math.ceil(cost.wood * 0.8);
    const refundStone = Math.ceil(cost.stone * 0.8);
    const refundPlank = Math.ceil((cost.plank ?? 0) * 0.8);
    const refundSoil  = Math.ceil((cost.soil ?? 0) * 0.8);
    world.resources.wood  += refundWood;
    world.resources.stone += refundStone;
    world.resources.plank += refundPlank;
    world.resources.soil  += refundSoil;
    // 近くのワーカーから嘆きセリフ
    let nearestWorker = null as { pos: { x: number; y: number } } | null;
    let nearestD = Infinity;
    for (const c of world.chibis) {
      if (!isChibiAlive(c)) continue;
      const d = Math.hypot(c.pos.x - f.pos.x, c.pos.y - f.pos.y);
      if (d < 60 && d < nearestD) { nearestWorker = c; nearestD = d; }
    }
    const bubblePos = nearestWorker ? nearestWorker.pos : f.pos;
    spawnBubble(world.bubbles, bubblePos, pickConstructionCancelLine(), 'speech', 2.0);
    world.features.splice(fi, 1);
    const parts: string[] = [];
    if (refundWood  > 0) parts.push(`🪵${refundWood}`);
    if (refundStone > 0) parts.push(`🪨${refundStone}`);
    if (refundPlank > 0) parts.push(`🪚${refundPlank}`);
    if (refundSoil  > 0) parts.push(`🌱${refundSoil}`);
    flashToast(`🔨 建設キャンセル（返金 ${parts.join(' ')}）`, 'info');
  }
  function setBuildMode(m: typeof buildMode) {
    buildMode = m;
    // ビルドカードのアクティブ状態を更新
    document.querySelectorAll<HTMLElement>('.build-card').forEach((card) => {
      card.classList.toggle('active', card.dataset.plotKind === m);
    });
    // mode indicator バー
    const indicator = document.getElementById('build-mode-indicator');
    const modeText  = document.getElementById('build-mode-text');
    if (indicator && modeText) {
      if (m) {
        indicator.classList.remove('hidden');
        modeText.textContent = `${FEAT_EMOJI_MAP[m]} ${buildModeLabel[m]} 配置中`;
      } else {
        indicator.classList.add('hidden');
      }
    }
    // アクションバーの建設ボタン active 状態
    document.getElementById('ab-build')?.classList.toggle('active', m !== null);
    const hint = document.getElementById('plot-build-hint');
    if (hint) {
      hint.textContent = m
        ? `${buildModeLabel[m]} モード：地面を左クリックで設置／再押下で解除`
        : 'ボタンを押してから地面の好きな場所を左クリックわふ';
    }
  }
  // 旧 .plot-build-btn リスナー（後方互換；HTML からは削除済みだがセーフガード）
  document.querySelectorAll<HTMLButtonElement>('.plot-build-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.plotKind as BuildKind;
      setTerraformMode(null);
      setBuildMode(buildMode === kind ? null : kind);
    });
  });

  // 地形編集モード（盛り土 / 切り土）
  type TerraformMode = 'raise' | 'lower' | null;
  let terraformMode: TerraformMode = null;
  const terraformLabel: Record<NonNullable<TerraformMode>, string> = {
    raise: '盛り土',
    lower: '切り土',
  };
  function setTerraformMode(m: TerraformMode) {
    terraformMode = m;
    document.querySelectorAll<HTMLButtonElement>('.terraform-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.terraform === m);
    });
    // アクションバーの地形ボタン active 状態
    document.getElementById('ab-terrain')?.classList.toggle('active', m !== null);
    // Σ-8 toolbar の active を raise/lower と同期
    setSigma8ToolActive(m);
    if (m) {
      setBuildMode(null);
      const hint = document.getElementById('plot-build-hint');
      if (hint) hint.textContent = `${terraformLabel[m]} モード：地面を左クリックでタイル選択（ちびわふが作業）`;
    } else {
      // terraform 解除時は mode indicator も消す
      const indicator = document.getElementById('build-mode-indicator');
      indicator?.classList.add('hidden');
      const hint = document.getElementById('plot-build-hint');
      if (hint && !buildMode) hint.textContent = 'ボタンを押してから地面の好きな場所を左クリックわふ';
    }
  }
  document.querySelectorAll<HTMLButtonElement>('.terraform-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.terraform as NonNullable<TerraformMode>;
      setTerraformMode(terraformMode === kind ? null : kind);
    });
  });

  // ========= Σ-8 Toolbar / Tool Panel（骨格）=============================
  // 7 ツールのうち raise/lower は既存 setTerraformMode に橋渡し。
  // flatten/smooth/ramp/channel/build は Σ-8-b/c/d で実装、現状はスタブ。
  type S8Tool = 'raise' | 'lower' | 'flatten' | 'smooth' | 'ramp' | 'channel' | 'build';
  const S8_TOOL_LABELS: Record<S8Tool, { name: string; hint: string }> = {
    raise:   { name: '⛰ 盛る',   hint: 'タイルを 1 段(25)上げる' },
    lower:   { name: '⛏ 削る',   hint: 'タイルを 1 段(25)下げる' },
    flatten: { name: '▭ 平坦',   hint: '対象を基準 elev に揃える（Σ-8-d）' },
    smooth:  { name: '〰 整地',   hint: '段差を整理する（Σ-8-d）' },
    ramp:    { name: '📐 坂道',  hint: '高さ差 1 段の隣接に ramp を作る（Σ-8-b）' },
    channel: { name: '💧 水路',  hint: 'drag で溝を掘る（Σ-8-d）' },
    build:   { name: '🔨 建設',  hint: '建物パネルへ' },
  };
  function setSigma8ToolActive(m: TerraformMode) {
    document.querySelectorAll<HTMLButtonElement>('.s8-tool').forEach((b) => {
      const t = b.dataset.s8tool as S8Tool | undefined;
      b.classList.toggle('active', (m === 'raise' && t === 'raise') || (m === 'lower' && t === 'lower'));
    });
    updateSigma8Panel(m);
  }
  function updateSigma8Panel(m: TerraformMode | S8Tool | null) {
    const root = document.getElementById('sigma8-tool-panel');
    const nameEl = document.getElementById('s8-tool-name');
    const hintEl = document.getElementById('s8-tool-hint');
    const rampRow = document.getElementById('s8-ramp-row');
    if (!root || !nameEl || !hintEl) return;
    // ツール未選択時はパネル自体を隠す（HUD と被らない）
    root.classList.toggle('is-active', m !== null && m !== undefined);
    if (!m) {
      nameEl.textContent = '未選択';
      hintEl.textContent = 'ツールを選んでね';
      if (rampRow) rampRow.style.display = 'none';
      return;
    }
    const def = S8_TOOL_LABELS[m as S8Tool];
    if (!def) return;
    nameEl.textContent = def.name;
    hintEl.textContent = def.hint;
    if (rampRow) rampRow.style.display = (m === 'ramp') ? 'grid' : 'none';
  }
  // Σ-8-b-2: ramp 設置モード（terraform mode と排他）
  let s8RampMode = false;
  function setS8RampMode(active: boolean) {
    s8RampMode = active;
    document.querySelectorAll<HTMLButtonElement>('.s8-tool').forEach((b) => {
      b.classList.toggle('active', active && b.dataset.s8tool === 'ramp');
    });
    updateSigma8Panel(active ? 'ramp' : null);
    if (active) {
      setTerraformMode(null);
      setBuildMode(null);
    }
  }

  document.querySelectorAll<HTMLButtonElement>('.s8-tool').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.s8tool as S8Tool;
      if (tool === 'raise' || tool === 'lower') {
        if (s8RampMode) setS8RampMode(false);
        setTerraformMode(terraformMode === tool ? null : tool);
        return;
      }
      if (tool === 'ramp') {
        // Σ-8-b-2: ramp 設置モード。方向は #s8-ramp-dir で選択
        setS8RampMode(!s8RampMode);
        if (s8RampMode) flashToast('坂道化モード：方向を選んで低い側のタイルをクリック', 'info');
        return;
      }
      if (tool === 'build') {
        // 既存 build パネルへ誘導
        if (s8RampMode) setS8RampMode(false);
        setTerraformMode(null);
        flashToast('右の建設パネルから建物を選んでわふ', 'info');
        updateSigma8Panel('build');
        document.querySelectorAll<HTMLButtonElement>('.s8-tool').forEach((b) => {
          b.classList.toggle('active', b === btn);
        });
        return;
      }
      // flatten / smooth / channel：骨格段階。Σ-8-b-3 以降で本実装。
      if (s8RampMode) setS8RampMode(false);
      setTerraformMode(null);
      flashToast(`${S8_TOOL_LABELS[tool].name} は Σ-8 後続フェーズで実装予定`, 'info');
      updateSigma8Panel(tool);
      document.querySelectorAll<HTMLButtonElement>('.s8-tool').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
    });
  });

  // 半径/強度スライダー：表示同期のみ（Σ-8-a 段階では値は未使用）
  const bindSlider = (id: string, valId: string) => {
    const sl = document.getElementById(id) as HTMLInputElement | null;
    const val = document.getElementById(valId);
    if (!sl || !val) return;
    val.textContent = sl.value;
    sl.addEventListener('input', () => { val.textContent = sl.value; });
  };
  bindSlider('s8-brush-radius', 's8-brush-radius-val');
  bindSlider('s8-brush-strength', 's8-brush-strength-val');

  // キーボード 1-7 で Σ-8 toolbar 切替
  window.addEventListener('keydown', (ev) => {
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement) return;
    const map: Record<string, S8Tool> = {
      '1': 'raise', '2': 'lower', '3': 'flatten', '4': 'smooth',
      '5': 'ramp',  '6': 'channel', '7': 'build',
    };
    const tool = map[ev.key];
    if (!tool) return;
    const btn = document.querySelector<HTMLButtonElement>(`.s8-tool[data-s8tool="${tool}"]`);
    btn?.click();
  });

  // 空クリック → 建設 or 地形編集モード処理
  stage.canvas.addEventListener('kszk-empty-click', (e) => {
    const detail = (e as CustomEvent).detail as { worldX: number; worldY: number };
    // Σ-8-b-2: ramp 設置モード優先（terraform より上）
    if (s8RampMode) {
      const { tx, ty } = worldToTile(detail.worldX, detail.worldY);
      const dirSel = document.getElementById('s8-ramp-dir') as HTMLSelectElement | null;
      const dir = (dirSel?.value ?? 'N') as 'N' | 'S' | 'E' | 'W';
      const r = setRampOnTile(world, tx, ty, dir);
      if (r === 'ok') {
        flashToast(`坂道化 [${tx},${ty}] → ${dir}`, 'info');
        announceRampPlaced(world, tx, ty);
      } else if (r === 'no-step')         flashToast('高さ差がないわふ（隣との段差が必要）', 'info');
      else if (r === 'wrong-direction')   flashToast('方向を逆にしてわふ（低い側にだけ坂道化できる）', 'info');
      else if (r === 'too-steep')         flashToast('段差が大きすぎるわふ（高さ差 1 段だけ）', 'info');
      else if (r === 'is-sea')            flashToast('海には立てられないわふ', 'info');
      else                                flashToast('範囲外わふ', 'info');
      return;
    }
    if (terraformMode) {
      const { tx, ty } = worldToTile(detail.worldX, detail.worldY);
      if (terraformMode === 'raise') {
        const ok = enqueueTerraformRaise(world, tx, ty);
        if (!ok) flashToast('土が足りない（soil×20 必要）', 'info');
        else flashToast(`盛り土 ジョブ追加 [${tx},${ty}]`, 'info');
      } else {
        enqueueTerraformLower(world, tx, ty);
        flashToast(`切り土 ジョブ追加 [${tx},${ty}]`, 'info');
      }
      return;
    }
    if (!buildMode) return;
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
    // 既存 feature との最小間隔チェックは廃止。
    // 水路が並んだり、家が水路の上にかぶったり、神社が畑に埋まったりするのは
    // くそざこ村としてむしろ正しい挙動（狭い土地にぎゅうぎゅう詰め可）。
    const cost = plotBuildCosts[buildMode];
    const plankCost = cost.plank ?? 0;
    const soilCost = cost.soil ?? 0;
    if (
      world.resources.wood < cost.wood ||
      world.resources.stone < cost.stone ||
      world.resources.plank < plankCost ||
      world.resources.soil < soilCost
    ) {
      const parts: string[] = [];
      if (cost.wood > 0) parts.push(`🪵${cost.wood}`);
      if (cost.stone > 0) parts.push(`🪨${cost.stone}`);
      if (plankCost > 0) parts.push(`🪚${plankCost}`);
      if (soilCost > 0) parts.push(`🌱${soilCost}`);
      flashToast(`資源不足 (${parts.join(' ')})`, 'info');
      return;
    }
    world.resources.wood -= cost.wood;
    world.resources.stone -= cost.stone;
    world.resources.plank -= plankCost;
    world.resources.soil -= soilCost;
    // feature 追加（id はランダム）。devLevel 0 でスポーン → ちびわふが建設して 2 に昇格
    const id = `feat-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    world.features.push({ id, pos: { x, y }, kind: buildMode, devLevel: 0, workSec: 0 });
    const emojiMap: Record<BuildKind, string> = {
      water: '💧 水源', farm: '🌾 畑', channel: '🌊 水路', path: '🛤 道', house: '🏠 家',
      well: '⛲ 井戸', firewatch: '🔥 火の見やぐら', sawmill: '🪚 製材所', shrine: '⛩ 神社',
      generator: '⚡ ペダル発電所', streetlamp: '💡 街灯', powerline: '🪜 電線', kiln: '🧱 精錬所',
      pasture: '🐑 牧場', loom: '🧶 織機',
    };
    flashToast(`${emojiMap[buildMode]} を建てた`, 'info');
    // Σ-5-c: 連鎖ヒント toast（建設後 2 秒後に孤立チェック）
    const builtX = x, builtY = y, builtKind = buildMode;
    setTimeout(() => {
      const CHAIN_R = 70;
      if (builtKind === 'farm') {
        const hasWater = world.features.some(
          (f) => (f.kind === 'water' || f.kind === 'channel') && Math.hypot(f.pos.x - builtX, f.pos.y - builtY) <= CHAIN_R,
        );
        if (!hasWater) flashToast('💧 水源を繋ぐと食料生産開始わふ', 'info');
      } else if (builtKind === 'channel') {
        const connected = world.features.some(
          (f) => f.id !== id && (f.kind === 'water' || f.kind === 'channel' || f.kind === 'farm') && Math.hypot(f.pos.x - builtX, f.pos.y - builtY) <= CHAIN_R,
        );
        if (!connected) flashToast('⚠ 孤立した水路（水源か畑と繋げてね）', 'info');
      } else if (builtKind === 'powerline') {
        const POWER_R = 200;
        const connected2 = world.features.some(
          (f) => f.id !== id && (f.kind === 'generator' || f.kind === 'streetlamp' || f.kind === 'powerline') && Math.hypot(f.pos.x - builtX, f.pos.y - builtY) <= POWER_R,
        );
        if (!connected2) flashToast('⚡ 電源・街灯と繋げてね', 'info');
      }
    }, 2000);
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

  // 右クリック → 情報モーダル（ちびわふ: life log、NPC: 名前/HP、死体: epitaph、feature/building: 情報）
  stage.canvas.addEventListener('kszk-inspect', (e) => {
    const detail = (e as CustomEvent).detail as { target: HitTarget | null; clientX: number; clientY: number };
    if (detail.target?.kind === 'chibi') {
      const alive = world.chibis.find((c) => c.id === detail.target!.id);
      if (alive) { pinnedId = alive.id; showChibiModal(alive, false); return; }
    }
    if (detail.target?.kind === 'npc') {
      const npc = world.npcs.find((n) => n.id === detail.target!.id);
      if (npc) { showNpcModal(npc); return; }
    }
    if (detail.target?.kind === 'feature') {
      const f = world.features.find((x) => x.id === detail.target!.id);
      if (f) {
        showFeatureModal(
          f,
          () => cancelConstruction(f.id),
          () => {
            setConstructionPriority(f.id, 300);
            flashToast('📣 優先建設にしたわふ（5 分間）', 'info');
          },
          isConstructionPriority(f.id),
        );
        return;
      }
    }
    if (detail.target?.kind === 'building') {
      const parts = detail.target.id.split(':');
      const defId = parts[0];
      const idx = parseInt(parts[2] ?? '0');
      if (defId != null) {
        const b = world.buildings[idx];
        if (b && b.defId === defId) { showBuildingModal(b); return; }
      }
    }
    // 生体ヒットなし → 死体からも探す
    // ペルスペクティブ tilt でスプライトクリック地点と地面 hit が ~27px ズレるので、
    // 判定半径を 50 に広めにとる（複数死体が重なってる時は最近接を選択）
    const wp = stage.screenToWorld(detail.clientX, detail.clientY);
    let bestCorpse: typeof world.corpses[number] | null = null;
    let bestDist = 50;
    for (const corpse of world.corpses) {
      const d = Math.hypot(corpse.pos.x - wp.x, corpse.pos.y - wp.y);
      if (d < bestDist) { bestDist = d; bestCorpse = corpse; }
    }
    if (bestCorpse) { showChibiModal(bestCorpse, true); return; }
    closeChibiModal();
    pinnedId = null;
  });

  // terraform ジョブ完了 toast
  stage.canvas.addEventListener('kszk-terraform-complete', (e) => {
    const {target} = (e as CustomEvent).detail as {target: 'raise'|'lower'};
    if(target==='raise'){
      flashToast('⛰ 盛り土完了！', 'info');
    } else {
      flashToast(`⛏ 切り土完了（🌱soil+${LOWER_SOIL_GAIN} 獲得）`, 'info');
    }
  });

  // 左クリック（動かなかった場合）→ 殴る
  stage.canvas.addEventListener('kszk-entity-punch', (e) => {
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
  stage.canvas.addEventListener('kszk-entity-drag', (e) => {
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
  stage.canvas.addEventListener('kszk-entity-drop', (e) => {
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
    // --- Σ-6-UI-d キーボードショートカット ---
    // B: 建設パネルを開く（build タブへ）
    else if (k === 'b' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const buildTab = document.querySelector<HTMLButtonElement>('.tab[data-tab="build"]');
      buildTab?.click();
    }
    // T: terraform raise/lower 切替
    else if (k === 't' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const buildTab = document.querySelector<HTMLButtonElement>('.tab[data-tab="build"]');
      buildTab?.click();
      setTerraformMode(terraformMode === 'raise' ? null : 'raise');
    }
    // Esc: 全モード解除
    else if (k === 'escape') {
      setBuildMode(null);
      setTerraformMode(null);
      renderBuildCards();
    }
    // 1-7: build パネルが開いている時にカテゴリ切替
    else if (k >= '1' && k <= '7') {
      const buildPanel = document.querySelector<HTMLElement>('.tab-panel[data-panel="build"]');
      if (buildPanel?.classList.contains('active')) {
        const catIdx = parseInt(k) - 1;
        const catTabs = document.querySelectorAll<HTMLButtonElement>('.build-cat-tab');
        const target = catTabs[catIdx];
        if (target) target.click();
      }
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

    // drain construction completions → toast
    if (world.newConstructions.length > 0) {
      const FEAT_EMOJI: Partial<Record<string, string>> = {
        water:'💧', farm:'🌾', channel:'🌊', path:'🛤', house:'🏠',
        well:'⛲', firewatch:'🔥', sawmill:'🪚', shrine:'⛩',
        generator:'⚡', streetlamp:'💡', powerline:'🪜', kiln:'🧱',
        pasture:'🐑', loom:'🧶',
      };
      const FEAT_NAME: Partial<Record<string, string>> = {
        water:'水源', farm:'畑', channel:'水路', path:'道', house:'家',
        well:'井戸', firewatch:'火の見やぐら', sawmill:'製材所', shrine:'神社',
        generator:'発電所', streetlamp:'街灯', powerline:'電線', kiln:'精錬所',
        pasture:'牧場', loom:'織機',
      };
      for (const c of world.newConstructions) {
        const emoji = FEAT_EMOJI[c.kind] ?? '🔨';
        const name = FEAT_NAME[c.kind] ?? c.kind;
        flashToast(`${emoji} ${name} 完成！`, 'info');
      }
      world.newConstructions = [];
    }
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
      updateBuildCards();
      updateWarningPanel();
      updateResourceBar();
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

// Σ-8-b-2: ramp 設置時の周辺ちびわふ反応（trait 別の個性反映）
const RAMP_LINES_NOUMIN = ['いいみちわふ！', 'はかどるわふ！', 'はたらくわふー！'];
const RAMP_LINES_SEKKACHI = ['はやくいくわふ！', 'おさきにわふ！', 'いそぐわふ！'];
const RAMP_LINES_NONBIRI = ['まあまあわふ', 'のんびりいこうわふ', 'いいながめわふ'];
const RAMP_LINES_SHINPAI = ['だいじょうぶわふ？', 'こわれないわふ？', 'のぼれるかなわふ…'];
const RAMP_LINES_BOUKEN = ['ぼうけんわふ！', 'のぼるわふー！', 'やまわふ！'];
const RAMP_LINES_NAKIMUSHI = ['たかいよ〜わふ', 'こわいわふ…', 'ママぁ…わふ'];
const RAMP_LINES_GUNSUKI = ['みんなくるわふ！', 'いっしょわふー！'];
const RAMP_LINES_TAIKO_KKO = ['まつりだわふ！', 'どんどんわふ！'];
const RAMP_LINES_GENERIC = ['さかみちわふ！', 'のぼるわふ', 'これでいけるわふ'];

function announceRampPlaced(world: WorldState, tx: number, ty: number) {
  const cx = (tx + 0.5) * 32;
  const cy = (ty + 0.5) * 32;
  const candidates = world.chibis.filter((c) =>
    isChibiAlive(c) && !c.flight && Math.hypot(c.pos.x - cx, c.pos.y - cy) <= 110,
  );
  if (candidates.length === 0) return;
  // 反応するのは半径内の最大 3 体（うるさくならないよう抑える）
  const reacted = candidates.slice(0, 3);
  for (const c of reacted) {
    let pool = RAMP_LINES_GENERIC;
    if (c.traits.includes('noumin'))           pool = RAMP_LINES_NOUMIN;
    else if (c.traits.includes('sekkachi'))    pool = RAMP_LINES_SEKKACHI;
    else if (c.traits.includes('nonbiri'))     pool = RAMP_LINES_NONBIRI;
    else if (c.traits.includes('shinpai'))     pool = RAMP_LINES_SHINPAI;
    else if (c.traits.includes('bouken'))      pool = RAMP_LINES_BOUKEN;
    else if (c.traits.includes('nakimushi'))   pool = RAMP_LINES_NAKIMUSHI;
    else if (c.traits.includes('gunsuki'))     pool = RAMP_LINES_GUNSUKI;
    else if (c.traits.includes('taiko_kko'))   pool = RAMP_LINES_TAIKO_KKO;
    const line = pool[Math.floor(Math.random() * pool.length)]!;
    spawnBubble(world.bubbles, c.pos, line, 'speech', 1.6);
  }
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

function showFeatureModal(f: Feature, onCancelBuild?: () => void, onSetPriority?: () => void, isPriority?: boolean) {
  const modal = document.getElementById('chibi-modal')!;
  modal.classList.remove('hidden');
  const FEAT_EMOJI: Partial<Record<string, string>> = {
    water:'💧', farm:'🌾', channel:'🌊', path:'🛤', house:'🏠',
    well:'⛲', firewatch:'🔥', sawmill:'🪚', shrine:'⛩',
    generator:'⚡', streetlamp:'💡', powerline:'🪜', kiln:'🧱',
    pasture:'🐑', loom:'🧶',
  };
  const FEAT_NAME: Partial<Record<string, string>> = {
    water:'水源', farm:'畑', channel:'水路', path:'道', house:'家',
    well:'井戸', firewatch:'火の見やぐら', sawmill:'製材所', shrine:'神社',
    generator:'ペダル発電所', streetlamp:'街灯', powerline:'電線', kiln:'精錬所',
    pasture:'牧場', loom:'織機',
  };
  const FEAT_EFFECT: Partial<Record<string, string>> = {
    water: '周囲 70px の水路に水を送る',
    channel: '水源/水路から 70px 以内で通水、畑へ繋げる',
    farm: '水源/水路から 65px 以内で 🍞 0.08/秒生産',
    path: '移動ルート整備（将来実装予定）',
    house: '定員 4 人。夜間睡眠場所、野宿ペナルティ回避',
    well: '乾燥/雪でも畑が 0.4 倍生産を維持',
    firewatch: '夜間オオカミ忌避＋火災検知半径 180px',
    sawmill: '近くのちびわふが 🪵×2 → 🪚×1 変換',
    shrine: '半径 200px でちびわふの空腹・疲労 -30%',
    generator: 'ちびわふがペダルを漕いで ⚡ 生成（疲労+）',
    streetlamp: '夜間 ⚡ 消費で照明（オオカミ忌避＋野宿ドレイン半減）',
    powerline: '発電所と街灯を 90px 以内で接続',
    kiln: '近くのちびわふが 🪨×3 → 🧱×1 変換',
    pasture: '🐑 0.03/秒自動生産（雪/乾燥で半減）',
    loom: '近くのちびわふが 🐑×2 → 🧶×1 変換',
  };
  const emoji = FEAT_EMOJI[f.kind] ?? '🔧';
  const name = FEAT_NAME[f.kind] ?? f.kind;
  const needed = CONSTRUCTION_SEC[f.kind as keyof typeof CONSTRUCTION_SEC] ?? 45;
  const currentPt = f.devLevel >= 2 ? needed : Math.round(Math.min(f.workSec, needed));
  const barPctVal = f.devLevel >= 2 ? 100 : Math.min(99, Math.round((f.workSec / needed) * 100));
  const isBuilding = f.devLevel >= 2;
  document.getElementById('modal-name')!.textContent = `${emoji} ${name}`;
  document.getElementById('modal-age')!.textContent = isBuilding ? `Lv${f.devLevel}` : `建設中 ${currentPt}/${needed} pt`;
  document.getElementById('modal-traits')!.innerHTML = '';
  const epitaphEl = document.getElementById('modal-epitaph')!;
  epitaphEl.classList.remove('show');
  epitaphEl.textContent = '';
  let statusHtml = '';
  if (!isBuilding) {
    const barPct = Math.min(100, barPctVal);
    statusHtml += `<div class="param-row"><span class="label">建設</span>`
      + `<span class="bar"><span class="fill" style="width:${barPct}%;background:#c89650"></span></span>`
      + `<span class="value">${currentPt}/${needed} pt</span></div>`;
  } else {
    statusHtml += `<div class="param-row"><span class="label">状態</span>`
      + `<span class="bar"><span class="fill" style="width:100%;background:#4a9a5a"></span></span>`
      + `<span class="value">🎯 稼働中</span></div>`;
    if (f.saturated != null) {
      const satLabel = f.kind === 'channel' ? (f.saturated ? '✓ 通水中' : '✗ 未通水') : (f.saturated ? '✓ 点灯中' : '✗ 消灯');
      statusHtml += `<div class="param-row"><span class="label">接続</span>`
        + `<span class="bar"><span class="fill" style="width:${f.saturated?100:0}%;background:#3a7ab8"></span></span>`
        + `<span class="value">${satLabel}</span></div>`;
    }
  }
  document.getElementById('modal-params')!.innerHTML = statusHtml;
  document.getElementById('modal-flavors')!.innerHTML = `<li>${escapeHtml(FEAT_EFFECT[f.kind] ?? '説明なし')}</li>`;
  const lifeEl = document.getElementById('modal-life')!;
  lifeEl.innerHTML = `<li style="color:#a89060">t=${Math.round(f.workSec)}s 経過</li>`;
  // 建設中のみ「優先建設」「解体」ボタンを追加
  if (!isBuilding) {
    // 📣 優先建設（5 分間、ちびわふが 90% でここを選ぶ）
    if (onSetPriority) {
      const pbtn = document.createElement('button');
      pbtn.textContent = isPriority ? '📣 優先中（5 分）' : '📣 優先建設（5 分間）';
      pbtn.style.cssText = `margin-top:8px;margin-right:8px;padding:6px 12px;cursor:pointer;background:${isPriority?'#d89040':'#8ac05a'};color:#fff;border:none;border-radius:3px;font-weight:700`;
      if (isPriority) pbtn.disabled = true;
      pbtn.addEventListener('click', () => {
        onSetPriority();
        closeChibiModal();
      });
      lifeEl.appendChild(pbtn);
    }
    // ❌ 解体（80% 返金）
    if (onCancelBuild) {
      const btn = document.createElement('button');
      btn.textContent = '❌ 解体（80% 返金）';
      btn.className = 'danger';
      btn.style.cssText = 'margin-top:8px;padding:6px 12px;cursor:pointer;';
      btn.addEventListener('click', () => {
        onCancelBuild();
        closeChibiModal();
      });
      lifeEl.appendChild(btn);
    }
  }
}

function showBuildingModal(b: { defId: string; level: number; pos: { x: number; y: number } }) {
  const modal = document.getElementById('chibi-modal')!;
  modal.classList.remove('hidden');
  const def = BUILDINGS[b.defId];
  if (!def) return;
  document.getElementById('modal-name')!.textContent = def.name;
  document.getElementById('modal-age')!.textContent = `Lv${b.level}`;
  document.getElementById('modal-traits')!.innerHTML = '';
  const epitaphEl = document.getElementById('modal-epitaph')!;
  epitaphEl.classList.remove('show');
  epitaphEl.textContent = '';
  document.getElementById('modal-params')!.innerHTML =
    `<div class="param-row"><span class="label">状態</span>`
    + `<span class="bar"><span class="fill" style="width:100%;background:#4a9a5a"></span></span>`
    + `<span class="value">🎯 稼働中</span></div>`;
  document.getElementById('modal-flavors')!.innerHTML = `<li>${escapeHtml(def.desc)}</li>`;
  document.getElementById('modal-life')!.innerHTML = `<li style="color:#a89060">${escapeHtml(def.effect)}</li>`;
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
