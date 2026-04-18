import type { Chibiwafu, DayPhase, DeathCauseId, DexEntry, FlightState, Obstacle, ObstacleKind, PlacedBuilding, Plot, PlotKind, Season, Vec2, VillageRank } from '../types';
import { DEATH_CAUSES } from './deaths';
import { BUILDINGS, buildingsToHazards } from '../city/buildings';
import {
  distance,
  isAlive,
  peekNextId,
  resetIdCounter,
  setState,
  spawnChibiwafu,
  wanderStep,
} from './chibiwafu';
import { generateName } from './naming';
import { SEASONS, dayProgress, intensityAt, phaseFromProgress, seasonFromTime, type GlobalEvent } from './events';
import { HAZARDS, hazardActiveInSeason, pointInZone, type HazardZone } from './hazards';
import { CONFIG } from '../config';
import {
  CHIBI_TO_COCOON_LINES,
  CHIBI_TO_FURANA_LINES,
  CHIBI_TO_FURANA_SCARED_LINES,
  CHIBI_TO_SUZU_LINES,
  COCOON_DEATH_LINES,
  COCOON_LINES_ABUSE,
  COCOON_LINES_CHAT,
  COCOON_LINES_DEATH,
  FURANA_LINES_ANGRY,
  FURANA_LINES_CHAT,
  FURANA_LINES_CHAT_ANGRY,
  FURANA_LINES_DEATH,
  FURANA_LINES_DEATH_REACTION,
  FURANA_LINES_HAPPY,
  FURANA_LINES_HATE,
  FURANA_LINES_IDLE,
  FURANA_LINES_PAT,
  FURANA_LINES_THROW,
  FURANA_LINES_WEIRD_DEATH,
  LOU_LINES,
  NPC_DEFS,
  SUZU_LINES_BIRTH,
  SUZU_LINES_CHAT,
  SUZU_LINES_DEATH,
  SUZU_LINES_MAMA_DEATH,
  SUZU_LINES_MAMA_HURT,
  SUZU_LINES_ONDO,
  createNpcs,
  hurtLinesFor,
  pickLine,
  pushNpcLife,
  reviveLinesFor,
  wanderNpc,
  type NpcState,
} from './npcs';
import { spawnBubble, updateBubbles, type Bubble } from './bubbles';
import { rollTraits } from './traits';
import { computeRank, maxBuildingLevel, upgradeCostFor, type RankContext } from './rank';
import { landmarkList, type Landmark } from './landmarks';
import {
  CRY_REASONS,
  DAZED_REASONS,
  SLEEP_REASONS,
  maybeStartChat,
  pickActionAnnounce,
  pickAngryBystanderLine,
  pickBegFoodLine,
  pickCollisionVictimLine,
  pickComfortLine,
  pickCopyCryLine,
  pickMorashiDisgustLine,
  pickMorashiWipeLine,
  pickOshaberiLine,
  pickReason,
  pickRifujinStrikerLine,
  pickRifujinVictimLine,
  pickSchadenfreudeLine,
  pickSleepyContagionLine,
  pickStrikerLine,
  pickVictimHurtLine,
} from './chats';
import { EMBARRASSING_FLAVORS, FLAVOR_AMBIENT, FLAVOR_DURING, FLAVOR_SEASONAL, applyFlavorSpeedMod } from './flavorBehaviors';
import { TRAIT_DEFS } from './traits';
import {
  applyTraitBias,
  derivedChatCooldown,
  derivedEatChance,
  derivedHazardSusceptibility,
  derivedSoloSpeakChance,
  derivedStareChance,
  rollParams,
} from './personality';
import { rollFlavors, rollFlavorCount } from './flavorTraits';

export interface DeathLogEntry {
  tick: number;
  name: string;
  causeId: DeathCauseId;
  text: string;
}

export interface WorldState {
  tick: number;
  timeSec: number;
  secondsPerSeason: number;
  season: Season;
  // 1日の位相（朝/昼/夕/夜）。tick で計算。
  dayPhase: DayPhase;
  // 0-1 の進行度（見た目補間用、位相ティングで使う）。
  dayProgress: number;
  // 経過日数（整数）。UI表示・lv成長要因に使う。
  dayCount: number;
  // 前 tick の dayPhase（日付変わり／位相境界の検出用）。
  lastDayPhase: DayPhase;
  furanaPos: Vec2;
  chibis: Chibiwafu[];
  corpses: Chibiwafu[];
  maxCorpses: number;
  buildings: PlacedBuilding[];
  points: number;
  // 累計獲得くそざこポイント（建物に使っても減らない）。村Lv の成長源。
  totalPointsEarned: number;
  // 連続値の村レベル 1-99。totalPointsEarned から毎tick 再計算される。
  villageLv: number;
  // --- 開拓リソース（P1-C2）----------------------------------------------
  // 食料: 畑から生産、ちびわふが食べる / 空腹を下げる（将来）
  // 水:   水源 + 水路で補給、畑にも必要（将来）
  // 木材: 伐採で得る、建物の材料
  // 石材: 石切で得る、建物の材料
  resources: { food: number; water: number; wood: number; stone: number };
  totalDeaths: number;
  totalBirths: number;
  stompCount: number;
  // --- 統計（セッション累積。平均寿命・最長寿・最短寿）-------------------
  sumDeathAgeSec: number;
  longestLifeSec: number;
  longestLifeName: string;
  shortestLifeSec: number;
  shortestLifeName: string;
  // フラナがプレイヤーに掴まれている間だけ >0。mama 高めのちびわふが追いかける
  furanaGrabbedTimer: number;
  dex: Record<DeathCauseId, DexEntry>;
  recentDeaths: DeathLogEntry[];
  newDiscoveries: DeathCauseId[]; // 前フレームで新規発見された図鑑ID
  villageRank: VillageRank; // 4段階のランク。tickWorld で計算される
  nameSet: Set<string>;
  bounds: { w: number; h: number };
  spawnCooldown: number;
  baseSpawnInterval: number;
  baseCap: number;
  event: GlobalEvent | null;
  pointMultiplier: number;
  // 産屋で伸びる出産速度倍率。1.0 = 通常、1.36 なら +36% 速い。
  spawnSpeedMultiplier: number;
  // 次の音頭／火事までの秒カウントダウン（イベント発動中は Infinity）。
  ondoCooldown: number;
  fireCooldown: number;
  // 棒会議の再発動まで秒。人口が閾値超えると棒会議が自動発動する。
  bokaigiCooldown: number;
  // 棒会議発動後の演出用タイマー（秒）。stage が読んでマーカーを表示する。
  bokaigiMarkerTimer: number;
  // 季節境界検出用。1tick前の季節。
  lastSeason: Season;
  npcs: NpcState[];
  bubbles: Bubble[];
  landmarks: Landmark[];
  // 開拓プロット（荒地 → 均し済み → 畑等に進化）
  plots: Plot[];
  // 障害物（プロット内にあってちびわふが叩いて消す）
  obstacles: Obstacle[];
}

// 荒地プロット内に障害物をばら撒く
function createInitialObstacles(plots: Plot[]): Obstacle[] {
  const list: Obstacle[] = [];
  let seq = 0;
  const kinds: ObstacleKind[] = ['rock', 'stump', 'bush'];
  const hpMap: Record<ObstacleKind, number> = { rock: 30, stump: 25, bush: 15 };
  for (const p of plots) {
    if (p.kind !== 'wasteland') continue;
    const n = 2 + Math.floor(Math.random() * 2);  // 2-3 個
    for (let i = 0; i < n; i++) {
      const k = kinds[Math.floor(Math.random() * kinds.length)]!;
      const margin = 14;
      list.push({
        id: `obs-${seq++}`,
        pos: {
          x: p.pos.x + margin + Math.random() * (p.w - margin * 2),
          y: p.pos.y + margin + Math.random() * (p.h - margin * 2),
        },
        kind: k,
        hp: hpMap[k],
        maxHp: hpMap[k],
        plotId: p.id,
      });
    }
  }
  return list;
}

// 初期プロット配置：陸地帯に格子状に 4x4 = 16 枚。
// 中央にフラナの拠点、水源 1 箇所、残りは wasteland。
function createInitialPlots(bounds: { w: number; h: number }): Plot[] {
  const plots: Plot[] = [];
  const cols = 4;
  const rows = 4;
  const plotW = 90;
  const plotH = 70;
  const gapX = 20;
  const gapY = 18;
  const totalW = cols * plotW + (cols - 1) * gapX;
  const startX = (bounds.w - totalW) / 2;
  const startY = 100;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = `plot-${r}-${c}`;
      // フラナ拠点のすぐ下あたり（row 1 col 1-2）は cleared で開始
      // それ以外は wasteland
      const initKind: PlotKind = (r === 1 && (c === 1 || c === 2)) ? 'cleared' : 'wasteland';
      const initDev = initKind === 'cleared' ? 1 : 0;
      plots.push({
        id,
        pos: { x: startX + c * (plotW + gapX), y: startY + r * (plotH + gapY) },
        w: plotW,
        h: plotH,
        kind: initKind,
        devLevel: initDev,
        workSec: 0,
      });
    }
  }
  // 左端の 1 つを水源にする（象徴的）
  const waterPlot = plots.find((p) => p.id === 'plot-0-0');
  if (waterPlot) { waterPlot.kind = 'water'; waterPlot.devLevel = 3; }
  // 水源の右・下に水路を敷いて、最初から畑化できる土台を作る
  const channel1 = plots.find((p) => p.id === 'plot-0-1');
  if (channel1) { channel1.kind = 'channel'; channel1.devLevel = 2; }
  const channel2 = plots.find((p) => p.id === 'plot-1-0');
  if (channel2) { channel2.kind = 'channel'; channel2.devLevel = 2; }
  return plots;
}

// プロット id から grid 座標 (row, col) を抽出する
function plotGridPos(id: string): { r: number; c: number } | null {
  const m = /^plot-(\d+)-(\d+)$/.exec(id);
  if (!m) return null;
  return { r: Number(m[1]), c: Number(m[2]) };
}

// 4 近傍のプロット id を返す
function neighborPlotIds(id: string): string[] {
  const p = plotGridPos(id);
  if (!p) return [];
  return [
    `plot-${p.r - 1}-${p.c}`,
    `plot-${p.r + 1}-${p.c}`,
    `plot-${p.r}-${p.c - 1}`,
    `plot-${p.r}-${p.c + 1}`,
  ];
}

// 水が届いている plot id の集合を flood fill で計算する。
// water → channel → channel → ... 繋がったものが "watered"。
// farm 判定ではこの集合に隣接するかを確認する。
export function computeWateredPlotIds(w: WorldState): Set<string> {
  const watered = new Set<string>();
  const queue: string[] = [];
  for (const p of w.plots) {
    if (p.kind === 'water') { watered.add(p.id); queue.push(p.id); }
  }
  const byId = new Map(w.plots.map((p) => [p.id, p]));
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const nid of neighborPlotIds(id)) {
      if (watered.has(nid)) continue;
      const np = byId.get(nid);
      if (!np) continue;
      if (np.kind === 'channel' || np.kind === 'water') {
        watered.add(nid);
        queue.push(nid);
      }
    }
  }
  return watered;
}

// 畑 / 土地の進化・食料生産を走らせる。
// 1) 水路隣接の cleared プロットは workSec が蓄積して 10 秒で farm に昇格
// 2) 水路隣接の farm プロットは dt * 0.08 食料を生産
export function updateInfra(w: WorldState, dt: number) {
  const watered = computeWateredPlotIds(w);
  const byId = new Map(w.plots.map((p) => [p.id, p]));
  for (const p of w.plots) {
    const adjToWater = neighborPlotIds(p.id).some((nid) => watered.has(nid));
    if (p.kind === 'cleared' && adjToWater) {
      p.workSec += dt;
      if (p.workSec >= 10) {
        p.kind = 'farm';
        p.devLevel = 2;
        p.workSec = 0;
      }
    }
    if (p.kind === 'farm' && adjToWater) {
      w.resources.food += dt * 0.08;
      // 畑の進化：food を出し続けると devLevel が上がる (見た目だけ)
      p.workSec += dt;
      if (p.devLevel < 3 && p.workSec >= 30) {
        p.devLevel = 3;
      }
    }
  }
  // byId は lint 逃れ
  void byId;
}

function createDex(): Record<DeathCauseId, DexEntry> {
  const out = {} as Record<DeathCauseId, DexEntry>;
  for (const id of Object.keys(DEATH_CAUSES) as DeathCauseId[]) {
    out[id] = { id, count: 0 };
  }
  return out;
}

