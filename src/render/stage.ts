import { Application, Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import type { WorldState } from '../sim/world';
import type { Chibiwafu } from '../types';
import { BUILDINGS } from '../city/buildings';
import { frameFor, loadSpriteLibrary, type SpriteLibrary } from './sprites';

export interface StageHandle {
  app: Application;
  resize: (w: number, h: number) => void;
  draw: (world: WorldState) => void;
}

interface ChibiView {
  sprite: Sprite;
  label: Text;
  container: Container;
  lastState: string;
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
  const corpseLayer = new Container();
  const chibiLayer = new Container();
  const fxLayer = new Container();
  app.stage.addChild(bgLayer, buildingLayer, corpseLayer, chibiLayer, fxLayer);

  const lib = await loadSpriteLibrary('/chibiwafu.png');

  drawBackground(bgLayer, app.renderer.width, app.renderer.height);
  const furana = drawFurana();
  fxLayer.addChild(furana);

  const views = new Map<number, ChibiView>();
  const corpseViews = new Map<number, Sprite>();
  const buildingViews: Container[] = [];

  function resize(w: number, h: number) {
    bgLayer.removeChildren();
    drawBackground(bgLayer, w, h);
  }

  function draw(world: WorldState) {
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
    for (const c of world.chibis) {
      let v = views.get(c.id);
      if (!v) {
        v = createChibiView(c, lib);
        chibiLayer.addChild(v.container);
        views.set(c.id, v);
      }
      v.container.position.set(c.pos.x, c.pos.y);
      v.sprite.scale.x = (c.faceLeft ? -1 : 1) * calcScale(lib);
      if (v.lastState !== c.state) {
        v.sprite.texture = frameFor(lib, c.state);
        v.lastState = c.state;
      }
    }

    // depth sort by y
    chibiLayer.children.sort((a, b) => a.y - b.y);
    corpseLayer.children.sort((a, b) => a.y - b.y);
  }

  return { app, resize, draw };
}

function calcScale(lib: SpriteLibrary): number {
  if (!lib.hasSheet) return 1;
  const t = lib.frames[0]!;
  const target = 42;
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

function drawBackground(layer: Container, w: number, h: number) {
  layer.removeChildren();
  const grass = new Graphics();
  grass.rect(0, 0, w, h).fill({ color: 0xc8b383 });
  layer.addChild(grass);

  const dirt = new Graphics();
  dirt.ellipse(w * 0.55, h * 0.35, w * 0.45, h * 0.3).fill({ color: 0xd9c497 });
  layer.addChild(dirt);

  const river = new Graphics();
  river.rect(0, 420, w, h - 420).fill({ color: 0x8a6a42 });
  river.rect(0, 420, w, 4).fill({ color: 0x6a4a22 });
  layer.addChild(river);

  const bridge = new Graphics();
  bridge.rect(188, 414, 24, 80).fill({ color: 0x8b5a2b }).stroke({ color: 0x3a2a1a, width: 1 });
  layer.addChild(bridge);

  for (let i = 0; i < 14; i++) {
    const tuft = new Graphics();
    const x = Math.random() * w;
    const y = Math.random() * 400;
    tuft.circle(x, y, 4 + Math.random() * 4).fill({ color: 0xb5a070, alpha: 0.5 });
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
