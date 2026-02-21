import { createRNG, hashSeed } from '../../rng';

/**
 * Build the ocean mask with fixed borders and organic coastline.
 *
 * Rules:
 * - y == height-1 (bottom row) → always ocean
 * - x == 0 (left column) → always ocean
 * - Organic inlets/peninsulas up to ~2-8 cells deep along borders
 * - Everything else starts as land (filled later by biomes)
 */
export function buildOceanMask(
  seed: number,
  width: number,
  height: number,
): boolean[][] {
  const mask: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    mask[y] = new Array(width).fill(false);
  }

  // 1. Fixed borders: bottom row + left column
  for (let x = 0; x < width; x++) mask[height - 1][x] = true;
  for (let y = 0; y < height; y++) mask[y][0] = true;

  // Also set 2nd-to-last row and 2nd column partially ocean for coast depth
  for (let x = 0; x < width; x++) mask[height - 2][x] = true;
  for (let y = 0; y < height; y++) mask[y][1] = true;

  const rng = createRNG(hashSeed(seed, 0x0CEA));

  // 2. Bottom coast — inlets going upward
  const numBottomInlets = 8 + Math.floor(rng() * 8);
  for (let i = 0; i < numBottomInlets; i++) {
    const startX = 3 + Math.floor(rng() * (width - 6));
    const depth = 2 + Math.floor(rng() * 6);
    const spread = 1 + Math.floor(rng() * 3);
    for (let dy = 0; dy < depth; dy++) {
      const y = height - 3 - dy;
      if (y < height * 0.4) break;
      const widen = Math.max(1, spread - Math.floor(dy * 0.5));
      for (let dx = -widen; dx <= widen; dx++) {
        const nx = startX + dx;
        if (nx >= 2 && nx < width) {
          mask[y][nx] = true;
        }
      }
    }
  }

  // 3. Left coast — inlets going rightward
  const numLeftInlets = 6 + Math.floor(rng() * 6);
  for (let i = 0; i < numLeftInlets; i++) {
    const startY = 3 + Math.floor(rng() * (height - 8));
    const depth = 2 + Math.floor(rng() * 5);
    const spread = 1 + Math.floor(rng() * 2);
    for (let dx = 0; dx < depth; dx++) {
      const x = 2 + dx;
      if (x >= width * 0.4) break;
      const widen = Math.max(1, spread - Math.floor(dx * 0.5));
      for (let dy = -widen; dy <= widen; dy++) {
        const ny = startY + dy;
        if (ny >= 0 && ny < height - 2) {
          mask[ny][x] = true;
        }
      }
    }
  }

  // 4. Peninsula — land pushing into ocean (fills some ocean cells back to false)
  const numPeninsulas = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < numPeninsulas; i++) {
    if (rng() < 0.5) {
      // Bottom peninsula (going down into bottom ocean)
      const startX = 5 + Math.floor(rng() * (width - 10));
      const len = 2 + Math.floor(rng() * 3);
      const w = 1 + Math.floor(rng() * 2);
      for (let dy = 0; dy < len; dy++) {
        const y = height - 3 - Math.floor(rng() * 3) + dy;
        if (y < height * 0.5 || y >= height) continue;
        for (let dx = -w; dx <= w; dx++) {
          const nx = startX + dx;
          if (nx >= 2 && nx < width) {
            mask[y][nx] = false;
          }
        }
      }
    } else {
      // Left peninsula (going left into left ocean)
      const startY = 4 + Math.floor(rng() * (height - 10));
      const len = 2 + Math.floor(rng() * 2);
      const w = 1;
      for (let dx = 0; dx < len; dx++) {
        const x = 2 + Math.floor(rng() * 2) - dx;
        if (x < 0 || x >= width * 0.3) continue;
        for (let dy = -w; dy <= w; dy++) {
          const ny = startY + dy;
          if (ny >= 0 && ny < height - 2) {
            mask[ny][x] = false;
          }
        }
      }
    }
  }

  // Re-enforce hard borders (always ocean)
  for (let x = 0; x < width; x++) mask[height - 1][x] = true;
  for (let y = 0; y < height; y++) mask[y][0] = true;

  return mask;
}
