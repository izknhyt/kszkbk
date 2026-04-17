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
import { DEATH_CAUSES } from './sim/deaths';

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
      flashToast('セーブしました', 'info');
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
