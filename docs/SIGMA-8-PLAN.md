# Σ-8 商業クオリティ地形システム再設計（M2 / 2 ヶ月スコープ）

## Context

くそざこ村は Σ-7 までで「水動力・狼襲撃・粗相ボコ・40 ポーズ」と機能を積んだが、
プレイヤー（オーナー）が実機確認した結果、**地形改造の体感が壊滅的**：

- 切り土・盛り土を発注しても **見た目がほぼ変わらない**（ELEV_SCALE 12 × RAISE_AMOUNT 5 = 画面で 5px 程度の起伏変化）
- ちびわふが **崖を普通に登る**（bilinear 平滑化された slope 検査が崖を見逃す）
- 地形が **読みにくい**（彩度・コントラスト弱い、崖と坂の区別不明）
- terraform UX が **1 タイル 1 クリック**で大規模改造に苦痛
- 元の地形を **原型留めない自由度** で改造したいが現状不可能
- 全体的に「**完成感**」がない、市販ゲーム品質に届かない

これに対し過去のフェーズ（Σ-5 〜 Σ-7）が「数値を少しずつ調整」「線を描く」「色を変える」
といった**症状治療**に終始していた。今回は**根本リワーク**する：
- 地形データ・描画・操作・AI 全部を市販品質基準で組み直す
- 参考：A Short Hike をちょっと現実寄りにした作風（Toon すぎず、PBR すぎず）
- 期間：M2 マイルストーン（**2 ヶ月、8 週間**）で「市販ゲームに近い」レベルまで到達

達成後の体験：プレイヤーがマウスドラッグで土を盛る/削ると即座に地形が変わり、
垂直壁の崖がちびわふを物理的にブロックし、切り土を進めると壁が坂に変わって
新しい道が開通する。元の地形が原型を留めない大規模改造が **触って楽しい**ゲームに。

## 設計判断（オーナー確認済み）

| 項目 | 採用 |
|---|---|
| ビジュアル主軸 | A Short Hike + やや現実寄り（パステル過ぎず、リアル過ぎず） |
| 土量保存則 | **導入しない**（idle 性維持、気軽に開発） |
| シェーディング | **ハイブリッド**：地形は PBR-light、ちびわふは Toon 維持 |
| スケジュール | **M2 = 2 ヶ月で中間着地**（M1 base + A* + 9 mat + tri-planar 崖 + 5 brush + アンドゥ） |

## Vision（プレイ体験）

**0-30 秒**：雨上がりの斜面に置かれる。半透明の円ブラシ（半径 3 タイル）がカーソル
追従、地表に淡い等高線ハイライト。左ドラッグで土が盛り上がる音と粒子で段差ができ、
近くのちびわふがツルハシ持って殺到。

**5 分目**：最初の堤防完成、その上に家を置く。雨で堤防決壊、ちびわふ流される。
カメラシェイク + スローモー + 崩落粒子 + 水音の演出。

**30 分目**：等高線地形に村が育つ。雪が降り、北向き斜面だけ白く残る（splatmap で実現）。

**3 時間目**：元の谷から原型を留めない景観。棚田・ダム・採石場跡が一体になる。
ちびわふの墓が等高線沿いに並ぶ。

**達成感ピーク**：①「明確に景観が変わる」瞬間（5-15 分目）、②季節サイクル一巡で
表情が変わる瞬間、③崩落事故の跡地が新しい地形として生き続ける瞬間。

**くそざこ味**：失敗 = 死 + 笑い。RimWorld のように悲劇が高品質グラフィックで描かれて
こそ可笑しい。

---

## 実装フェーズ（8 週、5 サブフェーズ）

### Σ-8-a　地形データ拡張（Week 1-2）

**目的**：見た目が変わる土台を作る。データ構造と数値レンジから根本的に拡張。

- **elev レンジ拡大**：0-100 → **0-255**（`Uint8` で持てる最大、`src/types.ts:93`）
  - 既存 generator の elev 出力を 2.5 倍にスケール（`src/sim/terrain/generators.ts`）
  - `getElevation` (`world.ts:1075`)、`elevToMaterial` (`world.ts:1028`) 等の閾値全面再調整
