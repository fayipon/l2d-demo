import './style.css'
import { actorSheetBlock, sliceSpec, type RowSpec } from './emit'
import { ACTOR_ANIMS, GAME_GRID, GAME_RATES } from './game'
import {
  ALPHA_FLOOR,
  checkGrid,
  fitGrids,
  frameBands,
  gridCells,
  measure,
  pitch,
  type Band,
  type Box,
  type Grid,
  type Measure,
} from './sheet'
import { buildMask, DEFAULT_MASK, type Mask, type Seed } from './mask'
import { DEFAULT_RULINGS, findRulings, readCells, type Rulings } from './rulings'
import { Stage, type Anchor } from './stage'

/**
 * The screen, and the order it does things in.
 *
 * One direction of flow, always: an image arrives -> its alpha is measured ->
 * a cut is chosen -> everything else is derived and redrawn. Nothing edits the
 * measurement in place and no panel talks to another panel. It is a small
 * enough tool that this could have been wired listener-to-listener, and that
 * is exactly how a tool ends up showing the overlay of one sheet beside the
 * frame counts of the previous one.
 *
 * THE CUT IS THE INTERESTING PART, and it has three modes because sprite
 * sheets come in three kinds:
 *
 *   MEASURED  frames are found from the alpha channel. Right for a sheet with
 *             real gutters -- the mushroom sheet, and most sheets that arrive
 *             from an illustrator or an image model.
 *   GRID      frames are cells of a grid the tool is told. Right for a sheet
 *             that is already packed, where art fills its cell: measured on
 *             project01's own actor-haru.webp, the gaps BETWEEN frames are 4-5
 *             px and the gaps INSIDE a frame are 1-9 px, so no threshold
 *             separates them and measuring cannot work at all.
 *   RULINGS   frames are the boxes the artist DREW around them. Right for a
 *             contact sheet that labels its own layout -- and mandatory for
 *             one, because the rulings wall the keying fill out of every cell
 *             and defeat measuring completely. See rulings.ts.
 *
 * These are three different questions asked of three different kinds of
 * evidence, which is why they are separate modes rather than one clever cut
 * that switches strategies: an answer whose method is not on screen is an
 * answer nobody can check.
 *
 * The bench picks grid mode by itself when the game's own numbers cut the
 * sheet cleanly, because that is the question it exists to answer, and rulings
 * mode when it finds a painted grid. Everything stays editable afterwards.
 */

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (!el) {
    throw new Error(`missing element #${id}`)
  }
  return el as T
}

interface Source {
  label: string
  note: string
  url: string
}

const base = import.meta.env.BASE_URL

/**
 * What can be opened without a file dialog.
 *
 * The two fixtures ship with the build. The game's own sheet is dev-only: it
 * lives in `project01/src/assets`, Vite hashes it into the game's bundle, and
 * the middleware in vite.config.ts serves the real file rather than a copy
 * that could drift. See the note there -- the published bench does not have
 * it, deliberately.
 */
const SOURCES: Source[] = [
  {
    label: 'ragged-5row',
    note: '對照組 — 12/16/18/10/20，帶標題列',
    url: `${base}fixtures/ragged-5row.webp`,
  },
  {
    label: 'grid-6x4',
    note: '對照組 — 等格 128/2/4，內容每格內縮不同',
    url: `${base}fixtures/grid-6x4.webp`,
  },
]
if (import.meta.env.DEV) {
  SOURCES.push(
    {
      label: 'actor-haru',
      note: '遊戲現用的圖（只有 dev 有）',
      url: '/game-assets/actor-haru.webp',
    },
    {
      label: 'game_enemy_sprite_01',
      note: '香菇怪原圖 — 沒有 alpha，棋盤格是畫上去的（只有 dev 有）',
      url: '/design/game_enemy_sprite_01.png',
    },
    {
      label: 'game_enemy_sprite_02',
      note: '香菇怪第二版 — 一樣沒有 alpha，沒有標題列，但每格畫了外框（只有 dev 有）',
      url: '/design/game_enemy_sprite_02.png',
    },
  )
}

type Mode = 'measured' | 'grid' | 'rulings'

interface State {
  name: string
  image: HTMLImageElement | null
  /** The decoded pixels, kept because three passes want them -- the mask, the
   *  ruling detector, and the mask again once the rulings are known -- and
   *  re-reading them means another `getImageData` over two million pixels. */
  rgba: Uint8ClampedArray | null
  measure: Measure | null
  mask: Mask | null
  rulings: Rulings | null
  mode: Mode
  grid: Grid
  rows: RowSpec[]
  anchor: Anchor
  current: number
}

