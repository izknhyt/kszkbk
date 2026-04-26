# 発注プロンプトテンプレート

実際に ChatGPT のサブスク版画像生成 UI に貼るための完成プロンプト集。
必要に応じて `[PLACEHOLDER]` 部分のみ差し替える。

標準運用では Codex / CLI / OpenAI Image API / `OPENAI_API_KEY` を使って生成しない。
Codex はプロンプト作成と検品を担当し、画像生成はユーザーが ChatGPT サブスク版 UI で行う。
API 課金が発生する生成手段を使う場合は、事前にユーザーの明示承認を取る。

---

## 1. ちびわふ単体ポーズ発注（メイン運用）

**ChatGPT サブスク版 UI で生成用 visual reference として添付する画像**:
`public/chibiwafu/00_origin.png`

`public/chibiwafu/01_normal.png` などの既存ポーズは、仕様理解や QA の並び確認には
使ってよい。ただし、このプロンプトを画像生成ツールへ投入する時の添付画像には含めない。
`01_normal.png` を同時添付すると、通常立ちのピクセル配置やポーズを固定すべきものとして
解釈されやすいため。

```
Single character asset for a 2.5D colony simulation video game.
This is a sprite asset, NOT an illustration, NOT a storybook image.

PURPOSE: This image is a runtime sprite that will be swapped in-game with
other Chibiwafu state sprites. It must read as the same character at the
same scale and center position. Keep the same feet baseline only when the
requested pose is a grounded standing/walking/sitting pose; if the pose
catalog defines an exception such as airborne, chest-down crop, splat, or
lying sleep, follow that exception. The requested pose must remain clearly
readable during gameplay. Preserve character design identity; do not
preserve the normal standing pose.

REFERENCE: Use the attached image (00_origin.png) as the visual reference
for character design identity. The reference defines the character's design
features; it does NOT define a fixed pixel layout, fixed outline, fixed
standing pose, background, or ground shadow. The new pose may redraw the
body and limbs as needed, but it must still look like the same chibiwafu
design: same face design, eye style, short-wide ears, ahoge, bangs, cream
color, short plush limb proportions, diaper paw print, tail, and compact
tail-base ribbon.
If any written instruction conflicts with the attached reference's design
features, follow the attached reference image. Do not reinterpret the
character as a generic Sanrio puppy, Cinnamoroll-like mascot, Disney puppy,
or human chibi.

CHARACTER (fixed design, must NOT deviate):
- Species: a "chibiwafu" — a small cream-colored puppy-like chibi creature
  with the same character design as the attached reference. A cute chubby
  chibi, NOT a Kirby-style blob, NOT a Disney-style puppy.
- Body color: light warm cream (#FEFBE7)
- Short-wide droopy ears on both sides, matching the attached reference:
  they extend sideways, have rounded fluffy tips, and do NOT hang as long
  vertical Cinnamoroll ears. Inner side is light pink (#F5D5D0) when
  naturally visible, but do not force the ear underside to show in every pose.
- A single short low "ahoge" curl on top, sweeping backward like the reference
- Short fringe/bangs over the forehead, with the same small tufts and spacing
  as the reference
- Large vertical-oval dark brown eyes (#502C1B) with orange-brown gradient,
  white side sclera, and white highlights, matching the reference eye shape
- Soft pink cheek blushes (#F5B5B0)
- A tiny, barely-visible nose: just a small dot or simple inverted V (#3A2A1A)
- Wears a white DIAPER (#FAFAFA) covering the lower body / belly, with a
  warm-brown paw-print motif (#A27250) on the center of the diaper.
  This is NOT a bib, NOT around the neck — it is a diaper on the lower torso.
- A fluffy tail in the same cream body color (no tip color change), with
  a compact peach-pink ribbon/knot (#F9C4A1) tied at the BASE of the tail.
  The ribbon is at the base (near the body), NOT at the tip. It is small
  and compact like the reference, NOT a large butterfly bow, heart shape,
  or flower-petal bow.
- The head is NOTICEABLY LARGER than the body (head:body ≈ 1.5:1).
  Preserve the attached reference's head width, face width, and
  head-to-body design balance. Do NOT make the head larger, puffier,
  wider, or more balloon-like than the reference design.
- Has TWO clearly visible but short legs and TWO short arms, NOT nub-stubs.
  Arms and legs are plush-toy short like the reference. Locomotion poses
  must use short plush limbs, not long anatomical limbs; limb offsets may
  be clear enough to make the requested pose readable in-game.
- NO neck (head sits directly on body, no neck outline)
- NO visible joints (no elbows, no knees, no shoulder lines, no ankle lines)
- NO fingers, NO claws. Hands and feet remain simple rounded plush shapes,
  with small soft PINK paw pads on the visible tips (#F5B5B0 range).
  Do not turn the paw pads into fingers, claws, toe segments, or realistic
  dog paws.
- NO human clothing, NO shoes, NO articulated doll anatomy.

POSE:
[POSE_DESCRIPTION]

Follow the pose catalog literally. Do not add props, external human/god
hands, weather, text, Zzz symbols, impact marks, or background effects
unless the pose description explicitly allows them. The chibiwafu's own
short rounded arms/hands should still be drawn when the pose calls for them.
If the pose catalog defines a framing exception (airborne, chest-down crop,
splat, or lying sleep), that exception overrides the generic feet-baseline
instruction below.

STYLE: clean game-asset art, warm brown outlines, soft flat/cel shading,
gentle pastel palette, and the same face/ear/head design language as the
reference. Do not pixel-lock the normal standing pose; the requested pose
must still be clearly visible.
Absolutely NOT: watercolor, storybook, picture book, painterly,
sketchy, crayon, photorealistic, 3D rendered.

FRAMING: single character centered in canvas, facing 3/4 front. Character fills about 70% of canvas height.
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
- Body color: cream-white, between cream and white (#FEFAEF) — noticeably
  paler than the chibiwafu's warmer cream.
- Long droopy ears on both sides, same shape as chibiwafu, inner side
  light pink (#F5D5D0).
- A single short "ahoge" strand sticking up from the top of the head.
- Short fringe/bangs over the forehead.
- Large round vivid RED eyes (#D33023) with two small white highlights.
  Eyes are fully open, NOT half-lidded, NOT tired. She looks calm and composed.
- Soft but subdued pink cheek blushes (#F5B5B0), more restrained than chibiwafu.
- A tiny, barely-visible nose: just a small dot or simple inverted V.
- Wears a RED COLLAR around the neck (#D12E21), with an ANTIQUE-GOLD BELL
  (#EFC573) hanging from the front center of the collar. The bell is a
  warm muted gold, NOT a bright neon yellow. This is the signature
  feature — always draw the collar and bell clearly.
- Wears a white DIAPER (#FAFAFA) on the lower body with a vivid PINK
  paw-print motif (#FC97A6) on the center. NOTE: the paw-print is PINK
  for furana (different from chibiwafu whose paw-print is brown).
- A fluffy tail in the same body color with a small peach-pink ribbon
  (#F9C4A1) tied at the BASE of the tail (same as chibiwafu).
- Proportions: the head is still slightly larger than the body, but less
  dominant than in a chibiwafu (head:body ≈ 1.2:1 vs chibiwafu's 1.5:1).
  Head ~55% of total height, body ~35%, legs ~10%. The body is more
  elongated than a chibiwafu but the head is still the largest portion.
  For this single-asset output, fill 70% of canvas per the FRAMING
  instruction below (the "1.8x vs chibiwafu" scale only applies when
  both are composited together in scene, NOT here).
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
feature the same character design identity — consistent colors, line
weight, eye style, proportions, ears, bangs, ahoge, diaper, and tail-base
ribbon. Each pose must still read clearly as a different pose.

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
4. Short-wide droopy ears matching 00_origin.png's design, with pink inner
5. Low backward ahoge curl matching 00_origin.png's design
6. Short small forehead bangs matching 00_origin.png's design
7. Small pink paw pads on visible hands/feet, without fingers or claws
8. White DIAPER on lower body with paw-print in center
   (brown paw-print for chibiwafu, pink paw-print for furana)
9. Fluffy tail in body color with a compact peach-pink ribbon/knot at the
   BASE of the tail (NOT an orange tip, NOT a large bow)
10. Eyes match species (brown for chibiwafu / red for furana)
   with white highlights
11. Pink cheek blushes
12. For furana only: red collar with golden bell at the front center
13. NO neck outline, NO visible joints (elbows/knees/ankles),
    NO fingers or claws
14. Head-to-body ratio and face width preserve 00_origin.png's design
    identity; not balloon-headed and not a generic mascot face
15. No text, labels, borders, or watermarks
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
- Short-wide droopy ears matching 00_origin.png's design, with pink inner lining
- Low backward ahoge curl matching 00_origin.png's design
- Short small fringe/bangs over the forehead, matching 00_origin.png's design
- Large vertical-oval BROWN/orange-brown eyes with white side sclera and highlights
- Pink cheek blushes
- Tiny barely-visible nose (dot or simple shape)
- Small pink paw pads on visible rounded hands and feet, without fingers or claws
- A white DIAPER on the LOWER body (not a bib at the neck) with a brown
  paw-print motif in the center
- A fluffy tail in body color with a compact peach-pink ribbon/knot tied at
  the BASE (not an orange tip, not a large butterfly bow)
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

### 6.8 reference identity が崩れたとき（ちびわふ）

顔・耳・頭上シルエット・リボンが `00_origin.png` と別キャラに見える場合：

```
CRITICAL DESIGN IDENTITY:
The result does not match the attached 00_origin.png character design.
Start over from the official reference image only. Do not use any previous
failed generated images as visual guidance.

