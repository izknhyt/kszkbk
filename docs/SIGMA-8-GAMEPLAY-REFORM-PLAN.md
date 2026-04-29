# Sigma-8 Gameplay Reform Plan

この文書は、素材生成を続ける前にゲームシステム側をどう改修するかを決める実行計画。

目的は「綺麗な素材を増やす」ことではなく、素材が意味を持つゲーム状態を作ること。
上位仕様は `SIGMA-8-VISUAL-SYSTEM-SPEC.md`。
素材生成計画は `SIGMA-8-VISUAL-ASSET-ROADMAP.md`。

## Strategy

今は素材量産フェーズではない。
先に以下を作る。

1. 表示状態
2. 表示状態を作るゲームルール
3. 表示状態を出す描画レイヤー
4. 最後に必要な素材

素材生成は止めない。ただし、生成してよいのは当面この 3 系統だけ。

- cliff variants
- shoreline / waterfall FX
- worksite / ramp construction props

それ以外は、表示状態と実装スロットが固まるまで止める。

## Phase R0: 現状固定と検品基準

Status: mostly done

目的:

- 現 runtime の見た目を基準スクショとして保存する
- どこが変かを素材不足ではなくシステム不足として分類する

Done:

- `output/web-game/full-after-assets.png` を保存
- terrain atlas v2 / props v1 / feature sprites v1 を runtime 接続
- `SIGMA-8-VISUAL-ASSET-ROADMAP.md` を追加
- `SIGMA-8-VISUAL-SYSTEM-SPEC.md` を追加

次:

- dev server で同じ条件のスクショを撮る手順を固定する
- 標準カメラ / 最遠景 / 雨 / 夜 / 工事中の 5 枚を検品セットにする

## Phase R1: Cliff Readability Reform

Priority: highest

問題:

- 現在の崖は 1 cell 反復で壁紙感が強い
- cliff top / side / bottom / corner の意味が分かれていない
- 高低差が「遊び」ではなく「黒い壁」に見える

先にコードでやる:

- cliff wall instance ごとに deterministic variant key を持つ
- upper/lower material で soil / rock / wet を選ぶ
- lower tile が water/sea の場合は wet/damp variant
- wall ごとに slight brightness variation を入れる
- lower ground との接点に bottom shadow を出す
- steep cliff と one-step edge の見た目を分ける

必要なら生成:

- `public/terrain/sigma8_cliff_variants_v2_1024.png`

Acceptance:

- 1600x900 標準カメラで崖が縦壁として読める
- 同じ崖が長く続いても壁紙に見えにくい
- 2 段以上が通行不能だと直感できる
- chibiwafu が崖に埋もれて見えない

Claude implementation prompt:

```text
Implement Phase R1 cliff readability reform.

Read:
- docs/SIGMA-8-VISUAL-SYSTEM-SPEC.md
- docs/SIGMA-8-GAMEPLAY-REFORM-PLAN.md
- docs/SIGMA-8-VISUAL-ASSET-ROADMAP.md

Scope:
- Do not add new gameplay rules.
- Improve cliff rendering using current terrain atlas v2 first.
- Add deterministic per-wall visual variation.
- Select cliff visual from upper/lower tile material and water/sea adjacency.
- Add bottom shadow/contact treatment if feasible.
- Keep A* and terrainVersion behavior unchanged.

Verify:
- npm run typecheck
- npm run test
- npm run build
- screenshot far view and standard view
```

## Phase R2: Water / Shoreline / Flow Reform

Priority: high

問題:

- waterLevel と見た目の対応が弱い
- 岸、泡、流れ、滝が不足
- 水で死ぬ/通れない理由が画面だけでは弱い

先にコードでやる:

- `waterLevel` tier を visual tier として明示する
- water/non-water adjacency から shoreline edge を出す
- channel または gradient から flow direction を表示する
- elev diff + water crossing で waterfall を表示する
- sea と inland water を見た目で分ける
- HUD の水位リスクを water visual と一致させる

必要なら生成:

- `public/fx/sigma8_water_edges_v1_processed.png`

Acceptance:

- `waterLevel >= 0.35` が通行不可だと見た目で分かる
- 低地に水が溜まっていることが読める
- 水路が水を運んでいることが読める
- 滝/段差水が elev 差と一致する
- 水死が発生した時、画面上に原因がある

## Phase R3: Ramp / Worksite Reform

Priority: high

問題:

- ramp は即時設置で、工事の達成感が弱い
- 工事中表示が数字に寄っている
- 切り土/盛り土/坂道化がプレイ体験としてつながりきっていない

ゲームシステム:

- ramp placement を job 化する
- job state を `planned / material / working / blocked / completed` に分ける
- chibiwafu が近づいて作業する
- work progress は visual state と小さな UI 補助で見せる
- blocked job は理由を短く出す

