# Σ-8 Implementation Status

Σ-8 の実装進捗を Done / Gap / Deferred で一覧化する正本。
ロードマップは `SIGMA-8-PLAN.md`、技術仕様は `SIGMA-8-DEVELOPMENT-SPEC.md`、
UI / アセット仕様は `SIGMA-8-UI-ASSET-SPEC.md` を参照。

このファイルが「実装側の事実」を反映、PLAN / SPEC が「目標」を反映する。
両者にズレがあるときはここで明示する。

最終更新: Σ-8-fix-8（commit `6e4e7e9`）

M2.1 以降の設計リセットは `M2-DIRECTION-RESET.md` を正本とする。
この STATUS は「現在実装済みの事実」と「次に整理すべき Gap」を管理する。

---

## ✅ Done（M2 で実装済み）

### データ構造 / 通行ルール / A*

| 項目 | 実装 | 検証 |
|---|---|---|
| TerrainMaterial 5 種 (`grass/soil/rock/sand/snow`) | `types.ts` | tsc / sim |
| `RampDir = 'N'|'S'|'E'|'W'` + `TerrainTile.ramp` | `types.ts` | unit test |
| `TerrainTile.{wetness, mud, snowCoverage, isSea}` | `types.ts` | unit test |
| `ELEV_STEP=25` / `MAX_ELEV=255` | `config.ts` | sim |
| 25 単位への量子化 (`snapElev`) | `world.ts` | sim |
| 通行ルール 隣接タイル判定（同高度=1.0 / 1段+ramp=1.8 / 他=∞） | `pathfinding.ts passCost` | unit test 4件 |
| Ramp 接続判定（高い側を向く、不正 ramp は通行不可） | `pathfinding.ts canRampConnect` | unit test |
| A* (MinHeap, Manhattan, 4 方向, weighted h*1.001) | `pathfinding.ts findPath` | unit test 平坦100×57 通る |
| `terrainVersion` カウンタ + path cache 破棄 | `world.ts` | sim |
| terrainVersion 即時再ルート（chibi.pathPoints 即計算） | `chibiwafu.ts wanderStep` | sim |
| `waterLevel ≥ 0.35` 閾値跨ぎで `terrainVersion++` | `world.ts updateHydrology` | unit test mask |
| sim/render 共通 elevAt（per-tile flat / ramp barycentric） | `terrain/query.ts elevAtTileSurface` | unit test 3件 |

### 編集ブラシ（6 種）

| ブラシ | キー | 動作 | undo |
|---|---|---|---|
| 盛る (raise) | 1 | terraformJobs に積む、soil×10 消費 | jobs キャンセル |
| 削る (lower) | 2 | terraformJobs に積む、完了時 soil 獲得 | jobs キャンセル |
| 平坦 (flatten) | 3 | 自分+隣接 4 の中央値に揃える | tile snapshot |
| 整地 (smooth) | 4 | 2 段差以上の崖を 1 段ずつ均す | tile snapshot |
| 坂道 (ramp) | 5 | 1 段差ちょうどの隣接に ramp 設置（方向選択） | tile snapshot |
| 水路 (channel) | 6 | 1 段下げ + waterLevel min 0.5 + soil 獲得 | tile snapshot |

すべて drag paint 対応（ramp は連続発動なし）、preview ghost 対応。

### 描画

| 項目 | 実装 |
|---|---|
| atlas lookup terrain shader | `stage3d.ts` |
| per-tile geometry（4 頂点/タイル × 5700 = 22,800 verts）| `buildTerrainGeo / refreshTerrainGeo` |
| material 別 atlas cell（grass/soil/rock/sand/snow） | `MAT_CELL` |
| ramp 専用 cell + 4 方向 UV 反転 | `RAMP_NS_CELL / RAMP_EW_CELL / rampCornerUV` |
| 崖 InstancedMesh 壁面（1 段差以上、ramp 接続境界は除外） | `cliffWallIM` |
| 動的容量拡張（最大 11400+ まで 2 倍ずつ） | `ensureCliffCapacity` |
| wetness/mud/snow vertex color tint | `fillTerrainAttrs` |
| water tile atlas overlay (cell 0,2) | `waterDamp/Shallow/Mid/Deep IM` |
| preview ghost（hover でタイル強調 + valid/invalid 色分け） | `setHoverTile` |

