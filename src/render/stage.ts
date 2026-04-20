import { Application, Container, Graphics, Rectangle, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import type { WorldState } from '../sim/world';
import { POWERLINE_CONNECT_RADIUS, TERRAIN_TILE_SIZE } from '../sim/world';
import type { Chibiwafu, DayPhase, HitTarget, PlacedBuilding, Season } from '../types';
import { BUILDINGS } from '../city/buildings';
import { NPC_DEFS, type NpcId, type NpcState } from '../sim/npcs';
import type { Bubble } from '../sim/bubbles';
import { TRAIT_DEFS } from '../sim/traits';
import { CONFIG } from '../config';
import { frameFor, loadSpriteLibrary, type SpriteLibrary } from './sprites';

// 位相ティント：画面全体に薄い色を被せて時刻感を出す。
// 昼は tint しない。朝=桃 / 夕=橙 / 夜=紺 を alpha 低めで重ねる。
const DAY_PHASE_TINT: Record<DayPhase, { color: number; alpha: number }> = {
  morning: { color: 0xffc7b3, alpha: 0.12 },
  noon:    { color: 0xffffff, alpha: 0.00 },
  evening: { color: 0xff8b3d, alpha: 0.18 },
  night:   { color: 0x1a2550, alpha: 0.34 },
};

export interface CameraView {
  x: number;       // ワールド座標の左上
  y: number;
  w: number;       // 画面に映っているワールド幅
  h: number;
  scale: number;
  bounds: { w: number; h: number };  // ワールド全体サイズ
}

export interface StageHandle {
  app: Application;
  resize: (w: number, h: number) => void;
  draw: (world: WorldState) => void;
  setSeason: (s: Season) => void;
  // カメラ操作（HUD・ミニマップ・キーボードから使う）
  resetCamera: () => void;
  focusOn: (x: number, y: number, scale?: number) => void;
  panCamera: (dx: number, dy: number) => void;      // dx/dy はワールド座標 pixel
  getCamera: () => CameraView;
  // 画面座標（client）→ ワールド座標に変換
  screenToWorld: (cx: number, cy: number) => { x: number; y: number };
  // pointerdown 位置（world座標）にある対象（ちびわふ or NPC）を返す callback を登録。
  // null を返すとその位置には対象がない → カメラパン or 空クリックに倒される。
  setHitTest: (fn: (wx: number, wy: number) => HitTarget | null) => void;
}

interface ChibiView {
  sprite: Sprite;
  label: Text;
  container: Container;
  lastState: string;
}

interface BubbleView {
  text: Text;
  bg: Graphics;
  container: Container;
}

interface EnvironmentArt {
  background: Texture | null;
  buildingFrames: Partial<Record<PlacedBuilding['defId'], Texture>>;
}

const BUILDING_FRAME_ORDER: PlacedBuilding['defId'][] = ['noukou', 'kouba', 'hakaba', 'taiko', 'ubuya'];

export async function createStage(host: HTMLElement): Promise<StageHandle> {
  const app = new Application();
  await app.init({
    background: 0xe4d6b7,
    resizeTo: host,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  host.appendChild(app.canvas);

  // 毎フレーム作り直される子 (plot/landmark/fx 等) を安全に破棄するヘルパ。
  // PIXI v8 の removeChildren は中身を destroy しないため、Graphics の GPU
  // バッファがリークし続けて FPS が落ちる。ここで明示的に destroy する。
  function destroyAllChildren(layer: Container) {
    for (let i = layer.children.length - 1; i >= 0; i--) {
      const child = layer.children[i]!;
      child.destroy({ children: true });
    }
    // destroy すると自動で親から外れる
  }

  // --- カメラ ----------------------------------------------------------------
  // 全ゲームレイヤは cameraLayer の中に入れ、transform でスクロール＆ズームする。
  // HUD はHTML側にあるので、ここでは canvas 内部だけ考えればよい。
  const cameraLayer = new Container();
  app.stage.addChild(cameraLayer);

  // Σ-2.5 地形レイヤ（bgLayer より前 = 最下部）
  const terrainStaticLayer = new Container();    // タイル色キャッシュ
  const terrainTransientLayer = new Container(); // 水波紋・崖線・terraform・stability
  const bgLayer = new Container();
  const plotLayer = new Container();  // 開拓プロット（地面レイヤの上）
  const buildingLayer = new Container();
  const eventUnderLayer = new Container(); // 下レイヤ（ring／disk）
  const corpseLayer = new Container();
  const chibiLayer = new Container();
  const npcLayer = new Container();
  const wolfLayer = new Container();  // ちびわふ/NPC の上に描画（夜の敵）
  const fxLayer = new Container();
  const eventOverLayer = new Container(); // 上レイヤ（火炎／粉塵）
  cameraLayer.addChild(
    terrainStaticLayer, terrainTransientLayer, bgLayer, plotLayer, buildingLayer, eventUnderLayer, corpseLayer, chibiLayer, npcLayer, wolfLayer, fxLayer, eventOverLayer,
  );

  const lib = await loadSpriteLibrary('/chibiwafu.png', '/chibiwafu');
  const furanaLib = await loadSpriteLibrary('/furana.png', '/furana');
  const envArt = await loadEnvironmentArt();

  let currentSeason: Season = 'spring';
  // ワールドの実効寸法。村Lv に応じて徐々に広がる。world.bounds が権威。
  let currentBoundsW: number = CONFIG.WORLD_W;
  let currentBoundsH: number = CONFIG.WORLD_H;
  drawBackground(bgLayer, currentBoundsW, currentBoundsH, currentSeason, envArt);
  // フラナは world.npcs の一員として npcLayer に描画される（drawNpc 経由）。
  // 昔の procedural 描画は削除済み。

  // 位相ティント：カメラ外に置き、画面全体を覆う固定オーバーレイ。
  // app.stage 直下（cameraLayer の兄弟）にして zoom/pan の影響を受けないようにする。
  const phaseTint = new Graphics();
  app.stage.addChild(phaseTint);
  let lastTintPhase: DayPhase | null = null;
  function drawPhaseTint(phase: DayPhase) {
    if (lastTintPhase === phase) return;
    lastTintPhase = phase;
    const t = DAY_PHASE_TINT[phase];
    phaseTint.clear();
    if (t.alpha > 0) {
      phaseTint.rect(0, 0, app.renderer.width, app.renderer.height).fill({ color: t.color, alpha: t.alpha });
    }
  }

  // --- カメラ状態 ------------------------------------------------------------
  let cameraScale = 1;
  let cameraX = 0;
  let cameraY = 0;

  function clamp(v: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, v));
  }

  function clampCamera() {
    const vw = app.renderer.width;
    const vh = app.renderer.height;
    const ww = currentBoundsW * cameraScale;
    const wh = currentBoundsH * cameraScale;
    // ワールドが画面より小さい時は中央寄せ、大きい時は縁を超えないようクランプ
    if (ww <= vw) cameraX = (vw - ww) / 2;
    else cameraX = clamp(cameraX, vw - ww, 0);
    if (wh <= vh) cameraY = (vh - wh) / 2;
    else cameraY = clamp(cameraY, vh - wh, 0);
  }

  function applyCamera() {
    cameraLayer.position.set(cameraX, cameraY);
    cameraLayer.scale.set(cameraScale);
  }

  // 広いマップでは全景フィットだとちびわふが小さすぎるので、
  // 初期は 0.6 倍ズーム + フラナ拠点（マップ中央）を画面中央に
  function focusOn(x: number, y: number, scale?: number) {
    if (scale !== undefined) cameraScale = clamp(scale, CONFIG.CAMERA_MIN_SCALE, CONFIG.CAMERA_MAX_SCALE);
    const vw = app.renderer.width;
    const vh = app.renderer.height;
    cameraX = vw / 2 - x * cameraScale;
    cameraY = vh / 2 - y * cameraScale;
    clampCamera();
    applyCamera();
  }
  focusOn(currentBoundsW / 2, currentBoundsH * 0.35, 0.6);

  // --- 入力：ホイールでズーム（カーソル中心）、ドラッグでパン ----------------
  const canvas = app.canvas;
  canvas.style.touchAction = 'none';
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? CONFIG.CAMERA_ZOOM_STEP : 1 / CONFIG.CAMERA_ZOOM_STEP;
      const newScale = clamp(cameraScale * factor, CONFIG.CAMERA_MIN_SCALE, CONFIG.CAMERA_MAX_SCALE);
      // カーソル位置のワールド座標を固定したままズーム
      const worldX = (mx - cameraX) / cameraScale;
      const worldY = (my - cameraY) / cameraScale;
      cameraScale = newScale;
      cameraX = mx - worldX * cameraScale;
      cameraY = my - worldY * cameraScale;
      clampCamera();
      applyCamera();
    },
    { passive: false },
  );

  // 右クリックメニューを抑制（右クリックはちびわふ情報表示に割り当てるため）
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const wp = screenToWorld(e.clientX, e.clientY);
    const target = hitTest ? hitTest(wp.x, wp.y) : null;
    const ev = new CustomEvent('kszk-inspect', {
      detail: { target, clientX: e.clientX, clientY: e.clientY, rect },
    });
    canvas.dispatchEvent(ev);
  });

  let hitTest: ((wx: number, wy: number) => HitTarget | null) | null = null;
  function setHitTest(fn: (wx: number, wy: number) => HitTarget | null) { hitTest = fn; }

  type PointerMode = 'pan' | 'entity-drag';
  let pointerState: {
    pointerId: number;
    mode: PointerMode;
    lastX: number;
    lastY: number;
    startX: number;
    startY: number;
    moved: boolean;
    button: number;
    target: HitTarget | null;
  } | null = null;

  canvas.addEventListener('pointerdown', (e) => {
    // 右クリックは contextmenu で処理済み
    if (e.button === 2) return;
    canvas.setPointerCapture(e.pointerId);
    const wp = screenToWorld(e.clientX, e.clientY);
    const target = hitTest ? hitTest(wp.x, wp.y) : null;
    pointerState = {
      pointerId: e.pointerId,
      mode: target != null ? 'entity-drag' : 'pan',
      lastX: e.clientX,
      lastY: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      button: e.button,
      target,
    };
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointerState || pointerState.pointerId !== e.pointerId) return;
    const dx = e.clientX - pointerState.lastX;
    const dy = e.clientY - pointerState.lastY;
    pointerState.lastX = e.clientX;
    pointerState.lastY = e.clientY;
    if (Math.hypot(e.clientX - pointerState.startX, e.clientY - pointerState.startY) > 4) pointerState.moved = true;
    if (pointerState.mode === 'pan') {
      cameraX += dx;
      cameraY += dy;
      clampCamera();
      applyCamera();
    } else if (pointerState.mode === 'entity-drag' && pointerState.target != null && pointerState.moved) {
      const wp = screenToWorld(e.clientX, e.clientY);
      const ev = new CustomEvent('kszk-entity-drag', {
        detail: { target: pointerState.target, worldX: wp.x, worldY: wp.y },
      });
      canvas.dispatchEvent(ev);
    }
  });

  const endPointer = (e: PointerEvent) => {
    if (!pointerState || pointerState.pointerId !== e.pointerId) return;
    canvas.releasePointerCapture(e.pointerId);
    const s = pointerState;
    pointerState = null;
    if (s.mode === 'entity-drag' && s.target != null) {
      const wp = screenToWorld(e.clientX, e.clientY);
      if (s.moved) {
        const ev = new CustomEvent('kszk-entity-drop', {
          detail: { target: s.target, worldX: wp.x, worldY: wp.y },
        });
        canvas.dispatchEvent(ev);
      } else {
        // 左クリックで殴る
        const ev = new CustomEvent('kszk-entity-punch', { detail: { target: s.target } });
        canvas.dispatchEvent(ev);
      }
    } else if (s.mode === 'pan' && !s.moved) {
      // 空クリック（何もない場所を左クリック）→ 建設モードで利用
      const wp = screenToWorld(e.clientX, e.clientY);
      const ev = new CustomEvent('kszk-empty-click', {
        detail: { worldX: wp.x, worldY: wp.y },
      });
      canvas.dispatchEvent(ev);
    }
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', endPointer);

  const views = new Map<number, ChibiView>();
  const corpseViews = new Map<number, Sprite>();
  // buildings はレベル変化時のみ再構築（毎フレーム GPU 再生成を避ける）
  const buildingViews: Array<{ container: Container; key: string }> = [];
  const npcViews = new Map<NpcId, NpcView>();
  const bubbleViews = new Map<number, BubbleView>();
  // wolves は出現数が少ない（最大 8）ので createOnce + position update。
  const wolfViews = new Map<number, { container: Container; lastState: string }>();
  // plotLayer は 3 フレームに 1 回だけ再構築（obstacles 140個×2Graphics を毎60fps は重すぎ）
  let drawFrameCount = 0;
  // chibi/corpse depth sort は PIXI の zIndex 機能を使う（直接 sort() は内部配列を壊す可能性）
  chibiLayer.sortableChildren = true;
  corpseLayer.sortableChildren = true;

  // Σ-2.5 地形描画ステート（Σ-4 で stage3d.ts へ移行する際に丸ごと削除するブロック）
  let terrainStaticGfx: Graphics | null = null;
  const terrainTransientGfx = new Graphics();
  terrainTransientLayer.addChild(terrainTransientGfx);
  let waterTileCells: Array<{ col: number; row: number }> = [];
  let terrainRebuildAt = -999;

  const TILE_BASE_COLORS: Record<string, [number, number, number]> = {
    water: [0x4a, 0x6b, 0x9c],
    sand:  [0xe0, 0xc9, 0x8a],
    soil:  [0xa8, 0x7a, 0x4a],
    grass: [0x6b, 0x9e, 0x4a],
    rock:  [0x7a, 0x7a, 0x7a],
  };

  function tileRgb(material: string, elev: number): number {
    const base = TILE_BASE_COLORS[material] ?? TILE_BASE_COLORS['soil']!;
    const bright = Math.min(1.3, 0.7 + elev * 0.003);
    const r = Math.min(255, Math.round(base[0]! * bright));
    const g = Math.min(255, Math.round(base[1]! * bright));
    const b = Math.min(255, Math.round(base[2]! * bright));
    return (r << 16) | (g << 8) | b;
  }

  function rebuildTerrainStatic(terrain: WorldState['terrain']): void {
    if (terrainStaticGfx) { terrainStaticGfx.destroy(); terrainStaticGfx = null; }
    destroyAllChildren(terrainStaticLayer);
    waterTileCells = [];
    const gfx = new Graphics();
    for (let row = 0; row < terrain.length; row++) {
      const rowArr = terrain[row]!;
      for (let col = 0; col < rowArr.length; col++) {
        const tile = rowArr[col]!;
        gfx.rect(col * TERRAIN_TILE_SIZE, row * TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE)
           .fill({ color: tileRgb(tile.material, tile.elev) });
        if (tile.material === 'water') waterTileCells.push({ col, row });
      }
    }
    terrainStaticGfx = gfx;
    terrainStaticLayer.addChild(gfx);
  }

  function updateTerrainTransient(terrain: WorldState['terrain'], jobs: WorldState['terraformJobs'], timeSec: number): void {
    const gfx = terrainTransientGfx;
    gfx.clear();

    // 水タイルの波紋シマー（alpha 0.06-0.11 の正弦変動）
    for (const { col, row } of waterTileCells) {
      const alpha = 0.06 + 0.05 * Math.sin(timeSec * 1.5 + col * 0.08 + row * 0.06);
      gfx.rect(col * TERRAIN_TILE_SIZE, row * TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE)
         .fill({ color: 0x88ccff, alpha });
    }

    // 崖線：隣接タイルの標高差 ≥15 の境界に暗い線（cliff_fall 発火ラインの可視化）
    for (let row = 0; row < terrain.length; row++) {
      const rowArr = terrain[row]!;
      for (let col = 0; col < rowArr.length; col++) {
        const tile = rowArr[col]!;
        const x = col * TERRAIN_TILE_SIZE;
        const y = row * TERRAIN_TILE_SIZE;
        const right = rowArr[col + 1];
        if (right && Math.abs(tile.elev - right.elev) >= 15) {
          gfx.rect(x + TERRAIN_TILE_SIZE - 1, y, 2, TERRAIN_TILE_SIZE).fill({ color: 0x2a1a10, alpha: 0.75 });
        }
        const below = terrain[row + 1]?.[col];
        if (below && Math.abs(tile.elev - below.elev) >= 15) {
          gfx.rect(x, y + TERRAIN_TILE_SIZE - 1, TERRAIN_TILE_SIZE, 2).fill({ color: 0x2a1a10, alpha: 0.75 });
        }
      }
    }

    // stability 警告パルス（< 0.5 = 橙パルス、< 0.3 = 赤強パルス）
    const pulseS = Math.sin(timeSec * 3) * 0.5 + 0.5;   // 0-1 遅め
    const pulseF = Math.sin(timeSec * 5) * 0.5 + 0.5;   // 0-1 速め
    for (let row = 0; row < terrain.length; row++) {
      const rowArr = terrain[row]!;
      for (let col = 0; col < rowArr.length; col++) {
        const tile = rowArr[col]!;
        if (tile.stability >= 0.5) continue;
        const x = col * TERRAIN_TILE_SIZE;
        const y = row * TERRAIN_TILE_SIZE;
        if (tile.stability < 0.3) {
          gfx.rect(x, y, TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE).fill({ color: 0xff2020, alpha: 0.3 + pulseF * 0.2 });
        } else {
          gfx.rect(x, y, TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE).fill({ color: 0xff6030, alpha: 0.18 + pulseS * 0.15 });
        }
      }
    }

    // terraform ジョブオーバーレイ（半透明色 + 進捗リング）
    for (const job of jobs) {
      const x = job.tx * TERRAIN_TILE_SIZE;
      const y = job.ty * TERRAIN_TILE_SIZE;
      gfx.rect(x, y, TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE)
         .fill({ color: job.target === 'raise' ? 0xc89650 : 0x1e1e1e, alpha: 0.4 });
      if (job.progress > 0.02) {
        const cx = x + TERRAIN_TILE_SIZE / 2;
        const cy = y + TERRAIN_TILE_SIZE / 2;
        const r = 10;
        const startA = -Math.PI / 2;
        const endA = startA + job.progress * Math.PI * 2;
        const steps = Math.max(4, Math.floor(job.progress * 20));
        for (let s = 0; s < steps; s++) {
          const a0 = startA + (s / steps) * (endA - startA);
          const a1 = startA + ((s + 1) / steps) * (endA - startA);
          gfx.moveTo(cx + r * Math.cos(a0), cy + r * Math.sin(a0))
             .lineTo(cx + r * Math.cos(a1), cy + r * Math.sin(a1));
        }
        gfx.stroke({ color: 0xffa040, width: 2.5 });
      }
    }
  }

  function drawTerrainLayer(world: WorldState): void {
    if (!world.terrain || world.terrain.length === 0) return;
    // 90 フレームごと（≈1.5 秒）に静的タイルを再ベイク
    if (!terrainStaticGfx || drawFrameCount - terrainRebuildAt >= 90) {
      rebuildTerrainStatic(world.terrain);
      terrainRebuildAt = drawFrameCount;
    }
    if (drawFrameCount % 3 === 0) {
      updateTerrainTransient(world.terrain, world.terraformJobs, world.timeSec);
    }
  }

  function resize(_w: number, _h: number) {
    // ワールドサイズは固定。表示領域が変わったらカメラの可視範囲再計算のみ。
    clampCamera();
    applyCamera();
    // 位相ティントはサイズが変わるとクリップするので次の draw() で再描画させる
    lastTintPhase = null;
  }

  function setSeason(s: Season) {
    if (s === currentSeason) return;
    currentSeason = s;
    destroyAllChildren(bgLayer); // removeChildren() は GPU バッファを解放しない
    drawBackground(bgLayer, currentBoundsW, currentBoundsH, currentSeason, envArt);
  }

  // 村Lv 上昇でワールド寸法が広がったら背景を描き直す。頻度は稀（Lv up 時のみ）。
  function setBounds(w: number, h: number) {
    if (w === currentBoundsW && h === currentBoundsH) return;
    currentBoundsW = w;
    currentBoundsH = h;
    destroyAllChildren(bgLayer); // removeChildren() は GPU バッファを解放しない
    drawBackground(bgLayer, currentBoundsW, currentBoundsH, currentSeason, envArt);
    clampCamera();
    applyCamera();
  }

  function draw(world: WorldState) {
    setSeason(world.season);
    setBounds(world.bounds.w, world.bounds.h);
    drawPhaseTint(world.dayPhase);

    drawFrameCount++;
    drawTerrainLayer(world);

    // 開拓要素（feature / 障害物 / 氾濫セル）
    // obstacle は最大 140 個 × 2 Graphics。毎 60fps 再生成は GPU ドライバを詰まらせる。
    // → 3 フレームに 1 回だけ再構築（≒ 20fps 更新）。洪水半径の変化も十分滑らか。
    if (drawFrameCount % 3 === 0) {
      destroyAllChildren(plotLayer);
      for (const fz of world.floodZones) {
        plotLayer.addChild(drawFloodZone(fz));
      }
      // 電力グラフのワイヤ（feature 本体の下）
      const wires = drawPowerWires(world);
      if (wires) plotLayer.addChild(wires);
      for (const f of world.features) {
        plotLayer.addChild(drawFeature(f));
      }
      for (const obs of world.obstacles) {
        plotLayer.addChild(drawObstacle(obs));
      }
    }

    // buildings：level 変化時のみ再構築。毎フレーム destroy+create は GPU 負荷大。
    while (buildingViews.length < world.buildings.length) {
      const container = new Container();
      buildingLayer.addChild(container);
      buildingViews.push({ container, key: '' });
    }
    while (buildingViews.length > world.buildings.length) {
      const entry = buildingViews.pop()!;
      entry.container.destroy({ children: true });
    }
    for (let i = 0; i < world.buildings.length; i++) {
      const b = world.buildings[i]!;
      const def = BUILDINGS[b.defId];
      const entry = buildingViews[i]!;
      const key = `${b.defId}:${b.level}`;
      if (entry.key !== key) {
        entry.key = key;
        destroyAllChildren(entry.container);
        const structure = drawBuildingStructure(b, def?.name.split('（')[0] ?? b.defId, envArt);
        entry.container.addChild(structure);
        entry.container.position.set(b.pos.x, b.pos.y);
      }
    }

    // corpses
    for (const c of world.corpses) {
      if (!corpseViews.has(c.id)) {
        const s = new Sprite(frameFor(lib, 'dead'));
        s.anchor.set(0.5, 0.9);
        s.scale.set(calcScale(lib));
        s.alpha = 0.85;
        s.position.set(c.pos.x, c.pos.y);
        s.zIndex = c.pos.y;
        corpseLayer.addChild(s);
        corpseViews.set(c.id, s);
      }
    }
    for (const [id, s] of corpseViews) {
      if (!world.corpses.find((c) => c.id === id)) {
        s.destroy();
        corpseViews.delete(id);
      }
    }

    // chibis
    const aliveIds = new Set(world.chibis.map((c) => c.id));
    for (const [id, v] of views) {
      if (!aliveIds.has(id)) {
        v.container.destroy({ children: true });
        views.delete(id);
      }
    }
    const ondoWobble = world.event?.kind === 'ondo';
    for (const c of world.chibis) {
      let v = views.get(c.id);
      if (!v) {
        v = createChibiView(c, lib);
        chibiLayer.addChild(v.container);
        views.set(c.id, v);
      }
      // --- 視覚だけの小揺れ（sim pos は不変）---
      // 音頭中は全員個体位相で揺れる。
      // 移動中は energy 連動の上下バウンス。止まってる時は呼吸だけ。
      // 元気な子・ぴょんぴょん flavor はバウンス大きめ。
      let wx = 0, wy = 0;
      if (ondoWobble) {
        wx = Math.sin(world.timeSec * 6 + c.id * 0.7) * 8;
        wy = Math.abs(Math.cos(world.timeSec * 6 + c.id * 0.7)) * -3;
      } else if (c.state === 'idle' || c.state === 'surprised') {
        const bouncy = c.params.energy * 0.03 + (c.flavors.includes('ぴょんぴょん跳ねる') ? 2.5 : 0);
        const phase = world.timeSec * (2 + c.params.energy * 0.04) + c.id * 0.4;
        wy = -Math.abs(Math.sin(phase)) * bouncy;
        // 低集中の子はふらふら（横揺れ）
        if (c.params.focus < 35) wx = Math.sin(phase * 0.7) * 1.2;
      } else if (c.state === 'sleep' || c.state === 'exhausted') {
        // 呼吸
        wy = Math.sin(world.timeSec * 1.5 + c.id) * 0.6;
      } else if (c.state === 'cry') {
        // 泣いてる子は小刻みに震える
        wx = (Math.random() - 0.5) * 1.5;
      } else if (c.state === 'hurt') {
        wx = (Math.random() - 0.5) * 3;
        wy = (Math.random() - 0.5) * 2;
      }
      v.container.position.set(c.pos.x + wx, c.pos.y + wy);
      v.container.zIndex = c.pos.y;  // depth sort via PIXI zIndex（直接 sort() は内部配列を破壊）
      v.sprite.scale.x = (c.faceLeft ? -1 : 1) * calcScale(lib);
      if (v.lastState !== c.state) {
        v.sprite.texture = frameFor(lib, c.state);
        v.lastState = c.state;
      }
    }

    // npcs
    for (const n of world.npcs) {
      let v = npcViews.get(n.id);
      if (!v) {
        v = drawNpc(n, furanaLib);
        npcLayer.addChild(v.container);
        npcViews.set(n.id, v);
      }
      v.container.position.set(n.pos.x, n.pos.y);
      // フラナはステート切替でフレーム差し替え & 左右反転
      if (v.sprite && v.baseScale != null) {
        v.sprite.texture = frameFor(furanaLib, n.state);
        v.sprite.scale.x = (n.faceLeft ? -1 : 1) * v.baseScale;
        v.sprite.scale.y = v.baseScale;
      }
      // 死亡中は薄くする
      v.container.alpha = n.dead ? 0.35 : 1.0;
      // フラナは絵が既に "dead" ポーズなので回転させない。他NPC（ココン等）は従来通り倒す
      v.container.rotation = n.dead && n.id !== 'furana' ? Math.PI * 0.5 : 0;
    }

    // wolves
    const wolfIds = new Set(world.wolves.map((w) => w.id));
    for (const [id, v] of wolfViews) {
      if (!wolfIds.has(id)) {
        v.container.destroy({ children: true });
        wolfViews.delete(id);
      }
    }
    for (const wolf of world.wolves) {
      let v = wolfViews.get(wolf.id);
      if (!v) {
        const c = drawWolf();
        wolfLayer.addChild(c);
        v = { container: c, lastState: wolf.state };
        wolfViews.set(wolf.id, v);
      }
      v.container.position.set(wolf.pos.x, wolf.pos.y);
      v.container.scale.x = wolf.faceLeft ? -1 : 1;
      v.container.alpha = wolf.state === 'dead' ? 0.4 : 1.0;
      v.container.rotation = wolf.state === 'dead' ? Math.PI * 0.5 : 0;
    }

    // bubbles
    const bubbleIds = new Set(world.bubbles.map((b) => b.id));
    for (const [id, v] of bubbleViews) {
      if (!bubbleIds.has(id)) {
        v.container.destroy({ children: true });
        bubbleViews.delete(id);
      }
    }
    for (const b of world.bubbles) {
      let v = bubbleViews.get(b.id);
      if (!v) {
        v = createBubbleView(b);
        fxLayer.addChild(v.container);
        bubbleViews.set(b.id, v);
      }
      v.container.position.set(b.pos.x, b.pos.y);
      v.container.alpha = Math.min(1, b.ttl / Math.max(0.2, b.maxTtl * 0.35));
    }

    // event overlays
    renderEventOverlay(eventUnderLayer, eventOverLayer, world);
    // depth sort は sortableChildren=true + zIndex で PIXI が自動実行
  }

  function screenToWorld(cx: number, cy: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const lx = cx - rect.left;
    const ly = cy - rect.top;
    return { x: (lx - cameraX) / cameraScale, y: (ly - cameraY) / cameraScale };
  }

  return {
    app,
    resize,
    draw,
    setSeason,
    resetCamera: () => focusOn(currentBoundsW / 2, currentBoundsH * 0.35, 0.6),
    focusOn,
    panCamera: (dx: number, dy: number) => {
      // dx/dy はワールド座標でのオフセット。スケール変換して画面座標に変換後 camera 更新。
      cameraX -= dx * cameraScale;
      cameraY -= dy * cameraScale;
      clampCamera();
      applyCamera();
    },
    getCamera: (): CameraView => {
      const vw = app.renderer.width;
      const vh = app.renderer.height;
      return {
        x: -cameraX / cameraScale,
        y: -cameraY / cameraScale,
        w: vw / cameraScale,
        h: vh / cameraScale,
        scale: cameraScale,
        bounds: { w: currentBoundsW, h: currentBoundsH },
      };
    },
    screenToWorld,
    setHitTest,
  };
}

