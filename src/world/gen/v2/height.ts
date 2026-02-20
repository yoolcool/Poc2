import { createRNG, hashSeed } from '../../rng';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Bilinear-interpolated noise layer at a given coarse scale.
 * Same approach as the v1 overworld generator but returns a 2D array.
 */
function noiseLayer(seed: number, w: number, h: number, scale: number): number[][] {
  const cw = Math.ceil(w / scale) + 2;
  const ch = Math.ceil(h / scale) + 2;
  const coarse: number[] = [];
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      coarse.push(createRNG(hashSeed(seed, cx, cy))());
    }
  }
  const out: number[][] = [];
  for (let y = 0; y < h; y++) {
    out[y] = [];
    for (let x = 0; x < w; x++) {
      const gx = x / scale;
      const gy = y / scale;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const x1 = x0 + 1;
      const y1 = y0 + 1;
      const tx = gx - x0;
      const ty = gy - y0;
      const top = lerp(coarse[y0 * cw + x0], coarse[y0 * cw + x1], tx);
      const bot = lerp(coarse[y1 * cw + x0], coarse[y1 * cw + x1], tx);
      out[y][x] = lerp(top, bot, ty);
    }
  }
  return out;
}

/** Normalize a 2D array in-place to [0, 1]. */
function normalize2D(map: number[][]): void {
  let min = Infinity;
  let max = -Infinity;
  for (const row of map) {
    for (const v of row) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const range = max - min || 1;
  for (const row of map) {
    for (let i = 0; i < row.length; i++) {
      row[i] = (row[i] - min) / range;
    }
  }
}

/**
 * Paint a ridge belt (continuous mountain chain) onto the heightmap.
 *
 * The ridge is a series of waypoints walking in a primary direction
 * with perpendicular wobble so it curves naturally.
 */
function addRidgeBelt(
  map: number[][],
  w: number,
  h: number,
  seed: number,
  cx: number,
  cy: number,
): void {
  const rng = createRNG(seed);

  // Primary direction of the ridge
  const angle = rng() * Math.PI;
  const length = Math.min(w, h) * (0.35 + rng() * 0.35);
  const ridgeWidth = 2.0 + rng() * 2.0;
  const ridgeAmp = 0.30 + rng() * 0.20;

  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const perpX = -sinA;
  const perpY = cosA;

  // Start offset from continent center
  let wx = cx - cosA * length * 0.45;
  let wy = cy - sinA * length * 0.45;

  const numSteps = Math.ceil(length);
  for (let i = 0; i <= numSteps; i++) {
    const wobble = (rng() - 0.5) * 3.5;
    const px = wx + perpX * wobble;
    const py = wy + perpY * wobble;

    // Gaussian-like stamp around this point
    const r = Math.ceil(ridgeWidth * 2.5);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const mx = Math.round(px) + dx;
        const my = Math.round(py) + dy;
        if (mx < 0 || mx >= w || my < 0 || my >= h) continue;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > ridgeWidth * 2.5) continue;
        const falloff = Math.exp(-(dist * dist) / (2 * ridgeWidth * ridgeWidth));
        map[my][mx] += falloff * ridgeAmp;
      }
    }

    wx += cosA;
    wy += sinA;
  }
}

/**
 * Generate a 2D heightmap with a single continent guaranteed.
 *
 * Algorithm:
 *  1. Elliptical continent mask with noise-perturbed edges
 *  2. Multi-octave noise for terrain variation
 *  3. 1–2 ridge belts (continuous mountain chains)
 *  4. Edge forcing (map borders are always ocean)
 *  5. Normalize to [0, 1]
 */
export function generateHeightMap(
  seed: number,
  width: number,
  height: number,
): number[][] {
  const rng = createRNG(hashSeed(seed, 0xa1f0));

  // ---- 1. Continent mask ------------------------------------------------
  const cx = width * (0.35 + rng() * 0.30);
  const cy = height * (0.30 + rng() * 0.40);
  const rx = width * (0.28 + rng() * 0.14);
  const ry = height * (0.26 + rng() * 0.14);

  // Low-frequency noise to perturb coastline
  const edgeNoise = noiseLayer(hashSeed(seed, 0xe06e), width, height, 6);

  const map: number[][] = [];
  for (let y = 0; y < height; y++) {
    map[y] = [];
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Noise perturbation makes coastline irregular
      const pDist = dist + (edgeNoise[y][x] - 0.5) * 0.45;
      // Smooth power-curve falloff
      const mask = Math.max(0, 1 - pDist * pDist);
      map[y][x] = mask;
    }
  }

  // ---- 2. Multi-octave terrain noise ------------------------------------
  const octaves = [
    { scale: 10, amp: 0.25 },
    { scale: 5, amp: 0.12 },
    { scale: 3, amp: 0.06 },
  ];
  for (let i = 0; i < octaves.length; i++) {
    const { scale, amp } = octaves[i];
    const noise = noiseLayer(hashSeed(seed, 0x1401 + i), width, height, scale);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Modulate by continent mask so noise only affects land
        map[y][x] += noise[y][x] * amp * map[y][x];
      }
    }
  }

  // ---- 3. Ridge belts ---------------------------------------------------
  const ridgeCount = 1 + Math.floor(rng() * 2);
  for (let r = 0; r < ridgeCount; r++) {
    addRidgeBelt(map, width, height, hashSeed(seed, 0xb1d6 + r), cx, cy);
  }

  // ---- 4. Force ocean at map edges --------------------------------------
  const fadeX = width * 0.08;
  const fadeY = height * 0.08;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const fx = Math.min(x / fadeX, (width - 1 - x) / fadeX, 1);
      const fy = Math.min(y / fadeY, (height - 1 - y) / fadeY, 1);
      map[y][x] *= Math.min(fx, fy);
    }
  }

  // ---- 5. Normalize -----------------------------------------------------
  normalize2D(map);

  return map;
}