### UI

| 項目 | 実装 |
|---|---|
| 時間 / 天気 / 水位 / 崩落 / 位相 HUD | 左上 `#sigma8-time-hud` |
| 7 ツールバー（raise/lower/flatten/smooth/ramp/channel/build） | 下中央 `#sigma8-toolbar`、キー 1-7 |
| 右設定パネル（半径/強度/ramp 方向/undo/redo） | 左下 `#sigma8-tool-panel`、未選択時 hidden |
| pointer capture（編集中 canvas 外 pointerup でも group 閉じる） | `main.ts` |
| 編集モード中 camera pan 抑止 | `StageHandle.setPanEnabled` |

### Undo / Redo

| 項目 | 実装 |
|---|---|
| MAX_UNDO 50 グループ、Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z | `main.ts` |
| tagged union（'tiles' / 'jobs' / 'jobs-cancelled'） | `main.ts` |
| 1 drag = 1 group、空 undo skip | `rememberPreEdit boolean / rollbackPreEdit` |
| raise/lower 取消 + 再 enqueue + soil refund | `cancelTerraformJob` |

### 演出

| 項目 | 実装 |
|---|---|
| maybeRashLeap（崖飛び込み事故） | trait 9 種で発動率調整 |
| 個性反応セリフ（4 種ブラシ × 9 trait = 36 プール） | `EDIT_LINES` in main.ts |
| dazed/idle cooldown（path 失敗時） | wanderStep |

### セーブ / 永続化

| 項目 | 実装 |
|---|---|
| save v14（elev 0-255 / ramp/wetness/mud/snow/isSea persist） | `meta/save.ts` |
| v13 → v14 migration（×2.55 量子化、'water' → isSea+sand） | `deserializeTerrain` |
| persist スコープ明記（chibis/npcs は再生成） | `save.ts` 冒頭コメント |

### テスト / インフラ

| 項目 | 実装 |
|---|---|
| `scripts/test.ts`（25/25 PASS） | A*/elevAt/hydrology mask/undo |
| `npm run test` / `npm run sim` | `package.json` |
| timeSec ベース優先指示 | `setConstructionPriority(w, ...)` |

---

## ⚠️ Gap（M2 範囲、未着手）

### Gap-0: M2.1 方針リセットの反映

詳細: `docs/M2-DIRECTION-RESET.md`（方針）+ `docs/M2-MIGRATION-PLAN.md`（実装ステップ計画）

| 項目 | 現状 | 方針 |
|---|---|---|
| 建設方式 | 旧 `BUILDINGS` + `points` と新 `Feature` 建設が混在 | `points` 建設を廃止し、map 上 feature/building + 資源 + 労働へ統一 |
| 旧建物 | 農業区/鍛冶場/墓地/太鼓/産屋が残る | 新 feature へ吸収、または legacy 化 |
| くそざこ音頭 | `ondo` イベント/死因/反応が残る | 新規発火停止。画面上の因果が読めるイベントへ置換 |
| NPC | フラナ/スズ/ココン/ルー 4 体 | スズ/ココン/ルー廃止、フラナのみ主要 NPC |
| カメラ | 45° 固定 + zoom/pan | 角度プリセット（低め/標準/真上寄り）を追加、自由回転は不可 |
| 高さスケール | `ELEV_STEP=25`, `ELEV_SCALE=6` | 1 段が大きすぎるため `ELEV_SCALE` 低下または `ELEV_STEP` 細分化を検証 |
| 海表示 | 全面 sea plane + sand 海底 | `isSea` タイル単位の水面表示へ寄せる |
| セリフ | 複数ファイルに分散、旧 NPC/音頭依存あり | `DIALOGUE-CATALOG.md` を使って棚卸し |