- **ELEV_SCALE 12 → 6**（`stage3d.ts:42`）：実 Y は 0-1530 で現在より約 +27%。fov 20° 視野に収まる
- **RAISE_ELEV_AMOUNT 5 → 25**（`world.ts:1140`）：1 ジョブで画面上 100-150px の段差変化、見えるレベル
- **TerrainTile 拡張**（`types.ts:92`）：`splat: [g, r, s, sn]`（草/岩/砂/雪 4ch float 0-1）, `wetness: 0-1`, `snowCoverage: 0-1` 追加
- **TerrainMaterial 拡張**：5 種 → **9 種**（grass, dry_grass, soil, mud, sand, gravel, rock, snow, wetland）
- **save migration v13 → v14**（`meta/save.ts:11`）：terrain RLE に splat ch 追加、後方互換は v13 を 4ch=[1,0,0,0] で復元

**完了条件**：1 回切り土で目視で「明らかに段差ができた」がわかる。崖が高く、谷が深くなる。

### Σ-8-b　崖物理化 + A* pathfinding（Week 3-4）

**目的**：崖を本当の壁にする。ちびわふは登れない、迂回を強制。

- **タイル直接の崖判定**：bilinear 廃止、`src/sim/world.ts:3260` 周辺の slope 検査を
  「進路上の隣接タイル elev 差」を直接見る方式に変更
  - 差 ≥ 60（slope 0.94）= 完全壁、移動 reject + target 破棄
  - 差 30-60 = 急坂、速度 50%、滑落リスク
  - 差 < 30 = 通れる坂
  - elev 拡張 (0-255) に合わせて閾値も再スケール
- **A\* pathfinding 導入**（`src/sim/chibiwafu.ts` を全面リライト）
  - 100×57 タイル grid で manhattan + heuristic
  - 隣接コスト = 1 + (elev 差 × 0.05)、差 ≥ 60 や水タイルは不可
  - `c.path: Vec2[]` フィールド追加、`wanderStep` を path consumer に書き換え
  - 60 ちびわふ × 30Hz = フレーム当たり最大 4 path 計算（job queue 化）
  - target 設定時に path 計算、毎 tick 次の waypoint へ移動、到達で次へ
- **垂直壁メッシュ**（`stage3d.ts` の cliffLines を置換）
  - 隣接 elev 差 ≥ 30 の境界 4 辺ごとに `BoxGeometry` 立てる
  - 高さ = elev 差 × ELEV_SCALE、幅 = 32px、奥行き 4px
  - 既存 cliffLines 削除、`InstancedMesh` で全壁をまとめて 1 draw call
- **崩落と整合**：`src/sim/world.ts:1340-1357` の Σ-2-c 崩落で壁メッシュも更新

**完了条件**：ちびわふが崖の前で立ち止まり、別経路で迂回。切り土を進めると壁が消失して通れるように。

### Σ-8-c　ハイブリッドシェーダ + アセット適用（Week 5-6）

**目的**：「A Short Hike + 現実寄り」の地形を実現。テクスチャベースで質感を上げる。

- **シェーダ拡張**：`MeshToonMaterial` を `onBeforeCompile` で fragment 拡張
  - 4ch splatmap blend（草/岩/砂/雪）、各タイルの splat 重みで texture を mix
  - 急斜面（normal.y < 0.6）に **tri-planar projection** で岩テクスチャ強制適用（テクスチャ伸び回避）
  - `wetness` チャネルで雨後の specular boost + albedo 暗化
  - `snowCoverage` で雪オーバーレイ（北向き斜面に偏在）
  - rim light（縁発光）軽め追加 → A Short Hike のキャラクター発光感を模倣
- **テクスチャ入手**：Poly Haven CC0 から流用（5-7 日待たずに即着手）
  - 9 マテリアル × albedo + normal + roughness = **27 枚**を 1024px シームレス
  - Poly Haven が CC0、商用 OK、A Short Hike 寄りの彩度に **後処理で調整**（彩度 +10、明度 +5、Saturation curve）
- **崖専用 rock テクスチャ**：top/side/bottom 別 6 枚、tri-planar で 3 軸別投影
- **ポストプロセス**（`EffectComposer` 導入）
  - `SSAOPass`：俯瞰視点で崖の陰影が大きく効く（核心）
  - `LUTPass`：季節別 4 枚（spring=明るめ、summer=飽和、autumn=暖、winter=寒）の LUT.cube
  - `UnrealBloomPass`：弱め（0.3）、太陽・水面ハイライト用
