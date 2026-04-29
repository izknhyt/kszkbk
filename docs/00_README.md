# ちびわふアセット仕様書

このディレクトリは **ちびわふ/フラナのゲーム用画像アセット** を
ChatGPT やその他 AI / 絵師 に発注する際の一貫性を担保するための仕様書群。

毎回プロンプトを書き直すとブレる → **この仕様書を先に貼る** 運用に統一する。

---

## ドキュメントの読み分け（Σ-8 以降）

ファイルは目的別に 3 系統に分かれている。Claude / Codex セッションを開くときは
**該当系統の正本を最初に読む** こと。

### 1. 実装正本（コード実装が参照する根拠）

| ファイル | 役割 | 読むタイミング |
|---|---|---|
| `../CLAUDE.md` | プロジェクト全体ガイド、最優先正本 | 新セッション必読 |
| `M2-DIRECTION-RESET.md` | **M2.1 以降の設計方針**（旧要素整理 / 建設統合 / NPC整理） | 実装方針確認時 |
| `M2-MIGRATION-PLAN.md` | **M2.1 実装ステップ計画**（7 段階 + grep 調査済 + 検証チェック） | M2.1 コード変更前 |
| `SIGMA-8-IMPLEMENTATION-STATUS.md` | **実装側の事実**（Done / Gap / Deferred） | 実装着手前 |
| `SIGMA-8-DEVELOPMENT-SPEC.md` | **目標仕様**（型 / 通行ルール / 描画 / ブラシ）| 実装中の判断基準 |
| `SIGMA-8-VISUAL-SYSTEM-SPEC.md` | **表示システム正本**（状態 / ルール / 見た目 / 素材の対応） | 見た目・素材・UI 改修前 |
| `SIGMA-8-GAMEPLAY-REFORM-PLAN.md` | **ゲーム改修順序**（素材生成前に固めるシステム改修） | 次フェーズ実装前 |
| `SIGMA-8-R1-CLAUDE-PROMPT.md` | **R1 崖改善の Claude 依頼文**（スコープ / 非スコープ / 検証） | Claude に実装を依頼する時 |
| `SIGMA-8-PLAN.md` | M2 ロードマップと判断記録 | 全体方針確認時 |
| `DIALOGUE-CATALOG.md` | 発言/死因テンプレ/セリフ棚卸し | 台詞整理時 |
| `SCRIPT-CATALOG.md` | npm scripts / 検証コマンド一覧 | 作業前後 |

**ズレ検出ルール**: SPEC と STATUS が食い違っていれば STATUS が事実、SPEC は目標。
両者ズレが見つかったら STATUS の Gap セクションに記載する。

### 2. 素材正本（ChatGPT 発注 / 検品の根拠）

| ファイル | 対象 |
|---|---|
| `10_character_design.md` | ちびわふ / フラナの固定デザイン（種族特徴・色・プロポーション）|
| `20_technical_spec.md` | PNG 形式・解像度・命名規則・納品要件 |
| `30_pose_catalog.md` | 40 ポーズのプロンプト辞書 |
| `40_accessory_library.md` | 小物 20 種の仕様 |
| `50_prompt_templates.md` | 発注マスタープロンプト（コピペ用）|
| `90_qa_checklist.md` | 納品検品チェックリスト |
| `SIGMA-8-UI-ASSET-SPEC.md` | 地形 atlas / Ground props / 工事ポーズ / UI Icons の仕様 |
| `SIGMA-8-ASSET-IMPLEMENTATION-SPEC.md` | 生成済み terrain/props/features のセル対応・実装順・Claude引き継ぎ |
| `SIGMA-8-VISUAL-ASSET-ROADMAP.md` | 次に必要なモック / アセット生成 / 検品順 |
| `sigma-8-mockup.png` | 画風基準の参考画像（pixel-perfect ではない、構図の手本） |

### 3. 古い / 参考扱い（読まなくていい）

特になし。旧バージョンの HANDOFF.md は廃止済み。
過去の判断記録は各 SIGMA-8-*.md の「経緯」「変更履歴」セクションに統合済み。

---

## ファイル構成

