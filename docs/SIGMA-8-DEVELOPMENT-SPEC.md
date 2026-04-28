# Sigma-8 Development Spec v1

この仕様書は Sigma-8 実装中の判断ブレを防ぐための開発基準。ロードマップは
[SIGMA-8-PLAN.md](SIGMA-8-PLAN.md) を参照。

## 非目標

M2 で次はやらない。

- PBR 地形
- normal / roughness texture
- splat blend
- tri-planar projection
- SSAO / LUT / Bloom
- 滑らかな自由斜面
- chunk / LOD
- Unity 移行

## データモデル

### TerrainMaterial

M2 の地形材質は 5 種だけ。

```ts
export type TerrainMaterial = 'grass' | 'soil' | 'rock' | 'sand' | 'snow';
```

`water` は地形材質ではなく `waterLevel` と water overlay で扱う。`mud` も材質ではなく
`mud` または `wetness` 派生 overlay として扱う。

### TerrainTile

推奨形:

```ts
export type RampDir = 'N' | 'S' | 'E' | 'W';

export interface TerrainTile {
  elev: number;              // 0-255. 通常編集は 25 単位
  material: TerrainMaterial; // 1 tile 1 material
  ramp: RampDir | null;      // null = 平地/段差、非 null = 通れる坂
  stability: number;         // 0-1
  waterLevel: number;        // 0-1
  wetness: number;           // 0-1 visual + movement cost
  mud: number;               // 0-1 visual + slip risk
  snowCoverage: number;      // 0-1 visual + movement cost
  buryTimer: number;         // transient
}
```

`ramp` は 1 タイル 1 方向。M2 では斜め坂、交差坂、曲がり坂は扱わない。

### 高さ単位

```ts
const ELEV_STEP = 25;
const MAX_ELEV = 255;
```

編集操作は必ず `ELEV_STEP` 単位に丸める。既存セーブや generator の細かい値はロード時または
初期化時に丸めてよい。

## 通行ルール

通行判定は必ずタイル隣接で行う。bilinear elevation の slope では判定しない。

| 条件 | 判定 | Cost |
|---|---|---|
| 同高度 | 通行可 | 1.0 |
| 高さ差 1 段 + ramp が接続 | 通行可 | 1.8 |
| 高さ差 1 段 + ramp なし | 原則不可 | infinity |
| 高さ差 2 段以上 | 崖、不可 | infinity |
| waterLevel >= 0.35 | 原則不可 | infinity |
| mud > 0 | 通行可なら追加 cost | `+ mud * 2` |
| snowCoverage > 0 | 通行可なら追加 cost | `+ snowCoverage * 1.5` |

traits による例外は M2 では最小限にする。勇気のある個体が水や小段差へ突っ込む場合も、事故確率と
表示を必ず伴わせる。

## Ramp 接続判定

`ramp` は「高い側」を向く。

- ramp = `N`: 北隣が 1 段高い時、南低地 <-> 北高地を接続
- ramp = `S`: 南隣が 1 段高い時、北低地 <-> 南高地を接続
- ramp = `E`: 東隣が 1 段高い時、西低地 <-> 東高地を接続
- ramp = `W`: 西隣が 1 段高い時、東低地 <-> 西高地を接続

不正な ramp は描画しても通行不可にする。例: `ramp='N'` なのに北隣との高さ差が 0 または 2 段以上。

## A* Pathfinding

### 基本

- grid: 100x57
- heuristic: Manhattan
- 隣接: 4 方向
- diagonal は M2 では禁止
- path は tile center の waypoint 配列として保持
- target 設定時に path request を積む
- 1 frame 最大 4 件程度を処理
- `terrainVersion` が変わったら path cache を破棄

### 失敗時

path が見つからない場合:

- target を破棄
- 該当個体に短時間の confused/idle を入れる
- 近くの通行不能境界へ赤い X または警告 marker を出す
- ログや吹き出しはスパムしないよう cooldown を持つ

## 描画仕様

### Terrain

M2 の terrain shader は atlas lookup を基本にする。

入力候補:

- `position`
- `normal`
- `uv`
- `materialId`
- `rampDir`
- `wetness`
- `mud`
- `snowCoverage`

描画ルール:

- 平地は tile atlas の対応セルを貼る
- ramp tile は片側頂点を 1 段上げた mesh として表示する
- 崖は別 InstancedMesh の壁面タイルで表示する
- water は overlay plane または tile overlay として表示する
- wetness は暗化 + 少しだけハイライト
- mud は茶色 overlay + 足跡/ぬかるみ表現
- snowCoverage は白 overlay。完全置換ではなく下地が少し残る

### Cliff

高さ差 2 段以上の境界に壁面 tile を置く。

- east/west/north/south の境界ごとに instance
- 高さは段差数に比例
- 1 draw call か少数 draw call にまとめる
- 既存 `cliffLines` は補助 debug 以外では使わない

### 更新頻度

terraform 入力後 100ms 以内に視覚反映する。90 フレームごとの全体更新だけに頼らない。

推奨:

- 地形変更時に dirty tile / dirty rect を記録
- 小規模なら geometry attribute を即更新
- 全体 rebuild は fallback または低頻度

## ブラシ仕様

### 共通

- pointer hover で ghost preview を出す
- drag paint 対応
- 操作前 snapshot を undo stack に保存
- preview は対象 tile、変更後 elev、ramp、通行可否を表示する

### ブラシ一覧