const state: State = {
  name: '',
  image: null,
  rgba: null,
  measure: null,
  mask: null,
  rulings: null,
  mode: 'measured',
  grid: { ...GAME_GRID },
  rows: [],
  anchor: 'centre',
  current: 0,
}

const overlay = $<HTMLCanvasElement>('overlay')
const stage = new Stage($('stage'), 720, 320)

stage.onFrame((row, frame, total, playing) => {
  $('counter').textContent = `第 ${row + 1} 列 · ${frame}/${total}${playing ? '' : ' 停'}`
})

/* ------------------------------------------------------------------ input */

async function loadFrom(url: string, name: string): Promise<void> {
  const image = new Image()
  /* Same-origin in every case the tool offers, and object URLs for dropped
     files, so nothing here needs CORS. Set anyway: a canvas tainted by a
     cross-origin image throws on getImageData, and the error blames the canvas
     rather than the image. */
  image.crossOrigin = 'anonymous'
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error(`could not load ${url}`))
    image.src = url
  })
  state.name = name
  state.image = image
  state.rgba = pixelsOf(image)
  remeasure(true)
}

function pixelsOf(image: HTMLImageElement): Uint8ClampedArray {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('no 2d context')
  }
  ctx.drawImage(image, 0, 0)
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data
}

/** The alpha plane -- read from the file, or keyed off the colours when the
 *  file has none. See mask.ts; the mushroom sheet is why. */
function maskOf(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  force: boolean,
  seeds: Seed[] | null,
): Mask {
  const luma = Number($<HTMLInputElement>('key-luma').value) || DEFAULT_MASK.luma
  return buildMask(rgba, width, height, { ...DEFAULT_MASK, luma }, force, seeds)
}

/** The ruling colour window as it stands on screen. */
function rulingOptions() {
  const read = (id: string, fallback: number) => {
    const value = Number($<HTMLInputElement>(id).value)
    return Number.isFinite(value) ? value : fallback
  }
  return {
    lumaMin: read('r-luma-min', DEFAULT_RULINGS.lumaMin),
    lumaMax: read('r-luma-max', DEFAULT_RULINGS.lumaMax),
    chroma: read('r-chroma', DEFAULT_RULINGS.chroma),
  }
}

/**
 * The game's grid, sized to this sheet.
 *
 * Frame size, margin and spacing come from project01. The column and row
 * counts are DERIVED FROM THE SHEET'S OWN DIMENSIONS rather than from the
 * measured bands, which matters: it makes the hypothesis independent of the
 * measurement, so a sheet whose bands were read badly can still be recognised
 * as one the game cuts correctly. Null when the arithmetic does not come out
 * whole, which is itself an answer -- a 790 px sheet is not six 128s.
 */
function gameGridFor(m: Measure): Grid | null {
  const { frameWidth, frameHeight, margin, spacing } = GAME_GRID
  const columns = (m.width - margin * 2 + spacing) / (frameWidth + spacing)
  const rows = (m.height - margin * 2 + spacing) / (frameHeight + spacing)
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1) {
    return null
  }
  return { frameWidth, frameHeight, margin, spacing, columns, rows }
}

/**
 * The whole pipeline, in the one order the dependencies allow.
 *
 * The rulings come first because they are read off the file's own pixels and
 * depend on nothing. The mask comes second and is seeded from them when there
 * are any -- on a ruled sheet that is not a refinement, it is the difference
 * between a mask that works and one that claims 40% of the image and leaves
 * every cell sealed. `measure` comes third because it needs the mask, and the
 * cells are read back last because deciding which of them are empty needs the
 * finished alpha.
 *
 * Note that the seeded mask is used in EVERY mode once rulings exist, not just
 * in rulings mode. It is simply the correct mask for that image, and having
 * the measured counts change depending on which radio is selected would make
 * the two readings incomparable -- which is the one thing this screen is for.
 */
