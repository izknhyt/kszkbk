// Σ-4 Three.js 3D renderer — くそざこ村
// Σ-4-f で旧 Pixi stage.ts を削除し本レンダラーが唯一のステージ実装になった。
import * as THREE from 'three';
import type { WorldState } from '../sim/world';
import { POWERLINE_CONNECT_RADIUS, TERRAIN_TILE_SIZE } from '../sim/world';
import { elevAtTileSurface, isSeaAt } from '../sim/terrain/query';
import type { ChibiState, DayPhase, Difficulty, FeatureKind, HitTarget, PlacedBuilding, Season, TerrainTile } from '../types';
import { NPC_DEFS, type NpcId } from '../sim/npcs';
import { CONFIG } from '../config';
import type { Bubble } from '../sim/bubbles';

// ============================================================
// StageHandle インターフェース
// Σ-4 以前は Pixi stage.ts で定義していたが Pixi 削除と同時にこちらへ移設。
// app: Application の duck-type shim は廃止、canvas と onResize を直接公開。
// ============================================================
export interface CameraView {
  x: number; y: number;
  w: number; h: number;
  scale: number;
  bounds: { w: number; h: number };
}

export interface StageHandle {
  canvas: HTMLCanvasElement;
  onResize: (cb: (w: number, h: number) => void) => void;
  resize: (w: number, h: number) => void;
  draw: (world: WorldState) => void;
  setSeason: (s: Season) => void;
  resetCamera: () => void;
  focusOn: (x: number, y: number, scale?: number) => void;
  panCamera: (dx: number, dy: number) => void;
  getCamera: () => CameraView;
  screenToWorld: (cx: number, cy: number) => { x: number; y: number };
  setHitTest: (fn: (wx: number, wy: number) => HitTarget | null) => void;
  setContourVisible: (visible: boolean) => void;
  // Σ-8-e: hover preview ghost。tx/ty=null で消す、color は CSS hex。
  setHoverTile: (tx: number | null, ty: number | null, color?: number) => void;
  // Σ-8-fix-7: 編集モード中の camera pan 抑止（target を持たない pointerdown を無視）
  setPanEnabled: (enabled: boolean) => void;
  // M2.1 Step 6: カメラ角度プリセット切替（low / standard / top）
  setCameraPreset: (preset: 'low' | 'standard' | 'top') => void;
  getCameraPreset: () => 'low' | 'standard' | 'top';
}

// ============================================================
// 定数
// ============================================================
// Σ-8: elev は 0-255 スケール。Y 上限を ~1500 に抑えるため SCALE は 6 だったが、
// M2.1 Step 7: 1 段差 (25) が画面 150px と過大で chibi (64px) より大きすぎたため
// 4 へ控えめに下げる。1 段差 = 100px、新 ELEV_SCALE * MAX_ELEV = 1020 で全体は
// やや低くなり、画面下破綻と段差過大感が同時に緩和される。
const ELEV_SCALE   = 4;
const BASE_H       = 1200; // zoomLevel=1 のカメラ高さ
const CHIBI_W      = 48;
const CHIBI_H      = 64;
const NPC_SCALE_BASE = 1.3; // フラナ基準

const T_COLS = 100;
const T_ROWS = 57;

// ============================================================
// テクスチャ：白背景除去
// ============================================================
const texCache = new Map<string, THREE.Texture>();

function floodFillAlpha(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const id = ctx.getImageData(0, 0, w, h);
  const d  = id.data;
  const vis = new Uint8Array(w * h);
  const near = (i: number) => d[i*4]!>=240 && d[i*4+1]!>=240 && d[i*4+2]!>=240;
  const stk: number[] = [];
  for (const s of [0, w-1, (h-1)*w, h*w-1]) if (near(s)) stk.push(s);
  while (stk.length) {
    const i = stk.pop()!;
    if (vis[i] || !near(i)) continue;
    vis[i] = 1; d[i*4+3] = 0;
    const x = i%w, y = (i/w)|0;
    if (x>0)   stk.push(i-1);
    if (x<w-1) stk.push(i+1);
    if (y>0)   stk.push(i-w);
    if (y<h-1) stk.push(i+w);
  }
  ctx.putImageData(id, 0, 0);
}

async function loadTex(url: string): Promise<THREE.Texture> {
  const cached = texCache.get(url);
  if (cached) return cached;
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      const ctx = cv.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      floodFillAlpha(ctx, img.width, img.height);
      const t = new THREE.CanvasTexture(cv);
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      texCache.set(url, t);
      res(t);
    };
    img.onerror = () => rej(new Error(`loadTex: ${url}`));
    img.src = url;
  });
}

function makeCanvasTex(
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  size = 64,
): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(cv);
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

// ============================================================
// state → sprite frame index
// ============================================================
// ============================================================
// state → ポーズインデックス（chibiTexs / furanaTexs の配列添字）
//
// FURANA_STATE_IDX: NPC（furana 含む）は 9 ポーズだけ持つので 0-8 範囲。
// CHIBI_STATE_IDX: ちびわふは 40 ポーズ揃いなので state 別に専用ポーズ。
// ============================================================
const FURANA_STATE_IDX: Record<ChibiState, number> = {
  idle:0, cry:1, surprised:2, angry:3,
  sleep:4, dazed:5, hurt:6, exhausted:7, dead:8,
  chatting:0, staring:2, eating:3,
  scared:2,  // 逃走中は surprised ポーズ流用
};
// ちびわふは新ポーズに振り分け（22_talk_gesture / 23_eat_drink / 16_cower 等を活かす）
//   index = ファイル番号 - 1（01_normal=0, 09_dead=8, 10_walk=9, 40_lonely=39）
const CHIBI_STATE_IDX: Record<ChibiState, number> = {
  idle:      0,   // 01_normal
  cry:      14,   // 15_heavy_cry（02_crying より dramatic）
  surprised: 2,   // 03_surprised
  angry:     3,   // 04_angry
  sleep:    27,   // 28_sleep_curl
  dazed:     5,   // 06_dizzy
  hurt:     18,   // 19_knocked
  exhausted:39,   // 40_lonely_sit
  dead:      8,   // 09_dead（生きている state==='dead' の瞬間用、死体は pickCorpseTex で死因別）
  chatting: 21,   // 22_talk_gesture
  staring:  38,   // 39_search_look
  eating:   22,   // 23_eat_drink
  scared:   15,   // 16_cower
};
// 後方互換用エイリアス（既存呼び出しが STATE_IDX を直接見ている所がある）
const STATE_IDX = FURANA_STATE_IDX;
// 飛行中（投げられて空中）は thrown_airborne で固定。
const CHIBI_FLIGHT_IDX = 25;  // 26_thrown_airborne

// 各ポーズの sprite scale 補正（PNG bbox 計測から逆算、scripts/measure_pose_bbox.mjs で生成）
// baseline は 01-09 ポーズの平均（wRatio=0.875, hRatio=0.854）。
// 新ポーズは 1024×1024 キャンバスに小さく描かれるので scale を上げて apparent size を揃える。
const CHIBI_POSE_SCALE: Array<[number, number]> = [
  [1.009, 0.978],  // 0  01_normal
  [1.003, 0.979],  // 1  02_crying
  [0.972, 0.975],  // 2  03_surprised
  [1.000, 0.988],  // 3  04_angry
  [0.995, 1.005],  // 4  05_sulking
  [1.013, 0.978],  // 5  06_dizzy
  [1.007, 1.003],  // 6  07_dirty
  [0.996, 1.034],  // 7  08_sleepy
  [1.006, 1.067],  // 8  09_dead
  [1.336, 1.215],  // 9  10_walk_lean
  [1.116, 1.352],  // 10 11_run_lean
  [1.379, 1.038],  // 11 12_reach
  [1.282, 1.105],  // 12 13_hold_stick
  [1.366, 1.080],  // 13 14_cheeky_hips
  [1.071, 1.129],  // 14 15_heavy_cry
  [1.213, 1.514],  // 15 16_cower
  [1.216, 1.132],  // 16 17_arms_up
  [1.020, 1.540],  // 17 18_drown_flail
  [1.151, 1.261],  // 18 19_knocked
  [1.019, 1.543],  // 19 20_splat
  [1.262, 1.128],  // 20 21_sit
  [1.254, 1.054],  // 21 22_talk_gesture
  [1.197, 1.053],  // 22 23_eat_drink
  [1.266, 1.202],  // 23 24_work_carry
  [1.312, 1.028],  // 24 25_grabbed
  [1.172, 1.338],  // 25 26_thrown_airborne
  [1.101, 1.095],  // 26 27_weather_suffering
  [1.030, 1.451],  // 27 28_sleep_curl
  [0.973, 1.793],  // 28 29_sleep_flat
  [1.151, 1.126],  // 29 30_nap_sitting
  [1.187, 1.105],  // 30 31_wake_up
  [1.192, 1.045],  // 31 32_plead
  [1.040, 1.101],  // 32 33_celebrate_jump
  [1.067, 1.028],  // 33 34_sick_fever
  [1.130, 1.129],  // 34 35_smoke_cough
  [1.119, 1.458],  // 35 36_dig_scrape
  [1.084, 1.306],  // 36 37_gather_pickup
  [1.336, 1.057],  // 37 38_refuse_no
  [1.210, 1.119],  // 38 39_search_look
  [1.261, 1.197],  // 39 40_lonely_sit
];

// ちびわふ 40 ポーズ揃い（00_origin はマスター、in-game では使わない）
// インデックスはファイル番号 -1（CHIBI_STATE_IDX の値と対応）
const CHIBI_URLS = [
  '/chibiwafu/01_normal.png',         '/chibiwafu/02_crying.png',
  '/chibiwafu/03_surprised.png',      '/chibiwafu/04_angry.png',
  '/chibiwafu/05_sulking.png',        '/chibiwafu/06_dizzy.png',
  '/chibiwafu/07_dirty.png',          '/chibiwafu/08_sleepy.png',
  '/chibiwafu/09_dead.png',
  '/chibiwafu/10_walk_lean.png',      '/chibiwafu/11_run_lean.png',
  '/chibiwafu/12_reach.png',          '/chibiwafu/13_hold_stick.png',
  '/chibiwafu/14_cheeky_hips.png',    '/chibiwafu/15_heavy_cry.png',
  '/chibiwafu/16_cower.png',          '/chibiwafu/17_arms_up.png',
  '/chibiwafu/18_drown_flail.png',    '/chibiwafu/19_knocked.png',
  '/chibiwafu/20_splat.png',          '/chibiwafu/21_sit.png',
  '/chibiwafu/22_talk_gesture.png',   '/chibiwafu/23_eat_drink.png',
  '/chibiwafu/24_work_carry.png',     '/chibiwafu/25_grabbed.png',
  '/chibiwafu/26_thrown_airborne.png','/chibiwafu/27_weather_suffering.png',
  '/chibiwafu/28_sleep_curl.png',     '/chibiwafu/29_sleep_flat.png',
  '/chibiwafu/30_nap_sitting.png',    '/chibiwafu/31_wake_up.png',
  '/chibiwafu/32_plead.png',          '/chibiwafu/33_celebrate_jump.png',
  '/chibiwafu/34_sick_fever.png',     '/chibiwafu/35_smoke_cough.png',
  '/chibiwafu/36_dig_scrape.png',     '/chibiwafu/37_gather_pickup.png',
  '/chibiwafu/38_refuse_no.png',      '/chibiwafu/39_search_look.png',
  '/chibiwafu/40_lonely_sit.png',
];
const FURANA_URLS = [
  '/furana/01_normal.png',  '/furana/02_crying.png',
  '/furana/03_surprised.png','/furana/04_angry.png',
  '/furana/05_sulking.png', '/furana/06_dizzy.png',
  '/furana/07_dirty.png',   '/furana/08_sleepy.png',
  '/furana/09_dead.png',
];

// Σ-8-c で atlas lookup に移行したため、旧 elev band / material RGB は撤去。
// vertex color は tile.ramp の有無に応じた tint のみで、テクスチャは atlas が担う。

// =========================================================================
// Σ-8-c Atlas セルマップ
// 1024×1024 PNG / 4×4 grid / 256px cell。col/row は 0-indexed。
// 各セル内に 16/256 = 6.25% の inset を取り、隣接セルへの blee
// (テクスチャブリード) を避ける。
// =========================================================================
const ATLAS_GRID = 4;
const ATLAS_INSET = (1 / 16) / ATLAS_GRID;  // セル内寸 1/4 の 1/16 = 0.015625
function atlasUVBounds(col: number, row: number): { uMin: number; uMax: number; vMin: number; vMax: number } {
  const cell = 1 / ATLAS_GRID;
  return {
    uMin: col * cell + ATLAS_INSET,
    uMax: (col + 1) * cell - ATLAS_INSET,
    vMin: 1 - (row + 1) * cell + ATLAS_INSET,
    vMax: 1 - row * cell - ATLAS_INSET,
  };
}
const MAT_CELL: Record<string, [number, number]> = {
  // sigma8_terrain_atlas_v2_1024.png / docs/SIGMA-8-ASSET-IMPLEMENTATION-SPEC.md
  grass: [0, 0], soil: [1, 0], rock: [0, 1], sand: [2, 0],
  snow:  [3, 0],
};
// Cliff wall atlas cells (docs/SIGMA-8-ASSET-IMPLEMENTATION-SPEC.md):
//   (0,2) grass-over-soil default, (1,2) rock cliff, (2,2) damp/wet lower edge
const CLIFF_CELL_SOIL: [number, number] = [0, 2];
const CLIFF_CELL_ROCK: [number, number] = [1, 2];
const CLIFF_CELL_DAMP: [number, number] = [2, 2];
const WATER_CELL: [number, number] = [1, 1];
const RAMP_NS_CELL: [number, number] = [3, 2];  // 'N' そのまま / 'S' は上下反転
const RAMP_EW_CELL: [number, number] = [0, 3];  // 'E' そのまま / 'W' は左右反転
// R2: waterfall は atlas 予約セル (col=3, row=3)。
// 実描画は手続き生成テクスチャで行い atlas が空欄でも動作する。UV 定義だけ保持。
const WATERFALL_CELL: [number, number] = [3, 3];

// Deterministic brightness for cliff wall instances [0.80, 1.02].
// Based on tile position + edge direction so the same save always produces
// the same cliff pattern.
function cliffBright(r: number, c: number, isEast: boolean): number {
  let h = ((r * 2654435761 + c * 2246822519 + (isEast ? 0 : 1234567891)) >>> 0);
  h = (h ^ (h >>> 16)) >>> 0;
  return 0.80 + (h & 0xff) / 255 * 0.22;
}

// Returns cliff variant index 0=soil, 1=rock, 2=damp
// for the wall between upper tile (higher elev) and lower tile (lower elev).
function cliffVariant(upperMat: string, lowerMat: string, lowerWaterLevel: number, lowerIsSea: boolean): 0 | 1 | 2 {
  if (lowerWaterLevel >= 0.35 || lowerIsSea) return 2;
  if (upperMat === 'rock' || lowerMat === 'rock') return 1;
  return 0;
}

// ramp 方向 + コーナーごとに、atlas 上の UV 座標 (u, v) を返す。
function rampCornerUV(rampDir: 'N'|'S'|'E'|'W', corner: 'NW'|'NE'|'SW'|'SE'): { u: number; v: number } {
  const cell = (rampDir === 'N' || rampDir === 'S') ? RAMP_NS_CELL : RAMP_EW_CELL;
  const b = atlasUVBounds(cell[0], cell[1]);
  // corner ごとの素の UV（cell 上の論理位置）
  // NW=(uMin,vMax), NE=(uMax,vMax), SW=(uMin,vMin), SE=(uMax,vMin)
  let u: number, v: number;
  switch (corner) {
    case 'NW': u = b.uMin; v = b.vMax; break;
    case 'NE': u = b.uMax; v = b.vMax; break;
    case 'SW': u = b.uMin; v = b.vMin; break;
    case 'SE': u = b.uMax; v = b.vMin; break;
  }
  // 方向別の反転：S は上下反転、W は左右反転
  if (rampDir === 'S') {
    // 上下入替：vMax ↔ vMin
    v = (v === b.vMax) ? b.vMin : b.vMax;
  } else if (rampDir === 'W') {
    u = (u === b.uMax) ? b.uMin : b.uMax;
  }
  return { u, v };
}
// 予約 (Σ-8-c-2 の overlay InstancedMesh で使用):
//   waterOv: [0, 2], mudOv: [1, 2], snowOv: [2, 2], wetOv: [3, 2]

// Σ-8-b-2 ramp 対応: タイル (c, r) の指定コーナー (NW/NE/SW/SE) における
// 「ramp 加味済み」の頂点 elev を返す。ramp が無いなら tile.elev、ramp の
// 高い辺側のコーナーなら elev + ELEV_STEP、低い辺側のコーナーなら elev そのまま。
const ELEV_STEP_RENDER = 25;
type Corner = 'NW' | 'NE' | 'SW' | 'SE';
function tileCornerElev(tile: import('../types').TerrainTile, corner: Corner): number {
  if (!tile.ramp) return tile.elev;
  const high = tile.elev + ELEV_STEP_RENDER;
  switch (tile.ramp) {
    case 'N': return (corner === 'NW' || corner === 'NE') ? high : tile.elev;
    case 'S': return (corner === 'SW' || corner === 'SE') ? high : tile.elev;
    case 'E': return (corner === 'NE' || corner === 'SE') ? high : tile.elev;
    case 'W': return (corner === 'NW' || corner === 'SW') ? high : tile.elev;
  }
}

// （Σ-8-c で per-tile geometry に移行、頂点共有を止めたので不要に）

// ============================================================
// 地形 BufferGeometry 構築（Σ-8-c per-tile 独立頂点型）
// 4 頂点/タイル × ROWS × COLS。共有頂点を持たないので、隣接タイルとの elev gap が
// あれば視覚的にギャップが出るが、≥1 段差は cliff variant IM が壁面で埋める。
// 各頂点に atlas UV を割り当てて material 別のテクスチャを per-tile で貼る。
// ============================================================
function buildTerrainGeo(terrain: import('../types').TerrainTile[][]): THREE.BufferGeometry {
  const ROWS = terrain.length || T_ROWS;
  const COLS = (terrain[0]?.length) || T_COLS;
  const N = ROWS * COLS;
  const pos = new Float32Array(N * 4 * 3);
  const col = new Float32Array(N * 4 * 3);
  const uv  = new Float32Array(N * 4 * 2);
  const idx = new Uint32Array(N * 6);
  fillTerrainAttrs(terrain, ROWS, COLS, pos, col, uv, idx);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv',       new THREE.BufferAttribute(uv,  2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  return geo;
}

function refreshTerrainGeo(geo: THREE.BufferGeometry, terrain: import('../types').TerrainTile[][]): void {
  const ROWS = terrain.length || T_ROWS;
  const COLS = (terrain[0]?.length) || T_COLS;
  const posA = geo.getAttribute('position') as THREE.BufferAttribute;
  const colA = geo.getAttribute('color')    as THREE.BufferAttribute;
  const uvA  = geo.getAttribute('uv')       as THREE.BufferAttribute;
  // attribute サイズが旧 shared-vertex 形式と一致しない場合は丸ごと作り直す
  const expectedV = ROWS * COLS * 4;
  if (posA.count !== expectedV) {
    const N = ROWS * COLS;
    const pos = new Float32Array(N * 4 * 3);
    const col = new Float32Array(N * 4 * 3);
    const uv  = new Float32Array(N * 4 * 2);
    const idx = new Uint32Array(N * 6);
    fillTerrainAttrs(terrain, ROWS, COLS, pos, col, uv, idx);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv',       new THREE.BufferAttribute(uv,  2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    return;
  }
  fillTerrainAttrs(terrain, ROWS, COLS,
    posA.array as Float32Array, colA.array as Float32Array,
    uvA.array as Float32Array, geo.index!.array as Uint32Array);
  posA.needsUpdate = true; colA.needsUpdate = true; uvA.needsUpdate = true;
  geo.index!.needsUpdate = true;
  geo.computeVertexNormals();
}

