import type { ChibiState, Chibiwafu, TerrainTile, TraitId, Vec2 } from '../types';
import {
  derivedMamaRadius,
  derivedRiverTrespass,
  derivedSpeed,
  type ChibiParams,
} from './personality';
import type { Season } from '../types';
import { isSeaAt } from './terrain/query';
import { findPath, worldToTilePoint, pathToWorldWaypoints } from './pathfinding';

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
  // HP は toughness 依存：tough 0→20HP, tough 50→40HP, tough 100→60HP
  const maxHp = Math.round(20 + args.params.tough * 0.4);
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
    hp: maxHp,
    maxHp,
    flight: null,
    hunger: 0,
    fatigue: 0,
    homeFid: null,
  };
}

export function setState(c: Chibiwafu, s: ChibiState, seconds: number) {
  c.state = s;
  c.stateTimer = seconds;
}

export function isAlive(c: Chibiwafu): boolean {
  return c.state !== 'dead';
}


interface WanderEnv {
  season: Season;
  furana: Vec2;
  cocoonPos: Vec2 | null;
  noukouPositions: Vec2[];
  taikoPositions: Vec2[];
  // 近くの障害物リスト（開拓のため働きに行く候補）
  obstaclePositions: Vec2[];
  // 畑プロットの中心座標リスト（空腹時の目的地候補）
  farmPositions: Vec2[];
  // terraform ジョブ位置リスト（Σ-5-a：最優先の労働先）
  terraformJobPositions: Vec2[];
  // 優先 terraform ジョブ位置リスト（Σ-6-x：直近 5 分のプレイヤー指示で自動優先）
  priorityTerraformJobPositions: Vec2[];
  // 建設中 feature 位置リスト（Σ-5-e-b：terraform に次ぐ労働先）
  constructionPositions: Vec2[];
  // 優先建設中 feature 位置リスト（Σ-6-x：プレイヤー指示で他より優先）
  priorityConstructionPositions: Vec2[];
  // Σ-7-d 水回避：terrain[row][col].waterLevel を見るためのタイル参照
  // null の場合は回避無効（旧呼び出し互換）
  terrain?: TerrainTile[][];
  // Σ-8-b A* path 用。terrainVersion が変わったら chibi の path を破棄。
  terrainVersion?: number;
}

// ============================================================
// Σ-5-a 労働 AI：terraform ジョブへの自発移動は wanderStep 内に
// inline で実装してある（terraformJobPositions を最優先で参照）。
// ============================================================