- **ground prop**：`InstancedMesh` で草・茂み・花の 3 種を導入
  - tile 当たり 8-16 株、grass / dry_grass tile のみに分布
  - terraform 完了時に **追従して再生成**（これが「変化が見える」の核）
  - prop モデルは ChatGPT で「A Short Hike 風 草・茂み・花 sprite」発注（10 種、各 256×256 透過）

**完了条件**：地形がテクスチャ付きで質感ある。雨で湿ると見た目変わる。雪が積もる。草が揺れる。

### Σ-8-d　ブラシ UX（Week 7）

**目的**：プレイヤーが「触って楽しい」と感じる terraform 操作。

- **5 種ブラシ**（`src/main.ts:735-770` 周辺を全面リライト）
  - ① 円形（半径 1-8 タイル可変、スライダー）
  - ② 矩形（drag-rect 範囲指定）
  - ③ スムーズ（周囲 elev 平均化）
  - ④ 平坦化（クリック地点高度に揃える）
  - ⑤ 水路掘削（drag-paint で連続溝）
- **drag-paint**：mousedown 中は対象タイル全部に同じジョブ発行
- **ゴーストプレビュー**：`pointermove` 時にブラシ範囲を半透明 mesh で「これがこうなる」表示
  - 等高線は ON で表示、斜面安定度は緑/黄/赤で着色
- **アンドゥ**：操作リング 50 ステップ、`world.ts` に `terraformHistory` Maintained
  - 各エントリ = タイル群の `{tx, ty, prevElev, prevMaterial, prevSplat}` snapshot
  - Ctrl-Z で巻き戻し、Y で redo
- **段階的補間アニメ**：`updateTerraformJobs` (`world.ts:1329`) を progress に応じて elev を **連続補間**
  - 現状：完了時に瞬間 +25
  - 改修後：progress 0→1 に従って elev が target に向けて滑らかに上昇 → 工事の進捗が「目で見える」
- **HUD スライダー**：右下に縦スライダー、目標 elev を絶対値で指定可能（現在の +/- 即値モードと併存）
- **「ここ通れない」表示**：ちびわふが path 計算失敗したら 該当壁を **赤い X マーカー** で一時表示

**完了条件**：マウスドラッグで地形をペイント感覚で開発できる。失敗して Ctrl-Z で戻せる。

### Σ-8-e　Polish & integration（Week 8）

**目的**：完成度を市販品質の 80% まで引き上げる。細部の演出と整合。

- **工事ポーズ追加発注**：ChatGPT で 6 ポーズ（pickaxe_swing_a/b、shovel_dig_a/b、carry_dirt_a/b）
  - 既存 40 ポーズ規約と同じ 1024×1024、彩度合わせる
  - `CHIBI_URLS` を 46 ポーズに拡張、CHIBI_STATE_IDX を terraform-work 用に拡張
  - terraform 中のちびわふがこれを順繰りに使う
- **「通れるようになった」反応**：terraform 完了タイル近傍のちびわふに 30% で
  「みちができたわふ！」「とおれるわふ〜」等のバブル（`chats.ts` に追加）
- **集団作業フォーメーション**：worker 4+ で隊列を組む
  - 先頭がツルハシ振り、後続が土運びで列をなす
  - 視覚的「土塊リレー」（小さな茶色の丸が手から手へ移動するパーティクル）
- **ground prop 連動の磨き**：terraform 跡が「裸の土」（茶色 splat）として一定時間残る
  - 30 秒経つと草の splat が回復（ただしプレイヤーが踏み続けるとリセット）
- **ビフォーアフター minimap**：1 日経過毎にスナップショット保存、`recentDays: ImageData[]` を持つ
  - HUD で「3 日前 → 今日」の比較が見られるトグル
- **balance 全面再確認**：sim 30 分実行で死因分布、food 収支、ちびわふ寿命の整合
- **音 polish 留保**：BGM/SFX は M2 範囲外（M3 で対応）。当面は無音 or 既存ライブラリ流用

**完了条件**：ゲームが「市販品質に近い」と感じられる。
- 触ったら地形が変わる
- 崖が壁、坂が坂
- 切り土→道開通の達成感
- アセットがちびわふと整合し画面崩壊しない

---

## Critical Files

