# ポーズカタログ（22 ポーズ）

発注時に `50_prompt_templates.md` のマスタープロンプト `[POSE_DESCRIPTION]` 欄へ
各ポーズの「描画指示」セクションを丸ごとコピペする。

---

## 既存ポーズ（01-09）

既存ファイル。**再発注不要**。新規追加時の style reference として参照する。

| # | 名前 | 用途 | ファイル |
|---|---|---|---|
| 01 | normal | idle / chatting | `01_normal.png` |
| 02 | crying | cry | `02_crying.png` |
| 03 | surprised | surprised / staring | `03_surprised.png` |
| 04 | angry | angry / eating | `04_angry.png` |
| 05 | sulking | sleep | `05_sulking.png` |
| 06 | dizzy | dazed | `06_dizzy.png` |
| 07 | dirty | hurt | `07_dirty.png` |
| 08 | sleepy | exhausted | `08_sleepy.png` |
| 09 | dead | dead | `09_dead.png` |

---

## 追加ポーズ（10-22）

### 10. walk_lean — 歩行

- **用途**: 移動中 / 放浪 / 逃走中の基本歩行
- **描画指示**:
  > Chibiwafu mid-stride: one hind leg lifted and clearly bent at the knee,
  > the other planted straight pushing back. Body leaning forward about 10 degrees.
  > Short arms swinging slightly opposite to the legs. Eyes looking forward,
  > mouth closed with a small neutral smile.
- **合格基準**: 片足が明確に浮く / 体の前傾 / 表情はニュートラル〜軽く笑顔

### 11. run_lean — 走行

- **用途**: 逃走 / 災害時の急ぎ / 緊急呼び出し
- **描画指示**:
  > Chibiwafu sprinting: both hind legs off the ground momentarily mid-run,
  > body leaning forward 20-25 degrees, arms stretched back for momentum.
  > Mouth open panting, eyes wide and focused forward. Small motion lines
  > trailing behind the feet and ears fluttering backward.
- **合格基準**: 両足浮遊 / 強い前傾 / 耳が後方になびく / motion line あり

### 12. reach — 手を伸ばす

- **用途**: 食事（石パン岩・泥川で飲む）/ ママに駆け寄る / 何かを掴む
- **描画指示**:
  > Chibiwafu standing on hind legs, both front paws extended forward and upward
  > reaching for something off-screen above. Body slightly stretched, back arched.
  > Eyes sparkling with desire or hunger. Mouth open in an "Ah!" shape, tongue
  > slightly visible.
- **合格基準**: 両前足が上方向に伸びる / 目が輝く / 口開き

### 13. hold_stick — 棒持ち

