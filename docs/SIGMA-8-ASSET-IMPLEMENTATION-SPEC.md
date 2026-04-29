# Sigma-8 Asset Implementation Spec v1

この仕様書は、ChatGPT 生成済みの Sigma-8 visual asset を実装へ渡すための正本。
画風判断は `docs/sigma-8-mockup.png`、実装対象素材は `public/` 配下の v1/v2 画像を参照する。

## 目的

現スクショの弱点である「緑の板感」「崖の縦線反復」「小物密度不足」「feature が記号っぽい」
を、素材差し替えと配置密度で改善する。

この段階では pixel-perfect な最終素材ではなく、M2.1/M2.2 で見た目を一段上げるための
実装基準素材として扱う。実装後のスクショを見て、必要セルだけ再生成する。

## Asset Files

| 種別 | Raw | 実装参照 | 用途 |
|---|---|---|---|
| Terrain atlas v2 | `public/terrain/sigma8_terrain_atlas_v2_raw.png` | `public/terrain/sigma8_terrain_atlas_v2_1024.png` | 地表、崖、坂、水際 |
| Ground props v1 | `public/props/sigma8_ground_props_v1_raw.png` | `public/props/sigma8_ground_props_v1_1024.png` | 草、石、低木、工事小物 |
| Feature sprites v1 | `public/features/sigma8_feature_sprites_v1_raw.png` | `public/features/sigma8_feature_sprites_v1_1024.png` | 家、畑、水源、井戸、塔など |

Raw は生成物そのまま。実装参照版は 1024x1024 にリサイズ済み。
4x4 grid として扱い、1 cell = 256x256 px。

## Important Caveats

- 生成画像は RGB PNG。props/features は透明PNGではない。
- 実装でそのままビルボードに貼ると背景矩形が出る可能性が高い。
- props/features は先にセル切り出しし、背景抜きまたは alpha mask 化する。
- Terrain atlas は地表テクスチャとしてそのまま試してよいが、セル境界のにじみ確認が必要。
- `texture.repeat` で強く繰り返すより、tile ごとに UV を atlas cell へ張る運用を優先する。

## Terrain Atlas v2 Cell Map

File: `public/terrain/sigma8_terrain_atlas_v2_1024.png`

Grid coordinate は `(col,row)`、左上が `(0,0)`。

| Cell | Coord | Name | Implementation |
|---|---:|---|---|
| 1 | `(0,0)` | grass meadow | `TerrainMaterial.grass` top |
| 2 | `(1,0)` | worn soil | `TerrainMaterial.soil` top |
| 3 | `(2,0)` | sand | `TerrainMaterial.sand` top |
| 4 | `(3,0)` | snow | `TerrainMaterial.snow` top |
| 5 | `(0,1)` | rocky ground | `TerrainMaterial.rock` top |
| 6 | `(1,1)` | shallow water | water overlay / sea top trial |
| 7 | `(2,1)` | wet mud | high `wetness` / `mud` visual |
| 8 | `(3,1)` | cut-earth construction | active terraform job tile |
| 9 | `(0,2)` | cliff grass-over-soil | default cliff wall side |
| 10 | `(1,2)` | cliff rock | rock cliff wall side |
| 11 | `(2,2)` | damp cliff lower edge | cliff wall near water / shadow variant |
| 12 | `(3,2)` | ramp NS | ramp `N`/`S` top, UV flip allowed |
| 13 | `(0,3)` | ramp EW | ramp `E`/`W` top, UV flip/rotate allowed |
| 14 | `(1,3)` | grass-soil transition | M3 blend edge, M2 optional |
| 15 | `(2,3)` | shoreline | M2.2 water edge / coast tile |
| 16 | `(3,3)` | waterfall/ledge water | M2.2 waterfall / height water FX |

### Terrain Implementation Rules

- Replace current `MAT_CELL` with the top material cells above.
- Replace `CLIFF_CELL` with cell 9 by default.
- Use cell 10 when either adjacent tile material is `rock`.
- Use cell 11 when the lower adjacent tile has `waterLevel >= 0.35` or `isSea`.
- Use cells 12/13 for ramp top surfaces.
- Keep current 1 px UV inset or stronger. Texture bleeding at atlas cell boundaries is unacceptable.

## Ground Props v1 Cell Map

File: `public/props/sigma8_ground_props_v1_1024.png`

