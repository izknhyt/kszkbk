// Σ-4 Three.js 3D renderer — くそざこ村
// Σ-4-f で旧 Pixi stage.ts を削除し本レンダラーが唯一のステージ実装になった。
import * as THREE from 'three';
import type { WorldState } from '../sim/world';
import { POWERLINE_CONNECT_RADIUS, TERRAIN_TILE_SIZE } from '../sim/world';
import { isSeaAt } from '../sim/terrain/query';
import type { ChibiState, DayPhase, Difficulty, HitTarget, PlacedBuilding, Season } from '../types';
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
}

// ============================================================
// 定数
// ============================================================
const ELEV_SCALE   = 12;   // elev (0-100) → Three.js Y (0-1200)。高低差を強調して 3D 感を出す
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

// ============================================================
// 地形カラー — 標高で色を「層別に」変える地図的アプローチ。
// 低地は緑、中腹は薄い緑、高地は乾いた茶〜岩、頂上は明るい灰。
// material は補正係数として軽く効かせる程度（rock は灰寄り、sand は黄寄り）。
const MAT_RGB: Record<string, [number,number,number]> = {
  grass:[0x6b/255,0x9e/255,0x4a/255],
  soil: [0xa8/255,0x7a/255,0x4a/255],
  sand: [0xe0/255,0xc9/255,0x8a/255],
  rock: [0x7a/255,0x7a/255,0x7a/255],
  water:[0x4a/255,0x6b/255,0x9c/255],
};
// 標高別カラーランプ（5 段階）：低地から高地までグラデーション。
// elev 0-20 = 深い緑、20-40 = 草緑、40-60 = 薄緑黄、60-80 = 茶、80-100 = 明るい灰
const ELEV_RAMP: Array<[number,[number,number,number]]> = [
  [  0, [0x35/255,0x60/255,0x30/255]],  // 深い緑（低地）
  [ 20, [0x6b/255,0x9e/255,0x4a/255]],  // 草緑
  [ 45, [0xa8/255,0xb8/255,0x60/255]],  // 薄緑黄（草原台地）
  [ 65, [0xb0/255,0x88/255,0x4a/255]],  // 茶（土山腹）
  [ 85, [0xc8/255,0xc4/255,0xb0/255]],  // 明るい灰（岩山頂）
  [100, [0xe8/255,0xe4/255,0xd8/255]],  // ほぼ白（最高峰）
];
function rampColor(elev: number): [number,number,number] {
  const e = Math.max(0, Math.min(100, elev));
  for (let i = 0; i < ELEV_RAMP.length - 1; i++) {
    const [e0, c0] = ELEV_RAMP[i]!;
    const [e1, c1] = ELEV_RAMP[i+1]!;
    if (e <= e1) {
      const t = (e - e0) / Math.max(0.001, e1 - e0);
      return [
        c0[0] + (c1[0] - c0[0]) * t,
        c0[1] + (c1[1] - c0[1]) * t,
        c0[2] + (c1[2] - c0[2]) * t,
      ];
    }
  }
  return ELEV_RAMP[ELEV_RAMP.length - 1]![1];
}
function tileRgb(mat: string, elev: number): [number,number,number] {
  // ベースは標高 ramp、material は弱いブレンドで個性付け
  const r = rampColor(elev);
  const m = MAT_RGB[mat] ?? MAT_RGB['soil']!;
  // material 30% / ramp 70% でブレンド（material バリエーションは残す）
  return [r[0]*0.7 + m[0]*0.3, r[1]*0.7 + m[1]*0.3, r[2]*0.7 + m[2]*0.3];
}