Preserve 00_origin.png's design identity for:
- compact rounded head and face width (not wider, puffier, or balloon-like)
- short-wide droopy ears that extend sideways, not long vertical ears
- low backward ahoge curl
- small forehead bangs with the same tufts and spacing
- vertical-oval brown/orange-brown eyes with white side sclera and highlights
- tiny dot nose, tiny closed W mouth, and blush placement
- compact peach-pink ribbon/knot at the BASE of the tail

Do not copy the exact normal standing pose. The pose may redraw body and
limb placement as needed, but it must keep the same character design.
```

### 6.9 walk_lean で手足が長くなったとき

```
The walk pose created long anatomical limbs. Redraw as a plush-toy
chibi step: keep both feet as tiny rounded plush feet with the same design
proportions as 00_origin.png. Do not draw thigh/calf segments. Move one
tiny foot clearly forward/up and keep the other tiny foot back/planted.
Keep arms as short rounded appendages. No elbows, knees, shoulders,
ankles, fingers, claws, toe segments, or realistic dog paws. Keep small
pink paw pads on visible rounded hand/foot tips. The result must read as
walking, not as the unchanged normal standing pose.
```

---

## 7. 発注ワークフロー

### 7.1 ちびわふ発注

```
1. 30_pose_catalog.md から発注したいポーズを選ぶ
2. このファイル § 1 のプロンプトをコピー（ちびわふ用 CHARACTER 入り）
3. [POSE_DESCRIPTION] に 30_pose_catalog.md の描画指示を貼り付け
4. ChatGPT サブスク版画像生成 UI を開く
5. public/chibiwafu/00_origin.png だけを添付
   - `01_normal.png` は QA 比較・仕様理解には使ってよいが、この生成の添付画像には含めない
   - 過去の NG 生成画像は添付しない
   - 画像生成 UI / 会話が過去 NG 画像を見ている場合は、新規セッションでやり直す