優先度: **最高**。次の大きな実装前に設計方針として固定済み。

実装ステップは `M2-MIGRATION-PLAN.md` の 7 ステップに分解（grep 調査済み）：

1. セリフ legacy フラグ化（破壊リスク低）
2. 旧 NPC 移動・更新の停止
3. 音頭イベントの停止
4. 旧 BUILDINGS の縮小（4.1 UI / 4.2 効果計算 / 4.3 ハザード / 4.4 セーブ migration）
5. フラナ通行ルール強化
6. カメラ角度プリセット
7. 海表示 / 高さスケール検証（別 branch）

**現状のコード依存スコープ**（grep 調査済、`M2-MIGRATION-PLAN.md §0` 参照）：
- 旧 BUILDINGS: 34 箇所
- 旧 NPC（suzu/cocoon/lou）: 79 箇所
- ondo / 音頭 / taiko: 94 箇所
- 旧建物個別 ID: 17 箇所

### Gap-1: ramp 工事ジョブ化
- 現状: `setRampOnTile` 即時設置
- 想定: `enqueueRampJob` でジョブ積み、chibi 労働で進行、3D に半完成 ramp 表示
- 個性反映: noumin/sekkachi 駆けつける、shinpai 安全確認、nakimushi 渋る
- 優先度: **高**（Codex 推奨、Σ-8 の主役操作の体感が一段上がる）

### Gap-2: visual asset v2 検品 + 追加生成
- 現状: terrain atlas v2 / ground props v1 / feature sprites v1 は runtime 接続済み
  - **R1 完了（Cliff Readability Reform）**: cliff wall を 3 バリアント IM（soil/rock/damp）+
    底面コンタクトシャドウ IM に置き換え。deterministic brightness variation で縦壁紙感を低減。
    lower tile の material/waterLevel/isSea で atlas cell を選択（docs/SIGMA-8-ASSET-IMPLEMENTATION-SPEC.md 準拠）。
- 残課題: 水際/滝、工事状態、雨雪状態モック
- cliff variants v2 画像生成は、R1 コード改善後の実機スクショを見て再判断（→ Gap-2a 参照）
- 次の正本: `SIGMA-8-VISUAL-ASSET-ROADMAP.md`
- 優先度: **中〜高**（商業見た目へ寄せる主作業）

### Gap-2a: cliff variants v2 画像生成判断（R1 後）
- 現状: R1 コード先行で brightness variation + 3 cell 選択を実装済み
- 次のステップ: 標準カメラ / 遠景スクショを見て、1 cell 反復の壁紙感が残るか判断
- 残るなら `SIGMA-8-VISUAL-ASSET-ROADMAP.md Batch A` を生成する
- 優先度: **中**（R1 実機確認後に判断）

### Gap-3: 工事ポーズ（6 種）発注 + 統合
- 現状: 既存 work_a/b で代用
- 想定: pickaxe_swing_a/b / shovel_dig_a/b / carry_dirt_a/b
- 優先度: **低〜中**（無くてもプレイ可、polish）

### Gap-4: path 失敗時の赤 X / marker
- 現状: dazed 0.8s + pathFailedSec 1.0s、視覚 marker なし
- 想定: 通行不能境界に赤 X、cooldown 持ちでスパムしない
- 優先度: **低**（M2 polish、立ち止まり挙動は既に成立）

### Gap-5: preview に elev 差テキスト / ramp 方向矢印
- 現状: 緑/赤/橙/水色の色分けのみ
- 想定: 「→ +25 / -25」「方向 ↑」のテキスト or アイコン
- 優先度: **低**（情報表示 polish）

