import { createRNG, hashSeed } from '../../rng';
import type { Biome } from '../../types';
import type { LandmarkZone } from './types';

/**
 * Fill the biome map using priority-based rules.
 *
 * Priority order:
 *  1. ocean mask → 'water'
 *  2. mountain mask → 'rocky_mountain' / 'alpine'
 *  3. river / lake → 'river' / 'lake'
 *  4. landmark zones → fixed biome per zone type
 *  5. foothills band (south of mountains) → 'forest'
 *  6. southern plains → 'plains' base
 *  7. rain-shadow / eastern dry zone → 'desert' / 'steppe'
 *  8. remaining → noise-based fill for variety
 */
export function buildBiomeMap(
  seed: number,
  width: number,
  height: number,
  oceanMask: boolean[][],
  mountainMask: boolean[][],
  riverMask: boolean[][],
  lakeMask: boolean[][],
  landmarkZones: LandmarkZone[],
): Biome[][] {
  const rng = createRNG(hashSeed(seed, 0xB10E5));
  const map: Biome[][] = [];
  for (let y = 0; y < height; y++) {
    map[y] = new Array<Biome>(width).fill('plains');
  }

  // --- 1. Ocean ---
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (oceanMask[y][x]) map[y][x] = 'water';
    }
  }

  // --- 2. Mountains ---
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mountainMask[y][x] && !oceanMask[y][x]) {
        // Top portion = alpine, rest = rocky_mountain
        map[y][x] = y < height * 0.15 ? 'alpine' : 'rocky_mountain';
      }
    }
  }

  // --- 3. Rivers & lakes ---
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (lakeMask[y][x] && !oceanMask[y][x]) map[y][x] = 'lake';
      if (riverMask[y][x] && !oceanMask[y][x] && !lakeMask[y][x]) map[y][x] = 'river';
    }
  }

  // --- 4. Landmark zones ---
  // Build a lookup for quick access
  const landmarkMap = new Map<string, LandmarkZone['type']>();
  for (const zone of landmarkZones) {
    for (const cell of zone.cells) {
      const key = `${cell.x},${cell.y}`;
      // Don't override water/mountain/river/lake
      if (
        !oceanMask[cell.y][cell.x] &&
        !mountainMask[cell.y][cell.x] &&
        !riverMask[cell.y][cell.x] &&
        !lakeMask[cell.y][cell.x]
      ) {
        landmarkMap.set(key, zone.type);
      }
    }
  }

  for (const [key, type] of landmarkMap) {
    const [xs, ys] = key.split(',');
    const x = parseInt(xs, 10);
    const y = parseInt(ys, 10);
    if (type === 'dense_forest') map[y][x] = 'dense_forest';
    else if (type === 'special') map[y][x] = 'special';
    else if (type === 'swamp') map[y][x] = 'swamp';
  }

  // --- 5. Foothills band (south of mountain spine) → forest ---
  // Find southernmost mountain row per column, paint 3-6 rows of forest
  for (let x = 0; x < width; x++) {
    let lastMtnY = -1;
    for (let y = 0; y < height; y++) {
      if (mountainMask[y][x]) lastMtnY = y;
    }
    if (lastMtnY < 0) continue;
    const bandSize = 3 + Math.floor(rng() * 4);
    for (let dy = 1; dy <= bandSize; dy++) {
      const ny = lastMtnY + dy;
      if (ny >= height) break;
      if (map[ny][x] === 'plains') {
        map[ny][x] = 'forest';
      }
    }
  }

  // --- 6. Beach along ocean edges ---
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (map[y][x] !== 'water') continue;
      // Check if any neighbor is non-water land
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const nb = map[ny][nx];
          if (nb !== 'water' && nb !== 'river' && nb !== 'lake' && nb !== 'beach') {
            // The land neighbor gets a beach if it's plains and adjacent to water
            if (map[ny][nx] === 'plains' && rng() < 0.5) {
              map[ny][nx] = 'beach';
            }
          }
        }
      }
    }
  }

  // --- 7. Rain-shadow desert/steppe (eastern side) ---
  // Assume winds from west: east side of mountains has less moisture
  const desertBand = Math.floor(width * 0.7);
  for (let y = Math.floor(height * 0.35); y < height - 3; y++) {
    for (let x = desertBand; x < width; x++) {
      if (map[y][x] === 'plains') {
        const noise = rng();
        if (noise < 0.15) {
          map[y][x] = 'desert';
        } else if (noise < 0.35) {
          map[y][x] = 'steppe';
        }
      }
    }
  }

  // --- 8. Scatter some additional forest patches ---
  for (let y = Math.floor(height * 0.3); y < height - 3; y++) {
    for (let x = 2; x < width; x++) {
      if (map[y][x] === 'plains' && rng() < 0.12) {
        map[y][x] = 'forest';
      }
    }
  }

  return map;
}