export function createWorld(): WorldState {
  const bounds = { w: CONFIG.WORLD_W, h: CONFIG.WORLD_H };
  return {
    tick: 0,
    timeSec: 0,
    secondsPerSeason: CONFIG.SECONDS_PER_SEASON,
    season: 'spring',
    dayPhase: 'morning',
    dayProgress: 0,
    dayCount: 1,
    lastDayPhase: 'morning',
    furanaPos: { x: bounds.w / 2, y: 220 },
    chibis: [],
    corpses: [],
    maxCorpses: CONFIG.MAX_CORPSES_VISIBLE,
    buildings: [],
    points: 0,
    totalPointsEarned: 0,
    villageLv: 1,
    resources: { food: 0, water: 0, wood: 0, stone: 0 },
    totalDeaths: 0,
    totalBirths: 0,
    stompCount: 0,
    sumDeathAgeSec: 0,
    longestLifeSec: 0,
    longestLifeName: '—',
    shortestLifeSec: Infinity,
    shortestLifeName: '—',
    furanaGrabbedTimer: 0,
    dex: createDex(),
    recentDeaths: [],
    newDiscoveries: [],
    villageRank: 'mura',
    nameSet: new Set(),
    bounds,
    spawnCooldown: 2,
    baseSpawnInterval: CONFIG.BASE_SPAWN_INTERVAL_SEC,
    baseCap: CONFIG.BASE_POP_CAP,
    event: null,
    pointMultiplier: CONFIG.GLOBAL_POINT_MULT_BASE,
    spawnSpeedMultiplier: 1,
    // 最初の音頭／火事はフルインターバルを待たず「先行き短め」で1発目を見せる。
    ondoCooldown: CONFIG.ONDO_BASE_INTERVAL_SEC * 0.45,
    fireCooldown: CONFIG.FIRE_BASE_INTERVAL_SEC * 0.45,
    bokaigiCooldown: CONFIG.BOKAIGI_COOLDOWN_SEC * 0.6,
    bokaigiMarkerTimer: 0,
    lastSeason: 'spring',
    npcs: createNpcs(bounds),
    bubbles: [],
    landmarks: landmarkList(bounds),
    plots: [] as Plot[],
    obstacles: [] as Obstacle[],
  };
}

// プロットと障害物を生成してワールドに載せる。createWorld / load 後に呼ぶ。
export function ensurePlots(w: WorldState) {
  if (!w.plots || w.plots.length === 0) {
    w.plots = createInitialPlots(w.bounds);
  }
  if (!w.obstacles || w.obstacles.length === 0) {
    w.obstacles = createInitialObstacles(w.plots);
  }
}

export function populationCap(w: WorldState): number {
  let cap = w.baseCap;
  for (const b of w.buildings) {
    const def = BUILDINGS[b.defId];
    if (!def) continue;
    const m = /pop\+(\d+)/.exec(def.effect);
    if (m) cap += Number(m[1]) * b.level;
  }
  return cap;
}

function countBuildingLevels(w: WorldState, defId: string): number {
  return w.buildings.filter((b) => b.defId === defId).reduce((a, b) => a + b.level, 0);
}

function applyBuildingMods(w: WorldState) {
  let mult = CONFIG.GLOBAL_POINT_MULT_BASE;
  let spawnMul = 1;
  for (const b of w.buildings) {
    const def = BUILDINGS[b.defId];
    if (!def) continue;
    const pm = /pmult\+([0-9.]+)/.exec(def.effect);
    if (pm) mult += Number(pm[1]) * b.level;
    // 産屋など：'spawn+0.18' → spawnSpeedMultiplier に線形加算
    const sp = /spawn\+([0-9.]+)/.exec(def.effect);
    if (sp) spawnMul += Number(sp[1]) * b.level;
  }
  w.pointMultiplier = mult;
  w.spawnSpeedMultiplier = spawnMul;
}

// --- Event scheduling -----------------------------------------------------
// 建物の数でインターバルが短くなる。下限あり。±10秒のランダム揺らぎ。
function computeOndoInterval(w: WorldState): number {
  const taiko = countBuildingLevels(w, 'taiko');
  const base = CONFIG.ONDO_BASE_INTERVAL_SEC + CONFIG.ONDO_INTERVAL_PER_TAIKO * taiko;
  const floored = Math.max(CONFIG.ONDO_INTERVAL_MIN_SEC, base);
  return floored + (Math.random() - 0.5) * 20;
}

function computeFireInterval(w: WorldState): number {
  const kouba = countBuildingLevels(w, 'kouba');
  const base = CONFIG.FIRE_BASE_INTERVAL_SEC + CONFIG.FIRE_INTERVAL_PER_KOUBA * kouba;
  const floored = Math.max(CONFIG.FIRE_INTERVAL_MIN_SEC, base);
  return floored + (Math.random() - 0.5) * 20;
}

function scheduleEvents(w: WorldState, dt: number) {
  if (w.event) return;
  w.ondoCooldown -= dt;
  w.fireCooldown -= dt;
  const ondoReady = w.ondoCooldown <= 0;
  const fireReady = w.fireCooldown <= 0;
  if (!ondoReady && !fireReady) return;
  // 両方来たら先に来てたほう（より負のほう）を選ぶ
  const pickOndo = ondoReady && (!fireReady || w.ondoCooldown <= w.fireCooldown);
  if (pickOndo) {
    w.event = {
      kind: 'ondo',
      duration: CONFIG.ONDO_DURATION_SEC,
      remaining: CONFIG.ONDO_DURATION_SEC,
      intensity: CONFIG.ONDO_KILL_RATE,
    };
    reactNpcsToOndo(w);
    dampenFuranaMood(w, 5);
  } else {
    w.event = {
      kind: 'fire',
      duration: CONFIG.FIRE_DURATION_SEC,
      remaining: CONFIG.FIRE_DURATION_SEC,
      intensity: CONFIG.FIRE_KILL_RATE,
    };
    dampenFuranaMood(w, 10);
  }
}

function getActiveHazards(w: WorldState): HazardZone[] {
  const zones = HAZARDS.concat(buildingsToHazards(w.buildings));
  // 太鼓祭り中は taiko 関連ハザードの半径とレートを一時的にバースト。
  if (w.event?.kind === 'taiko_festival') {
    for (const z of zones) {
      if (z.id.startsWith('taiko-')) {
        z.radius = CONFIG.TAIKO_FESTIVAL_RADIUS;
        z.ratePerSec = CONFIG.TAIKO_FESTIVAL_RATE_PER_SEC;
      }
    }
  }
  return zones;
}

// 棒会議：人口が閾値以上＆CDが切れてたら自動発動。1〜N人を即処刑する。
function maybeTriggerBokaigi(w: WorldState, dt: number) {
  if (w.event) return;
  w.bokaigiCooldown -= dt;
  if (w.bokaigiCooldown > 0) return;
  const alive = w.chibis.filter(isAlive);
  if (alive.length < CONFIG.BOKAIGI_CLUSTER_MIN) return;
  // 棒会議は夜／夕で発動率↑。朝昼だと 30% に絞る（くそざこ村では夜間棒会議が本番）
  if (w.dayPhase === 'morning' || w.dayPhase === 'noon') {
    if (Math.random() > 0.3) { w.bokaigiCooldown = 6 + Math.random() * 6; return; }
  }
  const suzu = w.npcs.find((n) => n.id === 'suzu');
  if (suzu && !suzu.dead) spawnBubble(w.bubbles, suzu.pos, '棒会議ひらくよ', 'npc-speech', 2.2);
  w.bokaigiMarkerTimer = 2.5;
  const victimCount = Math.min(alive.length, 1 + Math.floor(Math.random() * CONFIG.BOKAIGI_VICTIMS_MAX));

  // 棒名人がいれば、70% で通常犠牲者をひねり出した上で棒名人が生還。
  // 棒好きは逆に志願して犠牲になりやすい（重み2倍）。
  const weights = alive.map((c) => {
    if (c.traits.includes('bo_meijin')) return 0.05;  // ほぼ選ばれない
    if (c.traits.includes('bo_suki'))   return 2.5;   // 志願
    return 1.0;
  });
  const picked = new Set<number>();
  const pickOneIndex = (): number | null => {
    const remaining = alive.map((_, i) => i).filter((i) => !picked.has(i));
    if (remaining.length === 0) return null;
    const total = remaining.reduce((a, i) => a + weights[i]!, 0);
    let r = Math.random() * total;
    for (const i of remaining) {
      r -= weights[i]!;
      if (r <= 0) return i;
    }
    return remaining[remaining.length - 1]!;
  };

  // 棒名人による返り討ち：居れば1人はその棒名人が横で振って他の子を巻添え
  const meijin = alive.find((c) => c.traits.includes('bo_meijin'));
  if (meijin && Math.random() < 0.7) {
    const idx = pickOneIndex();
    if (idx != null) {
      picked.add(idx);
      const victim = alive[idx]!;
      if (victim !== meijin) {
        pushLife(meijin, Math.floor(meijin.ageSec), '棒会議で棒を振って1体を巻添えにした');
        kill(w, victim, 'bo_meijin_tenka');
      }
    }
  }

  for (let i = 0; i < victimCount; i++) {
    const idx = pickOneIndex();
    if (idx == null) break;
    picked.add(idx);
    kill(w, alive[idx]!, 'bokaigi');
  }
  w.bokaigiCooldown = CONFIG.BOKAIGI_COOLDOWN_SEC + Math.random() * 15;
}

// 太鼓祭り：太鼓やぐら所持＆季節が夏/秋に入る瞬間に発動。
function maybeStartTaikoFestival(w: WorldState) {
  if (w.event) return;
  if (w.season === w.lastSeason) return;
  if (w.season !== 'summer' && w.season !== 'autumn') return;
  if (countBuildingLevels(w, 'taiko') <= 0) return;
  w.event = {
    kind: 'taiko_festival',
    duration: CONFIG.TAIKO_FESTIVAL_DURATION_SEC,
    remaining: CONFIG.TAIKO_FESTIVAL_DURATION_SEC,
    intensity: CONFIG.TAIKO_FESTIVAL_KILL_RATE,
  };
  const suzu = w.npcs.find((n) => n.id === 'suzu');
  if (suzu && !suzu.dead) spawnBubble(w.bubbles, suzu.pos, '太鼓祭〜！', 'npc-speech', 2.5);
}

function logDeath(w: WorldState, c: Chibiwafu, causeId: DeathCauseId) {
  const cause = DEATH_CAUSES[causeId]!;
  const text = cause.template(c.name);
  const entry = w.dex[causeId];
  const wasNew = entry.count === 0;
  entry.count += 1;
  if (wasNew) {
    entry.firstVictim = c.name;
    entry.firstContext = text;
    entry.firstDiscoveredTick = w.tick;
    w.newDiscoveries.push(causeId);
  }
  w.recentDeaths.unshift({ tick: w.tick, name: c.name, causeId, text });
  if (w.recentDeaths.length > 24) w.recentDeaths.pop();
  const gained = Math.round(cause.points * w.pointMultiplier);
  w.points += gained;
  w.totalPointsEarned += gained;
  w.totalDeaths += 1;
  // 統計：寿命の合計・最長・最短を更新
  const ageSec = c.ageSec;
  w.sumDeathAgeSec += ageSec;
  if (ageSec > w.longestLifeSec) {
    w.longestLifeSec = ageSec;
    w.longestLifeName = c.name;
  }
  if (ageSec < w.shortestLifeSec) {
    w.shortestLifeSec = ageSec;
    w.shortestLifeName = c.name;
  }
}

// 平均寿命（秒）を返す。死者 0 なら 0。
export function averageLifespan(w: WorldState): number {
  return w.totalDeaths > 0 ? w.sumDeathAgeSec / w.totalDeaths : 0;
}

// 累計ポイント → 村Lv (1-99)。緩やかに伸びる平方根曲線（徐々に発展する感）。
// 目安:
//   0P→Lv1, 1kP→Lv3, 10kP→Lv7, 50kP→Lv15, 250kP→Lv32, 1MP→Lv64, 2.4MP→Lv99
// 実プレイの death rate から、×1 等倍で Lv99 到達まで数十時間を想定。
export function villageLvFromPoints(totalPointsEarned: number): number {
  const lv = Math.floor(Math.sqrt(Math.max(0, totalPointsEarned) / 250) + 1);
  return Math.max(1, Math.min(99, lv));
}

// 村Lv → 実効ワールド幅。Lv 1→1100, Lv 99→1694。Lv +1 ごと +6px。
export function effectiveBoundsFor(villageLv: number): { w: number; h: number } {
  const extraW = (villageLv - 1) * 6;
  const extraH = Math.floor((villageLv - 1) * 1.5); // 高さは少しだけ
  return { w: CONFIG.WORLD_W + extraW, h: CONFIG.WORLD_H + extraH };
}

