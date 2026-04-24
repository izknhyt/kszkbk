# くそざこ村 — Claude 開発ガイド

このファイルは新しい Claude セッションでプロジェクト状態を即座に把握するためのメモ。
大きな設計変更があったら都度更新。

---

## 概要

2D トップダウンの **サバイバル × 開拓 × くそざこコメディ** idle ゲーム。
プレイヤーは神様（= 殴り投げる役）として、200+ ちびわふを抱える村を
育てつつ災害を凌ぐ。SimCity + RimWorld + 放置ゲー的ジャンル合成。

## 技術スタック

- Vite 5 / TypeScript 5.4 / Three.js 0.184（ESM）
- HUD は素の HTML/CSS、React 等は使わない
- 保存は localStorage（スロット 3 つ）
- テスト：`scripts/sim.ts` が headless で 60 分シミュレート

## 主要コマンド

| やりたいこと | コマンド |
|---|---|
| ローカル起動 | `npm run dev` |
| 型チェック | `npx tsc --noEmit` |
| 完全ビルド | `npm run build` |
| 60分 headless sim | `npx tsx scripts/sim.ts` |
| 個別スモーク | `npx tsx -e "..."` で世界を自由生成して tickWorld ループ |

## リポジトリ構造

```
src/
  config.ts              物理・時間・ワールド定数（単一情報源）
  types.ts               全型定義（Chibiwafu / Feature / Obstacle / Weather / TerrainTile / TerraformJob 等）
  main.ts                エントリ。ゲームループ、UI イベント、スタート画面
  sim/
    world.ts             【中心】WorldState, tickWorld, 各 update* 関数群（3,200+ 行）
    chibiwafu.ts         spawnChibiwafu, wanderStep
    npcs.ts              NpcState, NPC_DEFS, セリフプール、createNpcs
    chats.ts             会話セリフ（GENERIC/TRAIT/CHEEKY/反応系多数）
    deaths.ts            DEATH_CAUSES カタログ（47 種、Σ-1/2/Ω-6 で拡張済）
    hazards.ts           HazardZone データ定義（mudriver/bridge → 海マスクベースに移行）
    traits.ts            20 種の性格特性
    flavorTraits.ts      82 種のフレーバー ラベル
    flavorBehaviors.ts   フレーバーに紐づく挙動 & EMBARRASSING_FLAVORS
    personality.ts       10 軸パラメータ生成＆派生関数
    events.ts            季節 / DayPhase / GlobalEvent 型
    bubbles.ts           吹き出しキュー
    rank.ts              4 段階ランク (村/集落/町/都)
    naming.ts            ちびわふ名前プール
    spatialHash.ts       空間分割ハッシュ（O(n²)→O(n)）
    terrain/
      noise.ts           Wang hash ベース seeded value noise（Σ-3）
      generators.ts      plains/peninsula/island 3 地形生成器（Σ-3）
      query.ts           isSeaAt / findDryTile / setQueryTerrain（Σ-3、循環 import 回避）
  render/
    stage3d.ts           Three.js 3D 描画（地形メッシュ、ビルボードキャラ、カメラ、気象ティント、日時計、崖線、土砂崩れ煙、建物 Lv、約 1,060 行）
    ui.ts                HUD 更新、ビルドパネル、統計表示（power/brick/wool/cloth/soil 含む）
  meta/
    save.ts              3 スロット save/load、version 12（Σ-2 RLE 地形圧縮、Σ-3 terrainSeed）
index.html               start-screen + HUD + minimap canvas + terraform/infra ボタン
vite.config.ts           appType='mpa' で multi-page（prototypes/ も serve）
scripts/sim.ts           headless バランス計測、難度比較に使う
docs/                    （character-image-brainstorm 由来）
  00_README.md           全体マップ・運用フロー
  10_character_design.md ちびわふ/フラナ 固定デザイン要素
  20_technical_spec.md   PNG 形式・解像度・flood-fill 対応
  30_pose_catalog.md     22 ポーズ描画指示
  40_accessory_library.md 小物 20 種と trait マッピング
  50_prompt_templates.md 発注コピペ用マスタープロンプト
  90_qa_checklist.md     納品検品チェックリスト
prototypes/
  three-terrain/         Σ-4-proto（Three.js 検証プロト、5 項目 GO 確定）
    main.ts              self-contained 3D シーン（src/ への import ゼロ）
    REPORT.md            検証結果レポート（fps/drawCalls/DOM sync の数値）
public/
  chibiwafu/{01-09}_*.png    ちびわふ 9 ポーズ（ChatGPT 生成）
  furana/{01-09}_*.png       フラナ 9 ポーズ
  mockup/{buildings,props}.png  環境アート（background.png は Σ-0 で削除済）
.claude/agents/
  balance-tester.md      Haiku エージェント（headless sim で死因分布確認）
```

## ゲームビジョン

**「200+ くそざこを率いる激烈サバイバル・コロニー・シム + 投げ放題」**

### 設計 4 柱

1. **計画性 vs くそざこ** — 完璧計画でも個体は空腹で倒れる
2. **因果連鎖** — 水路ミス → 洪水 → 家流失 → 野宿 → 狼
3. **情報の非対称** — 3 日予報あり（精度低下）、個体能力は右クリックまで不可視
4. **無力感 × ストレス発散** — 詰んだらちびわふを投げ飛ばして癒やす

## 世界観ルール（重要、ブレると違和感）