function remeasure(chooseMode: boolean): void {
  const image = state.image
  const rgba = state.rgba
  if (!image || !rgba) {
    return
  }
  const width = image.naturalWidth
  const height = image.naturalHeight
  const auto = $<HTMLInputElement>('auto-gap').checked
  const gapField = $<HTMLInputElement>('min-gap')

  const found = findRulings(rgba, width, height, rulingOptions())
  const seeds = found
    ? found.bands.flatMap((band) =>
        band.cells.map((cell) => ({ x: cell.x, y: band.top, w: cell.w, h: band.height })),
      )
    : null

  const mask = maskOf(rgba, width, height, $<HTMLInputElement>('key-bg').checked, seeds)
  state.mask = mask
  $<HTMLInputElement>('key-bg').checked = mask.keyed
  const m = measure(mask.alpha, width, height, {
    minGap: auto ? undefined : Number(gapField.value) || 1,
  })
  gapField.value = String(m.minGap)
  gapField.disabled = auto
  state.measure = m
  state.rulings = found ? readCells(found, mask.alpha, width, ALPHA_FLOOR) : null
  /* Widening the colour window until the rulings disappear is a normal thing
     to do on this screen, and leaving the mode pointing at a cut that no
     longer exists would show measured frames under a radio nobody can see. */
  if (state.mode === 'rulings' && !state.rulings) {
    state.mode = 'measured'
  }

  if (chooseMode) {
    const game = gameGridFor(m)
    if (game && checkGrid(m, game).ok) {
      state.mode = 'grid'
      state.grid = game
    } else {
      /* Rulings outrank measuring when they exist, because on a ruled sheet
         the measurement is reading the leftovers of a fill the rulings blocked
         -- and because a line somebody drew to mark a frame boundary is better
         evidence for that boundary than a gap between two drawings. */
      state.mode = state.rulings ? 'rulings' : 'measured'
      state.grid = game ?? { ...GAME_GRID, rows: Math.max(1, frameBands(m).length) }
    }
  }
  rebuild()
}

/** Rebuilds everything downstream of the cut: names, screen, stage. */
function rebuild(): void {
  const m = state.measure
  const image = state.image
  if (!m || !image) {
    return
  }
  const frames = activeFrames()
  state.rows = defaultRows(frames.length)
  state.current = 0
  render()
  stage.setSheet(
    image,
    frames.map((boxes, i) => ({ name: state.rows[i].name, boxes })),
    referenceHeight(),
  )
}

/** The frames as they will be played and emitted: cells of the grid, cells of
 *  the painted rulings, or the bands that were measured.
 *
 *  Empty cells are dropped here rather than counted and skipped later. A cell
 *  the artist ruled and then left blank is a cell -- it is why IDLE reads 14 --
 *  but it is not a frame, and a 14-frame IDLE plays a blank every cycle. The
 *  row table and the verdict say how many were dropped. */
function activeFrames(): Box[][] {
  const m = state.measure
  if (!m) {
    return []
  }
  if (state.mode === 'grid') {
    return gridCells(state.grid)
  }
  if (state.mode === 'rulings' && state.rulings) {
    return state.rulings.bands.map((band) =>
      band.cells
        .filter((cell) => cell.kind === 'frame')
        /* Inset past the ruling itself, which belongs to the sheet and not to
           any frame drawn inside it. */
        .map((cell) => ({ x: cell.x + 2, y: band.top + 2, w: cell.w - 3, h: band.height - 3 })),
    )
  }
  return frameBands(m).map((b) => b.boxes)
}

/** What one frame is considered to be, for the arena-scale preview.
 *
 *  `ArenaScene` scales by `displayHeight / frameHeight`, so grid mode uses the
 *  cell height. A ragged sheet has no cell, and the tallest frame is the
 *  honest stand-in: it is what would set the height of a re-laid cell. */
function referenceHeight(): number {
  if (state.mode === 'grid') {
    return state.grid.frameHeight
  }
  return Math.max(...activeFrames().flatMap((boxes) => boxes.map((b) => b.h)), 1)
}

/** Names the tool is willing to guess: the game's four, and only when the row
 *  count matches. Anything else is `row0`, because a wrong name in an emitted
 *  block is worse than an obviously placeholder one. */
function defaultRows(count: number): RowSpec[] {
  const named = count === ACTOR_ANIMS.length
  return Array.from({ length: count }, (_, i) => {
    const name = named ? ACTOR_ANIMS[i] : `row${i}`
    const rate = GAME_RATES[name] ?? { frameRate: 8, repeat: -1 }
    return { name, frameRate: rate.frameRate, repeat: rate.repeat }
  })
}

/* ----------------------------------------------------------------- render */

function render(): void {
  renderFacts()
  renderMode()
  renderOverlay()
  renderVerdict()
  renderRows()
  renderEmit()
}

const MODE_NAMES: Record<Mode, string> = {
  measured: '照量測',
  grid: '照格線',
  rulings: '照線',
}

/** Cells that were ruled and left blank, in rulings mode. */
function emptyCells(): number {
  if (state.mode !== 'rulings' || !state.rulings) {
    return 0
  }
  return state.rulings.bands.reduce(
    (sum, band) => sum + band.cells.filter((c) => c.kind === 'empty').length,
    0,
  )
}

