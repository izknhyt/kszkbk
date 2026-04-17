import { Rectangle, Texture } from 'pixi.js';
import type { ChibiState } from '../types';

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
    const img = await loadImage(sheetUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    ctx.drawImage(img, 0, 0);
    chromaKeyWhite(ctx, img.width, img.height);
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

function chromaKeyWhite(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i]! >= CHROMA_THRESHOLD && d[i + 1]! >= CHROMA_THRESHOLD && d[i + 2]! >= CHROMA_THRESHOLD) {
      d[i + 3] = 0;
    }
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