- **ちびわふの語尾は〜わふ**（例：「ママー！」「ひえええわふ！」「どうしたわふ？」）
- **フラナ（ママ）も〜わふ**（同族のため）
- **スズはフラナを「ママ」と呼ぶ**（家族構成）
- **ココンはいじめっ子**、ちびわふを棒で突く、たまに返り討ち死
- **ルーは無口**（「……」「……ぐぅ」）
- **くそざこ = 純粋無垢 + 弱い**がベース。たまに cheeky（「ぼくがいちばん！」等）
- cheeky 発言 → 周囲が 25% でボコる。35% で死亡
- 粗相フレーバー（屁/しゃっくり/よだれ等）→ 35% で理不尽にボコられる
- セリフは **機嫌と完全一致** させる（フラナ機嫌悪いのに「いい子わふ〜」は NG）

## 難易度 3 段階

ラン開始時に選択、`DIFFICULTY_MODS` (world.ts) で集約：

| | beginner | standard | hell |
|---|---|---|---|
| 災害率 | ×0.45 | ×1.0 | ×1.8 |
| 空腹 | ×0.75 | ×1.0 | ×1.4 |
| 疲労 | ×0.75 | ×1.0 | ×1.3 |
| 障害物数 | 50 | 90 | 140 |
| イベント間隔 | ×1.5 | ×1.0 | ×0.55 |
| 初期資源 | 🍞40 🪵30 🪨20 🪵plank5 🌱soil80 他 | 🍞20 🪵15 🪨10 soil40 他半分 | 🪵5 🪨5 のみ |

> **Σ-2.5-c 調整**：初期資源を実プレイ向けに底上げ。RAISE_COST_SOIL 20→10、LOWER_SOIL_GAIN 8→14、LOWER_STONE_GAIN 2→5、伐採/採石 HP 消費 0.5→1.0/sec。

## マップ & カメラ

- **3200 × 1800 フリー配置**（旧 1100×650 グリッド制は廃止済み）
- `CONFIG.DRY_Y_LIMIT = 1150`：これより下は泥川
- フラナ拠点 = `(w/2, h*0.35) = (1600, 630)`
- **カメラ操作**：ドラッグパン / ホイールズーム / **WASD/矢印パン** / **F=フラナへ即移動** / **R=リセット** / **ミニマップ右下、クリックで即ジャンプ**

## 主要データモデル

### WorldState（src/sim/world.ts）

```ts
{
  runId, runStartedAtMs, difficulty,       // ラン識別
  tick, timeSec, dayCount, lastDayPhase,   // 時間
  season, dayPhase, dayProgress,           // 季節 + 日時計
  weather, weatherForecast,                // 気象（別レイヤー）
  chibis: Chibiwafu[],
  corpses: Chibiwafu[],
  npcs: NpcState[],
  features: Feature[],                     // 水源/水路/畑/道 自由配置
  obstacles: Obstacle[],                   // 岩/切株/茂み
  buildings: PlacedBuilding[],             // Lv 制建物（既存 5 種）
  landmarks: Landmark[],
  resources: { food, water, wood, stone }, // 開拓リソース
  chibiHash: SpatialHash,                  // 近傍検索（transient）
  ...各種 cooldown / stats
}
```

### Chibiwafu（types.ts）

- **10 軸パラメータ**：courage / appetite / social / focus / energy / philo / luck / tough / mama / zako
- **20 特性（trait）** + **82 フレーバー ラベル**
- **HP**（tough 依存で 20-60）
- **hunger / fatigue**（0-100、100 で死）
- **flight**（飛行状態、vx/vy/leftSec/hitKeys/landingDamage/landCauseId）

### NpcState（src/sim/npcs.ts）

フラナ / スズ / ココン / ルーの 4 体。全員 HP・機嫌 / lifeLog / flight フィールドあり。
**フラナ機嫌 0-100**（damageNpc で -18、音頭 -5、火事 -10、朝 +10、音頭終 +8、近くで寝食 +0.15/s/子）

## ゲーム機構サマリー

### 水力（フリー配置）
- `water` feature → `channel` を 70px 以内で繋げると watered
- `farm` feature が watered feature から 65px 以内で潤う → food 0.08/sec 生産
- 洪水（storm）で溢れると `launchFlight` で `flood_drown`

### 労働ループ
- 障害物近傍 28px にちびわふがいると HP -1.0/sec × ワーカー数（Σ-2.5-c で倍速化）
- 破壊で wood/stone 生産（rock→stone×2 / stump→wood×2 / bush→wood×1）

### 気象効果
- 畑：drought/snow 停止、rain 加速、heatwave 半減
- ちびわふ：heatwave hunger×1.5、snow で軽い HP ドレイン
- storm：stability 回復 ×0（Σ-2-c）、発電所に落雷で `thunder_blast`（Ω-6 P2b）

### プレイヤー操作
- 左クリック：ちびわふ or NPC を殴る（HP ダメージ）
- 右クリック：モーダル表示（ちびわふは生涯ログ、NPC は HP/機嫌/最近のログ）
- ドラッグ：掴んで移動、離すと速度×0.55 秒の物理投げ（弧を描く、軌道上の他個体を巻き込み）
- 水中投げ：ちびわふ即溺死、NPC は -10 HP
- 建設モード：HUD のボタン → 任意座標クリックで feature 設置（wood/stone 消費）
- 地形編集モード（Σ-2-b）：⛰ 盛り土（soil×10 消費）/ ⛏ 切り土（soil+14 獲得、rock なら stone+5）、ちびわふが労働

### Σ-1 z 物理（2.5D）
- `flight` に `vz/posZ/startElev` 追加、重力 CLIFF_GRAVITY=200 で自由落下
- 高所→低所の投げで落差 ≥15 → `cliff_fall`（即死級ダメージ 30 + drop×1.5）
- 坂勾配 >0.6 で courage 判定失敗 → 下方向 launchFlight → `slope_fall`
- water/channel 上 flow >1.5 で下流押し流し → resist 失敗で HP ドレ → `river_swept`
- 激流が崖端で `cliff_fall` に遷移（滝落下）

