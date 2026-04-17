import { createStage } from './render/stage';
import { bindUI, refreshUI } from './render/ui';
import { buildAt, createWorld, tickWorld, triggerBokaigi, triggerOndo } from './sim/world';
import { load, save } from './meta/save';

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

  const cb = {
    onBuild: (id: string) => {
      if (buildAt(world, id)) refreshUI(world, cb);
    },
    onOndo: () => triggerOndo(world),
    onBokaigi: () => triggerBokaigi(world),
  };
  bindUI(world, cb);

  let lastSave = 0;
  let uiTimer = 0;
  const dtFixed = 1 / 20;
  let acc = 0;
  let prev = performance.now();

  function loop(now: number) {
    const dtReal = Math.min(0.2, (now - prev) / 1000);
    prev = now;
    acc += dtReal;
    while (acc >= dtFixed) {
      tickWorld(world, dtFixed);
      acc -= dtFixed;
    }
    stage.draw(world);

    uiTimer += dtReal;
    if (uiTimer >= 0.25) {
      refreshUI(world, cb);
      uiTimer = 0;
    }
    lastSave += dtReal;
    if (lastSave >= 5) {
      save(world);
      lastSave = 0;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  window.addEventListener('beforeunload', () => save(world));
}

start().catch((err) => {
  console.error(err);
  const host = document.getElementById('stage');
  if (host) host.innerHTML = `<pre style="padding:12px;color:#a33">起動失敗: ${String(err)}</pre>`;
});
