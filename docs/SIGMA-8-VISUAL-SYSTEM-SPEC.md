# Sigma-8 Visual System Spec

この文書は、くそざこ村の画面を「素材の寄せ集め」ではなく、
ゲームルールが見た目で読める画面にするための上位仕様。

`SIGMA-8-VISUAL-ASSET-ROADMAP.md` はこの文書の下位に置く。
アセットは、ここで定義した表示状態を埋めるためにだけ生成する。

## 結論

いま不足しているのはアセット枚数だけではない。

- 表示状態の定義
- ルールと見た目の対応
- 描画レイヤー
- UI 上のリスク表現
- 死因/発言の因果

がまだ弱い。

したがって、次は素材生成より先に **表示システムを固定する**。
素材生成は `Cliff / Water / Worksite` のように、表示スロットが決まった部分だけ行う。

## Design Principle

### 1. Visual = Rule = Behavior

プレイヤーが画面を見て予測したことと、A* / 水流 / 死因 / 工事が一致すること。

悪い例:

- 登れそうな斜面に見えるのに通れない
- 浅そうな水に見えるのに即死
- 数字では工事中だが、見た目は完成済み
- 死因が火事なのに、画面に火や煙がない

良い例:

- 高さ差 2 段以上は必ず崖壁が見える
- deep water は濃い水面 + 岸泡 + 進入不可
- ramp 工事中は土、板、縄、作業者で読める
- 火事死は煙、火、熱源、危険 HUD と紐づく

### 2. Code First, Asset Second

コードで表現すべきもの:

- 位置、範囲、方向、明暗 variation
- 水位段階、流れ方向、危険判定
- UI 状態、tooltip、preview
- props の配置密度と deterministic placement

素材で表現すべきもの:

- 崖壁面の質感
- 水際、泡、滝、泥濁り
- 工事小物、坂道工事、切り土跡
- 建物/feature の識別可能な外形
- ちびわふ/フラナのポーズ

### 3. No Asset Without State Slot

次を満たさない素材は作らない。

- どの world state から表示されるか決まっている
- どの render layer に入るか決まっている
- どの gameplay rule と対応するか決まっている
- 実機スクショで検品する条件が決まっている

## Render Layer Contract

描画順を固定する。後から素材を増やしてもこの順序を崩さない。

| Layer | 内容 | 実装方針 |
|---:|---|---|
| 0 | world backdrop / far sea | 大判低地 plane。clear color へ頼らない |
| 1 | terrain top | atlas lookup per tile |
| 2 | cliff wall / cliff bottom shadow / corner | InstancedMesh。variant / edge / shadow を持つ |
| 3 | water surface / shoreline / waterfall | waterLevel / flow / elev diff 由来 |
| 4 | terrain state overlays | wetness / mud / snow / landslide scar / cut-earth |
| 5 | ground props | deterministic low-density props |
| 6 | features / buildings | sprite or 3D group。hit target は feature id 維持 |
| 7 | construction overlays | planned / material / working / blocked |
| 8 | chibiwafu / Furana / corpses / wolves | 常に主役。props より読めること |
| 9 | particles / weather FX | rain, snow, dust, splash, smoke |
| 10 | HTML UI | HUD, panel, toolbar, log, tooltip |

## Terrain / Height States

| State | Game Condition | Movement | Visual | Code | Asset | Priority |
|---|---|---|---|---|---|---|
| flat tile | same elev | pass cost 1.0 | material top tile | current terrain atlas | current v2 | high |
| one-step edge | abs diff = 1 step, no ramp | chibi blocked / Furana costly | small ledge hint, not slope | edge highlight optional | none yet | medium |
| impassable cliff | abs diff >= 2 steps | blocked | vertical cliff wall + bottom shadow | cliff wall IM | cliff variants v2 | highest |
| soil cliff | cliff, upper material grass/soil | blocked | brown wall with grass lip | variant selection | cliff variants v2 | highest |
| rock cliff | either side rock | blocked | rock wall | variant selection | cliff variants v2 | high |
| wet cliff | lower tile water/deep wet | blocked | darker damp lower edge | lower-neighbor rule | cliff variants / water edge | high |
| cliff corner | edge turn or isolated cliff | blocked | corner cap / shadow | edge topology pass | cliff variants v2 | medium |
| landslide scar | recent collapse | risky | exposed soil streak / dust | terrain event memory | worksite or cliff scar | medium |
| ramp complete | ramp != null and valid | pass cost 1.8 | explicit sloped tile | current ramp UV | atlas v2 | high |
| ramp invalid | ramp exists but no valid 1 step edge | blocked | warning tint / broken ramp | validation pass | worksite props | medium |

Decision:

- `ELEV_STEP=25` remains the gameplay step for now.
- Visual height can be tuned with `ELEV_SCALE`.
- Do not introduce smooth free slopes.

