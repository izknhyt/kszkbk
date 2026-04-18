import { Application, Container, Graphics, Rectangle, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import type { WorldState } from '../sim/world';
import type { Chibiwafu, DayPhase, HitTarget, PlacedBuilding, Season } from '../types';
import { BUILDINGS } from '../city/buildings';
import { NPC_DEFS, type NpcId, type NpcState } from '../sim/npcs';
import type { Bubble } from '../sim/bubbles';
import { TRAIT_DEFS } from '../sim/traits';
import { CONFIG } from '../config';
import { landmarkActive, type Landmark, type LandmarkKind } from '../sim/landmarks';
import { frameFor, loadSpriteLibrary, type SpriteLibrary } from './sprites';

const SEASON_COLORS: Record<Season, { grass: number; dirt: number; river: number; accents: number }> = {
  spring: { grass: 0xc8b383, dirt: 0xddcca0, river: 0x8a6a42, accents: 0xf5b6c0 },
  summer: { grass: 0xb2c66f, dirt: 0xd3c37c, river: 0x6a5028, accents: 0xffd35a },
  autumn: { grass: 0xc18a4d, dirt: 0xb77338, river: 0x7a5222, accents: 0xd8572a },
  winter: { grass: 0xd8d8de, dirt: 0xc2c0c6, river: 0x556680, accents: 0xffffff },
};

// 位相ティント：画面全体に薄い色を被せて時刻感を出す。
// 昼は tint しない。朝=桃 / 夕=橙 / 夜=紺 を alpha 低めで重ねる。
const DAY_PHASE_TINT: Record<DayPhase, { color: number; alpha: number }> = {
  morning: { color: 0xffc7b3, alpha: 0.12 },
  noon:    { color: 0xffffff, alpha: 0.00 },
  evening: { color: 0xff8b3d, alpha: 0.18 },
  night:   { color: 0x1a2550, alpha: 0.34 },
};

export interface StageHandle {
  app: Application;
  resize: (w: number, h: number) => void;
  draw: (world: WorldState) => void;
  setSeason: (s: Season) => void;
  // カメラ状態（HUDからの操作用に露出）
  resetCamera: () => void;
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
  landmarkFrames: Partial<Record<LandmarkKind, Texture>>;
}

const BUILDING_FRAME_ORDER: PlacedBuilding['defId'][] = ['noukou', 'kouba', 'hakaba', 'taiko', 'ubuya'];
const LANDMARK_FRAME_ORDER: LandmarkKind[] = [
  'stonebread_rock',
  'philosophy_stone',
  'mudwater_pool',
  'beer_barrel',
  'flower_patch',
  'kusozako_totem',
];

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

  // --- カメラ ----------------------------------------------------------------
  // 全ゲームレイヤは cameraLayer の中に入れ、transform でスクロール＆ズームする。
  // HUD はHTML側にあるので、ここでは canvas 内部だけ考えればよい。
  const cameraLayer = new Container();
  app.stage.addChild(cameraLayer);

  const bgLayer = new Container();
  const landmarkLayer = new Container();
  const buildingLayer = new Container();
  const eventUnderLayer = new Container(); // 下レイヤ（ring／disk）
  const corpseLayer = new Container();
  const chibiLayer = new Container();
  const npcLayer = new Container();
  const fxLayer = new Container();
  const eventOverLayer = new Container(); // 上レイヤ（火炎／粉塵）
  cameraLayer.addChild(
    bgLayer, landmarkLayer, buildingLayer, eventUnderLayer, corpseLayer, chibiLayer, npcLayer, fxLayer, eventOverLayer,
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

  function fitCameraToViewport() {
    const vw = app.renderer.width;
    const vh = app.renderer.height;
    const fit = Math.min(vw / currentBoundsW, vh / currentBoundsH);
    cameraScale = clamp(fit, CONFIG.CAMERA_MIN_SCALE, CONFIG.CAMERA_MAX_SCALE);
    cameraX = 0;
    cameraY = 0;
    clampCamera();
    applyCamera();
  }
  fitCameraToViewport();

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
      // 空クリック（何もない場所を左クリック）— 現状は何もしない
    }
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', endPointer);

  const views = new Map<number, ChibiView>();
  const corpseViews = new Map<number, Sprite>();
  const buildingViews: Container[] = [];
  const npcViews = new Map<NpcId, NpcView>();
  const bubbleViews = new Map<number, BubbleView>();

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
    bgLayer.removeChildren();
    drawBackground(bgLayer, currentBoundsW, currentBoundsH, currentSeason, envArt);
  }

  // 村Lv 上昇でワールド寸法が広がったら背景を描き直す。頻度は稀（Lv up 時のみ）。
  function setBounds(w: number, h: number) {
    if (w === currentBoundsW && h === currentBoundsH) return;
    currentBoundsW = w;
    currentBoundsH = h;
    bgLayer.removeChildren();
    drawBackground(bgLayer, currentBoundsW, currentBoundsH, currentSeason, envArt);
    clampCamera();
    applyCamera();
  }

  function draw(world: WorldState) {
    setSeason(world.season);
    setBounds(world.bounds.w, world.bounds.h);
    drawPhaseTint(world.dayPhase);

    // landmarks (描き直しは季節が変わった時のみ。ここでは常時再描画して単純化)
    landmarkLayer.removeChildren();
    for (const lm of world.landmarks) {
      if (!landmarkActive(lm, world.season)) continue;
      landmarkLayer.addChild(drawLandmark(lm, envArt));
    }

    // buildings
    while (buildingViews.length < world.buildings.length) {
      const v = new Container();
      buildingLayer.addChild(v);
      buildingViews.push(v);
    }
    while (buildingViews.length > world.buildings.length) {
      const v = buildingViews.pop()!;
      v.destroy({ children: true });
    }
    for (let i = 0; i < world.buildings.length; i++) {
      const b = world.buildings[i]!;
      const def = BUILDINGS[b.defId];
      const v = buildingViews[i]!;
      v.removeChildren();
      const structure = drawBuildingStructure(b, def?.name.split('（')[0] ?? b.defId, envArt);
      v.addChild(structure);
      v.position.set(b.pos.x, b.pos.y);
    }

    // corpses
    for (const c of world.corpses) {
      if (!corpseViews.has(c.id)) {
        const s = new Sprite(frameFor(lib, 'dead'));
        s.anchor.set(0.5, 0.9);
        s.scale.set(calcScale(lib));
        s.alpha = 0.85;
        s.position.set(c.pos.x, c.pos.y);
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
      if (v.sprite) {
        v.sprite.texture = frameFor(furanaLib, n.state);
        const baseScale = 60 / Math.max(1, v.sprite.texture.height);
        v.sprite.scale.x = (n.faceLeft ? -1 : 1) * baseScale;
        v.sprite.scale.y = baseScale;
      }
      // 死亡中は薄くする
      v.container.alpha = n.dead ? 0.35 : 1.0;
      // フラナは絵が既に "dead" ポーズなので回転させない。他NPC（ココン等）は従来通り倒す
      v.container.rotation = n.dead && n.id !== 'furana' ? Math.PI * 0.5 : 0;
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

    // depth sort by y
    chibiLayer.children.sort((a, b) => a.y - b.y);
    corpseLayer.children.sort((a, b) => a.y - b.y);
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
    resetCamera: fitCameraToViewport,
    screenToWorld,
    setHitTest,
  };
}

function renderEventOverlay(under: Container, over: Container, world: WorldState) {
  under.removeChildren();
  over.removeChildren();

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
    landmarkFrames: {},
  };

  try {
    const background = await loadImage('/mockup/background.png');
    art.background = Texture.from(background);
  } catch (err) {
    console.warn('[stage] background art load failed, falling back to procedural background', err);
  }

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

  try {
    const propsSheet = await loadImage('/mockup/props.png');
    const base = textureFromProcessedCanvas(propsSheet);
    const cols = 3;
    const rows = 3;
    const cellW = Math.floor(propsSheet.width / cols);
    const cellH = Math.floor(propsSheet.height / rows);
    LANDMARK_FRAME_ORDER.forEach((kind, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      art.landmarkFrames[kind] = new Texture({
        source: base.source,
        frame: new Rectangle(col * cellW, row * cellH, cellW, cellH),
      });
    });
  } catch (err) {
    console.warn('[stage] landmark art load failed, keeping procedural landmarks', err);
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
  const text = new Text({
    text: b.text,
    style: new TextStyle({
      fontFamily: 'sans-serif',
      fontSize: b.kind === 'stomp' ? 10 : 11,
      fill: b.kind === 'stomp' ? 0x6a4a22 : 0x3a2a1a,
      fontWeight: 'bold',
    }),
  });
  text.anchor.set(0.5, 1);
  const bg = new Graphics();
  const w = text.width + 10;
  const h = text.height + 6;
  bg.roundRect(-w / 2, -h - 2, w, h, 4)
    .fill({ color: b.kind === 'stomp' ? 0xfff1c8 : 0xffffff, alpha: 0.9 })
    .stroke({ color: 0x3a2a1a, width: 1 });
  text.position.set(0, -4);
  container.addChild(bg, text);
  return { text, bg, container };
}

// フラナ（スプライト描画）の Sprite への参照を保持する map。
// 毎tick render で state に応じてフレーム差し替え。
interface NpcView {
  container: Container;
  sprite?: Sprite;  // フラナのみ
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
    // 画像ベースのフラナ。ちびわふ 48px に対して少し大きめの 60px を目安にする。
    const spr = new Sprite(frameFor(furanaLib, n.state));
    const targetH = 60;
    const scale = targetH / Math.max(1, spr.texture.height);
    spr.scale.set(scale);
    spr.anchor.set(0.5, 0.85);
    label.position.set(0, -targetH * 0.8);
    c.addChild(spr, label);
    return { container: c, sprite: spr };
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
  layer.removeChildren();
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

  const palette = SEASON_COLORS[season];
  const grass = new Graphics();
  grass.rect(0, 0, w, h).fill({ color: palette.grass });
  layer.addChild(grass);

  const morningGlow = new Graphics();
  morningGlow.ellipse(w * 0.24, h * 0.16, w * 0.28, h * 0.16).fill({ color: 0xfff2cc, alpha: 0.18 });
  layer.addChild(morningGlow);

  const upperMeadow = new Graphics();
  upperMeadow.ellipse(w * 0.25, h * 0.22, w * 0.22, h * 0.12).fill({ color: 0xd9d08e, alpha: 0.28 });
  upperMeadow.ellipse(w * 0.78, h * 0.17, w * 0.18, h * 0.11).fill({ color: 0xb0c985, alpha: 0.24 });
  upperMeadow.ellipse(w * 0.52, h * 0.48, w * 0.35, h * 0.14).fill({ color: 0xcbd792, alpha: 0.2 });
  layer.addChild(upperMeadow);

  const cropBeds = new Graphics();
  for (let i = 0; i < 5; i++) {
    const x = 90 + i * (w * 0.12);
    cropBeds.roundRect(x, 88 + (i % 2) * 8, w * 0.1, 48, 10).fill({ color: i % 2 === 0 ? 0xa3b85e : 0x8ca04d, alpha: 0.52 });
    cropBeds.roundRect(x + 8, 98 + (i % 2) * 8, w * 0.1 - 16, 6, 4).fill({ color: 0xd8c085, alpha: 0.4 });
    cropBeds.roundRect(x + 8, 112 + (i % 2) * 8, w * 0.1 - 16, 6, 4).fill({ color: 0xd8c085, alpha: 0.32 });
  }
  layer.addChild(cropBeds);

  const commons = new Graphics();
  commons.ellipse(w * 0.54, h * 0.34, w * 0.32, h * 0.17).fill({ color: palette.dirt, alpha: 0.95 });
  commons.ellipse(w * 0.5, h * 0.33, w * 0.18, h * 0.09).fill({ color: 0xf1e0bb, alpha: 0.85 });
  commons.ellipse(w * 0.68, h * 0.3, w * 0.11, h * 0.06).fill({ color: 0xe9d0a4, alpha: 0.75 });
  layer.addChild(commons);

  const roads = new Graphics();
  roads.ellipse(w * 0.46, 318, w * 0.18, 26).fill({ color: 0xe7d5af, alpha: 0.86 });
  roads.rotation = -0.08;
  const bridgeRoad = new Graphics();
  bridgeRoad.ellipse(220, 390, 150, 24).fill({ color: 0xe7d5af, alpha: 0.9 });
  bridgeRoad.rotation = -0.28;
  layer.addChild(roads, bridgeRoad);

  const river = new Graphics();
  river.rect(0, 420, w, h - 420).fill({ color: palette.river });
  river.rect(0, 420, w, 4).fill({ color: 0x3a2a1a, alpha: 0.25 });
  for (let i = 0; i < 12; i++) {
    river.ellipse(80 + i * 86, 458 + (i % 3) * 18, 22, 4).fill({ color: 0xf5e8c8, alpha: 0.22 });
  }
  layer.addChild(river);

  const shoreline = new Graphics();
  shoreline.rect(0, 412, w, 12).fill({ color: 0xe6d8b9, alpha: 0.92 });
  for (let i = 0; i < 18; i++) {
    shoreline.circle(20 + i * (w / 18), 421 + (i % 2) * 2, 5).fill({ color: 0xfaf3e1, alpha: 0.45 });
  }
  layer.addChild(shoreline);

  const bridge = new Graphics();
  bridge.roundRect(186, 410, 28, 90, 6).fill({ color: 0x81532c }).stroke({ color: 0x3a2a1a, width: 1.5 });
  for (let i = 0; i < 6; i++) {
    bridge.rect(189, 420 + i * 12, 22, 4).fill({ color: 0xb78853 });
  }
  bridge.rect(189, 410, 4, 90).fill({ color: 0x65411f });
  bridge.rect(207, 410, 4, 90).fill({ color: 0x65411f });
  layer.addChild(bridge);

  for (let i = 0; i < 14; i++) {
    const flowers = new Graphics();
    const x = 70 + (i * 83) % (w - 120);
    const y = 70 + ((i * 47) % 320);
    flowers.circle(x, y, 4).fill({ color: palette.accents, alpha: 0.5 });
    flowers.circle(x + 9, y - 4, 3).fill({ color: 0xfff3d8, alpha: 0.45 });
    flowers.circle(x - 7, y + 5, 2.5).fill({ color: 0xbad27d, alpha: 0.45 });
    layer.addChild(flowers);
  }

  for (let i = 0; i < 9; i++) {
    const stones = new Graphics();
    const x = 90 + i * 105;
    const y = 386 - (i % 2) * 18;
    stones.ellipse(x, y, 12, 7).fill({ color: 0xb7aa9b, alpha: 0.55 });
    stones.ellipse(x + 12, y + 4, 8, 5).fill({ color: 0x938579, alpha: 0.4 });
    layer.addChild(stones);
  }

  const vignette = new Graphics();
  vignette.rect(0, 0, w, 24).fill({ color: 0x000000, alpha: 0.04 });
  vignette.rect(0, h - 34, w, 34).fill({ color: 0x000000, alpha: 0.08 });
  vignette.rect(0, 0, 24, h).fill({ color: 0x000000, alpha: 0.035 });
  vignette.rect(w - 24, 0, 24, h).fill({ color: 0x000000, alpha: 0.035 });
  layer.addChild(vignette);
}

function drawLandmark(lm: Landmark, envArt: EnvironmentArt): Container {
  const c = new Container();
  c.position.set(lm.pos.x, lm.pos.y);
  c.addChild(drawGroundShadow(18, 6, 9, 0.14));
  const artTexture = envArt.landmarkFrames[lm.kind];
  if (artTexture) {
    const sprite = new Sprite(artTexture);
    sprite.anchor.set(0.5, 0.7);
    sprite.scale.set(52 / Math.max(artTexture.width, 1));
    c.addChild(sprite);
  } else {
    const g = new Graphics();
    switch (lm.kind) {
      case 'stonebread_rock': {
        g.ellipse(0, 0, 24, 14).fill({ color: 0x8c8378 }).stroke({ color: 0x3a2a1a, width: 2 });
        g.ellipse(-8, -8, 11, 7).fill({ color: 0x6d6050 }).stroke({ color: 0x3a2a1a, width: 1 });
        g.roundRect(-10, -18, 20, 7, 3).fill({ color: 0xd0a36a }).stroke({ color: 0x3a2a1a, width: 1 });
        g.rect(-8, -18, 16, 2).fill({ color: 0x8f5a2e, alpha: 0.7 });
        break;
      }
      case 'philosophy_stone': {
        g.roundRect(-9, -26, 18, 30, 5).fill({ color: 0x6e6b79 }).stroke({ color: 0x3a2a1a, width: 2 });
        g.rect(-5, -18, 10, 3).fill({ color: 0x353744 });
        g.circle(0, -7, 2).fill({ color: 0xf0e8d2 });
        break;
      }
      case 'mudwater_pool': {
        g.ellipse(0, 0, 30, 12).fill({ color: 0x5c4422, alpha: 0.9 }).stroke({ color: 0x3a2a1a, width: 1 });
        g.ellipse(-7, -3, 9, 3).fill({ color: 0x8a6a42, alpha: 0.5 });
        g.circle(9, -2, 2).fill({ color: 0xdcbf87, alpha: 0.55 });
        break;
      }
      case 'beer_barrel': {
        g.rect(-10, -14, 20, 22).fill({ color: 0x8a5a2b }).stroke({ color: 0x3a2a1a, width: 2 });
        g.rect(-10, -10, 20, 2).fill({ color: 0x3a2a1a });
        g.rect(-10, 2, 20, 2).fill({ color: 0x3a2a1a });
        g.ellipse(0, -14, 10, 3).fill({ color: 0x4a3422 });
        g.circle(12, -4, 3).fill({ color: 0xf2e2ad });
        break;
      }
      case 'flower_patch': {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const x = Math.cos(a) * 8;
          const y = Math.sin(a) * 6;
          g.circle(x, y, 3).fill({ color: 0xf5b6c0 });
          g.circle(x, y, 1).fill({ color: 0xffd35a });
        }
        g.circle(0, 0, 2).fill({ color: 0x9abf61 });
        break;
      }
      case 'kusozako_totem': {
        g.rect(-2, -30, 4, 34).fill({ color: 0x6b4a2b }).stroke({ color: 0x3a2a1a, width: 1 });
        g.rect(-8, -30, 16, 6).fill({ color: 0xe8735a }).stroke({ color: 0x3a2a1a, width: 1 });
        g.rect(-6, -18, 12, 4).fill({ color: 0xffd35a }).stroke({ color: 0x3a2a1a, width: 1 });
        break;
      }
    }
    c.addChild(g);
  }
  const label = new Text({
    text: lm.label,
    style: new TextStyle({ fontFamily: 'sans-serif', fontSize: 9, fill: 0x3a2a1a, fontStyle: 'italic' }),
  });
  label.anchor.set(0.5, 0);
  label.position.set(0, 12);
  label.alpha = 0.6;
  c.addChild(label);
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
