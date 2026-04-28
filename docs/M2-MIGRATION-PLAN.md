# M2.1 Migration Plan

`docs/M2-DIRECTION-RESET.md` で確定した方針を、**コードへの落とし方**として
段階的に整理する作業計画。各ステップは独立 commit で実装可能、回帰リスクを
最小化する順序で並んでいる。

このファイルは **整理設計**（grep 調査 + 影響範囲 + ステップ順序）のみ。
実装は別 commit でステップごとに進める。

---

## 0. 現状の依存スコープ（grep 調査結果）

### 0.1 旧 `BUILDINGS` 系（34 箇所）

| ファイル | 内容 |
|---|---|
| `src/city/buildings.ts` | `BUILDINGS` 定義: noukou / kouba / hakaba / taiko / ubuya（5 種）+ `buildingsToHazards` |
| `src/sim/world.ts` | L6 import、L2367-3078 効果計算、L4587-4652 buildingCost / upgradeOne / buildBuilding |
| `src/main.ts` | L24/57 import、L178/2400 UI 連動 |
| `src/render/ui.ts` | L1/4 import、L274 build list 描画 |
| `src/meta/save.ts` | L295/343 `buildings` 配列を persist |
| `src/types.ts` | `BuildingDef`, `PlacedBuilding` 型 |

依存は world.ts の効果計算（人口キャップ、点数倍率、ハザード生成）に深く絡む。

### 0.2 旧 NPC（suzu / cocoon / lou）（79 箇所）

| ファイル | 件数 | 内容 |
|---|---|---|
| `src/sim/npcs.ts` | 19 | NPC_DEFS / 各種セリフプール（SUZU_*, COCOON_*, LOU_*）|
| `src/sim/world.ts` | 45 | updateNpcs / updateCocoonAbuse / wolf 標的選択 / 死因反応 |
| `src/render/stage3d.ts` | 4 | NPC sprite 描画（drag, click, draw）|
| `src/main.ts` | 9 | UI モーダル / クリック対象 |
| `src/types.ts` | 1 | `Wolf.targetNpcId` の union |

`type NpcId = 'suzu' | 'lou' | 'cocoon' | 'furana'` を起点に全コードへ波及。

### 0.3 ondo / 音頭 / taiko（94 箇所）

| ファイル | 件数 | 内容 |
|---|---|---|
| `src/sim/world.ts` | 17 | triggerOndo / scheduleOndo / 音頭 タイマー / フラナ機嫌減衰 |
| `src/sim/deaths.ts` | 6 | `ondo` / `taiko_crush` / `taiko_tobikomi` 死因テンプレ |
| `src/sim/hazards.ts` | 4 | 音頭ハザード / yagura ハザード |
| `src/config.ts` | 2 | ONDO_DURATION_SEC / ONDO_KILL_RATE / ONDO_BASE_INTERVAL_SEC など |
| `src/sim/events.ts` | 1 | GlobalEvent 型に `ondo` 含む |
| `src/types.ts` | 3 | DeathCauseId 等 |
| `src/sim/traits.ts` | 1 | `taiko_kko` trait |
| 他 13 ファイル | 17 | UI / chats / 名前プール 等 |

`taiko_kko` trait はゲーム性として残してよいので「太鼓やぐら廃止 ≠ trait 廃止」。

### 0.4 旧建物個別ID（noukou / kouba / hakaba / ubuya）（17 箇所）

`BUILDINGS` 内 5 種それぞれが world.ts 効果テーブルを持つ。
個別効果は M2.1 では新 feature 系へ吸収する。

---

## 1. ステップ順序（実装計画）

各ステップは「**独立 commit で完結 + 検証通過**」を要件とする。
`tsc --noEmit` / `npm run test` / `npm run build` / `npm run sim` を必須。

### Step 1: セリフ legacy フラグ化（破壊リスク低）

