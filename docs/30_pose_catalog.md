# ポーズカタログ（40 ポーズ）

発注時に `50_prompt_templates.md` のマスタープロンプト `[POSE_DESCRIPTION]` 欄へ
各ポーズの「描画指示」セクションを丸ごとコピペする。

> ⚠ **フラナ発注時の置換ルール**：下記の全ての「描画指示」は `Chibiwafu` で
> 始まる。フラナを発注する時は、コピペ後に以下を全置換してから使う：
>
> - `Chibiwafu` → `Furana`（大文字始まり）
> - `chibiwafu` → `furana`（小文字）
> - `chibiwafu's` → `furana's`（所有格、§ 13 hold_stick 等で出現）
>
> その他の記述（arm / leg / ear / body 等）は共通なのでそのまま。

---

## 既存ポーズ（01-09）

既存ファイル。**再発注不要**。新規追加時は、ゲーム内スプライトとの並び確認や
既存表情・線幅の QA 比較には参照してよい。
ただし、ちびわふ新規生成で画像生成ツールに添付する visual reference は
`public/chibiwafu/00_origin.png` のみとし、`01_normal.png` を追加添付して
通常立ちポーズに引っ張られないようにする。

| # | 名前 | 用途 | ファイル |
|---|---|---|---|
| 01 | normal | idle / chatting | `01_normal.png` |
| 02 | crying | cry | `02_crying.png` |
| 03 | surprised | surprised / staring | `03_surprised.png` |
| 04 | angry | angry / eating | `04_angry.png` |
| 05 | sulking | sleep（legacy 割当。見た目は転んだ瞬間・へたり込み・すね倒れ。純睡眠ではない） | `05_sulking.png` |
| 06 | dizzy | dazed | `06_dizzy.png` |
| 07 | dirty | hurt | `07_dirty.png` |
| 08 | sleepy | exhausted（殴られ後・昏睡しかけ・意識もうろう。純睡眠ではない） | `08_sleepy.png` |
| 09 | dead | dead | `09_dead.png` |

---

## 追加ポーズ（10-40）

### 10. walk_lean — 歩行

- **用途**: 移動中 / 放浪 / 逃走中の基本歩行
- **描画指示**:
  > Chibiwafu in a clearly readable plush-toy walking pose, facing 3/4
  > front, while preserving the character design identity from the attached
  > character reference image:
  > the same face design, short-wide ears, low ahoge curl, short bangs,
  > warm cream body, white diaper with brown paw print, compact tail-base
  > ribbon, and tiny plush limb proportions. Do not preserve the standing
  > pose. Redraw the body and limbs as needed so the walking pose is visible:
  > the body leans forward slightly, about 5-8 degrees; one tiny rounded
  > foot is lifted and moved clearly forward/up; the other tiny rounded foot
  > stays back/planted; the two tiny rounded arms shift slightly opposite to
  > the feet. This is a short plush step, not a long stride. No elbow bend,
  > no elbow line, no knee bend, no knee line, no thigh/calf shape, no long
  > walking legs. Eyes look forward, mouth closed with a small neutral smile.
- **合格基準**: 生成用 visual reference と同一キャラに見える顔・耳・頭上シルエット /
  通常立ちではなく歩行中に見える / 片足が明確に前方または上方へ出ている /
  反対足が後ろまたは接地側に残る / 体の軽い前傾 / 手足がぬいぐるみ的に短い /
  膝・肘の関節線なし / 太もも・ふくらはぎ・長い斜め脚を描いていない /
  表情ニュートラル / 尻尾根元リボンが大きな蝶結びやハート形になっていない

### 11. run_lean — 走行

- **用途**: 逃走 / 災害時の急ぎ / 緊急呼び出し
- **描画指示**:
  > Chibiwafu sprinting full speed: both feet off the ground momentarily
  > mid-run (airborne), body leaning forward 20-25 degrees, arms stretched
  > back behind the body for momentum (no elbow joint line). Mouth open
  > panting, eyes wide and focused forward. Small motion lines trailing
  > behind the feet and ears fluttering backward.