### 主要改修対象
- `/home/user/kszkbk/src/types.ts`
  - L90: `TerrainMaterial` を 5 → 9 種拡張
  - L92-98: `TerrainTile` に `splat[4]`, `wetness`, `snowCoverage` 追加
  - L106 周辺: `DeathCauseId` に必要なら追加（暴走土砂・brush 失敗等）
- `/home/user/kszkbk/src/sim/world.ts`
  - L1140: `RAISE_ELEV_AMOUNT` 5 → 25
  - L1100-1230: `getElevation` / `raiseTile` / `lowerTile` / 崩落の elev レンジ更新
  - L1329-1357: `updateTerraformJobs` を progress 連続補間に変更
  - L3260 周辺: chibi の slope 検査をタイル直接判定 + path consumer 化
  - 新規: `terraformHistory[]` でアンドゥ
- `/home/user/kszkbk/src/sim/chibiwafu.ts`
  - 全面リライト：A* pathfinding 導入、`c.path: Vec2[]`、`wanderStep` を waypoint 追従に
- `/home/user/kszkbk/src/sim/terrain/generators.ts`
  - elev 出力を 0-100 → 0-255 にスケール、3 地形（plains/peninsula/island）の特徴量再調整
- `/home/user/kszkbk/src/sim/terrain/query.ts`
  - `isSeaAt` の閾値を新レンジに合わせる
- `/home/user/kszkbk/src/render/stage3d.ts`
  - L42: `ELEV_SCALE` 12 → 6
  - L266-326: `buildTerrainGeo` / `refreshTerrainGeo` に splat attribute 追加、UV 計算
  - 新規: `terrainShader.ts` 切り出し、`MeshToonMaterial.onBeforeCompile` 拡張
  - 新規: 垂直壁 `InstancedMesh`、ground prop `InstancedMesh`
  - 既存 `cliffLines` LineSegments 削除（壁メッシュで置換）
  - `EffectComposer` + SSAO + LUT + Bloom 統合
- `/home/user/kszkbk/src/main.ts`
  - L735-770: terraform handler を 5 ブラシ + drag-paint に拡張
  - HUD スライダー、アンドゥキー（Ctrl-Z / Y）、プレビューレイヤー
- `/home/user/kszkbk/index.html` / `src/style.css`
  - ブラシツールバー、HUD スライダー、minimap before/after トグル
- `/home/user/kszkbk/src/meta/save.ts`
  - L11: `CURRENT_VERSION` 13 → 14
  - terrain RLE に splat 4ch + wetness + snowCoverage 追加、v13 互換ロード

### 既存資産の再利用（agent 報告より）
- `enqueueTerraformRaise/Lower` (`world.ts:1163-1192`)：上書き・refund ロジック流用、batch 化のみ追加
- `priorityTerraformJobPositions` システム：既存の 5 分優先キュー流用
- `updateChibi` の labor AI（70% で terraform に集まる）：A* path に乗せる
- Σ-2-c 崩落（`world.ts:1340-1357`）：壁メッシュ更新と統合
- Σ-7 水動力（`updateHydrology`）：wetness チャネルの計算ソースに流用

---

## Asset Plan

### Phase 1（即着手、CC0 流用）
- **Poly Haven** から 9 マテリアル × albedo+normal+roughness = 27 枚
  （grass, dry_grass, soil, mud, sand, gravel, rock, snow, wetland）
- 崖用 rock × 3 マップ × 3 投影 = 6 枚
- A Short Hike 寄りに彩度+10、明度+5 を後処理（GIMP / Photoshop バッチ）

### Phase 2（ChatGPT 発注、Week 4-5 並行）
- **工事ポーズ 6 種**（pickaxe_swing_a/b, shovel_dig_a/b, carry_dirt_a/b）
  - 既存 40 ポーズ規約（1024×1024、線・色一致）
- **ground prop 10 種**（草、茂み、花、茸、若木 等）
  - 256×256 透過、A Short Hike 風（彩度高めパステル）

### Phase 3（M3 で発注、保留）
- BGM 6 トラック（Suno / Udio で生成、または Kevin MacLeod CC 流用）
- SFX 30 種（ツルハシ、水流、雨、足音等。Freesound CC0）
- 季節 LUT 4 枚（手作業で各 64×64×64 cube）
- character face overlay PNG 10 表情（既発注規約準拠）

