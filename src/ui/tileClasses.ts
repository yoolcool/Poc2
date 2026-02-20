import type { Biome } from '../world/types';

/** ASCII glyph rendered for each biome. */
export const BIOME_CHAR: Record<Biome, string> = {
  water:          '~',
  rocky_mountain: '^',
  alpine:         'A',
  desert:         '.',
  plains:         ',',
  forest:         'T',
};

/**
 * CSS class that applies the biome colour.
 * Used by both GridView (per-tile spans) and Inspector (legend + compact strip).
 */
export const BIOME_CLASS: Record<Biome, string> = {
  water:          'tile-water',
  rocky_mountain: 'tile-rocky-mountain',
  alpine:         'tile-alpine',
  desert:         'tile-desert',
  plains:         'tile-plains',
  forest:         'tile-forest',
};

/**
 * Return the full CSS class string for a single tile.
 * Cursor cell always gets the player class regardless of biome.
 */
export function getTileClass(biome: string, isCursor: boolean): string {
  if (isCursor) return 'tile-player';
  return BIOME_CLASS[biome as Biome] ?? 'tile-plains';
}