- **合格基準**: 両足浮遊 / 強い前傾 / 耳が後方になびく / motion line あり

### 12. reach — 手を伸ばす

- **用途**: 対象へ手を伸ばす / 食べ物・水・ママなどへ届く前 / 何かを掴む直前
- **描画指示**:
  > Chibiwafu standing on both legs, both arms extended forward and upward
  > reaching for something off-screen above. Body slightly stretched
  > upward, back gently arched. No elbow joint lines on the arms — they
  > curve smoothly. Eyes sparkling with desire or hunger. Mouth open in
  > an "Ah!" shape, tongue slightly visible.
- **合格基準**: 両手が上方向に伸びる / 目が輝く / 口開き / 関節線なし

### 13. hold_stick — 小枝持ち

- **用途**: 小枝会議 / 音頭 / 小枝を掲げる遊び
- **描画指示**:
  > Chibiwafu standing upright on both legs, holding one short twig in one
  > rounded arm. The twig is small and light, about the length of the
  > chibiwafu's forearm-to-torso area, NOT taller than the character and
  > NOT a staff. The twig may be angled slightly upward like a tiny flag.
  > The other arm rests at the side. Confident but slightly goofy expression,
  > mouth closed in a satisfied line, eyes proud.
- **合格基準**: 小枝が明確に 1 本 / 小枝は体より長くない / 長い杖・棒・武器に見えない /
  体がしっかり直立 / 小枝は茶色の木製

### 14. cheeky_hips — ドヤ顔（腰に手）

- **用途**: cheeky 発言時（「ぼくがいちばん！」等）/ ざまあみろ
- **描画指示**:
  > Chibiwafu standing with both arms bent so the hands rest on the hips
  > (arms-akimbo pose), chest puffed out, body slightly leaned back.
  > Smug closed-mouth smirk with one corner raised, one eye slightly closed
  > in a sly look, eyebrow cocked. This is a bratty boasting pose,
  > NOT a cute wink or tongue-out.
- **合格基準**: 両手が腰 / 胸を張る / 半目・ニヤリ / 舌出しやウィンクは NG

### 15. heavy_cry — 号泣

- **用途**: ママロス / 浮世消失 / 哲学者消失 / 理不尽ボコ後
- **描画指示**:
  > Chibiwafu face completely scrunched up in heavy crying: eyes squeezed
  > shut as upward curves with big round tear drops flying sideways from
  > each eye, mouth wide open in a square shape wailing. Body slightly
  > slumped forward. Both arms raised up to rub the eyes with the rounded
  > hand tips (no finger detail).
- **合格基準**: 目をきつく閉じる / 涙が飛ぶ / 口が四角く開く / 既存 02_crying より激しい

### 16. cower — しゃがみ怯え

- **用途**: 狼接近 / 神が殴る前兆 / 火事逃げ遅れ
- **描画指示**:
  > Chibiwafu crouched very low to the ground, head ducked down, both arms
  > raised to cover the face/head defensively. Body compressed and small.
  > Eyes visible between the arms, wide with fear, pupils tiny. The fluffy
  > tail is pulled close to the body (no tail tucking between legs needed
  > — the tail stays fluffy with its base ribbon visible).
- **合格基準**: しゃがみ姿勢 / 頭を抱える / 目は怖がっている / 尻尾は体に寄せる

### 17. arms_up — 万歳/絶叫

- **用途**: 崖落下 / 投げ飛ばされ / 農埋 / 音頭ピーク / banzai
- **描画指示**:
  > Chibiwafu with both arms stretched straight up high above the head,
  > body elongated upward slightly. Mouth wide open in a surprised O shape
  > (usable for both cheering and screaming). Eyes as wide round shocked
  > circles. Legs dangling loosely below (implies not touching ground,
  > as if falling or jumping).
- **合格基準**: 両手真上 / 口 O / 目丸い / 脚は下にダラリ（使い回しが効くよう）
- **例外**: 本ポーズは空中にいる想定のため、`20_technical_spec.md § 3.3` の
  「feet baseline 統一」ルールは **適用外**（足元が canvas 底 15% より上に来てよい）。
  体幹中心は他ポーズと同じ位置に揃える。