### Σ-2 タイル式ハイトマップ
- 32px セルの `TerrainTile[][]`（100×57 = 5700 タイル）、`{elev, material, stability, waterLevel, buryTimer}`
- `getElevation(x,y)` は bi-linear 補間、シグネチャは Ω-3-b 以来互換
- 盛り土 `raiseTile` / 切り土 `lowerTile` で elev ±5、stability を 0.6/0.75 まで減衰
- `updateTerrainStability`：stability 回復 +0.02/sec（storm ×0、heatwave ×1.5）
- 崩落トリガー：stability <0.4 かつ隣接 elev 差 ≥20 で 0.005/sec 発動
- 崩落で elev 差 ≥30 → `landslide_crush`（即死）、<30 → HP-40
- 崩落先タイルに buryTimer=5sec、上にいるちびわふが dt×0.15 確率で `buried_alive`

### Σ-3 3 地形 procedural 生成
- `terrainSeed` を runId から派生、save に persist（v11→v12）
- beginner=平野（海 0 タイル）、standard=半島（海 ~1355 + 半島 3 本）、hell=島（海 ~2373 + 崖帯）
- `isSeaAt(x,y)` が `DRY_Y_LIMIT` を置換、既存コード（溺死判定/オオカミ/フラナ投げ）も移行済
- `findDryTile` で spawn/feature/obstacle が海を回避

### Σ-2.5 地形可視化
- stage.ts に `terrainStaticLayer` + `terrainTransientLayer` 追加、material×elev ブライトネスで 5700 タイル描画（90f 再ベイク）
- 隣接 elev 差 ≥15 の境界に黒線（崖ライン、cliff_fall 発火ラインの可視化）
- stability <0.5 = 橙パルス 3Hz、<0.3 = 赤パルス 5Hz
- terraform ジョブに半透明色オーバーレイ + 橙の進捗リング

### Σ-4 Three.js 3D レンダラー（本流統合済み）
- `src/render/stage3d.ts`（約 1060 行）が唯一のステージ実装。Pixi `stage.ts` は Σ-4-f で削除済み。
- **座標系**：world(x,y) → Three.js(x, elev×5, y)。カメラは `(camX, h, camZ+h)` から `(camX, 0, camZ)` を向く fov=20° / 45° 俯瞰固定（回転封印）。
- **地形**：100×57 タイル → 101×58 頂点 PlaneGeometry。頂点 elev は隣接 4 タイル平均で平滑化（`buildTerrainGeo`）。MeshToonMaterial + vertexColors + Toon gradientMap。
- **elevAt() は bilinear**：メッシュ頂点と同じ平滑化式で標高を返す。タイル中心 elev をそのまま返すと埋もれ / 浮きが起きるため必須。
- **スプライト**：既存 9 ポーズ PNG を Y 軸ビルボード（PlaneGeometry、+Z 向き固定、左右反転で faceLeft）。floodFillAlpha で白背景除去。MeshBasicMaterial + 手動 color tint で夜間 / 天候に反応。
- **オオカミ / 死体 / feature / obstacle** も全て sprite billboard。建物のみ BoxGeometry + ConeGeometry + Lv 表示 CanvasTexture。
- **Raycaster picking**：pointerdown/contextmenu でスプライトメッシュに直接当てて HitTarget を返す。外れたら CPU hitFn フォールバック。ドラッグ位置（`screenToWorld`）も terrainMesh への raycast で高台でもずれない。
- **InstancedMesh 最適化**：terraform オーバーレイ（raise/lower）と stability 警告（warn/crit）は使い回し、毎フレーム dispose なし。
- **崖線**：隣接 elev 差 ≥15 の境界を黒 LineSegments で描画。土砂崩れ時は前フレーム elev 比較で茶色パーティクル煙（0.5s fade）。
- **昼夜・天候**：dayPhase/weather.kind ごとに AmbientLight/DirectionalLight + sky + fog + スプライト手動 tint を切替。
- **吹き出し**：DOM overlay + `camera.project()` で worldToScreen 変換、`translate3d` で追従。
- **StageHandle インターフェース**は stage3d.ts 内で定義。`canvas: HTMLCanvasElement` + `onResize(cb)` を直接公開（旧 Pixi `Application` shim は撤廃）。

### Ω-6 電力（インフラ並行系、本流統合済）
- 発電所 `generator`：ちびわふが近くでペダル→ power 生産
- 街灯 `streetlamp`：夜間の視界補助 + オオカミ忌避
- 電線 `powerline`：発電所から街灯まで BFS 接続グラフで伝搬、途中で切れると機能停止
- 感電死 `electrocution`：電線に触れると確率発動
- 落雷 `thunder_blast`：storm 中に発電所へ確率落雷→爆発→周囲巻き込み

### Ω-7 生産チェイン（P1 完了 + P2/P3 統合済）
- 製材所 `sawmill`：近くのちびわふが wood×2 → plank×1 変換（Ω-7 P1、神社などの建材）
- 精錬所 `kiln`：stone×2 → brick×1（Ω-7 P2）
- 牧場 `pasture`：wool/sec 生産、織機 `loom`：wool→cloth 変換（Ω-7 P3）

### セーブ
3 スロット、起動時にスタート画面で選択 or 新規 + 難度選択。version 12。
保存対象：meta（runId/difficulty）、points、統計、buildings、features、obstacles、resources、weather、**terrain（RLE 圧縮）**、**terrainSeed**、**terraformJobs**。
**chibis / npcs は persist しない**（毎ロード再生成）。

## コミット規約

```
<phase>: 一行サマリ

詳細本文。何をなぜ変えたか、影響範囲、次フェーズ案内を書く。

https://claude.ai/code/session_XXXXXX
```

