/**
 * Uniform grid broadphase over the enemies.
 *
 * This is the one piece of the arena that is not optional. Enemies push each
 * other apart so a crowd spreads out instead of stacking into a single line,
 * and that is every enemy against every other enemy: at 600 on screen a naive
 * pass is 180,000 pairs per step, sixty times a second. Bucketed into cells it
 * is a few thousand.
 *
 * Rebuilt from scratch every step rather than updated incrementally. Every
 * entity moves every step, so an incremental update would be a remove and an
 * insert for all of them -- strictly more work than clearing and refilling.
 *
 * Cells hold plain slot indices, not objects, which is why Pooled.index is
 * fixed for the life of the pool.
 */
export class SpatialGrid {
  readonly cols: number
  readonly rows: number
  private readonly cellSize: number
  /** Cleared by setting length to 0, which keeps each array's capacity -- so
   *  after the first busy wave the grid stops allocating entirely. */
  private readonly cells: number[][]

  constructor(width: number, height: number, cellSize: number) {
    this.cellSize = cellSize
    this.cols = Math.ceil(width / cellSize)
    this.rows = Math.ceil(height / cellSize)
    this.cells = Array.from({ length: this.cols * this.rows }, () => [] as number[])
  }

  clear(): void {
    for (const cell of this.cells) {
      cell.length = 0
    }
  }

  insert(id: number, x: number, y: number): void {
    this.cells[this.cellIndex(x, y)].push(id)
  }

  /**
   * Appends every id in the 3x3 block of cells around (x, y) to `out`.
   *
   * The caller owns `out` and resets its length -- returning a fresh array
   * would allocate once per entity per step, which is the exact cost the pools
   * exist to avoid.
   *
   * Correct only while the query radius is at most one cell. Every caller here
   * queries with a radius well under the cell size; anything larger would need
   * a wider ring.
   */
  queryNeighbourhood(x: number, y: number, out: number[]): void {
    const col = this.clampCol(Math.floor(x / this.cellSize))
    const row = this.clampRow(Math.floor(y / this.cellSize))
    const minCol = Math.max(0, col - 1)
    const maxCol = Math.min(this.cols - 1, col + 1)
    const minRow = Math.max(0, row - 1)
    const maxRow = Math.min(this.rows - 1, row + 1)

    for (let r = minRow; r <= maxRow; r++) {
      const base = r * this.cols
      for (let c = minCol; c <= maxCol; c++) {
        const cell = this.cells[base + c]
        for (let i = 0; i < cell.length; i++) {
          out.push(cell[i])
        }
      }
    }
  }

  /* Kept as a guard rather than a working part. Enemies used to spawn outside
     the arena and walk in, so out-of-bounds positions were routine; they now
     arrive inside the world and are clamped to it every step. The clamp stays
     because the alternative to a wrong cell is an exception or a silently
     dropped entity, and this is on the path of every insert. */
  private cellIndex(x: number, y: number): number {
    const col = this.clampCol(Math.floor(x / this.cellSize))
    const row = this.clampRow(Math.floor(y / this.cellSize))
    return row * this.cols + col
  }

  private clampCol(col: number): number {
    return col < 0 ? 0 : col > this.cols - 1 ? this.cols - 1 : col
  }

  private clampRow(row: number): number {
    return row < 0 ? 0 : row > this.rows - 1 ? this.rows - 1 : row
  }
}