export function wanderStep(c: Chibiwafu, dt: number, bounds: { w: number; h: number }, env?: WanderEnv): string | null {
  let announcementKey: string | null = null;

  // Σ-8-b: terrainVersion が変わったら path を捨てて再計算（target は維持して再ルート）
  if (env?.terrainVersion !== undefined && c.pathVersion !== undefined && c.pathVersion !== env.terrainVersion) {
    c.pathPoints = undefined;
    c.pathVersion = undefined;
  }
  // Σ-8-b: path 失敗 cooldown を消化中は移動しない（confused/idle）
  if ((c.pathFailedSec ?? 0) > 0) {
    c.pathFailedSec = Math.max(0, (c.pathFailedSec ?? 0) - dt);
    return null;
  }

  if (!c.target || distance(c.pos, c.target) < 4) {
    const margin = 30;
    let newTarget: Vec2 | null = null;

    if (env) {
      // Σ-6-x: 優先 terraform / 建設指示がある場合、90% で最優先（両者同率）。
      //   nonbiri でも 75%、zako>60 でも 80%（くそざこ味を残しつつ、指示は比較的守る）
      if (!newTarget && env.priorityTerraformJobPositions.length > 0) {
        const prChance = c.traits.includes('nonbiri') ? 0.75 : c.params.zako > 60 ? 0.80 : 0.90;
        if (Math.random() < prChance) {
          const ranked = env.priorityTerraformJobPositions
            .slice()
            .sort((a, b) => distance(c.pos, a) - distance(c.pos, b))
            .slice(0, 3);
          const pp = ranked[Math.floor(Math.random() * ranked.length)]!;
          newTarget = { x: pp.x + (Math.random() - 0.5) * 10, y: pp.y + (Math.random() - 0.5) * 10 };
          announcementKey = 'work';
        }
      }
      if (!newTarget && env.priorityConstructionPositions.length > 0) {
        const prChance = c.traits.includes('nonbiri') ? 0.75 : c.params.zako > 60 ? 0.80 : 0.90;
        if (Math.random() < prChance) {
          const ranked = env.priorityConstructionPositions
            .slice()
            .sort((a, b) => distance(c.pos, a) - distance(c.pos, b))
            .slice(0, 3);
          const pp = ranked[Math.floor(Math.random() * ranked.length)]!;
          newTarget = { x: pp.x + (Math.random() - 0.5) * 10, y: pp.y + (Math.random() - 0.5) * 10 };
          announcementKey = 'work';
        }
      }
      // Σ-5-a: terraform ジョブが最優先（70% 確率でこちらに向かう、のんびりは 40%、zako>60 は 50%）
      const tfChance = c.traits.includes('nonbiri') ? 0.40 : c.params.zako > 60 ? 0.50 : 0.70;
      if (!newTarget && env.terraformJobPositions.length > 0 && Math.random() < tfChance) {
        const ranked = env.terraformJobPositions
          .slice()
          .sort((a, b) => distance(c.pos, a) - distance(c.pos, b))
          .slice(0, 3);
        const tp = ranked[Math.floor(Math.random() * ranked.length)]!;
        newTarget = { x: tp.x + (Math.random() - 0.5) * 10, y: tp.y + (Math.random() - 0.5) * 10 };
        announcementKey = 'work';
      }
      // Σ-5-e-b: 建設ジョブ（terraform と同等確率、constructionPositions）
      const cnChance = c.traits.includes('nonbiri') ? 0.40 : c.params.zako > 60 ? 0.50 : 0.70;
      if (!newTarget && env.constructionPositions.length > 0 && Math.random() < cnChance) {
        const ranked = env.constructionPositions
          .slice()
          .sort((a, b) => distance(c.pos, a) - distance(c.pos, b))
          .slice(0, 3);
        const cp = ranked[Math.floor(Math.random() * ranked.length)]!;
        newTarget = { x: cp.x + (Math.random() - 0.5) * 10, y: cp.y + (Math.random() - 0.5) * 10 };
        announcementKey = 'work';
      }
      // --- パラメータ駆動：ママ依存が高いほどフラナ近くに留まる ---
      const mamaRadius = derivedMamaRadius(c.params, Math.max(bounds.w, bounds.h));
      const wantsMama = c.params.mama > 60 && Math.random() < (c.params.mama - 50) / 100;
      if (!newTarget && wantsMama) {
        const ang = Math.random() * Math.PI * 2;
        const r = 20 + Math.random() * mamaRadius * 0.3;
        newTarget = { x: env.furana.x + Math.cos(ang) * r, y: env.furana.y + Math.sin(ang) * r };
        announcementKey = 'mama';
      }      // 戦闘狂：ココンに向かう 60%
      if (!newTarget && c.traits.includes('ikusa') && env.cocoonPos && Math.random() < 0.6) {
        newTarget = { x: env.cocoonPos.x + (Math.random() - 0.5) * 30, y: env.cocoonPos.y + (Math.random() - 0.5) * 30 };
        announcementKey = 'cocoon_ikusa';
      }
      // 勇気：高いほど海/川縁に寄る（bounds 下端 75% 付近をうろつく）
      if (!newTarget && Math.random() < (c.params.courage - 50) * 0.008) {
        const waterEdgeY = bounds.h * 0.75;
        newTarget = {
          x: margin + Math.random() * (bounds.w - margin * 2),
          y: waterEdgeY - 30 + Math.random() * 60,
        };
        announcementKey = 'river_bouken';
      }
      // 旅っ子：55% でワールドの左右端を目指す
      if (!newTarget && c.traits.includes('tabikko') && Math.random() < 0.55) {
        const goLeft = Math.random() < 0.5;
        newTarget = {
          x: goLeft ? margin + Math.random() * 80 : bounds.w - margin - Math.random() * 80,
          y: 100 + Math.random() * 250,
        };
        announcementKey = 'edge_tabikko';
      }
      // 太鼓っ子：60% で太鼓やぐらに寄る
      if (!newTarget && c.traits.includes('taiko_kko') && env.taikoPositions.length > 0 && Math.random() < 0.6) {
        const tp = env.taikoPositions[Math.floor(Math.random() * env.taikoPositions.length)]!;
        newTarget = { x: tp.x + (Math.random() - 0.5) * 40, y: tp.y + (Math.random() - 0.5) * 20 };
        announcementKey = 'taiko';
      }
      // 農民気質：農業区に 55%
      if (!newTarget && c.traits.includes('noumin') && env.noukouPositions.length > 0 && Math.random() < 0.55) {
        const np = env.noukouPositions[Math.floor(Math.random() * env.noukouPositions.length)]!;
        newTarget = { x: np.x + (Math.random() - 0.5) * 40, y: np.y + (Math.random() - 0.5) * 30 };
        announcementKey = 'noukou';
      }
      // 空腹時（hunger>55）は畑へ一直線（70%）。食料が出る場所に集まる
      if (!newTarget && c.hunger > 55 && env.farmPositions.length > 0 && Math.random() < 0.7) {
        const ranked = env.farmPositions
          .slice()
          .sort((a, b) => distance(c.pos, a) - distance(c.pos, b))
          .slice(0, 2);
        const fp = ranked[Math.floor(Math.random() * ranked.length)]!;
        newTarget = { x: fp.x + (Math.random() - 0.5) * 20, y: fp.y + (Math.random() - 0.5) * 16 };
        announcementKey = 'farm_eat';
      }
      // 開拓労働：35% で近くの障害物へ歩く（数で片付ける）
      if (!newTarget && env.obstaclePositions.length > 0 && Math.random() < 0.35) {
        // 最寄りを優先（近い順に並べて上位 3 つから抽選）
        const ranked = env.obstaclePositions
          .slice()
          .sort((a, b) => distance(c.pos, a) - distance(c.pos, b))
          .slice(0, 3);
        const op = ranked[Math.floor(Math.random() * ranked.length)]!;
        newTarget = { x: op.x + (Math.random() - 0.5) * 10, y: op.y + (Math.random() - 0.5) * 10 };
        announcementKey = 'work';
      }
    }

    // fallback: 自由徘徊（ママ依存でフラナ近くに寄せつつ、勇気で水辺を許容）
    if (!newTarget) {
      const riverChance = derivedRiverTrespass(c.params);
      const allowRiver = Math.random() < riverChance;
      // 海マスクがある場合は bounds.h * 0.85 を陸地上限とする（Σ-3-d の findDryTile と対）
      const landBoundary = bounds.h * 0.85;
      const maxY = allowRiver ? bounds.h - margin : Math.min(landBoundary, bounds.h - margin);

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
        // 海タイルを避ける（最大 6 回リトライ）
        for (let t = 0; t < 6; t++) {
          const cx = margin + Math.random() * (bounds.w - margin * 2);
          const cy = margin + Math.random() * (maxY - margin);
          if (!isSeaAt(cx, cy) || allowRiver) { newTarget = { x: cx, y: cy }; break; }
        }
        if (!newTarget) {
          newTarget = {
            x: margin + Math.random() * (bounds.w - margin * 2),
            y: margin + Math.random() * (maxY - margin),
          };
        }
      }
    }

    // Σ-7-d 水たまり回避：target が深い水たまりなら再抽選（最大 6 回）
    //   courage >=70 は水を怖がらない（水辺好き）
    //   hunger >70 / fatigue >70 で判断鈍化（回避スキップ）
    if (newTarget && env?.terrain && c.params.courage < 70 && c.hunger <= 70 && c.fatigue <= 70) {
      const TILE = 32;
      const ROWS = env.terrain.length;
      const COLS = env.terrain[0]?.length ?? 0;
      for (let tries = 0; tries < 6; tries++) {
        const tc = Math.max(0, Math.min(COLS - 1, Math.floor(newTarget.x / TILE)));
        const tr = Math.max(0, Math.min(ROWS - 1, Math.floor(newTarget.y / TILE)));
        const wl = env.terrain[tr]?.[tc]?.waterLevel ?? 0;
        if (wl < 0.35) break;
        // 深い → 別座標で再抽選
        newTarget = {
          x: margin + Math.random() * (bounds.w - margin * 2),
          y: margin + Math.random() * (bounds.h * 0.85 - margin),
        };
      }
    }

    c.target = newTarget;
    // 方向音痴：目標座標に大きめの乱数をかける
    if (c.flavors.includes('方向音痴')) {
      c.target.x += (Math.random() - 0.5) * 120;
      c.target.y += (Math.random() - 0.5) * 60;
    }
    c.faceLeft = c.target.x < c.pos.x;
    // Σ-8-b: 新 target に対して A* path を計算
    requestPath(c, env);
  } else {
    announcementKey = null; // target 継続中は announce しない
  }
  // 低集中のちびわふは途中で target を微調整（ふらふら、寄り道）
  // Σ-8-b: requestPath 失敗で c.target が null になっている可能性があるのでガード
  if (c.target && c.params.focus < 35 && Math.random() < 0.015) {
    c.target.x += (Math.random() - 0.5) * 40;
    c.target.y += (Math.random() - 0.5) * 20;
  }
  // Σ-8-b: pathPoints があれば waypoint に向かって移動、なければ旧来の直線 fallback。
  // path がない状況：terrain 未提供（古い呼び出し互換）/ A* 失敗（cooldown 消化中は上で return 済）/ 計算前。
  if (c.pathPoints && c.pathPoints.length > 0) {
    const wp = c.pathPoints[0]!;
    const wpdx = wp.x - c.pos.x;
    const wpdy = wp.y - c.pos.y;
    const wpd = Math.hypot(wpdx, wpdy);
    if (wpd < 6) {
      c.pathPoints.shift();
      if (c.pathPoints.length === 0) {
        c.target = null;
      }
    } else {
      const inv = 1 / Math.max(0.001, wpd);
      c.pos.x += wpdx * inv * c.speed * dt;
      c.pos.y += wpdy * inv * c.speed * dt;
      c.faceLeft = wpdx < 0;
    }
  } else if (c.target) {
    // path 計算前 / terrain 未提供時の旧来直線 fallback
    const dx = c.target.x - c.pos.x;
    const dy = c.target.y - c.pos.y;
    const d = Math.max(0.001, Math.hypot(dx, dy));
    c.pos.x += (dx / d) * c.speed * dt;
    c.pos.y += (dy / d) * c.speed * dt;
  }
  // target が null（path 失敗で破棄済み等）は移動せず、次回 wanderStep で再抽選
  return announcementKey;
}

