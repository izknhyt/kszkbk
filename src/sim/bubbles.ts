import type { Vec2 } from '../types';

// speech: ちびわふ通常吹き出し
// npc-speech: 大人キャラ（フラナ・スズ・ココン・ルー）の発言 or NPCが関わる会話
// stomp: 踏み潰し／殴打のドッという表現
// discovery: 図鑑新発見などの特別
export type BubbleKind = 'speech' | 'npc-speech' | 'stomp' | 'discovery';

export interface Bubble {
  id: number;
  pos: Vec2;
  text: string;
  kind: BubbleKind;
  ttl: number;
  maxTtl: number;
}

let nextBubbleId = 1;

export function spawnBubble(
  list: Bubble[],
  pos: Vec2,
  text: string,
  kind: BubbleKind = 'speech',
  ttl = 2.2,
) {
  list.push({
    id: nextBubbleId++,
    pos: { x: pos.x, y: pos.y - 10 },
    text,
    kind,
    ttl,
    maxTtl: ttl,
  });
  if (list.length > 20) list.shift();
}

export function updateBubbles(list: Bubble[], dt: number) {
  for (const b of list) {
    b.ttl -= dt;
    // bubble drifts upward over time
    b.pos.y -= 8 * dt;
  }
  // prune expired
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i]!.ttl <= 0) list.splice(i, 1);
  }
}