| Cell | Coord | Name | Suggested Feature |
|---|---:|---|---|
| 1 | `(0,0)` | small grass tuft | random grass prop |
| 2 | `(1,0)` | tall wild grass | random grass prop |
| 3 | `(2,0)` | flower patch | random flower prop |
| 4 | `(3,0)` | low bush | random shrub prop |
| 5 | `(0,1)` | sapling/shrub | random shrub prop |
| 6 | `(1,1)` | mushroom cluster | seasonal prop |
| 7 | `(2,1)` | pebbles | rock/sand prop |
| 8 | `(3,1)` | mossy rock | rock prop |
| 9 | `(0,2)` | stump | obstacle/decor prop |
| 10 | `(1,2)` | fallen log | obstacle/decor prop |
| 11 | `(2,2)` | dirt mound | terraform decor |
| 12 | `(3,2)` | dug patch | terraform decor |
| 13 | `(0,3)` | stakes and rope | active construction marker |
| 14 | `(1,3)` | shovel/pickaxe | active construction marker |
| 15 | `(2,3)` | crate/resource pile | construction/resource marker |
| 16 | `(3,3)` | signpost | path/marker prop |

### Ground Prop Placement Rules

- Props should be `InstancedMesh` or batched sprites, not individual DOM.
- Density target: visible but not noisy. Start at 4-7% of dry grass/soil tiles.
- Do not place props on:
  - `isSea`
  - `waterLevel >= 0.20`
  - active ramp tiles
  - building/feature footprint
  - active terraform job center, except construction marker cells 11-15.
- Use deterministic placement seeded by tile coordinate and `terrainSeed`, so props do not flicker.
- Add small random rotation/scale only if it preserves billboard readability.

## Feature Sprites v1 Cell Map

File: `public/features/sigma8_feature_sprites_v1_1024.png`

| Cell | Coord | Feature Kind |
|---|---:|---|
| 1 | `(0,0)` | `house` level 1 |
| 2 | `(1,0)` | `house` level 2+ |
| 3 | `(2,0)` | `farm` dry/basic |
| 4 | `(3,0)` | `farm` irrigated |
| 5 | `(0,1)` | `water` source |
| 6 | `(1,1)` | `well` |
| 7 | `(2,1)` | `firewatch` |
| 8 | `(3,1)` | `sawmill` |
| 9 | `(0,2)` | `shrine` |
| 10 | `(1,2)` | `kiln` |
| 11 | `(2,2)` | `generator` |
| 12 | `(3,2)` | `streetlamp` |
| 13 | `(0,3)` | `powerline` |
| 14 | `(1,3)` | `pasture` |
| 15 | `(2,3)` | `loom` |
| 16 | `(3,3)` | generic construction/ramp site |

### Feature Sprite Rules

- Replace procedural placeholder geometry gradually, feature by feature.
- Sprite should be Y-axis billboard or a flat tilted card matching current camera.
- Preserve hit testing via existing feature ids. Do not replace gameplay objects.
- Use devLevel:
  - `devLevel < 2`: show cell 16 or construction overlay.
  - `devLevel >= 2`: show feature-specific cell.
  - `farm` with `watered/saturated`: prefer cell 4.
  - `house` level 2+: prefer cell 2.
- Keep contact shadow under sprites. This matters more than sprite detail.

## Implementation Priority

1. Terrain atlas v2 top materials + cliff cells.
2. Terraform job visual: cut-earth cell + construction props 11-15.
3. Ground props random placement on grass/soil/rock.
4. Feature sprites for `house`, `farm`, `water`, `well`, `firewatch`, `sawmill`.
5. Remaining feature sprites.
6. Water edge / waterfall cells after terrain screenshot review.

## Acceptance Criteria

- Far zoom no longer reads as a flat green board.
- Cliff faces no longer look like repeated dark vertical stripes.
- Active cut-earth/terraform jobs are readable without oversized text labels.
- Feature buildings are recognizable from zoom 0.6.
- Chibiwafu remain the visual focus; props must not compete with character silhouettes.
- `npm run typecheck`, `npm run test`, `npm run build` pass after integration.

## Claude Handoff Prompt

Use this when asking Claude to implement the asset integration:

```text
Implement Sigma-8 visual asset integration using docs/SIGMA-8-ASSET-IMPLEMENTATION-SPEC.md as the source of truth.

Scope:
1. Load public/terrain/sigma8_terrain_atlas_v2_1024.png and update terrain material/cliff/ramp cell mapping.
2. Add a deterministic ground prop sprite system using public/props/sigma8_ground_props_v1_1024.png.
3. Add feature sprite rendering using public/features/sigma8_feature_sprites_v1_1024.png for at least house/farm/water/well/firewatch/sawmill.

Constraints:
- Do not change gameplay rules.
- Preserve current hit testing and feature ids.
- Props/features sheets are RGB, not transparent; if used directly, implement safe alpha/keying or first create processed transparent cell sprites.
- Keep changes incremental. Typecheck/test/build must pass.
```