// Σ-8-b: 新 target に対して A* path を計算し、pathPoints をセット。
// 失敗時は target を破棄して短い idle/confused cooldown を入れる（仕様 §A* 失敗時）。
function requestPath(c: Chibiwafu, env?: WanderEnv): void {
  if (!env?.terrain || env.terrainVersion === undefined || !c.target) {
    // terrain 未提供の旧互換呼び出し → 直線移動 fallback に任せる
    c.pathPoints = undefined;
    c.pathVersion = undefined;
    return;
  }
  const start = worldToTilePoint(c.pos.x, c.pos.y);
  const goal  = worldToTilePoint(c.target.x, c.target.y);
  const path = findPath(env.terrain, start, goal);
  if (!path) {
    // path 失敗：target 破棄 + 1 秒の idle cooldown（再抽選を防ぐ）
    // SPEC §A* 失敗時：「短時間の confused/idle」「ログや吹き出しはスパムしない cooldown」
    c.target = null;
    c.pathPoints = undefined;
    c.pathVersion = undefined;
    c.pathFailedSec = 1.0;
    if (c.state === 'idle' || c.state === 'surprised') {
      // dazed で立ち止まる演出。setState を循環 import 避けるため inline 設定
      c.state = 'dazed';
      c.stateTimer = 0.8;
    }
    return;
  }
  // タイル中心 waypoint に変換し、最終 waypoint を実 target に差し替え
  const waypoints = pathToWorldWaypoints(path);
  if (waypoints.length > 0) {
    waypoints[waypoints.length - 1] = { x: c.target.x, y: c.target.y };
  }
  // 開始タイル中心は出発位置と近すぎる事が多いので skip
  if (waypoints.length > 1 && distance(c.pos, waypoints[0]!) < 12) {
    waypoints.shift();
  }
  c.pathPoints = waypoints;
  c.pathVersion = env.terrainVersion;
}

export type { WanderEnv };

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
