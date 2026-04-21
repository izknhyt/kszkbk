# くそざこ村 Σ-4-proto — Three.js Terrain Prototype

捨てプロト。Σ-4 本実装の GO/NO-GO を判断する 5 検証を実行する独立ページ。

## 起動

```sh
npm run dev
# → http://localhost:5173/prototypes/three-terrain/
```

## 検証項目

| # | 項目 |
|---|---|
| ① | PlaneGeometry displace 60fps |
| ② | InstancedMesh 200 sprite 1 draw call |
| ③ | GPU picking（クリックしてタイル ID が出れば OK） |
| ④ | camera.project DOM 吹き出し同期 |
| ⑤ | 既存 PNG billboard 見え方（目視） |

## 操作

- **beginner / standard / hell** ボタン：地形切替
- **+/−** ボタン：3 段階 discrete ズーム
- **📷** ボタン：PNG スクショ保存
- **クリック**：GPU picking テスト（③）、ちびわふクリックで吹き出し（④）

## 結果

→ `REPORT.md` を参照。

## ファイル

| ファイル | 役割 |
|---|---|
| `index.html` | スタンドアロン HTML（UI レイアウト） |
| `main.ts` | Three.js シーン全体（673 行、self-contained） |
| `REPORT.md` | 5 項目の計測結果と GO/NO-GO 結論 |
| `screenshots/` | 地形スクショ 3 枚 |
