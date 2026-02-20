import { createRNG, hashSeed } from './rng';
import type { Biome, Overworld, OverworldCell } from './types';

// ---- Math helpers -------------------------------------------------------

/** Linear interpolation between a and b by factor t ∈ [0,1]. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Normalize a field to the full [0, 1] range using min-max scaling.
 * Guarantees good biome spread regardless of how raw random values cluster.
 */
function normalizeField(field: number[]): number[] {
  let min = field[0];
  let max = field[0];
  for (const v of field) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  if (range === 0) return field.map(() => 0.5);
  return field.map((v) => (v - min) / range);
}

// ---- Noise field --------------------------------------------------------

/**
 * Generate a smoothly interpolated noise field.
 *
 * Steps:
 *  1. Build a small "coarse grid" where each cell is a deterministic random value.
 *  2. Bilinear-interpolate the coarse grid up to the target (width × height).
 *  3. Min-max normalize so the output spans the full [0, 1] range.
 *
 * @param seed        Unique seed for this field (use different seeds for height vs moisture).
 * @param width       Output width (cols).
 * @param height      Output height (rows).
 * @param coarseScale Number of output cells per coarse cell.
 *                    Larger → bigger, smoother features (continents, mountain ranges).
 * @returns           Flat row-major array, values in [0, 1].
 */
function generateNoiseField(
  seed: number,
  width: number,
  height: number,
  coarseScale: number,
): number[] {
  const coarseW = Math.ceil(width / coarseScale) + 1;
  const coarseH = Math.ceil(height / coarseScale) + 1;

  // Step 1: fill coarse grid — each coarse cell is deterministically seeded by its coords
  const coarse = new Array<number>(coarseW * coarseH);
  for (let cy = 0; cy < coarseH; cy++) {
    for (let cx = 0; cx < coarseW; cx++) {
      const rng = createRNG(hashSeed(seed, cx, cy));
      coarse[cy * coarseW + cx] = rng();
    }
  }

  // Step 2: bilinear interpolation to full resolution
  const field = new Array<number>(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx = x / coarseScale;
      const gy = y / coarseScale;

      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const x1 = Math.min(x0 + 1, coarseW - 1);
      const y1 = Math.min(y0 + 1, coarseH - 1);

      const tx = gx - x0;
      const ty = gy - y0;

      // Interpolate horizontally across each row, then vertically
      const top = lerp(coarse[y0 * coarseW + x0], coarse[y0 * coarseW + x1], tx);
      const bot = lerp(coarse[y1 * coarseW + x0], coarse[y1 * coarseW + x1], tx);
      field[y * width + x] = lerp(top, bot, ty);
    }
  }

  // Step 3: normalize so the full range [0, 1] is used
  return normalizeField(field);
}

// ---- Biome classification -----------------------------------------------

/**
 * Map (height, moisture) to a biome.
 *
 * Height thresholds:
 *   < 0.30 → water
 *   > 0.75 → mountain zone (rocky or alpine depending on moisture)
 *
 * Moisture thresholds (mid-height land):
 *   < 0.30 → desert
 *   < 0.60 → plains
 *   ≥ 0.60 → forest
 */
function classifyBiome(height: number, moisture: number): Biome {
  if (height < 0.30) return 'water';
  if (height > 0.75) return moisture < 0.4 ? 'rocky_mountain' : 'alpine';
  if (moisture < 0.30) return 'desert';
  if (moisture < 0.60) return 'plains';
  return 'forest';
}

// ---- Smoothing ----------------------------------------------------------

/**
 * One pass of majority smoothing.
 * Replaces each cell's biome with the most frequent biome among its 8 neighbours + itself.
 * Reduces salt-and-pepper speckling at biome boundaries.
 * Applied only once — more passes would over-smooth the map.
 */
function applySmoothingPass(
  cells: OverworldCell[],
  width: number,
  height: number,
): OverworldCell[] {
  // Read from original `cells`, write to `result` — no feedback loop.
  const result = cells.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const counts = new Map<Biome, number>();
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = Math.max(0, Math.min(width - 1, x + dx));
          const ny = Math.max(0, Math.min(height - 1, y + dy));
          const b = cells[ny * width + nx].biome;
          counts.set(b, (counts.get(b) ?? 0) + 1);
        }
      }
      let majority: Biome = cells[y * width + x].biome;
      let maxCount = 0;
      counts.forEach((cnt, biome) => {
        if (cnt > maxCount) { maxCount = cnt; majority = biome; }
      });
      result[y * width + x] = { ...cells[y * width + x], biome: majority };
    }
  }
  return result;
}

// ---- Public API ---------------------------------------------------------

/**
 * Generate a deterministic overworld using coarse-grid bilinear noise.
 * Same seed → identical map every time.
 */
export function generateOverworld(
  seed: number,
  width: number,
  height: number,
): Overworld {
  const COARSE_SCALE = 8; // ~10×5 coarse grid for an 80×40 output

  // Two independent fields with different seeds → independent patterns
  const heightField   = generateNoiseField(seed,        width, height, COARSE_SCALE);
  const moistureField = generateNoiseField(seed + 9999, width, height, COARSE_SCALE);

  let cells: OverworldCell[] = [];
  for (let i = 0; i < width * height; i++) {
    const h = heightField[i];
    const m = moistureField[i];
    cells.push({ height: h, moisture: m, biome: classifyBiome(h, m) });
  }

  // One smoothing pass for cleaner biome clusters
  cells = applySmoothingPass(cells, width, height);

  // Biome distribution stats — useful for threshold tuning
  const total = cells.length;
  const cnt = new Map<string, number>();
  cells.forEach((c) => cnt.set(c.biome, (cnt.get(c.biome) ?? 0) + 1));
  const pct = (b: string) => (((cnt.get(b) ?? 0) / total) * 100).toFixed(1);
  console.log(
    `[World] seed=${seed}  ` +
    `water=${pct('water')}%  ` +
    `rocky_mtn=${pct('rocky_mountain')}%  alpine=${pct('alpine')}%  ` +
    `desert=${pct('desert')}%  plains=${pct('plains')}%  forest=${pct('forest')}%`,
  );

  return { width, height, cells };
}

/** Convert the overworld to a compact string for hash verification. */
export function serializeOverworld(world: Overworld): string {
  return world.cells.map((c) => `${c.biome[0]}${c.height.toFixed(2)}`).join('');
}