### 18. drown_flail — 溺れ

- **用途**: 溺死前半 / flood_drown / mudriver / kamisama_drown
- **描画指示**:
  > Upper body of chibiwafu only, as if submerged from the chest down.
  > Head tilted back, mouth wide open gasping. Eyes teary with "><" shape,
  > panic. Both arms flailing asymmetrically upward and outward (one higher
  > than the other). Ears splayed outward from water resistance. No water
  > drawn (water added in-engine). Small bubble particle next to mouth.
  > The diaper may not be visible due to the chest-down crop.
- **合格基準**: 下半身は描かない（チェスト下カット）/ 両手が非対称に上がる / 口大開け

### 19. knocked — ボコられ直後

- **用途**: 生意気ボコ / 理不尽ボコ / 神パンチ直後 / ココン虐待
- **描画指示**:
  > Chibiwafu mid-fall sideways from an impact: body tilted 45-60 degrees
  > sideways, one leg kicking up, both arms flailing outward. Eyes swirled
  > (@_@) or crossed, dizzy. Mouth open in an "ah" of pain. Small impact
  > star drawn near the body. No blood.
- **合格基準**: 斜め横倒し / 目ぐるぐる or x_x / 痛がる口 / impact star

### 20. splat — ぺしゃんこ

- **用途**: 衝撃死（崖/投げ/太鼓下敷き/農埋）
- **描画指示**:
  > Chibiwafu viewed from directly above (top-down), body completely
  > flattened: vertical height compressed to about 30% of normal, stretched
  > wider horizontally. Arms and legs splayed out flat in all directions.
  > Ears spread flat. Eyes are "x x" crosses. Tongue sticking out from the
  > side of the mouth. Small dust puff particles around the edges of the
  > body. Comedic, not gory. The diaper is still visible on the lower body,
  > and the tail ribbon is visible near the base of the tail.
- **合格基準**: 真上からの俯瞰 / 体が平たく広がる / x_x 目 / 舌出し / 砂煙

### 21. sit — 座り

- **用途**: 石パン岩で食う / 休息 / talk_gesture 代替
- **描画指示**:
  > Chibiwafu sitting on its rear with both legs folded in front under the
  > body, back upright. Both arms resting gently on the lap in front.
  > Neutral relaxed expression, eyes forward, mouth closed in small smile.
- **合格基準**: 尻が地面につく / 両手が腹前に / 背筋は伸びる / 表情穏やか

### 22. talk_gesture — 会話身振り

- **用途**: chatting state / oshaberi 発話中 / 独り言
- **描画指示**:
  > Chibiwafu standing, one arm raised in front with the rounded hand tip
  > pointing slightly outward as if making a point (no fingers drawn,
  > just a round hand). The other arm at the side. Mouth open mid-speech
  > showing small tongue. Eyes half-closed in animated expression. Body
  > leaning slightly toward the raised arm.
- **合格基準**: 片手を前に挙げて話す / 口が開いて話してる / 目に動きがある

### 23. eat_drink — 食事・飲水

- **用途**: 口元へ運んで食べる・飲む / 石パン岩を食べている最中 / 泥川を飲んでいる最中 / 腹ぺこ行動
- **描画指示**:
  > Chibiwafu in a compact eating-or-drinking pose, facing 3/4 front.
  > Keep the same face, short-wide ears, ahoge, bangs, diaper paw print,
  > and tail-base ribbon from the attached character reference image.
  > The body leans forward slightly.
  > One rounded hand is lifted near the mouth as if bringing food or water
  > to the mouth; the other rounded hand stays near the diaper. Mouth is
  > open in a small eager "ah" shape, with tiny tongue visible. Eyes are
  > focused on the hand/mouth area. Do not draw a large bowl, cup, table,
  > ground, or background. A tiny crumb or droplet is allowed, but the pose
  > must read even without props.
- **合格基準**: 手が口元に近い / 食べる・飲む動作に見える / 大きな小物や背景なし /
  おむつ肉球と尻尾根元リボンが見える / 手足が短い / 関節線なし

### 24. work_carry — 作業・運搬

