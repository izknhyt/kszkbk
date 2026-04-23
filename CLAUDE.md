# くそざこ村 — Claude 開発ガイド

このファイルは新しい Claude セッションでプロジェクト状態を即座に把握するためのメモ。
大きな設計変更があったら都度更新。

---

## 概要

2D トップダウンの **サバイバル × 開拓 × くそざこコメディ** idle ゲーム。
プレイヤーは神様（= 殴り投げる役）として、200+ ちびわふを抱える村を
育てつつ災害を凌ぐ。SimCity + RimWorld + 放置ゲー的ジャンル合成。

## 技術スタック

- Vite 5 / TypeScript 5.4 / PixiJS 8（ESM）
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
  types.ts               全型定義（Chibiwafu / Feature / Obstacle / Weather 等）
  main.ts                エントリ。ゲームループ、UI イベント、スタート画面
  sim/
    world.ts             【中心】WorldState, tickWorld, 各 update* 関数群（2,885 行）
    chibiwafu.ts         spawnChibiwafu, wanderStep, DRY_Y_LIMIT
    npcs.ts              NpcState, NPC_DEFS, セリフプール、createNpcs
    chats.ts             会話セリフ（GENERIC/TRAIT/CHEEKY/反応系多数）
    deaths.ts            DEATH_CAUSES カタログ（40+ 種）
    hazards.ts           HazardZone データ定義、mudriver/bridge/季節ゾーン
    traits.ts            20 種の性格特性
    flavorTraits.ts      82 種のフレーバー ラベル
    flavorBehaviors.ts   フレーバーに紐づく挙動 & EMBARRASSING_FLAVORS
    personality.ts       10 軸パラメータ生成＆派生関数
    events.ts            季節 / DayPhase / GlobalEvent 型
    landmarks.ts         石パン岩 / 哲学石 等の固定 POI【Σ-0 で廃止予定】
    bubbles.ts           吹き出しキュー
    rank.ts              4 段階ランク (村/集落/町/都)
    naming.ts            ちびわふ名前プール
    spatialHash.ts       空間分割ハッシュ（O(n²)→O(n)）
  render/
    stage.ts             PixiJS 描画、カメラ制御、気象ティント、日時計（1,535 行）
    sprites.ts           スプライトシート読込 & 白背景 flood-fill 透過
    ui.ts                HUD 更新、ビルドパネル、統計表示
  meta/
    save.ts              3 スロット save/load、version 10、runId/difficulty 保持
index.html               start-screen + HUD + minimap canvas
scripts/sim.ts           headless バランス計測、難度比較に使う
public/
  chibiwafu/{01-09}_*.png    ちびわふ 9 ポーズ（ChatGPT 生成）
  furana/{01-09}_*.png       フラナ 9 ポーズ
  mockup/{bg,buildings,props}.png  背景＆環境アート
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

### 労働ループ
- 障害物近傍 28px にちびわふがいると HP -0.5/sec × ワーカー数
- 破壊で wood/stone 生産（rock→stone×2 / stump→wood×2 / bush→wood×1）

### 気象効果
- 畑：drought/snow 停止、rain 加速、heatwave 半減
- ちびわふ：heatwave hunger×1.5、snow で軽い HP ドレイン

### プレイヤー操作
- 左クリック：ちびわふ or NPC を殴る（HP ダメージ）
- 右クリック：モーダル表示（ちびわふは生涯ログ、NPC は HP/機嫌/最近のログ）
- ドラッグ：掴んで移動、離すと速度×0.55 秒の物理投げ（弧を描く、軌道上の他個体を巻き込み）
- 水中投げ：ちびわふ即溺死、NPC は -10 HP
- 建設モード：HUD のボタン → 任意座標クリックで feature 設置（wood/stone 消費）

### セーブ
3 スロット、起動時にスタート画面で選択 or 新規 + 難度選択。
保存対象：meta（runId/difficulty）、points、統計、buildings、features、obstacles、resources、weather。
**chibis / npcs / landmarks は persist しない**（毎ロード再生成）。

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

#### 🚧 並行作業中のインフラ系（`claude/review-progress-XaRZT` ブランチ、本流に未 merge）

