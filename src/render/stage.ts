import { Application, Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import type { WorldState } from '../sim/world';
import type { Chibiwafu, DayPhase, Season } from '../types';
import { BUILDINGS } from '../city/buildings';
import { NPC_DEFS, type NpcId, type NpcState } from '../sim/npcs';
import type { Bubble } from '../sim/bubbles';
import { TRAIT_DEFS } from '../sim/traits';
import { CONFIG } from '../config';
import { landmarkActive, type Landmark } from '../sim/landmarks';
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
  // pointerdown 位置（world座標）にあるちびわふIDを返す callback を登録。
  // null を返すとその位置にはちびわふがいない → カメラパン or 空クリックに倒される。
  setHitTest: (fn: (wx: number, wy: number) => number | null) => void;
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

  const lib = await loadSpriteLibrary('/chibiwafu.png');

  let currentSeason: Season = 'spring';
  drawBackground(bgLayer, CONFIG.WORLD_W, CONFIG.WORLD_H, currentSeason);
  const furana = drawFurana();
  fxLayer.addChild(furana);

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
    const ww = CONFIG.WORLD_W * cameraScale;
    const wh = CONFIG.WORLD_H * cameraScale;
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
    const fit = Math.min(vw / CONFIG.WORLD_W, vh / CONFIG.WORLD_H);
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
    const id = hitTest ? hitTest(wp.x, wp.y) : null;
    const ev = new CustomEvent('kszk-inspect', {
      detail: { chibiId: id, clientX: e.clientX, clientY: e.clientY, rect },
    });
    canvas.dispatchEvent(ev);
  });

  let hitTest: ((wx: number, wy: number) => number | null) | null = null;
  function setHitTest(fn: (wx: number, wy: number) => number | null) { hitTest = fn; }

  type PointerMode = 'pan' | 'chibi-drag';
  let pointerState: {
    pointerId: number;
    mode: PointerMode;
    lastX: number;
    lastY: number;
    startX: number;
    startY: number;
    moved: boolean;
    button: number;
    chibiId: number | null;
  } | null = null;

  canvas.addEventListener('pointerdown', (e) => {
    // 右クリックは contextmenu で処理済み
    if (e.button === 2) return;
    canvas.setPointerCapture(e.pointerId);
    const wp = screenToWorld(e.clientX, e.clientY);
    const id = hitTest ? hitTest(wp.x, wp.y) : null;
    pointerState = {
      pointerId: e.pointerId,
      mode: id != null ? 'chibi-drag' : 'pan',
      lastX: e.clientX,
      lastY: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      button: e.button,
      chibiId: id,
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
    } else if (pointerState.mode === 'chibi-drag' && pointerState.chibiId != null && pointerState.moved) {
      const wp = screenToWorld(e.clientX, e.clientY);
      const ev = new CustomEvent('kszk-chibi-drag', {
        detail: { chibiId: pointerState.chibiId, worldX: wp.x, worldY: wp.y },
      });
      canvas.dispatchEvent(ev);
    }
  });

  const endPointer = (e: PointerEvent) => {
    if (!pointerState || pointerState.pointerId !== e.pointerId) return;
    canvas.releasePointerCapture(e.pointerId);
    const s = pointerState;
    pointerState = null;
    if (s.mode === 'chibi-drag' && s.chibiId != null) {
      const wp = screenToWorld(e.clientX, e.clientY);
      if (s.moved) {
        const ev = new CustomEvent('kszk-chibi-drop', {
          detail: { chibiId: s.chibiId, worldX: wp.x, worldY: wp.y },
        });
        canvas.dispatchEvent(ev);
      } else {
        // 左クリックで殴る
        const ev = new CustomEvent('kszk-chibi-punch', { detail: { chibiId: s.chibiId } });
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
  const npcViews = new Map<NpcId, Container>();
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
    drawBackground(bgLayer, CONFIG.WORLD_W, CONFIG.WORLD_H, currentSeason);
  }

  function draw(world: WorldState) {
    setSeason(world.season);
    drawPhaseTint(world.dayPhase);
    furana.position.set(world.furanaPos.x, world.furanaPos.y);

    // landmarks (描き直しは季節が変わった時のみ。ここでは常時再描画して単純化)
    landmarkLayer.removeChildren();
    for (const lm of world.landmarks) {
      if (!landmarkActive(lm, world.season)) continue;
      landmarkLayer.addChild(drawLandmark(lm));
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
      // sqrt スケーリング：Lv1=1.0×, Lv5=1.3×, Lv10=1.45×, Lv99=2.49×
      const s = 1 + Math.sqrt(Math.max(0, b.level - 1)) * 0.15;
      const g = new Graphics();
      g.rect(-24 * s, -20 * s, 48 * s, 40 * s).fill({ color: buildingColor(b.defId) }).stroke({ color: 0x3a2a1a, width: 2 });
      g.poly([-28 * s, -20 * s, 0, -36 * s, 28 * s, -20 * s]).fill({ color: 0x8b5a2b }).stroke({ color: 0x3a2a1a, width: 2 });
      // Lv2+ は旗
      if (b.level >= 2) {
        g.rect(0, -36 * s - 12, 2, 12).fill({ color: 0x3a2a1a });
        g.rect(2, -36 * s - 12, 10, 7).fill({ color: 0xe8735a });
      }
      // Lv5+ で二段屋根
      if (b.level >= 5) {
        g.poly([-20 * s, -36 * s, 0, -46 * s, 20 * s, -36 * s]).fill({ color: 0xc05a3a }).stroke({ color: 0x3a2a1a, width: 1 });
      }
      // Lv10+ で屋根に金箔
      if (b.level >= 10) {
        g.circle(0, -46 * s, 4).fill({ color: 0xffd35a }).stroke({ color: 0x3a2a1a, width: 1 });
      }
      // Lv30+ で紫オーラ
      if (b.level >= 30) {
        g.circle(0, -20 * s, 8).fill({ color: 0x9b6de2, alpha: 0.5 });
      }
      // Lv50+ で複数の金飾り
      if (b.level >= 50) {
        g.circle(-14 * s, -36 * s, 3).fill({ color: 0xffd35a });
        g.circle(14 * s, -36 * s, 3).fill({ color: 0xffd35a });
      }
      // Lv99 で虹色リング
      if (b.level >= 99) {
        g.circle(0, 0, 32 * s).stroke({ color: 0xff66aa, width: 2, alpha: 0.6 });
      }
      const t = new Text({
        text: `${def?.name.split('（')[0] ?? b.defId} Lv${b.level}`,
        style: new TextStyle({ fontFamily: 'sans-serif', fontSize: 10, fill: 0x3a2a1a }),
      });
      t.anchor.set(0.5, 0);
      t.position.set(0, 22 * s);
      v.addChild(g, t);
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
        v = drawNpc(n);
        npcLayer.addChild(v);
        npcViews.set(n.id, v);
      }
      v.position.set(n.pos.x, n.pos.y);
      // 死亡中は薄くする（ココン専用）
      v.alpha = n.dead ? 0.25 : 1.0;
      v.rotation = n.dead ? Math.PI * 0.5 : 0; // 倒れてる表現
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

function drawNpc(n: NpcState): Container {
  const def = NPC_DEFS[n.id];
  const c = new Container();
  const body = new Graphics();
  const s = def.scale;
  body.ellipse(0, 0, 22 * s, 28 * s).fill({ color: def.color }).stroke({ color: 0x3a2a1a, width: 2 });
  body.ellipse(-14 * s, -16 * s, 5 * s, 8 * s).fill({ color: def.color }).stroke({ color: 0x3a2a1a, width: 1 });
  body.ellipse(14 * s, -16 * s, 5 * s, 8 * s).fill({ color: def.color }).stroke({ color: 0x3a2a1a, width: 1 });
  body.circle(-6 * s, -4 * s, 2.5 * s).fill({ color: 0x3a2a1a });
  body.circle(6 * s, -4 * s, 2.5 * s).fill({ color: 0x3a2a1a });
  // accent: suzu gets a ribbon, cocoon gets a stick, lou gets nothing extra
  if (n.id === 'suzu') {
    body.rect(-4 * s, -22 * s, 8 * s, 4 * s).fill({ color: def.secondaryColor });
  } else if (n.id === 'cocoon') {
    body.rect(14 * s, -4 * s, 16 * s, 2).fill({ color: 0x6b4a2b });
  }
  const label = new Text({
    text: def.name,
    style: new TextStyle({ fontFamily: 'sans-serif', fontSize: 11, fontWeight: 'bold', fill: 0x3a2a1a }),
  });
  label.anchor.set(0.5, 1);
  label.position.set(0, -28);
  c.addChild(body, label);
  return c;
}

function drawBackground(layer: Container, w: number, h: number, season: Season) {
  layer.removeChildren();
  const palette = SEASON_COLORS[season];
  const grass = new Graphics();
  grass.rect(0, 0, w, h).fill({ color: palette.grass });
  layer.addChild(grass);

  const dirt = new Graphics();
  dirt.ellipse(w * 0.55, h * 0.35, w * 0.45, h * 0.3).fill({ color: palette.dirt });
  layer.addChild(dirt);

  const river = new Graphics();
  river.rect(0, 420, w, h - 420).fill({ color: palette.river });
  river.rect(0, 420, w, 4).fill({ color: 0x3a2a1a, alpha: 0.35 });
  layer.addChild(river);

  const bridge = new Graphics();
  bridge.rect(188, 414, 24, 80).fill({ color: 0x8b5a2b }).stroke({ color: 0x3a2a1a, width: 1 });
  layer.addChild(bridge);

  for (let i = 0; i < 18; i++) {
    const tuft = new Graphics();
    const x = Math.random() * w;
    const y = Math.random() * 400;
    tuft.circle(x, y, 3 + Math.random() * 5).fill({ color: palette.accents, alpha: 0.45 });
    layer.addChild(tuft);
  }
}

function drawLandmark(lm: Landmark): Container {
  const c = new Container();
  c.position.set(lm.pos.x, lm.pos.y);
  const g = new Graphics();
  switch (lm.kind) {
    case 'stonebread_rock': {
      // ゴツゴツの岩＋乗った石パン
      g.ellipse(0, 0, 22, 14).fill({ color: 0x888077 }).stroke({ color: 0x3a2a1a, width: 2 });
      g.ellipse(-6, -8, 10, 6).fill({ color: 0x7a6a55 }).stroke({ color: 0x3a2a1a, width: 1 });
      g.rect(-7, -16, 14, 6).fill({ color: 0xc9a36b }).stroke({ color: 0x3a2a1a, width: 1 });
      break;
    }
    case 'philosophy_stone': {
      // 背の高い縦長の石（哲学的）
      g.rect(-8, -24, 16, 28).fill({ color: 0x666677 }).stroke({ color: 0x3a2a1a, width: 2 });
      g.rect(-4, -20, 8, 4).fill({ color: 0x333344 });
      break;
    }
    case 'mudwater_pool': {
      g.ellipse(0, 0, 28, 10).fill({ color: 0x5c4422, alpha: 0.9 }).stroke({ color: 0x3a2a1a, width: 1 });
      g.ellipse(-5, -3, 8, 2).fill({ color: 0x8a6a42, alpha: 0.5 });
      break;
    }
    case 'beer_barrel': {
      g.rect(-10, -14, 20, 22).fill({ color: 0x8a5a2b }).stroke({ color: 0x3a2a1a, width: 2 });
      g.rect(-10, -10, 20, 2).fill({ color: 0x3a2a1a });
      g.rect(-10, 2, 20, 2).fill({ color: 0x3a2a1a });
      g.ellipse(0, -14, 10, 3).fill({ color: 0x4a3422 });
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
      break;
    }
    case 'kusozako_totem': {
      // 中央にぽつんと立つ棒（村の象徴）
      g.rect(-2, -30, 4, 34).fill({ color: 0x6b4a2b }).stroke({ color: 0x3a2a1a, width: 1 });
      g.rect(-8, -30, 16, 6).fill({ color: 0xe8735a }).stroke({ color: 0x3a2a1a, width: 1 });
      break;
    }
  }
  c.addChild(g);
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

function drawFurana(): Container {
  const c = new Container();
  const body = new Graphics();
  body.ellipse(0, 0, 28, 34).fill({ color: 0xfff5de }).stroke({ color: 0x3a2a1a, width: 2 });
  body.rect(-14, 8, 28, 12).fill({ color: 0xffffff }).stroke({ color: 0x3a2a1a, width: 1 });
  body.circle(-8, -6, 3).fill({ color: 0x3a2a1a });
  body.circle(8, -6, 3).fill({ color: 0x3a2a1a });
  body.ellipse(-18, -18, 6, 10).fill({ color: 0xfff5de }).stroke({ color: 0x3a2a1a, width: 2 });
  body.ellipse(18, -18, 6, 10).fill({ color: 0xfff5de }).stroke({ color: 0x3a2a1a, width: 2 });
  const label = new Text({
    text: 'フラナ',
    style: new TextStyle({ fontFamily: 'sans-serif', fontSize: 11, fontWeight: 'bold', fill: 0xe8735a }),
  });
  label.anchor.set(0.5, 1);
  label.position.set(0, -40);
  c.addChild(body, label);
  return c;
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