必要素材:

- `public/props/sigma8_worksite_props_v1_processed.png`
- 工事ポーズ 6 種は後続 polish

Acceptance:

- 切り土で崖を低くする
- ramp 工事を予約する
- ちびわふが作業する
- ramp 完成後に A* が通す
- この流れが 1 分以内に画面上で理解できる

## Phase R4: Survival Causality Reform

Priority: high

問題:

- 食料、空腹、天気、死因の因果が見えにくい
- くそざこな死に方は良いが、原因不明だと理不尽に見える

改修対象:

- food production / consumption trend
- hunger and fatigue thresholds
- weather exposure and cold/heat risk
- death cause text
- speech bubble pools
- risk HUD

ルール:

- Common death は visible cause を持つ
- Rare death は absurd でよいが、発生条件はログ/図鑑で追える
- 食料不足は deaths より先に UI に出る
- 天気由来の死亡は天気 HUD と画面 tint/FX に紐づく

Acceptance:

- 食料が減っていることが死ぬ前に分かる
- 飢餓死が出た時、プレイヤーが原因を説明できる
- 水死/崖落ち/火事/寒さが画面上の状態と一致する
- 「だからどうした？」系の発言が通常頻度では出ない

## Phase R5: UI Reform

Priority: medium-high

問題:

- UI が情報を出しているが、開拓ゲームとしての次アクション誘導が弱い
- スコア、資源、危険、作業が分散している

改修対象:

- top-left time/risk HUD
- right build panel
- bottom tool bar
- minimap
- log/speech priority

UI の主目的:

- 次に危ないことを示す
- 次にできる作業を示す
- 選択中ツールの結果を示す
- 失敗理由を短く示す

優先 UI:

| UI | 目的 |
|---|---|
| risk HUD | 水位/崩落/食料/天気を一括表示 |
| task hint | 未完成 job / blocked job / missing resource |
| tool preview | 変化後 elev / ramp direction / cost |
| selected feature panel | 生産/消費/状態/必要資源 |
| log filter | 死因と重要警告を優先 |

## Phase R6: Terrain Scale / Generation Reform

Priority: medium

問題:

- 1 段の高さが chibiwafu に対してまだ大きい可能性
- 地形生成が「遊べる谷/尾根/水路」を十分に作れていない

検証:

- A: `ELEV_STEP=25`, `ELEV_SCALE=3.2-4.0`
- B: `ELEV_STEP=12`, `ELEV_SCALE=4.0`
- C: `ELEV_STEP=16`, `ELEV_SCALE=3.5`

比較条件:

- 標準カメラ
- 最遠景
- chibi 60 体
- ramp / cliff / water / building あり
- A* pathfinding と hydrology が破綻しない

Decision gate:

- M2 では A を基本とする
- B/C は migration と pathfinding 調整が必要なので、別 branch の小検証だけにする

## Phase R7: Asset Generation

Priority: after R1/R2/R3 slots are proven

生成順:

1. Cliff Wall Variants v2
2. Shoreline / Waterfall FX v1
3. Worksite / Ramp Construction v1
4. 追加モック: rain/flood, winter/night, construction close-up
5. Feature Sprites v2 if needed
6. Character pixel-art comparison if needed

作らないもの:

- 全建物 v2 一括
- 全 UI icon
- 全季節差分
- 災害 FX 全部
- キャラ pixel-art 全ポーズ

## Phase R8: Character Pixel-Art Decision

Priority: optional, late

判断:

- 既存 40 chibi poses は高価な資産なので、軽く捨てない
- ドット絵化は地形/UI/props と同一画面で比較する
- 比較モックで明確に良くならない限り、M2 では既存水彩 billboard を維持する

Acceptance:

- far zoom でキャラが読める
- chibi の弱さが増す
- feature/terrain と情報量が合う
- 既存ポーズ資産を捨てる価値がある

## Immediate Next Actions

今からの順番:

1. `SIGMA-8-VISUAL-SYSTEM-SPEC.md` を正本として固定
2. Claude に Phase R1 cliff readability reform を実装させる
3. 実機スクショを見て、cliff variants v2 が必要か判断
4. R2 water reform に進む
5. R3 ramp/worksite reform に進む

素材生成に戻る判断条件:

- コードだけでは崖/水/工事の意味が足りない
- 表示状態と render layer が決まっている
- 生成した素材を置くセルと実装先が決まっている

## Review Checklist

各 phase 後に見ること:

- 画面だけでルールが読めるか
- 死因と見た目が一致するか
- chibiwafu が主役に見えるか
- UI が次の行動を邪魔していないか
- 素材が増えただけでゲームが分かりにくくなっていないか
- typecheck/test/build が通るか

