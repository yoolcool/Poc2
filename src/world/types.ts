/** Biome identifiers */
export type Biome =
  | 'water'
  | 'rocky_mountain'
  | 'alpine'
  | 'desert'
  | 'plains'
  | 'forest'
  | 'beach'
  | 'swamp';

/** A single cell in the overworld grid */
export type OverworldCell = {
  height: number;    // 0.0 – 1.0
  moisture: number;  // 0.0 – 1.0
  biome: Biome;
};

/** The complete overworld map */
export type Overworld = {
  width: number;
  height: number;
  cells: OverworldCell[]; // row-major: index = y * width + x
};