function renderFacts(): void {
  const m = state.measure
  const dl = $('facts')
  if (!m) {
    dl.innerHTML = ''
    return
  }
  const frames = activeFrames()
  const labels = state.mode === 'rulings' ? 0 : m.bands.filter((b) => b.kind === 'label').length
  const noise = state.mode === 'rulings' ? 0 : m.bands.filter((b) => b.kind === 'noise').length
  const blank = emptyCells()
  const aside = [labels ? `${labels} 條標題` : '', noise ? `${noise} 條雜訊` : '']
    .filter(Boolean)
    .join('、')
  const total = frames.reduce((sum, r) => sum + r.length, 0)
  const rows: [string, string][] = [
    ['檔案', state.name],
    ['尺寸', `${m.width} × ${m.height}`],
    ['切法', MODE_NAMES[state.mode]],
    ['列數', `${frames.length}${aside ? `（另有 ${aside}）` : ''}`],
    ['總格數', `${total}${blank ? `（另有 ${blank} 個空格，沒算進去）` : ''}`],
    ['每列格數', frames.map((r) => r.length).join(' / ')],
  ]
  dl.innerHTML = rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')
}

function renderMode(): void {
  $<HTMLInputElement>('mode-measured').checked = state.mode === 'measured'
  $<HTMLInputElement>('mode-grid').checked = state.mode === 'grid'
  $<HTMLInputElement>('mode-rulings').checked = state.mode === 'rulings'
  /* Offered only when there is a painted grid to read. A radio that reports
     "no rulings" on every sheet that has none is a control the eye learns to
     skip, and this one has something to say when it appears. */
  $('mode-rulings-label').hidden = state.rulings === null
  $('grid-fields').hidden = state.mode !== 'grid'
  $('ruling-fields').hidden = state.mode !== 'rulings'
  for (const [id, key] of GRID_FIELDS) {
    $<HTMLInputElement>(id).value = String(state.grid[key])
  }
}

function renderOverlay(): void {
  const m = state.measure
  const image = state.image
  if (!m || !image) {
    return
  }
  overlay.width = m.width
  overlay.height = m.height
  overlay.classList.toggle('one-to-one', $<HTMLInputElement>('zoom').checked)
  const ctx = overlay.getContext('2d')
  if (!ctx) {
    return
  }
  ctx.clearRect(0, 0, m.width, m.height)
  ctx.drawImage(image, 0, 0)

  /* Line weight scales with the sheet. A 1px box on a 2050px sheet shown at a
     third of its size is invisible, and an overlay nobody can see is an
     overlay nobody checks. */
  const unit = Math.max(1, Math.round(m.width / 700))
  const font = Math.max(11, unit * 11)
  ctx.font = `${font}px monospace`
  ctx.lineWidth = unit

  if (state.mode === 'grid') {
    gridCells(state.grid).forEach((row, r) => {
      row.forEach((cell, c) => {
        ctx.strokeStyle = 'rgba(255, 214, 102, 0.9)'
        ctx.strokeRect(cell.x + 0.5, cell.y + 0.5, cell.w - 1, cell.h - 1)
        ctx.fillStyle = 'rgba(255, 214, 102, 0.9)'
        ctx.fillText(`${r}·${c}`, cell.x + unit * 2, cell.y + font + unit)
      })
    })
  }

  if (state.mode === 'rulings' && state.rulings) {
    /* Solid for a ruling that was seen, dashed for one this tool put there --
       interpolated behind art, or cut out of an over-wide cell. The whole
       point of drawing them differently is that an inference should look like
       one on the screen where it can be checked against the picture. */
    state.rulings.bands.forEach((band, r) => {
      let index = 0
      for (const cell of band.cells) {
        const empty = cell.kind === 'empty'
        ctx.strokeStyle = empty ? 'rgba(150, 158, 178, 0.85)' : 'rgba(126, 231, 135, 0.95)'
        ctx.fillStyle = ctx.strokeStyle
        ctx.setLineDash(cell.derived ? [unit * 5, unit * 4] : [])
        ctx.strokeRect(cell.x + 0.5, band.top + 0.5, cell.w - 1, band.height - 1)
        ctx.setLineDash([])
        ctx.fillText(
          empty ? '空' : `${r}·${index}`,
          cell.x + unit * 2,
          band.top + font + unit,
        )
        if (!empty) {
          index++
        }
      }
    })
  }

  /* The measured boxes are drawn under both modes. In grid mode they are the
     evidence for the verdict -- every one of them inside a cell is what "the
     game's grid cuts this sheet" MEANS -- so hiding them would leave the claim
     unsupported on the one screen able to support it. */
  if (!$<HTMLInputElement>('show-boxes').checked) {
    return
  }
  let bandIndex = -1
  for (const band of m.bands) {
    if (band.kind === 'frames') {
      bandIndex++
    }
    const colour = band.kind === 'frames' ? 'rgba(80, 220, 255, 0.9)' : 'rgba(150, 158, 178, 0.85)'
    ctx.strokeStyle = colour
    ctx.fillStyle = colour
    ctx.setLineDash(band.kind === 'frames' ? [] : [unit * 4, unit * 3])
    ctx.strokeRect(0.5, band.top + 0.5, m.width - 1, band.height - 1)
    ctx.setLineDash([])
    /* The band's tag, on a chip. It has to sit inside the band -- there is no
       room above one -- so without something behind it the text lands on the
       first frame and is unreadable against art. */
    const tag = band.kind === 'frames' ? `#${bandIndex} · ${band.boxes.length}` : band.kind
    if (band.kind !== 'frames' || state.mode === 'measured') {
      const pad = unit * 2
      const width = ctx.measureText(tag).width + pad * 2
      ctx.fillStyle = 'rgba(11, 11, 18, 0.82)'
      ctx.fillRect(0, band.top, width, font + pad)
      ctx.fillStyle = colour
      ctx.fillText(tag, pad, band.top + font)
    }
    if (band.kind !== 'frames') {
      continue
    }
    band.boxes.forEach((box, i) => {
      ctx.strokeStyle = 'rgba(255, 92, 138, 0.95)'
      ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1)
      if (state.mode === 'measured') {
        ctx.fillStyle = 'rgba(255, 92, 138, 0.95)'
        ctx.fillText(String(i), box.x + unit, box.y + box.h + font)
      }
    })
  }
}

