# 発注プロンプトテンプレート

実際に ChatGPT（or DALL-E / Midjourney / 他）に貼るための完成プロンプト集。
必要に応じて `[PLACEHOLDER]` 部分のみ差し替える。

---

## 1. ちびわふ単体ポーズ発注（メイン運用）

**添付必須**: `public/chibiwafu/01_normal.png`

```
Single character asset for a 2.5D colony simulation video game.
This is a sprite asset, NOT an illustration, NOT a storybook image.

REFERENCE: Use the attached image (01_normal.png) as the absolute
style and design reference. The character, color, line weight, eye
style, proportions, and ears must match the reference exactly.

CHARACTER (fixed design, must NOT deviate):
- Species: a "chibiwafu" — a small cream-colored puppy-like creature
- Body color: cream (#F5E6D3)
- Long droopy ears on both sides, inner side light pink (#F5D5D0)
- A single "ahoge" strand sticking up from the top of the head
- Short fringe/bangs over the forehead
- Large round dark brown eyes (#4A2A1A) with two small white highlights
- Soft pink cheek blushes (#F5B5B0)
- Wears a white bib/bandana with a small brown paw-print motif (#8B5A2B)
- Short tail with an orange/peach fluffy tip (#F2A576)
- Head-to-body ratio roughly 2:1, chubby and rounded proportions
- Small stubby limbs, NO finger detail, NO shoes, NO human clothing

POSE:
[POSE_DESCRIPTION]

STYLE: clean game-asset art, crisp vector-like outlines with consistent
line weight, cel/flat shading with one soft highlight pass, saturated
but gentle palette. Identical style to the reference image.
Absolutely NOT: watercolor, storybook, picture book, painterly,
sketchy, crayon, photorealistic, 3D rendered.

FRAMING: single character centered in canvas, facing 3/4 front (same
angle as the reference). Character fills about 70% of canvas height.
Feet baseline at 15% from the bottom of the canvas. Identical framing
across all poses so the character does not jump when swapped in game.

BACKGROUND: fully transparent (alpha channel, RGBA PNG). NO white
background. NO drop shadow on the ground. NO gradient. NO texture.
NO ambient effects.

OUTPUT FORMAT: 1024x1024 PNG, single pose, single character, no UI,
no text, no labels, no border, no watermark.
```

**使用例**: `[POSE_DESCRIPTION]` に `30_pose_catalog.md` の `10. walk_lean` の
「描画指示」本文をコピペ。

---

## 2. フラナ版プロンプト差分

**添付必須**: `public/furana/01_normal.png`

上記プロンプトの `CHARACTER` セクションを以下で置換：

```
CHARACTER (fixed design, must NOT deviate):
- Species: a "furana" — an adult/mother version of the chibiwafu species.
- All base features identical to chibiwafu: cream body (#F5E6D3),
  long droopy ears with pink inner, ahoge, bangs, large brown eyes,
  pink cheeks, white bib with paw-print, orange-tipped tail.
- Size: 1.8x larger than a chibiwafu (taller overall)
- Proportion: slightly more elongated, head-to-body ratio ~2.2:1
- Eyes: same shape but slightly half-lidded, giving a tired/gentle look
- Expression: soft, motherly, slightly weary
- Wears a small white apron over the bib, tied with a light pink string
- NO other added human clothing, NO shoes, NO accessories
```

---

## 3. アクセサリ単体発注

**添付推奨**: なし（本体とは独立発注）または本体リファレンス 1 枚

```
Single small item sprite for a 2D game. Item only, no character.

ITEM: [ACCESSORY_DESCRIPTION from 40_accessory_library.md]

STYLE: clean vector outline, cel-shade flat coloring, matching the
art style of a cute chibi colony-sim game. Outlines same weight as
a standard chibi character sprite (medium-thin). Colors saturated
but gentle, not neon. Absolutely NOT watercolor, NOT sketchy,
NOT photorealistic.

FRAMING: item centered on canvas, occupying about 60% of canvas area,
with clear 20% margin around all edges.

BACKGROUND: fully transparent (alpha channel, RGBA PNG). NO shadow
under the item, NO gradient, NO texture, NO background color.

OUTPUT: 256x256 PNG, single item, no text, no label, no watermark.
```