- **フェーズラベル**：`Ω-0-a` `Ω-1` `Ω-2-b` のように階層
- **本文**：変更箇所・理由・影響・スモーク結果・次
- **末尾署名は必須**（Claude Code 標準、session URL）
- `git add -A && git commit -m "..."` で運用
- 1 コミット 30-60 分、小さめに刻む

## 進行状況

### 完了フェーズ（Ω 系：土台）

| Phase | 内容 | Commit |
|---|---|---|
| Ω-0-a | セーブスロット 3 + 難度選択 + Run メタ | e081e56 |
| Ω-0-b | 難度効果を全システムに適用 | a5b40d3 |
| Ω-0-c | ワールド拡大 3200×1800 | 76cc928 |
| Ω-0-d1 | カメラ UX（WASD/F/R/ミニマップ） | f7bb5c9 |
| Ω-0-d2 | 空間分割ハッシュ | 236cc49 |
| Ω-1 | 気象 9 種 + 3 日予報 + 効果 | 4b8d120 |
| Ω-2 | 水理システム（水流計算・洪水・流し） | 425ff93 |
| Ω-2-b | 背景 procedural 固定（3200×1800） | 71f4855 |
| Ω-3 | 住居・夜間睡眠・野宿ペナルティ | c61cd19 (+fix a82ea68 / 6fca1fa / dc49362) |
| Ω-3-b | 高低差地形（水は下流へ、高台は洪水安全） | 846118d |
| Ω-4 | 災害対策 feature（井戸・火の見やぐら） | dfe30bc |
| Ω-5 | オオカミ襲撃 + 夜間戦闘 | a69a1bc |
| Ω-7 P1 | 生産チェイン（製材所 wood→plank） | cac8519 |
| Ω-9 P1 | 神社 feature（plank 消費建築） | 49fdb70 |
| polish | 警告 toast / 神社 ✨ / ログタブ戦績 | 4fd4609 / a42ecb5 |
| refactor | バグ 6 件修正 + パフォーマンス最適化 | 67b75c2 |

#### ✅ 本流統合済みのインフラ系（旧 `claude/review-progress-XaRZT`、2026-04-21 に本流 merge）

| Phase | 内容 | Commit |
|---|---|---|
| Ω-6 P1 | 電力システム（発電所 + 街灯） | 28421bb |
| Ω-6 P2a | 電線 feature + 接続グラフ（BFS） | e725958 |
| Ω-6 P2b | 感電死 + 落雷で発電所爆発（storm イベント） | be7a4a5 |
| Ω-7 P2 | 精錬所（kiln）+ brick リソース（stone→brick） | ade91ac |
| Ω-7 P3 | 牧場（pasture）+ 織機（loom）（wool/cloth） | 6459eb0 |

**追加された FeatureKind**：`generator / streetlamp / powerline / kiln / pasture / loom`
**追加された死因**：`electrocution / thunder_blast`

#### ✅ Σ-4 Three.js 3D レンダラー本実装（2026-04-23 に本流 merge）

| Phase | 内容 | Commit |
|---|---|---|
| Σ-4-a/b/c/d | 地形メッシュ + キャラ billboard + world オブジェクト + 3D FX | 8985ab9 |
| Σ-4-e | Raycaster ベースの GPU ピッキング | 3f39e28 |
| Σ-4-f | VITE_RENDER=3d フィーチャーフラグ + vite-env.d.ts | 1bfc26e |
| レビュー修正 | キャラ夜暗転 / オオカミ billboard / 崖線 | 7ab9548 |
| レビュー修正 | 土砂崩れ煙 / 建物 Lv / 難度カメラ | 3dc921a |
| レビュー修正 | InstancedMesh / キー重複削除 / TODO | 964c669 |
| merge | sigma-4-main-xhp2Y → idle-village へ統合 | c252374 |
| render fix | elevAt bilinear / stwXZ raycast / 夜ティント漏れ | 3fa80c9 |
| Σ-4-f 完了 | stage.ts + sprites.ts 削除、Pixi 依存撤去、StageHandle 移設 | eba53e5 |

#### ✅ Σ-5 開発ゲーム体感化（2026-04-23 に本流 merge）

| Phase | 内容 | Commit |
|---|---|---|
| Σ-5-a | 労働 AI：terraform ジョブ自発移動（70%、nonbiri 40%）、trait バイアス、ChibiState 'scared' 型追加、fled_to_exhaustion 死因型定義 | ff26376 |
| Σ-5-b | feature 3D モデル化：water=池 / channel=溝（saturated で青く） / farm=作物成長段階 / house/well/firewatch/sawmill/shrine/kiln/pasture/loom などを建物形状に | 1ff36fa |
| Σ-5-c | HUD フィードバック：terraform 進捗バー HTML overlay（▲盛 45% (2人) 表示、60s 無人で警告）、farm/channel/powerline 孤立時 toast | a3019d8 |
| Σ-5-d | 狼 flee：80px 検知 → scared、1.3 倍速逃走、家/火の見やぐら 40px sanctuary、疲労 60+ で collapse → fled_to_exhaustion | 4b3604d |
| 型修正 | stage3d traverse callback 型注釈 | ceb973d |
| Σ-5-d balance | flee 疲労 +18/sec / collapse 60、wolf_bite : fled_to_exhaustion = 5:1 で安定 | 7f88057 |
| merge | sigma-5-main → idle-village 統合 | 9fb5b75 |
| 後処理 | dead code `pickWorkTarget` 削除（70 行） | 449cb48 |

**追加された ChibiState**：`scared`
**追加された死因**：`fled_to_exhaustion`