function renderVerdict(): void {
  const m = state.measure
  const host = $('verdict')
  if (!m) {
    host.innerHTML = '<p class="muted">還沒有圖。</p>'
    return
  }
  const counts =
    state.mode === 'rulings'
      ? activeFrames().map((boxes) => boxes.length)
      : frameBands(m).map((b) => b.boxes.length)
  const game = gameGridFor(m)
  const gameCheck = game ? checkGrid(m, game) : null
  const lines: string[] = []

  /* First, because it outranks everything under it: a sheet with no working
     transparency cannot go into the game at all, and every number below it was
     measured off a mask this tool invented. */
  const mask = state.mask
  if (mask?.keyed) {
    const greys = mask.greys.length ? `（${mask.greys.join('、')}）` : ''
    lines.push(
      mask.hadAlpha
        ? `<p class="muted">手動去背中：邊界填色吃掉了 ${(mask.backgroundRatio * 100).toFixed(1)}% 的畫面${greys}。</p>`
        : `<p class="bad">這張圖<strong>沒有可用的 alpha</strong> — 看起來像透明的棋盤格是畫上去的像素${greys}。` +
            `底下的格數是用邊界填色推出來的遮罩量的，吃掉了 ${(mask.backgroundRatio * 100).toFixed(1)}% 的畫面；` +
            `<strong>這張圖不能直接進遊戲</strong>，得先真的去背再打包。</p>`,
    )
    if (mask.backgroundRatio < 0.2) {
      lines.push(
        `<p class="bad">而且填色幾乎沒吃到東西，代表背景不是連通的淡色 — 下面每一個數字都不要信，先調亮度門檻。</p>`,
      )
    }
  }

  if (game && gameCheck?.ok) {
    lines.push(
      `<p class="ok">遊戲現在的格線切得開這張圖：frame ${game.frameWidth}×${game.frameHeight}、` +
        `margin ${game.margin}、spacing ${game.spacing}，${game.columns} 欄 × ${game.rows} 列 = ` +
        `${game.columns * game.rows} 格，每一塊量到的內容都完整落在自己的格子裡。</p>`,
    )
    const other = fitGrids(m).find(
      (g) => g.frameWidth !== game.frameWidth || g.margin !== game.margin,
    )
    if (other) {
      lines.push(
        `<p class="muted">內容碰不到格子邊界，所以格線本身量不出唯一解 — ` +
          `frame ${other.frameWidth}、margin ${other.margin}、spacing ${other.spacing} 同樣切得開。` +
          `能問的只有「遊戲那組行不行」，上面那行就是答案。</p>`,
      )
    }
  } else if (game && gameCheck) {
    const first = gameCheck.violations[0]
    lines.push(
      `<p class="bad">遊戲現在的格線切不開這張圖：${gameCheck.violations.length} 塊內容越界，` +
        `第一塊在第 ${first.band} 列（${escapeHtml(first.reason)}）。</p>`,
    )
  } else {
    lines.push(
      `<p class="bad">尺寸 ${m.width}×${m.height} 不是遊戲格線的整數倍` +
        `（frame ${GAME_GRID.frameWidth}、margin ${GAME_GRID.margin}、spacing ${GAME_GRID.spacing}），` +
        `所以它不可能是照那組數字排的。</p>`,
    )
  }

  /* The grid on screen, when it is not the game's any more. Editing a field
     re-cuts the sheet immediately, and without this the verdict would keep
     answering about the game's numbers while the overlay showed somebody
     else's -- the one arrangement guaranteed to be read as agreement. */
  const edited =
    state.mode === 'grid' &&
    (!game ||
      state.grid.frameWidth !== game.frameWidth ||
      state.grid.frameHeight !== game.frameHeight ||
      state.grid.margin !== game.margin ||
      state.grid.spacing !== game.spacing ||
      state.grid.columns !== game.columns ||
      state.grid.rows !== game.rows)
  if (edited) {
    const own = checkGrid(m, state.grid)
    const size =
      state.grid.margin * 2 +
      state.grid.columns * state.grid.frameWidth +
      (state.grid.columns - 1) * state.grid.spacing
    const fits = size === m.width
    lines.push(
      own.ok && fits
        ? `<p class="ok">現在畫面上這組格線也切得開：frame ${state.grid.frameWidth}×${state.grid.frameHeight}、` +
            `margin ${state.grid.margin}、spacing ${state.grid.spacing}。</p>`
        : `<p class="bad">現在畫面上這組格線切不開：` +
            `${own.ok ? '' : `${own.violations.length} 塊內容越界；`}` +
            `${fits ? '' : `${state.grid.columns} 欄算出來是 ${size}px，圖只有 ${m.width}px。`}</p>`,
    )
  }

  /* Only measured mode can produce a ragged answer, and only measured mode
     should report one. In grid mode every row holds `columns` frames by
     construction -- and on a packed sheet the measured counts are the
     over-split ones (17 / 9 / 19 / 10 on the game's own art), so printing them
     beside a clean grid verdict would be the tool contradicting itself. */
  const rectangular = counts.length > 0 && counts.every((c) => c === counts[0])
  if (state.mode !== 'grid' && !rectangular) {
    lines.push(
      `<p class="bad">量到的每列格數不同：${counts.join(' / ')}。</p>`,
      `<p><code>ActorSheet</code> 只有一個 <code>columns</code>，` +
        `<code>ArenaScene.buildActorAnimations</code> 用 <code>first = row * columns</code>、` +
        `<code>end = first + columns - 1</code> 推每一列 — 這些數字沒有共同解，` +
        `這張圖現在的遊戲資料結構<strong>裝不下</strong>。</p>`,
      `<p class="muted">兩條路：讓 <code>ActorSheet</code> 每個動作各帶自己的格數，` +
        `或先照下面的切圖規格把它重排成等格圖。</p>`,
    )
  }

  const p = pitch(m)
  if (p && state.mode === 'measured') {
    lines.push(`<p class="muted">量到的間距：橫 ${p.x}px，縱 ${p.y}px。</p>`)
  }

  const rulings = state.rulings
  if (rulings && state.mode !== 'rulings') {
    lines.push(
      `<p class="muted">這張圖<strong>每一格都畫了外框</strong>：橫線在 y ${rulings.hLines.join('、')}。` +
        `框線就是切點，比量透明縫可靠 — 上面切成「照線」。</p>`,
    )
  }
  if (rulings && state.mode === 'rulings') {
    const blank = emptyCells()
    lines.push(
      `<p class="ok">照圖上畫的框線切：橫線在 y ${rulings.hLines.join('、')}，` +
        `${rulings.bands.length} 列，每列間距 ${rulings.bands.map((b) => b.pitch).join(' / ')}px。</p>`,
    )
    if (rulings.derived > 0) {
      lines.push(
        `<p class="muted">其中 ${rulings.derived} 條線是<strong>推出來的</strong>，畫面上畫成虛線：` +
          `被角色擋住的框線量不到，但缺口是間距的整數倍，所以照間距補回去。` +
          `補錯的話虛線會明顯歪掉，這就是它畫成虛線的理由。</p>`,
      )
    }
    if (blank > 0) {
      lines.push(
        `<p class="muted">${blank} 個格子<strong>有框沒有圖</strong>，已經從格數裡拿掉。` +
          `圖寬排得下這幾格，作畫時沒有填 — 照框數當幀數的話，動畫每一輪會播到一格空白。</p>`,
      )
    }
  }

  const labels = m.bands.filter((b) => b.kind === 'label').length
  const noise = m.bands.filter((b) => b.kind === 'noise').length
  if (labels > 0) {
    lines.push(
      `<p class="muted">${labels} 條窄帶判為標題（像 <code>IDLE (12)</code> 這種烤進圖裡的字），沒算進格數。判錯的話在下面那張表打勾改掉。</p>`,
    )
  }
  if (noise > 0) {
    lines.push(
      `<p class="muted">${noise} 條極矮的帶判為雜訊（別列的影子邊緣）。遊戲自己那張圖在 y 398 就有一條 2px 的。</p>`,
    )
  }
  lines.push(
    `<p class="muted">切格門檻 ${m.minGap}px${
      m.minGapAuto ? `（自動選的：${m.plateau[0]}–${m.plateau[1]}px 都得到同一個答案）` : '（手動指定）'
    }：小於這個寬度的透明縫不算切點。答案只在某一個門檻成立就不算量到，` +
      `所以自動挑的是最寬的那段平台。已經打包好的圖本來就切不出來，那種圖用格線模式。</p>`,
  )
  host.innerHTML = lines.join('')
}

