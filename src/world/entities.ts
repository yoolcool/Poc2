import { createRNG, hashSeed } from './rng';
import type { Overworld } from './types';

export type EntityKind = 'goat' | 'bird' | 'frog' | 'wanderer';

export type Entity = {
  id: number;
  kind: EntityKind;
  x: number;
  y: number;
};

export const ENTITY_GLYPH: Record<EntityKind, string> = {
  goat:     'g',
  bird:     'b',
  frog:     'f',
  wanderer: 'W',
};

/** How many entities to spawn per world. */
const ENTITY_COUNT = 12;

/** Preferred biomes for each entity kind. */
const PREFERRED_BIOMES: Record<EntityKind, string[]> = {
  goat:     ['rocky_mountain', 'alpine', 'plains'],
  bird:     ['plains', 'forest', 'alpine'],
  frog:     ['water', 'plains', 'forest'],
  wanderer: ['plains', 'desert', 'forest'],
};

const KINDS: EntityKind[] = ['goat', 'bird', 'frog', 'wanderer'];

/**
 * Spawn entities at deterministic positions biased toward preferred biomes.
 * Falls back to a random non-water cell if no preferred biome cell is found
 * within a limited attempt count.
 */
export function spawnEntities(seed: number, world: Overworld): Entity[] {
  const entities: Entity[] = [];
  const rng = createRNG(hashSeed(seed, 0xdeadbeef));

  for (let i = 0; i < ENTITY_COUNT; i++) {
    const kind = KINDS[i % KINDS.length];
    const preferred = PREFERRED_BIOMES[kind];

    let x = 0;
    let y = 0;
    let placed = false;

    // Try up to 30 random cells looking for a preferred biome.
    for (let attempt = 0; attempt < 30; attempt++) {
      const cx = Math.floor(rng() * world.width);
      const cy = Math.floor(rng() * world.height);
      const biome = world.cells[cy * world.width + cx].biome;
      if (preferred.includes(biome)) {
        x = cx; y = cy; placed = true; break;
      }
    }

    // Fallback: any non-water cell.
    if (!placed) {
      for (let attempt = 0; attempt < 50; attempt++) {
        const cx = Math.floor(rng() * world.width);
        const cy = Math.floor(rng() * world.height);
        if (world.cells[cy * world.width + cx].biome !== 'water') {
          x = cx; y = cy; break;
        }
      }
    }

    entities.push({ id: i, kind, x, y });
  }

  return entities;
}

/** Four cardinal directions. */
const DIRS = [
  { dx:  0, dy: -1 },
  { dx:  0, dy:  1 },
  { dx: -1, dy:  0 },
  { dx:  1, dy:  0 },
];

/**
 * Advance all entities one tick.
 * Each entity attempts to move in a random cardinal direction.
 * - Goats/birds/wanderers: avoid water.
 * - Frogs: can cross water.
 * Movement is rejected (entity stays) if the target cell is out of bounds.
 */
export function tickEntities(
  entities: Entity[],
  seed: number,
  tick: number,
  world: Overworld,
): Entity[] {
  return entities.map((e) => {
    const rng = createRNG(hashSeed(seed, e.id, tick));
    const dir = DIRS[Math.floor(rng() * 4)];
    const nx = e.x + dir.dx;
    const ny = e.y + dir.dy;

    // Boundary check.
    if (nx < 0 || nx >= world.width || ny < 0 || ny >= world.height) return e;

    const biome = world.cells[ny * world.width + nx].biome;

    // Frogs can go anywhere; others avoid water.
    if (e.kind !== 'frog' && biome === 'water') return e;

    return { ...e, x: nx, y: ny };
  });
}
