import type { Biome } from './types';

export type ZoneTileKind =
  | 'sand'
  | 'gravel'
  | 'rock'
  | 'dirt'
  | 'grass'
  | 'tall_grass'
  | 'shallow_water'
  | 'mud'
  | 'tree'
  | 'reed'
  | 'snow'
  | 'cliff';

export type ZoneTileFlags = {
  blocked: boolean;
  liquid: boolean;
  vegetation: boolean;
  cold?: boolean;
};

export type ZoneTile = {
  kind: ZoneTileKind;
  /** Single display character */
  glyph: string;
  flags: ZoneTileFlags;
};

export type ZoneMeta = {
  origin: {
    ox: number;
    oy: number;
    depth: number;
  };
  biome: Biome;
  height: number;
  moisture: number;
  seed: number;
};

/**
 * A zone is a detailed sub-map generated deterministically from an overworld
 * cell. tiles is stored as a flat row-major array: index = y * width + x.
 */
export type Zone = {
  /** Unique identifier: `"${ox},${oy},${depth}"` */
  id: string;
  width: number;
  height: number;
  tiles: ZoneTile[];
  meta: ZoneMeta;
};
