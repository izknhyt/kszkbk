import { Application, Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import type { WorldState } from '../sim/world';
import type { Chibiwafu, Season } from '../types';
import { BUILDINGS } from '../city/buildings';
import { NPC_DEFS, type NpcId, type NpcState } from '../sim/npcs';
import type { Bubble } from '../sim/bubbles';
import { frameFor, loadSpriteLibrary, type SpriteLibrary } from './sprites';

const SEASON_COLORS: Record<Season, { grass: number; dirt: number; river: number; accents: number }> = {
  spring: { grass: 0xc8b383, dirt: 0xddcca0, river: 0x8a6a42, accents: 0xf5b6c0 },
  summer: { grass: 0xb2c66f, dirt: 0xd3c37c, river: 0x6a5028, accents: 0xffd35a },
  autumn: { grass: 0xc18a4d, dirt: 0xb77338, river: 0x7a5222, accents: 0xd8572a },
  winter: { grass: 0xd8d8de, dirt: 0xc2c0c6, river: 0x556680, accents: 0xffffff },
};

export interface StageHandle {
  app: Application;
  resize: (w: number, h: number) => void;
  draw: (world: WorldState) => void;
  setSeason: (s: Season) => void;
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

  const bgLayer = new Container();
  const buildingLayer = new Container();
  const eventUnderLayer = new Container(); // 下レイヤ（ring／disk）
  const corpseLayer = new Container();
  const chibiLayer = new Container();
  const npcLayer = new Container();
  const fxLayer = new Container();
  const eventOverLayer = new Container(); // 上レイヤ（火炎／粉塵）
  app.stage.addChild(
    bgLayer, buildingLayer, eventUnderLayer, corpseLayer, chibiLayer, npcLayer, fxLayer, eventOverLayer,
  );

  const lib = await loadSpriteLibrary('/chibiwafu.png');

  let currentSeason: Season = 'spring';
  drawBackground(bgLayer, app.renderer.width, app.renderer.height, currentSeason);
  const furana = drawFurana();
  fxLayer.addChild(furana);

  const views = new Map<number, ChibiView>();
  const corpseViews = new Map<number, Sprite>();
  const buildingViews: Container[] = [];
  const npcViews = new Map<NpcId, Container>();
  const bubbleViews = new Map<number, BubbleView>();

  function resize(w: number, h: number) {
    bgLayer.removeChildren();
    drawBackground(bgLayer, w, h, currentSeason);
  }

  function setSeason(s: Season) {
    if (s === currentSeason) return;
    currentSeason = s;
    bgLayer.removeChildren();
    drawBackground(bgLayer, app.renderer.width, app.renderer.height, currentSeason);
  }

  function draw(world: WorldState) {
    setSeason(world.season);
    furana.position.set(world.furanaPos.x, world.furanaPos.y);

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
      const g = new Graphics();
      g.rect(-24, -20, 48, 40).fill({ color: buildingColor(b.defId) }).stroke({ color: 0x3a2a1a, width: 2 });
      g.poly([-28, -20, 0, -36, 28, -20]).fill({ color: 0x8b5a2b }).stroke({ color: 0x3a2a1a, width: 2 });
      const t = new Text({
        text: def?.name.split('（')[0] ?? b.defId,
        style: new TextStyle({ fontFamily: 'sans-serif', fontSize: 10, fill: 0x3a2a1a }),
      });
      t.anchor.set(0.5, 0);
      t.position.set(0, 22);
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
      // 音頭中は全ちびわふが個体位相で揺れる（演出のみ、sim pos は不変）。
      const wx = ondoWobble ? Math.sin(world.timeSec * 6 + c.id * 0.7) * 8 : 0;
      const wy = ondoWobble ? Math.abs(Math.cos(world.timeSec * 6 + c.id * 0.7)) * -3 : 0;
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

  return { app, resize, draw, setSeason };
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
    default: return 0xbbbbbb;
  }
}
