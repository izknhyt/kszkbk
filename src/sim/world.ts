import type { Chibiwafu, DayPhase, DeathCauseId, DexEntry, PlacedBuilding, Season, Vec2, VillageRank } from '../types';
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
  COCOON_DEATH_LINES,
  COCOON_LINES_ABUSE,
  COCOON_LINES_DEATH,
  COCOON_REVIVE_LINES,
  LOU_LINES,
  NPC_DEFS,
  SUZU_LINES_BIRTH,
  SUZU_LINES_DEATH,
  SUZU_LINES_ONDO,
  createNpcs,
  pickLine,
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
  pickOshaberiLine,
  pickReason,
  pickRifujinStrikerLine,
  pickRifujinVictimLine,
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
  totalDeaths: number;
  totalBirths: number;
  stompCount: number;
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
    totalDeaths: 0,
    totalBirths: 0,
    stompCount: 0,
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
  };
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
  } else {
    w.event = {
      kind: 'fire',
      duration: CONFIG.FIRE_DURATION_SEC,
      remaining: CONFIG.FIRE_DURATION_SEC,
      intensity: CONFIG.FIRE_KILL_RATE,
    };
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
  if (suzu) spawnBubble(w.bubbles, suzu.pos, '棒会議ひらくよ', 'speech', 2.2);
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
  if (suzu) spawnBubble(w.bubbles, suzu.pos, '太鼓祭〜！', 'speech', 2.5);
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

// lifeLog に1行追加。上限30件（古いものから削除）。
const LIFE_LOG_MAX = 30;
function pushLife(c: Chibiwafu, sec: number, text: string) {
  c.lifeLog.push({ sec, text });
  if (c.lifeLog.length > LIFE_LOG_MAX) c.lifeLog.shift();
}
export { pushLife };

// 出産：人口不足率に応じてインターバル短縮。空に近ければ burst 出産。
function spawnIfRoom(w: WorldState) {
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
    if (ended === 'ondo') w.ondoCooldown = computeOndoInterval(w);
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
    if (n.dead) {
      n.respawnTimer -= dt;
      if (n.respawnTimer <= 0) {
        n.dead = false;
        n.pos = { ...n.home };
        n.abuseCooldown = 4;
        spawnBubble(w.bubbles, n.pos, pickLine(COCOON_REVIVE_LINES), 'speech', 2.5);
      }
      continue;
    }
    wanderNpc(n, dt);
    if (n.id === 'cocoon') updateCocoonAbuse(w, n, dt);
    if (n.id === 'lou' && Math.random() < 0.0007) {
      spawnBubble(w.bubbles, n.pos, pickLine(LOU_LINES), 'speech', 1.6);
    }
  }
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
  spawnBubble(w.bubbles, n.pos, pickLine(COCOON_LINES_ABUSE), 'speech', 1.8);
  setState(target, 'cry', 1);
  pushLife(target, Math.floor(target.ageSec), 'ココンに棒で突かれた');

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
  spawnBubble(w.bubbles, n.pos, pickLine(COCOON_DEATH_LINES), 'speech', 2.5);
  const suzu = w.npcs.find((x) => x.id === 'suzu');
  if (suzu && !suzu.dead) spawnBubble(w.bubbles, suzu.pos, 'ココン！？', 'speech', 2);
}

function reactNpcsToBirth(w: WorldState) {
  const suzu = w.npcs.find((n) => n.id === 'suzu');
  if (!suzu) return;
  if (Math.random() < 0.3) {
    spawnBubble(w.bubbles, suzu.pos, pickLine(SUZU_LINES_BIRTH), 'speech', 2);
  }
}

function reactNpcsToDeath(w: WorldState, _c: Chibiwafu) {
  for (const n of w.npcs) {
    const def = NPC_DEFS[n.id];
    if (!def.reactOnDeath) continue;
    if (Math.random() < 0.35) {
      const pool = n.id === 'suzu' ? SUZU_LINES_DEATH : COCOON_LINES_DEATH;
      spawnBubble(w.bubbles, n.pos, pickLine(pool), 'speech', 2);
    }
  }
}

function reactNpcsToOndo(w: WorldState) {
  for (const n of w.npcs) {
    if (!NPC_DEFS[n.id].reactOnOndo) continue;
    spawnBubble(w.bubbles, n.pos, pickLine(SUZU_LINES_ONDO), 'speech', 2.2);
  }
}

// --- Corpse stomp gag -----------------------------------------------------

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
  processChats(w, dt);
  compactCorpses(w);
  updateNpcs(w, dt);
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
    // 朝礼：スズが全員を起こす
    if (suzu && !suzu.dead) {
      spawnBubble(w.bubbles, suzu.pos, 'あさだよ〜！', 'speech', 2.6);
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
      spawnBubble(w.bubbles, suzu.pos, 'ゆうはんのじかんだよ〜', 'speech', 2.4);
    }
  } else if (next === 'night') {
    // 夜の挨拶：ランダムで寝入る子を出す
    if (suzu && !suzu.dead && Math.random() < 0.6) {
      spawnBubble(w.bubbles, suzu.pos, 'よるだよ、ねんねしよ', 'speech', 2.4);
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