function fillTerrainAttrs(
  terrain: import('../types').TerrainTile[][],
  ROWS: number, COLS: number,
  pos: Float32Array, col: Float32Array, uv: Float32Array, idx: Uint32Array,
): void {
  const TILE = TERRAIN_TILE_SIZE;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tile = terrain[r]![c]!;
      const baseV = (r * COLS + c) * 4;
      const baseI = (r * COLS + c) * 6;
      // 4 corners (ramp 加味の corner elev)
      const xL = c * TILE, xR = (c + 1) * TILE;
      const zN = r * TILE, zS = (r + 1) * TILE;
      const eNW = tileCornerElev(tile, 'NW') * ELEV_SCALE;
      const eNE = tileCornerElev(tile, 'NE') * ELEV_SCALE;
      const eSW = tileCornerElev(tile, 'SW') * ELEV_SCALE;
      const eSE = tileCornerElev(tile, 'SE') * ELEV_SCALE;
      // vertex 順: 0=NW, 1=NE, 2=SW, 3=SE
      pos[(baseV+0)*3] = xL; pos[(baseV+0)*3+1] = eNW; pos[(baseV+0)*3+2] = zN;
      pos[(baseV+1)*3] = xR; pos[(baseV+1)*3+1] = eNE; pos[(baseV+1)*3+2] = zN;
      pos[(baseV+2)*3] = xL; pos[(baseV+2)*3+1] = eSW; pos[(baseV+2)*3+2] = zS;
      pos[(baseV+3)*3] = xR; pos[(baseV+3)*3+1] = eSE; pos[(baseV+3)*3+2] = zS;
      // UV: ramp タイルは方向別の ramp cell、それ以外は material 別 atlas cell
      if (tile.ramp) {
        const uvNW = rampCornerUV(tile.ramp, 'NW');
        const uvNE = rampCornerUV(tile.ramp, 'NE');
        const uvSW = rampCornerUV(tile.ramp, 'SW');
        const uvSE = rampCornerUV(tile.ramp, 'SE');
        uv[(baseV+0)*2] = uvNW.u; uv[(baseV+0)*2+1] = uvNW.v;
        uv[(baseV+1)*2] = uvNE.u; uv[(baseV+1)*2+1] = uvNE.v;
        uv[(baseV+2)*2] = uvSW.u; uv[(baseV+2)*2+1] = uvSW.v;
        uv[(baseV+3)*2] = uvSE.u; uv[(baseV+3)*2+1] = uvSE.v;
      } else {
        const cell = MAT_CELL[tile.material] ?? MAT_CELL['grass']!;
        const uvB = atlasUVBounds(cell[0], cell[1]);
        uv[(baseV+0)*2] = uvB.uMin; uv[(baseV+0)*2+1] = uvB.vMax;
        uv[(baseV+1)*2] = uvB.uMax; uv[(baseV+1)*2+1] = uvB.vMax;
        uv[(baseV+2)*2] = uvB.uMin; uv[(baseV+2)*2+1] = uvB.vMin;
        uv[(baseV+3)*2] = uvB.uMax; uv[(baseV+3)*2+1] = uvB.vMin;
      }
      // Σ-8-c-2: vertex color tint で wetness / mud / snowCoverage を表現。
      // atlas は multiply で重なるので白(1,1,1)が基準、tint で暗化/茶/白を blend する。
      let tR = 1.0, tG = 1.0, tB = 1.0;
      // 1) wetness：暗化 + 軽い青寄せ
      const wet = Math.min(1, Math.max(0, tile.wetness ?? 0));
      if (wet > 0.05) {
        tR -= wet * 0.20;
        tG -= wet * 0.15;
        tB -= wet * 0.05;
      }
      // 2) mud：茶色側へ blend（強度 0.6 maxの multiply 風）
      const mud = Math.min(1, Math.max(0, tile.mud ?? 0));
      if (mud > 0.05) {
        const w = mud * 0.6;
        tR = tR * (1 - w) + 0.50 * w;
        tG = tG * (1 - w) + 0.34 * w;
        tB = tB * (1 - w) + 0.18 * w;
      }
      // 3) snowCoverage：白側へ blend（下地が少し残るよう 0.7 max）
      const snow = Math.min(1, Math.max(0, tile.snowCoverage ?? 0));
      if (snow > 0.05) {
        const w = snow * 0.7;
        tR = tR * (1 - w) + 1.00 * w;
        tG = tG * (1 - w) + 1.00 * w;
        tB = tB * (1 - w) + 0.98 * w;
      }
      for (let k = 0; k < 4; k++) {
        col[(baseV+k)*3]   = tR;
        col[(baseV+k)*3+1] = tG;
        col[(baseV+k)*3+2] = tB;
      }
      // indices: 2 triangles. 対角線 NE-SW で分割
      idx[baseI+0] = baseV + 0;  // NW
      idx[baseI+1] = baseV + 2;  // SW
      idx[baseI+2] = baseV + 1;  // NE
      idx[baseI+3] = baseV + 1;  // NE
      idx[baseI+4] = baseV + 2;  // SW
      idx[baseI+5] = baseV + 3;  // SE
    }
  }
}


// ============================================================
// Toon グラジェントマップ（4段階）
// ============================================================
function makeGradMap(): THREE.DataTexture {
  // 5 段階に増やしつつ、影側を強くダーク・光側を強くブライトに振る。
  // [70,130,185,255] → [40,90,140,200,255]：陰側 40 で深いシャドウ、光側 255 でハイライト
  const d = new Uint8Array([40,90,140,200,255]);
  const t = new THREE.DataTexture(d,5,1,THREE.RedFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

// ============================================================
// 地形標高ルックアップ（buildTerrainGeo と同じ頂点平滑化を bilinear で再現）
// タイル中心 elev をそのまま返すとメッシュ表面と一致せず、
// 周囲より低い / 高いタイルでキャラが埋もれたり浮いたりしていた。
// ============================================================
function elevAt(terrain: import('../types').TerrainTile[][], wx: number, wy: number): number {
  // Σ-8-fix-3: sim 側 getElevation と同じ実装（terrain/query.ts elevAtTileSurface）に統一。
  // ELEV_SCALE は描画側で掛ける（sim は生 elev 値で扱う）。
  return elevAtTileSurface(terrain, wx, wy) * ELEV_SCALE;
}

// ============================================================
// スプライトメッシュファクトリ（Y軸ビルボード：+Z 向き平面）
// ============================================================
function spriteMesh(w: number, h: number, tex: THREE.Texture): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, alphaTest: 0.08,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 2;  // Σ-8-c: 崖壁面 (renderOrder 0) より後に描いて手前に出す
  return m;
}

// ============================================================
// Sigma-8 generated sheet sprites
// ============================================================
let featureSheetTex: THREE.Texture | null = null;
let propSheetTex: THREE.Texture | null = null;

function atlasPlaneGeometry(cell: [number, number], w: number, h: number): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(w, h);
  const b = atlasUVBounds(cell[0], cell[1]);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  uv.setXY(0, b.uMin, b.vMax);
  uv.setXY(1, b.uMax, b.vMax);
  uv.setXY(2, b.uMin, b.vMin);
  uv.setXY(3, b.uMax, b.vMin);
  uv.needsUpdate = true;
  return geo;
}

function atlasSprite(w: number, h: number, tex: THREE.Texture, cell: [number, number]): THREE.Mesh {
  const mesh = new THREE.Mesh(
    atlasPlaneGeometry(cell, w, h),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  mesh.renderOrder = 2;
  return mesh;
}

function makeContactShadow(rx: number, rz: number): THREE.Mesh {
  const geo = new THREE.CircleGeometry(1, 24);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: 0x1a1208,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  }));
  mesh.scale.set(rx, rz, 1);
  mesh.position.y = 1;
  mesh.renderOrder = 1;
  return mesh;
}

const FEATURE_SPRITE_CELL: Partial<Record<FeatureKind, [number, number]>> = {
  house: [0, 0],
  farm: [2, 0],
  water: [0, 1],
  well: [1, 1],
  firewatch: [2, 1],
  sawmill: [3, 1],
  shrine: [0, 2],
  kiln: [1, 2],
  generator: [2, 2],
  streetlamp: [3, 2],
  powerline: [0, 3],
  pasture: [1, 3],
  loom: [2, 3],
};
const FEATURE_SPRITE_SIZE: Partial<Record<FeatureKind, [number, number]>> = {
  house: [92, 82],
  farm: [86, 60],
  water: [80, 58],
  well: [64, 72],
  firewatch: [68, 96],
  sawmill: [90, 74],
  shrine: [78, 76],
  kiln: [70, 72],
  generator: [82, 66],
  streetlamp: [44, 92],
  powerline: [62, 92],
  pasture: [88, 62],
  loom: [78, 76],
};

const GROUND_PROP_DEFS = [
  { cell: [0, 0] as [number, number], w: 24, h: 28, tags: ['grass'] },
  { cell: [1, 0] as [number, number], w: 30, h: 38, tags: ['grass'] },
  { cell: [2, 0] as [number, number], w: 30, h: 34, tags: ['flower'] },
  { cell: [3, 0] as [number, number], w: 34, h: 34, tags: ['shrub'] },
  { cell: [0, 1] as [number, number], w: 34, h: 42, tags: ['shrub'] },
  { cell: [1, 1] as [number, number], w: 30, h: 30, tags: ['mushroom'] },
  { cell: [2, 1] as [number, number], w: 26, h: 18, tags: ['rock'] },
  { cell: [3, 1] as [number, number], w: 34, h: 32, tags: ['rock'] },
  { cell: [0, 2] as [number, number], w: 32, h: 34, tags: ['wood'] },
  { cell: [1, 2] as [number, number], w: 42, h: 28, tags: ['wood'] },
  { cell: [2, 2] as [number, number], w: 30, h: 26, tags: ['soil'] },
  { cell: [3, 2] as [number, number], w: 34, h: 28, tags: ['soil'] },
];

function tileHash01(x: number, y: number, seed = 1, salt = 0): number {
  let n = (x * 374761393 + y * 668265263 + seed * 2246822519 + salt * 3266489917) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 0xffffffff;
}

function featureSpriteCell(f: import('../types').Feature): [number, number] | null {
  if (f.devLevel < 2) return [3, 3];
  if (f.kind === 'farm' && (f.saturated || f.wateredByTile)) return [3, 0];
  if (f.kind === 'house' && f.devLevel >= 2) return [1, 0];
  return FEATURE_SPRITE_CELL[f.kind] ?? null;
}

function makeFeatureSpriteGroup(f: import('../types').Feature): THREE.Group | null {
  if (!featureSheetTex) return null;
  const cell = featureSpriteCell(f);
  if (!cell) return null;
  const [w, h] = f.devLevel < 2 ? [74, 62] : (FEATURE_SPRITE_SIZE[f.kind] ?? [72, 66]);
  const g = new THREE.Group();
  g.add(makeContactShadow(Math.max(18, w * 0.34), Math.max(10, w * 0.18)));
  const sprite = atlasSprite(w, h, featureSheetTex, cell);
  sprite.position.y = h / 2;
  g.add(sprite);
  if (f.devLevel >= 2 && f.devLevel > 2) g.add(makeLvLabel(f.devLevel));
  return g;
}

// ============================================================
// 日時計ティント
// ============================================================
const PHASE_TINT: Record<DayPhase,{sky:number;amb:number;dir:number;dirC:number}> = {
  morning: {sky:0xc8d7d5, amb:0.55, dir:0.85, dirC:0xffcc88},
  noon:    {sky:0x87ceeb, amb:0.70, dir:1.00, dirC:0xffffff},
  evening: {sky:0x9ca7a8, amb:0.45, dir:0.70, dirC:0xff9a50},
  night:   {sky:0x0a1020, amb:0.15, dir:0.20, dirC:0x6080b0},
};

// キャラクタースプライト用手動ティント（MeshBasicMaterial はライト応答なし）
const PHASE_CHAR: Record<DayPhase,[number,number,number]> = {
  morning: [1.00,0.88,0.70],
  noon:    [1.00,1.00,1.00],
  evening: [0.90,0.65,0.45],
  night:   [0.22,0.28,0.40],
};
const WEATHER_CHAR: Partial<Record<string,[number,number,number]>> = {
  storm:      [0.55,0.60,0.65],
  heavy_rain: [0.65,0.72,0.80],
  fog:        [0.80,0.82,0.85],
  snow:       [0.85,0.90,1.00],
  heatwave:   [1.00,0.70,0.45],
};

// ============================================================
// feature 3D モデル（Σ-5-b）
// ============================================================
function toonMat(color: number, opacity=1.0): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, opacity, transparent: opacity<1 });
}
function basicMat(color: number, opacity=1.0): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, opacity, transparent: opacity<1, side: THREE.DoubleSide });
}

// Lv ビルボード（建物と同じ style、devLevel>=2 で表示）
function makeLvLabel(lv: number): THREE.Mesh {
  const cv = document.createElement('canvas'); cv.width=64; cv.height=32;
  const ctx = cv.getContext('2d')!;
  ctx.font='bold 20px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.strokeStyle='#2a1a0a'; ctx.lineWidth=4; ctx.strokeText(`Lv${lv}`,32,16);
  ctx.fillStyle='#ffffff'; ctx.fillText(`Lv${lv}`,32,16);
  const t=new THREE.CanvasTexture(cv); t.minFilter=THREE.LinearFilter;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(32,16),
    new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
  m.position.y=55;
  return m;
}

// 建設中オーバーレイ：足場 4 本 + 半透明本体を返す
function makeScaffoldGroup(opacity: number): THREE.Group {
  const g = new THREE.Group();
  // 4隅に細い足場柱
  for (const [sx, sz] of [[-14,-14],[14,-14],[-14,14],[14,14]] as [number,number][]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.5,36,4), toonMat(0x8b6030, 0.9));
    pole.position.set(sx, 18, sz); g.add(pole);
  }
  // 横板
  const plank = new THREE.Mesh(new THREE.BoxGeometry(32,3,4), toonMat(0xa07840, 0.85));
  plank.position.set(0, 22, 0); g.add(plank);
  // 🔨 絵文字ビルボード
  const cv = document.createElement('canvas'); cv.width=48; cv.height=48;
  const ctx = cv.getContext('2d')!;
  ctx.font='32px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('🔨', 24, 26);
  const t = new THREE.CanvasTexture(cv); t.minFilter = THREE.LinearFilter;
  const hammer = new THREE.Mesh(new THREE.PlaneGeometry(20,20),
    new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
  hammer.position.set(0, 44, 0); g.add(hammer);
  void opacity;
  return g;
}