- **用途**: 開拓 / 農作業 / 石・枝・小物運搬 / 労働中
- **描画指示**:
  > Chibiwafu doing simple work, carrying a small generic bundle close to
  > the belly with both rounded arms. The body leans forward slightly under
  > the weight, but the plush legs remain very short. Expression is focused
  > and strained, not crying. The carried bundle should be small and generic
  > (one little rock, tiny wood bundle, or wrapped lump), not a large tool
  > and not a weapon. Keep the diaper paw print visible below the bundle
  > if possible, and keep the compact tail-base ribbon visible.
- **合格基準**: 両手で小物を抱える / 軽い前傾で作業中に見える / 大型道具・武器なし /
  おむつが完全に消えない / 手足が短い / 関節線なし

### 25. grabbed — つままれ

- **用途**: 神につままれている / ドラッグ中 / 持ち上げられ中
- **描画指示**:
  > Chibiwafu being pinched or lifted from above, but do NOT draw the human
  > hand or the god hand. Show only the character reaction: body slightly
  > compressed upward, ears drooping outward, arms and tiny legs dangling
  > downward, tail hanging with the small base ribbon visible. Eyes wide in
  > surprise, mouth small open "o". The top of the head may be subtly pulled
  > upward, but keep the ahoge and bangs unchanged.
- **合格基準**: 外部の手を描かない / 持ち上げられ中に見える / 手足が下にだらり /
  顔・前髪・アホ毛が崩れない / 尻尾根元リボンが見える / 関節線なし

### 26. thrown_airborne — 投げられ中

- **用途**: 神に投げられた瞬間 / 崖落下前 / 空中移動
- **描画指示**:
  > Chibiwafu airborne after being thrown, body tilted diagonally about
  > 35-50 degrees and slightly rotating. Both rounded arms and tiny legs
  > flail outward asymmetrically, ears swept back by motion, tail following
  > the motion with the compact base ribbon still visible. Eyes are wide
  > shocked circles, mouth open in a rounded scream. No impact star, no
  > blood, no ground, no background.
- **合格基準**: 空中にいると読める / 斜め回転 / 手足が非対称にバタつく /
  impact star なし（`19_knocked` と分離） / 手足が長くない / 関節線なし
- **例外**: 空中ポーズのため、足元基準ラインは通常立ちと一致しなくてよい。
  体幹中心とスケールは他ポーズと揃える。

### 27. weather_suffering — 天候苦痛

- **用途**: 熱波 / 寒さ / 雨風 / 環境ストレス
- **描画指示**:
  > Chibiwafu suffering from harsh weather in a generic way that works for
  > both heat and cold: body hunched and trembling, arms pulled close to the
  > belly, tiny legs close together, ears sagging. Eyes squeezed into worried
  > curves, mouth wavy and uncomfortable. A few small sweat/shiver marks may
  > appear near the head, but do not draw weather background, snow, sun, rain,
  > text, or large effects. Keep the diaper paw print and tail-base ribbon.
- **合格基準**: つらそうな環境ストレスに見える / 背景天候を描かない /
  小さな汗・震え記号は最小限 / おむつと尻尾根元リボンが見える / 関節線なし

### 28. sleep_curl — 丸まり熟睡

- **用途**: 純睡眠の基本 / 安心して眠る / 夜の睡眠
- **描画指示**:
  > Chibiwafu peacefully sleeping curled up on its side like a plush toy.
  > Body is compact and round, tiny arms tucked gently near the chest, tiny
  > legs tucked close, tail curled near the body with the small base ribbon
  > visible. Eyes closed as soft relaxed curves, mouth small and peaceful.
  > Keep the same bangs, ahoge, and short-wide ears from the attached
  > character reference image.
  > No injury marks, no x eyes, no tongue out, no impact marks, no Zzz text.
- **合格基準**: 穏やかな純睡眠に見える / 死亡・昏睡・ボコ後に見えない /
  x_x 目・舌出し・衝撃記号なし / Zzz や文字なし / おむつか尻尾根元リボンが確認できる
- **例外**: 横寝ポーズのため、足元基準ラインは通常立ちと一致しなくてよい。
  体幹中心とスケールは他ポーズと揃える。