**目的**: 旧 NPC / 音頭依存セリフを「発火停止」だけ先に決め、コードは残す。

- `chats.ts` / `npcs.ts` で旧 NPC 専用プールに `// LEGACY M2.1` コメント追加
- 新規 trigger 場所を grep で確認、該当箇所を「発火しない」状態にコメントアウト
- セリフ自体は削除せず、後で復活可能性を残す

**影響範囲**: chats.ts、npcs.ts、world.ts 一部
**検証**: tsc / build / sim でクラッシュなし、cocoon_abuse / suzu_kazoe / ondo の死因件数が **0 になる**ことを確認

### Step 2: 旧 NPC 移動・更新の停止（中規模）

**目的**: スズ / ココン / ルーが画面に出ない、世界に影響しない。

- `npcs.ts` `NPC_DEFS` から suzu / cocoon / lou を削除（または `disabled: true`）
- `createNpcs(difficulty)` がフラナのみ返すよう変更
- `updateNpcs` でフラナ以外をスキップ
- `updateCocoonAbuse`、suzu 点呼系処理を no-op に
- wolf の `targetNpcId` から旧 NPC を除外
- セーブ load 時に旧 NPC エントリを破棄

**影響範囲**: npcs.ts、world.ts updateNpcs 周辺、save.ts、stage3d.ts
**検証**: 起動時に旧 NPC が画面に出ない、wolf が旧 NPC を狙わない、フラナだけ動く

### Step 3: 音頭イベントの停止（中規模）

**目的**: `triggerOndo` 系を発火停止、新規イベントは天気/食料/地形に依存させる。

- `world.ts` `scheduleOndo` を no-op、`triggerOndo` をプレイヤー手動だけに残す（debug）
- `ONDO_BASE_INTERVAL_SEC` 等 config はそのまま（参照は残るが起動しない）
- 音頭由来のフラナ機嫌減衰は削除
- 死因 `ondo` / `taiko_crush` / `taiko_tobikomi` は legacy dex に残す（新規発火停止）
- `taiko` 建物（`BUILDINGS.taiko`）も連動して廃止候補（Step 4 で対応）

**影響範囲**: world.ts、main.ts のデバッグボタン、deaths.ts コメント
**検証**: 60 分 sim で `ondo` 死因件数 0、フラナ機嫌が音頭由来で動かない

### Step 4: 旧 BUILDINGS の縮小（大規模）

**目的**: `points` 建設 UI を停止、新 Feature 建設 UI へ統一。

サブステップ:

#### 4.1 UI 階層
- `render/ui.ts` の build list（旧 BUILDINGS）を hidden に
- HUD タブ「建物」を新 Feature build pane だけにする
- ただし既存セーブの `w.buildings` 配列は読み取りで残す

#### 4.2 効果計算の整理
- `populationCap(w)` 内の `noukou` / `ubuya` 効果を保持（数値 freeze）or feature 系へ吸収
- 火事スケジュール `kouba` 連動を新 feature（kiln 等）へ寄せる
- 太鼓祭り（season 境界）は廃止
- 墓地 `hakaba` の point multiplier は legacy 数値で凍結

#### 4.3 ハザード切り替え
- `buildingsToHazards(w.buildings)` を空配列にする（旧建物の周辺ハザードを停止）
- 新 feature 起源のハザードは別関数へ

#### 4.4 セーブ migration
- 旧 `buildings` 配列はロード時に空配列で起動するか、display-only で残す
- `points` は減らさない（スコア用途継続）

**影響範囲**: city/buildings.ts、world.ts 大量、ui.ts、save.ts、main.ts
**検証**: 旧 BUILDINGS が UI から消える、新 Feature 建設だけで進行できる、セーブロードで旧建物が悪さしない

### Step 5: フラナ通行ルール強化（小規模）

**目的**: フラナを「ちびわふより少し段差に強い」存在に。

