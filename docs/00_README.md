# ちびわふアセット仕様書

このディレクトリは **ちびわふ/フラナのゲーム用画像アセット** を
ChatGPT やその他 AI / 絵師 に発注する際の一貫性を担保するための仕様書群。

毎回プロンプトを書き直すとブレる → **この仕様書を先に貼る** 運用に統一する。

---

## ファイル構成

| ファイル | 内容 | 想定利用者 |
|---|---|---|
| `00_README.md` | このファイル。全体マップ | 全員 |
| `10_character_design.md` | キャラ固定デザイン（種族特徴・色・プロポーション） | 発注時に必ず貼る |
| `20_technical_spec.md` | PNG 形式・解像度・命名規則・納品要件 | 発注時に必ず貼る |
| `30_pose_catalog.md` | 22 ポーズのプロンプト辞書（既存9 + 追加13） | ポーズ発注時 |
| `40_accessory_library.md` | 小物 20 種の仕様 | 個体差 overlay 発注時 |
| `50_prompt_templates.md` | 発注マスタープロンプト（コピペ用） | 発注時 |
| `90_qa_checklist.md` | 納品チェックリスト | 納品検品時 |

---

## 発注運用フロー

詳細手順は `50_prompt_templates.md § 7`（キャラ別）を参照。概要：

```
1. 欲しいアセットを決める（例: 10_walk_lean）
2. 対象キャラを決める（ちびわふ or フラナ）
3. 50_prompt_templates.md § 1（ちびわふ）または § 2（フラナ）のプロンプトをコピー
4. [POSE_DESCRIPTION] を 30_pose_catalog.md から差し替え
   ※ フラナ発注時は description 中の "Chibiwafu" → "Furana" に全置換
5. 対応するリファレンス画像を添付：
   - ちびわふ: public/chibiwafu/01_normal.png
   - フラナ:  public/furana/01_normal.png
6. ChatGPT（または Codex Desktop）に投入
7. 納品物を 90_qa_checklist.md § B-1+B-2（ちびわふ）/ B-2+B-3（フラナ）で検品
8. NG 項目あれば 50_prompt_templates.md § 6 のリトライ指示を送る
9. OK なら public/{chibiwafu|furana}/NN_poseName.png に保存
```

---

## 禁則事項

- **既存 01-09 のデザインは変更しない**（おむつ/尻尾根元リボン/垂れ耳長さ/目色は固定）
- **背景は必ず透過 PNG**（白背景 + ground shadow は NG）
- **1 ファイル 1 ポーズ**（grid 納品は禁止、ラベル焼き込みも禁止）

---

## 更新履歴

- v0.1 初版骨組み（仕様書分割構成）
- v0.2 キャラ仕様 v0.3 への波及修正：
  - 「スタイ」→「おむつ」、「尻尾色」→「尻尾根元リボン」に用語訂正
  - 他 doc の v0.3 / v0.2 改訂に合わせて一貫性確保
- v0.3 発注運用フローをキャラ別に書き直し（50_prompt_templates.md § 7 へ委譲）：
  - リファレンス画像がちびわふ/フラナで分岐することを明記
  - 「Chibiwafu → Furana」の文字列置換手順を明記
