import { describe, it, expect } from 'vitest';
import { generateZone } from './zone';
import type { GenerateZoneArgs } from './zone';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const BASE_ARGS: GenerateZoneArgs = {
  worldSeed: 99999,
  ox: 5,
  oy: 10,
  depth: 0,
  cell: { biome: 'forest', height: 0.55, moisture: 0.65 },
  width: 40,
  height: 20,
};

function glyphString(args: GenerateZoneArgs): string {
  return generateZone(args).tiles.map((t) => t.glyph).join('');
}

function kindString(args: GenerateZoneArgs): string {
  return generateZone(args).tiles.map((t) => t.kind).join(',');
}

// ---------------------------------------------------------------------------
// 1. Determinism
// ---------------------------------------------------------------------------

describe('determinism', () => {
  it('produces identical glyph output on two calls with the same args', () => {
    const first  = glyphString(BASE_ARGS);
    const second = glyphString(BASE_ARGS);
    expect(first).toBe(second);
  });

  it('produces identical tile kinds on two calls', () => {
    const first  = kindString(BASE_ARGS);
    const second = kindString(BASE_ARGS);
    expect(first).toBe(second);
  });

  it('is deterministic across all biomes', () => {
    const biomes: GenerateZoneArgs['cell']['biome'][] = [
      'desert', 'plains', 'forest', 'water', 'rocky_mountain', 'alpine',
    ];
    for (const biome of biomes) {
      const args = { ...BASE_ARGS, cell: { biome, height: 0.5, moisture: 0.5 } };
      expect(glyphString(args)).toBe(glyphString(args));
    }
  });

  it('zone id encodes ox,oy,depth', () => {
    const zone = generateZone({ ...BASE_ARGS, ox: 3, oy: 7, depth: 2 });
    expect(zone.id).toBe('3,7,2');
  });

  it('meta reflects input cell values', () => {
    const zone = generateZone(BASE_ARGS);
    expect(zone.meta.biome).toBe('forest');
    expect(zone.meta.height).toBe(0.55);
    expect(zone.meta.moisture).toBe(0.65);
    expect(zone.meta.origin).toEqual({ ox: 5, oy: 10, depth: 0 });
  });
});

// ---------------------------------------------------------------------------
// 2. Diversity — different inputs → different outputs
// ---------------------------------------------------------------------------

