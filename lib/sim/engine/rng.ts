/** Seeded PRNG (mulberry32): the same seed always gives the same sequence. */
export interface Rng {
  next(): number; // [0, 1)
  uniform(min: number, max: number): number;
  int(min: number, max: number): number; // inclusive
  normal(mean?: number, sd?: number): number;
  /** Exponential sample with the given rate (mean 1/rate). */
  exponential(rate: number): number;
  poisson(lambda: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed);
  const rng: Rng = {
    next,
    uniform: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    normal(mean = 0, sd = 1) {
      // Box–Muller; 1 - next() keeps log() away from 0.
      const u = 1 - next();
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    exponential: (rate) => -Math.log(1 - next()) / rate,
    poisson(lambda) {
      if (lambda > 30) return Math.max(0, Math.round(rng.normal(lambda, Math.sqrt(lambda))));
      // Knuth: fine for small lambda.
      const L = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do { k++; p *= next(); } while (p > L);
      return k - 1;
    },
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (p) => next() < p,
  };
  return rng;
}
