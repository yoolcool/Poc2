import type { Biome } from '../world/types';

/**
 * Dense glyphs per biome — chosen for maximum visual fill.
 * Each character should "fill" its cell so the map looks solid.
 */
export const BIOME_CHAR: Record<Biome, string> = {
  water:          '≋',
  rocky_mountain: '▲',
  alpine:         '△',
  desert:         '∴',
  plains:         '░',
  forest:         '♣',
  beach:          '▒',
  swamp:          '≈',
  river:          '━',
  lake:           '◉',
  special:        '◈',
  dense_forest:   '♠',
  steppe:         '·',
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
  beach:          'tile-beach',
  swamp:          'tile-swamp',
  river:          'tile-river',
  lake:           'tile-lake',
  special:        'tile-special',
  dense_forest:   'tile-dense-forest',
  steppe:         'tile-steppe',
};

/**
 * Return the full CSS class string for a single tile.
 * Cursor cell always gets the player class regardless of biome.
 */
export function getTileClass(biome: string, isCursor: boolean): string {
  if (isCursor) return 'tile-player';
  return BIOME_CLASS[biome as Biome] ?? 'tile-plains';
}