### Gap-6: atlas / props / feature sprite の見た目検品
- 現状: v2 terrain atlas と processed props/features を runtime へ接続済み
- 想定: 実機スクショでセルずれ、alpha 抜け、密度過多を確認して必要セルだけ再生成
- 優先度: **中**（見た目品質の主要確認ポイント）

---

## 🚧 Deferred（M3 以降）

### Defer-1: 巨大ファイル分割
- 現状: world.ts 4600行 / main.ts 2400行 / stage3d.ts 2270行
- 想定分割（world.ts 先行）:
  - `sim/hydrology.ts`（updateHydrology + 関連定数）
  - `sim/path/movement.ts`（chibi 移動、wanderStep 周辺）
  - `sim/terraform.ts`（raise/lower/flatten/smooth/ramp/channel API）
  - `sim/construction.ts`（updateConstructions、優先指示）
  - `sim/disasters.ts`（landslide / flood / fire / wolf）
  - `sim/weather.ts`（updateWeather + WEATHER_*）
- main.ts は input / UI bind / save 系で分離
- stage3d.ts は terrain / sprite / hud overlay で分離
- Codex 評価「実装速度より回帰修正が重くなる」前のタイミングで実施

### Defer-2: seed RNG（再現性）
- 現状: 全て `Math.random()`
- 想定: WorldState に PRNG state を持つ、各箇所で `w.rand()` を使う
- 効用: 長時間 sim 検証で同じバグを再現可能、CI で固定 seed 結果比較
- 優先度: M3 デバッグ環境整備として

### Defer-3: chibis/npcs persist の検討
- 現状: 仕様で「使い捨て、ロード時再生成」
- M3 検討: 続きから再開を望む UX なら chibis を save に含める
- 影響: save サイズ +50KB 程度、migration が要る

---

## 📝 Codex レビューで OK / GO 維持確認済

| レビュー回 | 指摘 | 対応 commit |
|---|---|---|
| 1 回目 | P1 terrainVersion 再ルート漏れ | `6aca59d` |
| 1 回目 | P1 A* maxNodes=800 で長距離 fail | `6aca59d` |
| 1 回目 | P1 sim/render 高さモデル分裂 | `6aca59d` |
| 1 回目 | P2 drag paint canvas 外 pointerup | `6aca59d` |
| 2 回目 | P2 rollbackPreEdit edge case | `1cfd314` |
| 3 回目 | P1 waterLevel 閾値跨ぎ無効化漏れ | `7b7c9cf` |
| 3 回目 | P2 編集中 camera pan 競合 | `7b7c9cf` |
| 4 回目（ドキュメント） | CLAUDE.md / SPEC ズレ | このファイル + CLAUDE.md 更新 |
| 4 回目 | P3 Date.now → timeSec | `6e4e7e9` |
| 4 回目 | P2 自動テスト不在 | `6e4e7e9` (`npm run test` 25/25) |
| 4 回目 | P2 巨大ファイル | M3 Defer-1 |

判定: **修正後 GO 維持**（Σ-8 土台、商業品質ベース成立）

---

## 次の優先順序

1. **Visual System 固定** — `SIGMA-8-VISUAL-SYSTEM-SPEC.md` を正本にして状態/見た目/素材の対応を守る
2. **Gameplay Reform R1** — 崖描画をコード先行で改善 ✅ **完了**（3 variant IM + shadow + brightness variation）
3. **Gap-2a: cliff variants v2 判断** — 実機スクショで wallpaper 感が残るか確認、残るなら Batch A 生成
4. **Gameplay Reform R2** — 水位 / 水際 / 流れ / 滝の表示を改善
4. **Gameplay Reform R3** — ramp 工事ジョブ化と worksite 表示
5. **追加素材生成** — cliff / water / worksite の必要 batch だけ生成
6. **旧要素の完全削除判断** — legacy 温存から削除へ進めるか決める
7. **M3 Defer-1 ファイル分割** — 機能追加が重くなる前に

更新タイミング: 新フェーズ commit 時に該当行を Done に動かす、新規 Gap が見つかったら追加。
