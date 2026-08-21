/**
 * A fixed-capacity object pool.
 *
 * Everything in the arena comes from one of these. The point is not that
 * allocation is slow -- it is that a survivors game creates and drops hundreds
 * of entities a second, and letting the collector deal with that is how you
 * get a stutter every few seconds right when the screen is busiest.
 *
 * So every slot is built once, up front, and reused for good. `active` is the
 * only thing that changes about whether a slot is in play, and `index` never
 * changes at all -- which is what lets the spatial grid store plain numbers
 * instead of references.
 */
export interface Pooled {
  /** Position in the backing array. Fixed for the life of the pool. */
  readonly index: number
  active: boolean
}

export class Pool<T extends Pooled> {
  readonly items: readonly T[]
  /** Free slots, taken from the end -- so a slot that was just released is the
   *  next one handed out, which keeps the working set small. */
  private readonly free: number[] = []

  constructor(capacity: number, make: (index: number) => T) {
    const items: T[] = []
    for (let i = 0; i < capacity; i++) {
      const item = make(i)
      item.active = false
      items.push(item)
      this.free.push(i)
    }
    this.items = items
  }

  get capacity(): number {
    return this.items.length
  }

  get used(): number {
    return this.items.length - this.free.length
  }

  /**
   * Takes a slot, or returns null when the pool is full.
   *
   * Null rather than growing: the capacity is the budget, and a wave that
   * wants more enemies than the budget allows should quietly spawn fewer
   * rather than let the frame time climb without limit. The caller decides
   * what that means.
   */
  spawn(): T | null {
    const index = this.free.pop()
    if (index === undefined) {
      return null
    }
    const item = this.items[index]
    item.active = true
    return item
  }

  release(item: T): void {
    // Guarded, because releasing twice would put the same index on the free
    // list twice and hand it out to two owners.
    if (!item.active) {
      return
    }
    item.active = false
    this.free.push(item.index)
  }

  releaseAll(): void {
    for (const item of this.items) {
      this.release(item)
    }
  }
}
