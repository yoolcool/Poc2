import { buildOceanMask } from './oceanMask';
import { generateNorthMountainSpine } from './spine';
import { generateRivers } from './rivers';
import { generateLandmarks } from './landmarks';
import { buildBiomeMap } from './biomes';
import type { WorldGenV3Config, WorldGenV3Result } from './types';

/**
 * Run the full v3 structure-driven world generation pipeline.
 *
 * Steps:
 *  1. Ocean mask — fixed borders + organic coastline
 *  2. Mountain spine — polyline across northern zone
 *  3. Rivers & lakes — S-curve from mountains to ocean
 *  4. Landmarks — dense forest, special zone, swamp
 *  5. Biome fill — priority-based classification
 *  6. Synthetic height/moisture for Overworld cell compat
 */
export function runWorldGenV3(
  seed: number,
  config: WorldGenV3Config,
): WorldGenV3Result {
  const { width, height } = config;

  // 1. Ocean mask
  const oceanMask = buildOceanMask(seed, width, height);

  // 2. Mountain spine
  const { mountainMask } = generateNorthMountainSpine(seed, width, height, oceanMask);

  // 3. Rivers & lakes
  const { riverMask, lakeMask, mainRiverPath } = generateRivers(
    seed, width, height, oceanMask, mountainMask,
  );

  // 4. Landmarks
  const landmarkZones = generateLandmarks(
    seed, width, height, oceanMask, riverMask, mountainMask, lakeMask, mainRiverPath,
  );

  // 5. Biome fill
  const biomeMap = buildBiomeMap(
    seed, width, height, oceanMask, mountainMask, riverMask, lakeMask, landmarkZones,
  );

  // 6. Synthetic height & moisture for OverworldCell compatibility
  const heightMap: number[][] = [];
  const moisture: number[][] = [];
  for (let y = 0; y < height; y++) {
    heightMap[y] = new Array(width);
    moisture[y] = new Array(width);
    for (let x = 0; x < width; x++) {
      const b = biomeMap[y][x];
      // Approximate height from biome
      if (b === 'water') heightMap[y][x] = 0.15;
      else if (b === 'alpine') heightMap[y][x] = 0.92;
      else if (b === 'rocky_mountain') heightMap[y][x] = 0.80;
      else if (b === 'river' || b === 'lake') heightMap[y][x] = 0.30;
      else if (b === 'beach') heightMap[y][x] = 0.28;
      else if (b === 'swamp') heightMap[y][x] = 0.32;
      else if (b === 'desert' || b === 'steppe') heightMap[y][x] = 0.45;
      else if (b === 'forest' || b === 'dense_forest') heightMap[y][x] = 0.50;
      else heightMap[y][x] = 0.42; // plains, special, etc.

      // Approximate moisture
      if (b === 'water' || b === 'river' || b === 'lake') moisture[y][x] = 0.9;
      else if (b === 'swamp') moisture[y][x] = 0.75;
      else if (b === 'forest' || b === 'dense_forest') moisture[y][x] = 0.65;
      else if (b === 'plains') moisture[y][x] = 0.45;
      else if (b === 'desert') moisture[y][x] = 0.10;
      else if (b === 'steppe') moisture[y][x] = 0.25;
      else moisture[y][x] = 0.40;
    }
  }

  return {
    biomeMap,
    oceanMask,
    mountainMask,
    riverMask,
    lakeMask,
    landmarkZones,
    heightMap,
    moisture,
  };
}