#### ✅ Σ-5-e 建設ゲームループ + feature 識別 + 水源建設（2026-04-23 に本流 merge）

| Phase | 内容 | Commit |
|---|---|---|
| 事前 fix | 建設時の 28px 最小間隔制約を撤廃、水路ぎゅうぎゅう詰めや建物重ね置きを許可 | a7f5448 |
| Σ-5-e-a/b | HitTarget に feature/building 追加、updateConstructions + CONSTRUCTION_SEC テーブル、既存機能に devLevel<2 ガード 10 箇所 | 4a010ff |
| Σ-5-e-a/b | main.ts：showFeatureModal / showBuildingModal、建設 spawn を devLevel 0 で、soil コスト対応 | 7c43325 |
| Σ-5-e-a/c/d | stage3d：feature/building Raycaster picking、devLevel 別 3D（足場 + 半透明 + 🔨）、UV scroll 水流、水源波紋リング、HUD 建設進捗バー | dc93a75 |
| Σ-5-e-d | index.html：💧 水源 建設ボタン追加 | cd161f8 |
| merge | sigma-5-e-main → idle-village 統合 | 3e3be42 |
| 後処理 | water コストに soil 10 追加（spec 通り）+ docs 更新 | （本コミット） |

**追加された BuildKind**：`water`（プレイヤー新規水源建設、wood 0 / stone 5 / soil 10）
**追加された feature lifecycle**：devLevel 0 = 建設中（機能なし） / 1 = 半完成 / 2 = 機能開始 / 3 = Lv アップ
**追加された AI 行動**：構築中 feature への自発移動（`constructionPositions`）

### ロードマップ v2（地形・3D 化）【Σ-5 / Σ-5-e まで完了】

**方針**：Σ-0〜Σ-5-e で 3D 地形・描画基盤 + 開発ゲーム体感（労働 AI / feature 3D 化 /
HUD 進捗 / 狼 flee）+ 建設ゲームループ（devLevel 労働駆動）+ feature 識別モーダル +
水源建設 + 水流アニメが完成。次は Σ-5-e-e（建設を秒ベースから数値 pt ベースに変更、
くそざこ事故で進捗マイナス）or Σ-6 歩行アニメ or Σ-6 水動力など（HANDOFF.md §6 参照）。
**ビジョン**：巨人のドシン × ピクミン × Don't Starve × Elona。なめらかな 3D 地形で
神様が盛り土切り土を指示、ちびわふ 200+ がわちゃわちゃ動き回り、**改変がズボラで土砂崩れ事故で全滅**。
**マインクラフト要素**＝**ブロック見た目ではなく破壊/創造の自由度**（既に Σ-2 で実装済み）。

| Phase | 内容 | 期間 | 状態 |
|---|---|---|---|
| **Σ-0** | **掃除パス**：landmarks 系一式廃止 + `public/mockup/background.png` 削除 + 石パン系の flavor 保持 rename | 1 日 | ✅ 完了 |
| **Σ-1** | **2.5D z 物理**：`flight` に `vz/posZ` 追加、崖落下ダメージ、坂勾配で移動ペナルティ＋滑落死、激流もがき（水路 flow で vx/vy 継続加算） | 1 週 | ✅ 完了 |
| **Σ-2** | **タイル式ハイトマップ化**：`getElevation(x,y)` 関数 → 32px セルの 2D 配列データに移行、`{elev, material, stability, water}`、地形編集 API、`raiseTile/loweTile`、stability 計算、土砂崩れ災害、`landslide_crush/buried_alive` 死因追加 | 1 週 | ✅ 完了 |
| **Σ-3** | **3 地形 procedural 生成**：beginner=平野、standard=半島、hell=くそざこ島。ハイトマップ＋海マスクをシードで生成。既存 `DRY_Y_LIMIT` 一律泥川の前提を破棄 | 3 日 | ✅ 完了 |
| **Σ-2.5** | **地形可視化 + 素材バランス**（Σ-3 後追い）：stage.ts に標高色分け + 崖線 + terraform ジョブ UI + stability 警告パルスを追加。初期資源と建築コストを実プレイ向けに再調整。Σ-3 まででデータは生成されるが 2D 描画に出ないので、Σ-4 Three.js を待たず 2D Pixi のまま見せて遊べる状態にする | 2-3 日 | ✅ 完了 |
| **Σ-4-proto** | **Three.js 検証プロト**（`prototypes/three-terrain/`、`origin/claude/sigma-4-proto` 保管）。5 項目実測 GO | 1 週 | ✅ 完了（**fps=75 / drawCalls=5 / DOM sync=0.01ms (0.1%)**、5 項目全 GO） |
| **Σ-4** | **Three.js 本移行**：`stage3d.ts` 新設、feature flag `VITE_RENDER=3d` で `stage.ts` と並行、parity 達成後に Pixi 削除。elev×5 displace、45° 固定俯瞰、Y 軸ビルボード、盛り土切り土の 3D 反映、土砂崩れアニメ、わちゃわちゃキャラ（歩行 pose animation） | 2 週 | ✅ 完了（Σ-4-a/b/c/d/e/f 全て本流統合、Pixi 削除済み）|
| **Σ-5** | **開発ゲーム体感化**：ちびわふ労働 AI（terraform ジョブ自発移動 70%、trait バイアス、nonbiri 40%）、feature 3D モデル化（water=池/channel=溝/farm=作物成長/house/firewatch/sawmill/shrine/kiln/loom 等が建物として識別可能）、HUD terraform 進捗バー + 連鎖ヒント toast、狼 flee（80px 検知 → 1.3 倍速逃走 → 疲労 collapse → fled_to_exhaustion 新死因、家 / 火の見やぐら sanctuary） | 1-2 週 | ✅ 完了（Σ-5-a/b/c/d + バランス調整、48 死因到達、wolf_bite : fled_to_exhaustion = 5:1）|
| **Σ-5-e** | **建設ゲームループ + feature 識別 + 水源建設**：プレイヤー建設は devLevel 0 で spawn → ちびわふ労働で workSec 蓄積 → devLevel 2 で機能開始、右クリックで feature / building の識別モーダル（効果説明 + 進捗表示）、BuildKind に 💧 水源追加、channel UV scroll 水流アニメ + water 波紋 | 1-1.5 週 | ✅ 完了（Σ-5-e-a/b/c/d + 28px 撤廃 + water soil コスト追加）|

