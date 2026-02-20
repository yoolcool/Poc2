import { generateHeightMap } from './height';
import { generateRiverMap } from './rivers';
import { generateBiomeMap } from './climate';
import type { WorldGenV2Config, WorldGenV2Result } from './types';

/**
 * Run the full v2 world generation pipeline.
 *
 * Steps:
 *  1. Heightmap  — continent mask + noise + ridge belts
 *  2. Sea level  — dynamic percentile so land/ocean ratio is stable
 *  3. Rivers     — D8 flow-direction, accumulation, lake detection
 *  4. Climate    — temperature, moisture, rain shadow → biome classification
 */
export function runWorldGenV2(
  seed: number,
  config: WorldGenV2Config,
): WorldGenV2Result {
  const { width, height } = config;

  // 1. Heightmap
  const heightMap = generateHeightMap(seed, width, height);

  // 2. Dynamic sea level — target ~55 % ocean, 45 % land
  let seaLevel: number;
  if (config.seaLevel != null) {
    seaLevel = config.seaLevel;
  } else {
    const all: number[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) all.push(heightMap[y][x]);
    }
    all.sort((a, b) => a - b);
    seaLevel = all[Math.floor(all.length * 0.55)];
  }

  // 3. Rivers & lakes
  const riverMap = generateRiverMap(heightMap, seaLevel, seed);

  // 4. Biome map + moisture field
  const { biomeMap, moisture } = generateBiomeMap(heightMap, riverMap, seaLevel);

  return { heightMap, riverMap, biomeMap, seaLevel, moisture };
}
