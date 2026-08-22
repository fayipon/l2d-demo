/**
 * A seeded pseudo-random source.
 *
 * The arena has always been happy with `Math.random`: a run is different every
 * time on purpose, and nothing about it needs to be reproducible. A map is the
 * opposite. Scene 1-1 is a place, and a place has the same cracked stone in the
 * same corner every time you walk into it -- laid out fresh on each visit it is
 * not a place, it is noise with a name.
 *
 * mulberry32, which is four lines and passes gjrand's tests. Nothing here is
 * cryptographic and nothing here is measured; what it has to be is the same
 * sequence for the same seed, in every browser, forever.
 */
export interface Rand {
  /** Uniform in [0, 1). */
  next(): number
  /** Uniform in [low, high). */
  range(low: number, high: number): number
  /** Uniform integer in [0, count). */
  int(count: number): number
  /** One item, uniformly. */
  pick<T>(items: readonly T[]): T
}

export function makeRand(seed: number): Rand {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const range = (low: number, high: number) => low + next() * (high - low)
  const int = (count: number) => Math.min(count - 1, Math.floor(next() * count))
  return { next, range, int, pick: (items) => items[int(items.length)] }
}

/**
 * Picks an index from a weight table.
 *
 * Weights rather than a list of repeats, because the floor wants plain stone
 * roughly forty times as often as it wants a lava crack, and forty copies of
 * the number 0 in an array is not a thing to read or to tune.
 */
export function weighted(rand: Rand, weights: readonly number[]): number {
  let total = 0
  for (const weight of weights) {
    total += weight
  }
  let roll = rand.next() * total
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]
    if (roll < 0) {
      return i
    }
  }
  return weights.length - 1
}
