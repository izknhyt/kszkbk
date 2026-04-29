# Sigma-8 R3 Codex レビュープロンプト

R3 実装（Ramp / Worksite Reform）のコードレビュー依頼。
実装済みコードが仕様・Non-goals・品質基準を満たしているか確認する。

---

## Prompt

```text
# くそざこ村 Sigma-8 R3 コードレビュー依頼: Ramp / Worksite Reform

## 対象ブランチ

- branch: claude/merge-r1-r2-readability-Pcqys
- 対象 commit: dce9be1 "R3: Ramp / Worksite Reform — worksite overlay + blocked state + completion bubbles"

## まず読む正本

必ず以下を読んでからレビューしてください。

- docs/SIGMA-8-VISUAL-SYSTEM-SPEC.md
- docs/SIGMA-8-GAMEPLAY-REFORM-PLAN.md（Phase R3 セクション）
- docs/SIGMA-8-IMPLEMENTATION-STATUS.md（Gap-1 の Done 記述）
- docs/SIGMA-8-DEVELOPMENT-SPEC.md

## 背景

R3 の目標は以下の通りでした。

- ramp 工事を「即時設置」から「予約 → ちびわふ労働 → 完成 → A* が通る」という
  地形開発ゲームの主役ループにする
- planned / working / blocked / completed の 4 状態が画面で区別できる
- blocked の理由が短く分かる
- 完成時に小さな反応バブルが出る
- 新規画像なし、A* / hydrology / save schema を変えない

## 変更ファイル一覧

- `src/types.ts`
- `src/sim/world.ts`
- `src/render/stage3d.ts`
- `src/main.ts`
- `docs/SIGMA-8-IMPLEMENTATION-STATUS.md`

## レビュー観点（優先度順）

### P1: correctness / logical bugs

以下の点を重点確認してください。

1. **blocked 判定ループ**（`world.ts updateTerraformJobs`）
   - ramp ジョブの `validateRampPlacement` を毎フレーム呼ぶことで、
     地形変動があった次フレームに即座に blocked になるか
   - `continue` で progress 積み込みをスキップしているが、
     完了チェック（`job.progress >= 1.0`）も正しくスキップされているか
   - blocked 状態で progress が 1.0 を超えたまま残る経路がないか

2. **blockedReason の自動解除**
   - 地形が修正されたとき `blockedReason = undefined` になるか
   - save/load 後に `blockedReason` が残存しないか（transient として扱われているか）

3. **kszk-terraform-complete イベント拡張**（`stage3d.ts`）
   - `tx, ty` を detail に追加したが、既存の raise/lower ハンドラが壊れていないか
   - `tx, ty` は `tfPrevJobIds` の保存値から取っているか（正しいタイルを指しているか）

4. **IM capacity オーバーフロー防止**（`stage3d.ts`）
   - `tfRampIM` / `tfRampBlockedIM` は capacity 50
   - `tfRampStakeIM` は capacity 200（50 jobs × 4 corners）
   - `tfRampArrowIM` は capacity 50
   - ジョブ数がそれを超えたとき `setMatrixAt` が範囲外アクセスしないか
   - 現状 `if(tfRampI < 50)` 等でガードしているが、全 IM 一貫しているか

5. **_imDummy の rotation リセット**
   - 方向矢印 `tfRampArrowIM` で `_imDummy.rotation.set(0, rotY, 0)` を使っている
   - 直後に他の IM で `_imDummy` を流用するとき rotation が残っていないか
   - 杭・フットプリント設置時に `rotation.set(0,0,0)` を明示しているか

### P2: visual / UX 品質

6. **blocked/working のパルス opacity 設定**
   - `tfRampBlockedIM` の opacity は毎フレーム上書きしているが、
     ジョブが 0 件のときにも最後の opacity 値が残る問題はないか
   - `tfRampIM` の opacity も同様に jobs = 0 の時クリアされるか

7. **ramp アウトライン（LineSegments）の dispose**
   - `tfRampOutlineLines` を毎フレーム再生成している
   - `geometry.dispose()` が呼ばれているか（メモリリーク確認）

8. **HTML overlay の `abandonedSec` 計算**
   - ramp ジョブに `idleSec >= 60` で "⚠ 作業者不在" を出す経路はあるか
   - blocked ジョブに abandoned 判定が誤作動しないか

### P3: Non-goals チェック

以下が変わっていないことを確認してください。

- `pathfinding.ts` に変更がないこと（A* 変更なし）
- `world.ts updateHydrology` / `updateWater` に変更がないこと
- `meta/save.ts` の `SaveData` 型に `blockedReason` が入っていないこと（transient 確認）
- `ELEV_STEP` / `ELEV_SCALE` の値に変更がないこと
- 新規画像ファイルが追加されていないこと（`public/` 以下）
- R1 崖 overlay（`cliffSoilIM` / `cliffRockIM` / `cliffDampIM` / `shadowIM`）が
  今回の変更で壊れていないこと
- R2 水 overlay（`waterIMs` / `dangerIM` / `shimmerIM` / `foamLines` / `waterfallIM`）が
  今回の変更で壊れていないこと

### P4: 軽微な改善候補（fix 必須ではないが報告してほしいもの）

- blocked ジョブがキャンセルされずに長期放置される UX リスク
  （プレイヤーが blocked 理由を直したあと再度 enqueue が必要か、自動解除で十分か）
- `rampBlockedMsg` が `world.ts` にあるが `stage3d.ts` では `job.blockedReason`
  文字列を直接使っている。world.ts 側で完結しているかの確認
- worksite overlay の `opacity` を jobs=0 のときに 0 にする必要があるか
  （現状 `count=0` なので描画はされないが、念のため）

## Acceptance Criteria（再確認）

レビューの合否判定に使う基準：

- P1 の correctness 問題が 0 件
- P2 の visual/UX 問題が 0 件（または修正案あり）
- Non-goals に違反がない
- typecheck: pre-existing 6 エラーのみで新規エラーなし
- test: 36/36 PASS

## Report Format

以下の形式で報告してください。

### P1: Correctness
- 問題ありの項目: [番号と内容]
- 問題なしの項目: [番号]

### P2: Visual / UX
- 問題ありの項目: [番号と内容]
- 問題なしの項目: [番号]

### P3: Non-goals
- 違反あり: [内容]
- 違反なし: ✅

### P4: 軽微な改善候補
- [内容があれば]

### 総合判定
- GO: 問題なし、マージ可能
- FIX-REQUIRED: P1/P2 に問題あり、修正してから再レビュー
- INFO-ONLY: P4 のみ、マージは可能だが参考情報あり
```
