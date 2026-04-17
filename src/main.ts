import { createStage } from './render/stage';
import { bindUI, refreshUI, type UICallbacks } from './render/ui';
import {
  buildAt,
  createWorld,
  forceSpawn,
  tickWorld,
  triggerBokaigi,
  triggerFire,
  triggerOndo,
} from './sim/world';
import { clearSave, load, save } from './meta/save';
import { CONFIG, type TimeScale } from './config';

async function start() {
  const host = document.getElementById('stage') as HTMLElement;
  const rect = host.getBoundingClientRect();
  const world = createWorld({ w: Math.max(600, rect.width), h: Math.max(500, rect.height) });
  load(world);

  const stage = await createStage(host);
  stage.app.renderer.on('resize', (w: number, h: number) => {
    world.bounds = { w, h };
    stage.resize(w, h);
  });

  let timeScale: TimeScale = 1;

  const cb: UICallbacks = {
    onBuild: (id) => {
      if (buildAt(world, id)) refreshUI(world, cb);
    },
    onOndo: () => triggerOndo(world),
    onBokaigi: () => triggerBokaigi(world),
    onFire: () => triggerFire(world),
    onSpawn: () => forceSpawn(world),
    onSave: () => {
      save(world);
      flashToast('セーブしました');
    },
    onReset: () => {
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
  const dtFixed = CONFIG.TICK_DT;
  let acc = 0;
  let prev = performance.now();

  function loop(now: number) {
    const dtReal = Math.min(0.2, (now - prev) / 1000);
    prev = now;
    acc += dtReal * timeScale;
    // cap ticks per frame so huge timeScales don't freeze the browser
    let steps = 0;
    const maxSteps = 256;
    while (acc >= dtFixed && steps < maxSteps) {
      tickWorld(world, dtFixed);
      acc -= dtFixed;
      steps += 1;
    }
    if (acc > dtFixed * maxSteps) acc = 0;
    stage.draw(world);

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

  window.addEventListener('beforeunload', () => save(world));
}

function flashToast(msg: string) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText =
    'position:fixed;top:10px;left:50%;transform:translateX(-50%);background:#3a2a1a;color:#fff;padding:6px 12px;border-radius:4px;z-index:9999;font-size:12px;';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

start().catch((err) => {
  console.error(err);
  const host = document.getElementById('stage');
  if (host) host.innerHTML = `<pre style="padding:12px;color:#a33">起動失敗: ${String(err)}</pre>`;
});