### 29. sleep_flat — 地面寝・野宿

- **用途**: 野宿 / 行き倒れではない水平寝 / 休息中
- **描画指示**:
  > Chibiwafu lying flat as if resting on an invisible ground plane, on its
  > side or belly, full body visible and relaxed. The pose is horizontal,
  > but still soft and safe:
  > eyes closed peacefully, mouth tiny and relaxed, ears spread gently,
  > arms resting forward, tiny legs tucked or relaxed behind. The white
  > diaper with brown paw print should remain visible, and the tail-base
  > ribbon should be visible. No bruises, no stars, no x eyes, no tongue,
  > no Zzz text, no ground shadow or background.
- **合格基準**: 横たわって眠っている / 怪我・死亡・気絶に見えない /
  全身が見える / おむつ肉球と尻尾根元リボンが可能な範囲で見える / 文字なし
- **例外**: 横寝ポーズのため、足元基準ラインは通常立ちと一致しなくてよい。
  体幹中心とスケールは他ポーズと揃える。

### 30. nap_sitting — 座り居眠り

- **用途**: 待機中のうとうと / 座ったまま寝る / 疲れすぎて居眠り
- **描画指示**:
  > Chibiwafu sitting upright but dozing off peacefully. Body seated with
  > tiny legs in front, arms relaxed on the belly or lap, head drooping
  > slightly forward. Eyes closed or very softly half-closed, mouth small
  > and calm. This is a sleepy nap, not unconsciousness: no x eyes, no
  > tongue out, no bruises, no impact marks, no panic. Keep the ahoge,
  > bangs, short-wide ears, diaper paw print, and tail-base ribbon.
- **合格基準**: 座ったまま穏やかに居眠りしている / 昏睡・殴られ後に見えない /
  おむつ肉球が見える / 手足が短い / 関節線なし / 文字なし

### 31. wake_up — 起床・寝ぼけ

- **用途**: 睡眠明け / 朝起きた直後 / 眠気から復帰
- **描画指示**:
  > Chibiwafu just waking up while sitting on its rear, not standing and
  > not half-rising. Body is seated upright but still drowsy, tiny legs in
  > front, one rounded hand rubbing one eye, the other hand resting near the
  > belly. Eyes are sleepy half-open or one eye closed, mouth small in a
  > soft yawn. Ears relaxed naturally, ahoge and bangs unchanged. No Zzz
  > text, no bed, no blanket, no background.
- **合格基準**: 起きた直後に見える / 眠いが昏睡ではない / 手で目をこする /
  座り姿勢で固定 / Zzz・寝具・背景なし / おむつ肉球と尻尾根元リボンが可能な範囲で見える / 関節線なし

### 32. plead — お願い・許し乞い

- **用途**: おねだり / 許してほしい / ママに頼む / 神へお願い
- **描画指示**:
  > Chibiwafu pleading cutely, facing 3/4 front. Both short rounded hands
  > are held together in front of the chest/belly like a small begging pose
  > (no fingers). Body leans forward slightly. Eyes are large and watery,
  > eyebrows softly worried if visible, mouth small and quivering. Keep the
  > pose compact; do not add prayer beads, text, halos, or background.
- **合格基準**: 両手を胸/腹前で合わせてお願いしている / 涙目・不安そう /
  外部小物なし / 手足が短い / おむつと尻尾根元リボンが見える / 関節線なし

### 33. celebrate_jump — 喜びジャンプ

- **用途**: 成功 / うれしい / 食べ物発見 / 祭り・音頭の明るい瞬間
- **描画指示**:
  > Chibiwafu jumping happily in place, a cheerful airborne pose distinct
  > from screaming or falling. Both short arms lifted outward/upward, tiny
  > legs tucked slightly under the body, ears bouncing outward. Eyes happy
  > and open, mouth wide smiling. No confetti, no background effects, no
  > decorative stars. At most 1-2 tiny dust puffs close to the feet/body are
  > allowed if needed to show the jump.
