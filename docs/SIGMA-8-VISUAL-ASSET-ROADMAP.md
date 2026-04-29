# Sigma-8 Visual Mock / Asset Roadmap

この文書は、Sigma-8 の見た目を `docs/sigma-8-mockup.png` に近づけるための
モック生成・アセット生成・実装検品の正本。

上位仕様は `SIGMA-8-VISUAL-SYSTEM-SPEC.md`。
この文書は、そこで定義された表示状態を埋めるためのアセット計画であり、
表示状態が未定義の素材は生成しない。

結論:

- モック用画像生成は **完了していない**。
- runtime に入ったアセット出力は **M2.1 visual v1 としては完了**。
- 商業品質寄せには、崖、水際、工事状態、天候状態の追加生成が必要。

## Current Sources

| 種別 | ファイル | 状態 | 用途 |
|---|---|---|---|
| Target mock | `docs/sigma-8-mockup.png` | 既存 | 画風・構図の北極星。pixel-perfect ではない |
| Current screenshot | `output/web-game/full-after-assets.png` | ローカル検品用 | v2 atlas / props / feature sprite 統合後の実機確認 |
| Terrain atlas v2 | `public/terrain/sigma8_terrain_atlas_v2_1024.png` | runtime 接続済み | 地表、崖、坂、水 |
| Ground props v1 | `public/props/sigma8_ground_props_v1_processed.png` | runtime 接続済み | 草、花、石、丸太など低密度 props |
| Feature sprites v1 | `public/features/sigma8_feature_sprites_v1_processed.png` | runtime 接続済み | 家、畑、水源、井戸、塔など |

## Current Visual Verdict

現 runtime は、以前の「緑の板」よりかなり良い。
ただし、`docs/sigma-8-mockup.png` の完成度にはまだ届いていない。

主な差分:

| 領域 | 現状 | 判定 | 次に必要なもの |
|---|---|---|---|
| 地表 | v2 atlas で密度が出た | M2 usable | 色調と繰り返し感を実機で微調整 |
| 崖 | 1 cell 反復で縦壁紙感が強い | 不足 | cliff wall variants sheet |
| 水際 | 水面は出たが岸・滝・段差水が弱い | 不足 | shoreline / waterfall FX sheet |
| props | 地面の板感は減った | usable | 密度調整、工事 props 追加 |
| features | procedural から sprite へ進歩 | usable | スケール・画風検品、必要なら v2 |
| 工事状態 | 数値ラベル依存が残る | 不足 | ramp / cut-earth / worksite overlay |
| 天候/季節 | tint と簡易 overlay 中心 | 不足 | rain/mud/snow の状態モックと overlay |
| キャラ | 既存水彩 billboard 維持 | 未判断 | ドット絵化は別モック比較後 |

## Mock Generation Status

### Done

- フル画面目標モック 1 枚: `docs/sigma-8-mockup.png`
- 実機検品スクショ 1 枚: `output/web-game/full-after-assets.png`

### Not Done

`SIGMA-8-PLAN.md` では Week 0 に「フル画面モック 2-3 枚」とあるが、
現時点では **追加モック 2-3 枚は未完了**。

単独タイル画像だけでは判断できない。今後の画像生成は、必ず実ゲーム画面単位で判断する。

## Required Mocks

優先順:

| Priority | Mock | Purpose | 生成要否 |
|---:|---|---|---|
| 1 | M2.2 target daytime | 崖・水際・props 密度の完成形を決める | 必須 |
| 2 | Rain / wet / flood | 水の流れ、ぬかるみ、危険 HUD の見え方を決める | 必須 |
| 3 | Winter / snow / night | 雪・夜・灯りの画面言語を決める | 必須 |
| 4 | Construction / ramp close-up | 坂道化、切り土、工事中 props の読みやすさを決める | 必須 |
| 5 | Character pixel-art comparison | 既存水彩 billboard vs ドット絵を比較する | 任意、キャラ差し替え判断時 |

### Mock Prompt Template

以下は ChatGPT 画像生成 UI に貼るためのテンプレ。
既存 `docs/sigma-8-mockup.png` と `output/web-game/full-after-assets.png` を参考画像として添付する。

```text
Create a full-screen gameplay mockup for a cozy low-resolution stylized tile diorama village survival game.

Camera:
- fixed isometric / top-down 45 degree view
- 100x57 tile terrain feeling, visible terraces and vertical cliffs
- small chibi villagers remain readable as the visual focus

Art direction:
- soft painterly low-resolution game asset look
- warm natural colors, not photorealistic, not glossy PBR
- readable terrain rules: flat tiles, impassable cliffs, explicit ramp tiles
- UI layout similar to the provided game screenshot: time/risk HUD, right build panel, bottom tool bar, minimap

Scene requirement:
[SCENE_SPEC_HERE]

Do not make a marketing illustration.
Do not use decorative fantasy UI.
Make it look like an actual playable game screen.
```

Scene specs:

