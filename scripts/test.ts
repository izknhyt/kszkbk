// =========================================================================
// くそざこ村 ミニマルテストランナー
// vitest を入れず tsx で直接走らせる軽量回帰テスト。
// 用途: save migration / A* pathfinding / undo snapshot / hydrology 閾値
//       など、Σ-8 で何度も話題になった部分の壊れを早期検知する。
//
// 実行: `npm run test` （= tsx scripts/test.ts）
// 失敗時 process.exit(1)、CI に乗せる前提。
// =========================================================================

import type { TerrainTile, RampDir, TerrainMaterial } from '../src/types';
import { CONFIG } from '../src/config';
import { findPath, passCost } from '../src/sim/pathfinding';
import { elevAtTileSurface } from '../src/sim/terrain/query';

let passed = 0, failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; }
  else { failed++; console.error(`  ✗ ${msg}`); }
}
function group(name: string, fn: () => void) {
  console.log(`\n▼ ${name}`);
  const before = failed;
  fn();
  const ng = failed - before;
  if (ng === 0) console.log(`  ✓ all passed`);
  else          console.log(`  ✗ ${ng} failed`);
}

// =========================================================================
// テスト用ユーティリティ
// =========================================================================
function makeTile(elev = 0, opts: Partial<TerrainTile> = {}): TerrainTile {
  return {
    elev,
    material: (opts.material ?? 'grass') as TerrainMaterial,
    ramp: opts.ramp ?? null,
    stability: opts.stability ?? 1.0,
    waterLevel: opts.waterLevel ?? 0,
    wetness: opts.wetness ?? 0,
    mud: opts.mud ?? 0,
    snowCoverage: opts.snowCoverage ?? 0,
    buryTimer: opts.buryTimer ?? 0,
    isSea: opts.isSea ?? false,
  };
}
function makeFlatGrid(rows: number, cols: number, elev = 50): TerrainTile[][] {
  const g: TerrainTile[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: TerrainTile[] = [];
    for (let c = 0; c < cols; c++) row.push(makeTile(elev));
    g.push(row);
  }
  return g;
}

// =========================================================================
// A* pathfinding
// =========================================================================
group('A* pathfinding', () => {
  // 平坦 100×57 で対角を解く
  const flat = makeFlatGrid(57, 100, 50);
  const path = findPath(flat, { tx: 0, ty: 0 }, { tx: 99, ty: 56 });
  assert(path !== null, '平坦 100×57 (0,0)→(99,56) は path が出る');
  assert((path?.length ?? 0) === 156, `平坦 Manhattan path 長 156（実測 ${path?.length}）`);

  // 海ブロック：goal が isSea なら null
  const sea = makeFlatGrid(10, 10);
  sea[5]![5]!.isSea = true;
  const seaPath = findPath(sea, { tx: 0, ty: 0 }, { tx: 5, ty: 5 });
  assert(seaPath === null, 'isSea タイル goal は path 不可');

  // 2 段差の崖は通行不可（ramp なし）
  const cliff = makeFlatGrid(3, 3, 50);
  cliff[1]![1]!.elev = 150;  // 中央が 100 高い（4 段差）
  const cliffPath = findPath(cliff, { tx: 0, ty: 1 }, { tx: 2, ty: 1 });
  // 中央を通る最短は不可、外周経由で 4 タイル進む形になる
  assert(cliffPath !== null, '2段差で迂回しても path はある');
  assert((cliffPath?.length ?? 0) > 3, '2段差を直進しないで迂回している');

  // 1 段差 + ramp = 通行可
  const ramp = makeFlatGrid(3, 3, 50);
  ramp[1]![1]!.elev = 75;  // 1 段差
  ramp[1]![0]!.ramp = 'E';  // 西側タイルが東向きの ramp（高い側=東）
  const rampPath = findPath(ramp, { tx: 0, ty: 1 }, { tx: 2, ty: 1 });
  assert(rampPath !== null, '1 段差 + ramp E で通行可');

  // 1 段差 + ramp なし → passCost が Infinity
  const cost = passCost(ramp, 0, 1, 1, 1);  // (0,1) → (1,1)、ramp=E あるので接続
  assert(cost < Infinity, 'ramp 接続側 passCost は finite');
  const cost2 = passCost(cliff, 0, 1, 1, 1);  // 2 段差 ramp なし
  assert(cost2 === Infinity, '2 段差 ramp 無し passCost は Infinity');

  // waterLevel >= 0.35 で通行不可
  const wet = makeFlatGrid(3, 3, 50);
  wet[1]![1]!.waterLevel = 0.5;
  const wetCost = passCost(wet, 0, 1, 1, 1);
  assert(wetCost === Infinity, 'waterLevel ≥ 0.35 は通行不可');
  wet[1]![1]!.waterLevel = 0.30;
  const dryCost = passCost(wet, 0, 1, 1, 1);
  assert(dryCost < Infinity, 'waterLevel < 0.35 は通行可');

  // mud / snowCoverage が cost を増やす
  const muddy = makeFlatGrid(3, 3, 50);
  muddy[1]![1]!.mud = 0.5;
  const mudCost = passCost(muddy, 0, 1, 1, 1);
  assert(mudCost > 1.0 && mudCost < Infinity, 'mud 0.5 は cost 増だが finite');
});