function renderRows(): void {
  const m = state.measure
  const tbody = $<HTMLTableSectionElement>('rows').querySelector('tbody')
  if (!tbody || !m) {
    return
  }
  tbody.innerHTML = ''
  activeFrames().forEach((boxes, i) => tbody.append(rowElement(boxes, i)))
  if (state.mode !== 'measured') {
    return
  }
  /* Only measured mode lists the rejected bands, because only measured mode
     cares: in grid mode the cut does not come from the bands at all. */
  for (const band of m.bands) {
    if (band.kind !== 'frames') {
      tbody.append(rejectedElement(band))
    }
  }
}

function duration(frames: number, frameRate: number): string {
  return `${(frames / frameRate).toFixed(2)} 秒一輪`
}

function rowElement(boxes: Box[], rowIdx: number): HTMLTableRowElement {
  const tr = document.createElement('tr')
  const spec = state.rows[rowIdx]
  const span = (values: number[]) => {
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    return lo === hi ? String(lo) : `${lo}–${hi}`
  }
  const cell = (text: string) => {
    const td = document.createElement('td')
    td.textContent = text
    return td
  }
  const wrap = (el: HTMLElement) => {
    const td = document.createElement('td')
    td.append(el)
    return td
  }

  const name = document.createElement('input')
  name.type = 'text'
  name.value = spec.name
  name.size = 8
  name.addEventListener('input', () => {
    spec.name = name.value
    renderEmit()
  })

  const rate = document.createElement('input')
  rate.type = 'number'
  rate.min = '1'
  rate.max = '60'
  rate.value = String(spec.frameRate)
  rate.addEventListener('input', () => {
    spec.frameRate = Number(rate.value) || 1
    tr.title = duration(boxes.length, spec.frameRate)
    if (state.current === rowIdx) {
      play(rowIdx)
    }
    renderEmit()
  })

  const repeat = document.createElement('select')
  repeat.innerHTML = '<option value="-1">循環</option><option value="0">一次</option>'
  repeat.value = String(spec.repeat)
  repeat.addEventListener('change', () => {
    spec.repeat = Number(repeat.value)
    if (state.current === rowIdx) {
      play(rowIdx)
    }
    renderEmit()
  })

  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = '播'
  button.addEventListener('click', () => play(rowIdx))

  tr.append(
    cell(`#${rowIdx}`),
    wrap(name),
    cell(String(boxes.length)),
    cell(`${span(boxes.map((b) => b.w))}×${span(boxes.map((b) => b.h))}`),
    wrap(rate),
    wrap(repeat),
    wrap(button),
  )
  /* The duration, which nobody computes in their head and which decides
     whether an attack finishes before the next volley. */
  tr.title = duration(boxes.length, spec.frameRate)
  return tr
}

