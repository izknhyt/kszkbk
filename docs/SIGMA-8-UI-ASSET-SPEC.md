# Sigma-8 UI / Asset Spec v1

この仕様書は Sigma-8 の UI と素材発注の正本。基準画像は
[sigma-8-mockup.png](sigma-8-mockup.png) とする。

目的は「かわいい画面」ではなく、地形開発ゲームとして必要な情報が一瞬で読めること。
UI、地形タイル、overlay、アイコン、props は同じ画面言語で揃える。

## 固定方針

| 項目 | 方針 |
|---|---|
| UI の役割 | 地形を操作する道具。雰囲気より操作性を優先 |
| 見た目 | 低解像度スタイライズド箱庭 + 現代的な管理 UI |
| 画風 | 暖色寄り、太すぎない茶系アウトライン、彩度高めだが neon 禁止 |
| 情報密度 | 牧場ゲームの親しみやすさ + シム管理ゲームの情報量 |
| 実装 | HTML/CSS overlay を基本。WebGL に焼き込まない |
| アイコン | 形で読ませ、短い日本語ラベル/tooltip で補助 |
| モバイル | M2 では非優先。desktop 16:9 を正本にする |
| 禁止 | PBR 風、写実 UI、過度なグラデーション、装飾だけのカード |

## 基準画面

基準画像: `docs/sigma-8-mockup.png`

この画像は pixel-perfect 指定ではない。固定するのは次の構成。

- 左上: 時間/天気/危険 HUD
- 右上: ミニマップ
- 右側: 選択ツール設定パネル
- 下中央: メインツールバー
- 左下: イベントログ
- 中央: 地形とブラシ preview

画面全体は「村を見ている」ことが主役。UI は常時表示でも地形を覆いすぎない。

## レイアウト仕様

### Desktop Baseline

- 基準比率: 16:9
- 想定最小: 1280x720
- 推奨検品: 1440x900 / 1920x1080
- canvas は全画面
- UI は `position: absolute` の overlay
- 画面端 padding は 12-16px

### Safe Zones

| Zone | 配置 | 幅/高さの目安 | 役割 |
|---|---|---|---|
| Time HUD | 左上 | 360x72 以内 | 状況判断 |
| Minimap | 右上 | 180x180 以内 | 地形把握 |
| Tool Panel | 右中央 | 260-320px 幅 | 選択ツール設定 |
| Toolbar | 下中央 | 560-760px 幅 | 主要操作 |
| Event Log | 左下 | 360x160 以内 | 事故/進捗 |

右設定パネルとミニマップは上下に 12px 以上の余白を置く。下ツールバーはログと重ならない。

## Visual Tokens

### Color

CSS custom properties の起点:

```css
:root {
  --ui-bg: rgba(39, 35, 28, 0.78);
  --ui-bg-soft: rgba(255, 247, 224, 0.90);
  --ui-border: rgba(92, 67, 43, 0.70);
  --ui-text: #fff4d8;
  --ui-text-dark: #3f2d1e;
  --ui-accent: #f3b447;
  --ui-good: #7fcf6b;
  --ui-warn: #f0c14a;
  --ui-danger: #e45f4f;
  --ui-water: #4fa8d8;
  --ui-snow: #e7f2ff;
}
```

地形色と UI 色は競合させない。危険色は赤/橙、水は青、雪は白青で固定する。

### Shape

- panel radius: 8px 以下
- tool button: 44-52px square
- icon size: 22-28px
- border: 1-2px
- shadow: 弱く、情報を浮かせる程度

カードを入れ子にしない。右パネル内の項目は row / group で整理する。

### Typography

- 本文: 12-14px
- HUD 主情報: 14-16px
- 数値: tabular-nums を使う
- 小さな警告: 11-12px
- 長文説明は禁止

日本語 UI は短くする。

- OK: `盛る`, `削る`, `半径`, `高さ`, `水位危険`
- NG: `このブラシで地形を盛り上げます`

## UI Components

### Time / Risk HUD

配置: 左上。

表示例:

```text
春 12日 14:30  晴れ
水位: やや高い  崩落危険  夜まで 3:20
```

必須フィールド:

- season
- day count
- HH:MM
- weather
- water risk
- collapse risk
- next phase countdown

状態表示:

| 状態 | 表示 |
|---|---|
| normal | 通常色 |
| water high | `水位: 高い` を青/黄 |
| flood danger | `洪水危険` を赤 |
| collapse risk | `崩落危険` を黄/赤 |
| night | 背景を少し暗く、月 icon |
| snowstorm | `吹雪` + 白青 |

### Main Toolbar

配置: 下中央。

必須 tool:

| Tool | 表示名 | Icon 方針 | Shortcut |
|---|---|---|---|
| raise | 盛る | 上向き矢印 + 土 | `1` |
| lower | 削る | 下向き矢印 + スコップ | `2` |
| flatten | 平坦 | 水平線 | `3` |
| smooth | 整地 | なだらかな線 | `4` |
| ramp | 坂道 | 斜面 | `5` |
| channel | 水路 | 水滴/溝 | `6` |
| build | 建設 | 家/槌 | `7` |

選択中 tool は accent 色で明示する。disabled は opacity を下げ、tooltip で理由を出す。

### Tool Settings Panel

配置: 右中央。

共通項目:

- tool name
- brush radius
- strength
- target elevation
- preview mode
- undo / redo

Tool 別項目:

| Tool | 追加項目 |
|---|---|
| raise/lower | 土コスト/獲得量 |
| flatten | target elev stepper |
| smooth | 整理強度 |
| ramp | ramp direction, passability preview |
| channel | flow direction preview, water warning |
| build | building type, placement validity |

