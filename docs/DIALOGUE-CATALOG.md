# Dialogue Catalog

くそざこ村のセリフ、死因テンプレート、発言プールの棚卸し。
現在は自動生成ではなく、実装ファイルへの索引と整理方針をまとめる。

## 正本ファイル

| 種別 | ファイル | 内容 |
|---|---|---|
| ちびわふ汎用 / trait / 行動 / 神様反応 | `src/sim/chats.ts` | 最も大きいセリフ正本 |
| NPC セリフ | `src/sim/npcs.ts` | フラナ / スズ / ココン / ルー。M2.1 でフラナ以外は廃止予定 |
| 死因テンプレート | `src/sim/deaths.ts` | death dex と墓碑銘 |
| 地形編集リアクション | `src/main.ts` `EDIT_LINES` | ramp / flatten / smooth / channel |
| フレーバー状態発言 | `src/sim/flavorBehaviors.ts` | 季節、粗相、状態別 |
| 崖飛び込み発言 | `src/sim/chibiwafu.ts` | maybeRashLeap |
| イベント内 hardcoded 発言 | `src/sim/world.ts` | 崩落、狼、睡眠、フラナ事故反応など |

## M2.1 方針

発言は「意味不明で面白い」だけではなく、最低限次を満たす。

- 話者が誰か分かる
- いま起きている状態や事故と矛盾しない
- プレイヤーに少しだけ状況情報を返す
- フラナの機嫌と発言が一致する
- 廃止予定のスズ / ココン / ルー依存を増やさない

残してよい意味不明さ:

- ちびわふの幼さ、弱さ、勘違い
- 事故直前/直後の短い叫び
- フラナの困惑

減らす意味不明さ:

- 死因と関係ない追悼
- 状況説明になっていない長文
- 旧イベント（音頭、ココン、スズ）前提の発言
- 「だからどうした？」で終わるだけの反応

## 主要プール

### ちびわふ汎用

| プール | ファイル | 用途 | 状態 |
|---|---|---|---|
| `GENERIC.normal` | `src/sim/chats.ts` | 通常独り言 | 要棚卸し |
| `GENERIC.cheeky` | `src/sim/chats.ts` | 生意気発言、ボコ誘発 | 継続可 |
| `EXCLAMATIONS` | `src/sim/chats.ts` | 短い叫び / ママ呼び | 継続可 |
| `CRY_REASONS` | `src/sim/chats.ts` | cry 状態の理由 | 継続可 |
| `SLEEP_REASONS` | `src/sim/chats.ts` | sleep 状態の理由 | 継続可 |
| `DAZED_REASONS` | `src/sim/chats.ts` | dazed / confused | 継続可 |
| `SURPRISED_REASONS` | `src/sim/chats.ts` | surprised | 継続可 |

### trait 別

| Trait | 用途 | 注意 |
|---|---|---|
| `bouken` | 遠くを見る、崖/水に突っ込みやすい | 崖飛び込みと相性良い |
| `gourmand` | 食欲、食料不足 | 食料システムの説明に使える |
| `shinpai` | 危険察知、怖がり | path 失敗 / 崩落 warning に使える |
| `ukiyo` | ぼんやり哲学 | 意味不明に寄りすぎ注意 |
| `ikusa` | 棒、喧嘩 | ココン廃止後も trait 反応として残せる |
| `noumin` | 畑、土、水 | 地形/農業の説明役 |
| `tabikko` | 境界、遠出 | path failed / 迷子と相性 |
| `gunsuki` | 群れ、追従 | フラナ追従や道開通反応 |
| `hitoribochi` | 一人、距離 | 暗くなりすぎ注意 |
| `bo_suki` | 棒 | 音頭/やぐら依存を外す |
| `taiko_kko` | 太鼓 | 音頭廃止で整理対象 |
| `nonbiri` | 遅い、ゆるい | 継続可 |
| `sekkachi` | 急ぐ | ramp / path と相性 |
| `oshaberi` | 話す | 酸欠死など旧ネタは要整理 |
| `mukuchi` | 無言 | ルー廃止後の無口役として残す |
| `nakimushi` | 泣く | 継続可 |
| `tsuyoi` | 強がり | 段差事故と相性 |
| `yowai` | 弱い | くそざこ感の主役 |
| `morashi` | 粗相 | 理不尽ボコはココン依存を外す |
| `bo_meijin` | 棒名人 | ココン/棒イベント依存を整理 |
| `tetsugakusha` | 哲学 | 意味不明すぎる発言を減らす |