/**
 * A band the detector threw away, with the checkbox that overrules it.
 *
 * This is the one judgement the tool makes that a person routinely has to
 * correct: a sheet whose first animation is a single small frame looks exactly
 * like a caption.
 */
function rejectedElement(band: Band): HTMLTableRowElement {
  const tr = document.createElement('tr')
  tr.className = 'is-rejected'
  const wasNoise = band.kind === 'noise'
  const toggle = document.createElement('input')
  toggle.type = 'checkbox'
  toggle.title = '這條其實是動作'
  toggle.addEventListener('change', () => {
    band.kind = toggle.checked ? 'frames' : wasNoise ? 'noise' : 'label'
    rebuild()
  })
  const first = document.createElement('td')
  first.append(toggle, document.createTextNode(wasNoise ? ' 雜訊' : ' 標題'))
  const cell = (text: string) => {
    const td = document.createElement('td')
    td.textContent = text
    return td
  }
  tr.append(
    first,
    cell('—'),
    cell(String(band.boxes.length)),
    cell(`y ${band.top}..${band.top + band.height - 1}`),
    cell(''),
    cell(''),
    cell(''),
  )
  return tr
}

function play(rowIdx: number): void {
  const spec = state.rows[rowIdx]
  if (!spec) {
    return
  }
  state.current = rowIdx
  stage.show(rowIdx, { frameRate: spec.frameRate, repeat: spec.repeat, anchor: state.anchor })
}

