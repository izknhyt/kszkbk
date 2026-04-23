# アクセサリライブラリ（個体差小物）

ちびわふ個体識別のための **overlay 小物**。
`src/sim/traits.ts` の 20 traits にほぼ 1:1 マッピングし、見た目で性格が分かるようにする。

---

## 1. 運用モデル

- アクセサリは **独立 PNG** として発注（ちびわふ本体とは別レイヤー）
- runtime に PixiJS の Container で body sprite の上に重ねる
- **ちびわふ専用の個体差 overlay**。1 個体につき 1 アクセサリを装備、trait の主要値で決定
- 装着位置は **頭上 / 顔前面 / 胴中央 / 尻尾横** の 4 アンカーに分類
- **フラナには適用しない**：フラナは固有装備（赤い首輪＋金色の鈴、ピンク肉球のおむつ）
  で既に個体識別ができており、200+ の個体差表現は必要ないため。フラナの見た目は
  常に `10_character_design.md § 2` の固定デザインで統一

---

## 2. アクセサリ 20 種カタログ

| # | 名前 | 装着位置 | 対応 trait | 発注指示 |
|---|---|---|---|---|
| 01 | 赤い鉢巻 | 顔前面（額） | yuukan（勇敢） | Red folded cloth headband tied around forehead, small knot at the side |
| 02 | 丸メガネ | 顔前面 | tetsugakusha（哲学者） | Round black-framed glasses, simple thin frame |
| 03 | 花冠 | 頭上 | oshaberi / social高 | Small woven crown of pink and white daisies, worn on head |
| 04 | 小さなエプロン | 胴中央 | mama好き | Miniature white apron with small heart pocket, tied at waist. 注：フラナ本体はエプロンを着ない（10_character_design.md § 2 参照）。このアクセサリはちびわふの mama好き trait 識別用 overlay |
| 05 | 木の杖 | 尻尾横 | bouken（冒険家） | Gnarled brown walking stick, taller than the chibi, held in one paw |
| 06 | ほっかむり | 頭上 | noumin（農民） | White cloth tied over head like a farmer's kerchief, knot under chin |
| 07 | 長い木の棒 | 尻尾横 | bo_meijin（棒名人） | Long straight bamboo-like stick, held horizontally at side |
| 08 | 木のフォーク | 顔前面 | gourmand（大食） | Small wooden fork held at chest level, tines up |
| 09 | 本 | 胴中央 | tetsugakusha | Small closed book with brown leather cover, held between paws |
| 10 | 四つ葉のクローバー | 頭上 | koun（幸運） | Tiny green four-leaf clover tucked behind an ear |
| 11 | よだれ | 顔前面 | gourmand / zako高 | Thin clear saliva drop hanging from the corner of the mouth |
| 12 | 泥の汚れ | 胴中央 | 泥川被災歴 | Brown mud splash mark on the belly/side, irregular splotch |
| 13 | 絆創膏 | 顔前面（頬） | tough 低 / 被虐歴 | Small beige adhesive bandage on one cheek, X-shape |
| 14 | ぬいぐるみ | 尻尾横 | ukiyo（浮世離れ） | Tiny blue teddy bear plush held in one paw, a bit worn |
| 15 | 音符 | 頭上 | スズファン / onkai | Small black musical note symbol floating above head |
| 16 | 赤リボン | 頭上（耳の付け根） | akachan感 | Red ribbon bow (color fixed at `#E05860`, NOT peach-pink) tied at the base of one ear. **注**: 尻尾根元の桃色リボン (`#F2A576`) と色・位置で区別すること。アクセサリ版は耳元で色は `#E05860` 固定 |
| 17 | 頬赤（酔い） | 顔前面 | nomisuke（酒好き） | Enhanced pink blush on cheeks, one whiskey drop near mouth |
| 18 | はてなマーク | 頭上 | tabikko（迷子癖） | Floating "?" symbol above head, light gray |
| 19 | 鼻血 | 顔前面 | oshaberi 激 / namaiki | Small red droplet hanging from one nostril |
| 20 | 猫耳（偽装） | 頭上 | kimagure（気まぐれ） | Two small pointy cat ears on top of head, fake wearable |

