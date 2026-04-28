# Script Catalog

くそざこ村の実行コマンド一覧。Claude / Codex が作業前後に使う標準コマンドをここに集約する。

## npm scripts

| 目的 | コマンド | 使うタイミング |
|---|---|---|
| 開発サーバ | `npm run dev` | 手元でプレイ確認する |
| 型チェック | `npm run typecheck` | ほぼ全変更後 |
| 本番ビルド | `npm run build` | レビュー前 / push 前 |
| preview server | `npm run preview` | build 後の確認 |
| unit / smoke tests | `npm run test` | A* / elevAt / hydrology / undo の回帰確認 |
| headless sim | `npm run sim` | バランス、長時間クラッシュ、死因分布確認 |

## 直接実行する検証

| 目的 | コマンド |
|---|---|
| 60 分 sim | `npx tsx scripts/sim.ts` |
| 任意コードの小検証 | `npx tsx -e "import { createWorld, tickWorld } from './src/sim/world.ts'; const w=createWorld('standard'); for(let i=0;i<1200;i++) tickWorld(w, 1/20); console.log(w.totalDeaths)"` |
| TypeScript 単独確認 | `npx tsc --noEmit` |

## 推奨チェック順

通常のコード変更:

```bash
npm run typecheck
npm run test
npm run build
```

sim ルール、食料、死因、天気、地形、水流を触った場合:

```bash
npm run typecheck
npm run test
npm run sim
npm run build
```

UI / Three.js 表示を触った場合:

```bash
npm run typecheck
npm run build
npm run dev
```

その後ブラウザで以下を手動確認する。

- 最遠景で海/画面端が破綻しない
- 盛る/削る/坂道化/水路が見た目に反映される
- カメラ pan/zoom/プリセットが入力と競合しない
- UI が 1280x720 で重ならない

## asset / docs 関連

現時点では正式な npm script はない。

| 作業 | 現状 |
|---|---|
| terrain atlas 処理 | 手動生成済み。`public/terrain/sigma8_terrain_atlas_v1_processed.png` が runtime 正本 |
| dialogue catalog 生成 | 未自動化。`docs/DIALOGUE-CATALOG.md` を手動更新 |
| props 生成 | ChatGPT サブスク版 UI で生成、検品後に `public/terrain/props/` へ保存 |
| 工事ポーズ生成 | ChatGPT サブスク版 UI で生成、検品後に `public/chibiwafu/` へ保存 |

将来追加候補:

```json
{
  "scripts": {
    "docs:dialogue": "tsx scripts/generate-dialogue-catalog.ts",
    "assets:atlas": "tsx scripts/process-terrain-atlas.ts"
  }
}
```

## Git 作業の注意

- 未追跡の `mockup.html` / `progress.md` はユーザー作業の可能性があるため、明示指示なしに stage しない
- ブランチを荒らしたくない場合は `codex/` prefix で作業 branch を切る
- docs だけの変更でも `npm run typecheck` は不要。ただしコード参照を変えた場合は実行する