### Σ-5 完走後の予定（優先度順）

- **歩行アニメ**（旧 Σ-5）：`stage3d.ts` に 0.3 秒 atlas 切替、Σ-5 で労働の見た目が改善したら続いて着手。1 週
- **Ω-12** 採用済み⑦**潮汐** ＋ ⑧**神罰**：3D で映える、Σ-3 島地形を生かす。1-2 週
- **Ω-4 継続** 災害 P1 拡張（火災、熱波、消防署）：Σ-4 の土煙パーティクル流用
- **Ω-5 拡張** クマ/疫病/地震/野盗（+ 採用済み②**病気＆集団感染**）
- **Ω-6 P3〜** 電力拡張（複雑な電気回路、停電、過負荷）
- **Ω-7 P4〜** 生産チェイン拡張（ガラス、金属精錬、調合）
- **Ω-8** 指示系統（ゾーン矩形 / 投げ縄 / 直接命令）— Σ-5 の労働 AI を前提に再設計
- **Ω-9 P2〜** 社会・士気（学校、酒場、風呂）＋ 採用済み⑥**カルト宗教化**
- **Ω-10** 監督委任（フラナ/スズに job 委託）
- **Ω-11** メタ進行（ラン終了、累計アンロック、図鑑拡張）

### 採用済み新アイデア（Σ-1 以降に組み込み）

- **② 病気＆集団感染**：咳→伝染→パンデミック、温泉/薬草で治療、放置で集団死
- **⑥ カルト宗教化**：player-built 神社、教祖くそざこ、儀式死、フラナ機嫌暴落
- **⑦ 潮汐システム**：海面周期 ±、干潮中のくそざこ→満潮で取り残され溺死（Σ-3 以降、島/半島のみ）
- **⑧ 神罰（隕石/雷撃）**：プレイヤー究極のストレス発散、クールダウン、巻き込み多数

### 棄却アイデア（採用しない、議論再開不要）

- 世代交代＆性格遺伝（長ラン複雑化）
- 恋愛・三角関係（スコープ過大）
- 遺言＆英雄伝承（実装コスト vs 体験価値）
- 祟り／悪霊（プレイヤー罰則がチーム性と合わない）

## 3D 化の核指針（Σ-4 の憲法）

Plan agent 分析による Top 5 決定事項。迷ったらここに戻る。

1. **既存 9 ポーズ PNG を Y 軸ビルボード＋左右反転で流用＋ blob shadow**
   アート再発注ゼロで 3D 化できる最大の武器。カメラ回転は封印する前提で成立。ドット絵/水彩への差し替えは texture atlas 差し替えだけで済む
2. **Perspective fov 18-22° ＋固定 45° 俯瞰 ＋ 3 段階 discrete ズーム、回転なし**
   巨人のドシンの「盆栽棚を覗き込む神」感。画面酔い回避、学習コスト最小
3. **PlaneGeometry displace ＋ Splatmap（草/土/砂/岩 を高度・傾斜で自動配分）＋ Toon シェーダ**
   Σ-2 のハイトマップ配列と 1:1 対応。崖落下の恐怖が視覚化、盛り土が直感的に盛り上がる
4. **sim は `{x, y}` のまま、z は `getHeight(x, y)` で render 側が派生**
   **アーキテクチャ鉄則**。撤退コスト最小、`scripts/sim.ts` も既存 save もそのまま通る。sim に 3D 固有ロジックを絶対埋めない
5. **HUD は DOM のまま、bubble は world → screen 変換でハイブリッド配置**
   テキスト可読性と世界没入の両取り。`camera.project()` で位置を毎フレ translate3d

### 段階移行の作法

- `src/render/stage.ts` と並行して `src/render/stage3d.ts` を新設、同じ `StageHandle` インターフェース実装
- 環境変数 `RENDER=3d` or 設定フラグでスイッチ可能に
- feature parity 達成したら旧 `stage.ts` 削除 → Pixi を devDep から外す
- 撤退判定ポイント：Σ-4-proto の 5 検証項目 / Σ-1 と Σ-4 の同一 seed 録画比較

### ブランチ運用（現時点のトポロジー）

```
origin/claude/idle-village-game-7IfPd       ← 本流（Σ-0/1/2/2.5/3/4 + Ω-6/7 + docs 全部入り）
└─ claude/character-image-brainstorm-rxHdJ  ← キャラアセット仕様書（docs/ v0.4 系、並行作業中）
```

**整理済み状況（2026-04-23）**：Σ-4 本実装が完了して本流へ merge 済み。
Pixi は完全削除、Three.js のみで動作。merge 済みブランチ（sigma-4-main-xhp2Y、
sigma-4-proto）は削除済み。

**運用ルール**：
- 日常プレイ・開発は `idle-village` だけで OK（pull 一本で最新）
- 新フェーズ実装時は `claude/<phase>-*` ブランチを `idle-village` から切る
- 実装完了後に本流へ merge → 作業ブランチは削除

## 削除予定（Σ-0 掃除パスで実行）