| ファイル | 内容 | 想定利用者 |
|---|---|---|
| `00_README.md` | このファイル。全体マップ | 全員 |
| `10_character_design.md` | キャラ固定デザイン（種族特徴・色・プロポーション） | 発注時に必ず貼る |
| `20_technical_spec.md` | PNG 形式・解像度・命名規則・納品要件 | 発注時に必ず貼る |
| `30_pose_catalog.md` | 40 ポーズのプロンプト辞書（既存9 + 追加31） | ポーズ発注時 |
| `40_accessory_library.md` | 小物 20 種の仕様 | 個体差 overlay 発注時 |
| `50_prompt_templates.md` | 発注マスタープロンプト（コピペ用） | 発注時 |
| `90_qa_checklist.md` | 納品チェックリスト | 納品検品時 |
| `SIGMA-8-PLAN.md` | M2 地形リワークのロードマップ v2 | Sigma-8 実装時 |
| `SIGMA-8-DEVELOPMENT-SPEC.md` | Sigma-8 の実装仕様・禁止事項・検証基準 | Sigma-8 実装時 |
| `SIGMA-8-IMPLEMENTATION-STATUS.md` | Sigma-8 の Done / Gap / Deferred 一覧 | Sigma-8 実装着手前 |
| `SIGMA-8-VISUAL-SYSTEM-SPEC.md` | 表示状態、ゲーム条件、描画レイヤー、必要素材の対応 | 見た目・UI・素材実装前 |
| `SIGMA-8-GAMEPLAY-REFORM-PLAN.md` | 崖、水、工事、UI、因果整理の実装順 | Claude/Codex への実装依頼前 |
| `SIGMA-8-R1-CLAUDE-PROMPT.md` | Phase R1 cliff readability reform の依頼プロンプト | Claude に貼る時 |
| `SIGMA-8-UI-ASSET-SPEC.md` | Sigma-8 の UI / terrain atlas / prop / icon 仕様 | UI・素材実装/発注時 |
| `SIGMA-8-ASSET-IMPLEMENTATION-SPEC.md` | 生成済み terrain/props/features asset の実装マッピング | 素材統合時 |
| `SIGMA-8-VISUAL-ASSET-ROADMAP.md` | 未生成モック、次回アセット batch、採用ゲート | 素材追加・画面検品時 |
| `M2-DIRECTION-RESET.md` | M2.1 以降の設計方針。旧 points 建設 / 旧 NPC / 音頭の整理 | 次フェーズ設計時 |
| `M2-MIGRATION-PLAN.md` | M2.1 実装ステップ計画。7 段階に分解、grep 調査済 | M2.1 コード変更前 |
| `DIALOGUE-CATALOG.md` | セリフ、死因テンプレート、発言プールの棚卸し | 台詞・死因整理時 |
| `SCRIPT-CATALOG.md` | npm scripts、sim、test、asset/docs 関連コマンド一覧 | 作業前後 |

---

## 発注運用フロー

詳細手順は `50_prompt_templates.md § 7`（キャラ別）を参照。概要：

```
1. 欲しいアセットを決める（例: 10_walk_lean）
2. 対象キャラを決める（ちびわふ or フラナ）
3. 50_prompt_templates.md § 1（ちびわふ）または § 2（フラナ）のプロンプトをコピー
4. [POSE_DESCRIPTION] を 30_pose_catalog.md から差し替え
   ※ フラナ発注時は description 中の "Chibiwafu" → "Furana" に全置換
5. ChatGPT のサブスク版画像生成 UI に、対応する **生成用 visual reference** 画像を添付：
   - ちびわふ: public/chibiwafu/00_origin.png
   - フラナ:  public/furana/01_normal.png
   - **過去の失敗生成画像は添付しない / 同じ画像生成コンテキストに残さない**
6. `50_prompt_templates.md` の該当プロンプトを ChatGPT のサブスク版画像生成 UI に貼る
7. 納品物を 90_qa_checklist.md § B-1+B-2（ちびわふ）/ B-2+B-3（フラナ）で検品
8. NG 項目あれば 50_prompt_templates.md § 6 のリトライ指示を送る
9. OK なら public/{chibiwafu|furana}/NN_poseName.png に保存
   - Codex built-in 画像生成の一時出力は `.codex/generated_images/...` に残る
   - **検品前/NG 画像は public 配下へコピーしない**
   - 採用確定した画像だけを `public/{chibiwafu|furana}/NN_poseName.png` へコピーする
```

### 画像生成の実行環境

この仕様書の標準運用は **ChatGPT のサブスク版画像生成 UI** で生成すること。
Codex / CLI / OpenAI Image API / `OPENAI_API_KEY` を使う生成は標準運用ではない。

Codex で作業している場合でも、Codex は以下だけを行う：

- docs を読む
- ChatGPT サブスク版 UI に貼るプロンプトを作る
- ユーザーが保存した生成画像を検品する

Codex が `image_gen.py`、OpenAI Image API、`OPENAI_API_KEY`、その他 API 課金が発生する
画像生成手段を使う場合は、事前にユーザーから明示承認を取ること。

---

## 禁則事項

- **既存 01-09 のデザインは変更しない**（おむつ/尻尾根元リボン/垂れ耳長さ/目色は固定）
- **既存 05/08 を純睡眠として扱わない**：
  - `05_sulking.png` は legacy の `sleep` 割当だが、見た目は転んだ瞬間・へたり込み・すね倒れ
  - `08_sleepy.png` は `exhausted` 用で、見た目は殴られ後・昏睡しかけ・意識もうろう
  - 穏やかな睡眠表現は追加ポーズ `28_sleep_curl` / `29_sleep_flat` / `30_nap_sitting` を使う
