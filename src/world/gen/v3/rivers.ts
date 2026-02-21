import { createRNG, hashSeed } from '../../rng';

export type RiverResult = {
  riverMask: boolean[][];
  lakeMask: boolean[][];
  mainRiverPath: { x: number; y: number }[];
};

/**
 * Generate rivers flowing from mountains to ocean.
 *
 * Main river: starts from mountain spine, flows south/southwest in
 * gentle S-curves to reach the bottom or left ocean border.
 * A lake is placed mid-river.
 * 1-2 tributary rivers may also be generated.
 */
export function generateRivers(
  seed: number,
  width: number,
  height: number,
  oceanMask: boolean[][],
  mountainMask: boolean[][],
): RiverResult {
  const rng = createRNG(hashSeed(seed, 0xB1BEB));
  const riverMask: boolean[][] = [];
  const lakeMask: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    riverMask[y] = new Array(width).fill(false);
    lakeMask[y] = new Array(width).fill(false);
  }

  // Find mountain cells to start rivers from
  const mountainCells: { x: number; y: number }[] = [];
  for (let y = 0; y < Math.floor(height * 0.4); y++) {
    for (let x = 0; x < width; x++) {
      if (mountainMask[y][x]) mountainCells.push({ x, y });
    }
  }

  if (mountainCells.length === 0) {
    return { riverMask, lakeMask, mainRiverPath: [] };
  }

  // Helper: trace a river path with S-curve from start towards ocean
  function traceRiver(
    startX: number,
    startY: number,
    targetSouth: boolean,
  ): { x: number; y: number }[] {
    const path: { x: number; y: number }[] = [];
    let cx = startX;
    let cy = startY;
    const maxSteps = width + height;

    // S-curve parameters
    const amplitude = 3 + Math.floor(rng() * 5);
    const freq = 0.08 + rng() * 0.1;
    const phase = rng() * Math.PI * 2;

    for (let step = 0; step < maxSteps; step++) {
      if (cx < 0 || cx >= width || cy < 0 || cy >= height) break;
      if (oceanMask[cy][cx]) {
        path.push({ x: cx, y: cy });
        break;
      }

      path.push({ x: cx, y: cy });

      if (targetSouth) {
        // Flow mostly south with S-curve horizontal drift
        cy += 1;
        const drift = Math.sin(step * freq + phase) * amplitude;
        const driftInt = Math.round(drift * 0.3);
        cx = Math.max(2, Math.min(width - 1, cx + driftInt));
      } else {
        // Flow mostly southwest
        cy += (rng() < 0.6) ? 1 : 0;
        cx -= 1;
        const drift = Math.sin(step * freq + phase) * amplitude * 0.5;
        cx = Math.max(0, Math.min(width - 1, cx + Math.round(drift * 0.2)));
      }

      // Small random jitter
      if (rng() < 0.3) cx += (rng() < 0.5 ? 1 : -1);
      cx = Math.max(0, Math.min(width - 1, cx));
      cy = Math.max(0, Math.min(height - 1, cy));
    }

    return path;
  }

  // --- Main river ---
  // Pick a start from roughly center-x of mountain range
  const sortedByX = [...mountainCells].sort((a, b) => a.x - b.x);
  const midIdx = Math.floor(sortedByX.length * (0.3 + rng() * 0.4));
  const mainStart = sortedByX[midIdx];

  // Find the southern edge of the mountain at this x
  let startY = mainStart.y;
  for (let y = mainStart.y; y < height; y++) {
    if (!mountainMask[y][mainStart.x]) {
      startY = y;
      break;
    }
  }

  const mainPath = traceRiver(mainStart.x, startY, true);

  // Paint main river (width 1-2)
  for (const pt of mainPath) {
    riverMask[pt.y][pt.x] = true;
    // Occasionally widen
    if (rng() < 0.3 && pt.x + 1 < width) riverMask[pt.y][pt.x + 1] = true;
  }

  // --- Lake mid-river ---
  if (mainPath.length > 8) {
    const lakeCenter = mainPath[Math.floor(mainPath.length * (0.35 + rng() * 0.25))];
    const lakeR = 2 + Math.floor(rng() * 2);
    for (let dy = -lakeR; dy <= lakeR; dy++) {
      for (let dx = -lakeR; dx <= lakeR; dx++) {
        if (dx * dx + dy * dy > lakeR * lakeR) continue;
        const nx = lakeCenter.x + dx;
        const ny = lakeCenter.y + dy;
        if (nx >= 2 && nx < width && ny >= 0 && ny < height) {
          if (!oceanMask[ny][nx] && !mountainMask[ny][nx]) {
            lakeMask[ny][nx] = true;
            riverMask[ny][nx] = false; // lake replaces river
          }
        }
      }
    }
  }

  // --- Tributary rivers (1-2) ---
  const numTribs = 1 + Math.floor(rng() * 2);
  for (let t = 0; t < numTribs; t++) {
    const tribStart = mountainCells[Math.floor(rng() * mountainCells.length)];
    let sy = tribStart.y;
    for (let y = tribStart.y; y < height; y++) {
      if (!mountainMask[y][tribStart.x]) {
        sy = y;
        break;
      }
    }

    const goSouth = rng() < 0.6;
    const tribPath = traceRiver(tribStart.x, sy, goSouth);

    for (const pt of tribPath) {
      if (!lakeMask[pt.y][pt.x]) {
        riverMask[pt.y][pt.x] = true;
      }
    }
  }

  return { riverMask, lakeMask, mainRiverPath: mainPath };
}
