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
- Species: a "chibiwafu" — a small cream-colored puppy-like chibi creature
  in the style of Sanrio characters (Pochacco, Cinnamoroll). A cute chubby
  standing chibi, NOT a Kirby-style blob, NOT a Disney-style puppy.
- Body color: warm cream (#F5E6D3)
- Long droopy ears on both sides, hanging down to jaw level. Inner side
  light pink (#F5D5D0). Ears are as tall as the face — this is critical.
- A single short "ahoge" strand sticking up from the top of the head
- Short fringe/bangs over the forehead
- Large round dark brown eyes (#4A2A1A) with two small white highlights
- Soft pink cheek blushes (#F5B5B0)
- A tiny, barely-visible nose: just a small dot or simple inverted V (#3A2A1A)
- Wears a white DIAPER covering the lower body / belly, with a brown paw-print
  motif (#8B5A2B) on the center of the diaper. This is NOT a bib, NOT around
  the neck — it is a diaper on the lower torso.
- A fluffy tail in the same cream body color (no tip color change), with
  a small peach-pink ribbon (#F2A576) tied at the BASE of the tail. The
  ribbon is at the base (near the body), NOT at the tip.
- Head is approximately the same size as the body or slightly larger
  (head:body ≈ 1.05:1). Proportions: head ~45-50% of total height,
  body ~30-35%, legs ~15-20%.
- Has TWO clearly visible but short legs and TWO short arms, NOT nub-stubs.
  Arms hang at sides and can swing. Legs stand and can walk.
- NO neck (head sits directly on body, no neck outline)
- NO visible joints (no elbows, no knees, no shoulder lines, no ankle lines)
- NO fingers, NO claws, NO paw-pad lines on the hands/feet. Limb ends are
  simple rounded shapes.
- NO human clothing, NO shoes, NO articulated doll anatomy.

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

上記プロンプトの `CHARACTER` セクションを以下で完全に置換：

```
CHARACTER (fixed design, must NOT deviate):
- Species: a "furana" — the adult/mother form of the chibiwafu species.
  She is related but a DIFFERENT body type, NOT just a scaled-up chibiwafu.
- Body color: cream-white, between cream and white (#F5EFE2) — noticeably
  paler than the chibiwafu's warmer cream.
- Long droopy ears on both sides, same shape as chibiwafu, inner side
  light pink (#F5D5D0).
- A single short "ahoge" strand sticking up from the top of the head.
- Short fringe/bangs over the forehead.
- Large round RED eyes (#C0363A) with two small white highlights. Eyes
  are fully open, NOT half-lidded, NOT tired. She looks calm and composed.
- Soft but subdued pink cheek blushes (#F5B5B0), more restrained than chibiwafu.
- A tiny, barely-visible nose: just a small dot or simple inverted V.
- Wears a RED COLLAR around the neck (#B82B2B), with a GOLDEN BELL
  (#E8C84A) hanging from the front center of the collar. This is the
  signature feature — always draw the collar and bell clearly.
- Wears a white DIAPER on the lower body with a PINK paw-print motif
  (#F5B5B0) on the center. NOTE: the paw-print is PINK for furana
  (different from chibiwafu whose paw-print is brown).
- A fluffy tail in the same body color with a small peach-pink ribbon
  (#F2A576) tied at the BASE of the tail (same as chibiwafu).
- Proportions: unlike the chibiwafu (whose head is slightly larger than
  its body), the furana has a more elongated body, so the head is roughly
  EQUAL to or SLIGHTLY SMALLER than the body (head:body ≈ 1.0:1.0 to
  0.9:1.0). Overall about 2-head-bodies tall. She is noticeably taller
  and more elongated than a chibiwafu, but still SD chibi proportions
  overall (short arms, short legs, rounded body).
  (Note: the "1.8x" scale relative to a chibiwafu only applies when both
  are composited together in scene — for a single-asset order, still
  fill about 70% of canvas height per the FRAMING instruction below.)
- Has two clearly visible legs and two arms, same style as chibiwafu
  (no joints, no fingers, no claws).
- NO neck outline (head still sits directly on body; the collar goes
  around the top of the body).
- Expression: calm, composed, stoic. A gentle supervising mother figure.
  NOT tired, NOT half-lidded, NOT weary. She is sharp-eyed and steady.
- NO apron, NO human clothing, NO shoes, NO other accessories beyond
  the collar and bell and diaper and tail ribbon.
```

⚠ 以前の v0.1 で「エプロン着用・茶色の目・疲れた半目・優しげ」と書いていたのは
**全て誤り**だった。v0.2 では「赤い首輪・金の鈴・赤目・凛」に修正済。

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
3. Body color matches the species (cream for chibiwafu / cream-white for furana)
4. Long droopy ears on both sides, as tall as the face, with pink inner
5. Ahoge (single hair strand) on top of head
6. Short fringe/bangs over the forehead
7. White DIAPER on lower body with paw-print in center
   (brown paw-print for chibiwafu, pink paw-print for furana)
8. Fluffy tail in body color with a peach-pink ribbon at the BASE of the tail
   (NOT an orange tip at the end)
9. Eyes match species (brown for chibiwafu / red for furana)
   with white highlights
10. Pink cheek blushes
11. For furana only: red collar with golden bell at the front center
12. NO neck outline, NO visible joints (elbows/knees/ankles),
    NO fingers or claws
13. Head-to-body ratio appropriate (chibiwafu ≈ 1.05:1, furana ≈ 1:1 with
    taller body)
14. No text, labels, borders, or watermarks
15. Character centered, facing 3/4 front
16. Pose matches: [expected pose description]
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

### 6.5 固定要素が欠けたとき（ちびわふ）

```
The following character design elements are missing or incorrect:
- [欠けている要素]

Redraw while keeping ALL of the following fixed design elements visible:
- Long droopy ears as tall as the face, with pink inner lining
- Ahoge (single short hair strand) on top of the head
- Short fringe/bangs over the forehead
- Large round BROWN eyes with white highlights
- Pink cheek blushes
- Tiny barely-visible nose (dot or simple shape)
- A white DIAPER on the LOWER body (not a bib at the neck) with a brown
  paw-print motif in the center
- A fluffy tail in body color with a peach-pink ribbon tied at the BASE
  (not an orange tip at the end)
- No neck outline, no visible elbows or knees, no fingers or claws
```

### 6.6 固定要素が欠けたとき（フラナ）

```
The following character design elements are missing or incorrect:
- [欠けている要素]

Redraw while keeping ALL of the following furana-specific elements:
- Body color is cream-WHITE, noticeably paler than a chibiwafu
- RED eyes (not brown) with white highlights, fully open, calm
- A RED COLLAR around the neck with a GOLDEN BELL at the front center
- A white DIAPER on the lower body with a PINK paw-print (not brown)
- Fluffy tail in body color with a peach-pink ribbon at the BASE
- Long droopy ears with pink inner (same as chibiwafu)
- Taller elongated body proportion (about 2-head-bodies total)
- Calm stoic expression — NOT tired, NOT half-lidded, NOT sleepy
- NO apron (the spec previously mistakenly required an apron — ignore that)
- No neck outline, no visible joints, no fingers or claws
```

### 6.7 用語の混同が発生したとき

もし生成画像に「首元のスタイ」や「尻尾の先端オレンジ色」が出てきたら：

```
CRITICAL CORRECTION:
- The character does NOT wear a bib (yodare-kake) at the neck. They
  wear a DIAPER on the lower body / belly area.
- The tail does NOT have an orange tip. The tail is the same cream color
  as the body (for chibiwafu) or body color (for furana). A peach-pink
  RIBBON is tied at the BASE of the tail (near the body), not the tip.

Redraw with the diaper on the lower body and the ribbon at the tail base.
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
- v0.2 実画像再検証に伴う全面修正（10_character_design.md v0.3 と同期）：
  - ちびわふ § 1 CHARACTER: 「bib」→ 「diaper on lower body」に訂正、
    「orange/peach tail tip」→ 「cream body-color tail with peach-pink
    ribbon at base」に訂正、造形（首なし・関節なし・指なし）を明示
  - フラナ § 2 CHARACTER: 「エプロン」を削除し「赤い首輪＋金の鈴」に、
    「茶色の疲れ半目」→ 「赤い目・凛」に、「1.8x 拡大」→ 「別体型・
    約 2 頭身」に全面修正
  - § 5 self-check list を diaper / tail ribbon / 赤目（フラナ）/
    凛表情 / 関節なし などに更新
  - § 6.5 固定要素リトライ指示を diaper / tail ribbon 前提に更新、
    § 6.6 フラナ版リトライ指示を新設、§ 6.7 用語混同リトライ指示を新設