| ブラシ | 動作 | 備考 |
|---|---|---|
| 盛る | `elev += ELEV_STEP` | soil 消費。ramp 不正化に注意 |
| 削る | `elev -= ELEV_STEP` | soil 獲得。水流更新 |
| 平坦化 | 対象を基準 elev に揃える | soil 収支は簡略でよい |
| スムーズ | 段差を整理する | 滑らかな自由斜面は作らない |
| 坂道化 | 高さ差 1 の隣接に ramp を作る | Sigma-8 の主役 |
| 水路 | drag で溝を掘る | water flow と接続 |

### 坂道化ブラシ

入力:

- 対象 tile
- 推定方向または UI で選択された方向

成功条件:

- 対象 tile と隣接 tile の高さ差が 1 段
- 方向が高い側を向いている
- 水深が深すぎない

失敗時:

- preview を赤くする
- tooltip: `高さ差 1 段の場所だけ坂道化できます`

## UI 仕様

UI はかわいいが実用優先。地形開発ゲームの操作盤として使える密度にする。

### レイアウト

- 下: main toolbar
- 右: selected tool settings
- 左上: time/risk HUD
- 左下: event log
- 右上: minimap は余裕があれば

### 下ツールバー

必須ボタン:

- raise
- lower
- flatten
- smooth
- ramp
- channel
- build

アイコン優先。テキストは tooltip または短いラベル。

### 右設定パネル

選択中ツールごとに必要な項目だけ出す。

- brush radius
- strength
- target elevation
- ramp direction
- undo / redo

### 時間 HUD

表示例:

```text
春 12日 14:30  晴れ  水位: やや高い  崩落危険
夜まで 3:20
```

必須情報:

- season
- day count
- HH:MM
- weather
- water risk
- collapse risk
- next phase countdown

既存 `dayProgress` / `dayCount` / `weather.kind` を使う。位相は朝/昼/夕/夜へ丸めて表示する。

### Event Log

優先表示:

- 死亡
- 崩落
- 洪水/水位危険
- 道開通
- path failed
- 食料不足

## アセット仕様

### Terrain Atlas

M2 の必須 tile:

- grass flat
- soil flat
- rock flat
- sand flat
- snow flat
- cliff wall
- ramp grass/soil どちらか 1 系統
- water overlay
- mud overlay
- snow overlay

最初から全バリエーションを作らない。足りない差分は色替えや overlay で補う。

### Ground Props

256x256 transparent PNG。M2 では 10 種。

- grass tuft
- dry grass
- bush
- flower
- mushroom
- sapling
- reeds
- pebble
- snow grass
- mud clump

runtime では 32-64px 程度で読む。縮小して読めない prop は不採用。

### 工事ポーズ

既存 40 ポーズ規約に合わせる。

- pickaxe_swing_a
- pickaxe_swing_b
- shovel_dig_a
- shovel_dig_b
- carry_dirt_a
- carry_dirt_b

## 検証

### Build

```bash
npm run build
```

### Manual

- 新規 run で地形が表示される
- 盛る/削るで 1 段変わる
- 高さ差 2 段以上をちびわふが登らない
- 坂道化で高さ差 1 段を通れる
- 水路に水が流れる
- 雨で wetness/mud が増える
- 雪で snowCoverage が増える
- undo/redo が壊れない
- 時間 HUD が dayProgress と一致する

### Performance

目標:

- chibi 60 体で fps 60 近辺
- terraform 入力から視覚反映 100ms 未満
- path request 1 件は通常 10ms 未満
- save serialize 50ms 未満

## 実装順の注意

1. データ構造を広げる
2. 通行ルールを tile base にする
3. A* を入れる
4. 見た目を atlas にする
5. UI を操作とつなぐ
6. props と polish を足す

見た目だけ先に豪華にしない。描画、通行、水、事故が同じルールを見ることを最優先にする。

## 実装ステータス（このファイルは目標、進捗は STATUS.md 参照）

このファイルは Σ-8 の **目標仕様** を定義する。
**現在の実装事実 / Gap / Deferred** は別ファイルで管理する：

→ **`docs/SIGMA-8-IMPLEMENTATION-STATUS.md`**（実装正本）

現時点（Σ-8-fix-8 / commit `6e4e7e9` まで）の概況：

### 概ね SPEC 準拠（Done）

- データ構造（5 材質 / RampDir / wetness/mud/snow / isSea / ELEV_STEP=25）
- 通行ルール（隣接タイル判定、passCost テーブル、canRampConnect）
- A*（MinHeap、Manhattan、weighted h*1.001、maxNodes=ROWS*COLS）
- 描画（atlas lookup、per-tile geometry、ramp 専用 cell、崖 InstancedMesh）
- 6 ブラシ（raise / lower / flatten / smooth / ramp / channel）
- preview ghost、drag paint、undo/redo（drag 単位、最大 50 件）
- sim/render 共通 elevAt（`terrain/query.ts elevAtTileSurface`）
- waterLevel 0.35 閾値跨ぎで terrainVersion 自動更新

### SPEC 通り未実装（Gap）

- **ramp 工事ジョブ化**：現状は即時設置、SPEC は明示してないが体感重要
- **path 失敗時の赤 X / marker**：dazed cooldown のみ、視覚 marker なし
- **preview に変更後 elev / ramp / 通行可否のテキスト表示**：色分けのみ
- **props 10 種**：未発注（grass_tuft / dry_grass / bush / flower / ...）
- **工事ポーズ 6 種**：未発注、既存 work_a/b で代用
- **path queue（1 frame 4 件処理）**：現状全 chibi 同期計算、性能ベンチで問題出るまで保留

### M2 範囲外（Deferred）

- 巨大ファイル分割（world.ts 4600行 / main.ts 2400行 / stage3d.ts 2270行）
- seed RNG（Math.random → seeded、再現性目的）
- chibis/npcs persist 検討（現状仕様は使い捨て）

詳細は STATUS.md を参照。