| 対象 | 理由 |
|---|---|
| ~~`src/sim/landmarks.ts` 全体~~ | ✅ Σ-0 で削除済み |
| ~~`WorldState.landmarks` フィールド + セーブ項目~~ | ✅ Σ-0 で削除済み |
| ~~`Chibiwafu.targetLandmarkId` + `pickLandmarkTarget` in chibiwafu.ts~~ | ✅ Σ-0 で削除済み |
| ~~`drawLandmark` + `landmarkLayer` in stage.ts~~ | ✅ Σ-0 で削除済み |
| 哲学石特殊挙動 (world.ts 1769-1785) | カルト儀式（採用済み⑥）実装時に機能移転予定、それまで保留 |
| ~~`chats.ts` の `landmark_*` 6 エントリ~~ | ✅ Σ-0 で削除済み |
| ~~`public/mockup/background.png` (3.5MB)~~ | ✅ Σ-0 で削除済み |

**ニュアンス保持で rename 残し**：
- 死因 `石パンで歯折れ` / 窒息死 → 「硬い木の実で歯折れ」「どんぐり窒息」にフレーバー変更
- flavor trait `"石パンに目がない"` → ラベルのみ残す
- hazards.ts:86 の石パン hazard → 同上

**保留（split 運用が安定なら削除可）**：
- `public/chibiwafu.png` / `public/furana.png` (計 2MB) — split 9 ポーズのフォールバック

## 既知の注意点・quirks

- **world.ts が 3,200+ 行**：Σ-2/3 で膨張、`disasters.ts` / `terraform.ts` への分割が候補
- **sim.ts balance assertion は pre-existing failing**（top share > 22%、mudriver 独占等）、ブロッカーではない。Σ-3 の 3 地形化で mudriver 独占は緩和済だが hell の均衡は継続調整
- **save v12**：terrain を RLE 圧縮で persist、terrainSeed も含む。v11 以下は ensurePlots で procedural 再生成
- **Vite MPA 設定必須**：`vite.config.ts` に `appType: 'mpa'` がないと dev server が SPA fallback で root `index.html` を返し、`prototypes/three-terrain/` 等のサブページが見えない（Σ-4-proto 実機確認時に判明）。現在は設定済
- **chibi death cause "fatigue_death"** は P1-C1 時点で ほぼ発火せず（hunger 死が先）、P2 で食料ある状態で初めて顕在化
- **Three.js の `elevAt` 実装**：メッシュ頂点と同じ「隣接 4 タイル平均」で bilinear 補間しないと、キャラ / feature の Y が地形表面と一致せず、周囲より低いタイルで埋もれ、高いタイルで浮く。新たに高度を使うコードを書くときは必ず `elevAt(wx, wy)` を使う
- **Three.js `screenToWorld`**：`Plane(Y=0)` 交点ではなく `terrainMesh` への raycast を優先する。高台ではマウス位置と実メッシュ表面がズレるため、raycast しないとドラッグ位置が奥へワープする
- **カメラ回転は封印**：Y 軸ビルボード前提が崩れるので `OrbitControls` など導入禁止。スプライトが横から見えてしまう
- **`DRY_Y_LIMIT = 1150` 南側一律泥川**：Σ-3 で 3 地形化すると前提崩壊、`hazards.ts` の mudriver/bridge/季節ゾーンも再設計対象（`isSeaAt` に移行済、DRY_Y_LIMIT は legacy）
- **Σ-5 で解消予定の体感問題**（Σ-4 完了時点で判明、2026-04-23）：
  - 労働 AI が偶発（chibiwafu.ts L176-186 の 35% 確率 wander）で `terraformJobs` / 障害物採取が自発的に進まない → 「terraform 置いても地形変わらない」体感
  - `featTex()` (stage3d.ts L250-258) が全 feature を色違いの円盤 1 枚で描画 → water/channel/farm/house 等が「丸置いた」だけに見える
  - HUD に terraform 進捗・saturated 状態・作業者数のフィードバックなし → 正しく機能しても気づけない
  - 狼 flee 行動なし（updateChibi L1657-2100 に検知処理ゼロ）→ 狼速度が 2.3〜3.7 倍速なのに逃げず一方的に狩られる
  - 上記 4 点は Σ-5 で一括対応（labor AI / feature 3D モデル化 / HUD 進捗バー / 狼 flee + sanctuary）

## よくある作業パターン

### 新機能追加

1. `TodoWrite` でタスク分解（3-6 ステップ）
2. types.ts に型追加 → sim/world.ts に状態フィールド追加 → 挙動関数 → render/stage3d.ts に描画 → render/ui.ts に HUD
3. `npx tsc --noEmit` で型チェック
4. `npx tsx -e "..."` か `npx tsx scripts/sim.ts` でスモーク
5. コミット（規約に従う）

### バランス調整

- `DIFFICULTY_MODS` か関数ごとの数値リテラル（例 `c.hunger += dt * 1.2 * ...`）を触る
- sim.ts を回して death 率・食料収支を確認

### セーブ互換性

- 型変更したら `save.ts` の `SaveData` / load 関数に migration 追加
- `CURRENT_VERSION` を +1

## アセット計画

仮グラフィックで全部組んでから ChatGPT に発注する方針。
現在発注済み：ちびわふ 9 ポーズ / フラナ 9 ポーズ / 背景 mockup。
発注予定：気象エフェクト、家 3 種、水路拡張、災害エフェクト、オオカミ・クマ、UI アイコン、職業装飾 overlay。

### 拡張 2.5D キャラ構成（Σ-4 前後で投入予定）

**方針**：ちびわふ 200 体は 2D billboard のまま据え置き（再発注ゼロ、くそざこ味キープ、InstancedMesh 1 draw call）。
表情・状態を可視化するためレイヤー合成で「生き生きと、くそざこく」動かす。
カメラ回転は封印前提（核指針 2）なので Y 軸ビルボードのみで完結。