---

## 4. バッチ発注（複数ポーズを 1 プロンプトで）

ChatGPT の顔ブレ対策。**同一プロンプト内で複数ポーズを要求**して同じキャラで揃える。

```
[セクション 1 のプロンプト本文]

OUTPUT: 4 poses of the SAME chibiwafu character, rendered as a 2x2 grid
on a single 2048x2048 canvas. Each cell is 1024x1024 with fully
transparent background (NOT white, NOT labeled). All 4 poses must
feature the exact same character — identical colors, line weight,
eye style, and proportions. Only the pose changes.

Pose 1 (top-left):     [POSE_DESCRIPTION_A]
Pose 2 (top-right):    [POSE_DESCRIPTION_B]
Pose 3 (bottom-left):  [POSE_DESCRIPTION_C]
Pose 4 (bottom-right): [POSE_DESCRIPTION_D]

DO NOT add any text labels, borders, or separators between cells.
Each pose must be centered within its own 1024x1024 region at the
same scale and same feet-baseline height.
```

**注意**: AI がラベルや枠を入れてくる場合は「without labels, without borders,
without grid lines」を強調する。

---

## 5. 検品依頼（AI による自己チェック）

納品後、同じ AI に以下を投げると unofficially に self-check してくれる：

```
Please evaluate the attached image against this checklist and list
any items that are NOT satisfied:

1. Transparent background (alpha channel, not white)
2. No drop shadow under the character on the ground
3. Cream body color (#F5E6D3 range)
4. Long droopy ears on both sides with pink inner
5. Ahoge (single hair strand) on top of head
6. White bib with brown paw-print motif
7. Orange/peach tail tip
8. Large dark brown eyes with white highlights
9. Pink cheek blushes
10. No text, labels, borders, or watermarks
11. Character centered, facing 3/4 front
12. Pose matches: [expected pose description]
```

---

## 6. リトライ用の追加指示

### 6.1 style が storybook に寄ったとき

```
The image looks like a watercolor picture book illustration. Redo it
as a clean flat game-asset sprite. NO watercolor textures, NO paper
grain, NO painterly brush strokes. Use solid flat colors with cel
shading and crisp vector outlines only.
```

### 6.2 白背景になったとき

```
The image has a white background. Re-export the PNG with a fully
transparent background (alpha channel). The area around the character
must be alpha=0, not white.
```

### 6.3 影が焼き込まれたとき

```
There is a drop shadow under the character's feet baked into the image.
Remove it entirely — the character should have no ground shadow in the
file. The engine will add shadows procedurally.
```

### 6.4 ポーズが弱いとき

```
The pose is too subtle. [再度 pose description を貼る]
Make the pose more clearly exaggerated: [具体的な強調ポイント].
```

### 6.5 固定要素が欠けたとき

```
The following character design elements are missing or incorrect:
- [欠けている要素]
Redraw while keeping ALL of the following fixed design elements
visible: long droopy ears, ahoge, white bib with paw-print,
orange-tipped tail, pink cheeks, large brown eyes.
```

---

## 7. 発注ワークフロー

```
1. 30_pose_catalog.md から発注したいポーズを選ぶ
2. このファイル § 1 のプロンプトをコピー
3. [POSE_DESCRIPTION] にポーズの描画指示を貼り付け
4. public/chibiwafu/01_normal.png を添付
5. ChatGPT に送信
6. 納品物を 90_qa_checklist.md でチェック
7. NG があれば § 6 のリトライ指示を送る
8. OK なら public/chibiwafu/NN_poseName.png で保存
```

---

## 8. 変更履歴

- v0.1 初版（ちびわふ・フラナ・アクセサリ・バッチ・リトライ揃え）
