import type { Biome } from '../../types';

export type WorldGenV3Config = {
  width: number;
  height: number;
};

export type LandmarkZone = {
  type: 'dense_forest' | 'special' | 'swamp';
  cells: { x: number; y: number }[];
};

export type WorldGenV3Result = {
  biomeMap: Biome[][];
  oceanMask: boolean[][];
  mountainMask: boolean[][];
  riverMask: boolean[][];
  lakeMask: boolean[][];
  landmarkZones: LandmarkZone[];
  /** Synthetic height for compatibility with v2-style Overworld cells. */
  heightMap: number[][];
  /** Synthetic moisture for compatibility. */
  moisture: number[][];
};
