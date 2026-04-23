# くそざこ村 — 監督ハンドオフ資料

新しい監督会話を起こす / Σ-4 本実装会話を起こす / Mac 環境で作業再開する、のいずれかを
行うときに参照する。この文書は **コピペ用テンプレート集**。

必読：
1. このファイル
2. `CLAUDE.md`（プロジェクト全体の単一情報源）
3. `prototypes/three-terrain/REPORT.md`（Σ-4-proto の 5 項目 GO 判定）
4. `docs/00_README.md`（アセット発注の運用フロー）

---

## 1. 新監督会話の引き継ぎプロンプト

新会話の冒頭にコピペする：

```
くそざこ村の開発監督（director）役を引き継ぐ。前の監督会話からの文脈：

## 今どこ
- 本流 `origin/claude/idle-village-game-7IfPd` に Σ-0〜Σ-3 + Σ-2.5 + Ω-6/7 +
  docs/ + HANDOFF.md 全部入り
- Σ-4-proto 完了（`origin/claude/sigma-4-proto`、参考用に残してある）、
  5 項目検証すべて GO（fps=75 / drawCalls=5 / DOM sync=0.01ms）
- git 整理済み、origin は `idle-village` と `sigma-4-proto` の 2 本のみ
- 次フェーズ：Σ-4 本実装（Three.js 移行）、別実装会話が作業中または未着手

## 監督会話の役割
- 実装会話のレビュー → 本流 merge 判断
- プロンプト作成（次フェーズの指示書を書く）
- CLAUDE.md / HANDOFF.md 更新
- アイデアの採用/棄却決定
- 直接コーディングはしない（マイナーバグ修正のみ可）

## 最重要ドキュメント（順に読んで）
1. `HANDOFF.md` ルート — このファイル（コピペ資料）
2. `CLAUDE.md` ルート — プロジェクト全体像、核指針、ロードマップ
3. `prototypes/three-terrain/REPORT.md` — Σ-4-proto の 5 項目検証結果
4. `docs/` 配下 7 本 — キャラ画像発注仕様書
5. `.claude/agents/balance-tester.md` — バランスチェック用 Haiku エージェント

## 直近タスク
- Σ-4 本実装プロンプトは HANDOFF.md §2 にある。必要なら別会話に投げる
- 実装完了通知が来たら: tsc 型チェック → parity checklist 確認 → balance-tester
  で死因分布確認 → idle-village に merge → HANDOFF.md / CLAUDE.md 更新

まず `HANDOFF.md` と `CLAUDE.md` を読んで現状を把握し、「準備完了、次の指示を待つ」と
返してほしい。
```

---

## 2. Σ-4（Three.js 本実装）プロンプト

**これを別の Sonnet 会話に投げれば Σ-4 実装が始まる**。2 週規模、6 サブコミット想定。

