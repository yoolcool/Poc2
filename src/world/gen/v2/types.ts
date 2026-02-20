import type { Biome } from '../../types';

export type WorldGenV2Config = {
  width: number;
  height: number;
  seaLevel?: number; // dynamic if omitted
};

export type WorldGenV2Result = {
  heightMap: number[][];
  riverMap: { river: boolean[][]; lake: boolean[][] };
  biomeMap: Biome[][];
  seaLevel: number;
  moisture: number[][];
};
