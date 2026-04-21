/**
 * くそざこ村 Σ-4-proto — Three.js terrain verification prototype
 *
 * 5 verification items:
 *  ① PlaneGeometry displacement 60fps
 *  ② InstancedMesh 200 sprite 1 draw call
 *  ③ GPU picking (click → identify chibi/terrain tile)
 *  ④ camera.project → DOM bubble sync
 *  ⑤ PNG billboard appearance (Y-axis billboard + left/right flip)
 *
 * Deliberately self-contained: no imports from src/ at runtime.
 * Terrain generators are re-implemented inline so the prototype runs
 * without a bundler-aware path alias.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Constants (mirrors CONFIG / generators.ts)
// ---------------------------------------------------------------------------
const WORLD_W = 3200;
const WORLD_H = 1800;
const TILE_SIZE = 32;
const COLS = Math.ceil(WORLD_W / TILE_SIZE);   // 100
const ROWS = Math.ceil(WORLD_H / TILE_SIZE);   // 57
const CHIBI_COUNT = 200;

// Camera: perspective fov ~20°, fixed 45° overhead, 3 discrete zoom levels
const FOV = 20;
const ZOOM_LEVELS = [0.45, 0.7, 1.0];  // world-scale multipliers
let zoomIdx = 0;

// ---------------------------------------------------------------------------
// Minimal seeded noise (mirrors terrain/noise.ts — no import needed)
// ---------------------------------------------------------------------------
function u32(n: number): number { return n >>> 0; }
function wangHash(n: number): number {
  n = u32(n);
  n = u32((u32(n >> 16) ^ n) * 0x45d9f3b);
  n = u32((u32(n >> 16) ^ n) * 0x45d9f3b);
  n = u32(u32(n >> 16) ^ n);
  return n;
}
function grad(ix: number, iy: number, seed: number): number {
  const h = wangHash(u32(u32(ix * 1619) + u32(iy * 31337) + u32(seed * 1000003)));
  return (h & 0xffff) / 32767.5 - 1.0;
}
function smoothstep(t: number): number { return t * t * (3 - 2 * t); }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function noise2D(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = smoothstep(fx), uy = smoothstep(fy);
  return lerp(
    lerp(grad(ix, iy, seed), grad(ix + 1, iy, seed), ux),
    lerp(grad(ix, iy + 1, seed), grad(ix + 1, iy + 1, seed), ux),
    uy,
  );
}
function octaveNoise(x: number, y: number, seed: number, oct: number, p: number): number {
  let v = 0, a = 1, f = 1, mx = 0;
  for (let i = 0; i < oct; i++) {
    v += noise2D(x * f, y * f, u32(seed + i * 13337)) * a;
    mx += a; a *= p; f *= 2;
  }
  return v / mx;
}

// ---------------------------------------------------------------------------
// Terrain generators (mirrors generators.ts)
// ---------------------------------------------------------------------------
type Difficulty = 'beginner' | 'standard' | 'hell';
interface TileDef { elev: number; water: boolean; }

function makePlains(seed: number): TileDef[][] {
  const grid: TileDef[][] = [];
  for (let row = 0; row < ROWS; row++) {
    const r: TileDef[] = [];
    for (let col = 0; col < COLS; col++) {
      const n = octaveNoise(col / COLS * 5, row / ROWS * 5, seed, 4, 0.5);
      r.push({ elev: 40 + n * 15, water: false });
    }
    grid.push(r);
  }
  return grid;
}

function makePeninsula(seed: number): TileDef[][] {
  const grid: TileDef[][] = [];
  for (let row = 0; row < ROWS; row++) {
    const r: TileDef[] = [];
    for (let col = 0; col < COLS; col++) {
      const nx = col / COLS, ny = row / ROWS;
      let elev: number;
      if (ny < 0.35) {
        elev = 62 + octaveNoise(nx * 5, ny * 8, seed, 4, 0.5) * 23;
      } else {
        elev = 35 + octaveNoise(nx * 7, ny * 6, seed + 17, 4, 0.5) * 18;
      }
      let water = false;
      if (nx > 0.52 && ny > 0.48) {
        const sd = Math.sqrt(Math.pow((nx - 0.76) * 1.1, 2) + Math.pow((ny - 0.76) * 0.9, 2));
        const sn = noise2D(nx * 9, ny * 9, seed + 3);
        if (sd < 0.36 + sn * 0.09) { water = true; elev = 0; }
      }
      if (water) {
        for (let pi = 0; pi < 3; pi++) {
          const ps = seed + 1000 + pi * 337;
          const ang = 0.6 + noise2D(pi * 3.7, 0.5, ps) * 0.5;
          const bx = 0.52 + noise2D(pi * 1.3, 0.4, ps + 7) * 0.18;
          const by = 0.48 + noise2D(pi * 2.1, 0.6, ps + 13) * 0.18;
          const dx = nx - bx, dy = ny - by;
          const along = dx * Math.cos(ang) + dy * Math.sin(ang);
          const across = -dx * Math.sin(ang) + dy * Math.cos(ang);
          const pLen = 0.13 + noise2D(pi * 4.1, 0.2, ps + 5) * 0.05;
          const pWidth = 0.038 + noise2D(pi * 2.9, 0.8, ps + 11) * 0.01;
          if (along >= 0 && along < pLen && Math.abs(across) < pWidth * (1 - along / pLen)) {
            water = false; elev = 22 + noise2D(nx * 10, ny * 10, ps) * 8;
          }
        }
      }
      r.push({ elev, water });
    }
    grid.push(r);
  }
  return grid;
}

function makeIsland(seed: number): TileDef[][] {
  const grid: TileDef[][] = [];
  for (let row = 0; row < ROWS; row++) {
    const r: TileDef[] = [];
    for (let col = 0; col < COLS; col++) {
      const nx = col / COLS, ny = row / ROWS;
      const marginX = Math.min(nx, 1 - nx), marginY = Math.min(ny, 1 - ny);
      const edgeDist = Math.min(marginX / 0.13, marginY / 0.10);
      const cdx = (nx - 0.5) / 0.22, cdy = (ny - 0.5) / 0.22;
      const centerDist = Math.sqrt(cdx * cdx + cdy * cdy);
      const n = octaveNoise(nx * 9, ny * 9, seed, 5, 0.5);
      const edgeN = noise2D(nx * 7, ny * 7, seed + 11);
      let elev = 0, water = false;
      if (edgeDist < 1.0 + edgeN * 0.3) {
        water = true;
      } else if (centerDist < 1.0) {
        elev = 72 - centerDist * 32 + n * 12;
      } else if (edgeDist < 1.8) {
        elev = 5 + ((edgeDist - 1.0) / 0.8) * 20 + n * 4;
      } else {
        elev = 25 + n * 12;
      }
      r.push({ elev: Math.max(water ? 0 : 2, Math.min(100, elev)), water });
    }
    grid.push(r);
  }
  return grid;
}

function generateTerrain(difficulty: Difficulty, seed: number): TileDef[][] {
  if (difficulty === 'beginner') return makePlains(seed);
  if (difficulty === 'standard') return makePeninsula(seed);
  return makeIsland(seed);
}

// ---------------------------------------------------------------------------
// Material colors per tile type (for vertex colors / splatmap simulation)
// ---------------------------------------------------------------------------
const MAT_COLORS: Record<string, THREE.Color> = {
  water:  new THREE.Color(0x2255aa),
  sand:   new THREE.Color(0xd4b97a),
  soil:   new THREE.Color(0x8b6b40),
  grass:  new THREE.Color(0x4a8a3a),
  rock:   new THREE.Color(0x777777),
};

function tileColor(t: TileDef): THREE.Color {
  if (t.water) return MAT_COLORS.water;
  if (t.elev > 60) return MAT_COLORS.rock;
  if (t.elev > 25) return MAT_COLORS.grass;
  if (t.elev > 10) return MAT_COLORS.soil;
  return MAT_COLORS.sand;
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------
let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let terrain: TileDef[][] = [];
let terrainMesh: THREE.Mesh;
let instancedMesh: THREE.InstancedMesh;
let shadowMesh: THREE.InstancedMesh;  // blob shadow layer
let currentMode: Difficulty = 'beginner';

// Chibi positions (world coords, flat 2D — sim never uses Z)
const chibiPos: { x: number; y: number; flip: boolean }[] = [];

// FPS tracking
let frameCount = 0;
let lastFpsTime = performance.now();
let fpsHistory: number[] = [];
const fpsBuf: number[] = [];

// Pick
const pickTarget = new THREE.WebGLRenderTarget(1, 1);
let pickScene: THREE.Scene;
let pickMesh: THREE.Mesh;
const _pickColor = new THREE.Color();

// DOM
const bubbleContainer = document.getElementById('bubbles')!;
const activeBubbles: { el: HTMLElement; chibIdx: number }[] = [];

// ---------------------------------------------------------------------------
// Build terrain PlaneGeometry
// ---------------------------------------------------------------------------
function buildTerrainGeometry(tiles: TileDef[][]): THREE.BufferGeometry {
  // PlaneGeometry with COLS×ROWS segments, one vertex per tile corner
  const geometry = new THREE.PlaneGeometry(
    WORLD_W, WORLD_H,
    COLS, ROWS,
  );
  geometry.rotateX(-Math.PI / 2);  // lay flat, XZ plane

  const pos = geometry.attributes.position;
  const colors: number[] = [];

  // Displace Y and assign vertex color
  // PlaneGeometry verts go left→right, top→bottom for segments+1 × segments+1
  const vCols = COLS + 1;
  const vRows = ROWS + 1;
  for (let vr = 0; vr < vRows; vr++) {
    for (let vc = 0; vc < vCols; vc++) {
      const idx = vr * vCols + vc;
      // Clamp to valid tile indices
      const tc = Math.min(vc, COLS - 1);
      const tr = Math.min(vr, ROWS - 1);
      const t = tiles[tr]?.[tc] ?? { elev: 0, water: true };
      // Elevation: scale 0-100 → 0-200 world units (2 units per elev point)
      const elevY = t.water ? 0 : t.elev * 2;
      pos.setY(idx, elevY);
      const c = tileColor(t);
      colors.push(c.r, c.g, c.b);
    }
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createTerrainMesh(tiles: TileDef[][]): THREE.Mesh {
  const geo = buildTerrainGeometry(tiles);
  const mat = new THREE.MeshToonMaterial({
    vertexColors: true,
    side: THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

// Pick mesh (flat, colored by tile index for GPU picking)
function createPickMesh(tiles: TileDef[][]): THREE.Mesh {
  const geo = buildTerrainGeometry(tiles);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: false });
  // We'll use a custom shader that encodes tile index into color
  // Actually: re-use same geometry but flat colors per tile index
  // Encode tile index as RGB: r = index & 0xff, g = (index>>8)&0xff, b = (index>>16)&0xff
  const vCols = COLS + 1;
  const vRows = ROWS + 1;
  const pickColors: number[] = [];
  for (let vr = 0; vr < vRows; vr++) {
    for (let vc = 0; vc < vCols; vc++) {
      const tc = Math.min(vc, COLS - 1);
      const tr = Math.min(vr, ROWS - 1);
      const idx = tr * COLS + tc;
      pickColors.push(
        (idx & 0xff) / 255,
        ((idx >> 8) & 0xff) / 255,
        ((idx >> 16) & 0xff) / 255,
      );
    }
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(pickColors, 3));
  const pickMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  return new THREE.Mesh(geo, pickMat);
}

// ---------------------------------------------------------------------------
// Instanced billboards (② InstancedMesh 200 sprites in 1 draw call)
// ---------------------------------------------------------------------------
function buildInstancedMesh(): THREE.InstancedMesh {
  // Billboard quad: 64w × 80h world units (matches ~2.2 head ratio)
  const geo = new THREE.PlaneGeometry(64, 80);
  const loader = new THREE.TextureLoader();
  // Vite dev: public/ is served at root regardless of base setting
  const tex = loader.load('/chibiwafu/01_normal.png');
  tex.magFilter = THREE.NearestFilter;
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.1,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, CHIBI_COUNT);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

function buildShadowMesh(): THREE.InstancedMesh {
  // Blob shadow: flat circle on the ground, separate InstancedMesh (1 extra draw call)
  const geo = new THREE.CircleGeometry(22, 8);
  geo.rotateX(-Math.PI / 2);  // lie flat on XZ plane
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, CHIBI_COUNT);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

function placeChibisRandomly(tiles: TileDef[][]): void {
  chibiPos.length = 0;
  let placed = 0;
  let tries = 0;
  while (placed < CHIBI_COUNT && tries < CHIBI_COUNT * 20) {
    tries++;
    const col = Math.floor(Math.random() * COLS);
    const row = Math.floor(Math.random() * ROWS);
    const t = tiles[row]?.[col];
    if (!t || t.water) continue;
    const x = col * TILE_SIZE + TILE_SIZE / 2;
    const y = row * TILE_SIZE + TILE_SIZE / 2;
    chibiPos.push({ x, y, flip: Math.random() < 0.5 });
    placed++;
  }
  // fill any remaining with safe defaults
  while (chibiPos.length < CHIBI_COUNT) {
    chibiPos.push({ x: WORLD_W / 2, y: WORLD_H / 2, flip: false });
  }
}

const _dummy = new THREE.Object3D();
const _dummy2 = new THREE.Object3D();

function updateInstancedMesh(): void {
  for (let i = 0; i < CHIBI_COUNT; i++) {
    const c = chibiPos[i];
    const col = Math.floor(c.x / TILE_SIZE);
    const row = Math.floor(c.y / TILE_SIZE);
    const t = terrain[row]?.[col] ?? { elev: 0, water: false };
    const elevY = t.water ? 0 : t.elev * 2;
    const wx = c.x - WORLD_W / 2;
    const wz = c.y - WORLD_H / 2;

    // Billboard sprite: position at terrain surface + half-height offset
    _dummy.position.set(wx, elevY + 42, wz);

    // Y-axis billboard: rotate to face camera in XZ plane
    const toCam = new THREE.Vector3().subVectors(camera.position, _dummy.position);
    toCam.y = 0;
    if (toCam.lengthSq() > 0.001) {
      _dummy.rotation.y = Math.atan2(toCam.x, toCam.z);
    }
    _dummy.scale.set(c.flip ? -1 : 1, 1, 1);
    _dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, _dummy.matrix);

    // Blob shadow: flat circle at terrain surface, slightly above to avoid z-fight
    _dummy2.position.set(wx, elevY + 0.5, wz);
    _dummy2.rotation.set(0, 0, 0);
    _dummy2.scale.set(1, 1, 1);
    _dummy2.updateMatrix();
    shadowMesh.setMatrixAt(i, _dummy2.matrix);
  }
  instancedMesh.instanceMatrix.needsUpdate = true;
  shadowMesh.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Camera setup — perspective fov 20°, fixed 45° overhead
// ---------------------------------------------------------------------------
function setupCamera(): THREE.PerspectiveCamera {
  const aspect = window.innerWidth / window.innerHeight;
  const cam = new THREE.PerspectiveCamera(FOV, aspect, 10, 30000);
  resetCameraForMode(cam, 'beginner');
  return cam;
}

function resetCameraForMode(cam: THREE.PerspectiveCamera, _mode: Difficulty): void {
  const scale = ZOOM_LEVELS[zoomIdx];
  // Position camera above center, angled 45° down
  const dist = (WORLD_H * 0.7) / (2 * Math.tan((FOV / 2) * Math.PI / 180)) / scale;
  const height = dist * Math.sin(Math.PI / 4);
  const back = dist * Math.cos(Math.PI / 4);
  cam.position.set(0, height, back);
  cam.lookAt(0, 0, 0);
}

// ---------------------------------------------------------------------------
// Bubble DOM sync (④ camera.project DOM)
// ---------------------------------------------------------------------------
const BUBBLE_MESSAGES = [
  'おなかすいたわふ', 'ねむいわふ', 'どうしたわふ？', 'ひえええわふ！',
  'ぼくがいちばんわふ！', 'こわいわふ…', 'がんばるわふ', 'くそざこわふ',
];

function createBubble(chibIdx: number): void {
  // Remove existing bubble for this chibi
  const existing = activeBubbles.findIndex(b => b.chibIdx === chibIdx);
  if (existing >= 0) {
    activeBubbles[existing].el.remove();
    activeBubbles.splice(existing, 1);
  }
  const el = document.createElement('div');
  el.className = 'bubble';
  el.textContent = BUBBLE_MESSAGES[Math.floor(Math.random() * BUBBLE_MESSAGES.length)];
  bubbleContainer.appendChild(el);
  activeBubbles.push({ el, chibIdx });
  // Auto-remove after 2s
  setTimeout(() => {
    el.remove();
    const idx = activeBubbles.findIndex(b => b.el === el);
    if (idx >= 0) activeBubbles.splice(idx, 1);
  }, 2000);
}

function syncBubbles(): void {
  const w = window.innerWidth, h = window.innerHeight;
  for (const { el, chibIdx } of activeBubbles) {
    const c = chibiPos[chibIdx];
    if (!c) continue;
    const col = Math.floor(c.x / TILE_SIZE);
    const row = Math.floor(c.y / TILE_SIZE);
    const t = terrain[row]?.[col] ?? { elev: 0, water: false };
    const elevY = t.water ? 0 : t.elev * 2;
    const worldPt = new THREE.Vector3(c.x - WORLD_W / 2, elevY + 80, c.y - WORLD_H / 2);
    worldPt.project(camera);
    const sx = (worldPt.x * 0.5 + 0.5) * w;
    const sy = (-worldPt.y * 0.5 + 0.5) * h;
    // Only show if in front of camera
    if (worldPt.z < 1) {
      el.style.display = 'block';
      el.style.left = sx + 'px';
      el.style.top = sy + 'px';
    } else {
      el.style.display = 'none';
    }
  }
}

// ---------------------------------------------------------------------------
// GPU Picking (③)
// ---------------------------------------------------------------------------
function doPick(event: MouseEvent): void {
  const rect = renderer.domElement.getBoundingClientRect();
  const px = (event.clientX - rect.left) * (renderer.domElement.width / rect.width);
  const py = (event.clientY - rect.top) * (renderer.domElement.height / rect.height);

  // Render pick scene into 1×1 target at the clicked pixel
  camera.setViewOffset(
    renderer.domElement.width, renderer.domElement.height,
    px, py, 1, 1,
  );
  renderer.setRenderTarget(pickTarget);
  renderer.render(pickScene, camera);
  renderer.setRenderTarget(null);
  camera.clearViewOffset();

  const buf = new Uint8Array(4);
  renderer.readRenderTargetPixels(pickTarget, 0, 0, 1, 1, buf);

  const tileIdx = buf[0] | (buf[1] << 8) | (buf[2] << 16);
  const col = tileIdx % COLS;
  const row = Math.floor(tileIdx / COLS);
  const t = terrain[row]?.[col];

  const log = document.getElementById('pick-log')!;
  if (t) {
    const mat = t.water ? 'water' : t.elev > 60 ? 'rock' : t.elev > 25 ? 'grass' : t.elev > 10 ? 'soil' : 'sand';
    log.innerHTML = `③ GPU pick: tile [${col}, ${row}]<br>標高: ${t.elev.toFixed(1)} | 素材: ${mat}<br>world: (${(col * TILE_SIZE).toFixed(0)}, ${(row * TILE_SIZE).toFixed(0)})`;
  } else {
    log.innerHTML = `③ GPU pick: 地形外 (idx=${tileIdx})`;
  }

  // Also check if we clicked near a chibi (simple 2D screen-space check)
  const screenX = event.clientX, screenY = event.clientY;
  let closestChib = -1, closestDist = 40;
  const w = window.innerWidth, h = window.innerHeight;
  for (let i = 0; i < CHIBI_COUNT; i++) {
    const c = chibiPos[i];
    const tcol = Math.floor(c.x / TILE_SIZE);
    const trow = Math.floor(c.y / TILE_SIZE);
    const tt = terrain[trow]?.[tcol] ?? { elev: 0, water: false };
    const elevY = tt.water ? 0 : tt.elev * 2;
    const wp = new THREE.Vector3(c.x - WORLD_W / 2, elevY + 40, c.y - WORLD_H / 2);
    wp.project(camera);
    const sx = (wp.x * 0.5 + 0.5) * w;
    const sy = (-wp.y * 0.5 + 0.5) * h;
    const d = Math.hypot(sx - screenX, sy - screenY);
    if (d < closestDist) { closestDist = d; closestChib = i; }
  }
  if (closestChib >= 0) {
    log.innerHTML += `<br>ちびわふ #${closestChib} クリックわふ！`;
    createBubble(closestChib);
  }
}

// ---------------------------------------------------------------------------
// Rebuild everything when mode changes
// ---------------------------------------------------------------------------
function rebuild(mode: Difficulty): void {
  currentMode = mode;
  const seed = mode === 'beginner' ? 12345 : mode === 'standard' ? 67890 : 99999;
  terrain = generateTerrain(mode, seed);

  // Remove old meshes
  if (terrainMesh) scene.remove(terrainMesh);
  if (instancedMesh) scene.remove(instancedMesh);
  if (shadowMesh) scene.remove(shadowMesh);
  if (pickMesh) pickScene.remove(pickMesh);

  // Terrain mesh
  terrainMesh = createTerrainMesh(terrain);
  scene.add(terrainMesh);

  // Pick mesh in pick scene
  pickMesh = createPickMesh(terrain);
  pickScene.add(pickMesh);

  // Chibi sprites + blob shadows (② InstancedMesh — sprite layer + shadow layer)
  shadowMesh = buildShadowMesh();
  scene.add(shadowMesh);
  instancedMesh = buildInstancedMesh();
  scene.add(instancedMesh);
  placeChibisRandomly(terrain);
  updateInstancedMesh();

  // Reset camera
  zoomIdx = 0;
  resetCameraForMode(camera, mode);

  const label = document.getElementById('terrain-mode')!;
  label.textContent = `地形: ${mode}`;

  // Update mode buttons
  ['beginner', 'standard', 'hell'].forEach(m => {
    const btn = document.getElementById(`btn-${m}`) as HTMLButtonElement;
    btn.classList.toggle('active', m === mode);
  });
}

// ---------------------------------------------------------------------------
// Screenshot
// ---------------------------------------------------------------------------
function doScreenshot(): void {
  renderer.render(scene, camera);
  const dataURL = renderer.domElement.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = `sigma4proto_${currentMode}_${Date.now()}.png`;
  a.click();
}

// ---------------------------------------------------------------------------
// Zoom
// ---------------------------------------------------------------------------
function doZoom(dir: number): void {
  zoomIdx = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, zoomIdx + dir));
  resetCameraForMode(camera, currentMode);
}

// ---------------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------------
function setupLights(): void {
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xfff5e0, 1.2);
  dirLight.position.set(WORLD_W * 0.3, 800, -WORLD_H * 0.3);
  dirLight.castShadow = true;
  scene.add(dirLight);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
function init(): void {
  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('canvas-container')!.appendChild(renderer.domElement);

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);  // sky blue
  // Light fog for depth cue
  scene.fog = new THREE.Fog(0x87ceeb, 3000, 8000);

  // Pick scene (no fog, no lights — just flat pick colors)
  pickScene = new THREE.Scene();
  pickScene.background = new THREE.Color(0xffffff);  // white = no tile

  // Camera
  camera = setupCamera();

  // Lights
  setupLights();

  // Build initial terrain
  rebuild('beginner');

  // Water plane (flat blue at y=0)
  const waterGeo = new THREE.PlaneGeometry(WORLD_W, WORLD_H);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshToonMaterial({
    color: 0x2255cc,
    transparent: true,
    opacity: 0.75,
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.y = 1;  // just above 0 so it doesn't z-fight
  scene.add(waterMesh);

  // Expose globals to HTML buttons
  (window as any).__setMode = (m: Difficulty) => rebuild(m);
  (window as any).__screenshot = doScreenshot;
  (window as any).__zoom = doZoom;

  // Events
  renderer.domElement.addEventListener('click', doPick);
  window.addEventListener('resize', onResize);

  // Random bubbles for DOM sync demo (④)
  setInterval(() => {
    if (chibiPos.length > 0) {
      const idx = Math.floor(Math.random() * Math.min(CHIBI_COUNT, chibiPos.length));
      createBubble(idx);
    }
  }, 800);

  requestAnimationFrame(renderLoop);
}

function onResize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
function renderLoop(now: number): void {
  requestAnimationFrame(renderLoop);

  // Sync billboards (⑤ PNG billboard)
  updateInstancedMesh();

  // Sync DOM bubbles (④)
  syncBubbles();

  // Render
  renderer.render(scene, camera);

  // FPS
  frameCount++;
  const elapsed = now - lastFpsTime;
  if (elapsed >= 1000) {
    const fps = (frameCount / elapsed) * 1000;
    fpsBuf.push(fps);
    if (fpsBuf.length > 10) fpsBuf.shift();
    const avg = fpsBuf.reduce((a, b) => a + b, 0) / fpsBuf.length;
    fpsHistory.push(fps);

    const info = renderer.info;
    const statsEl = document.getElementById('stats')!;
    const avgEl = document.getElementById('avg')!;
    statsEl.textContent =
      `FPS: ${fps.toFixed(1)} | drawCalls: ${info.render.calls} | tris: ${info.render.triangles.toLocaleString()}`;
    avgEl.textContent = `10s avg FPS: ${avg.toFixed(1)} | chibis: ${CHIBI_COUNT} (1 draw call = InstancedMesh)`;

    frameCount = 0;
    lastFpsTime = now;
    renderer.info.reset();
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
init();