---

## 3. 発注仕様

### 3.1 キャンバス

- **256 × 256 px**（本体 1024 の 1/4 サイズで十分）
- 透過 PNG（背景 alpha = 0）
- 中央に配置、余白 10%

### 3.2 スタイル

本体と同じ絵柄。具体的には：

- clean vector-like outline（太さ本体と同じ）
- cel-shade ベタ塗り＋ハイライト 1 点
- `10_character_design.md` のパレットに準拠

### 3.3 発注プロンプト雛形

```
Single accessory sprite for a 2D game, item only, no character.
Style: clean vector outline, cel-shade flat coloring, matching the
art style of the attached chibiwafu reference image (01_normal.png).
TRANSPARENT BACKGROUND (alpha channel), NO shadow, NO ground, NO text.
Canvas 256x256, item centered, occupying about 60% of canvas.

Item: [ACCESSORY_DESCRIPTION from catalog table above]
```

### 3.4 合格基準

- 本体の線の太さと同じ
- 本体と同じ色彩度感
- 影・背景ゼロ
- 他のアクセサリと並べて統一感

---

## 4. ファイル命名

```
public/accessories/
 ├─ 01_hachimaki.png
 ├─ 02_glasses.png
 ├─ 03_flower_crown.png
 ├─ 04_apron.png
 ├─ 05_cane.png
 ├─ 06_hokkamuri.png
 ├─ 07_long_stick.png
 ├─ 08_fork.png
 ├─ 09_book.png
 ├─ 10_clover.png
 ├─ 11_drool.png
 ├─ 12_mud.png
 ├─ 13_bandaid.png
 ├─ 14_teddy.png
 ├─ 15_note.png
 ├─ 16_red_ribbon.png
 ├─ 17_drunk_cheeks.png
 ├─ 18_question.png
 ├─ 19_nosebleed.png
 └─ 20_cat_ears.png
```

---

## 5. 実装接続（実装時の参考）

### 5.1 アンカー座標

**ちびわふ本体専用**（フラナには overlay しない、§ 1 参照）。
ちびわふ本体 sprite の原点（中心）を (0, 0) として：

| 位置 | オフセット（本体 1.0x 時） |
|---|---|
| 頭上 | (0, -60) |
| 顔前面 | (0, -20) |
| 胴中央 | (0, 15) |
| 尻尾横 | (+25, 10) |

個体のサイズ（0.9-1.1x）に比例してスケール。

### 5.2 装備選択ロジック（疑似コード）

```ts
// 個体生成時に runId seed で決定
function pickAccessory(params: ChibiParams, traits: TraitId[]): number {
  // trait 優先マッピング
  for (const t of traits) {
    if (TRAIT_TO_ACCESSORY[t]) return TRAIT_TO_ACCESSORY[t];
  }
  // fallback: 10 軸 params から最高値の軸で選ぶ
  const top = topParam(params);
  return PARAM_TO_ACCESSORY[top];
}
```

---

## 6. 優先発注順

style lock 確認後、以下の 5 種を先発注（視認性が高く、trait 識別に効くもの）：

1. `01_hachimaki`（勇敢、赤色で目立つ）
2. `02_glasses`（哲学者、顔前面で識別性最強）
3. `03_flower_crown`（social、頭上で見やすい）
4. `04_apron`（mama、胴で見やすい）
5. `14_teddy`（浮世、キャラ性濃い）

---

## 7. 変更履歴

- v0.1 初版（20 traits にマッピングして 20 小物設定）
- v0.2 キャラデザ仕様 v0.3 との整合：
  - #16 ピンクリボン → 赤リボンにリネーム（尻尾根元の桃色リボンと色で区別）
  - ファイル名 `16_ribbon.png` → `16_red_ribbon.png`
  - #04 エプロンにフラナ本体との区別注記（フラナはエプロン着ない）
  - § 1 運用モデルに「フラナには適用しない」を明記
  - § 5.1 アンカー座標に「ちびわふ本体専用」を明記
