/**
 * Deterministic PRNG utilities
 * Uses xorshift32 algorithm — same seed always produces same sequence.
 */

/**
 * Creates a deterministic pseudo-random number generator.
 * @param seed - Initial seed value (non-zero integer)
 * @returns A function that returns a float in [0, 1) each call
 */
export function createRNG(seed: number): () => number {
  // xorshift32: state must be non-zero
  let state = seed >>> 0 || 1;

  return function (): number {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state = state >>> 0; // force unsigned 32-bit
    return state / 4294967296; // divide by 2^32
  };
}

/**
 * Combines a base seed with additional salt values to produce a new seed.
 * Useful for per-cell RNG that is still globally deterministic.
 * @param seed - Base seed
 * @param salts - Additional integer values to mix in
 * @returns A new seed derived from the combination
 */
export function hashSeed(seed: number, ...salts: number[]): number {
  let h = seed >>> 0;
  for (const s of salts) {
    h ^= s >>> 0;
    h = Math.imul(h, 0x9e3779b9); // knuth multiplicative hash
    h ^= h >>> 16;
    h = h >>> 0;
  }
  return h || 1; // ensure non-zero
}