| Phase | 内容 | Commit |
|---|---|---|
| Ω-6 P1 | 電力システム（発電所 + 街灯） | 28421bb |
| Ω-6 P2a | 電線 feature + 接続グラフ（BFS） | e725958 |
| Ω-6 P2b | 感電死 + 落雷で発電所爆発（storm イベント） | be7a4a5 |
| Ω-7 P2 | 精錬所（kiln）+ brick リソース（stone→brick） | ade91ac |
| Ω-7 P3 | 牧場（pasture）+ 織機（loom）（wool/cloth） | 6459eb0 |

**追加された FeatureKind**：`generator / streetlamp / powerline / kiln / pasture / loom`
**追加された死因**：`electrocution / thunder_blast`

### ロードマップ v2（地形・3D 化）【現在のメイン路線 / 最優先】

**方針**：3D 路線（Σ-0〜Σ-4）を先に完走、その後にインフラ路線（Ω-6/7 の正式統合 + 残タスク）再開。
**ビジョン**：巨人のドシン × ピクミン × くそざこマインクラフト。
神様が盛り土切り土を指示、ちびわふが労働、**改変がズボラで土砂崩れ事故で全滅**。

| Phase | 内容 | 期間 | 状態 |
|---|---|---|---|
| **Σ-0** | **掃除パス**：landmarks 系一式廃止 + `public/mockup/background.png` 削除 + 石パン系の flavor 保持 rename | 1 日 | ✅ 完了 |
| **Σ-1** | **2.5D z 物理**：`flight` に `vz/posZ` 追加、崖落下ダメージ、坂勾配で移動ペナルティ＋滑落死、激流もがき（水路 flow で vx/vy 継続加算） | 1 週 | ✅ 完了 |
| **Σ-2** | **タイル式ハイトマップ化**：`getElevation(x,y)` 関数 → 32px セルの 2D 配列データに移行、`{elev, material, stability, water}`、地形編集 API、`raiseTile/loweTile`、stability 計算、土砂崩れ災害、`landslide_crush/buried_alive` 死因追加 | 1 週 | ✅ 完了 |
| **Σ-3** | **3 地形 procedural 生成**：beginner=平野、standard=半島、hell=くそざこ島。ハイトマップ＋海マスクをシードで生成。既存 `DRY_Y_LIMIT` 一律泥川の前提を破棄 | 3 日 | ✅ 完了 |
| **Σ-2.5** | **地形可視化 + 素材バランス**（Σ-3 後追い）：stage.ts に標高色分け + 崖線 + terraform ジョブ UI + stability 警告パルスを追加。初期資源と建築コストを実プレイ向けに再調整。Σ-3 まででデータは生成されるが 2D 描画に出ないので、Σ-4 Three.js を待たず 2D Pixi のまま見せて遊べる状態にする | 2-3 日 | ✅ 完了 |
| **Σ-4-proto** | **Three.js 検証プロト**（捨てプロト、1 週）。5 項目通れば本実装着手：① PlaneGeometry displace 60fps、② InstancedMesh 200 sprite 1 draw call、③ GPU picking、④ camera.project DOM 同期、⑤ 既存 PNG billboard の見え方 | 1 週 | 未着手 |
| **Σ-4** | **Three.js 本移行**：`stage3d.ts` 新設、feature flag で `stage.ts` と並行、parity 達成後に Pixi 削除。ビルボード＋ Toon 地形＋ splatmap＋ blob shadow | 2 週 | 未着手 |

### ロードマップ v2 後の予定（Ω 系、Σ-4 完走後に再開）

**最初にやる**：`claude/review-progress-XaRZT` を本流に merge → Ω-6 と Ω-7 P2/P3 を正式化