---

## Verification

### Phase ごとの検証

**Σ-8-a 完了時**：
```bash
npm run build && npm run dev
# 確認：1 回切り土で目視可能な段差変化、画面 100px 以上の高低差
# 確認：崩落跡の elev 差が新レンジ（0-255）で正しい
npx tsx scripts/sim.ts  # balance 30min standard で死因分布が壊れていない
```

**Σ-8-b 完了時**：
```bash
# A* pathfinding 動作確認：崖を作って迂回するか
# Mac で起動 → 切り土でノッチを作る → 通行確認
# 性能：60 ちびわふで fps 60 維持（job queue 効果）
```

**Σ-8-c 完了時**：
```bash
# テクスチャ表示確認（草地・岩肌・砂地）
# tri-planar 崖：傾斜 60° 以上でテクスチャ伸びがない
# 雨で wetness 変化、雪期に snowCoverage 累積
# fps 計測：ground prop 込みで 60 維持
```

**Σ-8-d 完了時**：
```bash
# 5 ブラシ全部動作、drag-paint、Ctrl-Z アンドゥ
# プレビューゴーストが正しい目標 elev を表示
# progress 連続補間で工事中の elev が滑らかに変化
```

**Σ-8-e 完了時**：
```bash
# 工事ポーズが見える、隊列フォーメーション
# 完了時のバブル「みちができたわふ！」
# minimap before/after が表示される
# headless sim 30min で死因 / 食料 / 寿命がバランス取れている
```

### 統合テスト（M2 完了時）
1. 新規 hell 難度ラン開始 → 30 分プレイ
2. 山を切り土で削って平地に変える（10 タイル分）
3. その土地に建物 5 つ建てる
4. 切り土跡を minimap で確認、地形変容を視覚で実感
5. ちびわふが新道路を歩いて来る挙動

### 性能基準（M2 ゴール）
- **fps 60 維持**（chibi 60 + 地形 + ground prop + post-process）
- **terraform 入力 → 視覚反映 < 100ms**（progress 開始のレスポンス）
- **A\* path 計算 < 10ms / chibi**（job queue で全体 < 4ms / frame）
- **save.ts v14 シリアライズ < 50ms**（terrain RLE 効率維持）

---

## Risks & Mitigations

| リスク | 影響 | 対処 |
|---|---|---|
| Three.js シェーダ拡張で `MeshToonMaterial` の `onBeforeCompile` が壊れる | 地形描画停止 | バックアップ branch、proto 段階で 2-3 日検証 |
| A\* で 60 chibi の同時 reroute 時に CPU スパイク | fps 30 まで低下 | job queue（フレーム最大 4）+ 2 秒キャッシュ |
| Poly Haven のテクスチャが A Short Hike テイストに合わない | 美術崩壊 | 早期 Week 5 に 1 マテリアル試行、合わなければ ChatGPT 発注に切替 |
| save v13 → v14 migration バグでセーブ破壊 | プレイヤー進捗喪失 | unit test + バックアップ自動取得（slot 別の v14_backup フォルダ） |
| 8 週で完成しない | 中途半端な状態でリリース | M2 を Week 6 / Week 8 の 2 段階区切りで運用、最悪 Week 6 時点でも遊べる状態を維持 |
| 工数見積もり狂い（実体は 1 名で 5-7 ヶ月） | スケジュール破綻 | M2 = 「市販品質の 80%」と割り切り、残り 20% は M3 で別枠 |

---

## Out of Scope（M3 以降）

- 流体シミュ shader（GPU で流れる水の表面）
- BGM / SFX 全差し替え
- 完全 PBR（PBR-light で妥協）
- LOD / chunk-based loading（100×57 では不要）
- character face overlay 10 表情の追加発注
- マイルストーン M3（5-7 ヶ月）の総仕上げ

これらは Σ-9 / Σ-10 で別途計画する。

---

## ブランチ運用

- 作業ブランチ：`claude/sigma-8-main`（`claude/sigma-7-v2-main` から派生）
- 各サブフェーズ完了で commit、Σ-8-a 完了でレビュー、Σ-8-b 完了でレビュー、…
- M2 完了時に本流 `claude/idle-village-game-7IfPd` に merge
- アセット発注分は別ブランチ `claude/character-image-brainstorm-rxHdJ` 系で並行作業
