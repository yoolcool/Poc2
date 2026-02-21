import { createRNG, hashSeed } from '../../rng';

export type SpineResult = {
  spinePoints: { x: number; y: number }[];
  mountainMask: boolean[][];
};

/**
 * Generate a polyline-based mountain spine across the northern part of the map.
 *
 * The spine runs roughly east–west through y: 0 .. height*0.35
 * with gentle curves (no blobs). Surrounding cells within radius 2–5
 * are marked as mountain.
 */
export function generateNorthMountainSpine(
  seed: number,
  width: number,
  height: number,
  oceanMask: boolean[][],
): SpineResult {
  const rng = createRNG(hashSeed(seed, 0x5914E));
  const mask: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    mask[y] = new Array(width).fill(false);
  }

  const maxY = Math.floor(height * 0.35);
  const spinePoints: { x: number; y: number }[] = [];

  // Generate spine control points (polyline from left to right)
  const numCtrl = 6 + Math.floor(rng() * 4); // 6-9 control points
  const ctrlPoints: { x: number; y: number }[] = [];

  for (let i = 0; i < numCtrl; i++) {
    const t = i / (numCtrl - 1);
    const x = Math.floor(3 + t * (width - 6));
    // Spine stays in y range [2, maxY], with gentle wave
    const baseY = 2 + Math.floor(rng() * (maxY - 4));
    ctrlPoints.push({ x, y: baseY });
  }

  // Interpolate between control points to create smooth spine
  for (let i = 0; i < ctrlPoints.length - 1; i++) {
    const p0 = ctrlPoints[i];
    const p1 = ctrlPoints[i + 1];
    const steps = Math.abs(p1.x - p0.x);
    for (let s = 0; s <= steps; s++) {
      const t = steps === 0 ? 0 : s / steps;
      const x = Math.round(p0.x + (p1.x - p0.x) * t);
      const y = Math.round(p0.y + (p1.y - p0.y) * t);
      if (x >= 0 && x < width && y >= 0 && y < height) {
        spinePoints.push({ x, y });
      }
    }
  }

  // Paint mountain mask around spine points with radius 2-5
  for (const pt of spinePoints) {
    const radius = 2 + Math.floor(rng() * 4);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radius) continue;
        const nx = pt.x + dx;
        const ny = pt.y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          if (!oceanMask[ny][nx]) {
            mask[ny][nx] = true;
          }
        }
      }
    }
  }

  // Add some scattered mountain peaks in the northern zone
  const numPeaks = 4 + Math.floor(rng() * 5);
  for (let i = 0; i < numPeaks; i++) {
    const px = 4 + Math.floor(rng() * (width - 8));
    const py = 1 + Math.floor(rng() * maxY);
    const r = 1 + Math.floor(rng() * 2);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > r + 1) continue;
        const nx = px + dx;
        const ny = py + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && !oceanMask[ny][nx]) {
          mask[ny][nx] = true;
        }
      }
    }
  }

  return { spinePoints, mountainMask: mask };
}
