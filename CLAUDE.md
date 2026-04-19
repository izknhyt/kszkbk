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
    world.ts             【中心】WorldState, tickWorld, 各 update* 関数群（2,200 行）
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
    landmarks.ts         石パン岩 / 哲学石 等の固定 POI
    bubbles.ts           吹き出しキュー
    rank.ts              4 段階ランク (村/集落/町/都)
    naming.ts            ちびわふ名前プール
    spatialHash.ts       空間分割ハッシュ（O(n²)→O(n)）
  render/
    stage.ts             PixiJS 描画、カメラ制御、気象ティント、日時計（1,300 行）
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
| 初期資源 | 🍞20 🪵15 🪨10 | 0 | 0 |

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

### 完了フェーズ

| Phase | 内容 | Commit |
|---|---|---|
| Ω-0-a | セーブスロット 3 + 難度選択 + Run メタ | e081e56 |
| Ω-0-b | 難度効果を全システムに適用 | a5b40d3 |
| Ω-0-c | ワールド拡大 3200×1800 | 76cc928 |
| Ω-0-d1 | カメラ UX（WASD/F/R/ミニマップ） | f7bb5c9 |
| Ω-0-d2 | 空間分割ハッシュ | 236cc49 |
| Ω-1 | 気象 9 種 + 3 日予報 + 効果 | 4b8d120 |
| Ω-2 | 水理（水流・洪水・ちびわふ流し） | 425ff93 |
| Ω-2-b | 背景 procedural 固定（3200×1800 対応） | 71f4855 |
| Ω-3 | 住居 + 夜の帰宅 AI + 野宿ペナルティ | c61cd19 (+fix a82ea68 / 6fca1fa / dc49362) |
| Ω-3-b | 高低差地形（水は下流へ、高台は洪水安全） | 846118d |
| Ω-4 | 災害対策 feature（井戸・火の見やぐら） | dfe30bc |
| Ω-5 | オオカミ襲撃 + 夜の睡眠挙動 | a69a1bc |
| Ω-7 P1 | 生産チェイン（製材所 wood→plank） | cac8519 |
| Ω-9 P1 | 神社 feature（plank 消費建築） | 49fdb70 |
| polish | 警告 toast / 神社 ✨ / ログタブ戦績 | 4fd4609 / a42ecb5 |
| refactor | バグ 6 件修正 + パフォーマンス最適化 | 67b75c2 |

### 予定フェーズ

- **Ω-6** 電力（ペダル発電所、電線、街灯、感電死）← 次
- **Ω-7 残** 採石→精錬、牧場→織物
- **Ω-8** 指示系統（ゾーン矩形 / 投げ縄 / 直接命令）
- **Ω-9 残** 社会・士気（学校、酒場、風呂）
- **Ω-10** 監督委任（フラナ/スズに job 委託）
- **Ω-11** メタ進行（ラン終了、累計アンロック、図鑑拡張）

## 既知の注意点・quirks

- **world.ts が 2,200 行超**：分割候補だが未実施。近々 `disasters.ts` 等に外出し検討
- **sim.ts balance assertion は pre-existing failing**（top share > 22% 等）、ブロッカーではない
- **save v1-v8 履歴**：plots は v8 で廃止（Feature に置換）、旧 save は空扱い
- **chibi death cause "fatigue_death"** は P1-C1 時点で ほぼ発火せず（hunger 死が先）、P2 で食料ある状態で初めて顕在化
- **PixiJS の `const CONFIG = { ... } as const`**：リテラル型になるので `currentBoundsW: number = CONFIG.WORLD_W` のように明示型が必要

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

## 開発の「くそざこ味」を保つための自戒

- 死因を増やすときは **面白い瞬間** を想像して設計（単なる確率死じゃなく「あっそうなるんだ」みたいなネタ）
- セリフプールは **キャラ違いと機嫌違い** で分ける。一つの pool に混ぜると凡庸化
- 「リアルサバイバル × 小学校低学年日記」のトーン混合が持ち味
- ちびわふ同士の絡み（chat / 野次 / もらい泣き / ざまあみろ 等）が村を "生きてる" 感のコア