export function kill(w: WorldState, c: Chibiwafu, causeId: DeathCauseId) {
  if (!isAlive(c)) return;
  c.state = 'dead';
  c.deathTick = w.tick;
  c.deathCauseId = causeId;
  c.hp = 0;
  pushLife(c, Math.floor(c.ageSec), `死んだ（${DEATH_CAUSES[causeId]!.title}）`);
  logDeath(w, c, causeId);
  reactNpcsToDeath(w, c);
  chibiSchadenfreude(w, c);
}

// HP を減らす。0 以下で causeId で死亡。戻り値 = 死んだか。
// 神様の殴打／振り回し／投げ の3系統で使う。通常事故死は経由しない。
export function damageChibi(w: WorldState, c: Chibiwafu, amount: number, causeId: DeathCauseId): boolean {
  if (!isAlive(c)) return false;
  c.hp = Math.max(0, c.hp - amount);
  if (c.hp <= 0) {
    kill(w, c, causeId);
    return true;
  }
  return false;
}

// ちびわふ／NPC を "空中に投げ飛ばす" 物理的な飛行を起動する。
// 指定した速度で飛び、毎 tick 当たり判定を行い、landTime 経過で着地処理。
export function launchFlight(
  entity: Chibiwafu | NpcState,
  vx: number,
  vy: number,
  flightSec: number,
  landingDamage: number,
  landCauseId: DeathCauseId,
): void {
  const flight: FlightState = {
    vx,
    vy,
    leftSec: flightSec,
    totalSec: flightSec,
    hitKeys: [],
    landingDamage,
    landCauseId,
  };
  entity.flight = flight;
}

// 毎 tick の飛行処理。isChibi=true でちびわふ、false で NPC。
function flightStep(
  w: WorldState,
  entity: Chibiwafu | NpcState,
  isChibi: boolean,
  dt: number,
): void {
  const f = entity.flight;
  if (!f) return;
  // 移動 + 重力ちょい弱
  entity.pos.x += f.vx * dt;
  entity.pos.y += f.vy * dt;
  f.vy += 180 * dt;
  f.leftSec -= dt;
  // 横方向は画面内にクランプ（反射はしない、端で止まる）
  if (entity.pos.x < 16) { entity.pos.x = 16; f.vx = Math.abs(f.vx) * 0.5; }
  if (entity.pos.x > w.bounds.w - 16) { entity.pos.x = w.bounds.w - 16; f.vx = -Math.abs(f.vx) * 0.5; }

  // 衝突判定：半径 22px、同一個体は hitKeys で一度だけ
  const hitRadius = 22;
  for (const c of w.chibis) {
    if (!isAlive(c) || c === entity) continue;
    const key = `c:${c.id}`;
    if (f.hitKeys.includes(key)) continue;
    const d = Math.hypot(c.pos.x - entity.pos.x, c.pos.y - entity.pos.y);
    if (d >= hitRadius) continue;
    f.hitKeys.push(key);
    setState(c, 'hurt', 1);
    spawnBubble(w.bubbles, c.pos, pickCollisionVictimLine(), 'speech', 1.3);
    pushLife(c, Math.floor(c.ageSec), '飛んできた誰かに激突された');
    damageChibi(w, c, 4 + Math.floor(Math.random() * 5), 'cocoon_abuse');
  }
  for (const n of w.npcs) {
    if (n.dead || n === entity) continue;
    const key = `n:${n.id}`;
    if (f.hitKeys.includes(key)) continue;
    const d = Math.hypot(n.pos.x - entity.pos.x, n.pos.y - entity.pos.y);
    if (d >= hitRadius) continue;
    f.hitKeys.push(key);
    spawnBubble(w.bubbles, n.pos, pickLine(hurtLinesFor(n.id)), 'npc-speech', 1.3);
    damageNpc(w, n, 3 + Math.floor(Math.random() * 4));
  }

  // 着地：leftSec 切れ or 画面下端へ接触
  if (f.leftSec <= 0 || entity.pos.y >= w.bounds.h - 10) {
    // 位置クランプ（水＝泥川ゾーンはそのまま、陸は地面に）
    entity.pos.y = Math.min(entity.pos.y, w.bounds.h - 16);
    entity.flight = null;
    // 着地処理：水中 (y>414) なら溺死（ちびわふ）or 水HP削り（NPC）
    if (isChibi) {
      const c = entity as Chibiwafu;
      if (c.pos.y > 414) {
        spawnBubble(w.bubbles, c.pos, 'わふぅ…', 'speech', 1.1);
        pushLife(c, Math.floor(c.ageSec), '水に落ちて沈んだ');
        damageChibi(w, c, c.hp, 'kamisama_drown');
        return;
      }
      setState(c, 'hurt', 1.4);
      spawnBubble(w.bubbles, c.pos, 'どさっわふ', 'speech', 1.2);
      const died = damageChibi(w, c, f.landingDamage, f.landCauseId as DeathCauseId);
      if (died) {
        pushLife(c, Math.floor(c.ageSec), `投げられて地面に激突死（-${f.landingDamage}HP）`);
      } else {
        pushLife(c, Math.floor(c.ageSec), `投げられて地面に激突（-${f.landingDamage}HP）`);
      }
    } else {
      const n = entity as NpcState;
      if (n.pos.y > 414) {
        spawnBubble(w.bubbles, n.pos, 'わぷっ…', 'npc-speech', 1.2);
        damageNpc(w, n, 10);
        return;
      }
      damageNpc(w, n, f.landingDamage);
    }
  }
}

// NPC に HP ダメージ。0 以下で dead フラグを立てる。戻り値 = 死んだか。
// フラナが死ぬと panic モード発動。復活は npcs 側の respawnSec に従う（フラナは Infinity）。
export function damageNpc(w: WorldState, n: NpcState, amount: number): boolean {
  if (n.dead) return false;
  n.hp = Math.max(0, n.hp - amount);
  pushNpcLife(n, Math.floor(w.timeSec), `殴られた（-${amount} HP）`);
  if (n.hp <= 0) {
    n.dead = true;
    n.state = 'dead';
    n.stateTimer = 0;
    n.respawnTimer = NPC_DEFS[n.id].respawnSec;
    pushNpcLife(n, Math.floor(w.timeSec), '死んだ');
    // 死亡セリフ
    if (n.id === 'furana') {
      spawnBubble(w.bubbles, n.pos, pickLine(FURANA_LINES_DEATH), 'npc-speech', 3);
      onFuranaDeath(w);
    } else if (n.id === 'cocoon') {
      spawnBubble(w.bubbles, n.pos, pickLine(COCOON_DEATH_LINES), 'npc-speech', 2.5);
    } else {
      spawnBubble(w.bubbles, n.pos, 'やられた…', 'npc-speech', 2);
    }
    return true;
  }
  // HP 残ってるときの "いた！" 反応
  n.state = 'hurt';
  n.stateTimer = 1.2;
  // どのNPCでも専用の hurt 台詞を吐く
  spawnBubble(w.bubbles, n.pos, pickLine(hurtLinesFor(n.id)), 'npc-speech', 1.6);
  if (n.id === 'furana') {
    // 殴られると機嫌が大幅に下がる
    n.mood = Math.max(0, n.mood - 18);
    // スズが近くにいたらママ心配で反応（35%）
    const suzu = w.npcs.find((x) => x.id === 'suzu');
    if (suzu && !suzu.dead && Math.random() < 0.35) {
      spawnBubble(w.bubbles, suzu.pos, pickLine(SUZU_LINES_MAMA_HURT), 'npc-speech', 2);
    }
    // 近くのちびわふも反応：40px 以内の mama 40 超え の子が "ママー！" 30%
    for (const c of w.chibis) {
      if (!isAlive(c)) continue;
      if (distance(c.pos, n.pos) > 50) continue;
      if (c.params.mama < 40) continue;
      if (Math.random() < 0.3) {
        setState(c, 'cry', 1.2);
        spawnBubble(w.bubbles, c.pos, 'ママー！', 'speech', 1.4);
      }
    }
  }
  return false;
}

// フラナ死亡時の一斉リアクション：ちびわふ全員に衝撃。スズとココンも嘆く。
function onFuranaDeath(w: WorldState) {
  for (const c of w.chibis) {
    if (!isAlive(c)) continue;
    setState(c, 'cry', 3);
    if (Math.random() < 0.6) {
      const line = pickLine(['ママー！', 'うそわふ！', 'ママしんじゃったわふ…', 'なんでわふ！？', 'ぎゃーわふ！']);
      spawnBubble(w.bubbles, c.pos, line, 'speech', 2.2);
    }
    pushLife(c, Math.floor(c.ageSec), 'ママが死んだ');
  }
  const suzu = w.npcs.find((x) => x.id === 'suzu');
  if (suzu && !suzu.dead) spawnBubble(w.bubbles, suzu.pos, pickLine(SUZU_LINES_MAMA_DEATH), 'npc-speech', 3);
  const cocoon = w.npcs.find((x) => x.id === 'cocoon');
  if (cocoon && !cocoon.dead) spawnBubble(w.bubbles, cocoon.pos, 'ママ…ママ…', 'npc-speech', 3);
}

// lifeLog に1行追加。上限30件（古いものから削除）。
const LIFE_LOG_MAX = 30;
function pushLife(c: Chibiwafu, sec: number, text: string) {
  c.lifeLog.push({ sec, text });
  if (c.lifeLog.length > LIFE_LOG_MAX) c.lifeLog.shift();
}
export { pushLife };

// 出産：人口不足率に応じてインターバル短縮。空に近ければ burst 出産。
// フラナ（ママ）が死亡中はそもそも生まれない。
function spawnIfRoom(w: WorldState) {
  if (!isFuranaAlive(w)) return;
  const living = w.chibis.filter(isAlive).length;
  const cap = populationCap(w);
  if (living >= cap) return;
  w.spawnCooldown -= CONFIG.TICK_DT;
  if (w.spawnCooldown > 0) return;

  const deficitRatio = cap > 0 ? 1 - living / cap : 1;
  const scale = 1 + (CONFIG.BIRTH_DEFICIT_BOOST_MIN - 1) * deficitRatio;

  let burst = 1;
  if (living / cap < CONFIG.BIRTH_BURST_THRESHOLD) {
    burst = 1 + Math.floor(Math.random() * CONFIG.BIRTH_BURST_MAX);
  }
  for (let i = 0; i < burst; i++) {
    if (w.chibis.filter(isAlive).length >= cap) break;
    forceSpawn(w);
  }
  // 産屋で伸びる spawnSpeedMultiplier で実インターバル短縮
  const nextInterval = ((w.baseSpawnInterval + Math.random() * CONFIG.SPAWN_INTERVAL_JITTER_SEC) * scale) / Math.max(0.5, w.spawnSpeedMultiplier);
  w.spawnCooldown = nextInterval;
}

export function forceSpawn(w: WorldState) {
  const name = generateName(w.nameSet);
  w.nameSet.add(name);
  const jitter = () => (Math.random() - 0.5) * 40;
  const cocoon = w.npcs.find((n) => n.id === 'cocoon');
  const traits = rollTraits({
    buildingsNearFurana: w.buildings.filter((b) => distance(b.pos, w.furanaPos) < 120).length,
    koubaLevel: countBuildingLevels(w, 'kouba'),
    cocoonNearFurana: cocoon ? distance(cocoon.pos, w.furanaPos) < 100 : false,
    event: w.event?.kind ?? null,
  });
  // 10軸パラメータを生成→特性で baseline 補正。
  const rawParams = rollParams();
  const params = applyTraitBias(rawParams, traits);
  // ライフスパン：心配性は寿命半分、toughness が高いほど長生き。
  let maxAge = CONFIG.CHIBI_MAX_AGE_MIN_SEC + Math.random() * CONFIG.CHIBI_MAX_AGE_RANGE_SEC;
  if (traits.includes('shinpai')) maxAge *= 0.5;
  maxAge *= 0.7 + params.tough * 0.006; // tough 0 → ×0.7, tough 100 → ×1.3
  // フレーバー特性（動きに効かない小さな性格メモ）
  const flavors = rollFlavors(rollFlavorCount());
  const child = spawnChibiwafu({
    name,
    birthTick: w.tick,
    pos: { x: w.furanaPos.x + jitter(), y: w.furanaPos.y + 30 + Math.abs(jitter()) },
    maxAgeSec: maxAge,
    traits,
    params,
    flavors,
  });
  // フレーバー由来の速度補正（足が妙に速い／遅い）
  child.speed *= applyFlavorSpeedMod(flavors);
  setState(child, 'surprised', 1.5);
  const traitLabel = traits.length > 0 ? `（${traits.map((t) => TRAIT_DEFS[t].name).join('・')}）` : '';
  pushLife(child, 0, `生まれた${traitLabel}`);
  w.chibis.push(child);
  w.totalBirths += 1;
  reactNpcsToBirth(w);
}