- **合格基準**: 喜んで跳ねている / `17_arms_up` の絶叫・落下と混同しない /
  明るい笑顔 / キラキラ・紙吹雪・大きな演出背景なし / 小さな砂煙は体の近くに 1-2 個まで /
  手足が短い / 関節線なし
- **例外**: 空中ポーズのため、足元基準ラインは通常立ちと一致しなくてよい。
  体幹中心とスケールは他ポーズと揃える。

### 34. sick_fever — 病気・発熱

- **用途**: 病気 / 発熱 / 体調不良 / 疫病イベント
- **描画指示**:
  > Chibiwafu sitting weakly with a fever, seated on its rear with tiny legs
  > in front. Body slumps forward slightly. One short rounded hand touches
  > the forehead as if checking fever; the other rests weakly on the belly.
  > Eyes are droopy and unfocused, mouth small wavy and uncomfortable, cheeks
  > noticeably flushed. A few tiny sweat drops near the head are allowed.
  > Do not draw a thermometer, hospital symbol, blanket, bed, background,
  > or text.
- **合格基準**: 座り込んだ病気・発熱に見える / 片手が額に触れている /
  頬の赤みが強い / `27_weather_suffering` の天候苦痛と混同しない / 死亡・昏睡ではない /
  医療小物・寝具・背景なし / おむつと尻尾根元リボンが見える / 関節線なし

### 35. smoke_cough — 煙で咳き込み

- **用途**: 火事の煙 / 煙害 / 咳き込み / 息苦しさ
- **描画指示**:
  > Chibiwafu coughing from smoke, hunched forward with one rounded hand
  > near the mouth and the other hand held close to the body. Eyes squeezed
  > shut or watery, mouth open coughing. Ears droop outward. A few small
  > gray smoke wisps near the mouth/head are allowed, but do NOT draw fire,
  > flames, room, smoke background, ash covering the canvas, or text.
- **合格基準**: 咳き込み・煙で苦しいと読める / 火や背景を描かない /
  煙は小さな記号程度 / 手足が短い / おむつと尻尾根元リボンが可能な範囲で見える / 関節線なし

### 36. dig_scrape — 掘る・耕す

- **用途**: 穴掘り / 農作業 / 土をかく / 開拓作業
- **描画指示**:
  > Chibiwafu digging or scraping at an invisible ground plane using both
  > short rounded hands. Body crouches low and leans forward, tiny legs
  > planted short behind/under the body. Eyes focused downward, mouth small
  > and determined. A few tiny dirt crumbs near the hands are allowed, but
  > no shovel, no large tool, no visible ground patch, no background.
- **合格基準**: 低くかがんで掘る/かく動作に見える / 大型道具なし /
  地面面や背景なし / 手足が短い / おむつ肉球が可能な範囲で見える / 関節線なし

### 37. gather_pickup — 拾う・収穫

- **用途**: 小物を拾う / 収穫 / 採集 / 落ちたものを取る
- **描画指示**:
  > Chibiwafu bending forward to pick up a tiny object from an invisible
  > ground plane. One short rounded hand reaches downward, the other balances
  > near the belly. Tiny legs remain short and stable. Eyes look down with
  > interest, mouth small open. A single tiny generic item or crumb near the
  > reaching hand is allowed, but no basket, no field, no floor, no background.
- **合格基準**: 拾う/収穫する直前に見える / 小物は小さく 1 個まで /
  背景・床・畑なし / 手足が短い / 尻尾根元リボンが可能な範囲で見える / 関節線なし

### 38. refuse_no — 拒否・いやいや

- **用途**: 命令拒否 / 好き嫌い / いやいや / 反抗
- **描画指示**:
  > Chibiwafu refusing with a clear "no" body language. Body leans slightly
  > backward, head turned away to one side, both short rounded hands pulled
  > tightly in front of the belly as a defensive "I don't want to" pose.
  > Do not cross the arms like a human; keep the hands short and rounded.
  > Eyes squeezed or narrowed in stubborn refusal, mouth small pout. Do not
  > draw a "NO" sign, text, symbol marks, or background.