続けて：
- **Ω-4 継続** 災害 P1 拡張（火災、熱波、消防署）
- **Ω-5 拡張** クマ/疫病/地震/野盗（+ 採用済み②**病気＆集団感染**を Σ-3 以降の時点で合わせる）
- **Ω-6 P3〜** 電力拡張（より複雑な電気回路、停電、過負荷）
- **Ω-7 P4〜** 生産チェイン拡張（ガラス、金属精錬、調合）
- **Ω-8** 指示系統（ゾーン矩形 / 投げ縄 / 直接命令）
- **Ω-9 P2〜** 社会・士気（学校、酒場、風呂）＋ 採用済み⑥**カルト宗教化**
- **Ω-10** 監督委任（フラナ/スズに job 委託）
- **Ω-11** メタ進行（ラン終了、累計アンロック、図鑑拡張）
- **Ω-12**（新規）採用済み⑦**潮汐** ＋ ⑧**神罰** を Σ-3 完了後に正式統合

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
origin/claude/idle-village-game-7IfPd       ← 本流（Σ-0/1/2/2.5/3 + Ω-6/7 + docs 全部入り）
├─ claude/sigma-4-proto                     ← Σ-4 本実装の参照（捨てプロト、検証済み GO）
└─ claude/sigma-4-main                      ← Σ-4 本実装中（着手後に作成）
```

**整理済み状況（2026-04-21）**：Σ-0〜Σ-3 + Σ-2.5 + Ω-6/7 + character-image-brainstorm
を全て本流 `idle-village` に merge 済み。以降の merge 済みブランチは削除して
本流 1 本 + Σ-4 系 2 本に絞った。

**運用ルール**：
- 日常プレイ・開発は `idle-village` だけで OK（pull 一本で最新）
- 新フェーズ実装時は `claude/sigma-X-*` ブランチを `idle-village` から切る
- 実装完了後に本流へ merge → 作業ブランチは削除
- Σ-4 本実装が終わったら `sigma-4-proto` も削除予定

## 削除予定（Σ-0 掃除パスで実行）

| 対象 | 理由 |
|---|---|
| ~~`src/sim/landmarks.ts` 全体~~ | ✅ Σ-0 で削除済み |
| ~~`WorldState.landmarks` フィールド + セーブ項目~~ | ✅ Σ-0 で削除済み |
| ~~`Chibiwafu.targetLandmarkId` + `pickLandmarkTarget` in chibiwafu.ts~~ | ✅ Σ-0 で削除済み |
| ~~`drawLandmark` + `landmarkLayer` in stage.ts~~ | ✅ Σ-0 で削除済み |
| 哲学石特殊挙動 (world.ts 1769-1785) | カルト儀式（採用済み⑥）に機能移転 |
| ~~`chats.ts` の `landmark_*` 6 エントリ~~ | ✅ Σ-0 で削除済み |
| `public/mockup/background.png` (3.5MB) | 未参照、Ω-2-b で廃止済みの残骸 |

**ニュアンス保持で rename 残し**：
- 死因 `石パンで歯折れ` / 窒息死 → 「硬い木の実で歯折れ」「どんぐり窒息」にフレーバー変更
- flavor trait `"石パンに目がない"` → ラベルのみ残す
- hazards.ts:86 の石パン hazard → 同上

**保留（split 運用が安定なら削除可）**：
- `public/chibiwafu.png` / `public/furana.png` (計 2MB) — split 9 ポーズのフォールバック

## 既知の注意点・quirks

- **world.ts が 2,885 行超**：分割候補だが未実施。近々 `disasters.ts` 等に外出し検討
- **sim.ts balance assertion は pre-existing failing**（top share > 22% 等）、ブロッカーではない
- **save v1-v9 履歴**：plots は v8 で廃止（Feature に置換）、landmarks は Σ-0 で廃止予定
- **chibi death cause "fatigue_death"** は P1-C1 時点で ほぼ発火せず（hunger 死が先）、P2 で食料ある状態で初めて顕在化
- **PixiJS の `const CONFIG = { ... } as const`**：リテラル型になるので `currentBoundsW: number = CONFIG.WORLD_W` のように明示型が必要
- **`getElevation(x,y)` は関数ベース**：Σ-2 でタイル配列に置換予定。固定勾配なので現状「一定の坂」にしか見えない
- **`DRY_Y_LIMIT = 1150` 南側一律泥川**：Σ-3 で 3 地形化すると前提崩壊、`hazards.ts` の mudriver/bridge/季節ゾーンも再設計対象

## よくある作業パターン

### 新機能追加

1. `TodoWrite` でタスク分解（3-6 ステップ）
2. types.ts に型追加 → sim/world.ts に状態フィールド追加 → 挙動関数 → render/stage.ts に描画 → render/ui.ts に HUD
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