function renderEventOverlay(under: Container, over: Container, world: WorldState) {
  // destroy してバッファ解放（v8 の removeChildren は destroy しないためリーク源）
  for (let i = under.children.length - 1; i >= 0; i--) under.children[i]!.destroy({ children: true });
  for (let i = over.children.length - 1; i >= 0; i--) over.children[i]!.destroy({ children: true });

  // 棒会議マーカー（2.5秒）
  if (world.bokaigiMarkerTimer > 0) {
    const suzu = world.npcs.find((n) => n.id === 'suzu');
    if (suzu) {
      const r = 40 + Math.sin(world.timeSec * 8) * 8;
      const alpha = Math.min(1, world.bokaigiMarkerTimer / 1.5);
      const g = new Graphics();
      g.circle(0, 0, r).stroke({ color: 0x8b5a2b, width: 3, alpha: 0.8 * alpha });
      g.circle(0, 0, r * 0.55).stroke({ color: 0x8b5a2b, width: 2, alpha: 0.6 * alpha });
      g.position.set(suzu.pos.x, suzu.pos.y);
      under.addChild(g);
    }
  }

  if (!world.event) return;

  if (world.event.kind === 'ondo') {
    // 村の中心に脈打つ二重リング。
    const x = world.bounds.w / 2;
    const y = 260;
    const beat = Math.sin(world.timeSec * 4);
    const r = 90 + beat * 14;
    const g = new Graphics();
    g.circle(x, y, r).stroke({ color: 0xe8735a, width: 3, alpha: 0.55 });
    g.circle(x, y, r * 0.62).stroke({ color: 0xe8735a, width: 2, alpha: 0.4 });
    under.addChild(g);
    // 画面上部に「♪くそざこ音頭♪」テキスト
    const t = new Text({
      text: '♪くそざこ音頭♪',
      style: new TextStyle({
        fontFamily: 'sans-serif',
        fontSize: 16,
        fontWeight: 'bold',
        fill: 0xe8735a,
      }),
    });
    t.anchor.set(0.5, 0);
    t.position.set(world.bounds.w / 2, 8 + Math.sin(world.timeSec * 6) * 2);
    over.addChild(t);
  } else if (world.event.kind === 'fire') {
    // 各 kouba の上で炎＋粉塵。
    for (const b of world.buildings) {
      if (b.defId !== 'kouba') continue;
      const flame = new Graphics();
      const r = 18 + Math.sin(world.timeSec * 5) * 6;
      flame.circle(0, 0, r).fill({ color: 0xff6633, alpha: 0.55 });
      flame.circle(0, -r * 0.6, r * 0.7).fill({ color: 0xffb347, alpha: 0.8 });
      flame.circle(0, -r * 1.1, r * 0.4).fill({ color: 0xffe169, alpha: 0.9 });
      flame.position.set(b.pos.x, b.pos.y - 10);
      over.addChild(flame);
      for (let i = 0; i < 5; i++) {
        const e = new Graphics();
        const ex = (Math.random() - 0.5) * 60;
        const ey = -Math.random() * 55 - 8;
        e.circle(0, 0, 2).fill({ color: 0xffc64b, alpha: 0.7 });
        e.position.set(b.pos.x + ex, b.pos.y + ey);
        over.addChild(e);
      }
    }
  } else if (world.event.kind === 'taiko_festival') {
    for (const b of world.buildings) {
      if (b.defId !== 'taiko') continue;
      const g = new Graphics();
      const r = 40 + Math.sin(world.timeSec * 5) * 14;
      g.circle(0, 0, r).fill({ color: 0xc05a3a, alpha: 0.45 });
      g.circle(0, 0, r * 0.6).fill({ color: 0xffd35a, alpha: 0.4 });
      g.position.set(b.pos.x, b.pos.y);
      under.addChild(g);
    }
    const t = new Text({
      text: '🥁 太鼓祭 🥁',
      style: new TextStyle({
        fontFamily: 'sans-serif',
        fontSize: 15,
        fontWeight: 'bold',
        fill: 0xc05a3a,
      }),
    });
    t.anchor.set(0.5, 0);
    t.position.set(world.bounds.w / 2, 8);
    over.addChild(t);
  }
}