function resolveEvent(w: WorldState, dt: number) {
  if (!w.event) return;
  w.event.remaining -= dt;
  const elapsed = w.event.duration - w.event.remaining;
  const peak = intensityAt(w.event.intensity, elapsed, w.event.duration);
  for (const c of w.chibis) {
    if (!isAlive(c)) continue;
    if (w.event.kind === 'ondo') {
      // 浮世離れは音頭に反応しない（免疫）。
      if (c.traits.includes('ukiyo')) continue;
      setState(c, 'dazed', 0.5);
      if (Math.random() < peak * dt) kill(w, c, 'ondo');
    } else if (w.event.kind === 'fire') {
      // 農民気質は火に強い（-30%）。
      const rate = c.traits.includes('noumin') ? peak * 0.7 : peak;
      if (Math.random() < rate * dt) kill(w, c, 'fire');
      else if (Math.random() < 0.08) setState(c, 'hurt', 1);
    } else if (w.event.kind === 'taiko_festival') {
      // 太鼓やぐら近くのちびわふを眩惑状態に。実際のkillは taiko_crush ハザードに任せる。
      for (const b of w.buildings) {
        if (b.defId !== 'taiko') continue;
        if (distance(c.pos, b.pos) < 70) {
          setState(c, 'dazed', 0.4);
          break;
        }
      }
    }
  }
  if (w.event.remaining <= 0) {
    const ended = w.event.kind;
    w.event = null;
    if (ended === 'ondo') { w.ondoCooldown = computeOndoInterval(w); dampenFuranaMood(w, -8); }  // 音頭終わり → 解放感 +8
    else if (ended === 'fire') w.fireCooldown = computeFireInterval(w);
    // taiko_festival はクールダウン再設定不要（次の季節境界で再発動）。
  }
}

export function triggerOndo(w: WorldState) {
  w.event = {
    kind: 'ondo',
    duration: CONFIG.ONDO_DURATION_SEC,
    remaining: CONFIG.ONDO_DURATION_SEC,
    intensity: CONFIG.ONDO_KILL_RATE + 0.05,
  };
  reactNpcsToOndo(w);
}

export function triggerBokaigi(w: WorldState) {
  const alive = w.chibis.filter(isAlive);
  if (alive.length === 0) return;
  const victims = Math.min(alive.length, 1 + Math.floor(Math.random() * 3));
  for (let i = 0; i < victims; i++) {
    const pick = alive[Math.floor(Math.random() * alive.length)]!;
    kill(w, pick, 'bokaigi');
  }
}

export function triggerFire(w: WorldState) {
  w.event = {
    kind: 'fire',
    duration: CONFIG.FIRE_DURATION_SEC,
    remaining: CONFIG.FIRE_DURATION_SEC,
    intensity: CONFIG.FIRE_KILL_RATE + 0.05,
  };
}

function runHazards(w: WorldState, c: Chibiwafu, dt: number, hazards: HazardZone[]): boolean {
  const insideSafe = distance(c.pos, w.furanaPos) < CONFIG.SAFE_ZONE_R;
  for (const zone of hazards) {
    if (!hazardActiveInSeason(zone, w.season)) continue;
    if (insideSafe && !zone.bypassSafeZone) continue;
    if (!pointInZone(zone, c.pos)) continue;
    // trait gate
    if (zone.requiresAnyTrait && !zone.requiresAnyTrait.some((t) => c.traits.includes(t))) continue;
    // event gate
    if (zone.requiresEvent && zone.requiresEvent !== w.event?.kind) continue;
    // age gate
    if (zone.requiresYoungSec != null && c.ageSec >= zone.requiresYoungSec) continue;
    // trait multipliers
    let rate = zone.ratePerSec;
    if (zone.traitMultipliers) {
      for (const t of c.traits) {
        const m = zone.traitMultipliers[t];
        if (m != null) rate *= m;
      }
    }
    // パラメータ補正（運の悪さ・丈夫さ）
    rate *= derivedHazardSusceptibility(c.params);
    if (Math.random() < rate * dt) {
      kill(w, c, zone.causeId);
      return true;
    }
  }
  return false;
}

function updateChibi(w: WorldState, c: Chibiwafu, dt: number, hazards: HazardZone[]) {
  if (!isAlive(c)) return;
  c.ageSec += dt;
  c.chatCooldown -= dt;
  if (c.ageSec >= c.maxAgeSec) {
    kill(w, c, 'roushuai');
    return;
  }
  // --- サバイバル（空腹・疲労） ---------------------------------------
  // 空腹は時間で上昇（tough が高いと耐性↑）。疲労は活動系ステートで上昇、睡眠で回復。
  const toughMul = 1 - Math.max(0, c.params.tough - 50) * 0.006;  // tough100=0.7倍
  c.hunger += dt * 1.2 * toughMul;  // 100 到達まで ~83秒（tough100 なら 119秒）
  // sleep 以外は疲労が溜まる（hurt/cry でも休息にならない）
  if (c.state !== 'sleep') c.fatigue += dt * 0.55 * toughMul;  // ~180秒で疲労死
  if (c.state === 'sleep') c.fatigue = Math.max(0, c.fatigue - dt * 0.70);
  if (c.state === 'eating') c.hunger = Math.max(0, c.hunger - dt * 6);   // 食事で一気に回復
  c.hunger = Math.max(0, Math.min(100, c.hunger));
  c.fatigue = Math.max(0, Math.min(100, c.fatigue));
  if (c.hunger >= 100) { kill(w, c, 'hunger_death'); return; }
  if (c.fatigue >= 100) { kill(w, c, 'fatigue_death'); return; }
  // 飛行中は wander/state transition を止めて物理だけ動かす
  if (c.flight) {
    flightStep(w, c, true, dt);
    return;
  }
  c.stateTimer -= dt;
  if (c.stateTimer <= 0 && c.state !== 'dead') {
    const roll = Math.random();
    // 夜は寝る確率が大きく上がる（夜= sleep ×4, 夕= ×1.5, 朝昼= ×1）
    const sleepMul = w.dayPhase === 'night' ? 4 : w.dayPhase === 'evening' ? 1.5 : 1;
    const sleepThreshold = 0.08 + 0.02 * sleepMul;    // night=0.16, evening=0.11, noon=0.10
    const dazedThreshold = 0.08;                        // 変えない
    const cryThreshold = 0.05;                          // 変えない
    if (roll < cryThreshold) {
      setState(c, 'cry', 0.8);
      if (Math.random() < 0.95) spawnBubble(w.bubbles, c.pos, pickReason(CRY_REASONS), 'speech', 1.4);
    }
    else if (roll < dazedThreshold) {
      setState(c, 'dazed', 0.6);
      if (Math.random() < 0.85) spawnBubble(w.bubbles, c.pos, pickReason(DAZED_REASONS), 'speech', 1.2);
    }
    else if (roll < sleepThreshold) {
      setState(c, 'sleep', w.dayPhase === 'night' ? 3 : 1.5);
      if (Math.random() < 0.9) spawnBubble(w.bubbles, c.pos, pickReason(SLEEP_REASONS), 'speech', 1.3);
    }
    // 哲学石に着いたら空を見る（philo パラメータで確率決定）
    else if (
      c.targetLandmarkId === 'philosophy' &&
      c.target &&
      distance(c.pos, c.target) < 10 &&
      Math.random() < derivedStareChance(c.params)
    ) {
      setState(c, 'staring', 2.5);
      pushLife(c, Math.floor(c.ageSec), '哲学石で空を見た');
      if (Math.random() < 0.6) {
        const line = pickActionAnnounce('state_staring');
        if (line) spawnBubble(w.bubbles, c.pos, line, 'speech', 1.4);
      }
    }
    // 食事スポットに着いたら食事（appetite パラメータで確率決定）
    else if (
      (c.targetLandmarkId === 'stonebread' || c.targetLandmarkId === 'mudpool' || c.targetLandmarkId === 'beer') &&
      c.target &&
      distance(c.pos, c.target) < 10 &&
      Math.random() < derivedEatChance(c.params)
    ) {
      setState(c, 'eating', 1.8);
      const where = c.targetLandmarkId === 'stonebread' ? '石パン岩' : c.targetLandmarkId === 'mudpool' ? '泥水池' : '泥水ビール樽';
      pushLife(c, Math.floor(c.ageSec), `${where}で食べた`);
      if (Math.random() < 0.6) {
        const line = pickActionAnnounce('state_eating');
        if (line) spawnBubble(w.bubbles, c.pos, line, 'speech', 1.3);
      }
    }
    else setState(c, 'idle', 0.4 + Math.random());
  }

  // --- 特性別の可視挙動 ---------------------------------------------------
  // 泣き虫：idle 中にランダムで泣き出す（15-30秒に1回程度）
  if (c.traits.includes('nakimushi') && c.state === 'idle' && Math.random() < 0.0025) {
    setState(c, 'cry', 1.6);
    spawnBubble(w.bubbles, c.pos, 'わふぅ〜', 'speech', 1.4);
  }
  // もらし常習：💧 吹き出しが周期的に出る（15-20秒毎くらい）
  if (c.traits.includes('morashi') && Math.random() < 0.003) {
    spawnBubble(w.bubbles, c.pos, '💧', 'stomp', 1.1);
    pushLife(c, Math.floor(c.ageSec), 'もらした');
    // 周囲 50px に生きた他の子がいれば反応（35% 優しく拭く / 65% ドン引き）
    const witness = w.chibis.find(
      (o) => o !== c && isAlive(o) && distance(o.pos, c.pos) < 50 && o.state === 'idle',
    );
    if (witness) {
      if (Math.random() < 0.35) {
        // 優しい子：拭いてあげる（idle に留まり台詞のみ）
        spawnBubble(w.bubbles, witness.pos, pickMorashiWipeLine(), 'speech', 1.6);
        pushLife(witness, Math.floor(witness.ageSec), `${c.name} のもらしを拭いた`);
      } else {
        // ドン引きする子：dazed 状態 + 暴言
        setState(witness, 'dazed', 1);
        spawnBubble(w.bubbles, witness.pos, pickMorashiDisgustLine(), 'speech', 1.6);
        pushLife(witness, Math.floor(witness.ageSec), `${c.name} のもらしにドン引きした`);
      }
    }
  }
  // おしゃべり：idle 中、相手がいなくても一人で喋る
  if (c.traits.includes('oshaberi') && c.state === 'idle' && c.chatCooldown <= 0 && Math.random() < 0.005) {
    const line = pickOshaberiLine(c);
    spawnBubble(w.bubbles, c.pos, line.text, 'speech', 1.3);
    if (line.cheeky) maybePunishCheeky(w, c);
  }
  // 全員：社交 param に応じて独り言を漏らす（oshaberi 無くても少しは喋る）
  if (!c.traits.includes('oshaberi') && c.state === 'idle' && c.chatCooldown <= 0 && Math.random() < derivedSoloSpeakChance(c.params)) {
    const line = pickOshaberiLine(c);
    spawnBubble(w.bubbles, c.pos, line.text, 'speech', 1.6);
    c.chatCooldown = 1 + Math.random() * 2;
    if (line.cheeky) maybePunishCheeky(w, c);
  }
  // 哲学者：場所関係なく突然立ち止まって空を見る（20-30秒に1回程度）
  if (c.traits.includes('tetsugakusha') && c.state === 'idle' && Math.random() < 0.0015) {
    setState(c, 'staring', 3);
    spawnBubble(w.bubbles, c.pos, '…', 'speech', 1.5);
    pushLife(c, Math.floor(c.ageSec), '突然立ち止まって空を見つめた');
  }

  // --- フレーバー特性由来の小挙動 --------------------------------------
  // 季節×flavor 連動の自然発話
  if (c.state === 'idle') {
    // 暑がり × 夏：ため息
    if (w.season === 'summer' && c.flavors.includes('暑がり') && Math.random() < 0.002) {
      spawnBubble(w.bubbles, c.pos, 'あついわふ…', 'speech', 1.3);
    }
    // 寒がり × 冬
    if (w.season === 'winter' && c.flavors.includes('寒がり') && Math.random() < 0.002) {
      spawnBubble(w.bubbles, c.pos, 'さむいわふ…', 'speech', 1.3);
    }
    // 鼻血出やすい：🩸 絵文字＋ hurt 軽め
    if (c.flavors.includes('鼻血出やすい') && Math.random() < 0.0015) {
      spawnBubble(w.bubbles, c.pos, '🩸', 'stomp', 1);
      setState(c, 'hurt', 0.6);
    }
    // しゃっくりが止まらない
    if (c.flavors.includes('しゃっくりが止まらない') && Math.random() < 0.0025) {
      spawnBubble(w.bubbles, c.pos, 'ひっく', 'speech', 0.9);
    }
    // 歌が壊滅的に下手：♪を出す
    if (c.flavors.includes('歌が壊滅的に下手') && Math.random() < 0.0015) {
      spawnBubble(w.bubbles, c.pos, '♪？', 'speech', 1.4);
    }
    // 空をじっと見る：staring に突入
    if (c.flavors.includes('空をじっと見る') && Math.random() < 0.0012) {
      setState(c, 'staring', 2);
    }
    // 棒で何でも叩く：近くの誰かを叩く
    if (c.flavors.includes('棒で何でも叩く') && Math.random() < 0.0015) {
      const near = w.chibis.find((o) => o !== c && isAlive(o) && distance(o.pos, c.pos) < 40);
      if (near) {
        spawnBubble(w.bubbles, c.pos, 'えいっ！', 'speech', 1);
        spawnBubble(w.bubbles, near.pos, 'いたっ', 'speech', 0.8);
        setState(near, 'hurt', 0.8);
      }
    }
    // うんこの形が気になる：近くの死体で立ち止まる
    if (c.flavors.includes('うんこの形が気になる') && Math.random() < 0.0015) {
      const corpse = w.corpses.find((cc) => distance(cc.pos, c.pos) < 30);
      if (corpse) setState(c, 'staring', 2);
    }
    // すぐ寝る：sleep 頻発
    if (c.flavors.includes('すぐ寝る') && Math.random() < 0.003) {
      setState(c, 'sleep', 2);
    }
    // すぐ笑う：笑い bubble
    if (c.flavors.includes('すぐ笑う') && Math.random() < 0.002) {
      spawnBubble(w.bubbles, c.pos, 'ふふっわふ', 'speech', 1.1);
    }
  }

  // sleep 中のいびきうるさい
  if (c.state === 'sleep' && c.flavors.includes('いびきがうるさい') && Math.random() < 0.005) {
    spawnBubble(w.bubbles, c.pos, 'ぐーぐーわふ', 'speech', 1.3);
  }

  // --- テーブル駆動のフレーバー挙動 ----------------------------------
  for (const f of c.flavors) {
    const amb = FLAVOR_AMBIENT[f];
    if (amb && c.state === 'idle' && Math.random() < amb.chance) {
      if (amb.bubble) spawnBubble(w.bubbles, c.pos, amb.bubble, 'speech', 1.2);
      if (amb.state) setState(c, amb.state, amb.duration ?? 1);
      // 粗相系フレーバー：周囲から理不尽にボコられる可能性
      if (EMBARRASSING_FLAVORS.has(f)) maybePunishRifujin(w, c, f);
    }
    const seasonals = FLAVOR_SEASONAL[f];
    if (seasonals) {
      for (const s of seasonals) {
        if (s.season === w.season && Math.random() < s.chance) {
          spawnBubble(w.bubbles, c.pos, s.bubble, 'speech', 1.3);
        }
      }
    }
    const during = FLAVOR_DURING[f];
    if (during && c.state === during.state && Math.random() < during.chance) {
      spawnBubble(w.bubbles, c.pos, during.bubble, 'speech', 1.2);
    }
  }

  // --- 感情の伝染 / 野次 ------------------------------------------------
  // idle なちびわふが 45px 以内の "反応可能な" 子を見つけて反応する。
  // 泣いてる子 → 慰め / もらい泣き
  // 食べてる子 → おねだり
  // 寝てる子  → あくび伝染
  // 怒ってる子 → 怯える
  emergentPeerReactions(w, c);

  // 移動（止まってるステート中は動かない）
  if (c.state === 'idle' || c.state === 'surprised' || c.state === 'angry') {
    const cocoon = w.npcs.find((n) => n.id === 'cocoon');
    const announcementKey = wanderStep(c, dt, w.bounds, {
      landmarks: w.landmarks,
      season: w.season,
      furana: w.furanaPos,
      cocoonPos: cocoon ? cocoon.pos : null,
      noukouPositions: w.buildings.filter((b) => b.defId === 'noukou').map((b) => b.pos),
      taikoPositions: w.buildings.filter((b) => b.defId === 'taiko').map((b) => b.pos),
      obstaclePositions: w.obstacles.map((o) => o.pos),
    });
    // 40% で行動予告（毎回だと説明口調になるので抑制）
    if (announcementKey && Math.random() < 0.4) {
      const line = pickActionAnnounce(announcementKey);
      if (line) spawnBubble(w.bubbles, c.pos, line, 'speech', 1.3);
    }
  }
  runHazards(w, c, dt, hazards);
}

