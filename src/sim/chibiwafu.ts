import type { ChibiState, Chibiwafu, TraitId, Vec2 } from '../types';
import { landmarkActive, landmarkList, type Landmark, type LandmarkKind } from './landmarks';
import {
  derivedMamaRadius,
  derivedRiverTrespass,
  derivedSpeed,
  type ChibiParams,
} from './personality';
import type { Season } from '../types';

let nextId = 1;

export function resetIdCounter(n: number) { nextId = n; }
export function peekNextId() { return nextId; }

export interface SpawnArgs {
  name: string;
  birthTick: number;
  pos: Vec2;
  maxAgeSec: number;
  traits: TraitId[];
  params: ChibiParams;
  flavors: string[];
}

export function spawnChibiwafu(args: SpawnArgs): Chibiwafu {
  return {
    id: nextId++,
    name: args.name,
    birthTick: args.birthTick,
    ageSec: 0,
    pos: { ...args.pos },
    target: null,
    state: 'idle',
    stateTimer: 0,
    deathTick: null,
    deathCauseId: null,
    speed: derivedSpeed(args.params),
    maxAgeSec: args.maxAgeSec,
    faceLeft: Math.random() < 0.5,
    traits: [...args.traits],
    params: { ...args.params },
    flavors: [...args.flavors],
    lifeLog: [],
    chatCooldown: 2,
    targetLandmarkId: null,
  };
}

export function setState(c: Chibiwafu, s: ChibiState, seconds: number) {
  c.state = s;
  c.stateTimer = seconds;
}

export function isAlive(c: Chibiwafu): boolean {
  return c.state !== 'dead';
}

// 陸地の上限 y（これより下は泥川）。wanderStep の target 計算で利用。
// 川に落ちる奴はたまにはいる（冒険家など）ので target 抽選で 6% だけ越境を許す。
const DRY_Y_LIMIT = 410;

// 特性に応じた目的地バイアス。対象ランドマークの種類ごとに確率を持つ。
const TRAIT_LANDMARK_PREF: Partial<Record<TraitId, { kind: LandmarkKind; chance: number }[]>> = {
  bouken:   [{ kind: 'kusozako_totem', chance: 0.2 }], // 中央にもたまに寄る（川は別処理）
  gourmand: [{ kind: 'stonebread_rock', chance: 0.6 }, { kind: 'mudwater_pool', chance: 0.2 }, { kind: 'beer_barrel', chance: 0.3 }],
  shinpai:  [], // 別処理でフラナ近傍に張り付く
  ukiyo:    [{ kind: 'philosophy_stone', chance: 0.5 }],
  ikusa:    [],
  noumin:   [], // 農業区周辺は world 側で処理（建物位置を使う）
};

interface WanderEnv {
  landmarks: Landmark[];
  season: Season;
  furana: Vec2;
  cocoonPos: Vec2 | null;
  noukouPositions: Vec2[];
}

function pickLandmarkTarget(c: Chibiwafu, env: WanderEnv): Landmark | null {
  for (const t of c.traits) {
    const prefs = TRAIT_LANDMARK_PREF[t];
    if (!prefs) continue;
    for (const pref of prefs) {
      if (Math.random() > pref.chance) continue;
      const candidates = env.landmarks.filter(
        (l) => l.kind === pref.kind && landmarkActive(l, env.season),
      );
      if (candidates.length === 0) continue;
      return candidates[Math.floor(Math.random() * candidates.length)]!;
    }
  }
  // 特性に引っかからなくても、全員が 8% でランドマークへ
  if (Math.random() < 0.08) {
    const active = env.landmarks.filter((l) => landmarkActive(l, env.season));
    if (active.length > 0) return active[Math.floor(Math.random() * active.length)]!;
  }
  return null;
}

export function wanderStep(c: Chibiwafu, dt: number, bounds: { w: number; h: number }, env?: WanderEnv) {
  if (!c.target || distance(c.pos, c.target) < 4) {
    const margin = 30;
    let newTarget: Vec2 | null = null;
    let newLandmarkId: string | null = null;

    if (env) {
      // --- パラメータ駆動：ママ依存が高いほどフラナ近くに留まる ---
      const mamaRadius = derivedMamaRadius(c.params, Math.max(bounds.w, bounds.h));
      const wantsMama = c.params.mama > 60 && Math.random() < (c.params.mama - 50) / 100;
      if (wantsMama) {
        const ang = Math.random() * Math.PI * 2;
        const r = 20 + Math.random() * mamaRadius * 0.3;
        newTarget = { x: env.furana.x + Math.cos(ang) * r, y: env.furana.y + Math.sin(ang) * r };
      }
      // 戦闘狂：ココンに向かう 60%
      if (!newTarget && c.traits.includes('ikusa') && env.cocoonPos && Math.random() < 0.6) {
        newTarget = { x: env.cocoonPos.x + (Math.random() - 0.5) * 30, y: env.cocoonPos.y + (Math.random() - 0.5) * 30 };
      }
      // 勇気：高いほど川/橋へ寄る
      if (!newTarget && Math.random() < (c.params.courage - 50) * 0.008) {
        newTarget = {
          x: margin + Math.random() * (bounds.w - margin * 2),
          y: 380 + Math.random() * 60,
        };
      }
      // 農民気質：農業区に 55%
      if (!newTarget && c.traits.includes('noumin') && env.noukouPositions.length > 0 && Math.random() < 0.55) {
        const np = env.noukouPositions[Math.floor(Math.random() * env.noukouPositions.length)]!;
        newTarget = { x: np.x + (Math.random() - 0.5) * 40, y: np.y + (Math.random() - 0.5) * 30 };
      }
      // ランドマーク指向（パラメータ＋特性）
      if (!newTarget) {
        const lm = pickLandmarkTarget(c, env);
        if (lm) {
          newTarget = { x: lm.pos.x + (Math.random() - 0.5) * 16, y: lm.pos.y + (Math.random() - 0.5) * 16 };
          newLandmarkId = lm.id;
        }
      }
    }

    // fallback: 自由徘徊（ママ依存でフラナ近くに寄せつつ、勇気で川を許容）
    if (!newTarget) {
      const riverChance = derivedRiverTrespass(c.params);
      const allowRiver = Math.random() < riverChance;
      const maxY = allowRiver ? bounds.h - margin : Math.min(DRY_Y_LIMIT, bounds.h - margin);

      // mama 値で中心寄せ：フラナからの距離を mamaRadius 以内に収めやすくする
      if (env && c.params.mama > 40) {
        const maxR = derivedMamaRadius(c.params, Math.max(bounds.w, bounds.h));
        for (let tries = 0; tries < 5; tries++) {
          const tx = margin + Math.random() * (bounds.w - margin * 2);
          const ty = margin + Math.random() * (maxY - margin);
          if (distance({ x: tx, y: ty }, env.furana) <= maxR) {
            newTarget = { x: tx, y: ty };
            break;
          }
        }
      }
      if (!newTarget) {
        newTarget = {
          x: margin + Math.random() * (bounds.w - margin * 2),
          y: margin + Math.random() * (maxY - margin),
        };
      }
    }

    c.target = newTarget;
    c.targetLandmarkId = newLandmarkId;
    c.faceLeft = c.target.x < c.pos.x;
  }
  const dx = c.target.x - c.pos.x;
  const dy = c.target.y - c.pos.y;
  const d = Math.max(0.001, Math.hypot(dx, dy));
  c.pos.x += (dx / d) * c.speed * dt;
  c.pos.y += (dy / d) * c.speed * dt;
}

export { type WanderEnv, landmarkList };

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
