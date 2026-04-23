// Σ-4 Three.js 3D renderer — くそざこ村
// stage.ts と同じ StageHandle を実装。VITE_RENDER=3d で切替。
import * as THREE from 'three';
import type { WorldState } from '../sim/world';
import { POWERLINE_CONNECT_RADIUS, TERRAIN_TILE_SIZE } from '../sim/world';
import type { ChibiState, DayPhase, HitTarget, PlacedBuilding, Season } from '../types';
import { NPC_DEFS, type NpcId } from '../sim/npcs';
import { CONFIG } from '../config';
import type { Bubble } from '../sim/bubbles';
import type { CameraView, StageHandle } from './stage';

// ============================================================
// 定数
// ============================================================
const ELEV_SCALE   = 5;    // elev (0-100) → Three.js Y (0-500)
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
const STATE_IDX: Record<ChibiState, number> = {
  idle:0, cry:1, surprised:2, angry:3,
  sleep:4, dazed:5, hurt:6, exhausted:7, dead:8,
  chatting:0, staring:2, eating:3,
};

const CHIBI_URLS = [
  '/chibiwafu/01_normal.png',  '/chibiwafu/02_crying.png',
  '/chibiwafu/03_surprised.png','/chibiwafu/04_angry.png',
  '/chibiwafu/05_sulking.png', '/chibiwafu/06_dizzy.png',
  '/chibiwafu/07_dirty.png',   '/chibiwafu/08_sleepy.png',
  '/chibiwafu/09_dead.png',
];
const FURANA_URLS = [
  '/furana/01_normal.png',  '/furana/02_crying.png',
  '/furana/03_surprised.png','/furana/04_angry.png',
  '/furana/05_sulking.png', '/furana/06_dizzy.png',
  '/furana/07_dirty.png',   '/furana/08_sleepy.png',
  '/furana/09_dead.png',
];