// 屁・しゃっくり・よだれ等の粗相 → 理不尽ボコ。
// 近くに誰かいると 35% で発動、そのうち 30% で死亡（rifujin_boko）。
// "なぜか殴られた"が画面で読めるよう、両者に理由バブル + lifeLog を残す。
const RIFUJIN_PUNISH_CHANCE = 0.35;
const RIFUJIN_KILL_CHANCE = 0.30;
function maybePunishRifujin(w: WorldState, victim: Chibiwafu, flavor: string) {
  if (Math.random() > RIFUJIN_PUNISH_CHANCE) return;
  const nearby = w.chibis.filter((o) => o !== victim && isAlive(o) && distance(o.pos, victim.pos) < 55);
  if (nearby.length === 0) return;
  const striker = nearby[Math.floor(Math.random() * nearby.length)]!;
  spawnBubble(w.bubbles, striker.pos, pickRifujinStrikerLine(), 'speech', 1.5);
  spawnBubble(w.bubbles, victim.pos, pickRifujinVictimLine(), 'speech', 1.3);
  setState(victim, 'hurt', 1.2);
  setState(striker, 'angry', 0.8);
  pushLife(victim, Math.floor(victim.ageSec), `${flavor}で ${striker.name} に理不尽に殴られた`);
  pushLife(striker, Math.floor(striker.ageSec), `${victim.name} が${flavor}をやっていたので殴った`);
  if (Math.random() < RIFUJIN_KILL_CHANCE) {
    kill(w, victim, 'rifujin_boko');
  }
}

// 感情伝染：idle なちびわふが近くの子の状態を見て反応する。
// ～1秒に 1回前後のペースで発火するよう、per-tick 確率を抑え目に設定。
function emergentPeerReactions(w: WorldState, c: Chibiwafu) {
  if (c.state !== 'idle') return;
  if (c.chatCooldown > 0) return;          // おしゃべり CD を共有
  if (Math.random() > 0.004) return;        // 50秒に 1回程度（per chibi）
  // 45px 以内で "反応したくなる" ステートの子を探す
  const targets = w.chibis.filter(
    (o) => o !== c && isAlive(o) && distance(o.pos, c.pos) < 45
      && (o.state === 'cry' || o.state === 'eating' || o.state === 'sleep' || o.state === 'angry'),
  );
  if (targets.length === 0) return;
  const t = targets[Math.floor(Math.random() * targets.length)]!;

  if (t.state === 'cry') {
    // 40% 慰め / 60% もらい泣き
    if (Math.random() < 0.4) {
      spawnBubble(w.bubbles, c.pos, pickComfortLine(), 'speech', 1.4);
      pushLife(c, Math.floor(c.ageSec), `${t.name} を慰めた`);
    } else {
      setState(c, 'cry', 1.2);
      spawnBubble(w.bubbles, c.pos, pickCopyCryLine(), 'speech', 1.3);
      pushLife(c, Math.floor(c.ageSec), `${t.name} につられて泣いた`);
    }
  } else if (t.state === 'eating') {
    spawnBubble(w.bubbles, c.pos, pickBegFoodLine(), 'speech', 1.3);
    pushLife(c, Math.floor(c.ageSec), `${t.name} の食事をねだった`);
  } else if (t.state === 'sleep') {
    // 25% で自分もあくび（dazed 短時間）
    spawnBubble(w.bubbles, c.pos, pickSleepyContagionLine(), 'speech', 1.3);
    if (Math.random() < 0.25) setState(c, 'dazed', 1);
  } else if (t.state === 'angry') {
    // 怒ってる子を見て怯える
    spawnBubble(w.bubbles, c.pos, pickAngryBystanderLine(), 'speech', 1.3);
    setState(c, 'dazed', 0.8);
  }
  c.chatCooldown = 4 + Math.random() * 3;
}

// "悪い死に方" 一覧：この causeId で死んだ子には周囲が "ざまあみろ" と言いがち
const SCHADENFREUDE_CAUSES = new Set<DeathCauseId>([
  'namaiki_boko',      // 生意気言ってボコられた
  'rifujin_boko',      // 粗相で理不尽に殴られた（でもこれは気の毒？一応混ぜる）
  'bo_meijin_tenka',   // 棒名人が巻き添え→自業自得
  'kamisama_punch',    // 神様にボコられた（子どもの野次的）
  'cocoon_abuse',      // ココンに叩き殺された
]);

// 悪い死に方をした子の近くにいるちびわふが、まれに野次を飛ばす
function chibiSchadenfreude(w: WorldState, victim: Chibiwafu) {
  if (victim.deathCauseId == null || !SCHADENFREUDE_CAUSES.has(victim.deathCauseId as DeathCauseId)) return;
  const witnesses = w.chibis.filter(
    (o) => o !== victim && isAlive(o) && distance(o.pos, victim.pos) < 70 && o.state === 'idle',
  );
  if (witnesses.length === 0) return;
  // 1人だけランダムに選び 12% の確率で野次
  const w1 = witnesses[Math.floor(Math.random() * witnesses.length)]!;
  if (Math.random() > 0.12) return;
  spawnBubble(w.bubbles, w1.pos, pickSchadenfreudeLine(), 'speech', 1.6);
  pushLife(w1, Math.floor(w1.ageSec), `${victim.name} の死を笑った`);
}

// 生意気セリフが出ると"たまに"ボコられる。毎回ではない。
// PUNISH_CHANCE: 近くに誰かいても無視される確率が大半。
// ボコ確定した時は 35% で死亡（namaiki_boko）。
const PUNISH_CHANCE = 0.25;
function maybePunishCheeky(w: WorldState, victim: Chibiwafu) {
  if (Math.random() > PUNISH_CHANCE) return;
  const nearby = w.chibis.filter((o) => o !== victim && isAlive(o) && distance(o.pos, victim.pos) < 60);
  if (nearby.length === 0) return;
  const striker = nearby[Math.floor(Math.random() * nearby.length)]!;
  spawnBubble(w.bubbles, striker.pos, pickStrikerLine(), 'speech', 1.5);
  spawnBubble(w.bubbles, victim.pos, pickVictimHurtLine(), 'speech', 1);
  setState(victim, 'hurt', 1.2);
  setState(striker, 'angry', 0.8);
  pushLife(victim, Math.floor(victim.ageSec), `自慢して ${striker.name} に殴られた`);
  pushLife(striker, Math.floor(striker.ageSec), `自慢屋の ${victim.name} を殴った`);
  if (Math.random() < 0.35) {
    kill(w, victim, 'namaiki_boko');
  }
}

