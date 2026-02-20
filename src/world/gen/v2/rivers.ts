import { createRNG, hashSeed } from '../../rng';

const DIR8: [number, number][] = [
  [-1, -1], [0, -1], [1, -1],
  [-1,  0],          [1,  0],
  [-1,  1], [0,  1], [1,  1],
];

/**
 * Generate rivers and lakes from a heightmap.
 *
 * Algorithm:
 *  1. Compute flow direction (D8 — steepest descent to lowest neighbour).
 *  2. Break flat areas / local minima with tiny deterministic noise so
 *     water always has *somewhere* to go.
 *  3. Accumulate flow by processing cells highest-first.
 *  4. River = land cell with accumulation ≥ threshold.
 *  5. Lake  = land cell that is a local minimum (flowDir = none).
 */
export function generateRiverMap(
  heightMap: number[][],
  seaLevel: number,
  seed: number,
): { river: boolean[][]; lake: boolean[][] } {
  const h = heightMap.length;
  const w = heightMap[0].length;

  // ---- Effective height: original + tiny noise to break ties ------------
  const rng = createRNG(hashSeed(seed, 0xf10d));
  const eff: number[][] = [];
  for (let y = 0; y < h; y++) {
    eff[y] = [];
    for (let x = 0; x < w; x++) {
      eff[y][x] = heightMap[y][x] + rng() * 0.0001;
    }
  }

  // ---- Flow direction (D8): each land cell → lowest neighbour ----------
  // [dx, dy] or null if ocean / already at edge
  const flowDx: Int8Array = new Int8Array(w * h);
  const flowDy: Int8Array = new Int8Array(w * h);
  const isOcean: Uint8Array = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (heightMap[y][x] < seaLevel) {
        isOcean[idx] = 1;
        continue;
      }
      let bestH = eff[y][x];
      let bx = 0;
      let by = 0;
      for (const [dx, dy] of DIR8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        if (eff[ny][nx] < bestH) {
          bestH = eff[ny][nx];
          bx = dx;
          by = dy;
        }
      }
      flowDx[idx] = bx;
      flowDy[idx] = by;
    }
  }

  // ---- Sort land cells by height (descending) --------------------------
  const sorted: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isOcean[y * w + x]) sorted.push(y * w + x);
    }
  }
  sorted.sort((a, b) => eff[Math.floor(b / w)][b % w] - eff[Math.floor(a / w)][a % w]);

  // ---- Flow accumulation -----------------------------------------------
  const acc = new Float64Array(w * h).fill(1);
  for (const idx of sorted) {
    const dx = flowDx[idx];
    const dy = flowDy[idx];
    if (dx === 0 && dy === 0) continue; // local min / flat
    const x = idx % w;
    const y = Math.floor(idx / w);
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
    acc[ny * w + nx] += acc[idx];
  }

  // ---- Dynamic threshold: target 2–6 main rivers ----------------------
  // Collect all accumulations for land cells, pick a percentile.
  const landAcc: number[] = [];
  for (const idx of sorted) landAcc.push(acc[idx]);
  landAcc.sort((a, b) => b - a);

  // We want roughly 3-8% of land cells to be river tiles (visible network).
  const targetRiverFraction = 0.05;
  const targetIdx = Math.min(
    Math.floor(landAcc.length * targetRiverFraction),
    landAcc.length - 1,
  );
  const threshold = Math.max(landAcc[targetIdx] || 8, 8);

  // ---- Mark rivers and lakes -------------------------------------------
  const river: boolean[][] = Array.from({ length: h }, () => new Array(w).fill(false));
  const lake: boolean[][] = Array.from({ length: h }, () => new Array(w).fill(false));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (isOcean[idx]) continue;

      if (acc[idx] >= threshold) {
        river[y][x] = true;
      }

      // Local minimum that doesn't flow anywhere → lake
      if (flowDx[idx] === 0 && flowDy[idx] === 0) {
        lake[y][x] = true;
        // Expand lake slightly — fill immediate low neighbours
        for (const [dx, dy] of DIR8) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          if (!isOcean[ny * w + nx] && eff[ny][nx] < eff[y][x] + 0.02) {
            lake[ny][nx] = true;
          }
        }
      }
    }
  }

  // ---- Ensure rivers connect to ocean -----------------------------------
  // Trace each river cell downstream; if it ends at ocean, keep it.
  // Otherwise mark the endpoint chain as lake and keep the river.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!river[y][x]) continue;
      // Trace downstream to check ocean connectivity
      let cx = x;
      let cy = y;
      let steps = 0;
      while (steps < w + h) {
        const idx = cy * w + cx;
        if (isOcean[idx]) break; // reached ocean ✓
        const dx = flowDx[idx];
        const dy = flowDy[idx];
        if (dx === 0 && dy === 0) {
          // Dead end — mark as lake
          lake[cy][cx] = true;
          break;
        }
        cx += dx;
        cy += dy;
        if (cx < 0 || cx >= w || cy < 0 || cy >= h) break; // map edge = ocean
        steps++;
      }
    }
  }

  return { river, lake };
}