// ============================================================
// 地形カラー
// ============================================================
const MAT_RGB: Record<string, [number,number,number]> = {
  grass:[0x6b/255,0x9e/255,0x4a/255],
  soil: [0xa8/255,0x7a/255,0x4a/255],
  sand: [0xe0/255,0xc9/255,0x8a/255],
  rock: [0x7a/255,0x7a/255,0x7a/255],
  water:[0x4a/255,0x6b/255,0x9c/255],
};
function tileRgb(mat: string, elev: number): [number,number,number] {
  const b = MAT_RGB[mat] ?? MAT_RGB['soil']!;
  const br = Math.min(1.4, 0.7 + elev * 0.003);
  return [Math.min(1,b[0]!*br), Math.min(1,b[1]!*br), Math.min(1,b[2]!*br)];
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
  const d = new Uint8Array([70,130,185,255]);
  const t = new THREE.DataTexture(d,4,1,THREE.RedFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

// ============================================================
// 地形標高ルックアップ
// ============================================================
function elevAt(terrain: import('../types').TerrainTile[][], wx: number, wy: number): number {
  const c = Math.max(0,Math.min(T_COLS-1,Math.floor(wx/TERRAIN_TILE_SIZE)));
  const r = Math.max(0,Math.min(T_ROWS-1,Math.floor(wy/TERRAIN_TILE_SIZE)));
  return (terrain[r]?.[c]?.elev ?? 0) * ELEV_SCALE;
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

// ============================================================
// feature・obstacle プロシージャルテクスチャ
// ============================================================
const FEAT_COLOR: Record<string,number> = {
  water:0x3a6ea0, channel:0x5cc4f0, farm:0x6ea241, path:0x8b7048,
  house:0xb85a3a, well:0x4a7898,    firewatch:0xb0553a, sawmill:0x8d6238,
  shrine:0xc44a4a, generator:0x7a7088, streetlamp:0x5a5240, powerline:0x6a5848,
  kiln:0xb86030,  pasture:0x7ab060, loom:0xa07858,
};
const FEAT_RAD: Record<string,number> = {
  water:26, channel:18, farm:22, path:14, house:24, well:20,
  firewatch:26, sawmill:24, shrine:26, generator:22, streetlamp:14,
  powerline:10, kiln:24, pasture:26, loom:22,
};
function featTex(kind: string): THREE.Texture {
  const r = FEAT_RAD[kind]??16;
  const c = FEAT_COLOR[kind]??0x8b7048;
  return makeCanvasTex((ctx,sz)=>{
    ctx.beginPath(); ctx.arc(sz/2,sz/2,r,0,Math.PI*2);
    ctx.fillStyle=`#${c.toString(16).padStart(6,'0')}`; ctx.fill();
    ctx.strokeStyle='#2a1a0a'; ctx.lineWidth=2; ctx.stroke();
  });
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
  const ambLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
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

  // --- 水面（低標高タイルの上に薄く）---
  const waterMat = new THREE.MeshBasicMaterial({color:0x4a6b9c,transparent:true,opacity:0.55,side:THREE.DoubleSide});
  const waterMesh = new THREE.Mesh(
    (() => { const g=new THREE.PlaneGeometry(CONFIG.WORLD_W,CONFIG.WORLD_H); g.rotateX(-Math.PI/2); return g; })(),
    waterMat,
  );
  waterMesh.position.set(CONFIG.WORLD_W/2, 0.8, CONFIG.WORLD_H/2);
  scene.add(waterMesh);

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

  const featTexMap  = new Map<string, THREE.Texture>();
  const obsTexMap   = new Map<string, THREE.Texture>();

  // --- ビュー キャッシュ ---
  type MView = { mesh: THREE.Mesh; lastState: string; lastFace: boolean };
  const chibiViews  = new Map<number, MView>();
  const npcViews    = new Map<NpcId,  MView>();
  const wolfViews   = new Map<number, THREE.Mesh>();
  const corpseViews = new Map<number, THREE.Mesh>();
  const featViews   = new Map<string, THREE.Mesh>();
  const obsViews    = new Map<string, THREE.Mesh>();
  const bldViews    = new Map<string, THREE.Group>();

  let wireLines: THREE.LineSegments|null = null;

  // --- バブルオーバーレイ ---
  const bubbleOverlay = document.createElement('div');
  Object.assign(bubbleOverlay.style,{position:'absolute',top:'0',left:'0',width:'100%',height:'100%',pointerEvents:'none',overflow:'hidden'});
  host.style.position = 'relative';
  host.appendChild(bubbleOverlay);
  const bubbleDivs = new Map<number, HTMLDivElement>();

  // --- terraform / stability 一時メッシュ ---
  let tfMeshes: THREE.Mesh[] = [];
  let stMeshes: THREE.Mesh[] = [];

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
  // 入力
  // ============================================================
  let hitFn: ((wx:number,wy:number)=>HitTarget|null)|null = null;
  const canvas = renderer.domElement;
  canvas.style.touchAction='none'; canvas.style.display='block';

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
    const wp=stwXZ(e.clientX,e.clientY);
    const target=hitFn?hitFn(wp.x,wp.y):null;
    canvas.dispatchEvent(new CustomEvent('kszk-inspect',{detail:{target,clientX:e.clientX,clientY:e.clientY}}));
  });

  type PMode='pan'|'drag';
  let ptr:{id:number;mode:PMode;sx:number;sy:number;lx:number;ly:number;moved:boolean;target:HitTarget|null}|null=null;

  canvas.addEventListener('pointerdown',(e)=>{
    if(e.button===2) return;
    canvas.setPointerCapture(e.pointerId);
    const wp=stwXZ(e.clientX,e.clientY);
    const target=hitFn?hitFn(wp.x,wp.y):null;
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
  document.addEventListener('keydown',e=>{ if(e.key==='r'||e.key==='R') resetCamera(); });

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
  function ensureMView(map: Map<number,MView>, id:number, state:ChibiState,
                        texs:THREE.Texture[], grp:THREE.Group, w:number, h:number): MView {
    let v=map.get(id);
    if(!v){
      const tex=texs[STATE_IDX[state]]??texs[0]!;
      const mesh=spriteMesh(w,h,tex);
      grp.add(mesh);
      v={mesh,lastState:state,lastFace:false};
      map.set(id,v);
    }
    return v;
  }

  function syncSpriteState(v:MView, state:ChibiState, faceLeft:boolean, texs:THREE.Texture[]){
    if(v.lastState!==state){
      const tex=texs[STATE_IDX[state]]??texs[0]!;
      (v.mesh.material as THREE.MeshBasicMaterial).map=tex;
      (v.mesh.material as THREE.MeshBasicMaterial).needsUpdate=true;
      v.lastState=state;
    }
    if(v.lastFace!==faceLeft){
      v.mesh.scale.x=faceLeft?-1:1;
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

    applyKeyPan(dt);

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
      case 'heatwave':   renderer.setClearColor(0xff9a60); break;
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
      waterMesh.visible=world.terrain.some(row=>row.some(t=>t.material==='water'));
    }

    // ---- Terraform オーバーレイ ----
    tfMeshes.forEach(m=>{fxGrp.remove(m); m.geometry.dispose();});
    tfMeshes=[];
    for(const job of world.terraformJobs){
      const wx=(job.tx+0.5)*TERRAIN_TILE_SIZE, wz=(job.ty+0.5)*TERRAIN_TILE_SIZE;
      const wy=elevAt(world.terrain,wx,wz);
      const m=new THREE.Mesh(
        new THREE.BoxGeometry(TERRAIN_TILE_SIZE*0.88,4,TERRAIN_TILE_SIZE*0.88),
        new THREE.MeshBasicMaterial({color:job.target==='raise'?0xc89650:0x1e1e1e,transparent:true,opacity:0.5}),
      );
      m.position.set(wx,wy+2,wz); fxGrp.add(m); tfMeshes.push(m);
    }

    // ---- stability 警告（3フレームごと）----
    if(frameCount%3===0){
      stMeshes.forEach(m=>{fxGrp.remove(m); m.geometry.dispose();}); stMeshes=[];
      const pS=Math.sin(world.timeSec*3)*0.5+0.5, pF=Math.sin(world.timeSec*5)*0.5+0.5;
      for(let r=0;r<world.terrain.length;r++) for(let c=0;c<world.terrain[r]!.length;c++){
        const tile=world.terrain[r]![c]!;
        if(tile.stability>=0.5) continue;
        const wx=(c+0.5)*TERRAIN_TILE_SIZE, wz=(r+0.5)*TERRAIN_TILE_SIZE;
        const wy=tile.elev*ELEV_SCALE;
        const col2=tile.stability<0.3?0xff2020:0xff6030;
        const alpha=tile.stability<0.3?0.3+pF*0.2:0.18+pS*0.15;
        const m=new THREE.Mesh(
          new THREE.BoxGeometry(TERRAIN_TILE_SIZE*0.94,3,TERRAIN_TILE_SIZE*0.94),
          new THREE.MeshBasicMaterial({color:col2,transparent:true,opacity:alpha}),
        );
        m.position.set(wx,wy+2,wz); fxGrp.add(m); stMeshes.push(m);
      }
    }

    // ---- Features（3フレームごと）----
    if(frameCount%3===0){
      const fids=new Set(world.features.map(f=>f.id));
      for(const [id,m] of featViews){ if(!fids.has(id)){ featGrp.remove(m); m.geometry.dispose(); featViews.delete(id); } }
      for(const f of world.features){
        if(!featViews.has(f.id)){
          if(!featTexMap.has(f.kind)) featTexMap.set(f.kind,featTex(f.kind));
          const sz=(FEAT_RAD[f.kind]??16)*2;
          const m=spriteMesh(sz,sz,featTexMap.get(f.kind)!);
          featGrp.add(m); featViews.set(f.id,m);
        }
        const m=featViews.get(f.id)!;
        m.position.set(f.pos.x, elevAt(world.terrain,f.pos.x,f.pos.y)+5, f.pos.y);
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

    // ---- Obstacles（3フレームごと）----
    if(frameCount%3===0){
      const oids=new Set(world.obstacles.map(o=>o.id));
      rmStale(obsViews,oids,obsGrp);
      for(const obs of world.obstacles){
        if(!obsViews.has(obs.id)){
          if(!obsTexMap.has(obs.kind)) obsTexMap.set(obs.kind,obsTex(obs.kind));
          const m=spriteMesh(36,36,obsTexMap.get(obs.kind)!);
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
        const tex=chibiTexs[8]??chibiTexs[0]!;
        const m=spriteMesh(CHIBI_W*0.85,CHIBI_H*0.85,tex);
        (m.material as THREE.MeshBasicMaterial).opacity=0.8;
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
      const v=ensureMView(chibiViews as Map<number,MView>,c.id,c.state,chibiTexs,chibiGrp,CHIBI_W,CHIBI_H);
      syncSpriteState(v,c.state,c.faceLeft,chibiTexs);
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
        const m=new THREE.Mesh(new THREE.BoxGeometry(36,16,20),new THREE.MeshToonMaterial({color:0x4a3a30,gradientMap:gradMap}));
        wolfGrp.add(m); wolfViews.set(wolf.id,m);
      }
      const m=wolfViews.get(wolf.id)!;
      m.position.set(wolf.pos.x, elevAt(world.terrain,wolf.pos.x,wolf.pos.y)+12, wolf.pos.y);
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

  function resetCamera(){ focusOn(CONFIG.WORLD_W/2, CONFIG.WORLD_H*0.35, 0.6); }

  // app アダプタ：main.ts が canvas イベントと renderer.on('resize') を使う
  const resizeCbs: Array<(w:number,h:number)=>void> = [];
  window.addEventListener('resize',()=>{
    const w=renderer.domElement.clientWidth, h=renderer.domElement.clientHeight;
    resizeCbs.forEach(cb=>cb(w,h));
  });
  const appAdapter = {
    canvas: renderer.domElement as unknown as HTMLCanvasElement,
    renderer: {
      on(ev:string, cb:(w:number,h:number)=>void){ if(ev==='resize') resizeCbs.push(cb); },
      get width(){ return renderer.domElement.clientWidth; },
      get height(){ return renderer.domElement.clientHeight; },
    },
  };

  // GPU picking（Σ-4-e 実装）— 現状は CPU フォールバック
  // hitFn は main.ts が setHitTest で登録した関数をそのまま使う

  return {
    app: appAdapter as unknown as import('pixi.js').Application,
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
