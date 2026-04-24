# くそざこ村 — 監督ハンドオフ資料

新しい監督会話を起こす / 新フェーズ実装会話を起こす / Mac 環境で作業再開する、
のいずれかを行うときに参照する。この文書は **コピペ用テンプレート集**。

必読：
1. このファイル
2. `CLAUDE.md`（プロジェクト全体の単一情報源）
3. `docs/00_README.md`（アセット発注の運用フロー）

> **更新履歴**：Σ-4 は 2026-04-23 に完了し本流 `idle-village` へ統合済み。
> Pixi は完全削除。Three.js 単独レンダラー体制。次フェーズ候補は §6 参照。

---

## 1. 新監督会話の引き継ぎプロンプト

新会話の冒頭にコピペする：

```
くそざこ村の開発監督（director）役を引き継ぐ。前の監督会話からの文脈：

## 今どこ
- 本流 `origin/claude/idle-village-game-7IfPd` に Σ-0〜Σ-4 + Ω-6/7 + docs/ +
  HANDOFF.md 全部入り。Pixi は完全削除、Three.js 単独レンダラー（stage3d.ts）
- git 整理済み、origin は `idle-village` と `character-image-brainstorm-rxHdJ`
  （アセット仕様書の並行作業）の 2 本
- 次フェーズ候補：HANDOFF.md §6 参照（Ω 継続 or Σ-5 以降）

## 監督会話の役割
- 実装会話のレビュー → 本流 merge 判断
- プロンプト作成（次フェーズの指示書を書く）
- CLAUDE.md / HANDOFF.md 更新
- アイデアの採用/棄却決定
- 直接コーディングはしない（30 行以下のマイナーバグ修正のみ可）

## 最重要ドキュメント（順に読んで）
1. `HANDOFF.md` ルート — このファイル（コピペ資料）
2. `CLAUDE.md` ルート — プロジェクト全体像、核指針、ロードマップ
3. `docs/` 配下 7 本 — キャラ画像発注仕様書
4. `.claude/agents/balance-tester.md` — バランスチェック用 Haiku エージェント

## 直近タスク
- 次フェーズが未決まりなら HANDOFF.md §6「次フェーズ候補」から一つ選ぶ
- 実装完了通知が来たら: tsc 型チェック → balance-tester で死因分布確認
  → idle-village に merge → HANDOFF.md / CLAUDE.md 更新

まず `HANDOFF.md` と `CLAUDE.md` を読んで現状を把握し、「準備完了、次の指示を待つ」と
返してほしい。
```

---

## 2. 新フェーズ実装会話の雛形プロンプト

新フェーズを Sonnet に投げる時の骨格。`<PHASE>` `<サブ項目>` などのプレースホルダを
フェーズ固有の内容で置換して使う。