## Water / Hydrology States

| State | Game Condition | Movement / Death | Visual | Code | Asset | Priority |
|---|---|---|---|---|---|---|
| dry | waterLevel < 0.05 | normal | normal terrain | existing | none | high |
| wet | 0.05 <= wl < 0.20 | cost small, no drown | darkened ground, small shine | vertex tint | optional wet FX | high |
| mud | mud >= 0.25 | slower, slip risk | brown smeared overlay | tint + state overlay | mud edge FX | high |
| puddle | 0.20 <= wl < 0.35 | passable, risk low | shallow blue patch | water IM | water edge FX | high |
| shallow water | 0.35 <= wl < 0.70 | chibi blocked / drown risk | blue water + shoreline | passability mask | shoreline FX | highest |
| deep water | wl >= 0.70 | blocked / high drown risk | dark water + stronger edge | water IM tier | shoreline / foam | highest |
| flowing water | channel/gradient flow > threshold | may push / carry | direction ripple / streak | hydrology flow vector | water FX | high |
| waterfall | adjacent elev diff >= 1 step and water crosses edge | dangerous | vertical strip + splash bottom | edge pass | waterfall FX | high |
| flood danger | many blocked water tiles / rising risk | HUD warning | pulse shimmer + HUD | risk aggregation | flood shimmer | medium |
| sea | isSea | blocked / boundary | tile sea surface + backdrop | seaTileIM | current / shoreline | high |

Decision:

- Water visual must be derived from `waterLevel`, `isSea`, `flow`, and adjacent elev.
- Water death causes should only happen where the screen visibly reads as dangerous water.

## Weather / Season States

| State | Game Condition | Gameplay | Visual | Code | Asset | Priority |
|---|---|---|---|---|---|---|
| clear | weather clear | baseline | bright, readable | current tint | none | high |
| rain | rain/heavy_rain | wetness rise | rain lines, wet tiles | particles + wetness | rain rings optional | high |
| storm | storm | flood/collapse risk | darker sky, heavier rain, HUD alert | particles + risk | flood shimmer | high |
| snow | snow | snowCoverage rise | white overlay, softened edges | tint + snowCoverage | snow edge optional | medium |
| blizzard | blizzard | cold/fatigue risk | low contrast but readable | tint + particle | snow FX | medium |
| drought | drought | food/water stress | dry/yellow tint, low water | phase tint | dry prop optional | medium |
| heatwave | heatwave | heat death risk | warm haze, not orange void | tint + HUD | heat shimmer optional | medium |
| night | dayPhase night | sleep/wolf risk | lamps visible, terrain still readable | light/tint | lamp sprite | high |

Decision:

- Weather should never make terrain rules unreadable.
- Night should be darker but not visually dead.

## Construction / Terraform States

| State | Game Condition | Gameplay | Visual | Code | Asset | Priority |
|---|---|---|---|---|---|---|
| planned | job queued, no worker/material | pending | stake/outline ghost | job marker | worksite props | high |
| material delivered | resources reserved | ready | crate/soil/stone pile | job state | worksite props | medium |
| under construction | worker near job | progress | animated worker + dirt/rope | job progress | worksite props + poses | highest |
| blocked | invalid terrain/path/material missing | cannot progress | red X / warning marker | validation | marker/icon | medium |
| cut-earth | lower/raise active tile | terrain changing | exposed soil patch | terrain state overlay | cut-earth cell | high |
| ramp under construction | ramp job active | future passable | half-built ramp | new ramp job | worksite props | highest |
| ramp complete | ramp valid | passable | clean ramp tile | ramp field | atlas ramp | high |
| damaged | collapse/water affects built feature | degraded | cracked/dirty overlay | feature state | damage overlay | M3 |

Decision:

- `setRampOnTile` immediate placement should become a job.
- Progress should be readable without relying on floating numeric labels.

## Features / Buildings

Feature sprites are good enough for M2.1 visual v1, but feature system still needs stronger state mapping.

| Feature State | Game Condition | Visual Requirement | Priority |
|---|---|---|---|
| unbuilt | devLevel 0 | construction footprint, not finished building | high |
| half-built | devLevel 1 | scaffold + material pile | high |
| complete | devLevel >= 2 | recognizable sprite / silhouette | high |
| working | producing / irrigated / powered | small readable activity cue | medium |
| starved | missing input | dull tint / icon in panel, not huge overlay | medium |
| dangerous | fire/flood/electric/collapse risk | local warning + HUD aggregation | high |
| disabled | blocked or broken | gray tint / broken prop | M3 |

Building / feature art should not be more detailed than chibiwafu. If a building dominates the screen, reduce scale/saturation/detail.

## Chibi / NPC Readability States