右パネルには説明文を詰め込まない。数値、toggle、slider、icon button を中心にする。

### Event Log

配置: 左下。

表示対象:

- death
- landslide
- flood
- path failed
- road opened
- food shortage
- construction/terraform complete

ログは最新 4-6 件。重大度ごとに左 border 色を変える。

例:

```text
14:31  みちができたわふ！
14:27  崩落危険: 北の崖
14:20  ちびわふ #12 転倒
```

### Minimap

配置: 右上。M2 では簡易版でよい。

表示 layer:

- elevation heatmap
- water
- impassable cliff
- chibi cluster
- selected brush area

色:

- low: dark green/blue
- mid: green/brown
- high: gray/white
- water: blue
- cliff: black/dark brown
- danger: red/orange

### Cursor / Ghost Preview

地形開発ゲームの最重要 UI。

表示するもの:

- brush footprint
- affected tiles
- before/after elevation
- ramp direction
- passable / blocked
- water flow after operation

色:

| 意味 | 色 |
|---|---|
| valid | green/cyan |
| will change | yellow |
| invalid | red |
| water affected | blue |
| collapse risk | orange/red |

プレビューは地形を隠しすぎない。透明度 35-55% を目安にする。

## Terrain Asset Spec

### Atlas v1

最初に作る terrain atlas。

- file: `public/terrain/sigma8_terrain_atlas_v1.png`
- canvas: 1024x1024 PNG
- grid: 4x4
- cell: 256x256
- padding: 各セル内 16px safe padding
- labels/text: 禁止
- color space: sRGB

配置:

| Row | Col 1 | Col 2 | Col 3 | Col 4 |
|---|---|---|---|---|
| 1 | grass flat | soil flat | rock flat | sand flat |
| 2 | snow flat | cliff wall | ramp north | ramp east |
| 3 | water overlay | mud overlay | snow overlay | wetness overlay |
| 4 | dirt path | shallow channel | cliff top cap | reserved transparent |

### Tile Requirements

Flat ground tiles:

- seamless horizontally/vertically
- readable at 32-64px
- no photoreal texture noise
- material identity must be obvious

Cliff wall:

- not top-down flat ground
- clearly vertical/impassable
- aligns with 256px tile width
- high contrast enough to read from camera

Ramp:

- communicates direction
- looks passable
- represents exactly 1 height step
- north/east variants are required first; south/west can be produced by transform if acceptable

Overlay:

- must use alpha
- should work over grass/soil/rock/sand/snow
- no hard rectangular edge
- readable but not opaque

## Prop Asset Spec

### Ground Props

- directory: `public/terrain/props/`
- format: PNG RGBA
- canvas: 256x256
- background: transparent
- runtime display: 32-64px
- no ground shadow baked in
- no labels

M2 required set:

| File | Purpose |
|---|---|
| `grass_tuft.png` | grass density |
| `dry_grass.png` | dry variation |
| `bush.png` | volume |
| `flower.png` | color accent |
| `mushroom.png` | small detail |
| `sapling.png` | young tree |
| `reeds.png` | water edge |
| `pebble.png` | rock/sand detail |
| `snow_grass.png` | winter detail |
| `mud_clump.png` | wetland detail |

Props must not be more detailed than chibiwafu. If a prop attracts more attention than a chibi, reject it.

## UI Icon Asset Spec

M2 は CSS/lucide 等の icon を優先してよい。独自生成する場合:

- directory: `public/ui/icons/`
- format: SVG preferred, PNG allowed
- size: 64x64 source
- must read at 24px
- one icon per file
- no text baked in
- consistent stroke width

Required icons:

- raise
- lower
- flatten
- smooth
- ramp
- channel
- build
- undo
- redo
- warning
- water
- collapse
- snow
- night

## Image Generation Prompt Contract

画像生成へ渡す時は、必ず以下を含める。

```text
Low-resolution stylized tile diorama game asset.
Cozy indie farm-sim plus city-builder style.
Warm brown outlines where useful.
Saturated but not neon.
Readable at 32-64 px in game.
Simple material identity, not noisy.
No photorealism, no PBR, no normal map, no glossy 3D.
Must match cute chibi village sprites.
No text, no labels, no watermark.
```

Atlas 生成では「complete beautiful illustration」ではなく「runtime texture atlas」と明記する。

## QA Checklist

UI:

- [ ] 1280x720 で文字が潰れない
- [ ] 下 toolbar と右 panel が重ならない
- [ ] 選択中 tool が一目で分かる
- [ ] 時刻/天気/危険が左上で読める
- [ ] preview が valid/invalid を色で示す
- [ ] event log が地形を邪魔しすぎない

Terrain assets:

- [ ] flat tile が seamless
- [ ] 32px 表示でも材質が読める
- [ ] cliff は通行不可に見える
- [ ] ramp は通行可能に見える
- [ ] overlay に矩形エッジが出ない
- [ ] chibiwafu と彩度/線/密度が合う

Rejected if:

- 写真素材に見える
- PBR/normal map 風の凹凸が主張する
- UI がファンタジー装飾に寄りすぎて操作盤として弱い
- 単独では綺麗だがゲーム画面でルールが読めない
- 小さい表示で muddy/noisy になる

## 実装時の優先順位

1. Time HUD
2. Toolbar
3. Tool settings panel
4. Ghost preview
5. Event log
6. Minimap
7. Visual polish

Minimap より preview を優先する。地形開発の手触りは preview の正確さで決まる。