- **合格基準**: いやいや・拒否に見える / テキストや禁止マークなし /
  短い丸手を腹前にぎゅっと寄せる / 人間的な腕組みではない /
  手足が短い / おむつと尻尾根元リボンが見える / 関節線なし

### 39. search_look — 探索・きょろきょろ

- **用途**: 探索 / 周囲確認 / ママを探す / 落とし物探し
- **描画指示**:
  > Chibiwafu searching and looking around, facing 3/4 front with the head
  > turned slightly to one side. One short rounded hand is raised above the
  > eyes like shading the brow, the other arm balances at the side. Eyes are
  > wide and looking sideways, mouth small curious "o". Body leans forward
  > a little. No magnifying glass, no map, no question mark, no text, no
  > background.
- **合格基準**: 探している/見回していると読める / 虫眼鏡・地図・記号なし /
  片手を目の上に添える / 手足が短い / おむつと尻尾根元リボンが見える / 関節線なし

### 40. lonely_sit — 寂しい・しょんぼり座り

- **用途**: ママ待ち / 孤独 / しょんぼり / 号泣前の静かな悲しみ
- **描画指示**:
  > Chibiwafu sitting small and lonely, body slightly curled inward but not
  > sleeping. Arms rest weakly on the belly or lap, tiny legs tucked in
  > front. Eyes look downward with soft sadness, mouth tiny and downturned,
  > ears droop naturally. This is quiet loneliness, not heavy crying and not
  > injury. No tears flying, no Zzz text, no background, no dramatic effects.
- **合格基準**: 静かに寂しそう / `15_heavy_cry` の号泣や `30_nap_sitting` の居眠りと混同しない /
  座り姿勢 / 手足が短い / おむつと尻尾根元リボンが可能な範囲で見える / 関節線なし

---

## フラナ版の扱い

上記 10-40 は **フラナにも同形で発注可能**。ただしフラナのプロポーション・
装備・目色は `10_character_design.md` § 2 と異なる（赤目・赤首輪＋金鈴・
ピンク肉球のおむつ・高頭身・凛）ため、発注時は `50_prompt_templates.md § 2`
のフラナ用 CHARACTER セクションに置換してからポーズ指示を貼る。

**フラナで省略してよいポーズ**（フラナは監督者キャラであり、以下の行動は
仕様上発生しないため発注不要）：

- `14_cheeky_hips` — ドヤ顔は cheeky trait 持ちちびわふの挙動、フラナは該当しない
- `15_heavy_cry` — 号泣は子供ちびわふ特有、フラナは静かに目を伏せるのみ
- `16_cower` — 怯え縮こまりは弱さの表現、フラナは凛とした監督者なので該当しない
- `19_knocked` — ボコられは子供同士の争いと神のダメージ対象、フラナはほぼ発生しない
- `23_eat_drink` — ちびわふ生活行動用。フラナで必要な場合のみ個別発注
- `24_work_carry` — ちびわふ労働・運搬用。フラナで必要な場合のみ個別発注
- `25_grabbed` / `26_thrown_airborne` — 神の介入対象としてフラナに使う予定がなければ不要
- `27_weather_suffering` — フラナが環境被害を受ける仕様がなければ不要
- `28_sleep_curl` / `29_sleep_flat` / `30_nap_sitting` — フラナの睡眠演出が必要な場合のみ発注
- `31_wake_up` / `32_plead` / `33_celebrate_jump` / `34_sick_fever` /
  `35_smoke_cough` / `36_dig_scrape` / `37_gather_pickup` /
  `38_refuse_no` / `39_search_look` / `40_lonely_sit` — フラナで同状態を使う仕様がある場合のみ発注

実質フラナは当面 **9 ポーズ**（10/11/12/13/17/18/20/21/22）で足りる。

---

## 優先発注順（style lock 確認用）

新規発注時は以下の順で 1 枚ずつテストする：