- **用途**: 棒会議 / 音頭 / 棒名人の集まり
- **描画指示**:
  > Chibiwafu standing upright, holding a single tall wooden stick (about 1.5x
  > the chibiwafu's body height) vertically in one front paw, raised slightly
  > above the head. The other paw rests at the side. Confident but slightly goofy
  > expression, mouth closed in a satisfied line, eyes proud.
- **合格基準**: 棒が明確に 1 本、垂直に近い角度 / 体がしっかり直立 / 棒は茶色の木製

### 14. cheeky_hips — ドヤ顔（腰に手）

- **用途**: cheeky 発言時（「ぼくがいちばん！」等）/ ざまあみろ
- **描画指示**:
  > Chibiwafu standing with both front paws on hips (arms akimbo), chest puffed
  > out, body slightly leaned back. Smug closed-mouth smirk with one corner
  > raised, one eye slightly closed in a sly look, eyebrow cocked. This is a
  > bratty boasting pose, NOT a cute wink or tongue-out.
- **合格基準**: 両手が腰 / 胸を張る / 半目・ニヤリ / 舌出しやウィンクは NG

### 15. heavy_cry — 号泣

- **用途**: ママロス / 浮世消失 / 哲学者消失 / 理不尽ボコ後
- **描画指示**:
  > Chibiwafu face completely scrunched up in heavy crying: eyes squeezed shut
  > as upward curves with big round tear drops flying sideways from each eye,
  > mouth wide open in a square shape wailing. Body slightly slumped, both
  > front paws rubbing the eyes.
- **合格基準**: 目をきつく閉じる / 涙が飛ぶ / 口が四角く開く / 既存 02_crying より激しい

### 16. cower — しゃがみ怯え

- **用途**: 狼接近 / 神が殴る前兆 / 火事逃げ遅れ
- **描画指示**:
  > Chibiwafu crouched very low to the ground, head ducked down, both front
  > paws covering the face/head defensively. Body compressed and small.
  > Eyes visible between paws, wide with fear, pupils tiny. Tail tucked
  > between legs.
- **合格基準**: しゃがみ姿勢 / 頭を抱える / 目は怖がっている / 尻尾が体の下に

### 17. arms_up — 万歳/絶叫

- **用途**: 崖落下 / 投げ飛ばされ / 農埋 / 音頭ピーク / banzai
- **描画指示**:
  > Chibiwafu with both front paws stretched straight up high above the head,
  > body elongated upward slightly. Mouth wide open in a surprised O shape
  > (usable for both cheering and screaming). Eyes as wide round shocked
  > circles. Hind legs dangling loosely (implies not touching ground, as if
  > falling or jumping).
- **合格基準**: 両手真上 / 口 O / 目丸い / 脚は下にダラリ（使い回しが効くよう）

### 18. drown_flail — 溺れ

- **用途**: 溺死前半 / flood_drown / mudriver / kamisama_drown
- **描画指示**:
  > Upper body of chibiwafu only, as if submerged from the chest down.
  > Head tilted back, mouth wide open gasping. Eyes teary with "><" shape,
  > panic. Both front paws flailing asymmetrically upward and outward
  > (one higher than the other). Ears splayed outward from water resistance.
  > No water drawn (water added in-engine). Small bubble particle next to mouth.
- **合格基準**: 下半身は描かない（チェスト下カット）/ 両手が非対称に上がる / 口大開け

### 19. knocked — ボコられ直後

- **用途**: 生意気ボコ / 理不尽ボコ / 神パンチ直後 / ココン虐待
- **描画指示**:
  > Chibiwafu mid-fall sideways from an impact: body tilted 45-60 degrees
  > sideways, one leg kicking up, both front paws flailing. Eyes swirled
  > (@_@) or crossed, dizzy. Mouth open in an "ah" of pain. Small impact
  > star drawn near the body. No blood.
- **合格基準**: 斜め横倒し / 目ぐるぐる or x_x / 痛がる口 / impact star

### 20. splat — ぺしゃんこ

- **用途**: 衝撃死（崖/投げ/太鼓下敷き/農埋）
- **描画指示**:
  > Chibiwafu viewed from directly above (top-down), body completely flattened:
  > vertical height compressed to about 30% of normal, stretched wider
  > horizontally. Limbs splayed out flat in all directions. Ears spread flat.
  > Eyes are "x x" crosses. Tongue sticking out from the side of the mouth.
  > Small dust puff particles around the edges of the body. Comedic, not gory.
- **合格基準**: 真上からの俯瞰 / 体が平たく広がる / x_x 目 / 舌出し / 砂煙

### 21. sit — 座り

- **用途**: 石パン岩で食う / 休息 / talk_gesture 代替
- **描画指示**:
  > Chibiwafu sitting on its rear with hind legs folded under body, back
  > straight upright. Front paws resting on the lap in front. Neutral
  > relaxed expression, eyes forward, mouth closed in small smile.
- **合格基準**: 尻が地面につく / 前足が腹前に / 背筋は伸びる / 表情穏やか

### 22. talk_gesture — 会話身振り

- **用途**: chatting state / oshaberi 発話中 / 独り言
- **描画指示**:
  > Chibiwafu standing, one front paw raised in front with index (paw tip)
  > pointing slightly outward as if making a point. Other paw at side.
  > Mouth open mid-speech showing small tongue. Eyes half-closed in
  > animated expression. Body leaning slightly toward the raised paw.
- **合格基準**: 片手を前に挙げて話す / 口が開いて話してる / 目に動きがある

---

## フラナ版の扱い

上記 10-22 は **フラナにも同形で発注**する。
フラナ発注時は `10_character_design.md` § 2.2 のフラナ差分（1.8x / エプロン / 疲れ目）を
プロンプトに追記する。

**フラナで省略してよいポーズ**（フラナは 1 体で特定行動しない）：
- `14_cheeky_hips` — フラナはドヤ顔しない（キャラ違い）
- `19_knocked` — フラナは頻繁にボコられない（オプション）

実質フラナは **+11 ポーズ** 発注で足りる。

---

## 優先発注順（style lock 確認用）

新規発注時は以下の順で 1 枚ずつテストする：

1. `10_walk_lean`（移動系の基本、最も使用頻度高い）
2. `20_splat`（既存 09_dead との差別化確認）
3. `13_hold_stick`（小物を持たせる style が通るか）
4. `14_cheeky_hips`（表情演出が効くか）
5. `18_drown_flail`（上半身カット構図が通るか）

この 5 枚で style / 構図 / 小物 / 表情 / 特殊構図 の全パターンを検証できる。
OK なら残り 8 枚を一気に発注。

---

## 変更履歴

- v0.1 初版（ultra plan で合意した 22 ポーズ構成）