```
くそざこ村 <PHASE>（<タイトル>）を実装して。

## 作業ブランチ

`claude/<phase-slug>-main`（新規。ベースは `origin/claude/idle-village-game-7IfPd`）

    git fetch origin
    git checkout -b claude/<phase-slug>-main origin/claude/idle-village-game-7IfPd

## ゴール

<1-2 段落でフェーズの意図と完成状態を書く>

## 絶対守る設計鉄則（CLAUDE.md 核指針）

1. sim は `{x, y}` のまま、z は render 側が `elevAt(x, y)` で派生
   （render 新機能だけなら `src/sim/` は無変更）
2. 既存 9 ポーズ PNG を Y 軸ビルボード + 左右反転で流用、アート再発注ゼロ
3. Perspective fov 20°、45° 俯瞰固定、カメラ回転封印
4. HUD は DOM のまま、吹き出しは camera.project で world→screen 変換
5. flat shading / ブロック段差は実装しない（なめらかな Toon 路線）
6. OrbitControls 等のカメラ回転系 Three.js ヘルパーは禁止

## サブコミット（例）

### <PHASE>-a：<サブ項目>
- <具体的な TODO>

### <PHASE>-b：...

## 必ず守ること

- sim（`src/sim/*`）を変更する場合は理由を明記
- カメラ回転しない（Y 軸ビルボード前提が崩れる）
- アート再発注ゼロ
- 既存のくそざこ味（セリフ・吹き出しテンション）維持
- flat shading / voxel 路線は禁止、なめらかな Toon 一本
- elevAt() / screenToWorld() は既存実装を使う（メッシュと同期済み）

## コミット規約

- サブコミット単位で push（30〜60 分目安で分割）
- 本文末尾に `https://claude.ai/code/session_XXXX` を付ける
- force push / rebase はしない

## 完了条件

全コミット push のみで完了報告、merge はしない（レビューは監督会話で私がやる）。

完了報告フォーマット：
- ブランチ名、最終コミット hash（各サブコミット分）
- `npx tsc --noEmit` / `npx tsx scripts/sim.ts` / `npm run build` の結果
- 自己確認した parity / 動作確認結果
- 気になる既知バグ・未解決事項
```

### 過去フェーズの具体プロンプトを見たい時

git 履歴の `HANDOFF.md` 旧版を参照（Σ-4 本実装プロンプトは 2026-04-23 以前の版に残存）：

```bash
git log --all --oneline HANDOFF.md
git show <commit>:HANDOFF.md | less
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
```

### 並行作業用：worktree で別フォルダにチェックアウト

イラスト系の作業を `character-image-brainstorm-rxHdJ` でやりながら、
idle-village 側もいじりたい時：

```bash
cd ~/kszkbk
git worktree add ../kszkbk-main claude/idle-village-game-7IfPd
cd ../kszkbk-main
npm install            # worktree ごとに node_modules が必要
npm run dev

# 片付け
cd ~/kszkbk
git worktree remove ../kszkbk-main
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

### 実装ブランチを切る（新フェーズ開始時）

```bash
git fetch origin
git checkout -b claude/<phase-slug>-main origin/claude/idle-village-game-7IfPd
```

### リモートブランチ削除（merge 後）

```bash
git push origin --delete <branch-name>
```

---

## 4. 監督と実装の役割分担ルール

公式 best practice ベースの運用：

| 会話タイプ | 役割 | モデル |
|---|---|---|
| **監督室**（継承会話） | レビュー・merge・CLAUDE.md 更新・プロンプト作成・意思決定 | Opus 推奨 |
| **実装会話**（各フェーズ） | 指定ブランチでコード書いて push | Sonnet 推奨 |
| **アイデア会話**（別枠） | ブレスト、決定事項だけ監督会話に summary 投げる | 任意 |

**決まりごと**：
- 実装会話は push のみで終了、merge は監督が判断
- 30 行以下の bug 修正は監督会話で直接パッチして OK
- 30 行超の修正は実装会話に差し戻し
- CLAUDE.md / HANDOFF.md 更新は監督会話の責務

---

## 5. 緊急時の撤退プロトコル

### 新フェーズ実装が炎上した時

1. 実装ブランチを merge せず放置
2. 本流 `idle-village` は安定動作を保持（Σ-4 完了時点で実プレイ可能）
3. 設計見直し、CLAUDE.md のフェーズステータスを「中止・再設計」に変更

### 3D レンダラーが壊れた時

- 過去の commit を `git log src/render/stage3d.ts` で辿って問題のない地点に revert
- elevAt / screenToWorld は地形メッシュと同期済みで、この式を変えると
  キャラが埋もれる / ドラッグが奥に飛ぶ。安易に触らない
- 最悪 Σ-4 merge 時点（`c252374`）まで戻れば 3D の初期状態

### save v12 が壊れた時

- `src/meta/save.ts` の `deserializeTerrain` に breakpoint
- v12 ロード失敗時は `ensurePlots` が procedural 再生成する fallback を持つ
- 最悪 localStorage をクリアしてラン作り直し（3 スロットあるので 1 個犠牲にできる）

---

## 6. 次フェーズ候補

### ✅ 完了：Σ-5 / Σ-5-e 開発ゲーム体感化（2026-04-23 merge）

Σ-4 完了後に判明した「terraform 置いても地形変わらない / feature が円盤 / 狼から
逃げない」体感問題（Σ-5）と「建てた物件が何なのか分からない / 即完成で工事感ない /
水源を新規に建てられない」体感問題（Σ-5-e）を一括解消。
労働 AI + feature 3D 化 + 狼 flee + 建設工事段階化 + 右クリック識別モーダル +
💧 水源建設 + UV scroll 水流アニメ + 波紋リングまで完成。
詳細は CLAUDE.md「完了フェーズ → Σ-5 / Σ-5-e」参照。

### 🚧 次の選択肢（優先度順）

| 候補 | 内容 | 規模 | 推奨理由 |
|---|---|---|---|
| **Σ-5-e-e 数値建設化** | 秒ベース建設を数値 pt ベース + 事故ペナルティ（喧嘩 -5、死亡 -15、離脱 -2）+ 複数人ボーナス（4人で 3x） | 2-3 日 | 現状は秒単位で確実に建つ → 「くそざこ作業チーム」感を出すため |
| **Σ-6 歩行アニメ** | 既存 9 ポーズから walk_a/b/c atlas、0.3 秒切替 | 1 週 | Σ-5 で労働が目に見えるようになった今、歩行アニメ追加でインパクト最大化 |
| **Σ-6 水動力システム**（旧計画） | tile waterLevel に rain 蓄積 + 高低差で流下 + 盆地に水溜まり + 溺死 | 1.5-2 週 | 地形 + 天候 + 死因が連動する大技、潮汐/火災とも相性 |
| **Ω-12 神罰** | 隕石 / 雷撃でストレス発散。3D の煙・爆発 FX 流用 | 1 週 | プレイヤー側の楽しみが増える、3D 映え |
| **Ω-12 潮汐** | Σ-3 島地形向け、海面周期 ±、取り残され溺死 | 1 週 | 島難度の体験を厚くする（Σ-6 水動力後なら実装コスト下がる） |
| **② 病気＆集団感染** | 咳→伝染→パンデミック、温泉 / 薬草で治療 | 2 週 | 因果連鎖デザインの強化 |
| **⑥ カルト宗教化** | 神社拡張、教祖くそざこ、儀式死、フラナ機嫌暴落 | 2 週 | 既存神社 feature を活かす |
| **Ω-4 火災拡張** | 消防署、火の広がり、煙パーティクル | 1 週 | Σ-4 の煙 FX を流用できる |

### 優先度：通常

- **Ω-5 拡張**：クマ / 地震 / 野盗、狼の頻度調整も含む（Σ-5 で fled_to_exhaustion は出るが狼自体が rare、もっと狼が出る難度設定がほしい）
- **Ω-8 指示系統**：ゾーン矩形 / 投げ縄 / 直接命令（Σ-5 の労働 AI が土台になった）
- **Ω-9 P2〜**：社会・士気（学校、酒場、風呂）
- **Ω-10 監督委任**：フラナ / スズに job 委託
- **Ω-11 メタ進行**：ラン終了、累計アンロック、図鑑拡張
- **hell 難度の早期全滅対策**：disaster ×1.8 が過酷すぎ、ondo / cocoon_abuse / fire 集中で 20 分で 40→6（Σ-5 で観測、pre-existing）。バランス調整単発フェーズが必要かも

### 棄却済み（議論再開不要）

- 世代交代＆性格遺伝（長ラン複雑化）
- 恋愛・三角関係（スコープ過大）
- 遺言＆英雄伝承（実装コスト vs 体験価値）
- 祟り／悪霊（プレイヤー罰則がチーム性と合わない）

---

## 更新履歴

- 2026-04-23：Σ-5-e 完了・本流 merge・water soil コスト追加。§6 に Σ-5-e-e（数値建設化）と Σ-6 水動力を候補追加
- 2026-04-23：Σ-5 完了・本流 merge・dead code 削除。§6 を完了版に更新、次フェーズ候補（Σ-6 歩行 / Ω-12 神罰 / Ω-12 潮汐 ほか）を整理
- 2026-04-23：Σ-5 着手準備。実プレイで判明した 3 大体感問題（terraform 稼働なし / feature 円盤のまま / 狼 flee 未実装）を §6 に記録、最優先フェーズとして昇格
- 2026-04-23：Σ-4 本実装完了・本流 merge・Pixi 完全削除。HANDOFF.md を Σ-4 後版に更新、次フェーズ候補 §6 を追加
- 2026-04-23（旧）：Σ-4-proto 完了時点で整備（Σ-4 本実装プロンプト + 監督引き継ぎ + Mac 手順）
