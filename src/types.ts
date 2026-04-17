export type ChibiState =
  | 'idle'
  | 'cry'
  | 'surprised'
  | 'angry'
  | 'sleep'
  | 'dazed'
  | 'hurt'
  | 'exhausted'
  | 'dead';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Chibiwafu {
  id: number;
  name: string;
  birthTick: number;
  ageSec: number;
  pos: Vec2;
  target: Vec2 | null;
  state: ChibiState;
  stateTimer: number;
  deathTick: number | null;
  deathCauseId: string | null;
  speed: number;
  maxAgeSec: number;
  faceLeft: boolean;
}

export type DeathCauseId =
  | 'bokaigi'
  | 'ondo'
  | 'mudriver'
  | 'stonebread'
  | 'bridge'
  | 'fire'
  | 'roushuai'
  | 'philosophy'
  | 'summer_boil'
  | 'winter_snow'
  | 'spring_drunk'
  | 'autumn_harvest';

export interface DeathCause {
  id: DeathCauseId;
  title: string;
  template: (name: string) => string;
  rare: boolean;
  points: number;
}

export interface DexEntry {
  id: DeathCauseId;
  count: number;
  firstVictim?: string;
  firstContext?: string;
  firstDiscoveredTick?: number;
}

export interface BuildingDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  costGrowth: number;
  effect: string;
}

export interface PlacedBuilding {
  defId: string;
  level: number;
  pos: Vec2;
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
