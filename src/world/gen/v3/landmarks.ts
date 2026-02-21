import { createRNG, hashSeed } from '../../rng';
import type { LandmarkZone } from './types';

/**
 * Generate 3+ landmark regions:
 * 1. Dense forest / jungle (southern plains)
 * 2. Special zone (purple/corruption/mutation)
 * 3. Swamp / wetland (near river mouth / delta)
 */
export function generateLandmarks(
  seed: number,
  width: number,
  height: number,
  oceanMask: boolean[][],
  riverMask: boolean[][],
  mountainMask: boolean[][],
  lakeMask: boolean[][],
  mainRiverPath: { x: number; y: number }[],
): LandmarkZone[] {
  const rng = createRNG(hashSeed(seed, 0xAA4D));
  const zones: LandmarkZone[] = [];
  const used: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    used[y] = new Array(width).fill(false);
  }

  function isBlocked(x: number, y: number): boolean {
    return (
      x < 0 || x >= width || y < 0 || y >= height ||
      oceanMask[y][x] || mountainMask[y][x] ||
      riverMask[y][x] || lakeMask[y][x] || used[y][x]
    );
  }

  /**
   * Grow a blob by random flood-fill from a seed point.
   */
  function growBlob(
    cx: number,
    cy: number,
    targetSize: number,
  ): { x: number; y: number }[] {
    const cells: { x: number; y: number }[] = [];
    const queue: { x: number; y: number }[] = [{ x: cx, y: cy }];
    const visited = new Set<string>();
    visited.add(`${cx},${cy}`);

    while (cells.length < targetSize && queue.length > 0) {
      // Pick random from queue for organic shape
      const idx = Math.floor(rng() * queue.length);
      const pt = queue[idx];
      queue[idx] = queue[queue.length - 1];
      queue.pop();

      if (isBlocked(pt.x, pt.y)) continue;

      cells.push(pt);
      used[pt.y][pt.x] = true;

      // Add neighbors
      const dirs = [
        { x: 1, y: 0 }, { x: -1, y: 0 },
        { x: 0, y: 1 }, { x: 0, y: -1 },
        { x: 1, y: 1 }, { x: -1, y: -1 },
        { x: 1, y: -1 }, { x: -1, y: 1 },
      ];
      for (const d of dirs) {
        const nx = pt.x + d.x;
        const ny = pt.y + d.y;
        const key = `${nx},${ny}`;
        if (!visited.has(key) && !isBlocked(nx, ny)) {
          visited.add(key);
          queue.push({ x: nx, y: ny });
        }
      }
    }

    return cells;
  }

  // --- 1. Dense forest / jungle (southern half) ---
  const forestY = Math.floor(height * 0.5 + rng() * height * 0.25);
  const forestX = Math.floor(width * 0.3 + rng() * width * 0.4);
  const forestSize = 60 + Math.floor(rng() * 80);
  const forestCells = growBlob(forestX, forestY, forestSize);
  if (forestCells.length > 10) {
    zones.push({ type: 'dense_forest', cells: forestCells });
  }

  // --- 2. Special zone (anywhere non-ocean, non-mountain) ---
  const specY = Math.floor(height * 0.3 + rng() * height * 0.4);
  const specX = Math.floor(width * 0.4 + rng() * width * 0.4);
  const specSize = 30 + Math.floor(rng() * 50);
  const specCells = growBlob(specX, specY, specSize);
  if (specCells.length > 5) {
    zones.push({ type: 'special', cells: specCells });
  }

  // --- 3. Swamp / wetland near river mouth ---
  let swampCX = Math.floor(width * 0.3);
  let swampCY = Math.floor(height * 0.7);

  // Try to place near the end of the main river
  if (mainRiverPath.length > 4) {
    const riverEnd = mainRiverPath[mainRiverPath.length - 3];
    swampCX = riverEnd.x + Math.floor(rng() * 4 - 2);
    swampCY = riverEnd.y - Math.floor(rng() * 4 + 1);
  }

  swampCX = Math.max(3, Math.min(width - 4, swampCX));
  swampCY = Math.max(3, Math.min(height - 5, swampCY));

  const swampSize = 30 + Math.floor(rng() * 40);
  const swampCells = growBlob(swampCX, swampCY, swampSize);
  if (swampCells.length > 5) {
    zones.push({ type: 'swamp', cells: swampCells });
  }

  return zones;
}