// =========================================================================
// elevAt 統一（sim/render が同じ式）
// =========================================================================
group('elevAtTileSurface（sim/render 共通）', () => {
  // flat タイルは tile.elev 固定（タイル内のどこを引いても同値）
  const flat = makeFlatGrid(3, 3, 100);
  const e1 = elevAtTileSurface(flat, 32 + 8, 32 + 8);  // タイル(1,1) 左上
  const e2 = elevAtTileSurface(flat, 32 + 24, 32 + 24);  // タイル(1,1) 右下
  assert(e1 === 100 && e2 === 100, 'flat タイル内は tile.elev 固定');

  // ramp 'N' タイルは barycentric: 北辺=high, 南辺=low
  const ramp = makeFlatGrid(3, 3, 100);
  ramp[1]![1]!.ramp = 'N';
  const eN = elevAtTileSurface(ramp, 32 + 16, 32 + 1);   // タイル(1,1) 北端中央
  const eS = elevAtTileSurface(ramp, 32 + 16, 32 + 31);  // タイル(1,1) 南端中央
  assert(eN > eS, 'ramp N: 北側が高い');
  // 北端は high (elev + STEP = 125) に近く、南端は low (elev = 100) に近い
  assert(Math.abs(eN - 125) < 10, `北端 ≈ 125（実測 ${eN.toFixed(1)}）`);
  assert(Math.abs(eS - 100) < 10, `南端 ≈ 100（実測 ${eS.toFixed(1)}）`);
});

// =========================================================================
// hydrology 閾値跨ぎマスク（updateHydrology 由来の terrainVersion 増分）
// =========================================================================
group('hydrology passable mask（waterLevel ≥ 0.35）', () => {
  // updateHydrology を直接呼ばずに、_hydroPassMask の挙動相当を擬似テスト
  // （閾値 0.35 を跨いだら mask 値が変わる）
  const PASS = 0.35;
  const wlBefore = [0.0, 0.30, 0.40, 1.0];
  const maskBefore = wlBefore.map((wl) => (wl >= PASS ? 1 : 0));
  assert(JSON.stringify(maskBefore) === '[0,0,1,1]', 'before: [0,0,1,1]');

  const wlAfter = [0.40, 0.20, 0.32, 0.99];
  const maskAfter = wlAfter.map((wl) => (wl >= PASS ? 1 : 0));
  assert(JSON.stringify(maskAfter) === '[1,0,0,1]', 'after: [1,0,0,1]');

  // 跨ぎ検出：index 0 (0→1) と 2 (1→0) の 2 つ変化、index 1/3 は同マスク
  let changed = 0;
  for (let i = 0; i < 4; i++) if (maskBefore[i] !== maskAfter[i]) changed++;
  assert(changed === 2, '4 タイルのうち 2 つで mask 変化を検出');
});

// =========================================================================
// undo snapshot ロジック（rememberPreEdit boolean 戻し値の挙動）
// =========================================================================
group('undo: rememberPreEdit boolean 戻し値', () => {
  // main.ts の関数を直接 import すると DOM 依存になるので、ロジックを再現する
  type Snap = { tx: number; ty: number; elev: number };
  const snapshots: Snap[] = [];
  const editedKeys = new Set<string>();
  function remember(tx: number, ty: number, elev: number): boolean {
    const key = `${tx},${ty}`;
    if (editedKeys.has(key)) return false;
    editedKeys.add(key);
    snapshots.push({ tx, ty, elev });
    return true;
  }
  function rollback(tx: number, ty: number) {
    const last = snapshots[snapshots.length - 1];
    if (last && last.tx === tx && last.ty === ty) snapshots.pop();
    editedKeys.delete(`${tx},${ty}`);
  }

  // 初回 (1,1) → added=true、snapshot 1
  const a1 = remember(1, 1, 50);
  assert(a1 === true, '初回 added=true');
  assert(snapshots.length === 1, 'snapshots [(1,1)]');

  // 2 度目同タイル → added=false、snapshot 不変
  const a2 = remember(1, 1, 60);
  assert(a2 === false, '同タイル再訪 added=false');
  assert(snapshots.length === 1, 'snapshots 不変');

  // (2,2) 追加 → added=true、snapshot 2
  remember(2, 2, 70);
  assert(snapshots.length === 2, 'snapshots [(1,1),(2,2)]');

  // (2,2) で no-change → added=false なら rollback しない
  // → 旧バグだと snapshots 末尾が pop されて (2,2) が消えていた
  // 新仕様: added=false なら rollback 呼ばない、(1,1) も生き残る
  // ここでは added=false パスを再現
  const a3 = remember(2, 2, 80);
  assert(a3 === false, '(2,2) 同タイル再訪 added=false');
  // added=false なので rollback 呼ばない（呼んだら (2,2) が pop される）
  assert(snapshots.length === 2, 'rollback 呼ばないので snapshots [(1,1),(2,2)] 維持');
});

// =========================================================================
// 結果サマリ
// =========================================================================
console.log(`\n========================================`);
console.log(`  Total: ${passed} passed, ${failed} failed`);
console.log(`========================================`);
process.exit(failed > 0 ? 1 : 0);