```
くそざこ村 Σ-4（Three.js 3D 化本実装）を実装して。

## 作業ブランチ

`claude/sigma-4-main`（新規。ベースは `origin/claude/idle-village-game-7IfPd`）

    git fetch origin
    git checkout -b claude/sigma-4-main origin/claude/idle-village-game-7IfPd

## 参考ブランチ

`origin/claude/sigma-4-proto`（捨てプロト、5 項目検証済み：
fps 75 / drawCalls 5 / DOM sync 0.01ms）。

プロトの `prototypes/three-terrain/main.ts` の実装パターンを参考にしてよい
（noise / generators / billboard / GPU picking / DOM sync の手法）。
ただし参考のみ、プロトのコードを直接コピペせず本実装として綺麗に書き直すこと。

## ゴール

既存 `src/render/stage.ts`（Pixi 2D）を `src/render/stage3d.ts`（Three.js 3D）
で置き換え、なめらかな 3D 地形上をちびわふ 200+ 体がわちゃわちゃ動き回る
「巨人のドシン × ピクミン × Elona × Don't Starve」風プレイ体験を作る。

プレイヤーは神様として盛り土切り土で自由に地形を改変でき、改変はリアルタイムに
3D 地形へ反映される。

## 絶対守る設計鉄則（CLAUDE.md 核指針）

1. sim は `{x, y}` のまま、z は render 側が `getElevation(x, y)` で派生
   （`src/sim/` は無変更）
2. 既存 9 ポーズ PNG を Y 軸ビルボード + 左右反転で流用、アート再発注ゼロ
3. Perspective fov 20°、45° 俯瞰固定、カメラ回転封印、3 段階 discrete ズーム
4. HUD は DOM のまま、吹き出しは camera.project で world→screen 変換
5. `src/render/stage3d.ts` 新設、既存 `stage.ts` と同じ `StageHandle` 実装、
   feature flag（env var `VITE_RENDER=3d`）で切替、parity 達成後に Pixi 削除
6. flat shading / ブロック段差は実装しない（なめらかな Toon 路線）。
   「マインクラフト感」は盛り土切り土の自由度で出す、見た目ではない

## 6 サブコミット

### Σ-4-a：インフラ + 地形メッシュ + カメラ

- `src/render/stage3d.ts` 新設、`StageHandle` インターフェース
  （createStage / updateStage / resize / destroy）を既存 `stage.ts` から borrow
- Three.js シーン：PerspectiveCamera(fov 20°)、DirectionalLight + AmbientLight、
  PCFSoft シャドウ
- 地形メッシュ：`PlaneGeometry(3200, 1800, 200, 113)` を XZ 平面に rotate、
  頂点 Y を `terrain[row][col].elev × 5` で displace（プロトの ×2 より強化、
  山は山らしく）
- 素材色：`vertexColors` 方式、5 素材色 + 標高ブライトネス
- Toon shader：`MeshToonMaterial` + 4-step gradientMap（DataTexture + NearestFilter）
- 水面：別 PlaneGeometry を y=1 に、time uniform で UV スクロール
- カメラプリセット：
  - beginner：中央俯瞰、zoom 0.7、target=(1600, 900)
  - standard：陸地中心、zoom 0.85、target=(1280, 700)
  - hell：島全体が画面に、zoom 1.0、target=(1600, 900)
- WASD/矢印 パン、F=フラナへ、R=リセット、Wheel=ズーム、ミニマップクリックでジャンプ
  を既存 stage.ts と同等に
- スモーク：`VITE_RENDER=3d npm run dev` で 3 難度の地形が 3D 表示

### Σ-4-b：キャラクタ描画（ちびわふ + NPC + オオカミ）

- ちびわふ：`InstancedMesh` で PlaneGeometry(64, 80) + 9 ポーズ PNG。
  `w.chibis` をループして transform 更新、Y 軸ビルボード、
  state で atlas UV オフセット切替（歩行アニメ）、
  flight 中は `c.flight.posZ × 5` を高度として反映
- blob shadow：別 InstancedMesh、CircleGeometry 半透明黒
- NPC 4 体（フラナ/スズ/ココン/ルー）、オオカミ、死体 を同様に InstancedMesh
- pose animation：walk で 0.3 秒ごとに 01/02/03 atlas フレーム切替

### Σ-4-c：World オブジェクト（features / buildings / obstacles / bubbles）

- features（water/channel/path/farm/house/well/firewatch/sawmill/shrine/
  generator/streetlamp/powerline/kiln/pasture/loom）を個別 Sprite で配置、
  Y = `getElevation(pos.x, pos.y) × 5` で地形追従
- buildings を同様に配置、Lv 表示
- obstacles（rock/stump/bush）140 体まで InstancedMesh
- bubbles：HTML `<div>`、`camera.project` で画面座標に、毎フレ translate3d
- 電線（Ω-6 P2a）：powerline feature 間を `LineSegments` で

### Σ-4-d：Terraform + Landslide + Weather の 3D FX

- 盛り土・切り土の動的反映：`w.terrain` の elev 変化でタイル周辺 8 近傍頂点のみ
  update、`computeVertexNormals()` 再計算
- Terraform ジョブ視覚化：タイル上に半透明 box、進捗 RingGeometry
- Landslide アニメ：崩壊頂点を 0.8 秒かけて目標値に下降、土煙パーティクル
- Weather tint：full-screen quad、気象ごとの overlay（rain=青、storm=暗 等）
- 日時計：DirectionalLight の色＆ angle で morning/noon/evening/night

### Σ-4-e：GPU picking + 入力 + 物理

- GPU picking：WebGLRenderTarget(1×1) で chibi/NPC/wolf/feature/obstacle/tile
  識別（プロトで検証済み）
- Input：
  - 左クリック：殴る（既存 sim の damageChibi/damageNpc）
  - 右クリック：モーダル表示（既存 HUD 連携）
  - ドラッグ：掴む、離すと物理投げ（launchFlight）、3D で放物線＋z 軸落下
  - 空クリック：建設 or terraform モード
- ホバー演出：1.1 倍 scale

### Σ-4-f：Feature flag + Parity + Pixi 削除

- `vite.config.ts` or `config.ts` に RENDER フラグ、`VITE_RENDER` で切替
- `src/main.ts` で flag 読んで stage.ts or stage3d.ts を dynamic import
- Parity checklist：
  - [ ] ちびわふ / NPC / オオカミ描画
  - [ ] feature / building / obstacle 描画
  - [ ] 吹き出し追従
  - [ ] カメラ操作（WASD/F/R/wheel/ミニマップ）
  - [ ] 気象ティント
  - [ ] 日時計
  - [ ] 左クリック殴る / 右クリックモーダル / ドラッグ投げ
  - [ ] 建設モード / terraform モード
  - [ ] Σ-1 z 物理が 3D で見える
  - [ ] Σ-2 土砂崩れが 3D で見える
  - [ ] Σ-2.5 可視化要素（崖線 / stability 警告 / terraform UI）が 3D で等価
  - [ ] Σ-3 の 3 地形が 3D で明確に区別
- 全部 ✅ で `src/render/stage.ts` 削除、package.json から pixi.js / @types/pixi.js 削除
- スモーク：scripts/sim.ts が stage なしでも動く、3 難度で実プレイ確認

## 必ず守ること

- sim（`src/sim/*`）は一行も触らない
- Σ-4-f の Pixi 削除までは `stage.ts` を残す（parity 対照 & 緊急撤退用）
- カメラ回転しない（Y 軸ビルボード前提が崩れる）
- アート再発注ゼロ
- 既存のくそざこ味（セリフ・吹き出しテンション）維持

## コミット末尾署名

    https://claude.ai/code/session_XXXX

## 完了条件

全コミット push のみで完了報告、merge はしない（レビューは監督会話で私がやる）。
```

---

## 3. Mac 環境のコマンドチートシート

### 初回セットアップ（既に済んでいるはず）

```bash
git clone <repo-url> kszkbk
cd kszkbk
npm install
```

### 日常：最新を取り込んで起動

```bash
cd kszkbk
git checkout claude/idle-village-game-7IfPd   # 本流
git pull
npm run dev
# ブラウザ: http://127.0.0.1:5173/
# Σ-4-proto を見たい場合: http://127.0.0.1:5173/prototypes/three-terrain/
```

### ローカル状態が怪しい時のリセット

```bash
git fetch origin --prune
git reset --hard origin/claude/idle-village-game-7IfPd
# ← ローカル未保存変更は全消失、注意
```

### ローカルの古いブランチを掃除

```bash
git branch | grep -v "\*\|idle-village" | xargs -r git branch -D
```

### 型チェック / ビルド / sim

```bash
npx tsc --noEmit              # 型チェック
npm run build                 # 完全ビルド
npx tsx scripts/sim.ts        # 60 分 headless シミュレーション
```

### Σ-4 実装ブランチを切る（実装会話開始時）

```bash
git fetch origin
git checkout -b claude/sigma-4-main origin/claude/idle-village-game-7IfPd
```

### リモートブランチ削除（merge 後）

```bash
git push origin --delete <branch-name>
# 複数まとめて：
git push origin --delete claude/sigma-X-* claude/...
```

---

## 4. 監督と実装の役割分担ルール

公式 best practice ベースの運用：

| 会話タイプ | 役割 | モデル |
|---|---|---|
| **監督室**（この継承会話） | レビュー・merge・CLAUDE.md 更新・プロンプト作成・意思決定 | Opus 推奨 |
| **実装会話**（Σ-4 本実装 等） | 指定ブランチでコード書いて push | Sonnet 推奨 |
| **アイデア会話**（別枠） | ブレスト、決定事項だけ監督会話に summary 投げる | 任意 |

**決まりごと**：
- 実装会話は push のみで終了、merge は監督が判断
- 1 行 bug 修正は監督会話で直接パッチして OK
- 30 行以上の修正は実装会話に差し戻し
- CLAUDE.md / HANDOFF.md 更新は監督会話の責務

---

## 5. 緊急時の撤退プロトコル

### Σ-4 実装が炎上した時

1. `claude/sigma-4-main` を merge せず放置
2. 本流 `idle-village` は Σ-2.5 時点で 2D Pixi で遊べる状態を保持
3. `prototypes/three-terrain/REPORT.md` の代替案（Babylon/PlayCanvas/疑似 iso）を検討
4. ロードマップ v2 の方針見直し、CLAUDE.md 更新

### save v12 が壊れた時

- `src/meta/save.ts` の `deserializeTerrain` に breakpoint
- v12 ロード失敗時は `ensurePlots` が procedural 再生成する fallback を持つ
- 最悪 localStorage をクリアしてラン作り直し（3 スロットあるので 1 個犠牲にできる）

---

## 更新履歴

- 2026-04-23：Σ-4-proto 完了時点で整備（Σ-4 本実装プロンプト + 監督引き継ぎ + Mac 手順）