// 立ち話：近接2体をO(n²)で検査（人口数十までは無視できるコスト）
function processChats(w: WorldState, dt: number) {
  for (let i = 0; i < w.chibis.length; i++) {
    const a = w.chibis[i]!;
    if (!isAlive(a) || a.state === 'chatting' || a.chatCooldown > 0) continue;
    for (let j = i + 1; j < w.chibis.length; j++) {
      const b = w.chibis[j]!;
      if (!isAlive(b) || b.state === 'chatting' || b.chatCooldown > 0) continue;
      // 近接距離：広めに取って常時どこかで立ち話が起きてる状態にする
      if (distance(a.pos, b.pos) > 70) continue;
      const chat = maybeStartChat(a, b);
      if (!chat) continue;
      // 両者を chatting 状態に、向き合わせる、吹き出しを出す
      setState(a, 'chatting', chat.duration);
      setState(b, 'chatting', chat.duration);
      a.chatCooldown = 8 + Math.random() * 6;
      b.chatCooldown = 8 + Math.random() * 6;
      a.faceLeft = b.pos.x < a.pos.x;
      b.faceLeft = a.pos.x < b.pos.x;
      // A が先に喋る（長めTTL）。B は少し遅れて喋る（短めTTL＋位置が動いてないので即座に表示OK）
      spawnBubble(w.bubbles, a.pos, chat.lineA.text, 'speech', chat.duration * 0.6);
      spawnBubble(w.bubbles, { x: b.pos.x, y: b.pos.y + 6 }, chat.lineB.text, 'speech', chat.duration * 0.4);
      pushLife(a, Math.floor(a.ageSec), `${b.name} と話した`);
      pushLife(b, Math.floor(b.ageSec), `${a.name} と話した`);
      a.chatCooldown = derivedChatCooldown(a.params);
      b.chatCooldown = derivedChatCooldown(b.params);
      // 生意気セリフは報復対象
      if (chat.lineA.cheeky) maybePunishCheeky(w, a);
      if (chat.lineB.cheeky) maybePunishCheeky(w, b);
      break; // a は1人と話せば十分
    }
  }
  // NPC とちびわふの会話：フラナ/スズ/ココン が 40px 以内の idle な子に話しかける
  for (const n of w.npcs) {
    if (n.dead) continue;
    if (n.id === 'lou') continue; // ルーは無口
    if (Math.random() > 0.004) continue; // per-tick 発火率
    const partner = w.chibis.find(
      (c) => isAlive(c) && c.state === 'idle' && c.chatCooldown <= 0 && distance(c.pos, n.pos) < 50,
    );
    if (!partner) continue;
    // フラナは機嫌で話しかけ内容が変わる
    const furanaAngry = n.id === 'furana' && n.mood < 45;
    const npcPool = n.id === 'furana'
        ? (furanaAngry ? FURANA_LINES_CHAT_ANGRY : FURANA_LINES_CHAT)
      : n.id === 'suzu' ? SUZU_LINES_CHAT
      : COCOON_LINES_CHAT;
    const chibiPool = n.id === 'furana'
        ? (furanaAngry ? CHIBI_TO_FURANA_SCARED_LINES : CHIBI_TO_FURANA_LINES)
      : n.id === 'suzu' ? CHIBI_TO_SUZU_LINES
      : CHIBI_TO_COCOON_LINES;
    const duration = 2.2 + Math.random() * 1.2;
    setState(partner, 'chatting', duration);
    partner.chatCooldown = 8 + Math.random() * 6;
    partner.faceLeft = n.pos.x < partner.pos.x;
    spawnBubble(w.bubbles, n.pos, pickLine(npcPool), 'npc-speech', duration * 0.6);
    spawnBubble(w.bubbles, { x: partner.pos.x, y: partner.pos.y + 6 }, pickLine(chibiPool), 'speech', duration * 0.4);
    pushLife(partner, Math.floor(partner.ageSec), `${NPC_DEFS[n.id].name} と話した`);
    // ココンに話しかけられた場合、たまにそのまま殴られる流れに（50%）
    if (n.id === 'cocoon' && Math.random() < 0.5) {
      setState(partner, 'hurt', 1);
      spawnBubble(w.bubbles, partner.pos, 'いたわふ！', 'speech', 1);
      pushLife(partner, Math.floor(partner.ageSec), 'ココンに殴られた（会話中）');
    }
  }
  // 雑に dt を使った減衰は updateChibi 側で実施済み
  void dt;
}

function compactCorpses(w: WorldState) {
  const newlyDead = w.chibis.filter((c) => c.state === 'dead');
  if (newlyDead.length > 0) {
    w.corpses.push(...newlyDead);
    w.chibis = w.chibis.filter((c) => c.state !== 'dead');
    while (w.corpses.length > w.maxCorpses) w.corpses.shift();
  }
}

// --- NPC reactions --------------------------------------------------------

function updateNpcs(w: WorldState, dt: number) {
  for (const n of w.npcs) {
    // 飛行中は物理だけ動かして normal updates はスキップ
    if (n.flight) {
      flightStep(w, n, false, dt);
      continue;
    }
    if (n.dead) {
      n.state = 'dead';
      // respawnSec が Infinity のNPC（フラナ）は復活しない
      if (Number.isFinite(n.respawnTimer)) {
        n.respawnTimer -= dt;
        if (n.respawnTimer <= 0) {
          n.dead = false;
          n.hp = n.maxHp;
          n.state = 'idle';
          n.stateTimer = 0;
          n.pos = { ...n.home };
          n.abuseCooldown = 4;
          pushNpcLife(n, Math.floor(w.timeSec), 'なぜか蘇った');
          spawnBubble(w.bubbles, n.pos, pickLine(reviveLinesFor(n.id)), 'npc-speech', 2.5);
        }
      }
      continue;
    }
    // ステート timer を減らして、切れたら idle に戻す（dead は上でキープ）
    if (n.state !== 'idle') {
      n.stateTimer -= dt;
      if (n.stateTimer <= 0) { n.state = 'idle'; n.stateTimer = 0; }
    }
    if (n.id === 'furana') {
      updateFuranaMovement(w, n, dt);
      updateFuranaBehavior(w, n, dt);
    } else {
      wanderNpc(n, dt);
      if (n.id === 'cocoon') updateCocoonAbuse(w, n, dt);
      if (n.id === 'lou' && Math.random() < 0.0007) {
        spawnBubble(w.bubbles, n.pos, pickLine(LOU_LINES), 'npc-speech', 1.6);
      }
    }
  }
  // world.furanaPos は後方互換のため npc フラナの pos を常にミラーする
  const furana = w.npcs.find((n) => n.id === 'furana');
  if (furana && !furana.dead) w.furanaPos = { ...furana.pos };
}

// フラナの意思的移動：目的地を決め、徐々に歩く（テレポートしない）。
// 機嫌悪い時は近くのちびわふに向かって積極的に突進する。
function updateFuranaMovement(w: WorldState, n: NpcState, dt: number) {
  // 機嫌悪い時は速度 1.6 倍（怒りの突進）
  const currentSpeed = n.mood < 35 ? n.speed * 1.6 : n.speed;
  // 目的地に近づいてきたら到着扱い
  if (n.target && distance(n.pos, n.target) < 6) {
    n.target = null;
  }
  if (n.target == null) {
    n.wanderTimer -= dt;
    if (n.wanderTimer > 0) return;
    // 機嫌悪いほど次の目的地を早く決める（突進モード）
    n.wanderTimer = n.mood < 35 ? 0.3 + Math.random() * 0.4 : 0.8 + Math.random() * 1.2;
    n.target = pickFuranaTarget(w, n);
  }
  // 目的地に向かってじわじわ歩く
  if (n.target) {
    const dx = n.target.x - n.pos.x;
    const dy = n.target.y - n.pos.y;
    const d = Math.max(0.001, Math.hypot(dx, dy));
    n.pos.x += (dx / d) * currentSpeed * dt;
    n.pos.y += (dy / d) * currentSpeed * dt;
    n.faceLeft = dx < 0;
  }
}

function pickFuranaTarget(w: WorldState, n: NpcState): Vec2 {
  // 機嫌悪い時（<35）は、画面中どこでも最寄りのちびわふに突進（ロックオン）
  if (n.mood < 35) {
    const chibis = w.chibis.filter((c) => isAlive(c));
    if (chibis.length > 0) {
      let nearest: Chibiwafu | undefined;
      let bestD = Infinity;
      for (const c of chibis) {
        const d = distance(c.pos, n.pos);
        if (d < bestD) { nearest = c; bestD = d; }
      }
      if (nearest) {
        return {
          x: nearest.pos.x + (Math.random() - 0.5) * 12,
          y: nearest.pos.y + (Math.random() - 0.5) * 10,
        };
      }
    }
  }
  const roll = Math.random();
  // 40% ちびわふ集団へ（最寄りの子の近く）
  if (roll < 0.4) {
    const chibis = w.chibis.filter((c) => isAlive(c));
    if (chibis.length > 0) {
      let nearest: Chibiwafu | undefined;
      let bestD = Infinity;
      for (const c of chibis) {
        const d = distance(c.pos, n.pos);
        if (d < bestD) { nearest = c; bestD = d; }
      }
      if (nearest) {
        return {
          x: nearest.pos.x + (Math.random() - 0.5) * 40,
          y: nearest.pos.y + (Math.random() - 0.5) * 30,
        };
      }
    }
  }
  // 20% スズの所へ
  if (roll < 0.6) {
    const suzu = w.npcs.find((x) => x.id === 'suzu' && !x.dead);
    if (suzu) return { x: suzu.pos.x + (Math.random() - 0.5) * 40, y: suzu.pos.y + (Math.random() - 0.5) * 30 };
  }
  // 15% ココンの様子見
  if (roll < 0.75) {
    const cocoon = w.npcs.find((x) => x.id === 'cocoon' && !x.dead);
    if (cocoon) return { x: cocoon.pos.x + (Math.random() - 0.5) * 40, y: cocoon.pos.y + (Math.random() - 0.5) * 30 };
  }
  // 残り 25%：自宅付近ランダム（range 120）
  return {
    x: n.home.x + (Math.random() - 0.5) * 120,
    y: n.home.y + (Math.random() - 0.5) * 120,
  };
}

// フラナの挙動：通常は "めっ" と優しく叱る / まれにイライラして本気で殴る。
// たまに独り言。ちびわふの多数派 mama param が高い個体はすでに自然に集まってくる。
// 近くに密集してるほど（まとわりつき過多）イライラ率が上がる。
function updateFuranaBehavior(w: WorldState, n: NpcState, dt: number) {
  n.abuseCooldown -= dt;
  // HP 自然回復：hurt 以外の時 +1 HP / 秒（maxHp を上限）。
  if (n.state !== 'hurt' && n.hp < n.maxHp) {
    n.hp = Math.min(n.maxHp, n.hp + dt * 1);
  }
  // 機嫌が 70（平常値）に向けて自然に戻る（10秒で 0.5 程度）
  const drift = (70 - n.mood) * 0.003 * dt * 20;  // dt*20 で tick 補正
  n.mood += drift;
  // 近くのちびわふが多すぎると徐々に不機嫌（まとわりつき疲れ）
  const nearbyChibis = w.chibis.filter((c) => isAlive(c) && distance(c.pos, n.pos) < 60);
  if (nearbyChibis.length >= 5) n.mood -= dt * 0.3 * (nearbyChibis.length - 4);
  // 近くで平和に食べてる／寝てる子がいると和む（+0.15 / 秒 per 子）
  const peaceful = nearbyChibis.filter((c) => c.state === 'eating' || c.state === 'sleep').length;
  if (peaceful > 0) n.mood += dt * 0.15 * peaceful;
  n.mood = Math.max(0, Math.min(100, n.mood));

  // 独り言：機嫌で使い分け（8秒に 1回くらい）
  if (Math.random() < 0.005) {
    const pool = n.mood >= 70 ? FURANA_LINES_HAPPY
      : n.mood < 30 ? FURANA_LINES_HATE
      : FURANA_LINES_IDLE;
    spawnBubble(w.bubbles, n.pos, pickLine(pool), 'npc-speech', 2);
  }
  if (n.abuseCooldown > 0) return;
  const candidates = w.chibis.filter((c) => isAlive(c) && distance(c.pos, n.pos) < 70);
  if (candidates.length === 0) {
    n.abuseCooldown = 2 + Math.random() * 2;
    return;
  }
  // 機嫌悪いほど連続攻撃の間隔が短い
  n.abuseCooldown = n.mood < 25 ? 1.5 + Math.random() * 1.5
    : n.mood < 45 ? 2.5 + Math.random() * 2.5
    : 4 + Math.random() * 5;

  // 発動率：機嫌悪いほど行動したがる（unhappy = キレやすい）
  //   mood 90→0.2  (ごきげんで手を出さない)
  //   mood 70→0.35 (平常)
  //   mood 30→0.7  (イライラでちょくちょく手を出す)
  //   mood 0 →0.95 (常に手が出る)
  let triggerChance = 0.35 + (60 - n.mood) * 0.01;
  triggerChance = Math.max(0.1, Math.min(0.95, triggerChance));
  if (Math.random() > triggerChance) return;

  // ターゲット数：機嫌悪いほど "手当たり次第" になる。
  //   mood >= 60 → 1 人
  //   mood 35-59 → 1-2 人
  //   mood 15-34 → 2-3 人
  //   mood < 15  → 3-4 人（暴走）
  let maxTargets: number;
  if (n.mood >= 60) maxTargets = 1;
  else if (n.mood >= 35) maxTargets = 1 + (Math.random() < 0.5 ? 1 : 0);
  else if (n.mood >= 15) maxTargets = 2 + (Math.random() < 0.5 ? 1 : 0);
  else maxTargets = 3 + (Math.random() < 0.5 ? 1 : 0);
  maxTargets = Math.min(maxTargets, candidates.length);

  // ターゲット選択
  //   機嫌悪い (<45)：距離が近い子から順に狙う（手当たり次第パニック）
  //   機嫌良い時：mama 高い子ほど狙われやすい
  const pool = candidates.slice();
  const targets: Chibiwafu[] = [];
  if (n.mood < 45) {
    pool.sort((a, b) => distance(a.pos, n.pos) - distance(b.pos, n.pos));
    for (let k = 0; k < maxTargets && k < pool.length; k++) {
      targets.push(pool[k]!);
    }
  } else {
    const weights = pool.map((c) => 1 + Math.max(0, c.params.mama - 50) * 0.03);
    for (let k = 0; k < maxTargets; k++) {
      if (pool.length === 0) break;
      const total = weights.reduce((a, b) => a + b, 0);
      let roll = Math.random() * total;
      let idx = 0;
      for (let i = 0; i < pool.length; i++) {
        roll -= weights[i]!;
        if (roll < 0) { idx = i; break; }
      }
      targets.push(pool[idx]!);
      pool.splice(idx, 1);
      weights.splice(idx, 1);
    }
  }
  if (targets.length === 0) return;

  // 機嫌に応じて撫で／殴り／ぶん投げの比率を変える（撫では機嫌良い時のみ）
  let punchR: number, throwR: number;
  if (n.mood >= 70)      { punchR = 0.15; throwR = 0.05; }
  else if (n.mood >= 45) { punchR = 0.40; throwR = 0.15; }
  else if (n.mood >= 25) { punchR = 0.52; throwR = 0.40; }
  else                   { punchR = 0.40; throwR = 0.60; }

  // 各ターゲットに対して行動を決めて実行
  for (const target of targets) {
    if (!isAlive(target)) continue;
    applyFuranaActionTo(w, n, target, punchR, throwR);
  }
}