- **背景は必ず透過 PNG**（白背景 + ground shadow は NG）
- **1 ファイル 1 ポーズ**（grid 納品は禁止、ラベル焼き込みも禁止）
- **標準運用では API 生成しない**（OpenAI Image API / CLI / `OPENAI_API_KEY` 使用は明示承認制）
- **参照の役割を混同しない**：
  - 生成用 visual reference として添付する画像は、ちびわふは `00_origin.png`、フラナは `01_normal.png`
  - 既存ポーズの `01_normal.png` などは、ゲーム内スプライトとの並び確認・履歴・仕様理解には使ってよい
  - ただし、ちびわふ新規生成時に `01_normal.png` を追加の visual reference として添付しない
- **NG 画像を次回リファレンスにしない**。生成ツールが過去画像に引っ張られる場合は、
  新しい会話/新しい生成セッションで生成用 visual reference だけを添付してやり直す
  （ちびわふは `00_origin.png`、フラナは `01_normal.png`）

---

## 更新履歴

- v0.1 初版骨組み（仕様書分割構成）
- v0.2 キャラ仕様 v0.3 への波及修正：
  - 「スタイ」→「おむつ」、「尻尾色」→「尻尾根元リボン」に用語訂正
  - 他 doc の v0.3 / v0.2 改訂に合わせて一貫性確保
- v0.3 発注運用フローをキャラ別に書き直し（50_prompt_templates.md § 7 へ委譲）：
  - リファレンス画像がちびわふ/フラナで分岐することを明記
  - 「Chibiwafu → Furana」の文字列置換手順を明記
- v0.4 画像生成の失敗例を受けた再発防止を追加：
  - 過去の NG 生成画像を同じコンテキストや添付リファレンスに残さないルールを追加
  - 当時のちびわふ基準だった `01_normal.png` の見た目を正本とし、NG 画像に引っ張られた場合は新規セッションでやり直す運用を明記
- v0.5 ちびわふの正規リファレンスを `public/chibiwafu/00_origin.png` に変更：
  - `01_normal.png` のピクセル配置固定ではなく、`00_origin.png` のキャラデザイン同一性を維持する方針に修正
  - ポーズ発注では、顔・耳・アホ毛・前髪・短い手足・おむつ・尻尾根元リボンのデザインを守りつつ、ポーズ差分は明確に描く
- v0.6 参照画像の役割を明確化：
  - `01_normal.png` を全面禁止せず、既存スプライト比較・履歴・仕様理解には使ってよいと明記
  - ちびわふ新規生成の visual reference 入力は `00_origin.png` に限定する、と用途を分離
- v0.7 生成環境を ChatGPT サブスク版 UI 標準に修正：
  - Codex / CLI / OpenAI Image API / `OPENAI_API_KEY` を標準運用から外す
  - API 課金が発生する生成はユーザーの明示承認制とする
  - Codex はプロンプト作成と検品を担当し、画像生成自体はサブスク版 UI で行う
- v0.8 ポーズ計画を 30 ポーズへ拡張：
  - 23-27 に食事・作業・つままれ・投げられ・天候苦痛のゲーム内状態を追加
  - 28-30 に純睡眠ポーズを追加し、既存 05/08 と役割を分離
  - `13_hold_stick` は長い棒ではなく小枝サイズの小物として再定義
- v0.9 ポーズ計画を 40 ポーズへ拡張：
  - 31-40 に起床・お願い・喜び・病気・煙咳・掘り・拾い・拒否・探索・寂しさを追加
  - 背景や大型小物ではなく、キャラ単体の状態差分として読ませる方針を維持
- v1.0 画像保存運用と手足肉球仕様を訂正：
  - built-in 生成の一時出力は `.codex/generated_images/...` に残し、採用確定まで public へコピーしない
  - ちびわふの手足先端には小さなピンク肉球パッドがあると明記
- v1.1 ドキュメントの読み分けセクションを追加：
  - 実装正本（CLAUDE.md / SIGMA-8-IMPLEMENTATION-STATUS / SPEC / PLAN）
  - 素材正本（キャラ系 + UI-ASSET-SPEC + mockup）
  - 古い/参考扱いは現状なし
  - ファイル構成表に SIGMA-8-IMPLEMENTATION-STATUS.md を追加
- v1.2 M2.1 方針整理ドキュメントを追加：
  - `M2-DIRECTION-RESET.md`（旧 points 建設、旧 NPC、音頭の整理方針）
  - `DIALOGUE-CATALOG.md`（セリフ棚卸し）
  - `SCRIPT-CATALOG.md`（コマンド一覧）