- Daytime target: `grass / soil / rock / water / cliff / props / features all visible; no rain; show cliffs with varied vertical faces and clean shoreline`
- Rain/flood: `rain, wet ground, muddy tiles, water pooling in low areas, channels carrying water, flood risk visible in HUD`
- Winter/night: `snow coverage on high tiles, warm light from lamps/houses, readable cliffs, no dark unreadable areas`
- Construction/ramp: `close view of cut-earth tiles, one ramp under construction, stakes, ropes, shovel, dirt piles, chibi workers nearby`
- Pixel comparison: `same terrain and UI, but chibi characters are low-resolution pixel sprites; compare against current watercolor billboard look`

## Required Asset Batches

### Batch A: Cliff Wall Variants v2

**必要度: highest**

現スクショ最大の弱点は崖の縦線反復。まずここを直す。

出力:

- `public/terrain/sigma8_cliff_variants_v2_raw.png`
- `public/terrain/sigma8_cliff_variants_v2_1024.png`

仕様:

- 1024x1024 PNG
- 4x4 grid, 256x256 cell
- 地形 atlas と同じ色調
- tileable horizontally
- vertical face として読めること
- top-down ground texture に見えないこと

Cell plan:

| Coord | Use |
|---|---|
| `(0,0)` | grass top over brown soil cliff |
| `(1,0)` | grass top over dark soil cliff variant |
| `(2,0)` | grass top over rocky cliff |
| `(3,0)` | grass top over damp lower cliff |
| `(0,1)` | rock cliff |
| `(1,1)` | rock cliff shadow variant |
| `(2,1)` | wet cliff near water |
| `(3,1)` | waterfall strip over cliff |
| `(0,2)` | left edge cap |
| `(1,2)` | right edge cap |
| `(2,2)` | inner corner shadow |
| `(3,2)` | outer corner highlight |
| `(0,3)` | cliff bottom grass contact |
| `(1,3)` | cliff bottom water contact |
| `(2,3)` | loose dirt / landslide scar |
| `(3,3)` | reserved |

Prompt:

```text
Create a 1024x1024 game texture atlas, 4x4 grid, each cell 256x256.
Subject: stylized vertical cliff wall variants for a low-resolution tile diorama village game.

Style:
- soft painterly low-resolution game texture
- warm green grass top edge, brown soil, dark rock, damp moss
- readable from a 45-degree top-down camera
- no photorealism, no glossy PBR, no labels, no text
- each cell should work as a vertical wall face, not a top-down ground tile
- horizontally tileable within each cell
- consistent palette with the provided game screenshot

Cell content:
1 grass over brown soil cliff
2 grass over darker soil cliff
3 grass over rocky cliff
4 damp lower cliff
5 rock cliff
6 rock cliff shadow variant
7 wet cliff near water
8 narrow waterfall strip over cliff
9 left cliff edge cap
10 right cliff edge cap
11 inner corner shadow
12 outer corner highlight
13 cliff bottom grass contact
14 cliff bottom water contact
15 loose dirt landslide scar
16 reserved neutral cliff texture
```

### Batch B: Shoreline / Waterfall FX v1

**必要度: high**

水のリアリティ要件が強いので、岸と段差水は素材で補助する。

出力:

- `public/fx/sigma8_water_edges_v1_raw.png`
- `public/fx/sigma8_water_edges_v1_processed.png`

仕様:

- 1024x1024 PNG
- 4x4 grid
- transparent background
- water / foam / wet edge / waterfall strips

Cell plan:

| Coord | Use |
|---|---|
| `(0,0)` | straight shoreline north/south |
| `(1,0)` | straight shoreline east/west |
| `(2,0)` | convex shore corner |
| `(3,0)` | concave shore corner |
| `(0,1)` | shallow ripple patch |
| `(1,1)` | puddle edge |
| `(2,1)` | muddy wet edge |
| `(3,1)` | foam flecks |
| `(0,2)` | vertical waterfall strip short |
| `(1,2)` | vertical waterfall strip tall |
| `(2,2)` | waterfall splash bottom |
| `(3,2)` | water running over ramp |
| `(0,3)` | rain rings |
| `(1,3)` | flood warning shimmer |
| `(2,3)` | snow melt wet edge |
| `(3,3)` | reserved |

Prompt:

```text
Create a transparent 1024x1024 PNG game FX atlas, 4x4 grid, 256x256 per cell.
Subject: stylized shoreline, puddle, foam, waterfall and wet-edge overlays for a low-resolution tile diorama village game.

Style:
- soft painterly low-resolution game asset
- readable over grass, soil, rock, sand, and snow tiles
- transparent background
- no labels, no text, no UI
- not photorealistic
- small details must remain readable at 32-64 px in-game

Cells:
1 straight shoreline north/south
2 straight shoreline east/west
3 convex shoreline corner
4 concave shoreline corner
5 shallow ripple patch
6 puddle edge
7 muddy wet edge
8 foam flecks
9 short waterfall strip
10 tall waterfall strip
11 waterfall splash bottom
12 water running over ramp
13 rain rings
14 flood warning shimmer
15 snow melt wet edge
16 neutral water edge
```