1. `10_walk_lean`（移動系の基本、最も使用頻度高い）
2. `20_splat`（既存 09_dead との差別化確認）
3. `13_hold_stick`（小枝の小物を持たせる style が通るか）
4. `14_cheeky_hips`（表情演出が効くか）
5. `18_drown_flail`（上半身カット構図が通るか）
6. `28_sleep_curl`（05/08 と違う純睡眠が通るか）
7. `25_grabbed`（外部の手なしで「つままれ」が通るか）
8. `26_thrown_airborne`（空中斜めポーズが通るか）
9. `34_sick_fever`（病気表現が死亡・昏睡にならないか）
10. `36_dig_scrape`（背景なしで作業動作が通るか）

この 10 枚で style / 構図 / 小物 / 表情 / 特殊構図 / 純睡眠 /
外力リアクション / 体調不良 / 背景なし作業 を検証できる。OK なら残りを順番に発注。

---

## 変更履歴

- v0.1 初版（ultra plan で合意した 22 ポーズ構成）
- v0.2 用語統一とフラナ記述修正（10_character_design.md v0.3 と同期）：
  - 全ポーズ description の `hind legs` / `front paws` を `legs` / `arms`
    に統一（4 足獣解釈を誘発しないため）
  - 「bent at the knee」「folded hind legs」→ 「膝関節線なし」を明示する
    表現に書き換え
  - §16 cower の「尻尾を脚の間にしまう」→ 「尻尾を体に寄せる、リボン見える」に修正
  - §18 drown_flail / §20 splat におむつ・尻尾リボンの可視性を注記
  - フラナ版の扱いを書き直し（エプロン削除、赤目・首輪・凛、省略ポーズを
    監督者キャラとして拡張）
  - 冒頭にフラナ発注時の「Chibiwafu → Furana」置換ルールを明記
    （大文字始まり・小文字・所有格 3 パターン）
- v0.3 `10_walk_lean` を `01_normal.png` 再現優先に修正：
  - 汎用的な mid-stride 指示をやめ、ぬいぐるみ短足の小さな歩行オフセットに変更
  - 顔・耳・頭上シルエット・手足比率を reference から変えないことを合格条件化
  - 長い歩行脚、肘・膝、巨大な尻尾リボンを NG として明記
- v0.4 `10_walk_lean` をデザイン同一性優先に再修正：
  - ちびわふ reference を `00_origin.png` に変更
  - `01_normal.png` の立ち姿固定と読める文言を削除
  - 通常立ちとの差分が一目で読める歩行ポーズを合格条件に追加
- v0.5 `10_walk_lean` の可読性方針を明確化：
  - 「小さな歩行オフセット」は短足維持のためであり、ポーズ差分を弱める意味ではないと整理
  - 短いぬいぐるみ足の範囲で、歩行中と読める明確な前後差を許容
- v0.6 既存 01-09 の参照用途を整理：
  - 既存ポーズは QA 比較・仕様理解には参照可
  - ちびわふ生成時の visual reference 添付は `00_origin.png` に限定し、通常立ちコピー化を避ける
- v0.7 30 ポーズ計画へ拡張：
  - 23-27 に食事・作業・つままれ・投げられ・天候苦痛を追加
  - 28-30 に純睡眠ポーズを追加
  - 05 は転んだ瞬間/へたり込み、08 は昏睡しかけとして整理し、純睡眠から分離
  - `13_hold_stick` を長い棒から小枝サイズへ変更
- v0.8 レビュー修正：
  - `12_reach` は取得前、`23_eat_drink` は摂取中として用途を分離
  - `29_sleep_flat` の ground 表現を invisible ground plane に変更し、背景描画を誘発しない文言へ修正
- v0.9 40 ポーズ計画へ拡張：
  - 31-40 に起床・お願い・喜び・病気・煙咳・掘り・拾い・拒否・探索・寂しさを追加
  - 火事・掘り・拾い・探索は背景や大型小物ではなく、キャラ単体の姿勢で読ませる方針にした
- v1.0 31-40 レビュー修正：
  - `31_wake_up` と `34_sick_fever` の基礎姿勢を座りに固定
  - `34_sick_fever` は片手を額に当てる病気専用シルエットに変更
  - `38_refuse_no` は人間的な腕組みを禁止し、短い丸手を腹前に寄せる拒否姿勢へ変更
  - `33_celebrate_jump` の装飾効果を体の近くの小さな砂煙 1-2 個までに制限