// ============================================================
// 地形 BufferGeometry 構築
// ============================================================
function buildTerrainGeo(terrain: import('../types').TerrainTile[][]): THREE.BufferGeometry {
  const ROWS = terrain.length || T_ROWS;
  const COLS = (terrain[0]?.length) || T_COLS;
  const VW = COLS+1, VH = ROWS+1, nV = VW*VH;
  const pos = new Float32Array(nV*3);
  const col = new Float32Array(nV*3);
  const idx = new Uint32Array(ROWS*COLS*6);

  for (let vi=0; vi<VH; vi++) {
    for (let ui=0; ui<VW; ui++) {
      const vIdx = vi*VW+ui;
      let eSum=0, cnt=0;
      for (let dr=-1; dr<=0; dr++) for (let dc=-1; dc<=0; dc++) {
        const tr=vi+dr, tc=ui+dc;
        if (tr>=0&&tr<ROWS&&tc>=0&&tc<COLS){ eSum+=terrain[tr]![tc]!.elev; cnt++; }
      }
      const elev = cnt>0 ? eSum/cnt : 0;
      pos[vIdx*3]   = ui*TERRAIN_TILE_SIZE;
      pos[vIdx*3+1] = elev*ELEV_SCALE;
      pos[vIdx*3+2] = vi*TERRAIN_TILE_SIZE;
      const nr = Math.min(ROWS-1, vi===VH-1?vi-1:vi);
      const nc = Math.min(COLS-1, ui===VW-1?ui-1:ui);
      const tile = terrain[nr]![nc]!;
      const [r,g,bv] = tileRgb(tile.material, elev);
      col[vIdx*3]=r; col[vIdx*3+1]=g; col[vIdx*3+2]=bv;
    }
  }
  let ii=0;
  for (let row=0; row<ROWS; row++) for (let c2=0; c2<COLS; c2++) {
    const tl=row*VW+c2, tr=tl+1, bl=(row+1)*VW+c2, br=bl+1;
    idx[ii++]=tl; idx[ii++]=bl; idx[ii++]=tr;
    idx[ii++]=tr; idx[ii++]=bl; idx[ii++]=br;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
  geo.setAttribute('color',    new THREE.BufferAttribute(col,3));
  geo.setIndex(new THREE.BufferAttribute(idx,1));
  geo.computeVertexNormals();
  return geo;
}

function refreshTerrainGeo(geo: THREE.BufferGeometry, terrain: import('../types').TerrainTile[][]): void {
  const ROWS=terrain.length||T_ROWS, COLS=(terrain[0]?.length)||T_COLS;
  const VW=COLS+1, VH=ROWS+1;
  const posA = geo.getAttribute('position') as THREE.BufferAttribute;
  const colA = geo.getAttribute('color')    as THREE.BufferAttribute;
  for (let vi=0;vi<VH;vi++) for (let ui=0;ui<VW;ui++) {
    const vIdx=vi*VW+ui;
    let eSum=0, cnt=0;
    for (let dr=-1;dr<=0;dr++) for (let dc=-1;dc<=0;dc++) {
      const tr=vi+dr, tc=ui+dc;
      if (tr>=0&&tr<ROWS&&tc>=0&&tc<COLS){ eSum+=terrain[tr]![tc]!.elev; cnt++; }
    }
    const elev=cnt>0?eSum/cnt:0;
    posA.setXYZ(vIdx, ui*TERRAIN_TILE_SIZE, elev*ELEV_SCALE, vi*TERRAIN_TILE_SIZE);
    const nr=Math.min(ROWS-1,vi===VH-1?vi-1:vi);
    const nc=Math.min(COLS-1,ui===VW-1?ui-1:ui);
    const tile=terrain[nr]![nc]!;
    const [r,g,bv]=tileRgb(tile.material,elev);
    colA.setXYZ(vIdx,r,g,bv);
  }
  posA.needsUpdate=true; colA.needsUpdate=true;
  geo.computeVertexNormals();
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
  const ROWS = terrain.length;
  const COLS = terrain[0]?.length ?? 0;
  if (ROWS === 0 || COLS === 0) return 0;
  const u = wx / TERRAIN_TILE_SIZE;
  const v = wy / TERRAIN_TILE_SIZE;
  const u0 = Math.max(0, Math.min(COLS, Math.floor(u)));
  const v0 = Math.max(0, Math.min(ROWS, Math.floor(v)));
  const u1 = Math.min(COLS, u0 + 1);
  const v1 = Math.min(ROWS, v0 + 1);
  const fu = Math.max(0, Math.min(1, u - u0));
  const fv = Math.max(0, Math.min(1, v - v0));
  const vElev = (ui: number, vi: number): number => {
    let sum = 0, cnt = 0;
    for (let dr = -1; dr <= 0; dr++) for (let dc = -1; dc <= 0; dc++) {
      const tr = vi + dr, tc = ui + dc;
      if (tr >= 0 && tr < ROWS && tc >= 0 && tc < COLS) { sum += terrain[tr]![tc]!.elev; cnt++; }
    }
    return cnt > 0 ? sum / cnt : 0;
  };
  const e00 = vElev(u0, v0), e10 = vElev(u1, v0);
  const e01 = vElev(u0, v1), e11 = vElev(u1, v1);
  const e0 = e00 * (1 - fu) + e10 * fu;
  const e1 = e01 * (1 - fu) + e11 * fu;
  return (e0 * (1 - fv) + e1 * fv) * ELEV_SCALE;
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
  return new THREE.Mesh(geo, mat);
}

// ============================================================
// 日時計ティント
// ============================================================
const PHASE_TINT: Record<DayPhase,{sky:number;amb:number;dir:number;dirC:number}> = {
  morning: {sky:0xf5c880, amb:0.55, dir:0.85, dirC:0xffcc88},
  noon:    {sky:0x87ceeb, amb:0.70, dir:1.00, dirC:0xffffff},
  evening: {sky:0xe06030, amb:0.45, dir:0.70, dirC:0xff9a50},
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
  const terrainMat = new THREE.MeshToonMaterial({ vertexColors:true, gradientMap:gradMap });
  const terrainMesh = new THREE.Mesh(new THREE.BufferGeometry(), terrainMat);
  scene.add(terrainMesh);
  let terrainGeo: THREE.BufferGeometry|null = null;
  let terrainBuiltAt = -9999;

  // --- 海面（恒久的に存在、isSeaAt タイルの下敷き）---
  const seaMat = new THREE.MeshBasicMaterial({color:0x1f4c7a,transparent:true,opacity:0.85,side:THREE.DoubleSide});
  const seaMesh = new THREE.Mesh(
    (() => { const g=new THREE.PlaneGeometry(CONFIG.WORLD_W,CONFIG.WORLD_H); g.rotateX(-Math.PI/2); return g; })(),
    seaMat,
  );
  seaMesh.position.set(CONFIG.WORLD_W/2, 0.8, CONFIG.WORLD_H/2);
  scene.add(seaMesh);

  // --- Σ-7-b: 動的水たまりタイル（waterLevel >=0.2 のタイル毎に配置）---
  // 4 段階の深さで色分け（湿り/浅瀬/中/深）。4 個の InstancedMesh を使い分ける。
  // 湿り（wl 0.05-0.2）は薄く、雨上がりのフェード演出にも使う。
  // map: rippleTex で波紋アニメ、UV offset を時間で更新して「流れる」感じを出す。
  // rippleTex 適用は後で（rippleTex 定義後に行う必要があるため、参照は draw() 内で）。
  const _waterTileGeo = new THREE.PlaneGeometry(TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE);
  _waterTileGeo.rotateX(-Math.PI/2);
  // 色彩度+20%、opacity 強化で水っぽさアップ
  const waterDampIM = new THREE.InstancedMesh(_waterTileGeo,
    new THREE.MeshBasicMaterial({color:0x8fc8e8,transparent:true,opacity:0.35,depthWrite:false,side:THREE.DoubleSide}),
    T_COLS*T_ROWS);
  const waterShallowIM = new THREE.InstancedMesh(_waterTileGeo,
    new THREE.MeshBasicMaterial({color:0x55b0e5,transparent:true,opacity:0.62,depthWrite:false,side:THREE.DoubleSide}),
    T_COLS*T_ROWS);
  const waterMidIM = new THREE.InstancedMesh(_waterTileGeo,
    new THREE.MeshBasicMaterial({color:0x2a82c8,transparent:true,opacity:0.78,depthWrite:false,side:THREE.DoubleSide}),
    T_COLS*T_ROWS);
  const waterDeepIM = new THREE.InstancedMesh(_waterTileGeo,
    new THREE.MeshBasicMaterial({color:0x1559a0,transparent:true,opacity:0.88,depthWrite:false,side:THREE.DoubleSide}),
    T_COLS*T_ROWS);
  waterDampIM.count = 0; waterShallowIM.count = 0; waterMidIM.count = 0; waterDeepIM.count = 0;
  scene.add(waterDampIM, waterShallowIM, waterMidIM, waterDeepIM);
  const waterIMs = [waterDampIM, waterShallowIM, waterMidIM, waterDeepIM];

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

  // --- Σ-7-b: 雨粒 LineSegments（雨天時のみ出現、frustum 内 300-500 本）---
  let rainLines: THREE.LineSegments | null = null;
  const rainMat = new THREE.LineBasicMaterial({color:0x88ccff,transparent:true,opacity:0.45});

  // --- レイヤーグループ ---
  const featGrp  = new THREE.Group();
  const bldGrp   = new THREE.Group();
  const obsGrp   = new THREE.Group();
  const corpseGrp= new THREE.Group();
  const chibiGrp = new THREE.Group();
  const npcGrp   = new THREE.Group();
  const wolfGrp  = new THREE.Group();
  const fxGrp    = new THREE.Group();
  scene.add(featGrp, bldGrp, obsGrp, corpseGrp, chibiGrp, npcGrp, wolfGrp, fxGrp);

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
  const tfPrevJobIds = new Map<string, { target: 'raise' | 'lower'; progress: number }>();

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

  // terraform タイル境界アウトライン（白線、毎フレーム再構築）
  let tfOutlineLines: THREE.LineSegments | null = null;

  const _stGeo = new THREE.BoxGeometry(TERRAIN_TILE_SIZE*0.94,3,TERRAIN_TILE_SIZE*0.94);
  const stWarnIM = new THREE.InstancedMesh(_stGeo,
    new THREE.MeshBasicMaterial({color:0xff6030,transparent:true,opacity:0.25}), T_COLS*T_ROWS);
  const stCritIM = new THREE.InstancedMesh(_stGeo,
    new THREE.MeshBasicMaterial({color:0xff2020,transparent:true,opacity:0.40}), T_COLS*T_ROWS);
  stWarnIM.count=0; stCritIM.count=0;
  fxGrp.add(stWarnIM,stCritIM);

  const _imDummy = new THREE.Object3D();

  // ============================================================
  // カメラ状態
  // ============================================================
  let camX = CONFIG.WORLD_W/2;
  let camZ = CONFIG.WORLD_H*0.35;
  let zoom = 0.6;

  const groundPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
  const rc = new THREE.Raycaster();

  function camH(){ return BASE_H/zoom; }

  function applyCamera(){
    const h = camH();
    camera.position.set(camX, h, camZ+h);
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
    const h=camH();
    const asp=renderer.domElement.clientWidth/Math.max(1,renderer.domElement.clientHeight);
    const tanH=Math.tan((camera.fov*Math.PI/180)/2);
    const vhalf=h*tanH*Math.sqrt(2)*0.75;
    const whalf=vhalf*asp;
    return { x:camX-whalf, y:camZ-vhalf, w:whalf*2, h:vhalf*2,
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

  canvas.addEventListener('pointerdown',(e)=>{
    if(e.button===2) return;
    canvas.setPointerCapture(e.pointerId);
    const target=pickTarget(e.clientX,e.clientY);
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

    // ---- 地形（90フレームごとリビルド）----
    if(world.terrain.length>0 && frameCount-terrainBuiltAt>=90){
      terrainBuiltAt=frameCount;
      if(!terrainGeo){
        terrainGeo=buildTerrainGeo(world.terrain);
        terrainMesh.geometry.dispose();
        terrainMesh.geometry=terrainGeo;
      } else {
        refreshTerrainGeo(terrainGeo, world.terrain);
      }
      seaMesh.visible=world.terrain.some(row=>row.some(t=>t.material==='water'));

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

      // 崖線（elev 差 ≥15 の境界に黒 LineSegments）
      if(cliffLines){ scene.remove(cliffLines); cliffLines.geometry.dispose(); cliffLines=null; }
      const ROWS2=world.terrain.length, COLS2=world.terrain[0]?.length??0;
      const cPts:number[]=[];
      for(let r2=0;r2<ROWS2;r2++) for(let c2=0;c2<COLS2;c2++){
        const e0=world.terrain[r2]![c2]!.elev;
        if(c2+1<COLS2){ const ex=world.terrain[r2]![c2+1]!.elev; if(Math.abs(e0-ex)>=14){
          const x=(c2+1)*TERRAIN_TILE_SIZE, ya=Math.max(e0,ex)*ELEV_SCALE;
          cPts.push(x,ya,r2*TERRAIN_TILE_SIZE, x,ya,(r2+1)*TERRAIN_TILE_SIZE);
        }}
        if(r2+1<ROWS2){ const ey=world.terrain[r2+1]![c2]!.elev; if(Math.abs(e0-ey)>=14){
          const z=(r2+1)*TERRAIN_TILE_SIZE, ya=Math.max(e0,ey)*ELEV_SCALE;
          cPts.push(c2*TERRAIN_TILE_SIZE,ya,z, (c2+1)*TERRAIN_TILE_SIZE,ya,z);
        }}
      }
      if(cPts.length){
        const lg=new THREE.BufferGeometry();
        lg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(cPts),3));
        cliffLines=new THREE.LineSegments(lg,new THREE.LineBasicMaterial({color:0x1a1a1a}));
        scene.add(cliffLines);
      }

      // 等高線（20 単位、隣接タイルの elev が 20 の倍数を跨いだら線を引く）
      // 高低差の視認性を上げる地図的な等高線。茶色細線で控えめに。
      if(contourLines){ scene.remove(contourLines); contourLines.geometry.dispose(); contourLines=null; }
      const conPts:number[]=[];
      const CONTOUR_STEP = 25;  // 標高 25 単位毎の主要等高線
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
          if(cs!==null && Math.abs(e0-ex)<14){
            const x=(c2+1)*TERRAIN_TILE_SIZE;
            const ya=cs*ELEV_SCALE+0.3;
            conPts.push(x,ya,r2*TERRAIN_TILE_SIZE, x,ya,(r2+1)*TERRAIN_TILE_SIZE);
          }
        }
        if(r2+1<ROWS2){
          const ey=world.terrain[r2+1]![c2]!.elev;
          const cs = crossesContour(e0, ey);
          if(cs!==null && Math.abs(e0-ey)<14){
            const z=(r2+1)*TERRAIN_TILE_SIZE;
            const ya=cs*ELEV_SCALE+0.3;
            conPts.push(c2*TERRAIN_TILE_SIZE,ya,z, (c2+1)*TERRAIN_TILE_SIZE,ya,z);
          }
        }
      }
      if(conPts.length){
        const lg=new THREE.BufferGeometry();
        lg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(conPts),3));
        // 白系の等高線（あらゆる地形色に対してハイコントラスト、地図的に見える）
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
          canvas.dispatchEvent(new CustomEvent('kszk-terraform-complete',{detail:{target: prev.target}}));
        }
      }
      tfPrevJobIds.clear();
      for(const job of world.terraformJobs) tfPrevJobIds.set(job.id, { target: job.target, progress: job.progress });

      // 作業者有無を判定（raise / lower 別に any-worker フラグ）
      const WORKER_R2 = 28;
      let raiseHasWorker = false, lowerHasWorker = false;
      for(const job of world.terraformJobs){
        const cx=(job.tx+0.5)*TERRAIN_TILE_SIZE, cy=(job.ty+0.5)*TERRAIN_TILE_SIZE;
        for(const c of world.chibis){
          if(c.state==='dead'||c.flight) continue;
          if(Math.hypot(c.pos.x-cx,c.pos.y-cy)<=WORKER_R2){
            if(job.target==='raise') raiseHasWorker=true; else lowerHasWorker=true;
            break;
          }
        }
      }

      // 1Hz パルス（作業者あり）または静止暗色（作業者なし）
      const pulse = Math.sin(world.timeSec*2*Math.PI)*0.5+0.5; // 0→1
      // ノイズ感削減：作業中 0.40+pulse*0.18 / 待機 0.22（前は 0.50+pulse*0.20 / 0.38）
      (tfRaiseIM.material as THREE.MeshBasicMaterial).opacity = raiseHasWorker ? 0.40+pulse*0.18 : 0.22;
      (tfLowerIM.material as THREE.MeshBasicMaterial).opacity = lowerHasWorker ? 0.40+pulse*0.18 : 0.22;

      let tfRI=0, tfLI=0;
      const outlinePts:number[]=[];
      const HS = TERRAIN_TILE_SIZE*0.5;
      for(const job of world.terraformJobs){
        const wx=(job.tx+0.5)*TERRAIN_TILE_SIZE, wz=(job.ty+0.5)*TERRAIN_TILE_SIZE;
        const ey=elevAt(world.terrain,wx,wz);
        _imDummy.position.set(wx,ey+4,wz); _imDummy.updateMatrix();
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
      tfRaiseIM.count=tfRI; tfLowerIM.count=tfLI;
      tfRaiseIM.instanceMatrix.needsUpdate=true;
      tfLowerIM.instanceMatrix.needsUpdate=true;

      // アウトライン LineSegments 更新
      if(tfOutlineLines){ fxGrp.remove(tfOutlineLines); tfOutlineLines.geometry.dispose(); tfOutlineLines=null; }
      if(outlinePts.length){
        const olg=new THREE.BufferGeometry();
        olg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(outlinePts),3));
        tfOutlineLines=new THREE.LineSegments(olg,new THREE.LineBasicMaterial({color:0xffffff,opacity:0.8,transparent:true}));
        fxGrp.add(tfOutlineLines);
      }
    }

    // ---- Σ-7-b: 水たまりタイル可視化（30フレームごと、4 段階深さ）+ shimmer + foam edge ----
    if(frameCount%30===0){
      const ROWS=world.terrain.length, COLS=world.terrain[0]?.length??0;
      let dampIdx=0, sIdx=0, mIdx=0, dIdx=0, shimmerIdx=0;
      const foamPts: number[] = [];
      const HS = TERRAIN_TILE_SIZE*0.5;
      // 水タイルかどうかを判定するヘルパー（foam edge 用、isSeaAt と組合せ）
      const isWaterTile = (rr: number, cc: number): boolean => {
        if (rr<0||rr>=ROWS||cc<0||cc>=COLS) return false;
        const t = world.terrain[rr]![cc]!;
        if (t.waterLevel < 0.05) return false;
        const tcx=(cc+0.5)*TERRAIN_TILE_SIZE, tcy=(rr+0.5)*TERRAIN_TILE_SIZE;
        return !isSeaAt(tcx, tcy);
      };
      for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
        const tile=world.terrain[r]![c]!;
        const wl=tile.waterLevel;
        if(wl<0.05) continue;
        const cx=(c+0.5)*TERRAIN_TILE_SIZE, cy=(r+0.5)*TERRAIN_TILE_SIZE;
        if(isSeaAt(cx,cy)) continue;
        const y = elevAt(world.terrain,cx,cy) + 1.5 + wl*4.5;
        _imDummy.position.set(cx, y, cy);
        _imDummy.updateMatrix();
        if(wl<0.20)      waterDampIM.setMatrixAt(dampIdx++,_imDummy.matrix);
        else if(wl<0.40) waterShallowIM.setMatrixAt(sIdx++,_imDummy.matrix);
        else if(wl<0.70) waterMidIM.setMatrixAt(mIdx++,_imDummy.matrix);
        else             waterDeepIM.setMatrixAt(dIdx++,_imDummy.matrix);

        // specular shimmer：深め（wl>=0.25）かつ位相ハッシュで間引き（≒1/3）
        if (wl >= 0.25 && ((r*7+c*13)%3 === 0)) {
          const ox = ((r*23+c*7) % 17) - 8;
          const oz = ((r*5+c*29) % 17) - 8;
          _imDummy.position.set(cx+ox, y+0.8, cy+oz);
          _imDummy.updateMatrix();
          shimmerIM.setMatrixAt(shimmerIdx++, _imDummy.matrix);
        }

        // foam edge：上下左右の隣が水でないなら、その辺に白縁を引く
        const e = wl >= 0.20;  // 湿りタイルは foam なし（shallow 以上のみ）
        if (e) {
          const top = y + 0.6;
          // 北 (cy - HS)
          if (!isWaterTile(r-1, c)) {
            foamPts.push(cx-HS, top, cy-HS, cx+HS, top, cy-HS);
          }
          // 南 (cy + HS)
          if (!isWaterTile(r+1, c)) {
            foamPts.push(cx-HS, top, cy+HS, cx+HS, top, cy+HS);
          }
          // 西 (cx - HS)
          if (!isWaterTile(r, c-1)) {
            foamPts.push(cx-HS, top, cy-HS, cx-HS, top, cy+HS);
          }
          // 東 (cx + HS)
          if (!isWaterTile(r, c+1)) {
            foamPts.push(cx+HS, top, cy-HS, cx+HS, top, cy+HS);
          }
        }
      }
      waterDampIM.count=dampIdx; waterShallowIM.count=sIdx; waterMidIM.count=mIdx; waterDeepIM.count=dIdx;
      waterDampIM.instanceMatrix.needsUpdate=true;
      waterShallowIM.instanceMatrix.needsUpdate=true;
      waterMidIM.instanceMatrix.needsUpdate=true;
      waterDeepIM.instanceMatrix.needsUpdate=true;
      shimmerIM.count=shimmerIdx;
      shimmerIM.instanceMatrix.needsUpdate=true;

      // foam LineSegments 更新
      if (waterFoamLines){ scene.remove(waterFoamLines); waterFoamLines.geometry.dispose(); waterFoamLines=null; }
      if (foamPts.length){
        const fg=new THREE.BufferGeometry();
        fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(foamPts),3));
        waterFoamLines=new THREE.LineSegments(fg, waterFoamMat);
        scene.add(waterFoamLines);
      }
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
      m.position.set(c.pos.x, elevAt(world.terrain,c.pos.x,c.pos.y)+CHIBI_H*0.42, c.pos.y);
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
      let posY=baseY+CHIBI_H*0.5;
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
        div.style.transform=`translate(-50%,-50%) translate(${sc.x-Math.round(sc.x)+Math.round(sc.x)}px,${sc.y-Math.round(sc.y)+Math.round(sc.y)}px)`;
        div.style.left=`${sc.x}px`;
        div.style.top=`${sc.y - 20}px`;

        const pct=Math.round(job.progress*100);
        const label=job.target==='raise'?'⛰ 盛り土':'⛏ 切り土';
        const barFill=abandoned?'#ff8020':'#4ad870';
        const bg=abandoned?'rgba(200,80,0,0.85)':'rgba(20,10,5,0.75)';
        div.innerHTML=`<div style="background:${bg};border-radius:3px;padding:2px 4px;font-size:10px;color:#fff;font-weight:700;white-space:nowrap;line-height:1.3">` +
          `${abandoned?'⚠ 作業者不在':`${label} ${pct}% (${workers}人)`}` +
          `</div><div style="width:40px;height:4px;background:#333;border-radius:2px;margin-top:1px">` +
          `<div style="width:${pct}%;height:100%;background:${barFill};border-radius:2px;transition:width 0.3s"></div></div>`;
      }
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
  };
}