#### 描画レイヤー（下から順に積む）

1. **blob shadow**（地面に乗る丸影デカール、別 sprite）
2. **body base**（既存 9 ポーズを **20 ポーズに拡張**）
3. **face overlay**（表情だけの透過 PNG、10 種）
4. **status overlay**（包帯/泥/血/涙/汗/キラキラ/咳/屁 の 8 種、複数同時可）
5. **equipment overlay**（帽子/棒/カゴ/リボン 等、将来の職業・ランク表現用）
6. **tint shader**（機嫌で色相シフト：怒り→赤み / 病気→緑み / 疲労→彩度低下）

#### ファイル構成

```
public/chibiwafu/
  body/    01-09（既存） + 10-20（新：tumble_a/b/c, drown, cough, dead_x,
                                work_a/b, scared, dance, cry）
  face/    neutral, happy, sad, angry, hungry, sick, scared, dead, sleepy, blush
  status/  bandage, dirt, blood, tears, sweat, sparkle, cough_cloud, fart_cloud
  equipment/ hat_straw, stick, basket, ribbon, ...
  meta.json  ← 各 body ポーズの face/status/equipment 貼り付け座標
              （px オフセット＋回転角、tumble 系は角度付き）
```

`meta.json` があれば顔 atlas を 1 セット描くだけで全ポーズに流用できる。

#### 実装スケッチ

```ts
interface ChibiSprite {
  body: Texture;         // state から選ぶ
  face: Texture;         // hp/hunger/fatigue/mood で決定
  statuses: Texture[];   // 複数重ね可（包帯＋泥 とか）
  equipment?: Texture;
  tint: number;          // moodTint(c) で算出
}
```

#### 投入優先順（コスト小→大）

| 優先 | 発注内容 | 効果 |
|---|---|---|
| 1 | 顔 atlas 10 表情 | 200 体が表情豊かに。最小コストで最大効果 |
| 2 | status overlay 8 種 | 病気・泥・涙で状態可視化、因果連鎖が見える |
| 3 | body 拡張 11 ポーズ | 死・労働・溺死・滑落の演出が映える |
| 4 | equipment overlay | ランク / 職業 / カルト祭服 等の差別化 |

### ChatGPT 発注テンプレ（ちびわふ整合性キープ）

**共通ルール**（全発注の冒頭に固定で貼る）：

> 既存ちびわふ（参照画像 `01_idle.png`）と完全に同じ：線画の太さ・色、カラーパレット、
> アンチエイリアス強度、頭身比率（2.2 頭身）。キャンバス 512×512px、透過背景、中央配置。
> 影・発光・グラデーションなし（セルシェーディングのフラット塗り）。

**発注 1：body 拡張 11 ポーズ** — tumble_a/b/c（空中で傾き・倒立・落下）、drown（水中で両手突き出し）、cough（前かがみ咳き込み）、dead_x（横たわり x_x 目）、work_a/b（棒を振り上げ／振り下ろし）、scared（両手頭ヘナヘナ）、dance（両手上げ跳ねる）、cry（しゃがんで顔覆う）。各 1 枚ずつ別 PNG、顔は中央 128×128 に収める（顔差分で差し替え可能）。

**発注 2：顔 atlas 10 表情** — 頭部のみ 128×128 透過で、neutral / happy / sad / angry / hungry / sick / scared / dead(x_x) / sleepy / blush。頭の輪郭は全表情完全一致、目口のみ差し替え、位置ずれ 1px 以内。

**発注 3：status overlay 8 種** — **キャラ本体を描かず装飾のみ** 512×512 透過で、bandage / dirt / blood / tears / sweat / sparkle / cough_cloud / fart_cloud。後から PNG を重ねて使う用。

**発注 4：equipment overlay**（任意）— 装備単体 512×512 透過で、麦わら帽子 / 棒 / カゴ / リボン / カルト祭服 等。キャラ本体なし。

**Tips**：
- 発注 1〜4 を別チャットに分け、各チャット冒頭で 1 回だけキャラ参照を添付
- 1 枚目が良ければ「このまま続けて、次は〇〇」でシリーズ化（画風が固定される）
- ブレたら「1 枚目と完全に同じ線と色で」と何度でも念押し
- 背景が残ったら既存 `sprites.ts` の白抜き flood-fill を通す

### 3D 化する候補 vs しない候補

| 対象 | 3D 化 | 理由 |
|---|---|---|
| オオカミ / クマ / 将来の敵 | ◎ | ちびわふ 2D と対比して「異物感・恐怖感」を演出、数も 5-10 体でコスト許容 |
| 建物 | ◎ | Σ-4 で地形が 3D 化するので整合性必須、PlaneGeometry + Toon で作る |
| 神罰エフェクト（隕石・雷撃） | ○ | パーティクルと一体で 3D 映え |
| NPC 4 体（フラナ・スズ・ココン・ルー） | △ 保留 | 特別感は出るが浮くリスク、Σ-4 完走後に判断 |
| **ちびわふ 200 体** | **× 棄却** | チープ＝くそざこ味、billboard のままが最適解 |

## 開発の「くそざこ味」を保つための自戒

- 死因を増やすときは **面白い瞬間** を想像して設計（単なる確率死じゃなく「あっそうなるんだ」みたいなネタ）
- セリフプールは **キャラ違いと機嫌違い** で分ける。一つの pool に混ぜると凡庸化
- 「リアルサバイバル × 小学校低学年日記」のトーン混合が持ち味
- ちびわふ同士の絡み（chat / 野次 / もらい泣き / ざまあみろ 等）が村を "生きてる" 感のコア
