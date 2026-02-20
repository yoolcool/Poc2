import { createRNG, hashSeed } from './rng';
import type { Biome, OverworldCell } from './types';
import type { Zone, ZoneTile, ZoneTileFlags, ZoneTileKind } from './zoneTypes';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type GenerateZoneArgs = {
  worldSeed: number;
  ox: number;
  oy: number;
  depth: number;
  cell: OverworldCell;
  width?: number;
  height?: number;
};

export function generateZone({
  worldSeed,
  ox,
  oy,
  depth,
  cell,
  width  = DEFAULT_W,
  height = DEFAULT_H,
}: GenerateZoneArgs): Zone {
  // Zone-unique seed derived deterministically from all inputs.
  const zoneSeed = hashSeed(worldSeed, ox, oy, depth, 0x5A0E);

  const base = BIOME_WEIGHTS[cell.biome];

  // ── Pass 1: base tile per cell (neighbor-unaware) ─────────────────────────
  // Each cell uses an independent RNG so the full pass-1 map is globally
  // deterministic regardless of iteration order.
  const pass1: ZoneTileKind[] = new Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rng  = createRNG(hashSeed(zoneSeed, x, y, 0x1111));
      pass1[y * width + x] = weightedPick(base, rng());
    }
  }

  // ── Pass 2: neighbor-aware reassignment ───────────────────────────────────
  // Reads from pass1 (frozen); writes to final tiles.
  const tiles: ZoneTile[] = new Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rng  = createRNG(hashSeed(zoneSeed, x, y, 0x2222));
      const adj  = adjustedWeights(base, cell, x, y, width, height, pass1);
      const kind = weightedPick(adj, rng());
      tiles[y * width + x] = makeTile(kind);
    }
  }

  return {
    id: `${ox},${oy},${depth}`,
    width,
    height,
    tiles,
    meta: {
      origin: { ox, oy, depth },
      biome: cell.biome,
      height: cell.height,
      moisture: cell.moisture,
      seed: zoneSeed,
    },
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_W = 40;
const DEFAULT_H = 20;

// ---------------------------------------------------------------------------
// Glyph & flags tables
// ---------------------------------------------------------------------------

const GLYPH: Record<ZoneTileKind, string> = {
  sand:          '.',
  gravel:        ',',
  dirt:          '.',
  grass:         ',',
  tall_grass:    '"',
  rock:          '^',
  cliff:         '#',
  shallow_water: '~',
  mud:           ',',
  tree:          'T',
  reed:          '`',
  snow:          '*',
};

function makeFlags(kind: ZoneTileKind): ZoneTileFlags {
  return {
    blocked:    kind === 'cliff',
    liquid:     kind === 'shallow_water',
    vegetation: kind === 'tree' || kind === 'reed',
    cold:       kind === 'snow' ? true : undefined,
  };
}

function makeTile(kind: ZoneTileKind): ZoneTile {
  return { kind, glyph: GLYPH[kind], flags: makeFlags(kind) };
}

// ---------------------------------------------------------------------------
// Biome weight tables
// ---------------------------------------------------------------------------

/** [kind, relative-weight] pairs.  Weights need not sum to any fixed value. */
type WeightEntry = [ZoneTileKind, number];
type WeightTable = WeightEntry[];

const BIOME_WEIGHTS: Record<Biome, WeightTable> = {
  desert:        [['sand', 75], ['gravel', 18], ['rock', 7]],
  plains:        [['grass', 55], ['dirt', 25], ['tall_grass', 20]],
  forest:        [['dirt', 45], ['grass', 25], ['tall_grass', 10], ['tree', 20]],
  water:         [['shallow_water', 80], ['mud', 15], ['reed', 5]],
  rocky_mountain:[['rock', 55], ['cliff', 25], ['dirt', 20]],
  alpine:        [['snow', 55], ['rock', 30], ['cliff', 10], ['dirt', 5]],
};

// ---------------------------------------------------------------------------
// Weighted random selection
// ---------------------------------------------------------------------------

/** Pick a kind from the weight table given a uniform [0,1) float. */
function weightedPick(table: WeightTable, r: number): ZoneTileKind {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let   cum   = 0;
  for (const [kind, w] of table) {
    cum += w;
    if (r * total < cum) return kind;
  }
  return table[table.length - 1][0];
}

// ---------------------------------------------------------------------------
// Neighbour helpers
// ---------------------------------------------------------------------------

const DIRS_8: [number, number][] = [
  [-1,-1],[ 0,-1],[1,-1],
  [-1, 0],        [1, 0],
  [-1, 1],[ 0, 1],[1, 1],
];

function countNeighbors(
  grid: ZoneTileKind[],
  x: number, y: number,
  W: number, H: number,
  target: ZoneTileKind,
): number {
  let n = 0;
  for (const [dx, dy] of DIRS_8) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < W && ny >= 0 && ny < H && grid[ny * W + nx] === target) n++;
  }
  return n;
}

function hasNeighbor(
  grid: ZoneTileKind[],
  x: number, y: number,
  W: number, H: number,
  target: ZoneTileKind,
): boolean {
  return countNeighbors(grid, x, y, W, H, target) > 0;
}

// ---------------------------------------------------------------------------
// Local-rule weight adjustment (pass 2)
// ---------------------------------------------------------------------------

const CLUSTER_KINDS: ZoneTileKind[] = ['tree', 'reed', 'tall_grass'];

function adjustedWeights(
  base: WeightTable,
  cell: OverworldCell,
  x: number, y: number,
  W: number, H: number,
  pass1: ZoneTileKind[],
): WeightTable {
  // Work with a mutable copy.
  const wmap = new Map<ZoneTileKind, number>(base);

  // ① Cluster boost — tree/reed/tall_grass feel "grouped", not scattered.
  //   2+ same-kind neighbours → ×4;  1 neighbour → ×2.
  for (const ck of CLUSTER_KINDS) {
    const w = wmap.get(ck);
    if (w === undefined) continue;
    const cnt = countNeighbors(pass1, x, y, W, H, ck);
    if      (cnt >= 2) wmap.set(ck, w * 4);
    else if (cnt >= 1) wmap.set(ck, w * 2);
  }

  // ② Water-proximity chain: shallow_water → mud → reed.
  if (hasNeighbor(pass1, x, y, W, H, 'shallow_water')) {
    const mw = wmap.get('mud');
    if (mw !== undefined) wmap.set('mud', mw * 3);
  }
  if (hasNeighbor(pass1, x, y, W, H, 'mud')) {
    const rw = wmap.get('reed');
    if (rw !== undefined) wmap.set('reed', rw * 3);
  }

  // ③ Height correction: high terrain → more rock / cliff.
  if (cell.height > 0.70) {
    const factor = 1 + (cell.height - 0.70) * 5;
    for (const k of ['rock', 'cliff'] as ZoneTileKind[]) {
      const w = wmap.get(k);
      if (w !== undefined) wmap.set(k, w * factor);
    }
  }

  // ④ Moisture correction: high moisture → more vegetation.
  if (cell.moisture > 0.60) {
    const factor = 1 + (cell.moisture - 0.60) * 3;
    for (const k of ['grass', 'tall_grass', 'reed', 'tree'] as ZoneTileKind[]) {
      const w = wmap.get(k);
      if (w !== undefined) wmap.set(k, w * factor);
    }
  }

  // ⑤ Desert + high moisture → rare water pocket.
  if (cell.biome === 'desert' && cell.moisture > 0.55) {
    wmap.set('shallow_water', 2);
  }

  return [...wmap.entries()];
}