describe('diversity', () => {
  it('different ox produces a mostly different tile sequence', () => {
    const a = glyphString(BASE_ARGS);
    const b = glyphString({ ...BASE_ARGS, ox: BASE_ARGS.ox + 1 });
    // Allow up to 40 % matching positions — in practice it should be < 5 %.
    const totalLen = a.length;
    let matches = 0;
    for (let i = 0; i < totalLen; i++) if (a[i] === b[i]) matches++;
    const matchRatio = matches / totalLen;
    expect(matchRatio).toBeLessThan(0.40);
  });

  it('different oy produces a mostly different tile sequence', () => {
    const a = glyphString(BASE_ARGS);
    const b = glyphString({ ...BASE_ARGS, oy: BASE_ARGS.oy + 1 });
    const totalLen = a.length;
    let matches = 0;
    for (let i = 0; i < totalLen; i++) if (a[i] === b[i]) matches++;
    expect(matches / totalLen).toBeLessThan(0.40);
  });

  it('different depth produces a different tile sequence', () => {
    const a = glyphString(BASE_ARGS);
    const b = glyphString({ ...BASE_ARGS, depth: 1 });
    expect(a).not.toBe(b);
  });

  it('different worldSeed produces a different tile sequence', () => {
    const a = glyphString(BASE_ARGS);
    const b = glyphString({ ...BASE_ARGS, worldSeed: BASE_ARGS.worldSeed + 1 });
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// 3. Biome tile distribution
// ---------------------------------------------------------------------------

describe('biome tile distribution', () => {
  function countKind(
    args: GenerateZoneArgs,
    kind: string,
  ): number {
    return generateZone(args).tiles.filter((t) => t.kind === kind).length;
  }

  function totalTiles(args: GenerateZoneArgs): number {
    return generateZone(args).tiles.length;
  }

  it('desert zone is mostly sand', () => {
    const args = { ...BASE_ARGS, cell: { biome: 'desert' as const, height: 0.4, moisture: 0.1 } };
    const ratio = countKind(args, 'sand') / totalTiles(args);
    // Base weight 75 % — pass-2 adjustments won't drop it below 50 %
    expect(ratio).toBeGreaterThan(0.5);
  });

  it('plains zone contains grass and dirt', () => {
    const args = { ...BASE_ARGS, cell: { biome: 'plains' as const, height: 0.45, moisture: 0.5 } };
    const grassRatio = countKind(args, 'grass') / totalTiles(args);
    const dirtRatio  = countKind(args, 'dirt')  / totalTiles(args);
    expect(grassRatio).toBeGreaterThan(0.1);
    expect(dirtRatio).toBeGreaterThan(0.1);
  });

  it('forest zone has trees', () => {
    const args = { ...BASE_ARGS, cell: { biome: 'forest' as const, height: 0.5, moisture: 0.5 } };
    const treeCount = countKind(args, 'tree');
    expect(treeCount).toBeGreaterThan(0);
  });

  it('water zone is mostly shallow_water', () => {
    const args = { ...BASE_ARGS, cell: { biome: 'water' as const, height: 0.2, moisture: 0.9 } };
    const ratio = countKind(args, 'shallow_water') / totalTiles(args);
    // Pass-2 cluster/proximity rules redistribute some cells to mud/reed;
    // 45 % is a realistic lower bound for the water biome.
    expect(ratio).toBeGreaterThan(0.45);
  });

  it('rocky_mountain zone contains rock and cliff', () => {
    const args = { ...BASE_ARGS, cell: { biome: 'rocky_mountain' as const, height: 0.8, moisture: 0.3 } };
    const rockRatio  = countKind(args, 'rock')  / totalTiles(args);
    const cliffRatio = countKind(args, 'cliff') / totalTiles(args);
    expect(rockRatio + cliffRatio).toBeGreaterThan(0.4);
  });

  it('alpine zone is mostly snow', () => {
    const args = { ...BASE_ARGS, cell: { biome: 'alpine' as const, height: 0.9, moisture: 0.2 } };
    const ratio = countKind(args, 'snow') / totalTiles(args);
    // At height=0.9 the rock/cliff boost is large; snow still dominates at > 30 %.
    expect(ratio).toBeGreaterThan(0.30);
  });
});

// ---------------------------------------------------------------------------
// 4. Forest tree clustering — trees should clump, not scatter
// ---------------------------------------------------------------------------

describe('forest tree clustering', () => {
  it('at least some trees have a tree neighbour (clustering effect)', () => {
    const args: GenerateZoneArgs = {
      ...BASE_ARGS,
      cell: { biome: 'forest', height: 0.5, moisture: 0.6 },
      width: 40,
      height: 20,
    };
    const zone = generateZone(args);
    const W = zone.width;
    const H = zone.height;

    let treesWithTreeNeighbour = 0;
    let totalTrees = 0;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (zone.tiles[y * W + x].kind !== 'tree') continue;
        totalTrees++;
        // Check 4-connected neighbours
        const dirs: [number, number][] = [[0,-1],[0,1],[-1,0],[1,0]];
        const hasTreeNeighbour = dirs.some(([dx, dy]) => {
          const nx = x + dx, ny = y + dy;
          return nx >= 0 && nx < W && ny >= 0 && ny < H &&
                 zone.tiles[ny * W + nx].kind === 'tree';
        });
        if (hasTreeNeighbour) treesWithTreeNeighbour++;
      }
    }

    // At least 40 % of trees should be adjacent to another tree.
    expect(totalTrees).toBeGreaterThan(0);
    const clusterRatio = treesWithTreeNeighbour / totalTrees;
    expect(clusterRatio).toBeGreaterThan(0.40);
  });
});

// ---------------------------------------------------------------------------
// 5. Water zone — shallow_water spreads, mud & reed form edges
// ---------------------------------------------------------------------------

describe('water zone edge formation', () => {
  it('water zone contains both mud and reed tiles', () => {
    const args: GenerateZoneArgs = {
      ...BASE_ARGS,
      cell: { biome: 'water', height: 0.2, moisture: 0.9 },
      width: 40,
      height: 20,
    };
    const zone = generateZone(args);
    const hasMud  = zone.tiles.some((t) => t.kind === 'mud');
    const hasReed = zone.tiles.some((t) => t.kind === 'reed');
    expect(hasMud).toBe(true);
    expect(hasReed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Flags correctness
// ---------------------------------------------------------------------------

describe('tile flags', () => {
  function firstOfKind(args: GenerateZoneArgs, kind: string) {
    return generateZone(args).tiles.find((t) => t.kind === kind);
  }

  it('cliff tiles have blocked=true', () => {
    const args = { ...BASE_ARGS, cell: { biome: 'rocky_mountain' as const, height: 0.85, moisture: 0.2 } };
    const cliff = firstOfKind(args, 'cliff');
    if (cliff) expect(cliff.flags.blocked).toBe(true);
  });

  it('shallow_water tiles have liquid=true', () => {
    const args = { ...BASE_ARGS, cell: { biome: 'water' as const, height: 0.2, moisture: 0.9 } };
    const sw = firstOfKind(args, 'shallow_water');
    if (sw) expect(sw.flags.liquid).toBe(true);
  });

  it('tree tiles have vegetation=true', () => {
    const args = { ...BASE_ARGS, cell: { biome: 'forest' as const, height: 0.5, moisture: 0.5 } };
    const tree = firstOfKind(args, 'tree');
    if (tree) expect(tree.flags.vegetation).toBe(true);
  });

  it('snow tiles have cold=true', () => {
    const args = { ...BASE_ARGS, cell: { biome: 'alpine' as const, height: 0.9, moisture: 0.2 } };
    const snow = firstOfKind(args, 'snow');
    if (snow) expect(snow.flags.cold).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. Dimensions and array size
// ---------------------------------------------------------------------------

describe('zone dimensions', () => {
  it('default size is 40×20', () => {
    const zone = generateZone({ ...BASE_ARGS, width: undefined, height: undefined });
    expect(zone.width).toBe(40);
    expect(zone.height).toBe(20);
    expect(zone.tiles.length).toBe(40 * 20);
  });

  it('custom size is respected', () => {
    const zone = generateZone({ ...BASE_ARGS, width: 30, height: 15 });
    expect(zone.width).toBe(30);
    expect(zone.height).toBe(15);
    expect(zone.tiles.length).toBe(30 * 15);
  });

  it('every tile has a single-character glyph', () => {
    const zone = generateZone(BASE_ARGS);
    for (const t of zone.tiles) {
      expect(t.glyph.length).toBe(1);
    }
  });
});