function renderEmit(): void {
  if (!state.measure) {
    return
  }
  const id = state.name.replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9]+/gi, '-') || 'actor'
  const frames = activeFrames()
  $('emit-actor').textContent = actorSheetBlock(
    frames.map((f) => f.length),
    state.mode === 'grid' ? state.grid : null,
    state.rows,
    id,
  )
  $('emit-slice').textContent = sliceSpec(frames, state.rows, id)
}

function escapeHtml(text: string): string {
  return text.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] ?? c)
}

/* ------------------------------------------------------------------ wiring */

const GRID_FIELDS: [string, keyof Grid][] = [
  ['g-frame-w', 'frameWidth'],
  ['g-frame-h', 'frameHeight'],
  ['g-margin', 'margin'],
  ['g-spacing', 'spacing'],
  ['g-columns', 'columns'],
  ['g-rows', 'rows'],
]

const sourceList = $('sources')
for (const source of SOURCES) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'source'
  button.innerHTML = `<strong>${escapeHtml(source.label)}</strong><span>${escapeHtml(source.note)}</span>`
  button.addEventListener('click', () => {
    for (const el of sourceList.querySelectorAll('.source')) {
      el.classList.remove('active')
    }
    button.classList.add('active')
    void loadFrom(source.url, source.label)
  })
  sourceList.append(button)
}

const fileInput = $<HTMLInputElement>('file')
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) {
    void loadFrom(URL.createObjectURL(file), file.name)
  }
})

const drop = $('drop')
for (const type of ['dragenter', 'dragover']) {
  drop.addEventListener(type, (event) => {
    event.preventDefault()
    drop.classList.add('over')
  })
}
for (const type of ['dragleave', 'drop']) {
  drop.addEventListener(type, () => drop.classList.remove('over'))
}
drop.addEventListener('drop', (event) => {
  event.preventDefault()
  const file = (event as DragEvent).dataTransfer?.files?.[0]
  if (file) {
    void loadFrom(URL.createObjectURL(file), file.name)
  }
})

$('auto-gap').addEventListener('change', () => remeasure(false))
$('key-bg').addEventListener('change', () => remeasure(false))
$('key-luma').addEventListener('change', () => remeasure(false))
$('min-gap').addEventListener('change', () => remeasure(false))
$('show-boxes').addEventListener('change', renderOverlay)
$('zoom').addEventListener('change', renderOverlay)
$('stop').addEventListener('click', () => stage.stop())

for (const id of ['mode-measured', 'mode-grid', 'mode-rulings']) {
  $(id).addEventListener('change', () => {
    state.mode = $<HTMLInputElement>('mode-grid').checked
      ? 'grid'
      : $<HTMLInputElement>('mode-rulings').checked
        ? 'rulings'
        : 'measured'
    rebuild()
  })
}

for (const id of ['r-luma-min', 'r-luma-max', 'r-chroma']) {
  $(id).addEventListener('change', () => remeasure(false))
}

for (const [id, key] of GRID_FIELDS) {
  $(id).addEventListener('change', () => {
    const value = Number($<HTMLInputElement>(id).value)
    if (!Number.isFinite(value) || value < 0) {
      return
    }
    state.grid = { ...state.grid, [key]: value }
    rebuild()
  })
}

$<HTMLSelectElement>('anchor').addEventListener('change', (event) => {
  state.anchor = (event.target as HTMLSelectElement).value as Anchor
  const spec = state.rows[state.current]
  if (spec) {
    stage.resume({ frameRate: spec.frameRate, repeat: spec.repeat, anchor: state.anchor })
  }
})

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
  button.addEventListener('click', () => {
    const target = button.dataset.copy === 'actor' ? 'emit-actor' : 'emit-slice'
    void navigator.clipboard.writeText($(target).textContent ?? '')
    button.textContent = '複製了'
    window.setTimeout(() => (button.textContent = '複製'), 1200)
  })
}

/* Opens on the ragged fixture rather than the tidy one. The uniform sheet is
   the case that already worked; this one is the case the tool was built for,
   and it should be what a first visit shows. */
sourceList.querySelector<HTMLButtonElement>('.source')?.click()

if (import.meta.env.DEV) {
  /* A handle for driving the bench from a headless browser, the same shape as
     project01's `window.__arena`. Nothing in the tool reads it. */
  ;(window as unknown as { __bench?: unknown }).__bench = {
    state,
    load: (url: string, name: string) => loadFrom(url, name),
    counts: () => activeFrames().map((f) => f.length),
  }
}