| State | Game Condition | Visual | Priority |
|---|---|---|---|
| idle / wander | no urgent target | existing pose | high |
| working terrain | near terraform/ramp/construction job | work/carry/dig pose | high |
| path blocked | A* failure / passability mismatch | confused bubble / red marker near blocked edge | medium |
| hungry | hunger high | small icon or modal stat, not constant spam | high |
| exhausted | fatigue high | tired pose | high |
| wet/cold | weather exposure | tint/pose/log when meaningful | medium |
| danger reaction | fire/flood/wolf/collapse | short bubble tied to visible cause | high |
| dead | death cause | corpse pose matching cause category | high |

Decision:

- Character pixel-art conversion is not approved yet.
- Existing 40 chibi poses remain the main asset set until a full-screen comparison proves otherwise.

## UI / HUD State Contract

UI must answer three questions:

1. What is happening now?
2. What is dangerous soon?
3. What should I do next?

| UI Element | Must Show | Source | Priority |
|---|---|---|---|
| time/weather HUD | season/day/time/weather/next phase | world time/weather | high |
| risk HUD | water/collapse/fire/food/weather danger | aggregated world metrics | highest |
| selected tool panel | current brush, cost, validity, result | tool state | high |
| build panel | feature cost, purpose, missing resources | build definitions/resources | high |
| minimap | terrain, water, danger, camera bounds | terrain/features | medium |
| log | meaningful cause/effect events only | event queue | high |
| speech bubbles | immediate local reactions | visible cause nearby | medium |

Do not use UI text to explain art direction. UI text must be gameplay information.

## Food / Survival Visual Contract

Food mechanics should not feel like invisible counters.

| State | Game Condition | Visual / UI | Priority |
|---|---|---|---|
| food stable | production >= consumption | normal food counter | high |
| food decreasing | production < consumption | trend arrow / yellow risk | high |
| food shortage | food low and population hungry | red risk HUD + hungry chibi logs | highest |
| farm dry | farm not irrigated | dry farm sprite / dull tint | high |
| farm irrigated | farm watered/saturated | irrigated farm sprite / water edge | high |
| starvation death | hunger death | cause must mention lack of food, not random gag only | high |

Decision:

- Food shortage must be visible before deaths spike.
- Hunger deaths should not feel disconnected from farm/water/weather state.

## Death / Dialogue Causality

Death and speech are part of the visual system because they explain why the screen matters.

Rule:

- Every common death should have a visible or inferable cause.
- Random absurdity is allowed only after the cause is clear.

| Cause Type | Required Visible Context |
|---|---|
| drowning | water tile / flood / river / shoreline |
| cliff fall | cliff edge / height diff / jump or push |
| fire | fire event / smoke / hot feature |
| starvation | food shortage / crop failure / HUD risk |
| exhaustion/cold | night/weather/exposure |
| construction accident | active worksite / ramp / materials |
| wolf | visible wolf / warning |
| old legacy gag | dex only or renamed to neutral cause |

Speech should be one of:

- warning: upcoming risk
- reaction: immediate visible event
- work: current job state
- need: hunger/fatigue/water/path blocked
- flavor: rare, short, not repeated

## Asset Generation Gate

Before generating any new asset batch, fill this checklist.

```text
Asset batch:
World state:
Render layer:
Gameplay rule:
Fallback code-only version:
Acceptance screenshot:
Failure condition:
```

If this cannot be filled, do not generate the asset yet.

## Immediate Implementation Targets

### Target 1: Cliff Readability

Code first:

- choose cliff cell by material and lower tile water
- add deterministic brightness variation per wall instance
- add bottom shadow strip where cliff meets lower ground/water
- add corner/cap handling if cheap

Generate only if still insufficient:

- `Cliff Wall Variants v2`

### Target 2: Water Readability

Code first:

- shoreline edge detection from water/non-water adjacency
- flow direction from hydrology gradient or channel graph
- waterfall condition from water crossing elev edge
- HUD water risk aggregation

Generate only if needed:

- `Shoreline / Waterfall FX v1`

### Target 3: Worksite Readability

Code first:

- ramp jobs instead of immediate ramp placement
- job states: planned / working / blocked / complete
- hide or shrink numeric progress when visual state is enough

Generate:

- `Worksite / Ramp Construction v1`

### Target 4: Survival Causality

Code/UI first:

- food trend and shortage warning
- hunger/fatigue/cold markers in chibi modal/HUD
- death text linked to visible state

Generate later:

- no new asset until the survival loop is readable in UI.

## Done Criteria

M2 visual system is acceptable when:

- a new player can see where chibiwafu can walk
- a new player can see what terrain is dangerous
- water risk is visible before death
- construction progress is visible before completion
- major deaths match visible world state
- props improve density without hiding chibiwafu
- camera far view no longer exposes obvious rendering hacks

