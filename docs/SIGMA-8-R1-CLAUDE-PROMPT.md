# Sigma-8 R1 Claude Prompt

この文書は、Claude に `Phase R1: Cliff Readability Reform` を実装してもらうための
コピペ用プロンプト。

## Prompt

```text
# くそざこ村 Sigma-8 R1 実装依頼: Cliff Readability Reform

## 対象ブランチ

- branch: claude/sigma-7-v2-main

## まず読む正本

必ず以下を読んでから実装してください。

- docs/00_README.md
- docs/SIGMA-8-VISUAL-SYSTEM-SPEC.md
- docs/SIGMA-8-GAMEPLAY-REFORM-PLAN.md
- docs/SIGMA-8-VISUAL-ASSET-ROADMAP.md
- docs/SIGMA-8-IMPLEMENTATION-STATUS.md
- docs/SIGMA-8-ASSET-IMPLEMENTATION-SPEC.md

## 背景

現 runtime は terrain atlas v2 / ground props v1 / feature sprites v1 を接続済みで、
以前の「緑の板」より改善しています。
ただし、最遠景や広い崖で cliff wall が 1 cell 反復の壁紙に見え、
高低差が「遊びとして読める段差」ではなく「暗い縦線の塊」に見えています。

今回の目的は、素材を増やす前に **コードだけで崖の読みやすさを上げる** ことです。

## Goal

画面を見ただけで以下が分かる状態にしてください。

- 2 段以上の高低差は通行不能な崖である
- cliff top / side / bottom contact が読める
- 長い崖が同じ絵の反復に見えにくい
- 水辺の崖は湿った崖として読める
- chibiwafu / Furana が崖壁に埋もれて見えない

## Scope

主な実装対象は `src/render/stage3d.ts` です。
必要なら小さな helper を追加しても構いませんが、今回の主作業は描画改善です。

やってよいこと:

- cliff wall instance ごとに deterministic visual variant key を作る
- upper / lower tile の material から cliff visual を選ぶ
- lower tile が `isSea` または `waterLevel` 高めなら damp/wet cliff として扱う
- cliff wall ごとに deterministic brightness / saturation / color variation を入れる
- cliff bottom contact shadow を追加する
- cliff top lip / bottom shadow / side face の見え方を整理する
- steep cliff と one-step edge の見た目を分ける
- 既存 terrain atlas v2 の cliff / rock / soil / damp / shadow 系セルを使い回す
- 必要なら `docs/SIGMA-8-IMPLEMENTATION-STATUS.md` に Gap / Done を更新する

## Non-goals

今回は以下をやらないでください。

- 新しい gameplay rule の追加
- A* / passability / terrainVersion / hydrology の挙動変更
- `ELEV_STEP` の変更
- save schema の変更
- 新規画像生成、または新規画像ファイル追加
- cliff variants v2 の発注・導入
- water shoreline reform
- ramp job 化
- UI 大改修
- chibi / Furana の見た目変更

## Implementation Guidance

既存の `cliffWallIM` / cliff rebuild 周辺を中心に見てください。

優先度:

1. Long cliff repetition を減らす
2. Lower contact shadow を入れて地面との接点を読ませる
3. Upper material / lower water で見た目を変える
4. 最遠景で破綻しない明度にする
5. 余裕があれば corner / cap の扱いを改善する

deterministic variation は乱数ではなく、tile 座標 / edge direction / elev diff から安定して決めてください。
同じ save を開いた時に崖模様が変わらないこと。

## Acceptance Criteria

実装後、スクショを見て以下を満たすこと。

- 標準カメラで崖が「縦壁」として読める
- 最遠景で画面下部や長い崖が壁紙状に見えにくい
- 水辺の崖が乾いた崖と区別できる
- 2 段以上が通れないことを直感できる
- chibiwafu の視認性が落ちていない
- props / feature sprites / terrain atlas v2 の既存表示を壊していない

## Required Verification

必ず実行してください。

- npm run typecheck
- npm run test
- npm run build

可能なら dev server で以下のスクショも保存してください。

- standard view
- far zoom view

## Report Format

完了時は以下を簡潔に報告してください。

- 変更したファイル
- 何を改善したか
- Non-goals を破っていないか
- 実行した検証コマンドと結果
- 残った見た目課題
- cliff variants v2 の画像生成がまだ必要かどうか
```