## フラナ

`src/sim/npcs.ts` の `FURANA_*` が正本。

| プール | 用途 | M2.1 方針 |
|---|---|---|
| `FURANA_LINES_IDLE` | 普段 | 継続 |
| `FURANA_LINES_HURT` | プレイヤーに殴られる | 継続 |
| `FURANA_LINES_ANGRY` | 機嫌悪い | 継続、機嫌と同期 |
| `FURANA_LINES_HATE` | 最悪状態 | 継続、発火頻度注意 |
| `FURANA_LINES_THROW` | 投げる | 継続 |
| `FURANA_LINES_HAPPY` | 機嫌良い | 機嫌悪い時に出さない |
| `FURANA_LINES_DEATH_REACTION` | ちびわふ死亡反応 | 要棚卸し |
| `FURANA_LINES_WEIRD_DEATH` | 変な死に方 | 継続 |

修正候補:

- `まもりんがあるわふ…` は追悼としては弱い。死因や状況に紐づく言い換えを検討
- 音頭由来の mood 変動 / 発言は削除予定
- スズ / ココンに任せていた反応をフラナへ寄せすぎない。近くのちびわふや event log に分散する

## 廃止予定 NPC

### スズ

廃止予定。点呼/数える役割は HUD / event log へ移す。
既存 `SUZU_*` は migration まで legacy 扱い。

### ココン

廃止予定。いじめ/棒/ボコの役割は trait 反応へ移す。
新規死因や発言でココン依存を増やさない。

### ルー

廃止予定。無口枠は `mukuchi` trait で表現する。

## 死因テンプレート

`src/sim/deaths.ts` が正本。

優先修正候補:

| 死因 | 問題 | 方針 |
|---|---|---|
| `ondo` | くそざこ音頭廃止予定 | legacy death dex に残し、新規発火停止 |
| `taiko_crush` / `taiko_tobikomi` | やぐら/音頭系に依存 | 廃止または別イベントへ置換 |
| `cocoon_abuse` | ココン廃止予定 | legacy 化 |
| `suzu_kazoe_shikujiri` | スズ廃止予定 | legacy 化 |
| `fatigue_death` | 寒冷 HP ドレインでも使われる | 凍傷/低体温の専用死因を検討 |
| `bridge` / `mudriver` | 旧泥川前提が残る | `isSea` / 水位 / 海辺表現へ整理 |
| `philosophy` / `tetsugakusha_shoushitsu` | 面白いが状況因果が弱い | 発火条件を trait + 状態へ限定 |

## 地形編集リアクション

`src/main.ts` の `EDIT_LINES`。

| Kind | 状態 | 方針 |
|---|---|---|
| `ramp` | 良い | 道開通時の達成感を強化 |
| `flatten` | 良い | 作業/整地感を強める |
| `smooth` | 良い | 「なめらか」表現は自由斜面に見えないよう注意 |
| `channel` | 良い | 水位リスクの警告発言を増やす |

追加候補:

- path failed: `そこいけないわふ`, `がけこわいわふ`
- road opened: `みちができたわふ！`
- food shortage: `ごはんどこわふ`, `はたけまでいくわふ`
- camera / UI ではなく世界イベントにだけ発言させる

## 次の整理作業

1. `ondo` / スズ / ココン / ルー依存セリフを grep して legacy 候補へ移す
2. フラナ死亡反応を死因カテゴリ別に分ける
3. 食料、水、崖、建設、道開通の情報セリフを増やす
4. 将来 `scripts/generate-dialogue-catalog.ts` を作り、この文書を自動生成できるようにする