// 1人のちびわふに対するフラナの行動実行（pat/punch/throw）
function applyFuranaActionTo(w: WorldState, n: NpcState, target: Chibiwafu, punchR: number, throwR: number) {
  const action = Math.random();

  if (action < throwR) {
    // ぶん投げ：遠くへぶっ飛ばす（250-450px）。50% 川へ / 50% ランダム遠投
    n.state = 'angry';
    n.stateTimer = 1.8;
    spawnBubble(w.bubbles, n.pos, pickLine(FURANA_LINES_THROW), 'npc-speech', 1.8);
    spawnBubble(w.bubbles, { x: n.pos.x, y: n.pos.y - 20 }, '💨', 'stomp', 0.7);
    pushNpcLife(n, Math.floor(w.timeSec), `${target.name} をぶん投げた（機嫌${Math.round(n.mood)}）`);

    const startPos = { x: target.pos.x, y: target.pos.y };
    // 目的地：50% 川 / 50% ランダム遠投
    let landX: number, landY: number;
    if (Math.random() < 0.5) {
      const dir = target.pos.x < w.bounds.w / 2 ? 1 : -1;
      landX = Math.max(40, Math.min(w.bounds.w - 40, target.pos.x + dir * (250 + Math.random() * 150)));
      landY = 430 + Math.random() * 40;
      pushLife(target, Math.floor(target.ageSec), 'フラナに川へぶん投げられた');
    } else {
      const ang = Math.random() * Math.PI * 2;
      const dist = 280 + Math.random() * 170;
      landX = Math.max(40, Math.min(w.bounds.w - 40, target.pos.x + Math.cos(ang) * dist));
      landY = Math.max(40, Math.min(400, target.pos.y + Math.sin(ang) * dist));
      pushLife(target, Math.floor(target.ageSec), 'フラナにぶん投げられた');
    }
    target.target = null;
    // 発射点のエフェクト
    spawnBubble(w.bubbles, startPos, '💫', 'stomp', 0.6);
    spawnBubble(w.bubbles, target.pos, 'とんでるわふ〜！', 'speech', 1);
    // 飛行起動：飛行時間は固定 0.55 秒、距離から速度が直接決まる。
    // これで遠くに投げるほど同じ時間内により速く飛ぶ（見た目にも迫力）
    const flightSec = 0.55;
    const vx = (landX - startPos.x) / flightSec;
    const vy = (landY - startPos.y) / flightSec - 90 * flightSec;  // 軽い弧
    const throwDmg = n.mood < 25 ? 10 + Math.floor(Math.random() * 10) : 4 + Math.floor(Math.random() * 6);
    setState(target, 'surprised', flightSec + 0.3);
    launchFlight(target, vx, vy, flightSec, throwDmg, 'cocoon_abuse');
    return;
  }

  if (action < throwR + punchR) {
    // パンチ／キック。機嫌低いほど痛い。
    n.state = 'angry';
    n.stateTimer = 1.5;
    spawnBubble(w.bubbles, n.pos, pickLine(FURANA_LINES_ANGRY), 'npc-speech', 1.8);
    // dmg 基本 6-14、mood が 40 以下なら +4〜+8（本気ブチギレ）
    let dmg = 6 + Math.floor(Math.random() * 9);
    if (n.mood < 40) dmg += 4 + Math.floor(Math.random() * 5);
    setState(target, 'hurt', 1.3);
    spawnBubble(w.bubbles, target.pos, 'ぎゃーわふ！', 'speech', 1.2);
    pushLife(target, Math.floor(target.ageSec), `フラナ(機嫌${Math.round(n.mood)})に殴られた`);
    pushNpcLife(n, Math.floor(w.timeSec), `${target.name} を殴った（機嫌${Math.round(n.mood)}）`);
    damageChibi(w, target, dmg, 'cocoon_abuse');
    return;
  }

  // 撫で（soft "めっ"）。機嫌良い時しかやらない。
  spawnBubble(w.bubbles, n.pos, pickLine(FURANA_LINES_PAT), 'npc-speech', 1.6);
  setState(target, 'hurt', 0.8);
  spawnBubble(w.bubbles, target.pos, 'きゃんわふ！', 'speech', 1.1);
  pushLife(target, Math.floor(target.ageSec), 'フラナにめっされた');
  pushNpcLife(n, Math.floor(w.timeSec), `${target.name} をめっした`);
}

// イベント発生時にフラナの機嫌を下げる
function dampenFuranaMood(w: WorldState, amount: number) {
  const f = w.npcs.find((n) => n.id === 'furana');
  if (f) f.mood = Math.max(0, f.mood - amount);
}

// フラナが死ぬとちびわふ界は地獄。出産停止＋パニック継続。
export function isFuranaAlive(w: WorldState): boolean {
  const f = w.npcs.find((n) => n.id === 'furana');
  return !!f && !f.dead;
}

// フラナがプレイヤーに掴まれて動いてる間、mama 高めの子が全力で追いかける。
// tickWorld で furanaGrabbedTimer が >0 の時に呼ばれる。
function applyFuranaChaseBehavior(w: WorldState) {
  const furana = w.npcs.find((n) => n.id === 'furana');
  if (!furana || furana.dead) return;
  for (const c of w.chibis) {
    if (!isAlive(c)) continue;
    if (c.params.mama < 45) continue;
    // 距離が遠ければ追跡 target を上書き
    const d = distance(c.pos, furana.pos);
    if (d > 20 && (c.state === 'idle' || c.state === 'surprised')) {
      c.target = {
        x: furana.pos.x + (Math.random() - 0.5) * 20,
        y: furana.pos.y + (Math.random() - 0.5) * 14,
      };
    }
    // 低頻度で "ママー！まって！" の悲痛な叫び
    if (Math.random() < 0.006) {
      const line = pickLine(['ママー！', 'まってわふ！', 'おいていかないでわふ！', 'どこいくのわふ！？', 'ママぁぁ！']);
      spawnBubble(w.bubbles, c.pos, line, 'speech', 1.3);
      if (c.state === 'idle') setState(c, 'cry', 1);
    }
  }
}

// パニック：フラナが死んで以降、ちびわふは徐々に心が折れる。
// 毎 tick 小確率で cry 状態、低確率で mama_lost 死亡。
// mama 高い子は死体に寄り添いに行く。
function applyFuranaLossPanic(w: WorldState, dt: number) {
  if (isFuranaAlive(w)) return;
  const furanaCorpse = w.npcs.find((x) => x.id === 'furana');
  for (const c of w.chibis) {
    if (!isAlive(c)) continue;
    // 50秒に 1度くらい cry 誘発、長引く
    if (c.state !== 'cry' && Math.random() < 0.003) {
      setState(c, 'cry', 2.5);
      if (Math.random() < 0.5) {
        const line = Math.random() < 0.5 ? 'ママいないわふ…' : 'ママどこわふ！？';
        spawnBubble(w.bubbles, c.pos, line, 'speech', 1.8);
      }
    }
    // ママ寄り添い：mama > 55 の子はフラナ死体に歩み寄る
    if (furanaCorpse && c.state === 'idle' && c.params.mama > 55) {
      const d = distance(c.pos, furanaCorpse.pos);
      if (d > 24 && Math.random() < 0.012) {
        // ママの側へ歩き出す（wanderStep が次の tick で走る）
        c.target = {
          x: furanaCorpse.pos.x + (Math.random() - 0.5) * 40,
          y: furanaCorpse.pos.y + (Math.random() - 0.5) * 24,
        };
      } else if (d <= 24 && Math.random() < 0.006) {
        // 近くに来てる：寄り添って泣く
        setState(c, 'cry', 3);
        const line = pickLine(['ママ…', 'おきてよママ…', 'ままぁ…わふ', 'どうしてわふ…', 'さみしいわふ…']);
        spawnBubble(w.bubbles, c.pos, line, 'speech', 2);
        pushLife(c, Math.floor(c.ageSec), 'ママの死体に寄り添った');
      }
    }
    // 低確率で心折れ死（大体 60-120 秒に 1体くらい、全体）
    // 個体の mama param が高いほど折れやすい
    const brokenRate = 0.00008 * (1 + c.params.mama * 0.03);
    if (Math.random() < brokenRate * dt * 20) {  // dt*20 で tick 補正
      kill(w, c, 'mama_lost');
    }
  }
  void dt;
}

function updateCocoonAbuse(w: WorldState, n: NpcState, dt: number) {
  n.abuseCooldown -= dt;
  if (n.abuseCooldown > 0) return;
  const candidates = w.chibis.filter((c) => isAlive(c) && distance(c.pos, n.pos) < 90);
  if (candidates.length === 0) {
    n.abuseCooldown = 0.6;
    return;
  }
  // 特性でターゲット優先度を重み付け：
  //   心配性は狙われやすい、戦闘狂は絡みに行くので衝突率↑
  const weights = candidates.map((c) => {
    if (c.traits.includes('shinpai')) return 2.0;
    if (c.traits.includes('ikusa')) return 1.5;
    return 1.0;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  let target: Chibiwafu | undefined;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) { target = candidates[i]!; break; }
  }
  if (!target) return;
  // CD 短めで、頻繁に叩く
  n.abuseCooldown = 2 + Math.random() * 2;
  spawnBubble(w.bubbles, n.pos, pickLine(COCOON_LINES_ABUSE), 'npc-speech', 1.8);
  setState(target, 'cry', 1);
  pushLife(target, Math.floor(target.ageSec), 'ココンに棒で突かれた');
  pushNpcLife(n, Math.floor(w.timeSec), `${target.name} を棒で突いた`);

  // 包囲カウンター：ココン周辺に 4匹以上いると 20% で逆襲され死亡
  if (candidates.length >= 4 && Math.random() < 0.2) {
    killCocoon(w, n);
    for (const c of candidates.slice(0, 5)) {
      pushLife(c, Math.floor(c.ageSec), 'ココンをみんなで倒した');
    }
    return;
  }

  // 戦闘狂相手：70% で絡みが発生。そのうち 25% はココンが負けて死ぬ。
  if (target.traits.includes('ikusa') && Math.random() < 0.7) {
    if (Math.random() < 0.25) {
      killCocoon(w, n);
      pushLife(target, Math.floor(target.ageSec), 'ココンを返り討ちにした');
      return;
    }
    kill(w, target, 'ikusa_taezetsu');
    return;
  }
  if (Math.random() < 0.35) {
    kill(w, target, 'cocoon_abuse');
  }
}

function killCocoon(w: WorldState, n: NpcState) {
  n.dead = true;
  n.respawnTimer = 30 + Math.random() * 20;
  spawnBubble(w.bubbles, n.pos, pickLine(COCOON_DEATH_LINES), 'npc-speech', 2.5);
  const suzu = w.npcs.find((x) => x.id === 'suzu');
  if (suzu && !suzu.dead) spawnBubble(w.bubbles, suzu.pos, 'ココン！？', 'npc-speech', 2);
}

function reactNpcsToBirth(w: WorldState) {
  const suzu = w.npcs.find((n) => n.id === 'suzu');
  if (!suzu || suzu.dead) return;
  if (Math.random() < 0.3) {
    spawnBubble(w.bubbles, suzu.pos, pickLine(SUZU_LINES_BIRTH), 'npc-speech', 2);
  }
}