6. プロンプトを貼って ChatGPT サブスク版 UI で生成する
7. 納品物を 90_qa_checklist.md § B-1 + B-2 でチェック
8. NG があれば § 6.1-6.5, 6.7-6.9 のリトライ指示を送る
9. OK なら public/chibiwafu/NN_poseName.png で保存
   - Codex built-in 画像生成の一時出力は `.codex/generated_images/...` に残す
   - 検品前/NG 画像は `public/chibiwafu/` へコピーしない
   - 採用確定した 1 枚だけを正式ファイル名でコピーする
```

### 7.2 フラナ発注

```
1. 30_pose_catalog.md から発注したいポーズを選ぶ
   （ただしフラナで省略するポーズは除外：14/15/16/19）
2. このファイル § 1 のプロンプトをコピーし、CHARACTER セクションを
   § 2 のフラナ用 CHARACTER で全置換
3. [POSE_DESCRIPTION] に 30_pose_catalog.md の描画指示を貼り付け、
   "Chibiwafu" → "Furana"、"chibiwafu's" → "furana's" に全置換
4. ChatGPT サブスク版画像生成 UI を開く
5. public/furana/01_normal.png を添付（ちびわふの方ではない）
6. プロンプトを貼って ChatGPT サブスク版 UI で生成する
7. 納品物を 90_qa_checklist.md § B-2 + B-3 でチェック
8. NG があれば § 6.1-6.4, 6.6, 6.7 のリトライ指示を送る
9. OK なら public/furana/NN_poseName.png で保存
   - Codex built-in 画像生成の一時出力は `.codex/generated_images/...` に残す
   - 検品前/NG 画像は `public/furana/` へコピーしない
   - 採用確定した 1 枚だけを正式ファイル名でコピーする
