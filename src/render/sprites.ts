import { Assets, Rectangle, Texture, type TextureSource } from 'pixi.js';
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
};

export interface SpriteLibrary {
  frames: Texture[];
  hasSheet: boolean;
}

export async function loadSpriteLibrary(sheetUrl: string): Promise<SpriteLibrary> {
  try {
    const base: Texture = await Assets.load(sheetUrl);
    const source: TextureSource = base.source;
    const cellW = Math.floor(base.width / 3);
    const cellH = Math.floor(base.height / 3);
    const frames: Texture[] = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        frames.push(
          new Texture({
            source,
            frame: new Rectangle(c * cellW, r * cellH, cellW, cellH),
          }),
        );
      }
    }
    return { frames, hasSheet: true };
  } catch {
    return { frames: procedural(), hasSheet: false };
  }
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
