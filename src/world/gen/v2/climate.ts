import type { Biome } from '../../types';

/**
 * Generate a biome map from height, river, and lake data.
 *
 * Climate model:
 *  - Temperature  = latitude-based baseline − altitude reduction
 *  - Moisture     = base from ocean proximity + river bonus
 *                   + rain-shadow effect (windward = wet, leeward = dry)
 *  - Wind         = fixed west→east
 *
 * Biome classification:
 *  ocean | beach | rocky_mountain | alpine | desert | plains | forest | swamp
 */
export function generateBiomeMap(
  heightMap: number[][],
  riverMap: { river: boolean[][]; lake: boolean[][] },
  seaLevel: number,
): { biomeMap: Biome[][]; moisture: number[][] } {
  const h = heightMap.length;
  const w = heightMap[0].length;

  // ---- 1. Ocean distance (BFS from all ocean cells) --------------------
  const INF = w + h;
  const oceanDist: number[][] = Array.from({ length: h }, () => new Array(w).fill(INF));
  const queue: [number, number][] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (heightMap[y][x] < seaLevel) {
        oceanDist[y][x] = 0;
        queue.push([x, y]);
      }
    }
  }

  // BFS (4-connected for simplicity, still gives smooth distance field)
  let qi = 0;
  while (qi < queue.length) {
    const [cx, cy] = queue[qi++];
    const nd = oceanDist[cy][cx] + 1;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (nd < oceanDist[ny][nx]) {
        oceanDist[ny][nx] = nd;
        queue.push([nx, ny]);
      }
    }
  }

  // Max ocean distance for normalization
  let maxOceanDist = 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (oceanDist[y][x] < INF && oceanDist[y][x] > maxOceanDist) {
        maxOceanDist = oceanDist[y][x];
      }
    }
  }

  // ---- 2. Temperature --------------------------------------------------
  // Latitude: y=0 is north (cold), y=h-1 is south (warm) — or vice-versa.
  // We make mid-latitudes temperate, poles cold, equator warm.
  const temperature: number[][] = [];
  for (let y = 0; y < h; y++) {
    temperature[y] = [];
    const latFactor = 1 - 2 * Math.abs(y / (h - 1) - 0.5); // 0 at poles, 1 at equator
    for (let x = 0; x < w; x++) {
      // Base temperature: warm near equator
      let t = 0.2 + latFactor * 0.6;
      // Altitude cooling: higher = colder
      const altAboveSea = Math.max(0, heightMap[y][x] - seaLevel);
      t -= altAboveSea * 0.8;
      temperature[y][x] = Math.max(0, Math.min(1, t));
    }
  }

  // ---- 3. Moisture (base) -----------------------------------------------
  const moisture: number[][] = [];
  for (let y = 0; y < h; y++) {
    moisture[y] = [];
    for (let x = 0; x < w; x++) {
      if (heightMap[y][x] < seaLevel) {
        moisture[y][x] = 1;
        continue;
      }
      // Base: inversely proportional to ocean distance
      const od = oceanDist[y][x] / maxOceanDist; // 0..1
      let m = Math.max(0, 1 - od * 1.2);

      // River proximity bonus
      if (riverMap.river[y][x] || riverMap.lake[y][x]) {
        m += 0.25;
      } else {
        // Check 2-cell radius for river/lake bonus
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            if (riverMap.river[ny][nx] || riverMap.lake[ny][nx]) {
              const dist = Math.sqrt(dx * dx + dy * dy);
              m += 0.12 / dist;
            }
          }
        }
      }

      moisture[y][x] = Math.min(1, m);
    }
  }

  // ---- 4. Rain shadow (west → east wind) --------------------------------
  // For each row, sweep left to right.  When crossing high terrain,
  // windward side keeps/gains moisture; leeward side loses it sharply.
  for (let y = 0; y < h; y++) {
    let windMoisture = 0.6; // carried moisture in the wind
    for (let x = 0; x < w; x++) {
      if (heightMap[y][x] < seaLevel) {
        // Over ocean: replenish wind moisture
        windMoisture = Math.min(1, windMoisture + 0.15);
        continue;
      }
      const alt = heightMap[y][x];
      if (alt > 0.65) {
        // Mountain: orographic lift — dump moisture on windward
        moisture[y][x] = Math.min(1, moisture[y][x] + windMoisture * 0.2);
        windMoisture *= 0.3; // sharp drop on leeward
      } else {
        // Gentle terrain: add some wind moisture
        moisture[y][x] = Math.min(1, moisture[y][x] + windMoisture * 0.05);
        windMoisture *= 0.92;
      }
    }
  }

  // Clamp moisture
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      moisture[y][x] = Math.max(0, Math.min(1, moisture[y][x]));
    }
  }

  // ---- 5. Biome classification ------------------------------------------
  const biomeMap: Biome[][] = [];
  for (let y = 0; y < h; y++) {
    biomeMap[y] = [];
    for (let x = 0; x < w; x++) {
      biomeMap[y][x] = classifyBiome(
        heightMap[y][x],
        seaLevel,
        temperature[y][x],
        moisture[y][x],
        riverMap.river[y][x],
        riverMap.lake[y][x],
      );
    }
  }

  // ---- 6. Light smoothing (majority filter, 1 pass) ---------------------
  const smoothed: Biome[][] = Array.from({ length: h }, (_, y) => [...biomeMap[y]]);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const counts = new Map<Biome, number>();
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const b = biomeMap[y + dy][x + dx];
          counts.set(b, (counts.get(b) ?? 0) + 1);
        }
      }
      let best = biomeMap[y][x];
      let bestCnt = 0;
      counts.forEach((cnt, b) => {
        if (cnt > bestCnt) { bestCnt = cnt; best = b; }
      });
      smoothed[y][x] = best;
    }
  }

  return { biomeMap: smoothed, moisture };
}

function classifyBiome(
  height: number,
  seaLevel: number,
  temperature: number,
  moisture: number,
  isRiver: boolean,
  isLake: boolean,
): Biome {
  // Ocean
  if (height < seaLevel) return 'water';

  // Beach — narrow coastal strip just above sea level
  if (height < seaLevel + 0.04) return 'beach';

  // Mountain peaks
  if (height > 0.82) return temperature < 0.25 ? 'alpine' : 'rocky_mountain';
  if (height > 0.70) return 'rocky_mountain';

  // Swamp — low, wet, near river/lake
  if (height < seaLevel + 0.18 && moisture > 0.55 && (isRiver || isLake)) {
    return 'swamp';
  }

  // Temperature / moisture biomes
  if (moisture < 0.20) return 'desert';
  if (moisture < 0.40) {
    return temperature > 0.45 ? 'plains' : 'desert';
  }
  if (moisture >= 0.55) return 'forest';

  return 'plains';
}