```

---

## 8. サブスク版 UI 用・20_splat 再生成プロンプト

以下は `public/chibiwafu/00_origin.png` **だけ**を添付して、ChatGPT サブスク版画像生成 UI に
そのまま貼るためのプロンプト。`01_normal.png` や過去 NG 画像は添付しない。

```
Create one transparent PNG game sprite for Chibiwafu pose 20_splat.

Use the attached image 00_origin.png as the ONLY visual reference. Preserve
the character design identity, not the exact standing pose, not the pixel
layout, not the white background, and not the oval ground shadow. Do not use
any previous generated image as guidance.

This is a runtime sprite for a 2.5D colony simulation game. It must read as
the same Chibiwafu character in a flattened impact state.

Character identity to preserve:
- warm cream body color (#FEFBE7), warm brown outlines, clean flat/cel shading
- short-wide sideways droopy ears with rounded fluffy tips and light pink
  inner ears (#F5D5D0), spread flat to the sides in this pose
- low backward ahoge curl from 00_origin.png
- IMPORTANT: keep the same forehead bangs from 00_origin.png as actual
  fluffy hair tufts. The bangs must include a central rounded downward tuft
  and smaller left/right tufts along the front hairline. Do NOT replace the
  bangs with simple curved forehead marks, eyebrow-like arcs, random lines,
  or a smooth bald forehead.
- face still reads as Chibiwafu, but eyes are clear "x x" cross eyes for
  this pose; tiny nose remains small; tongue sticks out from one side
- white diaper (#FAFAFA) on the lower body with centered warm-brown paw
  print (#A27250), still visible
- fluffy cream tail with no colored tip
- compact peach-pink ribbon/knot (#F9C4A1) at the BASE of the tail near the
  body. It must be tiny and compact, not a large butterfly bow, not a heart,
  not a flower, not an oversized side bow.
- short rounded plush arms and legs only; no neck, no joints, no fingers,
  no claws, no shoes, no human anatomy. Small pink paw pads on visible
  hand/foot tips are correct and should not be omitted when visible

Pose:
Chibiwafu viewed from directly above or near top-down, completely flattened
after impact. The body is compressed to about 30% of normal height and
stretched wider horizontally, like a low flat plush pancake. Arms and legs
splay flat outward as short rounded appendages. Ears spread flat and wide.
Small sparse dust puff particles around the edges are okay. Comedic, not
gory; no blood.

Framing:
Single flattened character centered on a 1024x1024 canvas. Wider than tall,
occupying about 65-75% of canvas width with generous transparent margins.
Feet baseline rules do not apply because this is a top-down flattened pose.

Style:
Clean game-asset sprite, crisp vector-like warm brown outlines, soft flat/cel
shading, gentle pastel palette, same 00_origin.png design language. Not
watercolor, not storybook, not painterly, not sketchy, not photorealistic,
not 3D rendered, not generic anime.

Output:
1024x1024 PNG with fully transparent alpha background. No white background,
no checkerboard pixels, no ground shadow, no drop shadow, no gradient, no
texture, no ambient effects. One character, one pose, no text, no labels,
no border, no watermark.
```

---

## 9. 変更履歴

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
- v0.3 2nd レビューで発見した抜けを修正：
  - § 2 フラナ CHARACTER の「1.8x」を単独発注時は適用外と明記
  - § 7 ワークフローを § 7.1 ちびわふ / § 7.2 フラナ にキャラ別分岐
  - リファレンス画像の分岐（当時は chibiwafu/01_normal.png vs furana/01_normal.png）明示
  - 所有格 "chibiwafu's → furana's" の置換ルール追加（§7.2 step 3）
- v0.4 全色値・頭身比を実測値に置換（10_character_design.md v0.4 と同期）：
  - § 1 ちびわふ CHARACTER の体色 / 瞳 / 茶肉球 / リボン の hex を実測値に
  - § 1 ちびわふ頭身比を「head:body 1.05:1, 頭 45-50%」→「1.5:1, 頭 60%」に
  - § 2 フラナ CHARACTER の体色 / 赤目 / 首輪 / 鈴 / ピンク肉球 / リボン の
    hex を実測値に
  - § 2 フラナ頭身比を「head:body 0.9-1.0:1」→「1.2:1, 頭 55%」に修正
    （実測：フラナも頭が体より大きい、ちびわふより僅差）
  - 鈴を「golden bell」→「antique-gold bell」、爽やかな金 → 落ち着いた金 に表現修正
  - ピンク肉球を「pink」→「vivid PINK」に強調（実測の鮮やかさを反映）
- v0.5 `01_normal.png` の同一性を最優先するプロンプトへ修正：
  - reference と文章が矛盾した場合は reference を優先する指示を追加
  - 長い縦耳、汎用 Sanrio puppy、Disney puppy、人間 chibi への逃げを禁止
  - 目・前髪・アホ毛・耳・顔幅・尻尾根元リボンを reference 固定として明文化
  - walk 系で手足を伸ばさず、短いぬいぐるみ手足の範囲で歩行表現する方針へ変更
  - reference identity 崩れ用 §6.8 と walk_lean 長脚化用 §6.9 のリトライ指示を追加
  - ちびわふ発注 workflow に「過去 NG 画像を添付しない / 新規セッションでやり直す」を追加
- v0.6 ちびわふ reference を `00_origin.png` に変更し、design identity 方針へ修正：
  - `exact` / `identical` / ピクセル固定と読める表現を緩和
  - reference は通常立ちポーズ固定ではなく、顔・耳・頭上シルエット・短い手足・固定装備のデザイン正本と定義
  - walk_lean は通常立ちとの差分が一目で読めることを必須化
- v0.7 §1 の実プロンプトに PURPOSE を追加：
  - ゲーム内で状態スプライトとして差し替える runtime asset であることを明記
  - 同一キャラ・同一スケール・中心位置・足元ラインと、ポーズ可読性を同時に満たす目的を明記
- v0.8 移動ポーズの硬すぎる表現を修正：
  - `small offsets only` を削除
  - 短いぬいぐるみ手足を維持しつつ、ゲーム内で読める十分なポーズ差分を許容
- v0.9 reference の役割分離を明記：
  - `00_origin.png` は生成用 visual reference
  - `01_normal.png` など既存ポーズは QA 比較・仕様理解には使用可
  - ちびわふ生成時に `01_normal.png` を同時添付しない理由を、通常立ちコピー化の回避として説明
- v1.0 ChatGPT サブスク版 UI 標準に修正：
  - Codex / CLI / OpenAI Image API / `OPENAI_API_KEY` を標準生成手段から外した
  - API 課金が発生する生成はユーザー明示承認制とした
  - `20_splat` のサブスク版 UI 用プロンプトを追加
- v1.1 30 ポーズ計画に合わせたブレ防止を追加：
  - pose catalog の例外（空中・溺れ crop・splat・横寝睡眠）が generic feet-baseline より優先されると明記
  - 小物・外部の手・天候・Zzz・衝撃記号などは pose description で許可された場合のみ描くと明記
- v1.2 レビュー修正：
  - feet baseline を grounded pose のみの条件付き要求へ変更
  - `hands` 禁止を外部の人間/神の手に限定し、ちびわふ自身の短い手は維持
  - 耳内ピンクは自然に見える場合のみ描く方針へ変更
- v1.3 40 ポーズ計画に合わせた汎用禁止を維持：
  - 火事・掘り・拾い・探索系でも、背景や大型小物ではなくキャラ単体の姿勢で読ませる
  - props / weather / background effects は pose description で明示許可された最小要素だけに限定
- v1.4 ちびわふ手足肉球仕様と保存運用を訂正：
  - 手足先端の小さなピンク肉球パッドを必須要素として追加
  - 禁止対象を指・爪・指分割・リアルな犬足裏に限定
  - built-in 生成の一時出力は採用確定まで public へコピーしない運用を追記
