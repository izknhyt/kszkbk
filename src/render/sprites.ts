import { Rectangle, Texture } from 'pixi.js';
import type { ChibiState } from '../types';

const SPLIT_SPRITE_URLS = [
  '/chibiwafu/01_normal.png',
  '/chibiwafu/02_crying.png',
  '/chibiwafu/03_surprised.png',
  '/chibiwafu/04_angry.png',
  '/chibiwafu/05_sulking.png',
  '/chibiwafu/06_dizzy.png',
  '/chibiwafu/07_dirty.png',
  '/chibiwafu/08_sleepy.png',
  '/chibiwafu/09_dead.png',
] as const;

const STATE_INDEX: Record<ChibiState, number> = {
  idle: 0,
  cry: 1,
  surprised: 2,
  angry: 3,
  sleep: 4,
  dazed: 5,
  hurt: 6,
  exhausted: 7,
  dead: 8,
  // P5: 生活ステートは既存フレームを再利用（チャット=idle、空見=surprised、食=angry）
  chatting: 0,
  staring: 2,
  eating: 3,
};

export interface SpriteLibrary {
  frames: Texture[];
  hasSheet: boolean;
}

// 白背景のPNGをロード時にクロマキーして透過させる閾値。
// 255に近いほど背景のみ抜く。アンチエイリアス混じりのピクセルまで抜くなら少し下げる。
const CHROMA_THRESHOLD = 240;

export async function loadSpriteLibrary(sheetUrl: string): Promise<SpriteLibrary> {
  try {
    const splitFrames = await loadSplitFrames();
    if (splitFrames) return { frames: splitFrames, hasSheet: true };
  } catch (err) {
    console.warn('[sprites] split sprites load failed, falling back to sheet', err);
  }

  try {
    const img = await loadImage(sheetUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    ctx.drawImage(img, 0, 0);
    removeBackgroundFloodFill(ctx, img.width, img.height);
    const base = Texture.from(canvas);
    const cellW = Math.floor(img.width / 3);
    const cellH = Math.floor(img.height / 3);
    const frames: Texture[] = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        frames.push(
          new Texture({
            source: base.source,
            frame: new Rectangle(c * cellW, r * cellH, cellW, cellH),
          }),
        );
      }
    }
    return { frames, hasSheet: true };
  } catch (err) {
    console.warn('[sprites] sheet load failed, using procedural fallback', err);
    return { frames: procedural(), hasSheet: false };
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${url}`));
    img.src = url;
  });
}

async function loadSplitFrames(): Promise<Texture[] | null> {
  const loaded = await Promise.allSettled(SPLIT_SPRITE_URLS.map((url) => loadImage(url)));
  if (loaded.some((item) => item.status !== 'fulfilled')) return null;
  return loaded.map((item) => {
    const img = item.status === 'fulfilled' ? item.value : null;
    if (!img) throw new Error('unreachable split sprite state');
    return Texture.from(img);
  });
}

// 4隅から flood-fill して「外側の白」だけ透明にする。
// キャラ内部の白（まもりん等）はアウトラインで囲まれてるので flood に到達せず残る。
// 以前は「白ピクセル全部透明」にしていたためまもりんが透けていた。
function removeBackgroundFloodFill(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  const visited = new Uint8Array(w * h);
  const isNearWhite = (i: number): boolean => {
    const o = i * 4;
    return d[o]! >= CHROMA_THRESHOLD && d[o + 1]! >= CHROMA_THRESHOLD && d[o + 2]! >= CHROMA_THRESHOLD;
  };
  const stack: number[] = [];
  const seeds = [0, w - 1, (h - 1) * w, h * w - 1];
  for (const s of seeds) if (isNearWhite(s)) stack.push(s);
  while (stack.length > 0) {
    const i = stack.pop()!;
    if (visited[i]) continue;
    if (!isNearWhite(i)) continue;
    visited[i] = 1;
    d[i * 4 + 3] = 0;
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }
  ctx.putImageData(id, 0, 0);
}

function procedural(): Texture[] {
  const frames: Texture[] = [];
  const tints = ['#fff3d8', '#e8f0ff', '#ffe3c8', '#ffc8c8', '#d8d8ff', '#c8ffd8', '#8b4a20', '#bbbbbb', '#222222'];
  const faces = ['^_^', 'T_T', 'o_o', '>_<', 'zZ', '@_@', '><', '._.', 'x x'];
  for (let i = 0; i < 9; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = tints[i] ?? '#fff';
      ctx.beginPath();
      ctx.arc(24, 24, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3a2a1a';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#3a2a1a';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(faces[i] ?? '?', 24, 28);
    }
    frames.push(Texture.from(canvas));
  }
  return frames;
}

export function frameFor(lib: SpriteLibrary, state: ChibiState): Texture {
  return lib.frames[STATE_INDEX[state]] ?? lib.frames[0]!;
}