### Batch C: Worksite / Ramp Construction v1

**必要度: high**

現在の工事は数値ラベルに頼りがち。坂道化がコア体験なので、見た目で達成感を出す。

出力:

- `public/props/sigma8_worksite_props_v1_raw.png`
- `public/props/sigma8_worksite_props_v1_processed.png`

仕様:

- 1024x1024 PNG
- 4x4 grid
- transparent background
- 既存 ground props よりやや大きめ

Cell plan:

| Coord | Use |
|---|---|
| `(0,0)` | stakes and rope small |
| `(1,0)` | stakes and rope large |
| `(2,0)` | shovel + pickaxe crossed |
| `(3,0)` | dirt pile |
| `(0,1)` | cut-earth patch |
| `(1,1)` | half-built ramp dirt |
| `(2,1)` | half-built ramp with plank |
| `(3,1)` | completed ramp accent |
| `(0,2)` | wooden planks |
| `(1,2)` | stone pile |
| `(2,2)` | soil crate |
| `(3,2)` | caution marker |
| `(0,3)` | small bridge plank |
| `(1,3)` | drainage ditch marker |
| `(2,3)` | collapsed dirt scar |
| `(3,3)` | generic construction site |

Prompt:

```text
Create a transparent 1024x1024 PNG prop atlas, 4x4 grid, 256x256 per cell.
Subject: tiny construction and ramp-building props for a stylized tile diorama village game.

Style:
- soft painterly low-resolution game asset
- warm wood, brown soil, stone gray, small rope details
- consistent with cute village terrain assets
- transparent background
- no labels, no text
- readable from a 45-degree top-down camera
- not photorealistic

Cells:
1 small stakes and rope
2 large stakes and rope
3 crossed shovel and pickaxe
4 dirt pile
5 cut-earth patch
6 half-built dirt ramp
7 half-built ramp with wooden plank
8 completed ramp accent
9 wooden planks
10 stone pile
11 soil crate
12 caution marker
13 small bridge plank
14 drainage ditch marker
15 collapsed dirt scar
16 generic construction site marker
```

### Batch D: Feature Sprites v2

**必要度: medium**

v1 は使える。今すぐ再生成しない。
実機で「ちびわふより目立つ」「画風がピクセル寄りすぎる」「スケールが合わない」と感じたら v2 を作る。

v2 を作る場合の変更点:

- キャラ水彩 billboard との整合を強める
- outline を少し柔らかくする
- smoke / light / water など淡色部は alpha 抜け前提で太めに描く
- 1 cell 内で余白を多めにして切り抜きやすくする

### Batch E: Character Pixel-Art Comparison

**必要度: optional**

キャラをドット絵化するかは、まだ決めない。
地形・UI・feature も含めたフル画面比較で判断する。

必要になったら、以下を生成する:

- 既存水彩 chibi billboard のままの画面
- 同一画面で chibi / furana だけ pixel-art sprite に置換した画面
- 画面サイズ 1600x900、UI あり、同一地形

判断基準:

- 遠景でキャラが読めるか
- 地形とキャラの情報量が合うか
- 既存 40 ポーズ資産を捨てるだけの価値があるか
- ちびわふの「異常にくそざこ」感が増えるか

## Implementation Order

次の実装順はこれで固定する。

1. **Cliff variation code without new assets if possible**
   - 既存 v2 atlas の cliff / rock / damp cells を使い分ける。
   - 壁ごとに軽い brightness variation を入れる。
   - これで足りなければ Batch A を生成する。

2. **Generate Batch A: Cliff Wall Variants v2**
   - 崖の壁紙感が残るなら最優先。

3. **Water edge / waterfall overlay**
   - 先に簡単な edge line / foam をコードで試す。
   - 足りなければ Batch B を生成する。

4. **Worksite / ramp construction overlay**
   - ramp 工事ジョブ化と同時に Batch C を使う。

5. **Feature sprite v2 decision**
   - v1 のスクショを見てから判断。

6. **Character pixel-art mock**
   - 最後。既存 40 ポーズを捨てる判断なので早まらない。

## Acceptance Gates

新アセットを採用する条件:

- 1600x900 標準カメラで読める
- 最遠景でも地形ルールが読める
- ちびわふより props / feature が目立ちすぎない
- 夕方・夜・雨で破綻しない
- alpha 抜きの白フチやチェッカー残りがない
- `npm run typecheck`, `npm run test`, `npm run build` が通る

## Current Answer

「モック用の画像生成は全部終わっているか？」

**No.**
目標モックは 1 枚あるが、雨・雪・工事・水際・キャラ比較の画面モックが足りない。

「アセットの出力は完了したか？」

**M2.1 v1 としては Yes、商業品質の完成素材としては No.**
terrain v2 / props v1 / feature v1 は runtime に入った。
次は cliff / shoreline / worksite を追加生成またはコード補正で詰める。