// 変な死に方と判定する死因（哲学・境界消失・奇妙な事故）。
// フラナがびっくり反応（state='surprised'）を出す対象。
// 神様 (プレイヤー) 系とフラナ自身の暴行 (cocoon_abuse) は "よく起きる暴力" 扱いで除外、
// フラナが自分の行動に対して驚かないようにする。
const WEIRD_DEATH_CAUSES = new Set<DeathCauseId>([
  'philosophy', 'tetsugakusha_shoushitsu', 'ukiyo_shoushitsu',
  'bouken_cliff', 'tabikko_boundary', 'bo_meijin_tenka',
  'taiko_tobikomi',
]);

function reactNpcsToDeath(w: WorldState, c: Chibiwafu) {
  const weird = c.deathCauseId != null && WEIRD_DEATH_CAUSES.has(c.deathCauseId as DeathCauseId);
  for (const n of w.npcs) {
    if (n.dead) continue;
    const def = NPC_DEFS[n.id];
    // フラナは特別扱い：ほぼ毎回追悼コメント、変な死に方なら驚く
    if (n.id === 'furana') {
      if (weird) {
        n.state = 'surprised';
        n.stateTimer = 1.2;
        spawnBubble(w.bubbles, n.pos, pickLine(FURANA_LINES_WEIRD_DEATH), 'npc-speech', 2.2);
      } else if (Math.random() < 0.45) {
        spawnBubble(w.bubbles, n.pos, pickLine(FURANA_LINES_DEATH_REACTION), 'npc-speech', 2);
      }
      continue;
    }
    if (!def.reactOnDeath) continue;
    if (Math.random() < 0.35) {
      const pool = n.id === 'suzu' ? SUZU_LINES_DEATH : COCOON_LINES_DEATH;
      spawnBubble(w.bubbles, n.pos, pickLine(pool), 'npc-speech', 2);
    }
  }
}

function reactNpcsToOndo(w: WorldState) {
  for (const n of w.npcs) {
    if (n.dead) continue;
    if (!NPC_DEFS[n.id].reactOnOndo) continue;
    spawnBubble(w.bubbles, n.pos, pickLine(SUZU_LINES_ONDO), 'npc-speech', 2.2);
  }
}

// --- Corpse stomp gag -----------------------------------------------------

// 労働ループ：障害物の近くに居るちびわふが HP を削る。破壊で木材/石材が増える。
// 全障害物が消えた荒地プロットは cleared に昇格（devLevel 1）。
const OBSTACLE_DROPS: Record<ObstacleKind, 'wood' | 'stone'> = {
  rock: 'stone',
  stump: 'wood',
  bush: 'wood',
};
const OBSTACLE_DROP_AMOUNT: Record<ObstacleKind, number> = {
  rock: 2,
  stump: 2,
  bush: 1,
};
function updateLabor(w: WorldState, dt: number) {
  if (w.obstacles.length === 0) return;
  for (const obs of w.obstacles) {
    // 18px 以内のちびわふ（活動可能な状態のみ）をカウント
    let workers = 0;
    for (const c of w.chibis) {
      if (!isAlive(c)) continue;
      if (c.state === 'sleep' || c.state === 'dead' || c.state === 'hurt') continue;
      if (distance(c.pos, obs.pos) > 18) continue;
      workers++;
      // 作業中のちびわふは空腹・疲労が早める（ちびわふ側に直接加算）
      c.fatigue += dt * 0.25;
      c.hunger += dt * 0.10;
    }
    if (workers === 0) continue;
    // ちびわふ 1 人あたり 0.5 HP/秒（くそざこ）。多いほど速く片付く
    obs.hp -= dt * 0.5 * workers;
    // バブル：作業中の気配（5% * workers / 秒）
    if (Math.random() < dt * 0.5 * workers) {
      const near = w.chibis.find((c) => isAlive(c) && distance(c.pos, obs.pos) < 18);
      if (near) {
        const line = obs.kind === 'rock' ? 'えいっわふ' : obs.kind === 'stump' ? 'ぬくわふ！' : 'むしるわふ';
        spawnBubble(w.bubbles, near.pos, line, 'speech', 0.8);
      }
    }
  }
  // 破壊判定
  const cleared = w.obstacles.filter((o) => o.hp <= 0);
  if (cleared.length > 0) {
    for (const c of cleared) {
      const drop = OBSTACLE_DROPS[c.kind];
      w.resources[drop] += OBSTACLE_DROP_AMOUNT[c.kind];
      // プロットの workSec を累積
      const plot = w.plots.find((p) => p.id === c.plotId);
      if (plot) plot.workSec += 5;
    }
    w.obstacles = w.obstacles.filter((o) => o.hp > 0);
    // 荒地プロット内の障害物が尽きたら cleared に昇格
    for (const p of w.plots) {
      if (p.kind !== 'wasteland') continue;
      const remaining = w.obstacles.filter((o) => o.plotId === p.id).length;
      if (remaining === 0) {
        p.kind = 'cleared';
        p.devLevel = 1;
      }
    }
  }
}

function updateStomps(w: WorldState, dt: number) {
  if (w.corpses.length === 0) return;
  // sparse sampling: 5% of frames only checks
  if (Math.random() > 0.05) return;
  const c = w.chibis[Math.floor(Math.random() * w.chibis.length)];
  if (!c || !isAlive(c)) return;
  const corpse = w.corpses[Math.floor(Math.random() * w.corpses.length)];
  if (!corpse) return;
  if (distance(c.pos, corpse.pos) < 14) {
    if (Math.random() < 0.5 * dt * 20) {
      spawnBubble(w.bubbles, corpse.pos, 'ぺちっ', 'stomp', 0.8);
      w.stompCount += 1;
    }
  }
}

export function tickWorld(w: WorldState, dt: number) {
  w.tick += 1;
  w.timeSec += dt;
  const prevSeason = w.season;
  const prevPhase = w.dayPhase;
  w.season = seasonFromTime(w.timeSec, w.secondsPerSeason);
  w.dayProgress = dayProgress(w.timeSec, CONFIG.SECONDS_PER_DAY);
  w.dayPhase = phaseFromProgress(w.dayProgress);
  w.dayCount = 1 + Math.floor(w.timeSec / CONFIG.SECONDS_PER_DAY);
  // 位相境界で NPC リアクション（朝礼／夜の静まり）
  if (w.dayPhase !== prevPhase) onPhaseChange(w, prevPhase, w.dayPhase);
  // 累計ポイントから村Lv を再計算。Lv 上昇でワールドが広がる。
  const prevLv = w.villageLv;
  w.villageLv = villageLvFromPoints(w.totalPointsEarned);
  if (w.villageLv !== prevLv) {
    w.bounds = effectiveBoundsFor(w.villageLv);
  }
  w.villageRank = computeRank(rankContext(w));
  applyBuildingMods(w);
  spawnIfRoom(w);
  maybeStartTaikoFestival(w);
  maybeTriggerBokaigi(w, dt);
  scheduleEvents(w, dt);
  resolveEvent(w, dt);
  const hazards = getActiveHazards(w);
  for (const c of w.chibis) updateChibi(w, c, dt, hazards);
  if (w.furanaGrabbedTimer > 0) {
    w.furanaGrabbedTimer = Math.max(0, w.furanaGrabbedTimer - dt);
    applyFuranaChaseBehavior(w);
  }
  processChats(w, dt);
  compactCorpses(w);
  updateNpcs(w, dt);
  applyFuranaLossPanic(w, dt);
  updateLabor(w, dt);
  updateInfra(w, dt);
  updateStomps(w, dt);
  updateBubbles(w.bubbles, dt);
  if (w.bokaigiMarkerTimer > 0) w.bokaigiMarkerTimer = Math.max(0, w.bokaigiMarkerTimer - dt);
  w.lastSeason = prevSeason;
  w.lastDayPhase = prevPhase;
}

// 位相境界で発火する小イベント（朝礼・夜の寝静まり・夕の呼び戻し）
function onPhaseChange(w: WorldState, prev: DayPhase, next: DayPhase) {
  const suzu = w.npcs.find((n) => n.id === 'suzu');
  if (next === 'morning') {
    // 朝はフラナの気分がリセット気味に（+10 mood）
    const f = w.npcs.find((n) => n.id === 'furana');
    if (f && !f.dead) f.mood = Math.min(100, f.mood + 10);
    // 朝礼：スズが全員を起こす
    if (suzu && !suzu.dead) {
      spawnBubble(w.bubbles, suzu.pos, 'あさだよ〜！', 'npc-speech', 2.6);
    }
    // 寝ているちびわふを idle に戻す（目覚めバブル）
    for (const c of w.chibis) {
      if (c.state === 'sleep' && isAlive(c)) {
        setState(c, 'idle', 0.5);
        if (Math.random() < 0.3) spawnBubble(w.bubbles, c.pos, 'おはようわふ', 'speech', 1.2);
      }
    }
  } else if (next === 'evening') {
    // 夕暮れ：お腹が空いた雰囲気
    if (suzu && !suzu.dead && Math.random() < 0.6) {
      spawnBubble(w.bubbles, suzu.pos, 'ゆうはんのじかんだよ〜', 'npc-speech', 2.4);
    }
  } else if (next === 'night') {
    // 夜の挨拶：ランダムで寝入る子を出す
    if (suzu && !suzu.dead && Math.random() < 0.6) {
      spawnBubble(w.bubbles, suzu.pos, 'よるだよ、ねんねしよ', 'npc-speech', 2.4);
    }
  }
  void prev;
}

export function buildingCost(w: WorldState, defId: string): number {
  const def = BUILDINGS[defId];
  if (!def) return Infinity;
  const count = w.buildings.filter((b) => b.defId === defId).length;
  return Math.round(def.cost * Math.pow(def.costGrowth, count));
}

export function rankContext(w: WorldState): RankContext {
  return {
    totalDeaths: w.totalDeaths,
    uniqueDexFound: uniqueDexFound(w),
    stompCount: w.stompCount,
  };
}

// 指定種の建物のうち、Lv最小のものを1段階アップグレードする。
// ランクで解禁されている Lv までしか上がらない。成功時 true。
export function upgradeOne(w: WorldState, defId: string): boolean {
  const def = BUILDINGS[defId];
  if (!def) return false;
  const info = getUpgradeInfo(w, defId);
  if (!info || !info.possible || !info.target) return false;
  w.points -= info.cost;
  info.target.level += 1;
  return true;
}

export interface UpgradeInfo {
  possible: boolean;
  cost: number;
  targetLevel: number; // 成功時の新Lv
  target: PlacedBuilding | null;
  capped: boolean; // ランクのLv上限で全個体が頭打ち
}

export function getUpgradeInfo(w: WorldState, defId: string): UpgradeInfo | null {
  const def = BUILDINGS[defId];
  if (!def) return null;
  const maxLv = maxBuildingLevel(w.villageRank);
  const owned = w.buildings.filter((b) => b.defId === defId);
  if (owned.length === 0) return null;
  const upgradeable = owned.filter((b) => b.level < maxLv);
  if (upgradeable.length === 0) {
    return { possible: false, cost: 0, targetLevel: maxLv, target: null, capped: true };
  }
  upgradeable.sort((a, b) => a.level - b.level);
  const target = upgradeable[0]!;
  const cost = upgradeCostFor(def, target.level);
  return { possible: w.points >= cost, cost, targetLevel: target.level + 1, target, capped: false };
}

export function buildAt(w: WorldState, defId: string): boolean {
  const cost = buildingCost(w, defId);
  if (w.points < cost) return false;
  const def = BUILDINGS[defId];
  if (!def) return false;
  w.points -= cost;
  // 建物は type ごとに別の帯に並べる。横はワールド幅をほぼ埋めるように伸ばす。
  const typeOrder = ['noukou', 'kouba', 'hakaba', 'taiko'];
  const typeIdx = Math.max(0, typeOrder.indexOf(defId));
  const sameCount = w.buildings.filter((b) => b.defId === defId).length;
  const laneY = 300 + typeIdx * 30;
  const laneMargin = 80;
  const laneW = w.bounds.w - laneMargin * 2;
  const laneX = laneMargin + ((sameCount * 80) % laneW);
  w.buildings.push({ defId, level: 1, pos: { x: laneX, y: laneY } });
  return true;
}

export function uniqueDexFound(w: WorldState): number {
  return Object.values(w.dex).filter((d) => d.count > 0).length;
}

export function totalDexCount(): number {
  return SEASONS.length > 0 ? Object.keys(DEATH_CAUSES).length : 0;
}

export { resetIdCounter, peekNextId };