- `world.ts` `npcCanStepTo` でフラナだけ「1 段差なら ramp なくても通行可、cost 高め」に
- 2 段差以上 / waterLevel ≥ 0.35 はフラナも不可
- フラナの A* path（もし将来導入するなら）も同じルール

**影響範囲**: world.ts npcCanStepTo / updateFuranaMovement
**検証**: フラナが 1 段差をスムーズに歩く、2 段差で立ち止まる、海越境しない

### Step 6: カメラ角度プリセット（小〜中）

**目的**: 低め / 標準 / 真上寄り のプリセット切替（自由回転は禁止のまま）。

- `stage3d.ts` `camPitch` / `camHeight` プリセット定数化
- StageHandle に `setCameraPreset('low' | 'standard' | 'top')` を追加
- HUD から切替ボタン（C キー再利用 or 新規）

**影響範囲**: stage3d.ts、main.ts、index.html
**検証**: 切替でビルボード崩れない、UI overlay と整合する

### Step 7: 海表示 / 高さスケール検証（小規模 branch）

**目的**: 見た目検証用に **小さな branch** で `ELEV_SCALE` / `CAMERA_MIN_SCALE` /
sea plane 切替を試す。本実装は別フェーズ。

検証案 A:
- `ELEV_SCALE 6 → 4`、`CAMERA_MIN_SCALE` を上げて画面下破綻を抑える
- **ELEV_STEP は 25 のまま**（save 互換維持）

検証案 B:
- `ELEV_STEP 25 → 12 or 8`、generator / migration / A* 閾値全更新
- 大手術。M2.1 中盤以降で検討

検証案 C:
- 全面 sea plane を削除、`isSea` タイル単位の水面 InstancedMesh に変更
- 海底地形面を描かない / 暗い material に

---

## 2. 検証チェックリスト（各 step 共通）

```bash
npx tsc --noEmit          # 型エラーなし
npm run test              # 25/25 維持
npm run build             # ビルド通る
npm run sim               # 60 分クラッシュなし、死因に意図せざる激変なし
```

加えて手動:
- 起動して新規ラン、5 分プレイ
- 旧要素が画面に残っていない
- 新方針の要素が機能している

---

## 3. 推奨着手順

ユーザ承認後、上記 Step 1 → 2 → 3 → 4.1 → 4.2 ... の順で進める。

**理由**:
- セリフ停止（Step 1）→ NPC 停止（Step 2）→ 音頭停止（Step 3）はそれぞれ独立、低リスク
- BUILDINGS 縮小（Step 4）は世界効果の数値が動くため、ondo / NPC 廃止後の安定状態でやる
- フラナ強化（Step 5）と カメラ（Step 6）は他と独立、いつでも入れられる
- スケール検証（Step 7）は別 branch、本ブランチには影響させない

---

## 4. M2.1 完了判定

- [ ] 旧 NPC（スズ/ココン/ルー）が画面に出ない、wolf 標的にもならない
- [ ] くそざこ音頭が新規発火しない、フラナ機嫌に影響しない
- [ ] 旧 `BUILDINGS` UI が消え、新 Feature 建設だけで進行できる
- [ ] フラナが 1 段差をスムーズに歩く（ramp なしでも）
- [ ] カメラ角度プリセットが効く
- [ ] 60 分 sim で旧死因（ondo / cocoon_abuse / suzu_kazoe_shikujiri / taiko_*）が 0 件
- [ ] 新規セーブ + 旧 v14 セーブどちらも起動する

これら全てを満たした時点で M2.1 完了、`SIGMA-8-IMPLEMENTATION-STATUS.md` Gap-0 を Done に動かす。

---

## 5. 参照

- 方針正本: `M2-DIRECTION-RESET.md`
- 実装事実: `SIGMA-8-IMPLEMENTATION-STATUS.md`
- セリフ正本: `DIALOGUE-CATALOG.md`
- 検証コマンド: `SCRIPT-CATALOG.md`