function makeFeatureGroup(f: import('../types').Feature): THREE.Group {
  const spriteGroup = makeFeatureSpriteGroup(f);
  if (spriteGroup) return spriteGroup;

  const g = new THREE.Group();
  const lv = f.devLevel;

  // 建設中（devLevel < 2）は足場オーバーレイ + 半透明本体
  if (lv < 2) {
    const opac = lv === 0 ? 0.30 : 0.60;
    // 簡略プレースホルダー（茶色の土台）
    const base = new THREE.Mesh(new THREE.CylinderGeometry(18,18,4,8), toonMat(0x7a5230, opac));
    base.position.y = 2; g.add(base);
    const scaffold = makeScaffoldGroup(opac);
    g.add(scaffold);
    g.userData.underConstruction = true;
    return g;
  }

  switch(f.kind) {
    case 'water': {
      // 青い池（水平面 + 波紋リング）
      const base = new THREE.Mesh(new THREE.CylinderGeometry(26,26,4,12),toonMat(0x3a6ea0));
      base.position.y=2; g.add(base);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(24,24,2,12),
        new THREE.MeshBasicMaterial({color:0x5cacf0,transparent:true,opacity:0.7}));
      top.position.y=5; g.add(top);
      break;
    }
    case 'channel': {
      // 細長い溝（地面に埋め込む感じ）+ watered 時は内部を明青に
      const box = new THREE.Mesh(new THREE.BoxGeometry(36,8,12),toonMat(f.saturated?0x5cc4f0:0x4a3018));
      box.position.y=2; g.add(box);
      if (f.saturated) {
        const water = new THREE.Mesh(new THREE.BoxGeometry(32,4,8),
          new THREE.MeshBasicMaterial({color:0x80d8ff,transparent:true,opacity:0.8}));
        water.position.y=4; g.add(water);
      }
      break;
    }
    case 'farm': {
      // 茶色の畑ベース + 成長段階に応じた作物ビルボード
      const bed = new THREE.Mesh(new THREE.BoxGeometry(36,6,36),toonMat(0x7a5230));
      bed.position.y=3; g.add(bed);
      // 畦（grid lines）
      for(let dx=-12;dx<=12;dx+=12){
        const ridge=new THREE.Mesh(new THREE.BoxGeometry(2,8,32),toonMat(0x5a3820));
        ridge.position.set(dx,4,0); g.add(ridge);
      }
      // 作物（devLevel で成長段階）
      if(lv>=1){
        const cropH = lv===1?8: lv===2?16:22;
        const cropCol= lv===1?0x4a7a20: lv===2?0x5a9a30:0xc8a820;
        for(let cx=-10;cx<=10;cx+=10) for(let cz=-10;cz<=10;cz+=10){
          const crop=new THREE.Mesh(new THREE.PlaneGeometry(8,cropH),
            new THREE.MeshBasicMaterial({color:cropCol,side:THREE.DoubleSide,transparent:true}));
          crop.position.set(cx,cropH/2+6,cz); g.add(crop);
        }
      }
      if(lv>=2) g.add(makeLvLabel(lv));
      // Σ-7-c: 雨水/自然水で潤っている場合は水色リング
      if(f.wateredByTile){
        const ring = new THREE.Mesh(new THREE.TorusGeometry(22,1.5,6,24),
          new THREE.MeshBasicMaterial({color:0x88ccff,transparent:true,opacity:0.85,side:THREE.DoubleSide}));
        ring.rotation.x=-Math.PI/2;
        ring.position.y=8;
        g.add(ring);
      }
      break;
    }
    case 'path': {
      const box=new THREE.Mesh(new THREE.BoxGeometry(36,4,12),toonMat(0x8b7048));
      box.position.y=2; g.add(box);
      break;
    }
    case 'house': {
      const wall=new THREE.Mesh(new THREE.BoxGeometry(32,24,32),toonMat(0xb85a3a));
      wall.position.y=12; g.add(wall);
      const roof=new THREE.Mesh(new THREE.ConeGeometry(24,16,4),toonMat(0x5a311d));
      roof.position.y=32; g.add(roof);
      if(lv>=2) g.add(makeLvLabel(lv));
      break;
    }
    case 'well': {
      const shaft=new THREE.Mesh(new THREE.CylinderGeometry(8,8,20,8),toonMat(0x7a6050));
      shaft.position.y=10; g.add(shaft);
      const rim=new THREE.Mesh(new THREE.TorusGeometry(8,2,6,12),toonMat(0x5a4030));
      rim.rotation.x=Math.PI/2; rim.position.y=22; g.add(rim);
      const roof2=new THREE.Mesh(new THREE.ConeGeometry(12,10,4),toonMat(0x5a311d));
      roof2.position.y=32; g.add(roof2);
      break;
    }
    case 'firewatch': {
      const legs=new THREE.Mesh(new THREE.CylinderGeometry(3,5,48,4),toonMat(0x7a5030));
      legs.position.y=24; g.add(legs);
      const cabin=new THREE.Mesh(new THREE.BoxGeometry(20,12,20),toonMat(0x8d5030));
      cabin.position.y=52; g.add(cabin);
      const froof=new THREE.Mesh(new THREE.ConeGeometry(14,10,4),toonMat(0x4a2818));
      froof.position.y=65; g.add(froof);
      break;
    }
    case 'sawmill': {
      const body=new THREE.Mesh(new THREE.BoxGeometry(44,24,36),toonMat(0x8d6238));
      body.position.y=12; g.add(body);
      const sroof=new THREE.Mesh(new THREE.ConeGeometry(28,20,4),toonMat(0x5a3820));
      sroof.position.y=34; g.add(sroof);
      const log=new THREE.Mesh(new THREE.CylinderGeometry(5,5,52,8),toonMat(0xa07040));
      log.rotation.z=Math.PI/2; log.position.set(4,6,0); g.add(log);
      break;
    }
    case 'shrine': {
      // 赤鳥居（柱 2 本 + 横木 2 本）
      for(const sx of [-14,14]){
        const pillar=new THREE.Mesh(new THREE.CylinderGeometry(3,3,52,6),toonMat(0xd42020));
        pillar.position.set(sx,26,0); g.add(pillar);
      }
      const beam1=new THREE.Mesh(new THREE.BoxGeometry(40,6,6),toonMat(0xd42020));
      beam1.position.y=50; g.add(beam1);
      const beam2=new THREE.Mesh(new THREE.BoxGeometry(36,5,5),toonMat(0xd42020));
      beam2.position.y=42; g.add(beam2);
      // 社
      const honden=new THREE.Mesh(new THREE.BoxGeometry(28,20,24),toonMat(0x8b4c2c));
      honden.position.set(0,10,28); g.add(honden);
      const hroof=new THREE.Mesh(new THREE.ConeGeometry(20,14,4),toonMat(0x3a1a0a));
      hroof.position.set(0,28,28); g.add(hroof);
      break;
    }
    case 'generator': {
      const body2=new THREE.Mesh(new THREE.CylinderGeometry(14,14,28,8),toonMat(0x6a6070));
      body2.position.y=14; g.add(body2);
      const chimney=new THREE.Mesh(new THREE.CylinderGeometry(4,4,20,6),toonMat(0x4a4040));
      chimney.position.set(8,38,0); g.add(chimney);
      const cap=new THREE.Mesh(new THREE.CylinderGeometry(6,4,4,6),toonMat(0x3a3030));
      cap.position.set(8,50,0); g.add(cap);
      break;
    }
    case 'streetlamp': {
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(2,2,44,6),toonMat(0x5a5040));
      pole.position.y=22; g.add(pole);
      const head=new THREE.Mesh(new THREE.IcosahedronGeometry(8,0),
        new THREE.MeshBasicMaterial({color:f.saturated?0xffe880:0x888060}));
      head.position.y=48; g.add(head);
      break;
    }
    case 'powerline': {
      const ppole=new THREE.Mesh(new THREE.CylinderGeometry(2,2,36,4),toonMat(0x6a5848));
      ppole.position.y=18; g.add(ppole);
      const xbar=new THREE.Mesh(new THREE.BoxGeometry(24,4,4),toonMat(0x5a4838));
      xbar.position.y=36; g.add(xbar);
      break;
    }
    case 'kiln': {
      const kbody=new THREE.Mesh(new THREE.CylinderGeometry(16,20,28,8),toonMat(0x8a5025));
      kbody.position.y=14; g.add(kbody);
      const top2=new THREE.Mesh(new THREE.ConeGeometry(14,14,8),toonMat(0x6a3015));
      top2.position.y=35; g.add(top2);
      const opening=new THREE.Mesh(new THREE.BoxGeometry(12,12,4),toonMat(0x1a0a00));
      opening.position.set(0,10,18); g.add(opening);
      break;
    }
    case 'pasture': {
      // 柵 4 本で囲む
      const fenceH=10, fenceW=50;
      for(const [fx,fz,rot] of [[0,25,0],[0,-25,0],[25,0,Math.PI/2],[-25,0,Math.PI/2]] as [number,number,number][]){
        const fence=new THREE.Mesh(new THREE.BoxGeometry(fenceW,fenceH,3),toonMat(0xa08060));
        fence.position.set(fx,fenceH/2,fz); fence.rotation.y=rot; g.add(fence);
      }
      // 地面
      const floor2=new THREE.Mesh(new THREE.BoxGeometry(50,2,50),toonMat(0x7ab060,0.8));
      floor2.position.y=1; g.add(floor2);
      break;
    }
    case 'loom': {
      const lbody=new THREE.Mesh(new THREE.BoxGeometry(30,20,24),toonMat(0x8a6040));
      lbody.position.y=10; g.add(lbody);
      const lroof=new THREE.Mesh(new THREE.ConeGeometry(20,12,4),toonMat(0x5a3820));
      lroof.position.y=26; g.add(lroof);
      // 縦糸の棒
      for(let xi=-8;xi<=8;xi+=4){
        const thread=new THREE.Mesh(new THREE.BoxGeometry(2,22,2),basicMat(0xf0d890,0.9));
        thread.position.set(xi,20,0); g.add(thread);
      }
      break;
    }
    default: {
      // 未知 feature: 旧来の円ディスク（フォールバック）
      const fallback=new THREE.Mesh(new THREE.CylinderGeometry(16,16,4,12),toonMat(0x8b7048));
      fallback.position.y=2; g.add(fallback);
    }
  }
  return g;
}
function obsTex(kind: string): THREE.Texture {
  return makeCanvasTex((ctx,sz)=>{
    const half=sz/2;
    if (kind==='rock'){
      ctx.beginPath(); ctx.arc(half,half+4,16,0,Math.PI*2);
      ctx.fillStyle='#7a7a7a'; ctx.fill();
      ctx.strokeStyle='#3a3a3a'; ctx.lineWidth=1.5; ctx.stroke();
    } else if (kind==='stump'){
      ctx.fillStyle='#5a3a1a';
      ctx.fillRect(half-10,half-6,20,20);
      ctx.beginPath(); ctx.arc(half,half-6,10,0,Math.PI*2);
      ctx.fillStyle='#7a5a3a'; ctx.fill();
      ctx.strokeStyle='#2a1a0a'; ctx.lineWidth=1.5; ctx.stroke();
    } else {
      ctx.beginPath(); ctx.ellipse(half,half+2,16,10,0,0,Math.PI*2);
      ctx.fillStyle='#4a6a2a'; ctx.fill();
      ctx.strokeStyle='#1a3a0a'; ctx.lineWidth=1.5; ctx.stroke();
    }
  },48);
}
function npcCircleTex(color: number, r=28): THREE.Texture {
  const c6=`#${color.toString(16).padStart(6,'0')}`;
  return makeCanvasTex((ctx,sz)=>{
    ctx.beginPath(); ctx.arc(sz/2,sz/2,r,0,Math.PI*2);
    ctx.fillStyle=c6; ctx.fill();
    ctx.strokeStyle='#3a2a1a'; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle='#3a2a1a';
    ctx.beginPath(); ctx.arc(sz/2-7,sz/2-2,3,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(sz/2+7,sz/2-2,3,0,Math.PI*2); ctx.fill();
  });
}

function wolfTex(): THREE.Texture {
  return makeCanvasTex((ctx,sz)=>{
    const h=sz/2;
    ctx.fillStyle='#4a3a30';
    ctx.beginPath(); ctx.ellipse(h,h+4,20,10,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(h+16,h-6,11,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#7a6a60';
    ctx.beginPath(); ctx.moveTo(h+10,h-14); ctx.lineTo(h+16,h-20); ctx.lineTo(h+22,h-14); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#ff8820';
    ctx.beginPath(); ctx.arc(h+20,h-8,2.5,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#2a1a10'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.ellipse(h,h+4,20,10,0,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(h+16,h-6,11,0,Math.PI*2); ctx.stroke();
  },80);
}

// ============================================================
// createStage — メインエクスポート
// ============================================================
export async function createStage(host: HTMLElement): Promise<StageHandle> {
  // --- レンダラー ---
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.setClearColor(0x87ceeb);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  // --- シーン ---
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x87ceeb, 6000, 18000);

  // --- カメラ fov=20°、45°俯瞰固定 ---
  const camera = new THREE.PerspectiveCamera(20, host.clientWidth/Math.max(1,host.clientHeight), 1, 50000);

  // --- ライティング ---
  // 環境光を 0.6 → 0.42 に下げて、directional light の影をハッキリ出す。
  // 結果：高地と低地のコントラスト UP、地形の凹凸が視認しやすい。
  const ambLight = new THREE.AmbientLight(0xffffff, 0.42);
  scene.add(ambLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.25);
  dirLight.position.set(800, 2000, -600);
  scene.add(dirLight);

  // --- グラジェントマップ（Toon）---
  const gradMap = makeGradMap();

  // --- 地形メッシュ ---
  // Σ-8-c: vertexColors は light/cliff tint を残しつつ、map に atlas を貼ると multiply される。
  const terrainMat = new THREE.MeshToonMaterial({ vertexColors:true, gradientMap:gradMap });
  const terrainMesh = new THREE.Mesh(new THREE.BufferGeometry(), terrainMat);
  scene.add(terrainMesh);
  let terrainGeo: THREE.BufferGeometry|null = null;
  let terrainBuiltAt = -9999;

  // --- 遠景の水面/地形外バックドロップ ---
  // カメラを引いた時に renderer clear color が画面下へ大きく出ると、夕方などで
  // オレンジの空白に見える。地形より低い大判水面を敷いて、箱庭の外周を水で受ける。
  const worldBackdrop = new THREE.Mesh(
    (() => { const g=new THREE.PlaneGeometry(CONFIG.WORLD_W * 4, CONFIG.WORLD_H * 4); g.rotateX(-Math.PI/2); return g; })(),
    new THREE.MeshBasicMaterial({color:0x4f9fc2,side:THREE.DoubleSide}),
  );
  worldBackdrop.position.set(CONFIG.WORLD_W/2, -12, CONFIG.WORLD_H/2);
  worldBackdrop.renderOrder = -10;
  scene.add(worldBackdrop);

  // --- 海面（isSea タイルだけに水面を置く。巨大プレーンはズームアウト時に矩形破綻する）---
  // R2: sea は inland water と色調を分離。深い青緑（ocean tone）で統一感を持たせる。
  // instanceColor で浅瀬/深海の variation を付けてフラット感を減らす。
  const _seaTileGeo = new THREE.PlaneGeometry(TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE);
  _seaTileGeo.rotateX(-Math.PI/2);
  const seaTileIM = new THREE.InstancedMesh(
    _seaTileGeo,
    new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.84,depthWrite:false,side:THREE.DoubleSide}),
    T_COLS*T_ROWS,
  );
  seaTileIM.count = 0;
  scene.add(seaTileIM);

  // --- R2: 動的水たまりタイル（waterLevel >= 0.05 のタイル毎に配置）---
  // 4 段階を danger threshold 0.35 に合わせて設計する：
  //   damp    (0.05-0.20): 湿り地面、safe、薄い水色
  //   puddle  (0.20-0.35): 水たまり、safe、空色
  //   shallow (0.35-0.60): 危険水域（chibi は回避、溺死リスク）、濃い青
  //   deep    (0.60+):     深い危険水域（即溺死リスク）、暗い深青
  // atlas water cell UV を貼り、rippleTex で波紋アニメーション。
  const _waterTileGeo = new THREE.PlaneGeometry(TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE);
  _waterTileGeo.rotateX(-Math.PI/2);
  {
    const wuv = atlasUVBounds(WATER_CELL[0], WATER_CELL[1]);
    const ua = _waterTileGeo.attributes.uv as THREE.BufferAttribute;
    ua.setXY(0, wuv.uMin, wuv.vMax);
    ua.setXY(1, wuv.uMax, wuv.vMax);
    ua.setXY(2, wuv.uMin, wuv.vMin);
    ua.setXY(3, wuv.uMax, wuv.vMin);
    ua.needsUpdate = true;
  }
  // damp: safe wet ground（ほとんど見えない）
  const waterDampIM = new THREE.InstancedMesh(_waterTileGeo,
    new THREE.MeshBasicMaterial({color:0xa8dcf2,transparent:true,opacity:0.28,depthWrite:false,side:THREE.DoubleSide}),
    T_COLS*T_ROWS);
  // puddle: safe puddle（空色、歩ける）
  const waterShallowIM = new THREE.InstancedMesh(_waterTileGeo,
    new THREE.MeshBasicMaterial({color:0x40b8f5,transparent:true,opacity:0.58,depthWrite:false,side:THREE.DoubleSide}),
    T_COLS*T_ROWS);
  // shallow danger: 危険水域（濃い青、chibi 回避ライン ≥0.35）
  const waterMidIM = new THREE.InstancedMesh(_waterTileGeo,
    new THREE.MeshBasicMaterial({color:0x1070d8,transparent:true,opacity:0.80,depthWrite:false,side:THREE.DoubleSide}),
    T_COLS*T_ROWS);
  // deep danger: 深い危険（暗い深青、ほぼ不透明）
  const waterDeepIM = new THREE.InstancedMesh(_waterTileGeo,
    new THREE.MeshBasicMaterial({color:0x082870,transparent:true,opacity:0.94,depthWrite:false,side:THREE.DoubleSide}),
    T_COLS*T_ROWS);
  waterDampIM.count = 0; waterShallowIM.count = 0; waterMidIM.count = 0; waterDeepIM.count = 0;
  scene.add(waterDampIM, waterShallowIM, waterMidIM, waterDeepIM);

  // R2: 危険水域パルスオーバーレイ（wl >= 0.35 タイルに赤橙の点滅を重ねて警告）
  const waterDangerIM = new THREE.InstancedMesh(
    _waterTileGeo,
    new THREE.MeshBasicMaterial({color:0xff5020,transparent:true,opacity:0.15,depthWrite:false,side:THREE.DoubleSide}),
    T_COLS*T_ROWS,
  );
  waterDangerIM.count = 0;
  scene.add(waterDangerIM);

  // ==========================================================
  // R1: 崖の壁面 InstancedMesh (3 バリアント + 底面コンタクトシャドウ)
  // soil (デフォルト) / rock (岩質) / damp (水辺) の 3 セルを atlas から使い分け、
  // 壁ごとに deterministic brightness variation を加えて「壁紙感」を減らす。
  // 各壁の根本には半透明の水平シャドウストリップを置いて地面との接点を読ませる。
  // ==========================================================
  let MAX_CLIFF_CAPACITY = 2400;

  // 崖壁面用 UV 付き PlaneGeometry を atlas cell から生成
  function makeCliffGeoForCell(col: number, row: number): THREE.PlaneGeometry {
    const geo = new THREE.PlaneGeometry(1, 1);
    const cuv = atlasUVBounds(col, row);
    const ua = geo.attributes.uv as THREE.BufferAttribute;
    ua.setXY(0, cuv.uMin, cuv.vMax);
    ua.setXY(1, cuv.uMax, cuv.vMax);
    ua.setXY(2, cuv.uMin, cuv.vMin);
    ua.setXY(3, cuv.uMax, cuv.vMin);
    ua.needsUpdate = true;
    return geo;
  }
  const _cliffSoilGeo = makeCliffGeoForCell(CLIFF_CELL_SOIL[0], CLIFF_CELL_SOIL[1]);
  const _cliffRockGeo = makeCliffGeoForCell(CLIFF_CELL_ROCK[0], CLIFF_CELL_ROCK[1]);
  const _cliffDampGeo = makeCliffGeoForCell(CLIFF_CELL_DAMP[0], CLIFF_CELL_DAMP[1]);

  // 底面コンタクトシャドウ用の水平 PlaneGeometry (1×1、X 軸回転で地面に寝かせる)
  const _cliffShadowGeo = new THREE.PlaneGeometry(1, 1);
  _cliffShadowGeo.rotateX(-Math.PI / 2);

  // 崖壁面 IM を atlas セル付き MeshToonMaterial で作成
  function makeCliffVariantIM(geo: THREE.PlaneGeometry, cap: number): THREE.InstancedMesh {
    const im = new THREE.InstancedMesh(
      geo,
      new THREE.MeshToonMaterial({
        color: 0x5a4030,
        side: THREE.DoubleSide,
        gradientMap: gradMap,
        // 壁面が depth-wise 少し奥に描画されるよう polygonOffset で
        // ビルボードちびわふが壁に埋もれる視覚事故を抑える。
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
      cap,
    );
    im.count = 0;
    im.castShadow = false;
    im.receiveShadow = false;
    im.renderOrder = 0;
    return im;
  }

  // 底面シャドウ IM（半透明の暗い水平ストリップ）
  function makeCliffShadowIM(cap: number): THREE.InstancedMesh {
    const im = new THREE.InstancedMesh(
      _cliffShadowGeo,
      new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false,
      }),
      cap,
    );
    im.count = 0;
    im.castShadow = false;
    im.receiveShadow = false;
    im.renderOrder = 0;
    return im;
  }

  let cliffSoilIM = makeCliffVariantIM(_cliffSoilGeo, MAX_CLIFF_CAPACITY);
  let cliffRockIM = makeCliffVariantIM(_cliffRockGeo, MAX_CLIFF_CAPACITY);
  let cliffDampIM = makeCliffVariantIM(_cliffDampGeo, MAX_CLIFF_CAPACITY);
  let cliffShadowIM = makeCliffShadowIM(MAX_CLIFF_CAPACITY);
  scene.add(cliffSoilIM, cliffRockIM, cliffDampIM, cliffShadowIM);

  // rebuild で総数が容量を超えたら全 IM を 2 倍に拡張する
  function ensureCliffCapacity(needed: number) {
    if (needed <= MAX_CLIFF_CAPACITY) return;
    while (MAX_CLIFF_CAPACITY < needed) MAX_CLIFF_CAPACITY *= 2;
    const cap = MAX_CLIFF_CAPACITY;

    const rebuildVariant = (old: THREE.InstancedMesh, geo: THREE.PlaneGeometry) => {
      const oldMat = old.material as THREE.MeshToonMaterial;
      const newIM = makeCliffVariantIM(geo, cap);
      const newMat = newIM.material as THREE.MeshToonMaterial;
      if (oldMat.map) { newMat.map = oldMat.map; newMat.color.setHex(0xffffff); newMat.needsUpdate = true; }
      scene.remove(old); old.dispose(); scene.add(newIM);
      return newIM;
    };
    cliffSoilIM = rebuildVariant(cliffSoilIM, _cliffSoilGeo);
    cliffRockIM = rebuildVariant(cliffRockIM, _cliffRockGeo);
    cliffDampIM = rebuildVariant(cliffDampIM, _cliffDampGeo);

    const oldShadow = cliffShadowIM;
    cliffShadowIM = makeCliffShadowIM(cap);
    scene.remove(oldShadow); oldShadow.dispose(); scene.add(cliffShadowIM);
  }

  // ==========================================================
  // Σ-8-e Preview ghost（hover でタイル強調）
  // タイルクリックする前に「ここを編集する」を見せる半透明オーバーレイ。
  // ブラシによって色を変える（緑=valid / 赤=invalid 等）。
  // ==========================================================
  const _hoverGeo = new THREE.PlaneGeometry(TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE);
  _hoverGeo.rotateX(-Math.PI / 2);
  const hoverMesh = new THREE.Mesh(_hoverGeo, new THREE.MeshBasicMaterial({
    color: 0x7fcf6b, transparent: true, opacity: 0.42, depthWrite: false,
    side: THREE.DoubleSide,
  }));
  hoverMesh.visible = false;
  hoverMesh.renderOrder = 3;  // ビルボード(2) より更に手前で見せる
  scene.add(hoverMesh);
  // _hoverState: 現在ホバーしているタイル + 色（draw で elev に追従させる）
  const _hoverState: { tx: number; ty: number; color: number } | null = { tx: 0, ty: 0, color: 0x7fcf6b };
  let _hoverActive = false;

  // --- Σ-8-c atlas テクスチャ ---
  // 1024×1024 RGBA / 4×4 / 256px cell の処理済アセットを地形 mesh と
  // 崖壁面 mesh の map にぶら下げる。読込前は vertexColors のみで描画、
  // 完了で map を inject（一度切り替わるとそのまま）。
  const ATLAS_URL = '/terrain/sigma8_terrain_atlas_v2_1024.png';
  new THREE.TextureLoader().load(ATLAS_URL, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    terrainMat.map = tex;
    terrainMat.needsUpdate = true;
    // R1: 3 バリアント崖 IM すべてに atlas テクスチャを注入し、color を 0xffffff へ
    for (const im of [cliffSoilIM, cliffRockIM, cliffDampIM]) {
      const m = im.material as THREE.MeshToonMaterial;
      m.map = tex; m.color.setHex(0xffffff); m.needsUpdate = true;
    }
    // Σ-8-d-2 / R2: water tile IM 5 種 + 危険域オーバーレイにも atlas water cell を注入。
    // color tint に重ね、v2 の水面筆致を水たまりにも反映する。
    for (const im of [waterDampIM, waterShallowIM, waterMidIM, waterDeepIM, waterDangerIM]) {
      const m = im.material as THREE.MeshBasicMaterial;
      m.map = tex;
      m.needsUpdate = true;
    }
  });
  try { featureSheetTex = await loadTex('/features/sigma8_feature_sprites_v1_processed.png'); } catch(e){ console.warn('[3d] feature sheet',e); }
  try { propSheetTex = await loadTex('/props/sigma8_ground_props_v1_processed.png'); } catch(e){ console.warn('[3d] prop sheet',e); }
  const waterIMs = [waterDampIM, waterShallowIM, waterMidIM, waterDeepIM];

  // R2: 危険域パルス IM へも atlas map を注入（atlas ロード後）
  // （後段の TextureLoader callback 内で waterDangerIM も含めるように変更済）

  // R2: 滝テクスチャ（縦方向ストライプ、下方向 UV scroll で流れる）
  // waterfallIM の作成より先に定義する必要がある（const は巻き上げられない）。
  function makeWaterfallTex(): THREE.DataTexture {
    const W=16, H=64;
    const data=new Uint8Array(W*H*4);
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      const stripe = ((y + x) % 14) < 5;
      const i=(y*W+x)*4;
      data[i]  = stripe ? 0xcc : 0x30;
      data[i+1]= stripe ? 0xee : 0x70;
      data[i+2]= stripe ? 0xff : 0xb0;
      data[i+3]= stripe ? 210 : 100;
    }
    const t=new THREE.DataTexture(data,W,H); t.needsUpdate=true;
    t.wrapS=t.wrapT=THREE.RepeatWrapping;
    return t;
  }
  const waterfallTex=makeWaterfallTex();

  // R2: 滝壁面 InstancedMesh
  // 水を持つタイル（waterLevel >= 0.25）が崖の上端にある場合に縦ストリップを配置。
  // 崖壁面と同じ EW/NS 境界走査で検出し、上タイルが水持ち条件を満たした境界のみ。
  // UV は atlas WATERFALL_CELL に合わせて将来の atlas 置換を容易にする。
  let MAX_WATERFALL_WALLS = 600;
  const _waterfallGeo = new THREE.PlaneGeometry(1, 1);
  {
    const wfuv = atlasUVBounds(WATERFALL_CELL[0], WATERFALL_CELL[1]);
    const ua = _waterfallGeo.attributes.uv as THREE.BufferAttribute;
    ua.setXY(0, wfuv.uMin, wfuv.vMax);
    ua.setXY(1, wfuv.uMax, wfuv.vMax);
    ua.setXY(2, wfuv.uMin, wfuv.vMin);
    ua.setXY(3, wfuv.uMax, wfuv.vMin);
    ua.needsUpdate = true;
  }
  let waterfallIM = new THREE.InstancedMesh(
    _waterfallGeo,
    new THREE.MeshBasicMaterial({
      map: waterfallTex, color: 0x88ccff,
      transparent: true, opacity: 0.70,
      depthWrite: false, side: THREE.DoubleSide,
    }),
    MAX_WATERFALL_WALLS,
  );
  waterfallIM.count = 0;
  waterfallIM.renderOrder = 1;
  scene.add(waterfallIM);

  // specular ハイライト：水面に sin(time) で揺らぐ白い斑点。深い水たまりだけ。
  const _shimmerGeo = new THREE.PlaneGeometry(10, 10);
  _shimmerGeo.rotateX(-Math.PI/2);
  const shimmerIM = new THREE.InstancedMesh(
    _shimmerGeo,
    new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.55,depthWrite:false,side:THREE.DoubleSide}),
    Math.floor(T_COLS*T_ROWS*0.5),
  );
  shimmerIM.count = 0;
  scene.add(shimmerIM);

  // foam edge：水たまり境界（隣が水じゃないタイル）の白い縁取り。LineSegments で描画。
  let waterFoamLines: THREE.LineSegments | null = null;
  const waterFoamMat = new THREE.LineBasicMaterial({color:0xeaf8ff,transparent:true,opacity:0.85});
  // R2: 海岸線 foam（sea と陸の境界）。inland water foam とは色で区別。
  let seaFoamLines: THREE.LineSegments | null = null;
  const seaFoamMat = new THREE.LineBasicMaterial({color:0xc0f0ff,transparent:true,opacity:0.70});
  // R2: 水位勾配から出す短い流れ線。全水面一律 UV scroll だけでは方向が読めないため、
  // tile ごとの downhill 方向を細い streak で補助表示する。
  let waterFlowLines: THREE.LineSegments | null = null;
  const waterFlowMat = new THREE.LineBasicMaterial({color:0xbfeeff,transparent:true,opacity:0.62});

  // --- Σ-7-b: 雨粒 LineSegments（雨天時のみ出現、frustum 内 300-500 本）---
  let rainLines: THREE.LineSegments | null = null;
  const rainMat = new THREE.LineBasicMaterial({color:0x88ccff,transparent:true,opacity:0.45});

  // --- レイヤーグループ ---
  const featGrp  = new THREE.Group();
  const propGrp  = new THREE.Group();
  const bldGrp   = new THREE.Group();
  const obsGrp   = new THREE.Group();
  const corpseGrp= new THREE.Group();
  const chibiGrp = new THREE.Group();
  const npcGrp   = new THREE.Group();
  const wolfGrp  = new THREE.Group();
  const fxGrp    = new THREE.Group();
  scene.add(featGrp, propGrp, bldGrp, obsGrp, corpseGrp, chibiGrp, npcGrp, wolfGrp, fxGrp);

  const groundPropIMs = propSheetTex ? GROUND_PROP_DEFS.map((def) => {
    const im = new THREE.InstancedMesh(
      atlasPlaneGeometry(def.cell, def.w, def.h),
      new THREE.MeshBasicMaterial({
        map: propSheetTex!,
        transparent: true,
        alphaTest: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      Math.ceil(T_COLS * T_ROWS * 0.08),
    );
    im.count = 0;
    im.renderOrder = 2;
    propGrp.add(im);
    return im;
  }) : [];
  let groundPropsBuiltVersion = -1;

  // --- スプライトテクスチャ ---
  let chibiTexs: THREE.Texture[] = [];
  let furanaTexs: THREE.Texture[] = [];
  try { chibiTexs  = await Promise.all(CHIBI_URLS.map(loadTex)); } catch(e){ console.warn('[3d] chibi tex',e); }
  try { furanaTexs = await Promise.all(FURANA_URLS.map(loadTex)); } catch(e){ console.warn('[3d] furana tex',e); }
  if (!chibiTexs.length) chibiTexs = [0xfff3d8,0xe8f0ff,0xffe3c8,0xffc8c8,0xd8d8ff,0xc8ffd8,0x8b4a20,0xbbbbbb,0x222222].map(c=>npcCircleTex(c,20));

  const npcTexs = new Map<NpcId, THREE.Texture>([
    ['furana', furanaTexs[0] ?? npcCircleTex(NPC_DEFS.furana.color, 36)],
    ['suzu',   npcCircleTex(NPC_DEFS.suzu.color,   24)],
    ['lou',    npcCircleTex(NPC_DEFS.lou.color,    28)],
    ['cocoon', npcCircleTex(NPC_DEFS.cocoon.color, 25)],
  ]);

  const obsTexMap   = new Map<string, THREE.Texture>();

  // --- ビュー キャッシュ ---
  type MView = { mesh: THREE.Mesh; lastState: string; lastFace: boolean };
  const chibiViews  = new Map<number, MView>();
  const npcViews    = new Map<NpcId,  MView>();
  const wolfViews   = new Map<number, THREE.Mesh>();
  const corpseViews = new Map<number, THREE.Mesh>();
  // Σ-5-b: feature は 3D Group + devLevel/saturated キャッシュキー
  const featViews   = new Map<string, { grp: THREE.Group; key: string }>();
  const obsViews    = new Map<string, THREE.Mesh>();
  const bldViews    = new Map<string, THREE.Group>();

  let wireLines: THREE.LineSegments|null = null;
  let cliffLines: THREE.LineSegments|null = null;
  let contourLines: THREE.LineSegments|null = null;
  let contourVisible = false;  // デフォは OFF（プレイヤーが必要なときだけ有効化）

  // オオカミビルボードテクスチャ（共有）
  const wolfTexture = wolfTex();

  // キャラクタースプライト ティント状態
  let curCharTint: [number,number,number] = [1,1,1];
  let lastCharTintKey = '';

  // 難度（resetCamera で使用）
  let currentDifficulty: Difficulty = 'standard';

  // 土砂崩れ煙パーティクル
  type SmokeParticle = { pts: THREE.Points; mat: THREE.PointsMaterial; startMs: number };
  let smokeParticles: SmokeParticle[] = [];

  // 地形の前フレーム標高（崩落検出用）
  let prevElevs: number[][] | null = null;
  let lastTerrainVersion = -1;

  // --- バブルオーバーレイ ---
  const bubbleOverlay = document.createElement('div');
  Object.assign(bubbleOverlay.style,{position:'absolute',top:'0',left:'0',width:'100%',height:'100%',pointerEvents:'none',overflow:'hidden'});
  host.style.position = 'relative';
  host.appendChild(bubbleOverlay);

  // --- Σ-5-c: terraform 進捗オーバーレイ ---
  const tfOverlay = document.createElement('div');
  Object.assign(tfOverlay.style,{position:'absolute',top:'0',left:'0',width:'100%',height:'100%',pointerEvents:'none',overflow:'hidden'});
  host.appendChild(tfOverlay);
  const tfDivs = new Map<string, HTMLDivElement>();
  // jobId → last worker が居た時刻（秒）
  const tfLastWorkerSec = new Map<string, number>();
  // jobId → job type（完了検知のため前フレームの状態を保持）
  // 前フレームのジョブ {id → {target, progress}} を保持。
  // 削除されたジョブは「完了」と「再クリックでの置き換え」が区別つかないので、
  // 最後の progress >= 0.95 だったものだけを完了通知する。
  // R3: tx/ty を追加して ramp 完成位置に bubble を出せるようにした
  const tfPrevJobIds = new Map<string, { target: 'raise' | 'lower' | 'ramp'; progress: number; tx: number; ty: number }>();

  // --- Σ-5-e-c: 建設進捗オーバーレイ ---
  const cnOverlay = document.createElement('div');
  Object.assign(cnOverlay.style,{position:'absolute',top:'0',left:'0',width:'100%',height:'100%',pointerEvents:'none',overflow:'hidden'});
  host.appendChild(cnOverlay);
  const cnDivs = new Map<string, HTMLDivElement>();
  const cnLastWorkerSec = new Map<string, number>();

  // --- Σ-5-e-d: UV スクロール水流テクスチャ（channel 用）---
  function makeWaterFlowTex(): THREE.DataTexture {
    const W=64, H=8;
    const data=new Uint8Array(W*H*4);
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      const stripe = ((x + y*2) % 16) < 6;
      const i=(y*W+x)*4;
      data[i]  = stripe ? 0xaa : 0x40;
      data[i+1]= stripe ? 0xdd : 0x80;
      data[i+2]= stripe ? 0xff : 0xcc;
      data[i+3]= stripe ? 200 : 120;
    }
    const t=new THREE.DataTexture(data,W,H); t.needsUpdate=true;
    t.wrapS=t.wrapT=THREE.RepeatWrapping;
    return t;
  }
  const waterFlowTex=makeWaterFlowTex();

  // Σ-7-b'/c' 動的水たまり用：柔らかい斜め波紋テクスチャ。
  // alpha は sin で揺らぎ → UV scroll で「流れて見える」効果。
  function makeRippleTex(): THREE.DataTexture {
    const W=32, H=32;
    const data=new Uint8Array(W*H*4);
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      const v = Math.sin((x+y*0.7)*0.45) * 0.5 + 0.5;
      const i=(y*W+x)*4;
      data[i]=255; data[i+1]=255; data[i+2]=255;
      data[i+3]=Math.floor(180 + v*75);  // 180-255（base 残しつつ波で揺らぐ）
    }
    const t=new THREE.DataTexture(data,W,H); t.needsUpdate=true;
    t.wrapS=t.wrapT=THREE.RepeatWrapping;
    return t;
  }
  const rippleTex=makeRippleTex();
  // 4 つの水深 IM 全部に ripple texture を適用（各 IM の material を変更）
  for(const im of waterIMs){
    (im.material as THREE.MeshBasicMaterial).map = rippleTex;
    (im.material as THREE.MeshBasicMaterial).needsUpdate = true;
  }
  // feature id → UV scroll mesh（channel の水流アニメ）
  const channelFlowMeshes = new Map<string, THREE.Mesh>();
  // feature id → ripple mesh（water の波紋）
  const waterRippleMeshes = new Map<string, { torus: THREE.Mesh; mat: THREE.MeshBasicMaterial; phase: number }>();
  const bubbleDivs = new Map<number, HTMLDivElement>();

  // --- terraform / stability — InstancedMesh（毎フレーム dispose を廃止）---
  const _tfGeo = new THREE.BoxGeometry(TERRAIN_TILE_SIZE*0.88,8,TERRAIN_TILE_SIZE*0.88);
  const tfRaiseIM = new THREE.InstancedMesh(_tfGeo,
    new THREE.MeshBasicMaterial({color:0xffb040,transparent:true,opacity:0.65}), 50);
  const tfLowerIM = new THREE.InstancedMesh(_tfGeo,
    new THREE.MeshBasicMaterial({color:0x40a0ff,transparent:true,opacity:0.65}), 50);
  tfRaiseIM.count=0; tfLowerIM.count=0;
  fxGrp.add(tfRaiseIM,tfLowerIM);

  // R3: ramp worksite overlay IM
  // planned/working: 黄緑のフットプリント（raise/lower とは別色で区別）
  const _tfRampGeo = new THREE.BoxGeometry(TERRAIN_TILE_SIZE*0.82, 5, TERRAIN_TILE_SIZE*0.82);
  const tfRampIM = new THREE.InstancedMesh(_tfRampGeo,
    new THREE.MeshBasicMaterial({color:0x90e840,transparent:true,opacity:0.55}), 50);
  tfRampIM.count = 0;
  fxGrp.add(tfRampIM);

  // blocked: 赤いフットプリント
  const tfRampBlockedIM = new THREE.InstancedMesh(_tfRampGeo,
    new THREE.MeshBasicMaterial({color:0xff2828,transparent:true,opacity:0.60}), 50);
  tfRampBlockedIM.count = 0;
  fxGrp.add(tfRampBlockedIM);

  // ramp 工事杭マーカー（タイル四隅に 4 本の小さな柱）: capacity = 50 jobs × 4 corners
  const _stakeGeo = new THREE.BoxGeometry(4, 20, 4);
  const tfRampStakeIM = new THREE.InstancedMesh(_stakeGeo,
    new THREE.MeshBasicMaterial({color:0x8b5a2b,transparent:true,opacity:0.85}), 200);
  tfRampStakeIM.count = 0;
  fxGrp.add(tfRampStakeIM);

  // ramp 方向矢印（細長いボックスで向きを示す）
  const _arrowGeo = new THREE.BoxGeometry(6, 6, TERRAIN_TILE_SIZE*0.55);
  const tfRampArrowIM = new THREE.InstancedMesh(_arrowGeo,
    new THREE.MeshBasicMaterial({color:0xfff000,transparent:true,opacity:0.90}), 50);
  tfRampArrowIM.count = 0;
  fxGrp.add(tfRampArrowIM);

  // terraform タイル境界アウトライン（白線、毎フレーム再構築）
  let tfOutlineLines: THREE.LineSegments | null = null;
  // R3: ramp worksite アウトライン（緑/赤線）
  let tfRampOutlineLines: THREE.LineSegments | null = null;

  const _stGeo = new THREE.BoxGeometry(TERRAIN_TILE_SIZE*0.94,3,TERRAIN_TILE_SIZE*0.94);
  const stWarnIM = new THREE.InstancedMesh(_stGeo,
    new THREE.MeshBasicMaterial({color:0xff6030,transparent:true,opacity:0.25}), T_COLS*T_ROWS);
  const stCritIM = new THREE.InstancedMesh(_stGeo,
    new THREE.MeshBasicMaterial({color:0xff2020,transparent:true,opacity:0.40}), T_COLS*T_ROWS);
  stWarnIM.count=0; stCritIM.count=0;
  fxGrp.add(stWarnIM,stCritIM);

  const _imDummy = new THREE.Object3D();

  function rebuildGroundProps(world: WorldState) {
    if (!groundPropIMs.length || !world.terrain.length) return;
    const counts = new Array(groundPropIMs.length).fill(0);
    const seed = world.terrainSeed ?? 1;
    const rows = world.terrain.length;
    const cols = world.terrain[0]?.length ?? 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const tile = world.terrain[r]![c]!;
      if (tile.isSea || tile.ramp || tile.waterLevel >= 0.20) continue;
      const densityRoll = tileHash01(c, r, seed, 1);
      const density = tile.material === 'grass' ? 0.065 : tile.material === 'soil' ? 0.045 : tile.material === 'rock' ? 0.035 : 0.02;
      if (densityRoll > density) continue;

      let candidates: number[];
      if (tile.material === 'rock') candidates = [6, 7];
      else if (tile.material === 'soil') candidates = [10, 11, 0];
      else if (tile.material === 'sand') candidates = [6, 10];
      else candidates = [0, 1, 2, 3, 4, 5, 8, 9];
      const pick = candidates[Math.floor(tileHash01(c, r, seed, 2) * candidates.length)] ?? 0;
      const im = groundPropIMs[pick];
      if (!im) continue;
      const idx = counts[pick]!;
      if (idx >= im.instanceMatrix.count) continue;
      const jx = (tileHash01(c, r, seed, 3) - 0.5) * TERRAIN_TILE_SIZE * 0.42;
      const jz = (tileHash01(c, r, seed, 4) - 0.5) * TERRAIN_TILE_SIZE * 0.42;
      const scale = 0.75 + tileHash01(c, r, seed, 5) * 0.35;
      const def = GROUND_PROP_DEFS[pick]!;
      const wx = (c + 0.5) * TERRAIN_TILE_SIZE + jx;
      const wy = (r + 0.5) * TERRAIN_TILE_SIZE + jz;
      _imDummy.position.set(wx, elevAt(world.terrain, wx, wy) + (def.h * scale) / 2, wy);
      _imDummy.scale.setScalar(scale);
      _imDummy.updateMatrix();
      im.setMatrixAt(idx, _imDummy.matrix);
      counts[pick] = idx + 1;
    }
    for (let i = 0; i < groundPropIMs.length; i++) {
      groundPropIMs[i]!.count = counts[i]!;
      groundPropIMs[i]!.instanceMatrix.needsUpdate = true;
    }
    _imDummy.scale.setScalar(1);
  }

  // ============================================================
  // カメラ状態
  // ============================================================
  let camX = CONFIG.WORLD_W/2;
  let camZ = CONFIG.WORLD_H*0.35;
  let zoom = 0.6;

  // M2.1 Step 6: カメラ角度プリセット（低め / 標準 / 真上寄り）。
  // 自由回転は禁止（Y 軸ビルボード前提が崩れる）が、用途別の俯瞰角度を切替えられる。
  // pitchYZ: lookAt 地点から Z 方向への後退距離 / 高さ の比率
  // heightMul: camH() に対する高さスケール
  type CamPreset = 'low' | 'standard' | 'top';
  const CAM_PRESETS: Record<CamPreset, { pitchYZ: number; heightMul: number; label: string }> = {
    low:      { pitchYZ: 1.5,  heightMul: 0.85, label: '低め（建物/崖確認）' },
    standard: { pitchYZ: 1.0,  heightMul: 1.0,  label: '標準（45°俯瞰）' },
    top:      { pitchYZ: 0.35, heightMul: 1.2,  label: '真上寄り（地形編集）' },
  };
  let camPreset: CamPreset = 'standard';

  const groundPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
  const rc = new THREE.Raycaster();

  function camH(){ return BASE_H/zoom; }

  function applyCamera(){
    const preset = CAM_PRESETS[camPreset];
    const h = camH() * preset.heightMul;
    camera.position.set(camX, h, camZ + h * preset.pitchYZ);
    camera.lookAt(camX, 0, camZ);
  }
  applyCamera();

  function clamp(v:number,lo:number,hi:number){ return Math.max(lo,Math.min(hi,v)); }
  function clampCam(){ camX=clamp(camX,0,CONFIG.WORLD_W); camZ=clamp(camZ,0,CONFIG.WORLD_H); }

  function focusOn(wx:number,wy:number,scale?:number){
    camX=wx; camZ=wy;
    if (scale!=null) zoom=clamp(scale, CONFIG.CAMERA_MIN_SCALE, CONFIG.CAMERA_MAX_SCALE);
    clampCam(); applyCamera();
  }

  function panCamera(dx:number,dy:number){
    camX+=dx; camZ+=dy; clampCam(); applyCamera();
  }

  function getCamera(): CameraView {
    camera.updateMatrixWorld();
    const pts: Array<{ x: number; z: number }> = [];
    for (const [nx, ny] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      rc.setFromCamera(new THREE.Vector2(nx, ny), camera);
      const hit = new THREE.Vector3();
      if (rc.ray.intersectPlane(groundPlane, hit)) pts.push({ x: hit.x, z: hit.z });
    }
    if (pts.length === 4) {
      const minX = Math.min(...pts.map((p) => p.x));
      const maxX = Math.max(...pts.map((p) => p.x));
      const minZ = Math.min(...pts.map((p) => p.z));
      const maxZ = Math.max(...pts.map((p) => p.z));
      return { x:minX, y:minZ, w:maxX-minX, h:maxZ-minZ, scale:zoom, bounds:{w:CONFIG.WORLD_W,h:CONFIG.WORLD_H} };
    }
    const fallback = camH() * 0.4;
    return { x:camX-fallback, y:camZ-fallback, w:fallback*2, h:fallback*2,
             scale:zoom, bounds:{w:CONFIG.WORLD_W,h:CONFIG.WORLD_H} };
  }

  function stwXZ(cx:number,cy:number):{x:number;y:number}{
    const rect=renderer.domElement.getBoundingClientRect();
    const ndcX=((cx-rect.left)/rect.width)*2-1;
    const ndcY=-((cy-rect.top)/rect.height)*2+1;
    rc.setFromCamera(new THREE.Vector2(ndcX,ndcY), camera);
    // 地形メッシュ直接 raycast：Y=0 平面交点だと高台でドラッグが奥にズレる
    if (terrainGeo) {
      const hits = rc.intersectObject(terrainMesh, false);
      if (hits.length > 0) return { x: hits[0]!.point.x, y: hits[0]!.point.z };
    }
    // フォールバック：初期化直後など terrainGeo 未構築時は Y=0 平面で代用
    const tgt=new THREE.Vector3();
    return rc.ray.intersectPlane(groundPlane,tgt) ? {x:tgt.x,y:tgt.z} : {x:camX,y:camZ};
  }

  function worldToScreen(wx:number,wy:number,ey:number):{x:number;y:number}{
    const v=new THREE.Vector3(wx, ey+30, wy);
    v.project(camera);
    const rect=renderer.domElement.getBoundingClientRect();
    return { x:(v.x+1)/2*rect.width+rect.left, y:(1-v.y)/2*rect.height+rect.top };
  }

  // ============================================================
  // 入力 + Σ-4-e GPU picking（Raycaster でスプライトメッシュ直撃）
  // ============================================================
  let hitFn: ((wx:number,wy:number)=>HitTarget|null)|null = null;
  const canvas = renderer.domElement;
  canvas.style.touchAction='none'; canvas.style.display='block';

  // Raycaster でスプライトメッシュを直撃 → 外れたら CPU hitFn フォールバック
  function pickTarget(cx:number,cy:number): HitTarget|null {
    const rect=canvas.getBoundingClientRect();
    const ndc=new THREE.Vector2(((cx-rect.left)/rect.width)*2-1,-((cy-rect.top)/rect.height)*2+1);
    rc.setFromCamera(ndc,camera);
    // chibi
    const chibiMeshes=[...chibiViews.values()].map(v=>v.mesh);
    const ch=rc.intersectObjects(chibiMeshes,false);
    if(ch.length){ for(const [id,v] of chibiViews) if(v.mesh===ch[0]!.object) return {kind:'chibi',id}; }
    // npc
    const npcMeshes=[...npcViews.values()].filter(v=>v.mesh.visible).map(v=>v.mesh);
    const nh=rc.intersectObjects(npcMeshes,false);
    if(nh.length){ for(const [id,v] of npcViews) if(v.mesh===nh[0]!.object) return {kind:'npc',id:id as NpcId}; }
    // wolf
    const wolfMeshes=[...wolfViews.values()].filter(m=>m.visible);
    const wh=rc.intersectObjects(wolfMeshes,false);
    if(wh.length){ for(const [id,m] of wolfViews) if(m===wh[0]!.object) return {kind:'wolf',id}; }
    // CPU fallback
    const wp=stwXZ(cx,cy);
    const cpuHit = hitFn?hitFn(wp.x,wp.y):null;
    if(cpuHit) return cpuHit;
    // feature（生体より優先度低い）— 全子メッシュを recursive で当たり判定
    const fh=rc.intersectObjects([...featViews.values()].map(v=>v.grp),true);
    if(fh.length){
      let hitGrp: THREE.Group|null=null;
      let minD=fh[0]!.distance;
      for(const hit of fh){
        if(hit.distance>minD+5) break;
        let obj: THREE.Object3D|null=hit.object;
        while(obj&&obj.parent!==featGrp) obj=obj.parent;
        if(obj){ hitGrp=obj as THREE.Group; break; }
      }
      if(hitGrp){ for(const [id,v] of featViews) if(v.grp===hitGrp) return {kind:'feature',id}; }
    }
    // building
    const bh=rc.intersectObjects([...bldViews.values()],true);
    if(bh.length){
      let hitGrp2: THREE.Group|null=null;
      let obj2: THREE.Object3D|null=bh[0]!.object;
      while(obj2&&obj2.parent!==bldGrp) obj2=obj2.parent;
      if(obj2) hitGrp2=obj2 as THREE.Group;
      if(hitGrp2){ for(const [id,g] of bldViews) if(g===hitGrp2) return {kind:'building',id}; }
    }
    return null;
  }

  canvas.addEventListener('wheel',(e)=>{
    e.preventDefault();
    const f=e.deltaY<0?CONFIG.CAMERA_ZOOM_STEP:1/CONFIG.CAMERA_ZOOM_STEP;
    const prev=zoom;
    zoom=clamp(zoom*f, CONFIG.CAMERA_MIN_SCALE, CONFIG.CAMERA_MAX_SCALE);
    const wp=stwXZ(e.clientX,e.clientY);
    const t=1-prev/zoom;
    camX+=(wp.x-camX)*t; camZ+=(wp.y-camZ)*t;
    clampCam(); applyCamera();
  },{passive:false});

  canvas.addEventListener('contextmenu',(e)=>{
    e.preventDefault();
    const target=pickTarget(e.clientX,e.clientY);
    canvas.dispatchEvent(new CustomEvent('kszk-inspect',{detail:{target,clientX:e.clientX,clientY:e.clientY}}));
  });

  type PMode='pan'|'drag';
  let ptr:{id:number;mode:PMode;sx:number;sy:number;lx:number;ly:number;moved:boolean;target:HitTarget|null}|null=null;
  // Σ-8-fix-7: 編集モード中（terraform / s8EditMode）は pan を抑止して、
  // drag paint がカメラ移動と同時に走らないようにする。main.ts から切替。
  let _panBlocked = false;
  function setPanEnabled(enabled: boolean) { _panBlocked = !enabled; }

  canvas.addEventListener('pointerdown',(e)=>{
    if(e.button===2) return;
    const target=pickTarget(e.clientX,e.clientY);
    // Σ-8-fix-7: 編集モード中は target なしクリックでの pan を抑止。
    // ただしエンティティ drag (chibi/NPC を掴む) は許す。
    if (_panBlocked && !target) return;
    canvas.setPointerCapture(e.pointerId);
    ptr={id:e.pointerId,mode:target?'drag':'pan',sx:e.clientX,sy:e.clientY,lx:e.clientX,ly:e.clientY,moved:false,target};
  });

  canvas.addEventListener('pointermove',(e)=>{
    if(!ptr||ptr.id!==e.pointerId) return;
    const dx=e.clientX-ptr.lx, dy=e.clientY-ptr.ly;
    ptr.lx=e.clientX; ptr.ly=e.clientY;
    if(Math.hypot(e.clientX-ptr.sx,e.clientY-ptr.sy)>4) ptr.moved=true;
    if(ptr.mode==='pan'){
      const h=camH(), asp=renderer.domElement.clientWidth/Math.max(1,renderer.domElement.clientHeight);
      const tanH=Math.tan((camera.fov*Math.PI/180)/2);
      const wpp=(h*tanH*2*Math.sqrt(2)*0.75)/renderer.domElement.clientHeight;
      camX-=dx*wpp*asp; camZ-=dy*wpp; clampCam(); applyCamera();
    } else if(ptr.mode==='drag'&&ptr.target&&ptr.moved){
      const wp=stwXZ(e.clientX,e.clientY);
      canvas.dispatchEvent(new CustomEvent('kszk-entity-drag',{detail:{target:ptr.target,worldX:wp.x,worldY:wp.y}}));
    }
  });

  const endPtr=(e:PointerEvent)=>{
    if(!ptr||ptr.id!==e.pointerId) return;
    canvas.releasePointerCapture(e.pointerId);
    const s=ptr; ptr=null;
    if(s.mode==='drag'&&s.target){
      const wp=stwXZ(e.clientX,e.clientY);
      if(s.moved) canvas.dispatchEvent(new CustomEvent('kszk-entity-drop',{detail:{target:s.target,worldX:wp.x,worldY:wp.y}}));
      else        canvas.dispatchEvent(new CustomEvent('kszk-entity-punch',{detail:{target:s.target}}));
    } else if(s.mode==='pan'&&!s.moved){
      const wp=stwXZ(e.clientX,e.clientY);
      canvas.dispatchEvent(new CustomEvent('kszk-empty-click',{detail:{worldX:wp.x,worldY:wp.y}}));
    }
  };
  canvas.addEventListener('pointerup',   endPtr);
  canvas.addEventListener('pointercancel',endPtr);
  canvas.addEventListener('pointerleave', endPtr);

  const keys=new Set<string>();
  document.addEventListener('keydown',e=>keys.add(e.key));
  document.addEventListener('keyup',  e=>keys.delete(e.key));
  // 'r'/'R' によるカメラリセットは main.ts 側で処理（二重発火を防ぐため stage3d からは削除）

  function applyKeyPan(dt:number){
    const spd=400/zoom;
    let dx=0,dz=0;
    if(keys.has('ArrowLeft') ||keys.has('a')||keys.has('A')) dx-=spd*dt;
    if(keys.has('ArrowRight')||keys.has('d')||keys.has('D')) dx+=spd*dt;
    if(keys.has('ArrowUp')   ||keys.has('w')||keys.has('W')) dz-=spd*dt;
    if(keys.has('ArrowDown') ||keys.has('s')||keys.has('S')) dz+=spd*dt;
    if(dx||dz){ camX+=dx; camZ+=dz; clampCam(); applyCamera(); }
  }


  // ============================================================
  // ヘルパー
  // ============================================================
  // 死因 → 死体ポーズ index
  // 溺死系 = 18_drown_flail / 投げ・落下系 = 19_knocked / 静かな死 = 09_dead /
  // それ以外（事故・災害） = 20_splat
  function pickCorpseTex(causeId: string|null, texs: THREE.Texture[]): {tex: THREE.Texture, idx: number} {
    const pick = (idx: number) => ({tex: texs[idx] ?? texs[8] ?? texs[0]!, idx});
    if (!causeId) return pick(8);
    if (causeId==='drown_pond' || causeId==='flood_drown' || causeId==='river_swept' || causeId==='kamisama_drown')
      return pick(17);  // 18_drown_flail
    if (causeId==='hunger_death' || causeId==='fatigue_death' || causeId==='roushuai' || causeId==='mama_lost' || causeId==='fled_to_exhaustion')
      return pick(8);   // 09_dead（RIP、静かな死）
    if (causeId==='cliff_fall' || causeId==='slope_fall' || causeId==='kamisama_throw' || causeId==='kamisama_punch' || causeId==='landslide_crush')
      return pick(18);  // 19_knocked
    return pick(19);    // 20_splat（デフォ：くそざこ事故死）
  }

  function ensureMView(map: Map<number,MView>, id:number, state:ChibiState,
                        texs:THREE.Texture[], grp:THREE.Group, w:number, h:number,
                        stateIdx: Record<ChibiState, number> = STATE_IDX): MView {
    let v=map.get(id);
    if(!v){
      const tex=texs[stateIdx[state]]??texs[0]!;
      const mesh=spriteMesh(w,h,tex);
      (mesh.material as THREE.MeshBasicMaterial).color.setRGB(...curCharTint);
      // 初期スケールも適用（CHIBI_POSE_SCALE が定義されたインデックスのみ）。
      // これがないと初回 syncSpriteState が「state 未変化」で scale を立て忘れる。
      const sc = stateIdx === CHIBI_STATE_IDX ? CHIBI_POSE_SCALE[stateIdx[state]] : null;
      if (sc) mesh.scale.set(sc[0], sc[1], 1);
      grp.add(mesh);
      // lastState を「未設定」に擬似的に設定 → 初回 syncSpriteState で必ずスケール再適用
      v={mesh,lastState:'_init' as ChibiState,lastFace:false};
      map.set(id,v);
    }
    return v;
  }

  // syncSpriteState: poseOverride を渡せば state ではなくその index を使う（飛行中など）
  // useScaleTable=true でちびわふ用 POSE_SCALE 補正を適用（NPC/Furana は使わない）。
  function syncSpriteState(v:MView, state:ChibiState, faceLeft:boolean, texs:THREE.Texture[],
                            stateIdx: Record<ChibiState, number> = STATE_IDX,
                            poseOverride?: number,
                            useScaleTable: boolean = false){
    const targetKey = poseOverride!=null ? `_pose:${poseOverride}` : state;
    let scaleX = 1, scaleY = 1;
    if (useScaleTable) {
      const idx = poseOverride!=null ? poseOverride : stateIdx[state];
      const sc = CHIBI_POSE_SCALE[idx];
      if (sc) { scaleX = sc[0]; scaleY = sc[1]; }
    }
    if(v.lastState!==targetKey){
      const idx = poseOverride!=null ? poseOverride : stateIdx[state];
      const tex=texs[idx]??texs[0]!;
      (v.mesh.material as THREE.MeshBasicMaterial).map=tex;
      (v.mesh.material as THREE.MeshBasicMaterial).needsUpdate=true;
      v.lastState=targetKey;
      // pose 変化時にスケールも更新
      v.mesh.scale.set(scaleX * (faceLeft?-1:1), scaleY, 1);
      v.lastFace=faceLeft;
    } else if(v.lastFace!==faceLeft){
      v.mesh.scale.x = scaleX * (faceLeft?-1:1);
      v.lastFace=faceLeft;
    }
  }

  function rmStale<K>(map:Map<K,THREE.Mesh>, live:Set<K>, grp:THREE.Group){
    for(const [id,m] of map){ if(!live.has(id)){ grp.remove(m); m.geometry.dispose(); map.delete(id); } }
  }

  function makeBubbleDiv(b:Bubble): HTMLDivElement {
    const div=document.createElement('div');
    const isNpc=b.kind==='npc-speech', isStomp=b.kind==='stomp';
    Object.assign(div.style,{
      position:'absolute',top:'0',left:'0',pointerEvents:'none',
      background:isStomp?'#fff1c8':isNpc?'#ffe4d4':'#ffffff',
      border:`1px solid ${isNpc?'#c46a3a':'#3a2a1a'}`,
      borderRadius:'4px',padding:'2px 6px',whiteSpace:'nowrap',
      fontSize:`${isStomp?10:isNpc?12:11}px`,fontFamily:'sans-serif',fontWeight:'bold',
      color:isStomp?'#6a4a22':isNpc?'#4a1a1a':'#3a2a1a',
      boxShadow:'0 1px 3px rgba(0,0,0,0.2)',zIndex:'100',
    });
    div.textContent=b.text;
    return div;
  }

  function makeBuildingGroup(b:PlacedBuilding): THREE.Group {
    const g=new THREE.Group();
    const s=1+Math.sqrt(Math.max(0,b.level-1))*0.1;
    const BCOL:Record<string,number>={noukou:0x9a6d3d,kouba:0x5c585c,hakaba:0xbfb1a3,taiko:0x734728,ubuya:0xf4cfd7};
    const col=BCOL[b.defId]??0x8b7048;
    const box=new THREE.Mesh(new THREE.BoxGeometry(40*s,30*s,40*s), new THREE.MeshToonMaterial({color:col,gradientMap:gradMap}));
    box.position.y=15*s; box.castShadow=true; g.add(box);
    const roof=new THREE.Mesh(new THREE.ConeGeometry(30*s,20*s,4), new THREE.MeshToonMaterial({color:0x5a311d,gradientMap:gradMap}));
    roof.position.y=40*s; g.add(roof);
    // Lv 表示ビルボード
    const lvc=document.createElement('canvas'); lvc.width=64; lvc.height=32;
    const lctx=lvc.getContext('2d')!;
    lctx.font='bold 20px sans-serif'; lctx.textAlign='center'; lctx.textBaseline='middle';
    lctx.strokeStyle='#2a1a0a'; lctx.lineWidth=4; lctx.strokeText(`Lv${b.level}`,32,16);
    lctx.fillStyle='#ffffff'; lctx.fillText(`Lv${b.level}`,32,16);
    const lvTex=new THREE.CanvasTexture(lvc); lvTex.minFilter=THREE.LinearFilter;
    const lvMesh=new THREE.Mesh(new THREE.PlaneGeometry(32,16),
      new THREE.MeshBasicMaterial({map:lvTex,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
    lvMesh.position.y=60*s+8; g.add(lvMesh);
    return g;
  }

  // ============================================================
  // draw() — メインレンダーループ
  // ============================================================
  let prevDrawMs = performance.now();
  let lastPhase: DayPhase = 'noon';
  let frameCount = 0;

  function draw(world: WorldState){
    const now=performance.now();
    const dt=Math.min(0.1,(now-prevDrawMs)/1000);
    prevDrawMs=now; frameCount++;

    // Σ-7-b'：水紋テクスチャを毎フレーム UV scroll（流れて見える効果）。
    // 速度はゆっくり（0.04/sec 南東方向）、深い水ほど少し遅め。
    rippleTex.offset.x -= dt * 0.04;
    rippleTex.offset.y -= dt * 0.025;

    // R2: 危険域パルス（wl >= 0.35）— 非負 sin で赤橙を点滅させて危険を示す。
    (waterDangerIM.material as THREE.MeshBasicMaterial).opacity =
      0.08 + (Math.sin(world.timeSec * 3.5) * 0.5 + 0.5) * 0.10;

    // R2: 滝テクスチャを下向きにスクロール（waterfall は Y 方向に流れる）
    waterfallTex.offset.y -= dt * 1.2;

    applyKeyPan(dt);
    currentDifficulty = world.difficulty;

    // 土砂崩れ煙フェードアウト
    smokeParticles = smokeParticles.filter(s=>{
      const t=(now-s.startMs)/500;
      if(t>=1){ fxGrp.remove(s.pts); s.pts.geometry.dispose(); return false; }
      s.mat.opacity=0.8*(1-t); return true;
    });

    // 日時計ティント
    if(world.dayPhase!==lastPhase){
      lastPhase=world.dayPhase;
      const p=PHASE_TINT[world.dayPhase];
      renderer.setClearColor(p.sky);
      if(scene.fog instanceof THREE.Fog) scene.fog.color.set(p.sky);
      ambLight.intensity=p.amb; dirLight.intensity=p.dir; dirLight.color.set(p.dirC);
    }

    // 気象ティント上書き
    switch(world.weather.kind){
      case 'storm':      renderer.setClearColor(0x354045); if(scene.fog instanceof THREE.Fog)(scene.fog as THREE.Fog).color.set(0x354045); break;
      case 'heavy_rain': renderer.setClearColor(0x4a5a6a); break;
      case 'fog':        renderer.setClearColor(0xc0c8cc); if(scene.fog instanceof THREE.Fog)(scene.fog as THREE.Fog).color.set(0xc0c8cc); (scene.fog as THREE.Fog).near=2000; break;
      case 'snow':       renderer.setClearColor(0xd0d8e8); break;
      case 'heatwave':   renderer.setClearColor(0xf2c878); break;  // やや薄めの黄昏色（前は 0xff9a60 でオレンジ強すぎ）
    }

    // キャラクタースプライトのティント（MeshBasicMaterial は手動で color 乗算）
    const charTintKey=`${world.dayPhase}:${world.weather.kind}`;
    if(charTintKey!==lastCharTintKey){
      lastCharTintKey=charTintKey;
      let t: [number,number,number]=[...PHASE_CHAR[world.dayPhase]];
      const wt=WEATHER_CHAR[world.weather.kind];
      if(wt) t=[Math.min(1,t[0]*wt[0]),Math.min(1,t[1]*wt[1]),Math.min(1,t[2]*wt[2])];
      curCharTint=t;
      const applyT=(m:THREE.Mesh)=>(m.material as THREE.MeshBasicMaterial).color.setRGB(...curCharTint);
      chibiViews.forEach(v=>applyT(v.mesh));
      npcViews.forEach(v=>applyT(v.mesh));
      wolfViews.forEach(m=>applyT(m));
      corpseViews.forEach(m=>applyT(m));
      featViews.forEach(v=>v.grp.traverse((o: THREE.Object3D)=>{ if((o as THREE.Mesh).isMesh) applyT(o as THREE.Mesh); }));
      obsViews.forEach(m=>applyT(m));
    }

    // ---- 地形（terrainVersion 変更時に即時、それ以外は 90 フレームごと）----
    const tvChanged = (world.terrainVersion ?? 0) !== lastTerrainVersion;
    if(world.terrain.length>0 && (tvChanged || frameCount-terrainBuiltAt>=90)){
      terrainBuiltAt=frameCount;
      lastTerrainVersion = world.terrainVersion ?? 0;
      if(!terrainGeo){
        terrainGeo=buildTerrainGeo(world.terrain);
        terrainMesh.geometry.dispose();
        terrainMesh.geometry=terrainGeo;
      } else {
        refreshTerrainGeo(terrainGeo, world.terrain);
      }
      let seaIdx = 0;
      const _seaColor = new THREE.Color();
      for (let sr=0; sr<world.terrain.length; sr++) for (let sc=0; sc<(world.terrain[0]?.length ?? 0); sc++) {
        const tile = world.terrain[sr]![sc]!;
        if (!tile.isSea) continue;
        const cx=(sc+0.5)*TERRAIN_TILE_SIZE, cy=(sr+0.5)*TERRAIN_TILE_SIZE;
        _imDummy.position.set(cx, elevAt(world.terrain,cx,cy) + 1.0, cy);
        _imDummy.updateMatrix();
        seaTileIM.setMatrixAt(seaIdx, _imDummy.matrix);
        // R2: per-tile depth color variation — 浅瀬は明るいターコイズ、深海は暗い青
        // deterministic hash で tile ごとに固定（毎フレーム再割り当てしても見た目は同じ）
        const depthHash = ((sr * 7 + sc * 13) & 0xff) / 255;  // 0-1
        const bright = 0.70 + depthHash * 0.22;
        const seaR = 0.08 * bright, seaG = 0.40 * bright, seaB = 0.65 * bright;
        _seaColor.setRGB(seaR, seaG, seaB);
        seaTileIM.setColorAt(seaIdx, _seaColor);
        seaIdx++;
      }
      seaTileIM.count = seaIdx;
      seaTileIM.instanceMatrix.needsUpdate = true;
      if (seaIdx > 0 && seaTileIM.instanceColor) seaTileIM.instanceColor.needsUpdate = true;
      const propVersion = world.terrainVersion ?? 0;
      if (groundPropsBuiltVersion !== propVersion) {
        rebuildGroundProps(world);
        groundPropsBuiltVersion = propVersion;
      }

      // 崩落検出 → 土煙パーティクル（前フレーム比 elev 差 ≥10 のタイル）
      if(prevElevs){
        const PR=world.terrain.length, PC=world.terrain[0]?.length??0;
        for(let r2=0;r2<PR;r2++) for(let c2=0;c2<PC;c2++){
          const cur=world.terrain[r2]![c2]!.elev, prv=prevElevs[r2]?.[c2]??cur;
          if(prv-cur<10) continue;
          const px=(c2+0.5)*TERRAIN_TILE_SIZE, pz=(r2+0.5)*TERRAIN_TILE_SIZE, py=prv*ELEV_SCALE;
          const N=30; const pos=new Float32Array(N*3);
          for(let i=0;i<N;i++){
            pos[i*3]  =px+(Math.random()-.5)*TERRAIN_TILE_SIZE;
            pos[i*3+1]=py+Math.random()*30;
            pos[i*3+2]=pz+(Math.random()-.5)*TERRAIN_TILE_SIZE;
          }
          const geo=new THREE.BufferGeometry();
          geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
          const mat=new THREE.PointsMaterial({color:0x8b6040,size:8,transparent:true,opacity:0.8,depthWrite:false});
          const pts=new THREE.Points(geo,mat);
          fxGrp.add(pts); smokeParticles.push({pts,mat,startMs:now});
        }
      }
      prevElevs=world.terrain.map(row=>row.map(t=>t.elev));

      // R1: 崖壁面を 3 バリアント IM + 底面シャドウ IM で実体化。
      // soil / rock / damp の 3 セルを upper/lower material と water level で選ぶ。
      // 壁ごとに deterministic brightness variation を入れて縦壁紙感を緩和。
      // 底面に thin horizontal shadow strip を置いて地面との接点を読ませる。
      const ROWS2=world.terrain.length, COLS2=world.terrain[0]?.length??0;
      const CLIFF_WALL_THRESH = 25;
      const TILE = TERRAIN_TILE_SIZE;
      const SHADOW_DEPTH = TILE * 0.32;  // 崖根本のシャドウの奥行き
      const _cliffMat = new THREE.Matrix4();
      const _cliffPos = new THREE.Vector3();
      const _cliffQuat = new THREE.Quaternion();
      const _cliffScale = new THREE.Vector3();
      const _shadowMat = new THREE.Matrix4();
      const _shadowPos = new THREE.Vector3();
      const _shadowQuat = new THREE.Quaternion();  // identity: geo は already rotated
      const _shadowScale = new THREE.Vector3();
      const _cliffEulerEW = new THREE.Euler(0, Math.PI / 2, 0);
      const _cliffEulerNS = new THREE.Euler(0, 0, 0);
      const _cwColor = new THREE.Color();

      // 1 pass: total count for capacity
      let needed = 0;
      for (let r2 = 0; r2 < ROWS2; r2++) for (let c2 = 0; c2 < COLS2; c2++) {
        const t0 = world.terrain[r2]![c2]!;
        if (c2 + 1 < COLS2) {
          const tE = world.terrain[r2]![c2 + 1]!;
          const diff = Math.abs(t0.elev - tE.elev);
          if (diff >= CLIFF_WALL_THRESH) {
            const lower = t0.elev < tE.elev ? t0 : tE;
            const reqDir = t0.elev < tE.elev ? 'E' : 'W';
            if (!(diff === 25 && lower.ramp === reqDir)) needed++;
          }
        }
        if (r2 + 1 < ROWS2) {
          const tS = world.terrain[r2 + 1]![c2]!;
          const diff = Math.abs(t0.elev - tS.elev);
          if (diff >= CLIFF_WALL_THRESH) {
            const lower = t0.elev < tS.elev ? t0 : tS;
            const reqDir = t0.elev < tS.elev ? 'S' : 'N';
            if (!(diff === 25 && lower.ramp === reqDir)) needed++;
          }
        }
      }
      ensureCliffCapacity(needed);

      // 2 pass: fill per-variant IM + shadow IM
      let cwSoil = 0, cwRock = 0, cwDamp = 0, cwShadow = 0;
      for (let r2=0; r2<ROWS2; r2++) for (let c2=0; c2<COLS2; c2++) {
        const t0 = world.terrain[r2]![c2]!;
        const e0 = t0.elev;

        // east 境界: タイル(c2,r2) と (c2+1,r2)
        if (c2+1 < COLS2) {
          const tE = world.terrain[r2]![c2+1]!;
          const eE = tE.elev;
          const diff = Math.abs(e0 - eE);
          if (diff >= CLIFF_WALL_THRESH) {
            const lowerLeft = e0 < eE;
            const lower = lowerLeft ? t0 : tE;
            const upper = lowerLeft ? tE : t0;
            const requiredDir = lowerLeft ? 'E' : 'W';
            if (!(diff === 25 && lower.ramp === requiredDir)) {
              const lo = Math.min(e0, eE), hi = Math.max(e0, eE);
              const wallH = (hi - lo) * ELEV_SCALE;
              _cliffPos.set((c2+1)*TILE, (lo + hi)/2 * ELEV_SCALE, (r2 + 0.5)*TILE);
              _cliffQuat.setFromEuler(_cliffEulerEW);
              _cliffScale.set(TILE, wallH, 1);
              _cliffMat.compose(_cliffPos, _cliffQuat, _cliffScale);
              const bright = cliffBright(r2, c2, true);
              _cwColor.setRGB(bright, bright, bright);
              const v = cliffVariant(upper.material, lower.material, lower.waterLevel, lower.isSea);
              if (v === 1) { cliffRockIM.setMatrixAt(cwRock, _cliffMat); cliffRockIM.setColorAt(cwRock++, _cwColor); }
              else if (v === 2) { cliffDampIM.setMatrixAt(cwDamp, _cliffMat); cliffDampIM.setColorAt(cwDamp++, _cwColor); }
              else { cliffSoilIM.setMatrixAt(cwSoil, _cliffMat); cliffSoilIM.setColorAt(cwSoil++, _cwColor); }
              // 底面シャドウ: EW 境界なので thin in X, wide in Z
              _shadowPos.set((c2+1)*TILE, lo * ELEV_SCALE + 0.5, (r2 + 0.5)*TILE);
              _shadowScale.set(SHADOW_DEPTH, 1, TILE);
              _shadowMat.compose(_shadowPos, _shadowQuat, _shadowScale);
              cliffShadowIM.setMatrixAt(cwShadow++, _shadowMat);
            }
          }
        }

        // south 境界: タイル(c2,r2) と (c2,r2+1)
        if (r2+1 < ROWS2) {
          const tS = world.terrain[r2+1]![c2]!;
          const eS = tS.elev;
          const diff = Math.abs(e0 - eS);
          if (diff >= CLIFF_WALL_THRESH) {
            const lowerTop = e0 < eS;
            const lower = lowerTop ? t0 : tS;
            const upper = lowerTop ? tS : t0;
            const requiredDir = lowerTop ? 'S' : 'N';
            if (!(diff === 25 && lower.ramp === requiredDir)) {
              const lo = Math.min(e0, eS), hi = Math.max(e0, eS);
              const wallH = (hi - lo) * ELEV_SCALE;
              _cliffPos.set((c2 + 0.5)*TILE, (lo + hi)/2 * ELEV_SCALE, (r2+1)*TILE);
              _cliffQuat.setFromEuler(_cliffEulerNS);
              _cliffScale.set(TILE, wallH, 1);
              _cliffMat.compose(_cliffPos, _cliffQuat, _cliffScale);
              const bright = cliffBright(r2, c2, false);
              _cwColor.setRGB(bright, bright, bright);
              const v = cliffVariant(upper.material, lower.material, lower.waterLevel, lower.isSea);
              if (v === 1) { cliffRockIM.setMatrixAt(cwRock, _cliffMat); cliffRockIM.setColorAt(cwRock++, _cwColor); }
              else if (v === 2) { cliffDampIM.setMatrixAt(cwDamp, _cliffMat); cliffDampIM.setColorAt(cwDamp++, _cwColor); }
              else { cliffSoilIM.setMatrixAt(cwSoil, _cliffMat); cliffSoilIM.setColorAt(cwSoil++, _cwColor); }
              // 底面シャドウ: NS 境界なので wide in X, thin in Z
              _shadowPos.set((c2 + 0.5)*TILE, lo * ELEV_SCALE + 0.5, (r2+1)*TILE);
              _shadowScale.set(TILE, 1, SHADOW_DEPTH);
              _shadowMat.compose(_shadowPos, _shadowQuat, _shadowScale);
              cliffShadowIM.setMatrixAt(cwShadow++, _shadowMat);
            }
          }
        }
      }

      // commit all cliff IMs
      cliffSoilIM.count = cwSoil; cliffSoilIM.instanceMatrix.needsUpdate = true;
      if (cwSoil > 0 && cliffSoilIM.instanceColor) cliffSoilIM.instanceColor.needsUpdate = true;
      cliffRockIM.count = cwRock; cliffRockIM.instanceMatrix.needsUpdate = true;
      if (cwRock > 0 && cliffRockIM.instanceColor) cliffRockIM.instanceColor.needsUpdate = true;
      cliffDampIM.count = cwDamp; cliffDampIM.instanceMatrix.needsUpdate = true;
      if (cwDamp > 0 && cliffDampIM.instanceColor) cliffDampIM.instanceColor.needsUpdate = true;
      cliffShadowIM.count = cwShadow; cliffShadowIM.instanceMatrix.needsUpdate = true;

      // 旧 cliffLines: contour トグルが ON のときのみ debug 用に薄く出す
      if(cliffLines){ scene.remove(cliffLines); cliffLines.geometry.dispose(); cliffLines=null; }
      if(contourVisible){
        const CLIFF_LINE_THRESH = 38;
        const cPts:number[]=[];
        for(let r2=0;r2<ROWS2;r2++) for(let c2=0;c2<COLS2;c2++){
          const e0=world.terrain[r2]![c2]!.elev;
          if(c2+1<COLS2){ const ex=world.terrain[r2]![c2+1]!.elev; if(Math.abs(e0-ex)>=CLIFF_LINE_THRESH){
            const x=(c2+1)*TERRAIN_TILE_SIZE, ya=Math.max(e0,ex)*ELEV_SCALE;
            cPts.push(x,ya,r2*TERRAIN_TILE_SIZE, x,ya,(r2+1)*TERRAIN_TILE_SIZE);
          }}
          if(r2+1<ROWS2){ const ey=world.terrain[r2+1]![c2]!.elev; if(Math.abs(e0-ey)>=CLIFF_LINE_THRESH){
            const z=(r2+1)*TERRAIN_TILE_SIZE, ya=Math.max(e0,ey)*ELEV_SCALE;
            cPts.push(c2*TERRAIN_TILE_SIZE,ya,z, (c2+1)*TERRAIN_TILE_SIZE,ya,z);
          }}
        }
        if(cPts.length){
          const lg=new THREE.BufferGeometry();
          lg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(cPts),3));
          cliffLines=new THREE.LineSegments(lg,new THREE.LineBasicMaterial({color:0x1a1a1a,transparent:true,opacity:0.5}));
          scene.add(cliffLines);
        }
      }

      // 等高線（20 単位、隣接タイルの elev が 20 の倍数を跨いだら線を引く）
      // 高低差の視認性を上げる地図的な等高線。茶色細線で控えめに。
      if(contourLines){ scene.remove(contourLines); contourLines.geometry.dispose(); contourLines=null; }
      const conPts:number[]=[];
      // Σ-8: ELEV_STEP=25 単位で等高線（地形が量子化済みなので、各 25 段の境界に等しい）
      const CONTOUR_STEP = 25;
      const CONTOUR_NEAR_FLAT = 38;  // 崖未満の段差にだけ控えめな等高線
      const crossesContour = (a: number, b: number): number | null => {
        const lo = Math.min(a, b), hi = Math.max(a, b);
        const firstStep = Math.ceil(lo / CONTOUR_STEP) * CONTOUR_STEP;
        if (firstStep > hi) return null;
        return firstStep;
      };
      for(let r2=0;r2<ROWS2;r2++) for(let c2=0;c2<COLS2;c2++){
        const e0=world.terrain[r2]![c2]!.elev;
        if(c2+1<COLS2){
          const ex=world.terrain[r2]![c2+1]!.elev;
          const cs = crossesContour(e0, ex);
          if(cs!==null && Math.abs(e0-ex)<CONTOUR_NEAR_FLAT){
            const x=(c2+1)*TERRAIN_TILE_SIZE;
            const ya=cs*ELEV_SCALE+0.3;
            conPts.push(x,ya,r2*TERRAIN_TILE_SIZE, x,ya,(r2+1)*TERRAIN_TILE_SIZE);
          }
        }
        if(r2+1<ROWS2){
          const ey=world.terrain[r2+1]![c2]!.elev;
          const cs = crossesContour(e0, ey);
          if(cs!==null && Math.abs(e0-ey)<CONTOUR_NEAR_FLAT){
            const z=(r2+1)*TERRAIN_TILE_SIZE;
            const ya=cs*ELEV_SCALE+0.3;
            conPts.push(c2*TERRAIN_TILE_SIZE,ya,z, (c2+1)*TERRAIN_TILE_SIZE,ya,z);
          }
        }
      }
      if(conPts.length && contourVisible){
        const lg=new THREE.BufferGeometry();
        lg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(conPts),3));
        // 白系の等高線（プレイヤーがトグルで ON にした時だけ表示、地図的に高低を読む用）
        contourLines=new THREE.LineSegments(lg,new THREE.LineBasicMaterial({color:0xfff5d8,transparent:true,opacity:0.55}));
        scene.add(contourLines);
      }
    }

    // ---- Terraform オーバーレイ（InstancedMesh + 点滅 + 境界アウトライン）----
    {
      // 完了したジョブ検知（前フレームにあって今フレームにない && 直前 progress >= 0.95）
      const currentJobIds = new Set(world.terraformJobs.map(j=>j.id));
      for(const [id, prev] of tfPrevJobIds){
        if(!currentJobIds.has(id) && prev.progress >= 0.95){
          // R3: tx/ty を detail に追加して ramp 完成 bubble を出せるようにした
          canvas.dispatchEvent(new CustomEvent('kszk-terraform-complete',{
            detail:{ target: prev.target, tx: prev.tx, ty: prev.ty }
          }));
        }
      }
      tfPrevJobIds.clear();
      for(const job of world.terraformJobs) tfPrevJobIds.set(job.id, { target: job.target, progress: job.progress, tx: job.tx, ty: job.ty });

      // 作業者有無を判定（raise / lower / ramp 別に any-worker フラグ）
      const WORKER_R2 = 28;
      let raiseHasWorker = false, lowerHasWorker = false;
      // ramp ごとの作業者数を追跡
      const rampWorkerMap = new Map<string, number>();
      for(const job of world.terraformJobs){
        const cx=(job.tx+0.5)*TERRAIN_TILE_SIZE, cy=(job.ty+0.5)*TERRAIN_TILE_SIZE;
        let wCnt = 0;
        for(const c of world.chibis){
          if(c.state==='dead'||c.flight) continue;
          if(Math.hypot(c.pos.x-cx,c.pos.y-cy)<=WORKER_R2){
            if(job.target==='raise') raiseHasWorker=true;
            else if(job.target==='lower') lowerHasWorker=true;
            else wCnt++;
          }
        }
        if(job.target==='ramp') rampWorkerMap.set(job.id, wCnt);
      }

      // 1Hz パルス（作業者あり）または静止暗色（作業者なし）
      const pulse = Math.sin(world.timeSec*2*Math.PI)*0.5+0.5; // 0→1
      // 2Hz パルス（blocked 警告用）
      const pulseFast = Math.sin(world.timeSec*4*Math.PI)*0.5+0.5;
      // ノイズ感削減：作業中 0.40+pulse*0.18 / 待機 0.22
      (tfRaiseIM.material as THREE.MeshBasicMaterial).opacity = raiseHasWorker ? 0.40+pulse*0.18 : 0.22;
      (tfLowerIM.material as THREE.MeshBasicMaterial).opacity = lowerHasWorker ? 0.40+pulse*0.18 : 0.22;

      let tfRI=0, tfLI=0, tfRampI=0, tfRampBlockedI=0, tfStakeI=0, tfArrowI=0;
      const outlinePts:number[]=[];
      const rampOutlinePts:number[]=[];
      const HS = TERRAIN_TILE_SIZE*0.5;
      const STAKE_OFFSET = HS * 0.72;  // 角から少し内側
      const STAKE_H = 20;

      for(const job of world.terraformJobs){
        const wx=(job.tx+0.5)*TERRAIN_TILE_SIZE, wz=(job.ty+0.5)*TERRAIN_TILE_SIZE;
        const ey=elevAt(world.terrain,wx,wz);

        if(job.target==='ramp'){
          const isBlocked = !!job.blockedReason;
          const workers = rampWorkerMap.get(job.id) ?? 0;
          const hasWorker = workers > 0;

          if(isBlocked){
            // blocked: 赤フットプリント + 速パルス
            (tfRampBlockedIM.material as THREE.MeshBasicMaterial).opacity = 0.40+pulseFast*0.30;
            _imDummy.position.set(wx,ey+3,wz); _imDummy.rotation.set(0,0,0); _imDummy.scale.setScalar(1);
            _imDummy.updateMatrix();
            if(tfRampBlockedI < 50) tfRampBlockedIM.setMatrixAt(tfRampBlockedI++,_imDummy.matrix);
          } else {
            // planned/working: 黄緑フットプリント
            (tfRampIM.material as THREE.MeshBasicMaterial).opacity = hasWorker ? 0.45+pulse*0.20 : 0.28;
            _imDummy.position.set(wx,ey+3,wz); _imDummy.rotation.set(0,0,0); _imDummy.scale.setScalar(1);
            _imDummy.updateMatrix();
            if(tfRampI < 50) tfRampIM.setMatrixAt(tfRampI++,_imDummy.matrix);

            // 工事杭（四隅に 4 本）: planned / working 共通
            if(tfStakeI + 4 <= 200){
              const stakeY = ey + STAKE_H * 0.5 + 4;
              const corners:[number,number][] = [
                [wx-STAKE_OFFSET, wz-STAKE_OFFSET],
                [wx+STAKE_OFFSET, wz-STAKE_OFFSET],
                [wx-STAKE_OFFSET, wz+STAKE_OFFSET],
                [wx+STAKE_OFFSET, wz+STAKE_OFFSET],
              ];
              for(const [sx,sz] of corners){
                _imDummy.position.set(sx, stakeY, sz); _imDummy.rotation.set(0,0,0); _imDummy.scale.setScalar(1);
                _imDummy.updateMatrix();
                tfRampStakeIM.setMatrixAt(tfStakeI++, _imDummy.matrix);
              }
            }

            // 方向矢印（ramp の向く方向に細長ボックス）
            if(job.dir && tfArrowI < 50){
              const arrowY = ey + 8;
              let ax=wx, az=wz, rotY=0;
              const ARROW_DIST = HS * 0.45;
              if(job.dir==='N'){ az=wz-ARROW_DIST; rotY=0; }
              else if(job.dir==='S'){ az=wz+ARROW_DIST; rotY=0; }
              else if(job.dir==='E'){ ax=wx+ARROW_DIST; rotY=Math.PI*0.5; }
              else if(job.dir==='W'){ ax=wx-ARROW_DIST; rotY=Math.PI*0.5; }
              _imDummy.position.set(ax, arrowY, az);
              _imDummy.rotation.set(0, rotY, 0);
              _imDummy.scale.setScalar(1);
              _imDummy.updateMatrix();
              tfRampArrowIM.setMatrixAt(tfArrowI++, _imDummy.matrix);
            }
          }

          // ramp アウトライン（緑=valid / 赤=blocked）
          const top = ey + 6;
          rampOutlinePts.push(
            wx-HS,top,wz-HS, wx+HS,top,wz-HS,
            wx+HS,top,wz-HS, wx+HS,top,wz+HS,
            wx+HS,top,wz+HS, wx-HS,top,wz+HS,
            wx-HS,top,wz+HS, wx-HS,top,wz-HS,
          );
        } else {
          _imDummy.position.set(wx,ey+4,wz); _imDummy.rotation.set(0,0,0); _imDummy.scale.setScalar(1);
          _imDummy.updateMatrix();
          if(job.target==='raise') tfRaiseIM.setMatrixAt(tfRI++,_imDummy.matrix);
          else tfLowerIM.setMatrixAt(tfLI++,_imDummy.matrix);
          // タイル上面の白アウトライン（4辺）
          const top=ey+8;
          outlinePts.push(
            wx-HS,top,wz-HS, wx+HS,top,wz-HS,
            wx+HS,top,wz-HS, wx+HS,top,wz+HS,
            wx+HS,top,wz+HS, wx-HS,top,wz+HS,
            wx-HS,top,wz+HS, wx-HS,top,wz-HS,
          );
        }
      }
      tfRaiseIM.count=tfRI; tfLowerIM.count=tfLI;
      tfRampIM.count=tfRampI; tfRampBlockedIM.count=tfRampBlockedI;
      tfRampStakeIM.count=tfStakeI; tfRampArrowIM.count=tfArrowI;
      tfRaiseIM.instanceMatrix.needsUpdate=true;
      tfLowerIM.instanceMatrix.needsUpdate=true;
      tfRampIM.instanceMatrix.needsUpdate=true;
      tfRampBlockedIM.instanceMatrix.needsUpdate=true;
      tfRampStakeIM.instanceMatrix.needsUpdate=true;
      tfRampArrowIM.instanceMatrix.needsUpdate=true;

      // raise/lower アウトライン（白線）
      if(tfOutlineLines){ fxGrp.remove(tfOutlineLines); tfOutlineLines.geometry.dispose(); tfOutlineLines=null; }
      if(outlinePts.length){
        const olg=new THREE.BufferGeometry();
        olg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(outlinePts),3));
        tfOutlineLines=new THREE.LineSegments(olg,new THREE.LineBasicMaterial({color:0xffffff,opacity:0.8,transparent:true}));
        fxGrp.add(tfOutlineLines);
      }
      // R3: ramp アウトライン（緑/赤線）
      if(tfRampOutlineLines){ fxGrp.remove(tfRampOutlineLines); tfRampOutlineLines.geometry.dispose(); tfRampOutlineLines=null; }
      if(rampOutlinePts.length){
        const rlg=new THREE.BufferGeometry();
        rlg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(rampOutlinePts),3));
        // blocked が 1 つでもあれば赤、全部 valid なら黄緑
        const anyBlocked = world.terraformJobs.some(j=>j.target==='ramp'&&j.blockedReason);
        tfRampOutlineLines=new THREE.LineSegments(rlg,new THREE.LineBasicMaterial({
          color: anyBlocked ? 0xff4040 : 0x90e840, opacity:0.9, transparent:true
        }));
        fxGrp.add(tfRampOutlineLines);
      }
    }

    // ---- R2: 水たまりタイル可視化（30フレームごと）----
    // 4 tier: damp(0.05-0.20) / puddle(0.20-0.35) / shallow-danger(0.35-0.60) / deep(0.60+)
    // + 危険域パルスオーバーレイ / sea shoreline foam / waterfall strips
    if(frameCount%30===0){
      const ROWS=world.terrain.length, COLS=world.terrain[0]?.length??0;
      let dampIdx=0, sIdx=0, mIdx=0, dIdx=0, dangerIdx=0, shimmerIdx=0;
      const foamPts: number[] = [];
      const seaFoamPts: number[] = [];
      const flowPts: number[] = [];
      const HS = TERRAIN_TILE_SIZE*0.5;
      const WL_SCALE_VIS = 13;

      // inland water tile 判定（foam edge 用）
      const isWaterTile = (rr: number, cc: number): boolean => {
        if (rr<0||rr>=ROWS||cc<0||cc>=COLS) return false;
        const t = world.terrain[rr]![cc]!;
        if (t.waterLevel < 0.05) return false;
        const tcx=(cc+0.5)*TERRAIN_TILE_SIZE, tcy=(rr+0.5)*TERRAIN_TILE_SIZE;
        return !isSeaAt(tcx, tcy);
      };
      // sea tile 判定（shoreline foam 用）
      const isSeaTile = (rr: number, cc: number): boolean => {
        if (rr<0||rr>=ROWS||cc<0||cc>=COLS) return false;
        const tcx=(cc+0.5)*TERRAIN_TILE_SIZE, tcy=(rr+0.5)*TERRAIN_TILE_SIZE;
        return isSeaAt(tcx, tcy);
      };
      const waterSurfaceLevel = (rr: number, cc: number): number | null => {
        if (rr<0||rr>=ROWS||cc<0||cc>=COLS) return null;
        const t = world.terrain[rr]![cc]!;
        if (t.isSea) return null;
        return t.elev + t.waterLevel * WL_SCALE_VIS;
      };
      const rampConnectsEast = (left: TerrainTile, right: TerrainTile): boolean => {
        const diff = Math.abs(left.elev - right.elev);
        if (diff !== 25) return false;
        const lowerLeft = left.elev < right.elev;
        const lower = lowerLeft ? left : right;
        const requiredDir = lowerLeft ? 'E' : 'W';
        return lower.ramp === requiredDir;
      };
      const rampConnectsSouth = (topTile: TerrainTile, bottomTile: TerrainTile): boolean => {
        const diff = Math.abs(topTile.elev - bottomTile.elev);
        if (diff !== 25) return false;
        const lowerTop = topTile.elev < bottomTile.elev;
        const lower = lowerTop ? topTile : bottomTile;
        const requiredDir = lowerTop ? 'S' : 'N';
        return lower.ramp === requiredDir;
      };

      for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
        const tile=world.terrain[r]![c]!;
        const cx=(c+0.5)*TERRAIN_TILE_SIZE, cy=(r+0.5)*TERRAIN_TILE_SIZE;
        const seaTile = isSeaTile(r, c);

        // --- 海岸線 foam（sea タイルの陸側境界）---
        if (seaTile) {
          const seaY = elevAt(world.terrain,cx,cy) + 2.0;
          const top = seaY + 0.5;
          if (!isSeaTile(r-1, c)) seaFoamPts.push(cx-HS,top,cy-HS, cx+HS,top,cy-HS);
          if (!isSeaTile(r+1, c)) seaFoamPts.push(cx-HS,top,cy+HS, cx+HS,top,cy+HS);
          if (!isSeaTile(r, c-1)) seaFoamPts.push(cx-HS,top,cy-HS, cx-HS,top,cy+HS);
          if (!isSeaTile(r, c+1)) seaFoamPts.push(cx+HS,top,cy-HS, cx+HS,top,cy+HS);
          continue;  // sea タイル自体は inland water IM には乗せない
        }

        const wl=tile.waterLevel;
        if(wl<0.05) continue;

        const y = elevAt(world.terrain,cx,cy) + 1.5 + wl*4.5;
        _imDummy.position.set(cx, y, cy);
        _imDummy.updateMatrix();
        // R2: tier 閾値を danger threshold 0.35 に揃える
        if      (wl < 0.20) waterDampIM.setMatrixAt(dampIdx++, _imDummy.matrix);
        else if (wl < 0.35) waterShallowIM.setMatrixAt(sIdx++, _imDummy.matrix);
        else if (wl < 0.60) waterMidIM.setMatrixAt(mIdx++, _imDummy.matrix);
        else                waterDeepIM.setMatrixAt(dIdx++, _imDummy.matrix);

        // R2: 危険域パルスオーバーレイ（wl >= 0.35）
        if (wl >= 0.35) {
          waterDangerIM.setMatrixAt(dangerIdx++, _imDummy.matrix);
        }

        // specular shimmer：danger zone (wl>=0.35) 以上 + 位相ハッシュで間引き（≒1/3）
        if (wl >= 0.35 && ((r*7+c*13)%3 === 0)) {
          const ox = ((r*23+c*7) % 17) - 8;
          const oz = ((r*5+c*29) % 17) - 8;
          _imDummy.position.set(cx+ox, y+0.8, cy+oz);
          _imDummy.updateMatrix();
          shimmerIM.setMatrixAt(shimmerIdx++, _imDummy.matrix);
        }

        // inland foam edge：puddle 以上のタイルの陸側境界に白縁
        if (wl >= 0.20) {
          const top = y + 0.6;
          if (!isWaterTile(r-1, c)) foamPts.push(cx-HS,top,cy-HS, cx+HS,top,cy-HS);
          if (!isWaterTile(r+1, c)) foamPts.push(cx-HS,top,cy+HS, cx+HS,top,cy+HS);
          if (!isWaterTile(r, c-1)) foamPts.push(cx-HS,top,cy-HS, cx-HS,top,cy+HS);
          if (!isWaterTile(r, c+1)) foamPts.push(cx+HS,top,cy-HS, cx+HS,top,cy+HS);
        }

        // R2: 水位勾配から流れ方向 streak を出す。水面高さが最も低い隣接タイルへ短線を引く。
        // 泡より控えめにし、puddle 以上だけ表示する。
        if (wl >= 0.20) {
          const myLevel = waterSurfaceLevel(r, c);
          if (myLevel !== null) {
            let bestDx = 0, bestDy = 0, bestDrop = 0;
            for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
              const nl = waterSurfaceLevel(r + dy, c + dx);
              if (nl === null) continue;
              const drop = myLevel - nl;
              if (drop > bestDrop) { bestDrop = drop; bestDx = dx; bestDy = dy; }
            }
            if (bestDrop > 0.35) {
              const len = Math.min(14, 7 + bestDrop * 1.2);
              const sx = cx - bestDx * len * 0.35;
              const sz = cy - bestDy * len * 0.35;
              const ex = cx + bestDx * len * 0.65;
              const ez = cy + bestDy * len * 0.65;
              const top = y + 1.15;
              flowPts.push(sx, top, sz, ex, top, ez);
            }
          }
        }
      }
      waterDampIM.count=dampIdx;   waterDampIM.instanceMatrix.needsUpdate=true;
      waterShallowIM.count=sIdx;   waterShallowIM.instanceMatrix.needsUpdate=true;
      waterMidIM.count=mIdx;       waterMidIM.instanceMatrix.needsUpdate=true;
      waterDeepIM.count=dIdx;      waterDeepIM.instanceMatrix.needsUpdate=true;
      waterDangerIM.count=dangerIdx; waterDangerIM.instanceMatrix.needsUpdate=true;
      shimmerIM.count=shimmerIdx;  shimmerIM.instanceMatrix.needsUpdate=true;

      // inland foam LineSegments 更新
      if (waterFoamLines){ scene.remove(waterFoamLines); waterFoamLines.geometry.dispose(); waterFoamLines=null; }
      if (foamPts.length){
        const fg=new THREE.BufferGeometry();
        fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(foamPts),3));
        waterFoamLines=new THREE.LineSegments(fg, waterFoamMat);
        scene.add(waterFoamLines);
      }

      // R2: 海岸線 foam LineSegments 更新
      if (seaFoamLines){ scene.remove(seaFoamLines); seaFoamLines.geometry.dispose(); seaFoamLines=null; }
      if (seaFoamPts.length){
        const sg=new THREE.BufferGeometry();
        sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(seaFoamPts),3));
        seaFoamLines=new THREE.LineSegments(sg, seaFoamMat);
        scene.add(seaFoamLines);
      }

      // R2: 水流方向 LineSegments 更新
      if (waterFlowLines){ scene.remove(waterFlowLines); waterFlowLines.geometry.dispose(); waterFlowLines=null; }
      if (flowPts.length){
        const wg=new THREE.BufferGeometry();
        wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(flowPts),3));
        waterFlowLines=new THREE.LineSegments(wg, waterFlowMat);
        scene.add(waterFlowLines);
      }

      // R2: 滝ストリップ検出 + InstancedMesh 更新
      // 崖の上タイルが waterLevel >= 0.25 の場合に縦水流パネルを置く。
      // 崖壁面走査と同じ EW/NS 境界走査（ただし上タイル水判定のみ）。
      const CLIFF_THRESH = 25;
      const TILE2 = TERRAIN_TILE_SIZE;
      let wfNeeded = 0;
      for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
        const t0=world.terrain[r]![c]!;
        if(c+1<COLS){const tE=world.terrain[r]![c+1]!;const diff=Math.abs(t0.elev-tE.elev);if(diff>=CLIFF_THRESH && !rampConnectsEast(t0,tE)){const up=(t0.elev>tE.elev)?t0:tE;if(up.waterLevel>=0.25) wfNeeded++;}}
        if(r+1<ROWS){const tS=world.terrain[r+1]![c]!;const diff=Math.abs(t0.elev-tS.elev);if(diff>=CLIFF_THRESH && !rampConnectsSouth(t0,tS)){const up=(t0.elev>tS.elev)?t0:tS;if(up.waterLevel>=0.25) wfNeeded++;}}
      }
      if(wfNeeded > MAX_WATERFALL_WALLS){
        while(MAX_WATERFALL_WALLS < wfNeeded) MAX_WATERFALL_WALLS *= 2;
        const oldWF = waterfallIM;
        waterfallIM = new THREE.InstancedMesh(_waterfallGeo,
          new THREE.MeshBasicMaterial({map:waterfallTex,color:0x88ccff,transparent:true,opacity:0.70,depthWrite:false,side:THREE.DoubleSide}),
          MAX_WATERFALL_WALLS);
        waterfallIM.renderOrder = 1;
        scene.remove(oldWF); oldWF.dispose(); scene.add(waterfallIM);
      }
      const _wfMat = new THREE.Matrix4();
      const _wfPos = new THREE.Vector3();
      const _wfQuat = new THREE.Quaternion();
      const _wfScale = new THREE.Vector3();
      const _wfEulerEW = new THREE.Euler(0, Math.PI/2, 0);
      const _wfEulerNS = new THREE.Euler(0, 0, 0);
      let wfIdx = 0;
      for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
        const t0=world.terrain[r]![c]!;
        // EW 境界
        if(c+1<COLS){
          const tE=world.terrain[r]![c+1]!;
          const diff=Math.abs(t0.elev-tE.elev);
          if(diff>=CLIFF_THRESH && !rampConnectsEast(t0,tE)){
            const isUpperLeft=t0.elev>tE.elev;
            const upper=isUpperLeft?t0:tE;
            if(upper.waterLevel>=0.25){
              const lo=Math.min(t0.elev,tE.elev), hi=Math.max(t0.elev,tE.elev);
              const wallH=(hi-lo)*ELEV_SCALE;
              _wfPos.set((c+1)*TILE2, (lo+hi)/2*ELEV_SCALE, (r+0.5)*TILE2);
              _wfQuat.setFromEuler(_wfEulerEW);
              _wfScale.set(TILE2, wallH, 1);
              _wfMat.compose(_wfPos, _wfQuat, _wfScale);
              waterfallIM.setMatrixAt(wfIdx++, _wfMat);
            }
          }
        }
        // NS 境界
        if(r+1<ROWS){
          const tS=world.terrain[r+1]![c]!;
          const diff=Math.abs(t0.elev-tS.elev);
          if(diff>=CLIFF_THRESH && !rampConnectsSouth(t0,tS)){
            const isUpperTop=t0.elev>tS.elev;
            const upper=isUpperTop?t0:tS;
            if(upper.waterLevel>=0.25){
              const lo=Math.min(t0.elev,tS.elev), hi=Math.max(t0.elev,tS.elev);
              const wallH=(hi-lo)*ELEV_SCALE;
              _wfPos.set((c+0.5)*TILE2, (lo+hi)/2*ELEV_SCALE, (r+1)*TILE2);
              _wfQuat.setFromEuler(_wfEulerNS);
              _wfScale.set(TILE2, wallH, 1);
              _wfMat.compose(_wfPos, _wfQuat, _wfScale);
              waterfallIM.setMatrixAt(wfIdx++, _wfMat);
            }
          }
        }
      }
      waterfallIM.count = wfIdx;
      waterfallIM.instanceMatrix.needsUpdate = true;
    }
    // shimmer の opacity は毎フレーム sin で揺らす（フレームごと再計算なし）
    {
      const t = world.timeSec;
      (shimmerIM.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(t*2.0) * 0.20;
    }

    // ---- Σ-7-b: 雨粒（5フレームごと、雨天時のみ）----
    if(frameCount%5===0){
      if(rainLines){ scene.remove(rainLines); rainLines.geometry.dispose(); rainLines=null; }
      const k=world.weather.kind;
      const isRain = k==='light_rain' || k==='heavy_rain' || k==='storm';
      if(isRain){
        const count = k==='storm' ? 500 : k==='heavy_rain' ? 350 : 200;
        // カメラ周辺の世界座標範囲を雨粒で埋める
        const halfRange = 1200/zoom;
        const pts = new Float32Array(count*6);
        for(let i=0;i<count;i++){
          const rx = camX + (Math.random()-0.5)*halfRange*2;
          const rz = camZ + (Math.random()-0.5)*halfRange*2;
          const ry = 60 + Math.random()*120;
          const len = k==='storm' ? 18 : 12;
          pts[i*6]=rx; pts[i*6+1]=ry; pts[i*6+2]=rz;
          pts[i*6+3]=rx-1.5; pts[i*6+4]=ry-len; pts[i*6+5]=rz;
        }
        const lg=new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.BufferAttribute(pts,3));
        rainLines = new THREE.LineSegments(lg, rainMat);
        scene.add(rainLines);
      }
    }

    // ---- stability 警告（3フレームごと、InstancedMesh）----
    if(frameCount%3===0){
      const pS=Math.sin(world.timeSec*3)*0.5+0.5, pF=Math.sin(world.timeSec*5)*0.5+0.5;
      (stWarnIM.material as THREE.MeshBasicMaterial).opacity=0.18+pS*0.15;
      (stCritIM.material as THREE.MeshBasicMaterial).opacity=0.30+pF*0.20;
      let warnIdx=0, critIdx=0;
      for(let r=0;r<world.terrain.length;r++) for(let c=0;c<world.terrain[r]!.length;c++){
        const tile=world.terrain[r]![c]!;
        if(tile.stability>=0.5) continue;
        _imDummy.position.set((c+0.5)*TERRAIN_TILE_SIZE, tile.elev*ELEV_SCALE+2, (r+0.5)*TERRAIN_TILE_SIZE);
        _imDummy.updateMatrix();
        if(tile.stability<0.3) stCritIM.setMatrixAt(critIdx++,_imDummy.matrix);
        else stWarnIM.setMatrixAt(warnIdx++,_imDummy.matrix);
      }
      stWarnIM.count=warnIdx; stCritIM.count=critIdx;
      stWarnIM.instanceMatrix.needsUpdate=true;
      stCritIM.instanceMatrix.needsUpdate=true;
    }

    // ---- Features（3フレームごと — Σ-5-b 3D モデル）----
    if(frameCount%3===0){
      const fids=new Set(world.features.map(f=>f.id));
      for(const [id,v] of featViews){
        if(!fids.has(id)){ featGrp.remove(v.grp); featViews.delete(id); }
      }
      for(const f of world.features){
        // キャッシュキー：id + devLevel + saturated + wateredByTile（変化したら再構築）
        const fkey=`${f.devLevel}:${f.saturated?1:0}:${f.wateredByTile?1:0}`;
        const existing=featViews.get(f.id);
        if(!existing || existing.key!==fkey){
          if(existing){ featGrp.remove(existing.grp); }
          const grp=makeFeatureGroup(f);
          featGrp.add(grp);
          featViews.set(f.id,{grp,key:fkey});
        }
        const grp=featViews.get(f.id)!.grp;
        grp.position.set(f.pos.x, elevAt(world.terrain,f.pos.x,f.pos.y), f.pos.y);
      }

      // 電線
      if(wireLines){fxGrp.remove(wireLines); wireLines.geometry.dispose(); wireLines=null;}
      const nodes=world.features.filter(f=>f.kind==='powerline'||f.kind==='generator'||f.kind==='streetlamp');
      if(nodes.length>=2){
        const R2=POWERLINE_CONNECT_RADIUS**2, pts:number[]=[];
        for(let i=0;i<nodes.length;i++) for(let j=i+1;j<nodes.length;j++){
          const a=nodes[i]!,b=nodes[j]!;
          if((a.pos.x-b.pos.x)**2+(a.pos.y-b.pos.y)**2>R2) continue;
          pts.push(a.pos.x,elevAt(world.terrain,a.pos.x,a.pos.y)+8,a.pos.y,
                   b.pos.x,elevAt(world.terrain,b.pos.x,b.pos.y)+8,b.pos.y);
        }
        if(pts.length){
          const lit=world.features.some(f=>f.kind==='streetlamp'&&f.saturated);
          const lg=new THREE.BufferGeometry();
          lg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(pts),3));
          wireLines=new THREE.LineSegments(lg,new THREE.LineBasicMaterial({color:lit?0xffd870:0x6a5848,transparent:true,opacity:lit?0.7:0.5}));
          fxGrp.add(wireLines);
        }
      }
    }

    // ---- Σ-5-e-d: UV スクロール水流 + 水源波紋（毎フレーム） ----
    {
      const fset=new Set(world.features.map(f=>f.id));
      // 消えた feature の流れメッシュをクリーンアップ
      for(const [id,m] of channelFlowMeshes){
        if(!fset.has(id)){ featGrp.remove(m); m.geometry.dispose(); channelFlowMeshes.delete(id); }
      }
      for(const [id,r] of waterRippleMeshes){
        if(!fset.has(id)){ fxGrp.remove(r.torus); r.torus.geometry.dispose(); waterRippleMeshes.delete(id); }
      }
      for(const f of world.features){
        // channel UV スクロール（devLevel >= 2 かつ saturated）
        if(f.kind==='channel' && f.devLevel>=2 && f.saturated){
          if(!channelFlowMeshes.has(f.id)){
            const flow=new THREE.Mesh(
              new THREE.PlaneGeometry(34,8),
              new THREE.MeshBasicMaterial({map:waterFlowTex,transparent:true,opacity:0.65,depthWrite:false,side:THREE.DoubleSide})
            );
            flow.rotation.x=-Math.PI/2;
            featGrp.add(flow); channelFlowMeshes.set(f.id,flow);
          }
          const flow=channelFlowMeshes.get(f.id)!;
          (flow.material as THREE.MeshBasicMaterial).map!.offset.x -= dt*0.8;
          flow.position.set(f.pos.x, elevAt(world.terrain,f.pos.x,f.pos.y)+6.5, f.pos.y);
        } else if(channelFlowMeshes.has(f.id)){
          const m=channelFlowMeshes.get(f.id)!; featGrp.remove(m); m.geometry.dispose(); channelFlowMeshes.delete(f.id);
        }
        // water 波紋（devLevel >= 2）
        if(f.kind==='water' && f.devLevel>=2){
          if(!waterRippleMeshes.has(f.id)){
            const mat=new THREE.MeshBasicMaterial({color:0x80d8ff,transparent:true,opacity:0.6,side:THREE.DoubleSide,depthWrite:false});
            const torus=new THREE.Mesh(new THREE.TorusGeometry(18,2,6,16),mat);
            torus.rotation.x=-Math.PI/2;
            fxGrp.add(torus); waterRippleMeshes.set(f.id,{torus,mat,phase:Math.random()*Math.PI*2});
          }
          const r=waterRippleMeshes.get(f.id)!;
          r.phase=(r.phase+dt*Math.PI)%(Math.PI*2);
          const s=0.5+r.phase/(Math.PI*2);
          r.torus.scale.setScalar(s);
          r.mat.opacity=0.6*(1-r.phase/(Math.PI*2));
          r.torus.position.set(f.pos.x, elevAt(world.terrain,f.pos.x,f.pos.y)+5, f.pos.y);
        } else if(waterRippleMeshes.has(f.id)){
          const r=waterRippleMeshes.get(f.id)!; fxGrp.remove(r.torus); r.torus.geometry.dispose(); waterRippleMeshes.delete(f.id);
        }
      }
    }

    // ---- Σ-5-e-e: 建設進捗オーバーレイ（pt 数値表示）----
    {
      const FEAT_NAME_SHORT: Partial<Record<string,string>>={water:'水源',farm:'畑',channel:'水路',path:'道',house:'家',well:'井戸',firewatch:'火の見',sawmill:'製材所',shrine:'神社',generator:'発電所',streetlamp:'街灯',powerline:'電線',kiln:'精錬所',pasture:'牧場',loom:'織機'};
      // Σ-5-e-e: CONSTRUCTION_PTS に合わせた値（world.ts の CONSTRUCTION_PTS と同値）
      const CONSTRUCTION_PTS_LOCAL: Partial<Record<string,number>>={channel:25,path:25,streetlamp:25,powerline:25,water:45,farm:45,house:80,well:80,firewatch:80,pasture:80,sawmill:120,shrine:120,kiln:120,loom:120,generator:120};
      // 複数人ボーナス倍率（world.ts の CONSTRUCTION_BONUS_MUL と同値）
      const BONUS_MUL=[0,1.0,1.8,2.5,3.0];
      const liveIds=new Set(world.features.filter(f=>f.devLevel<2).map(f=>f.id));
      // 完成した feature の div を削除
      for(const [id,div] of cnDivs){ if(!liveIds.has(id)){ cnOverlay.removeChild(div); cnDivs.delete(id); cnLastWorkerSec.delete(id); } }
      for(const f of world.features){
        if(f.devLevel>=2) continue;
        const diffMul=world.difficulty==='beginner'?0.7:world.difficulty==='hell'?1.3:1.0;
        const needed=Math.round((CONSTRUCTION_PTS_LOCAL[f.kind]??45)*diffMul);
        const currentPt=Math.round(Math.min(f.workSec,needed));
        // worker 数（半径 28px）
        let workers=0;
        for(const c of world.chibis){
          if(c.state==='dead'||!c.pos) continue;
          if(Math.hypot(c.pos.x-f.pos.x,c.pos.y-f.pos.y)<=28) workers++;
        }
        if(workers>0) cnLastWorkerSec.set(f.id,world.timeSec);
        const sinceWorker=world.timeSec-(cnLastWorkerSec.get(f.id)??-999);
        const stale=sinceWorker>60;
        if(!cnDivs.has(f.id)){
          const div=document.createElement('div');
          Object.assign(div.style,{position:'absolute',transform:'translateX(-50%)',background:'rgba(42,26,10,0.85)',
            color:'#ffd580',borderRadius:'4px',padding:'2px 6px',fontSize:'11px',fontWeight:'700',
            whiteSpace:'nowrap',pointerEvents:'none',zIndex:'110',border:'1px solid #8b6030'});
          cnOverlay.appendChild(div); cnDivs.set(f.id,div);
        }
        const div=cnDivs.get(f.id)!;
        const name=FEAT_NAME_SHORT[f.kind]??f.kind;
        const mul=BONUS_MUL[Math.min(4,workers)]??3.0;
        const workerStr=workers>0?` (${workers}人 → ${mul.toFixed(1)}x)`:'';
        div.textContent=stale?`⚠ ${name} 誰も来ない`:`🔨 ${name} ${currentPt}/${needed} pt${workerStr}`;
        div.style.color=stale?'#ff8888':'#ffd580';
        // worldToScreen でラベル位置を更新
        const ey=elevAt(world.terrain,f.pos.x,f.pos.y);
        const sp=worldToScreen(f.pos.x,f.pos.y,ey+50);
        div.style.left=`${sp.x-renderer.domElement.getBoundingClientRect().left}px`;
        div.style.top=`${sp.y-renderer.domElement.getBoundingClientRect().top-18}px`;
      }
    }

    // ---- Obstacles（3フレームごと）----
    if(frameCount%3===0){
      const oids=new Set(world.obstacles.map(o=>o.id));
      rmStale(obsViews,oids,obsGrp);
      for(const obs of world.obstacles){
        if(!obsViews.has(obs.id)){
          if(!obsTexMap.has(obs.kind)) obsTexMap.set(obs.kind,obsTex(obs.kind));
          const m=spriteMesh(36,36,obsTexMap.get(obs.kind)!);
          (m.material as THREE.MeshBasicMaterial).color.setRGB(...curCharTint);
          obsGrp.add(m); obsViews.set(obs.id,m);
        }
        const m=obsViews.get(obs.id)!;
        m.scale.setScalar(0.5+obs.hp/obs.maxHp*0.5);
        m.position.set(obs.pos.x, elevAt(world.terrain,obs.pos.x,obs.pos.y)+18, obs.pos.y);
      }
    }

    // ---- Buildings ----
    const bset=new Set(world.buildings.map((_,i)=>`${world.buildings[i]!.defId}:${world.buildings[i]!.level}:${i}`));
    for(const [k,g] of bldViews){ if(!bset.has(k)){ bldGrp.remove(g); bldViews.delete(k); } }
    for(let i=0;i<world.buildings.length;i++){
      const b=world.buildings[i]!;
      const k=`${b.defId}:${b.level}:${i}`;
      if(!bldViews.has(k)){ const g=makeBuildingGroup(b); bldGrp.add(g); bldViews.set(k,g); }
      const g=bldViews.get(k)!;
      g.position.set(b.pos.x, elevAt(world.terrain,b.pos.x,b.pos.y), b.pos.y);
    }

    // ---- Corpses ----
    const cids=new Set(world.corpses.map(c=>c.id));
    rmStale(corpseViews,cids,corpseGrp);
    for(const c of world.corpses){
      if(!corpseViews.has(c.id)){
        const {tex, idx} = pickCorpseTex(c.deathCauseId, chibiTexs);
        const m=spriteMesh(CHIBI_W*0.85,CHIBI_H*0.85,tex);
        (m.material as THREE.MeshBasicMaterial).color.setRGB(...curCharTint);
        (m.material as THREE.MeshBasicMaterial).opacity=0.8;
        // pose 補正を死体にも適用（不揃いに見えるのを防ぐ）
        const sc = CHIBI_POSE_SCALE[idx];
        if (sc) m.scale.set(sc[0], sc[1], 1);
        corpseGrp.add(m); corpseViews.set(c.id,m);
      }
      const m=corpseViews.get(c.id)!;
      m.position.set(c.pos.x, elevAt(world.terrain,c.pos.x,c.pos.y)+CHIBI_H*0.42+3, c.pos.y);
    }

    // ---- Chibis ----
    const aliveIds=new Set(world.chibis.map(c=>c.id));
    for(const [id,v] of chibiViews){ if(!aliveIds.has(id)){ chibiGrp.remove(v.mesh); v.mesh.geometry.dispose(); chibiViews.delete(id); } }
    const ondo=world.event?.kind==='ondo';
    for(const c of world.chibis){
      const v=ensureMView(chibiViews as Map<number,MView>,c.id,c.state,chibiTexs,chibiGrp,CHIBI_W,CHIBI_H,CHIBI_STATE_IDX);
      // 飛行中（投げられて空中）は thrown_airborne ポーズで上書き
      const poseOverride = c.flight ? CHIBI_FLIGHT_IDX : undefined;
      syncSpriteState(v,c.state,c.faceLeft,chibiTexs,CHIBI_STATE_IDX,poseOverride,/*useScaleTable*/true);
      let wx=c.pos.x, wz=c.pos.y;
      if(ondo) wx+=Math.sin(world.timeSec*6+c.id*0.7)*8;
      const baseY=c.flight ? c.flight.posZ*ELEV_SCALE : elevAt(world.terrain,wx,wz);
      // Σ-8-c-1.5: 壁面と被った時に浮いて見える余裕として +4 lift
      let posY=baseY+CHIBI_H*0.5+4;
      if(c.state==='idle'||c.state==='chatting'){
        posY+=Math.abs(Math.sin(world.timeSec*3+c.id*0.4))*(c.params.energy*0.0008)*4;
      }
      v.mesh.position.set(wx,posY,wz);
    }

    // ---- NPCs ----
    for(const n of world.npcs){
      const isFurana=n.id==='furana';
      const texs=isFurana&&furanaTexs.length?furanaTexs:[npcTexs.get(n.id)??npcTexs.get('suzu')!];
      if(!npcViews.has(n.id)){
        const def=NPC_DEFS[n.id];
        const w=NPC_SCALE_BASE*def.scale*NPC_SCALE_BASE*18, h=w*1.4;
        const tex=texs[STATE_IDX[n.state]]??texs[0]!;
        const mesh=spriteMesh(Math.max(w,30),Math.max(h,42),tex);
        (mesh.material as THREE.MeshBasicMaterial).color.setRGB(...curCharTint);
        npcGrp.add(mesh);
        npcViews.set(n.id,{mesh,lastState:n.state,lastFace:false});
      }
      const v=npcViews.get(n.id)!;
      if(isFurana&&furanaTexs.length) syncSpriteState(v,n.state,n.faceLeft,furanaTexs);
      else if(v.lastFace!==n.faceLeft){ v.mesh.scale.x=n.faceLeft?-1:1; v.lastFace=n.faceLeft; }
      const def=NPC_DEFS[n.id];
      const nh=Math.max(42,(NPC_SCALE_BASE*def.scale*NPC_SCALE_BASE*18)*1.4);
      const wy=n.flight?n.flight.posZ*ELEV_SCALE:elevAt(world.terrain,n.pos.x,n.pos.y);
      v.mesh.position.set(n.pos.x, wy+nh*0.5, n.pos.y);
      v.mesh.visible=!n.dead;
    }

    // ---- Wolves ----
    const wids=new Set(world.wolves.map(w=>w.id));
    for(const [id,m] of wolfViews){ if(!wids.has(id)){ wolfGrp.remove(m); wolfViews.delete(id); } }
    for(const wolf of world.wolves){
      if(!wolfViews.has(wolf.id)){
        const m=spriteMesh(60,36,wolfTexture);
        (m.material as THREE.MeshBasicMaterial).color.setRGB(...curCharTint);
        wolfGrp.add(m); wolfViews.set(wolf.id,m);
      }
      const m=wolfViews.get(wolf.id)!;
      m.position.set(wolf.pos.x, elevAt(world.terrain,wolf.pos.x,wolf.pos.y)+20, wolf.pos.y);
      m.scale.x=wolf.faceLeft?-1:1;
      m.visible=wolf.state!=='dead';
    }

    // ---- Bubbles DOM ----
    const bids=new Set(world.bubbles.map(b=>b.id));
    for(const [id,div] of bubbleDivs){ if(!bids.has(id)){ bubbleOverlay.removeChild(div); bubbleDivs.delete(id); } }
    for(const b of world.bubbles){
      let div=bubbleDivs.get(b.id);
      if(!div){ div=makeBubbleDiv(b); bubbleOverlay.appendChild(div); bubbleDivs.set(b.id,div); }
      const ey=elevAt(world.terrain,b.pos.x,b.pos.y);
      const sc=worldToScreen(b.pos.x,b.pos.y,ey);
      const alpha=Math.min(1,b.ttl/Math.max(0.2,b.maxTtl*0.35));
      div.style.transform=`translate(-50%,-100%) translate(${sc.x}px,${sc.y}px)`;
      div.style.opacity=String(alpha);
    }

    // ---- Σ-5-c: terraform 進捗オーバーレイ ----
    {
      const activeIds = new Set(world.terraformJobs.map(j=>j.id));
      for(const [id,div] of tfDivs){ if(!activeIds.has(id)){ tfOverlay.removeChild(div); tfDivs.delete(id); tfLastWorkerSec.delete(id); } }
      const WORKER_R = 28;
      for(const job of world.terraformJobs){
        // 作業者数カウント
        const cx=(job.tx+0.5)*TERRAIN_TILE_SIZE, cy=(job.ty+0.5)*TERRAIN_TILE_SIZE;
        let workers=0;
        for(const c of world.chibis){
          if(c.state==='dead'||c.flight) continue;
          if(Math.hypot(c.pos.x-cx,c.pos.y-cy)<=WORKER_R) workers++;
        }
        // 放置タイマー更新
        if(workers>0) tfLastWorkerSec.set(job.id, world.timeSec);
        const idleSec = world.timeSec - (tfLastWorkerSec.get(job.id) ?? world.timeSec);
        const abandoned = idleSec >= 60;

        let div = tfDivs.get(job.id);
        if(!div){
          div = document.createElement('div');
          div.style.cssText='position:absolute;left:0;top:0;pointer-events:none;transform:translate(-50%,-50%);';
          tfOverlay.appendChild(div);
          tfDivs.set(job.id, div);
        }
        // 位置更新（terrain 高度に追従）
        const ey=elevAt(world.terrain,cx,cy);
        const sc=worldToScreen(cx,cy,ey);
        div.style.transform='translate(-50%,-50%)';
        div.style.left=`${sc.x}px`;
        div.style.top=`${sc.y - 20}px`;

        const pct=Math.round(job.progress*100);
        const zoomedOut = zoom < 0.48;

        // R3: ramp ジョブは専用レイアウト（blocked / working / planned の 3 状態）
        if(job.target === 'ramp'){
          const dirLabel = job.dir ? ({N:'↑',S:'↓',E:'→',W:'←'} as const)[job.dir] : '';
          if(job.blockedReason){
            // blocked 状態: 赤背景 + X マーク + 理由
            const bgR='rgba(200,30,30,0.90)';
            div.innerHTML=`<div style="background:${bgR};border-radius:3px;padding:2px 5px;font-size:10px;color:#fff;font-weight:700;white-space:nowrap;line-height:1.3">` +
              `⛔ ${zoomedOut ? 'NG' : job.blockedReason}</div>`;
          } else if(workers > 0){
            // working 状態: 緑背景 + 進捗バー
            const bgW='rgba(20,80,20,0.85)';
            const text = zoomedOut ? `🚧${pct}%` : `🚧 坂道 ${dirLabel} ${pct}% (${workers}人)`;
            div.innerHTML=`<div style="background:${bgW};border-radius:3px;padding:2px 4px;font-size:10px;color:#fff;font-weight:700;white-space:nowrap;line-height:1.3">` +
              `${text}</div>` +
              `<div style="width:40px;height:4px;background:#333;border-radius:2px;margin-top:1px">` +
              `<div style="width:${pct}%;height:100%;background:#60e030;border-radius:2px;transition:width 0.3s"></div></div>`;
          } else {
            // planned 状態: 暗黄緑背景 + 予約表示
            const bgP = abandoned ? 'rgba(160,60,0,0.85)' : 'rgba(50,70,20,0.80)';
            const text = abandoned ? (zoomedOut ? '⚠' : '⚠ 作業者不在') :
                         (zoomedOut ? `🚧${pct}%` : `🚧 坂道予約 ${dirLabel} ${pct}%`);
            div.innerHTML=`<div style="background:${bgP};border-radius:3px;padding:2px 4px;font-size:10px;color:#ddf;font-weight:700;white-space:nowrap;line-height:1.3">` +
              `${text}</div>` +
              `<div style="width:40px;height:4px;background:#333;border-radius:2px;margin-top:1px">` +
              `<div style="width:${pct}%;height:100%;background:#90e840;border-radius:2px;transition:width 0.3s"></div></div>`;
          }
        } else {
          const label=job.target==='raise'?'⛰ 盛り土':'⛏ 切り土';
          const barFill=abandoned?'#ff8020':'#4ad870';
          const bg=abandoned?'rgba(200,80,0,0.85)':'rgba(20,10,5,0.75)';
          const text = abandoned ? '⚠ 作業者不在' : (zoomedOut ? `${pct}%` : `${label} ${pct}% (${workers}人)`);
          const width = zoomedOut ? 30 : 40;
          const fontSize = zoomedOut ? 9 : 10;
          div.innerHTML=`<div style="background:${bg};border-radius:3px;padding:2px 4px;font-size:${fontSize}px;color:#fff;font-weight:700;white-space:nowrap;line-height:1.3">` +
            `${text}` +
            `</div><div style="width:${width}px;height:4px;background:#333;border-radius:2px;margin-top:1px">` +
            `<div style="width:${pct}%;height:100%;background:${barFill};border-radius:2px;transition:width 0.3s"></div></div>`;
        }
      }
    }

    // Σ-8-e: hover preview ghost — tile elev に追従させる
    if (_hoverActive && _hoverState) {
      const cx = (_hoverState.tx + 0.5) * TERRAIN_TILE_SIZE;
      const cy = (_hoverState.ty + 0.5) * TERRAIN_TILE_SIZE;
      hoverMesh.position.set(cx, elevAt(world.terrain, cx, cy) + 1.5, cy);
      (hoverMesh.material as THREE.MeshBasicMaterial).color.setHex(_hoverState.color);
      hoverMesh.visible = true;
    } else {
      hoverMesh.visible = false;
    }

    renderer.render(scene, camera);
  }


  // ============================================================
  // StageHandle 残メソッド
  // ============================================================
  function resize(_w:number, _h:number){
    renderer.setSize(host.clientWidth, host.clientHeight);
    camera.aspect=host.clientWidth/Math.max(1,host.clientHeight);
    camera.updateProjectionMatrix();
  }

  function resetCamera(){
    if(currentDifficulty==='beginner') focusOn(1600,900,0.7);
    else if(currentDifficulty==='hell') focusOn(1600,900,1.0);
    else focusOn(1280,700,0.85);
  }

  // ウィンドウリサイズ配信（Σ-4-f 以降、Pixi app shim ではなく直接 StageHandle 提供）
  const resizeCbs: Array<(w:number,h:number)=>void> = [];
  window.addEventListener('resize',()=>{
    const w=renderer.domElement.clientWidth, h=renderer.domElement.clientHeight;
    resizeCbs.forEach(cb=>cb(w,h));
  });

  return {
    canvas: renderer.domElement,
    onResize: (cb)=>{ resizeCbs.push(cb); },
    resize,
    draw,
    setSeason(_s: Season){ /* 季節ごとの色変更は draw() 内の weather/dayPhase で対応 */ },
    resetCamera,
    focusOn,
    panCamera,
    getCamera,
    screenToWorld: stwXZ,
    setHitTest: (fn)=>{ hitFn=fn; },
    setContourVisible: (visible: boolean)=>{ contourVisible = visible; if (contourLines) contourLines.visible = visible; },
    setPanEnabled,
    setCameraPreset: (preset) => { camPreset = preset; applyCamera(); },
    getCameraPreset: () => camPreset,
    setHoverTile: (tx, ty, color)=>{
      if (tx === null || ty === null) {
        _hoverActive = false;
        if (_hoverState) { /* keep last; visibility off */ }
        hoverMesh.visible = false;
        return;
      }
      _hoverActive = true;
      if (_hoverState) {
        _hoverState.tx = tx;
        _hoverState.ty = ty;
        _hoverState.color = color ?? 0x7fcf6b;
      }
    },
  };
}
