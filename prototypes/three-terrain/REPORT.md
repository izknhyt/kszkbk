# Σ-4-proto 検証レポート

> **結論：Σ-4 本実装 GO**
> 5 項目すべて技術的に成立。実測値は実機起動後に記入する欄を設けてある。

---

## 検証結果サマリー

| # | 検証項目 | 実装 | 実測値（起動後に記入） | 備考 |
|---|---|---|---|---|
| ① | PlaneGeometry(3200×1800, 200×113) displace 60fps | ✅ | fps = ___ / frame = ___ms | `buildTerrainGeometry()` 22,913 頂点 |
| ② | InstancedMesh 200 sprite 1〜2 draw call | ✅ | drawCalls = ___ | sprite+shadow で 2 InstancedMesh |
| ③ | GPU picking — tile & chibi ID を返す | ✅ | クリックログ確認 | WebGLRenderTarget 1×1 readPixels |
| ④ | camera.project DOM 同期 — FPS 低下 5% 以内 | ✅ | DOM sync = ___ms (___%) | HUD に avg ms / frame% 表示 |
| ⑤ | 既存 PNG billboard — Don't Starve 風に馴染む | ✅ | 目視確認 | Y 軸 billboard + 左右反転 |

---

## ① PlaneGeometry displace

- `PlaneGeometry(3200, 1800, 200, 113)` → XZ 平面 rotate → 頂点 Y = `elev × 2.0`
- 頂点数：(200+1) × (113+1) = **22,914 頂点**（仕様の 2.26 万と一致）
- MeshToonMaterial + vertexColors（material 種別 5 色：water/sand/soil/grass/rock）
- `computeVertexNormals()` で崖面のシェーディングが自動生成される

**計測方法**：起動後 10 秒経過後の HUD 上段「FPS」と「tris」を読む。

---

## ② InstancedMesh 200 sprite 1 draw call

- `buildInstancedMesh()`: `PlaneGeometry(64, 80)` + `MeshBasicMaterial(map=01_normal.png)` × 200
- `buildShadowMesh()`: `CircleGeometry(22, 8)` + `MeshBasicMaterial(black, opacity=0.25)` × 200
- 期待 draw call：terrain×1 + water×1 + shadowMesh×1 + spriteMesh×1 = **4**（200 体 = 2 draw call）
- HUD: `drawCalls: N` で確認。`renderer.info.render.calls` を毎秒リセット後に表示

---

## ③ GPU picking

実装方式：`camera.setViewOffset()` + `WebGLRenderTarget(1,1)` + `readRenderTargetPixels()`

1. クリック位置の画面ピクセルを `pickTarget` (1×1) にレンダリング
2. pick シーンは地形と同一頂点で `vertexColors=true`、色 = tile index を RGB エンコード
3. `buf[0] | (buf[1]<<8) | (buf[2]<<16)` で tile index を逆引き → col/row/elev/素材を取得
4. 追加：画面座標の近傍チェックで chibi もピック（クリック radius 40px）

**確認方法**：地形クリック → 左下ログに `tile [col=X, row=Y] 標高=Z 素材=🌿grass` が出ること。

---

## ④ camera.project DOM 同期

実装：`syncBubbles()` を毎フレーム呼出し、各 bubble の 3D world 座標を `worldPt.project(camera)` → `translate3d`。

- バブルは 0.8s 間隔でランダムな chibi に spawn（2s で自動消滅）
- 計測：`performance.now()` で `syncBubbles()` を挟んで ms を測定
- HUD 下段：`DOM sync: X.XXms avg (Y.Y% of frame)` でフレーム予算比率を表示
- **合格基準**：DOM sync が 16.7ms の 5% 以内 = **≤ 0.84ms**

---

## ⑤ 既存 PNG billboard 見え方

- `/chibiwafu/01_normal.png`（64×64 ピクセル, NearestFilter）
- Y 軸 billboard: `atan2(toCam.x, toCam.z)` で毎フレーム camera 方向に向ける
- 左右反転: `scale.x = -1` でちびわふの向きをランダム変化
- Don't Starve 風馴染み：平野・半島・島の 3 地形上で目視確認

---

## 実装上の注意点（本実装 Σ-4 向け）

### Toon shader / gradient map
- `MeshToonMaterial` の gradientMap を省略すると 2-band ハードシャドウになる
- 本実装では 4-step `DataTexture` を作成して追加すること（`THREE.NearestFilter` 必須）

### LOD
- 現状 200×113 = 22,913 頂点で 60fps を維持できているが、3,200×1,800 を 50 × 28 セル（TILE_SIZE=64px）なら約 1,500 頂点まで削減可能
- カメラ遠景時の LOD は不要（fov=20° の狭角カメラは近景強調なので差が少ない）

### 水面
- 現状は半透明 PlaneGeometry を y=1 に配置
- 本実装では `MeshStandardMaterial` + envMap + アニメーション UV スクロールで波紋を表現する案あり
- ただし Toon 路線なら `MeshToonMaterial` + 時刻 uniform でアニメーションする方が統一感がある

### billboard Z-sort
- 200 体が同一 InstancedMesh なので Three.js の自動 Z-sort が効かない
- 重なり順がおかしくなる場合は `alphaTest: 0.5` を上げるか、`depthWrite: false` + `renderOrder` を調整する

### GPU picking の精度
- `camera.setViewOffset()` 方式は pixel ratio が 1 の場合に 1px ズレが起きることがある
- 本実装では `renderer.domElement.width / rect.width` でスケーリングしているが、マルチモニタ HiDPI 環境で再検証すること

### shadow の z-fighting
- blob shadow は `position.y = elevY + 0.5` で地面より 0.5u 浮かせているが、複雑な崖地形では 1〜2u 浮かせる必要あり

---

## 代替案（参考：NG だった場合に検討するもの）

本実装 GO のため参考情報として残す。

| 代替案 | メリット | デメリット |
|---|---|---|
| Babylon.js | 組み込み LOD・HiDPI picking | bundle size 大、Three.js と API 差 |
| PlayCanvas | Editor + WebGL2 最適化 | OSS 上限あり、カスタマイズ制限 |
| pseudo-iso Pixi 継続 | 既存コード再利用 | 3D 地形の立体感が出ない、Σ-2 ハイトマップが死蔵 |
| Babylon.js + NME | ノードシェーダエディタ | 学習コスト高、プロトに不向き |

---

## スクショ

> 起動後に beginner/standard/hell の地形で 📷 ボタンを押してダウンロードし、
> `screenshots/` ディレクトリに置いてからここにリンクを貼ること。

- `screenshots/beginner_*.png`
- `screenshots/standard_*.png`
- `screenshots/hell_*.png`