async function loadEnvironmentArt(): Promise<EnvironmentArt> {
  const art: EnvironmentArt = {
    background: null,
    buildingFrames: {},
  };

  // Ω-2 時点：3200×1800 の広大マップにラスタ画像は合わないため procedural 固定。
  // 将来 bg を差し替える時はここで loadImage して art.background に入れる。

  try {
    const buildingSheet = await loadImage('/mockup/buildings.png');
    const base = textureFromProcessedCanvas(buildingSheet);
    const cellW = Math.floor(buildingSheet.width / BUILDING_FRAME_ORDER.length);
    const cellH = buildingSheet.height;
    BUILDING_FRAME_ORDER.forEach((id, index) => {
      art.buildingFrames[id] = new Texture({
        source: base.source,
        frame: new Rectangle(index * cellW, 0, cellW, cellH),
      });
    });
  } catch (err) {
    console.warn('[stage] building art load failed, keeping procedural buildings', err);
  }

  return art;
}

function textureFromProcessedCanvas(img: HTMLImageElement): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.drawImage(img, 0, 0);
  removeBackgroundFloodFill(ctx, img.width, img.height);
  return Texture.from(canvas);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${url}`));
    img.src = url;
  });
}

function removeBackgroundFloodFill(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  const visited = new Uint8Array(w * h);
  const isNearWhite = (i: number): boolean => {
    const o = i * 4;
    return d[o]! >= 240 && d[o + 1]! >= 240 && d[o + 2]! >= 240;
  };
  const stack: number[] = [];
  const seeds = [0, w - 1, (h - 1) * w, h * w - 1];
  for (const s of seeds) if (isNearWhite(s)) stack.push(s);
  while (stack.length > 0) {
    const i = stack.pop()!;
    if (visited[i]) continue;
    if (!isNearWhite(i)) continue;
    visited[i] = 1;
    d[i * 4 + 3] = 0;
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }
  ctx.putImageData(id, 0, 0);
}

function drawBuildingStructure(b: PlacedBuilding, label: string, envArt: EnvironmentArt): Container {
  const c = new Container();
  const s = 1 + Math.sqrt(Math.max(0, b.level - 1)) * 0.15;
  c.addChild(drawGroundShadow(28 * s, 10 * s, 9 * s, 0.18));

  const buildingTexture = envArt.buildingFrames[b.defId];
  if (buildingTexture) {
    const sprite = new Sprite(buildingTexture);
    sprite.anchor.set(0.5, 0.72);
    sprite.scale.set((110 / Math.max(buildingTexture.width, 1)) * s);
    c.addChild(sprite);
  } else {
    switch (b.defId) {
      case 'noukou': {
        const plot = new Graphics();
        plot.roundRect(-30 * s, -10 * s, 60 * s, 26 * s, 10 * s)
          .fill({ color: 0x9a6d3d })
          .stroke({ color: 0x4d341c, width: 2 });
        plot.rect(-30 * s, 4 * s, 60 * s, 7 * s).fill({ color: 0x648041, alpha: 0.75 });
        for (let i = -2; i <= 2; i++) {
          plot.rect(i * 10 * s - 2 * s, -7 * s, 4 * s, 14 * s).fill({ color: 0xbe8d54, alpha: 0.75 });
        }
        const shed = new Graphics();
        shed.roundRect(-12 * s, -30 * s, 24 * s, 16 * s, 6 * s)
          .fill({ color: 0xd1bc8b })
          .stroke({ color: 0x4d341c, width: 2 });
        shed.poly([-16 * s, -18 * s, 0, -34 * s, 16 * s, -18 * s])
          .fill({ color: 0x6b5130 })
          .stroke({ color: 0x4d341c, width: 2 });
        const scarecrow = new Graphics();
        scarecrow.rect(18 * s, -20 * s, 2 * s, 18 * s).fill({ color: 0x4d341c });
        scarecrow.rect(12 * s, -15 * s, 14 * s, 2 * s).fill({ color: 0x4d341c });
        scarecrow.circle(19 * s, -21 * s, 4 * s).fill({ color: 0xe6d0a6 }).stroke({ color: 0x4d341c, width: 1 });
        c.addChild(plot, shed, scarecrow);
        break;
      }
      case 'kouba': {
        const forge = new Graphics();
        forge.roundRect(-24 * s, -16 * s, 48 * s, 30 * s, 7 * s)
          .fill({ color: 0x5c585c })
          .stroke({ color: 0x2f2727, width: 2 });
        forge.poly([-28 * s, -16 * s, -8 * s, -30 * s, 14 * s, -26 * s, 28 * s, -12 * s])
          .fill({ color: 0x6f3d2d })
          .stroke({ color: 0x2f2727, width: 2 });
        forge.roundRect(-8 * s, -2 * s, 16 * s, 12 * s, 3 * s).fill({ color: 0x2d2321 });
        forge.circle(0, 4 * s, 5 * s).fill({ color: 0xffb347, alpha: 0.9 });
        forge.circle(0, 4 * s, 9 * s).fill({ color: 0xff7a3d, alpha: 0.22 });
        const chimney = new Graphics();
        chimney.rect(10 * s, -34 * s, 8 * s, 18 * s).fill({ color: 0x433738 }).stroke({ color: 0x2f2727, width: 2 });
        chimney.circle(16 * s, -38 * s, 4 * s).fill({ color: 0x8a7d7a, alpha: 0.45 });
        chimney.circle(20 * s, -44 * s, 5 * s).fill({ color: 0x8a7d7a, alpha: 0.3 });
        c.addChild(forge, chimney);
        break;
      }
      case 'hakaba': {
        const yard = new Graphics();
        yard.roundRect(-28 * s, -12 * s, 56 * s, 24 * s, 9 * s)
          .fill({ color: 0xbfb1a3 })
          .stroke({ color: 0x524338, width: 2 });
        yard.rect(-22 * s, -16 * s, 44 * s, 4 * s).fill({ color: 0x524338 });
        for (let i = 0; i < 4; i++) {
          yard.rect((-18 + i * 12) * s, -14 * s, 2 * s, 16 * s).fill({ color: 0x524338 });
        }
        const stoneA = new Graphics();
        stoneA.roundRect(-16 * s, -24 * s, 12 * s, 18 * s, 5 * s)
          .fill({ color: 0xe2d9cf })
          .stroke({ color: 0x6b5c55, width: 2 });
        stoneA.rect(-12 * s, -12 * s, 4 * s, 2 * s).fill({ color: 0x6b5c55 });
        const stoneB = new Graphics();
        stoneB.roundRect(2 * s, -20 * s, 16 * s, 14 * s, 5 * s)
          .fill({ color: 0xd5cbc0 })
          .stroke({ color: 0x6b5c55, width: 2 });
        const lantern = new Graphics();
        lantern.circle(20 * s, -20 * s, 4 * s).fill({ color: 0xffd35a, alpha: 0.9 });
        lantern.rect(19 * s, -16 * s, 2 * s, 10 * s).fill({ color: 0x5a4a39 });
        c.addChild(yard, stoneA, stoneB, lantern);
        break;
      }
      case 'taiko': {
        const tower = new Graphics();
        tower.rect(-20 * s, -8 * s, 5 * s, 24 * s).fill({ color: 0x734728 });
        tower.rect(15 * s, -8 * s, 5 * s, 24 * s).fill({ color: 0x734728 });
        tower.rect(-18 * s, -8 * s, 36 * s, 5 * s).fill({ color: 0x734728 });
        tower.poly([-28 * s, -16 * s, 0, -36 * s, 28 * s, -16 * s])
          .fill({ color: 0xb14632 })
          .stroke({ color: 0x5a311d, width: 2 });
        tower.circle(0, -4 * s, 12 * s).fill({ color: 0xd4a25a }).stroke({ color: 0x5a311d, width: 3 });
        tower.circle(0, -4 * s, 4 * s).fill({ color: 0x7d3b2a });
        tower.rect(-2 * s, -15 * s, 4 * s, 22 * s).fill({ color: 0x5a311d, alpha: 0.45 });
        const banners = new Graphics();
        banners.rect(-22 * s, -28 * s, 2 * s, 15 * s).fill({ color: 0x5a311d });
        banners.rect(20 * s, -28 * s, 2 * s, 15 * s).fill({ color: 0x5a311d });
        banners.rect(-20 * s, -25 * s, 10 * s, 7 * s).fill({ color: 0xe8735a });
        banners.rect(12 * s, -25 * s, 10 * s, 7 * s).fill({ color: 0xffd35a });
        c.addChild(tower, banners);
        break;
      }
      case 'ubuya': {
        const hut = new Graphics();
        hut.ellipse(0, 0, 25 * s, 16 * s).fill({ color: 0xf4cfd7 }).stroke({ color: 0x7a4b52, width: 2 });
        hut.poly([-24 * s, 0, 0, -28 * s, 24 * s, 0])
          .fill({ color: 0xe8aeb8 })
          .stroke({ color: 0x7a4b52, width: 2 });
        hut.roundRect(-7 * s, -2 * s, 14 * s, 12 * s, 5 * s).fill({ color: 0xfff6f3 }).stroke({ color: 0x7a4b52, width: 1 });
        const charm = new Graphics();
        charm.rect(-1 * s, -24 * s, 2 * s, 10 * s).fill({ color: 0x7a4b52 });
        charm.circle(0, -10 * s, 4 * s).fill({ color: 0xffe6a8 });
        c.addChild(hut, charm);
        break;
      }
      default: {
        const fallback = new Graphics();
        fallback.roundRect(-24 * s, -18 * s, 48 * s, 34 * s, 7 * s)
          .fill({ color: buildingColor(b.defId) })
          .stroke({ color: 0x3a2a1a, width: 2 });
        c.addChild(fallback);
      }
    }
  }

  addBuildingTierAccents(c, b, s);

  const t = new Text({
    text: `${label} Lv${b.level}`,
    style: new TextStyle({
      fontFamily: 'serif',
      fontSize: 10,
      fontWeight: 'bold',
      fill: 0x3a2a1a,
    }),
  });
  t.anchor.set(0.5, 0);
  t.position.set(0, 28 * s);
  c.addChild(t);
  return c;
}

function addBuildingTierAccents(container: Container, b: PlacedBuilding, s: number) {
  if (b.level >= 2) {
    const pennant = new Graphics();
    pennant.rect(0, -34 * s, 2 * s, 16 * s).fill({ color: 0x4d341c });
    pennant.poly([2 * s, -33 * s, 12 * s, -30 * s, 2 * s, -24 * s]).fill({ color: 0xe8735a });
    container.addChild(pennant);
  }
  if (b.level >= 5) {
    const trim = new Graphics();
    trim.circle(-18 * s, -14 * s, 4 * s).fill({ color: 0xfff2c5 });
    trim.circle(18 * s, -14 * s, 4 * s).fill({ color: 0xfff2c5 });
    container.addChild(trim);
  }
  if (b.level >= 10) {
    const crest = new Graphics();
    crest.circle(0, -34 * s, 5 * s).fill({ color: 0xffd35a }).stroke({ color: 0x6d4d1f, width: 1 });
    container.addChild(crest);
  }
  if (b.level >= 30) {
    const aura = new Graphics();
    aura.circle(0, -4 * s, 24 * s).stroke({ color: buildingAuraColor(b.defId), width: 2, alpha: 0.45 });
    aura.circle(0, -4 * s, 14 * s).stroke({ color: buildingAuraColor(b.defId), width: 1, alpha: 0.3 });
    container.addChild(aura);
  }
  if (b.level >= 50) {
    const streamers = new Graphics();
    streamers.rect(-22 * s, -28 * s, 3 * s, 12 * s).fill({ color: 0xffd35a });
    streamers.rect(-14 * s, -32 * s, 3 * s, 12 * s).fill({ color: 0xe8735a });
    streamers.rect(11 * s, -32 * s, 3 * s, 12 * s).fill({ color: 0xffd35a });
    streamers.rect(19 * s, -28 * s, 3 * s, 12 * s).fill({ color: 0xe8735a });
    container.addChild(streamers);
  }
  if (b.level >= 99) {
    const halo = new Graphics();
    halo.circle(0, 0, 34 * s).stroke({ color: 0xff66aa, width: 2, alpha: 0.55 });
    halo.circle(0, 0, 39 * s).stroke({ color: 0xffd35a, width: 1, alpha: 0.45 });
    container.addChild(halo);
  }
}

function drawGroundShadow(rx: number, ry: number, y: number, alpha: number): Graphics {
  const shadow = new Graphics();
  shadow.ellipse(0, y, rx, ry).fill({ color: 0x1d140d, alpha });
  return shadow;
}

// オオカミ：横長の暗い灰色シルエット + 赤い目。プロシージャル描画。
function drawWolf(): Container {
  const c = new Container();
  c.addChild(drawGroundShadow(22, 7, 10, 0.35));
  const body = new Graphics();
  // 胴体（横長）
  body.ellipse(0, 0, 20, 9).fill({ color: 0x4a3a30 }).stroke({ color: 0x1a0a00, width: 1.5 });
  // 頭
  body.circle(15, -2, 7).fill({ color: 0x4a3a30 }).stroke({ color: 0x1a0a00, width: 1.5 });
  // 耳（尖った三角）
  body.poly([12, -7, 14, -14, 17, -7]).fill({ color: 0x3a2a20 });
  body.poly([17, -9, 20, -14, 22, -7]).fill({ color: 0x3a2a20 });
  // 口（牙）
  body.poly([20, 0, 24, -1, 22, 2]).fill({ color: 0xffffff });
  // 目（赤い光）
  body.circle(16, -3, 1.6).fill({ color: 0xff3322 });
  // 尻尾
  body.poly([-18, -2, -24, -6, -20, 1]).fill({ color: 0x3a2a20 });
  // 脚
  body.rect(-12, 6, 3, 7).fill({ color: 0x2a1a10 });
  body.rect(-4, 6, 3, 7).fill({ color: 0x2a1a10 });
  body.rect(6, 6, 3, 7).fill({ color: 0x2a1a10 });
  body.rect(12, 6, 3, 7).fill({ color: 0x2a1a10 });
  c.addChild(body);
  return c;
}

function buildingAuraColor(id: string): number {
  switch (id) {
    case 'noukou': return 0x96c75c;
    case 'kouba': return 0xff9a4d;
    case 'hakaba': return 0xbab0c8;
    case 'taiko': return 0xffb24a;
    case 'ubuya': return 0xff99b5;
    default: return 0xffffff;
  }
}

function calcScale(lib: SpriteLibrary): number {
  if (!lib.hasSheet) return 1;
  const t = lib.frames[0]!;
  const target = 48;
  return target / Math.max(t.width, 1);
}

function createChibiView(c: Chibiwafu, lib: SpriteLibrary): ChibiView {
  const container = new Container();
  const sprite = new Sprite(frameFor(lib, c.state));
  sprite.anchor.set(0.5, 0.9);
  sprite.scale.set(calcScale(lib));
  const label = new Text({
    text: c.name,
    style: new TextStyle({ fontFamily: 'sans-serif', fontSize: 9, fill: 0x3a2a1a }),
  });
  label.anchor.set(0.5, 1);
  label.position.set(0, -36);
  container.addChild(sprite, label);
  // 特性リング（足元、1個なら中央、2個なら横並び）。
  if (c.traits.length > 0) {
    const ring = new Graphics();
    const step = 7;
    const startX = -((c.traits.length - 1) * step) / 2;
    for (let i = 0; i < c.traits.length; i++) {
      const t = c.traits[i]!;
      const color = TRAIT_DEFS[t].color;
      ring.circle(startX + i * step, 3, 3.5)
        .fill({ color, alpha: 0.9 })
        .stroke({ color: 0x3a2a1a, width: 1 });
    }
    container.addChild(ring);
  }
  return { sprite, label, container, lastState: c.state };
}

function createBubbleView(b: Bubble): BubbleView {
  const container = new Container();
  // bubble 種別で色とフォントを変えて視覚的に区別する
  const isNpc = b.kind === 'npc-speech';
  const isStomp = b.kind === 'stomp';
  const textColor = isStomp ? 0x6a4a22 : isNpc ? 0x4a1a1a : 0x3a2a1a;
  const bgColor = isStomp ? 0xfff1c8 : isNpc ? 0xffe4d4 : 0xffffff;
  const borderColor = isNpc ? 0xc46a3a : 0x3a2a1a;
  const borderWidth = isNpc ? 1.5 : 1;
  const text = new Text({
    text: b.text,
    style: new TextStyle({
      fontFamily: 'sans-serif',
      fontSize: isStomp ? 10 : isNpc ? 12 : 11,
      fill: textColor,
      fontWeight: 'bold',
    }),
  });
  text.anchor.set(0.5, 1);
  const bg = new Graphics();
  const w = text.width + 10;
  const h = text.height + 6;
  bg.roundRect(-w / 2, -h - 2, w, h, 4)
    .fill({ color: bgColor, alpha: 0.92 })
    .stroke({ color: borderColor, width: borderWidth });
  text.position.set(0, -4);
  container.addChild(bg, text);
  return { text, bg, container };
}

// フラナ（スプライト描画）の Sprite への参照を保持する map。
// 毎tick render で state に応じてフレーム差し替え。
interface NpcView {
  container: Container;
  sprite?: Sprite;     // フラナのみ
  baseScale?: number;  // スプライトの基準スケール（全ステート共通）
}

function drawNpc(n: NpcState, furanaLib: SpriteLibrary): NpcView {
  const def = NPC_DEFS[n.id];
  const c = new Container();
  const label = new Text({
    text: def.name,
    style: new TextStyle({ fontFamily: 'sans-serif', fontSize: 11, fontWeight: 'bold', fill: 0x3a2a1a }),
  });
  label.anchor.set(0.5, 1);

  if (n.id === 'furana' && furanaLib.hasSheet) {
    // 画像ベースのフラナ。
    // 重要：各フレーム（立ち/寝/死体）は bbox の高さがバラバラなので、
    // idle（立ちポーズ）の高さを基準に baseScale を決め、全ステートで共通化する。
    // こうしないと短いポーズ（寝/死体）がでかく拡大されてしまう。
    const idleTex = frameFor(furanaLib, 'idle');
    const targetH = 60;
    const baseScale = targetH / Math.max(1, idleTex.height);
    const spr = new Sprite(frameFor(furanaLib, n.state));
    spr.scale.set(baseScale);
    spr.anchor.set(0.5, 0.85);
    label.position.set(0, -targetH * 0.8);
    c.addChild(spr, label);
    return { container: c, sprite: spr, baseScale };
  }

  // 他 NPC は従来通り Graphics で描く
  const body = new Graphics();
  const s = def.scale;
  body.ellipse(0, 0, 22 * s, 28 * s).fill({ color: def.color }).stroke({ color: 0x3a2a1a, width: 2 });
  body.ellipse(-14 * s, -16 * s, 5 * s, 8 * s).fill({ color: def.color }).stroke({ color: 0x3a2a1a, width: 1 });
  body.ellipse(14 * s, -16 * s, 5 * s, 8 * s).fill({ color: def.color }).stroke({ color: 0x3a2a1a, width: 1 });
  body.circle(-6 * s, -4 * s, 2.5 * s).fill({ color: 0x3a2a1a });
  body.circle(6 * s, -4 * s, 2.5 * s).fill({ color: 0x3a2a1a });
  if (n.id === 'suzu') {
    body.rect(-4 * s, -22 * s, 8 * s, 4 * s).fill({ color: def.secondaryColor });
  } else if (n.id === 'cocoon') {
    body.rect(14 * s, -4 * s, 16 * s, 2).fill({ color: 0x6b4a2b });
  }
  label.position.set(0, -28);
  c.addChild(body, label);
  return { container: c };
}

function drawBackground(layer: Container, w: number, h: number, season: Season, envArt: EnvironmentArt) {
  // 背景は季節変わり時のみ再描画されるため頻度低いが、念のため destroy
  for (let i = layer.children.length - 1; i >= 0; i--) layer.children[i]!.destroy({ children: true });
  if (envArt.background) {
    const bgSprite = new Sprite(envArt.background);
    bgSprite.width = w;
    bgSprite.height = h;
    layer.addChild(bgSprite);

    const seasonTint = new Graphics();
    const overlay = seasonOverlay(season);
    seasonTint.rect(0, 0, w, h).fill({ color: overlay.color, alpha: overlay.alpha });
    layer.addChild(seasonTint);

    const vignette = new Graphics();
    vignette.rect(0, 0, w, 24).fill({ color: 0x000000, alpha: 0.04 });
    vignette.rect(0, h - 34, w, 34).fill({ color: 0x000000, alpha: 0.08 });
    vignette.rect(0, 0, 24, h).fill({ color: 0x000000, alpha: 0.035 });
    vignette.rect(w - 24, 0, 24, h).fill({ color: 0x000000, alpha: 0.035 });
    layer.addChild(vignette);
    return;
  }

  // Σ-2.5: procedural 背景はタイルレイヤ（terrainStaticLayer）で置換済み。
  // bgLayer にはビネットのみ残す。
  void season;
  const vignette = new Graphics();
  vignette.rect(0, 0, w, 24).fill({ color: 0x000000, alpha: 0.04 });
  vignette.rect(0, h - 34, w, 34).fill({ color: 0x000000, alpha: 0.08 });
  vignette.rect(0, 0, 24, h).fill({ color: 0x000000, alpha: 0.035 });
  vignette.rect(w - 24, 0, 24, h).fill({ color: 0x000000, alpha: 0.035 });
  layer.addChild(vignette);
}

// 電力グラフのワイヤ描画。feature 本体の下レイヤに、
// powerline/generator/streetlamp 間で接続距離以内のペアに直線を引く。
// 稼働中の街灯に通じている辺は明るい黄色、そうでなければ灰色。
function drawPowerWires(world: WorldState): Container | null {
  const nodes = world.features.filter(
    (f) => f.kind === 'powerline' || f.kind === 'generator' || f.kind === 'streetlamp',
  );
  if (nodes.length < 2) return null;
  const c = new Container();
  const g = new Graphics();
  const R2 = POWERLINE_CONNECT_RADIUS * POWERLINE_CONNECT_RADIUS;
  const anyLitLamp = world.features.some((f) => f.kind === 'streetlamp' && f.saturated);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      const dx = a.pos.x - b.pos.x;
      const dy = a.pos.y - b.pos.y;
      if (dx * dx + dy * dy > R2) continue;
      g.moveTo(a.pos.x, a.pos.y - 8).lineTo(b.pos.x, b.pos.y - 8);
    }
  }
  g.stroke({ color: anyLitLamp ? 0xffd870 : 0x6a5848, width: 1.4, alpha: anyLitLamp ? 0.55 : 0.45 });
  c.addChild(g);
  return c;
}

// 開拓 feature の仮描画。kind 別に円形アイコン＋devLevel。
function drawFeature(f: import('../types').Feature): Container {
  const c = new Container();
  const g = new Graphics();
  const radius = f.kind === 'water' ? 26 : f.kind === 'farm' ? 22 : f.kind === 'channel' ? 18
    : f.kind === 'house' ? 24 : f.kind === 'well' ? 20 : f.kind === 'firewatch' ? 26
    : f.kind === 'sawmill' ? 24 : f.kind === 'shrine' ? 26
    : f.kind === 'generator' ? 22 : f.kind === 'streetlamp' ? 14
    : f.kind === 'powerline' ? 10 : f.kind === 'kiln' ? 24
    : f.kind === 'pasture' ? 26 : f.kind === 'loom' ? 22 : 16;

  // 水路の通水状態に応じて色を変える
  // 通常青 → 飽和時オレンジ赤（氾濫警告）
  let channelColor = 0x6ba2d2;
  if (f.kind === 'channel' || f.kind === 'water') {
    const capacity = (f.devLevel || 1) * 1.5;
    const ratio = Math.min(1, (f.flow ?? 0) / capacity);
    if (ratio > 0.8) {
      // 80%超 → 赤みがかる
      const t = (ratio - 0.8) / 0.2;
      const r = Math.round(0x6b + t * (0xff - 0x6b));
      const gb = Math.round(0xa2 - t * (0xa2 - 0x44));
      channelColor = (r << 16) | (gb << 8) | gb;
    } else if (ratio > 0) {
      // 水が流れている → やや明るい青
      channelColor = 0x5cc4f0;
    }
  }

  const kindColor: Record<import('../types').FeatureKind, number> = {
    water:   f.saturated ? 0xff4400 : (f.flow ?? 0) > 0 ? 0x2a90d0 : 0x3a6ea0,
    channel: channelColor,
    farm:    0x6ea241,
    path:    0x8b7048,
    house:   0xb85a3a,
    well:    0x4a7898,
    firewatch: 0xb0553a,
    sawmill: 0x8d6238,
    shrine: 0xc44a4a,
    generator: 0x7a7088,
    streetlamp: 0x5a5240,
    powerline: 0x6a5848,
    kiln: 0xb86030,
    pasture: 0x7ab060,
    loom: 0xa07858,
  };
  // 井戸：丸い石枠 + 中央に水、上に屋根
  if (f.kind === 'well') {
    // 石枠
    g.circle(0, 0, radius).fill({ color: 0x8a7a68 }).stroke({ color: 0x3a2a10, width: 2 });
    // 中の水
    g.circle(0, 0, radius - 7).fill({ color: kindColor.well, alpha: 0.9 });
    // 屋根（三角）
    g.moveTo(-radius - 2, -radius + 4).lineTo(0, -radius - 10).lineTo(radius + 2, -radius + 4)
      .closePath().fill({ color: 0x5a3a20 }).stroke({ color: 0x2a1a05, width: 1.5 });
    // 支柱
    g.rect(-radius + 2, -radius + 4, 2, 6).fill({ color: 0x3a2a10 });
    g.rect(radius - 4, -radius + 4, 2, 6).fill({ color: 0x3a2a10 });
    // 波紋マーク
    g.moveTo(-radius * 0.5, -2).lineTo(-radius * 0.15, -5).lineTo(radius * 0.15, -2).lineTo(radius * 0.5, -5)
      .stroke({ color: 0xffffff, width: 1.5, alpha: 0.7 });
    c.addChild(g);
    c.position.set(f.pos.x, f.pos.y);
    return c;
  }
  // 神社：赤い鳥居 + 石階段
  if (f.kind === 'shrine') {
    // 石階段（下段）
    g.rect(-radius + 2, radius - 4, (radius - 2) * 2, 6).fill({ color: 0xbbb0a0 }).stroke({ color: 0x3a2a10, width: 1 });
    g.rect(-radius + 6, radius - 10, (radius - 6) * 2, 6).fill({ color: 0xd0c4b0 }).stroke({ color: 0x3a2a10, width: 1 });
    // 鳥居の柱（2本）
    g.rect(-radius + 8, -radius + 4, 4, radius + 2).fill({ color: kindColor.shrine }).stroke({ color: 0x5a1005, width: 1.5 });
    g.rect(radius - 12, -radius + 4, 4, radius + 2).fill({ color: kindColor.shrine }).stroke({ color: 0x5a1005, width: 1.5 });
    // 上部の横木（笠木）
    g.rect(-radius - 2, -radius + 4, (radius + 2) * 2, 5).fill({ color: kindColor.shrine }).stroke({ color: 0x5a1005, width: 1.5 });
    // その下の横木（貫）
    g.rect(-radius + 4, -radius + 10, (radius - 4) * 2, 3).fill({ color: kindColor.shrine }).stroke({ color: 0x5a1005, width: 1 });
    // 中央の短冊（紙垂）
    g.rect(-1.5, -radius + 12, 3, 8).fill({ color: 0xffffff }).stroke({ color: 0x3a2a10, width: 0.8 });
    c.addChild(g);
    c.position.set(f.pos.x, f.pos.y);
    return c;
  }
  // 牧場：草地（緑の楕円）+ 柵 + もふもふ羊（白丸）。
  if (f.kind === 'pasture') {
    // 草地
    g.ellipse(0, 0, radius, radius - 6).fill({ color: kindColor.pasture, alpha: 0.5 });
    // 柵（4辺の短い線）
    const pw = radius - 2;
    g.rect(-pw, -pw + 4, pw * 2, 3).fill({ color: 0x6a4a20 });
    g.rect(-pw, pw - 6, pw * 2, 3).fill({ color: 0x6a4a20 });
    g.rect(-pw, -pw + 4, 3, pw * 2 - 7).fill({ color: 0x6a4a20 });
    g.rect(pw - 3, -pw + 4, 3, pw * 2 - 7).fill({ color: 0x6a4a20 });
    // 羊 3 匹（白い丸 + 顔の点）
    const sheep = [{ x: -8, y: -4 }, { x: 6, y: 2 }, { x: -2, y: 8 }];
    for (const s of sheep) {
      g.circle(s.x, s.y, 5).fill({ color: 0xf0ece4 }).stroke({ color: 0x8a7868, width: 0.8 });
      g.circle(s.x + 3, s.y - 2, 2.5).fill({ color: 0xe0d8cc }); // 頭
      g.circle(s.x + 4, s.y - 1.5, 0.8).fill({ color: 0x3a3020 }); // 目
    }
    c.addChild(g);
    c.position.set(f.pos.x, f.pos.y);
    return c;
  }
  // 織機：茶色の木枠 + タテ糸 + ちびわふが操作中に布が現れる。
  if (f.kind === 'loom') {
    // 外枠（木の矩形フレーム）
    g.rect(-radius + 2, -radius + 4, (radius - 2) * 2, radius + 8)
      .fill({ color: kindColor.loom, alpha: 0.85 }).stroke({ color: 0x3a1a05, width: 2 });
    // タテ糸（縦線 5 本）
    const threadX = [-10, -5, 0, 5, 10];
    for (const tx of threadX) {
      g.moveTo(tx, -radius + 8).lineTo(tx, radius + 2)
        .stroke({ color: 0xd8c8a0, width: 1, alpha: 0.8 });
    }
    // ヨコ糸（稼働中は追加）
    if (f.workSec > 0) {
      for (let row = 0; row < 4; row++) {
        const ry = -radius + 10 + row * 5;
        g.moveTo(-10, ry).lineTo(10, ry)
          .stroke({ color: 0xe8a058, width: 1.5, alpha: 0.9 });
      }
    }
    // シャトル（横に走る小さな棒）
    g.rect(-8, 0, 16, 3).fill({ color: 0x8a4a20 }).stroke({ color: 0x3a1a05, width: 0.8 });
    c.addChild(g);
    c.position.set(f.pos.x, f.pos.y);
    return c;
  }
  // 精錬所（窯）：レンガ色の丸い窯 + 煙突 + 炎口。稼働中（workSec>0）は炎マーク。
  if (f.kind === 'kiln') {
    // 窯の胴体（楕円ぽく見せる）
    g.ellipse(0, 2, radius - 2, radius - 6).fill({ color: kindColor.kiln }).stroke({ color: 0x4a1a05, width: 2 });
    // レンガ模様（横線 3 本）
    for (let row = -1; row <= 1; row++) {
      g.moveTo(-(radius - 6), row * 4).lineTo(radius - 6, row * 4)
        .stroke({ color: 0x4a1a05, width: 0.8, alpha: 0.5 });
    }
    // 煙突（上部）
    g.rect(-4, -radius - 4, 8, radius - 4).fill({ color: 0x4a3020 }).stroke({ color: 0x2a1005, width: 1.2 });
    // 煙突蓋
    g.rect(-6, -radius - 6, 12, 3).fill({ color: 0x3a2010 }).stroke({ color: 0x1a1005, width: 1 });
    // 炉口（正面の丸窓）
    g.circle(0, 6, 5).fill({ color: f.workSec > 0 ? 0xff8820 : 0x3a1a05 });
    // 稼働中：炎ちら（橙色の揺らぎ）
    if (f.workSec > 0) {
      g.moveTo(-3, 6).lineTo(0, -radius + 8).lineTo(3, 6)
        .fill({ color: 0xff6010, alpha: 0.7 });
    }
    c.addChild(g);
    c.position.set(f.pos.x, f.pos.y);
    return c;
  }
  // 製材所：茶色の小屋 + 丸太 + ノコギリ
  if (f.kind === 'sawmill') {
    // 小屋
    g.rect(-radius + 2, -radius + 8, (radius - 2) * 2, radius + 4)
      .fill({ color: kindColor.sawmill }).stroke({ color: 0x3a2005, width: 1.5 });
    // 切妻屋根
    g.moveTo(-radius, -radius + 8).lineTo(0, -radius - 4).lineTo(radius, -radius + 8)
      .closePath().fill({ color: 0x5a3010 }).stroke({ color: 0x2a1005, width: 1.5 });
    // 丸太 3 本積み
    g.circle(-radius + 4, radius - 2, 4).fill({ color: 0xbe8554 }).stroke({ color: 0x3a2a10, width: 1 });
    g.circle(-radius + 11, radius - 2, 4).fill({ color: 0xbe8554 }).stroke({ color: 0x3a2a10, width: 1 });
    g.circle(-radius + 18, radius - 2, 4).fill({ color: 0xbe8554 }).stroke({ color: 0x3a2a10, width: 1 });
    // ノコギリ光（白い線）
    g.moveTo(-4, -2).lineTo(6, -2).stroke({ color: 0xeeeeee, width: 2 });
    c.addChild(g);
    c.position.set(f.pos.x, f.pos.y);
    return c;
  }
  // 発電所：小屋 + ペダル車輪（flow=稼働ワーカー数で回転、ここでは光の点滅で表現）
  if (f.kind === 'generator') {
    // 小屋外壁
    g.rect(-radius + 2, -radius + 6, (radius - 2) * 2, radius + 6)
      .fill({ color: 0x8a7a5a }).stroke({ color: 0x2a1a05, width: 1.5 });
    // 屋根（切妻）
    g.moveTo(-radius, -radius + 6).lineTo(0, -radius - 4).lineTo(radius, -radius + 6)
      .closePath().fill({ color: 0x3a3228 }).stroke({ color: 0x1a1005, width: 1.5 });
    // ペダル車輪（大きな歯車）
    const wheelY = 2;
    g.circle(0, wheelY, 9).fill({ color: kindColor.generator }).stroke({ color: 0x1a1010, width: 1.5 });
    // スポーク（十字）
    g.moveTo(-9, wheelY).lineTo(9, wheelY).stroke({ color: 0xc0b8a0, width: 1.5 });
    g.moveTo(0, wheelY - 9).lineTo(0, wheelY + 9).stroke({ color: 0xc0b8a0, width: 1.5 });
    // 稼働中は稲妻（flow>0 で黄色マーク）
    if ((f.flow ?? 0) > 0) {
      g.moveTo(-3, -radius + 12).lineTo(2, -radius + 16).lineTo(-1, -radius + 16).lineTo(3, -radius + 20)
        .stroke({ color: 0xffe070, width: 2 });
    }
    c.addChild(g);
    c.position.set(f.pos.x, f.pos.y);
    return c;
  }
  // 電線（電柱）：縦棒 + 上部横梁 + 碍子 2 個。
  if (f.kind === 'powerline') {
    // 支柱
    g.rect(-1, -radius + 2, 2, radius + 4).fill({ color: kindColor.powerline }).stroke({ color: 0x1a1005, width: 0.8 });
    // 横梁
    g.rect(-radius + 2, -radius + 2, (radius - 2) * 2, 2).fill({ color: kindColor.powerline }).stroke({ color: 0x1a1005, width: 0.8 });
    // 碍子（白ドット 2 個）
    g.circle(-radius + 3, -radius + 4, 1.6).fill({ color: 0xe0dac0 });
    g.circle(radius - 3, -radius + 4, 1.6).fill({ color: 0xe0dac0 });
    // 台座
    g.rect(-3, radius - 2, 6, 3).fill({ color: 0x3a3228 }).stroke({ color: 0x1a1005, width: 0.8 });
    c.addChild(g);
    c.position.set(f.pos.x, f.pos.y);
    return c;
  }
  // 街灯：支柱 + 電球。saturated=true で光輪を足す。
  if (f.kind === 'streetlamp') {
    // 稼働中：大きな光輪（半透明黄色）
    if (f.saturated) {
      g.circle(0, -radius + 2, radius * 1.2).fill({ color: 0xffd870, alpha: 0.18 });
      g.circle(0, -radius + 2, radius * 0.6).fill({ color: 0xfff0a0, alpha: 0.35 });
    }
    // 支柱
    g.rect(-1.5, -radius + 6, 3, radius + 4).fill({ color: 0x3a3228 }).stroke({ color: 0x1a1005, width: 1 });
    // 台座
    g.rect(-5, radius - 2, 10, 4).fill({ color: 0x3a3228 }).stroke({ color: 0x1a1005, width: 1 });
    // 笠（上の蓋）
    g.moveTo(-6, -radius + 4).lineTo(0, -radius).lineTo(6, -radius + 4).closePath()
      .fill({ color: 0x2a2218 }).stroke({ color: 0x1a1005, width: 1 });
    // 電球（稼働で明るい黄、停止で暗い）
    const bulbColor = f.saturated ? 0xffeea8 : kindColor.streetlamp;
    g.circle(0, -radius + 6, 3.2).fill({ color: bulbColor }).stroke({ color: 0x1a1005, width: 0.8 });
    c.addChild(g);
    c.position.set(f.pos.x, f.pos.y);
    return c;
  }
  // 火の見やぐら：高い四角柱 + 上部展望台 + 赤い鐘
  if (f.kind === 'firewatch') {
    // 脚（4本の柱、上すぼまり）
    g.poly([-radius + 6, radius, -radius + 4, -radius + 6, -6, -radius + 6, -6, radius])
      .fill({ color: 0x6a4a20 }).stroke({ color: 0x2a1a05, width: 1.5 });
    g.poly([radius - 6, radius, radius - 4, -radius + 6, 6, -radius + 6, 6, radius])
      .fill({ color: 0x6a4a20 }).stroke({ color: 0x2a1a05, width: 1.5 });
    // 展望台（四角）
    g.rect(-radius, -radius - 2, radius * 2, 8).fill({ color: 0x8a5a2a }).stroke({ color: 0x3a1a05, width: 1.5 });
    // 屋根
    g.moveTo(-radius - 4, -radius - 2).lineTo(0, -radius - 14).lineTo(radius + 4, -radius - 2)
      .closePath().fill({ color: kindColor.firewatch }).stroke({ color: 0x4a1a05, width: 1.5 });
    // 鐘
    g.circle(0, -radius - 4, 3.5).fill({ color: 0xcaa05a }).stroke({ color: 0x3a1a05, width: 1 });
    c.addChild(g);
    c.position.set(f.pos.x, f.pos.y);
    return c;
  }
  // 家は四角ベース + 屋根三角、それ以外は円形
  if (f.kind === 'house') {
    // 壁
    g.rect(-radius + 4, -radius + 10, (radius - 4) * 2, radius + 6)
      .fill({ color: kindColor.house, alpha: 0.9 }).stroke({ color: 0x3a1a10, width: 1.5 });
    // 屋根
    g.moveTo(-radius + 2, -radius + 10).lineTo(0, -radius - 2).lineTo(radius - 2, -radius + 10)
      .closePath().fill({ color: 0x5a2a1a }).stroke({ color: 0x2a1005, width: 1.5 });
    // ドア
    g.rect(-4, 4, 8, 12).fill({ color: 0x3a1a0a });
    c.addChild(g);
    c.position.set(f.pos.x, f.pos.y);
    return c;
  }
  g.circle(0, 0, radius).fill({ color: kindColor[f.kind], alpha: 0.78 }).stroke({ color: 0x2a1a10, width: 1.5 });
  // 溢れている水路は外周リング（オレンジ）
  if (f.saturated) {
    g.circle(0, 0, radius + 4).stroke({ color: 0xff6600, width: 2.5, alpha: 0.9 });
  }
  // 畑は devLevel に応じて緑が濃くなる
  if (f.kind === 'farm' && f.devLevel >= 3) {
    g.circle(0, 0, radius - 6).fill({ color: 0x9ad066, alpha: 0.5 });
  }
  // 水源は波マーク
  if (f.kind === 'water') {
    g.moveTo(-radius * 0.6, -2).lineTo(-radius * 0.2, -6).lineTo(radius * 0.2, -2).lineTo(radius * 0.6, -6)
      .stroke({ color: 0xffffff, width: 2, alpha: 0.7 });
  }
  c.addChild(g);
  c.position.set(f.pos.x, f.pos.y);
  return c;
}

function drawFloodZone(fz: import('../types').FloodZone): Container {
  const c = new Container();
  const g = new Graphics();
  const alpha = Math.min(0.38, fz.remainingSec / 25 * 0.4);
  g.circle(0, 0, fz.radius).fill({ color: 0x2255cc, alpha });
  g.circle(0, 0, fz.radius).stroke({ color: 0x44aaff, width: 1.5, alpha: alpha * 1.6 });
  c.addChild(g);
  c.position.set(fz.x, fz.y);
  return c;
}

// 障害物の仮描画。kind 別の色＋HP バー。
function drawObstacle(o: import('../types').Obstacle): Container {
  const c = new Container();
  const g = new Graphics();
  const kindColor: Record<import('../types').ObstacleKind, number> = {
    rock: 0x7a6a4a,
    stump: 0x5a3a20,
    bush: 0x4a6a3a,
  };
  const size = o.kind === 'rock' ? 8 : o.kind === 'stump' ? 7 : 6;
  g.circle(0, 0, size).fill({ color: kindColor[o.kind] }).stroke({ color: 0x1a0a00, width: 1 });
  c.addChild(g);
  // HP バー（上に）
  const pct = Math.max(0, o.hp / o.maxHp);
  const bw = 14;
  const bar = new Graphics();
  bar.rect(-bw / 2, -size - 5, bw, 2).fill({ color: 0x000000, alpha: 0.5 });
  bar.rect(-bw / 2, -size - 5, bw * pct, 2).fill({ color: 0xff7a3a });
  c.addChild(bar);
  c.position.set(o.pos.x, o.pos.y);
  return c;
}

function seasonOverlay(season: Season): { color: number; alpha: number } {
  switch (season) {
    case 'spring': return { color: 0xfff4d8, alpha: 0.05 };
    case 'summer': return { color: 0xffe28a, alpha: 0.08 };
    case 'autumn': return { color: 0xc98039, alpha: 0.11 };
    case 'winter': return { color: 0xc8d6ea, alpha: 0.12 };
  }
}


function buildingColor(id: string): number {
  switch (id) {
    case 'noukou': return 0xd9b873;
    case 'kouba': return 0xa9a9a9;
    case 'hakaba': return 0x8a7a6a;
    case 'taiko': return 0xc05a3a;
    case 'ubuya': return 0xfbc7d4; // 薄ピンク（産屋）
    default: return 0xbbbbbb;
  }
}
