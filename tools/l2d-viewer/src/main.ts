import './style.css'
import { MAX_MOC_VERSION, readMoc, readSettings, type SettingsReport } from './inspect'
import { BUILT_IN_LABELS, filesFromDrop, loadBuiltIn, loadFolder, type ModelSource } from './sources'
import { Bench, type Box, type Framing } from './stage'
import { emitConfig, matchesShared, SHARED_FRAMINGS } from './emit'

/**
 * Wiring.
 *
 * One screen, so the state is four variables and a render function rather than
 * a framework. Kept that way on purpose: this tool's `node_modules` contains
 * pixi, the Live2D runtime and the sound package it depends on, and nothing
 * else, so when a model misbehaves here there is nothing else to suspect.
 */

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Partial<Record<string, string>> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined) node.setAttribute(key, value)
  }
  node.append(...children)
  return node
}

const row = (label: string, value: string) =>
  el('div', { class: 'row' }, el('span', {}, label), el('b', {}, value))

const app = document.getElementById('app')!
const left = el('div', { class: 'col left' })
const stageWrap = el('div', { class: 'stage-wrap' })
const stageHost = el('div', { id: 'stage' })
const statusBar = el('div', { class: 'bar' })
const right = el('div', { class: 'col right' })
stageWrap.append(stageHost, statusBar)
app.append(left, stageWrap, right)

const bench = new Bench(stageHost)

/* ---------- state ---------- */

let source: ModelSource | null = null
let settingsReport: SettingsReport | null = null
let framing: Framing = { ...SHARED_FRAMINGS[0].framing }
let art: Box | null = null
let loadError: string | null = null
let mocLine: { ok: boolean; head: string; detail: string } | null = null
let loadedLines: string[] = []
let modelId = 'model'
let overlayOn = true

/* ---------- loading ---------- */

async function use(next: () => Promise<ModelSource>): Promise<void> {
  // Blob URLs from the previous drop are dead the moment it is replaced.
  source?.blobs.forEach((url) => URL.revokeObjectURL(url))
  bench.clear()
  source = null
  settingsReport = null
  loadError = null
  mocLine = null
  loadedLines = []
  art = null
  render()

  try {
    const loaded = await next()
    source = loaded
    settingsReport = readSettings(loaded.json)
    modelId = loaded.id

    /*
     * The version check runs before the loader is given anything, which is the
     * whole order-of-operations point of this tool. Core 5 refuses a v6 moc
     * with `Failed to CubismMoc.create()`, and that message tells someone who
     * has not read project01/index.html precisely nothing.
     */
    const moc = readMoc(loaded.moc)
    if (moc.problem) {
      mocLine = { ok: false, head: '這不是有效的 moc3', detail: moc.problem }
      render()
      return
    }
    if (!moc.supported) {
      mocLine = {
        ok: false,
        head: `moc3 v${moc.version} — 載不起來`,
        detail:
          `這個專案釘住的是 Cubism Core 5，只吃 moc3 v${MAX_MOC_VERSION} 以下。` +
          '請要求對方用相容版本重新匯出，或改用別的模型。升 Core 不是選項 —— ' +
          'Core 6 會讓 pixi-live2d-display-advanced@1.1.0 完全不渲染。',
      }
      render()
      return
    }
    mocLine = {
      ok: true,
      head: `moc3 v${moc.version} — 可以載`,
      detail: `上限是 v${MAX_MOC_VERSION}，這個模型在遊戲裡跑得起來。`,
    }
    render()

    const result = await bench.load(loaded)
    art = result.art
    loadedLines = [
      `${result.report.canvasWidth} × ${result.report.canvasHeight}`,
      String(result.report.drawables),
      String(result.report.parameters),
      result.report.pixelsPerUnit.toFixed(1),
    ]
    bench.setFraming(framing)
    bench.setOverlay(overlayOn)
    bench.onHit((areas) => setStatus(`命中：${areas.join(', ') || '(無名稱)'}`))
    setStatus(`${loaded.label} 已載入`)
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e)
    setStatus('載入失敗')
  }
  render()
}

function setStatus(text: string): void {
  statusBar.textContent = ''
  statusBar.append(
    el('span', {}, text),
    el('div', { class: 'spacer' }),
    el('span', {}, `Core 5 · moc3 ≤ ${MAX_MOC_VERSION} · pixi 7.4.3`),
  )
}
setStatus('挑一個模型，或把資料夾拖進來')

/* ---------- panels ---------- */

function renderLeft(): void {
  left.textContent = ''
  left.append(el('h1', {}, 'Live2D 檢測台'))

  // Sources.
  const picker = el('div', { class: 'card' })
  picker.append(el('h2', {}, '模型'))
  const chips = el('div', { class: 'chips' })
  BUILT_IN_LABELS.forEach((label, i) => {
    const b = el('button', {}, label)
    b.addEventListener('click', () => void use(() => loadBuiltIn(i)))
    chips.append(b)
  })
  picker.append(chips)

  const drop = el('div', { class: 'drop' }, '把模型資料夾拖進來，或點這裡選擇')
  const input = el('input', { type: 'file', style: 'display:none' }) as HTMLInputElement
  input.webkitdirectory = true
  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? [])
    if (files.length > 0) void use(() => loadFolder(files))
  })
  drop.addEventListener('click', () => input.click())
  drop.addEventListener('dragover', (e) => {
    e.preventDefault()
    drop.classList.add('over')
  })
  drop.addEventListener('dragleave', () => drop.classList.remove('over'))
  drop.addEventListener('drop', (e) => {
    e.preventDefault()
    drop.classList.remove('over')
    const transfer = (e as DragEvent).dataTransfer
    if (transfer) void use(async () => loadFolder(await filesFromDrop(transfer)))
  })
  picker.append(el('div', { style: 'margin-top:8px' }, drop, input))
  left.append(picker)

  // The verdict.
  if (mocLine) {
    left.append(
      el(
        'div',
        { class: `verdict ${mocLine.ok ? 'ok' : 'bad'}` },
        el('b', {}, mocLine.head),
        mocLine.detail,
      ),
    )
  } else {
    left.append(el('div', { class: 'verdict idle' }, '尚未載入模型'))
  }

  if (loadError) {
    const card = el('div', { class: 'card' })
    card.append(el('h2', {}, '載入錯誤'), el('div', { class: 'err' }, loadError))
    left.append(card)
  }

  // What is inside it.
  if (settingsReport) {
    const s = settingsReport
    const card = el('div', { class: 'card' })
    card.append(el('h2', {}, '內容'))
    const rows = el('div', { class: 'rows' })
    rows.append(row('貼圖', String(s.textures.length)))
    if (loadedLines.length === 4) {
      rows.append(
        row('畫布', loadedLines[0]),
        row('drawables', loadedLines[1]),
        row('參數', loadedLines[2]),
        row('pixelsPerUnit', loadedLines[3]),
      )
    }
    rows.append(
      row('physics', s.hasPhysics ? '有' : '無'),
      row('pose', s.hasPose ? '有' : '無'),
      row('HitArea', s.hitAreas.map((h) => h.name || h.id).join(', ') || '無'),
    )
    card.append(rows)
    left.append(card)
  }
}

function renderRight(): void {
  right.textContent = ''

  // Motions and expressions.
  const play = el('div', { class: 'card' })
  play.append(el('h2', {}, '動作與表情'))
  if (!settingsReport) {
    play.append(el('div', { class: 'empty' }, '載入後可在這裡逐一觸發。'))
  } else {
    const s = settingsReport
    if (s.motionGroups.length === 0) {
      play.append(el('div', { class: 'empty' }, '這個模型沒有任何動作。'))
    }
    for (const group of s.motionGroups) {
      const voiced = group.entries.filter((e) => e.sound).length
      play.append(
        el(
          'div',
          { class: 'group-name' },
          group.name,
          el('i', {}, ` · ${group.entries.length} 個${voiced > 0 ? `，${voiced} 個有語音` : ''}`),
        ),
      )
      const chips = el('div', { class: 'chips' })
      group.entries.forEach((entry) => {
        const b = el('button', {}, `${entry.index}${entry.sound ? ' ♪' : ''}`)
        b.addEventListener('click', () => {
          bench.playMotion(group.name, entry.index)
          setStatus(`播放 ${group.name}[${entry.index}]`)
        })
        chips.append(b)
      })
      play.append(chips)
    }
    if (s.expressions.length > 0) {
      play.append(el('div', { class: 'group-name' }, '表情', el('i', {}, ` · ${s.expressions.length} 個`)))
      const chips = el('div', { class: 'chips' })
      s.expressions.forEach((e) => {
        const b = el('button', {}, e.id)
        b.addEventListener('click', () => {
          bench.setExpression(e.id)
          setStatus(`表情 ${e.id}`)
        })
        chips.append(b)
      })
      play.append(chips)
    }
  }
  right.append(play)

  // Framing.
  const frame = el('div', { class: 'card' })
  frame.append(el('h2', {}, '構圖'))
  const slider = (
    label: string,
    key: keyof Framing,
    min: number,
    max: number,
    step: number,
  ) => {
    const wrap = el('label', { class: 'slider' })
    const value = el('b', {}, framing[key].toFixed(3))
    wrap.append(el('div', { class: 'lab' }, el('span', {}, label), value))
    const input = el('input', {
      type: 'range',
      min: String(min),
      max: String(max),
      step: String(step),
    }) as HTMLInputElement
    input.value = String(framing[key])
    input.addEventListener('input', () => {
      framing = { ...framing, [key]: Number(input.value) }
      value.textContent = framing[key].toFixed(3)
      bench.setFraming(framing)
      renderConfig()
    })
    wrap.append(input)
    return wrap
  }
  frame.append(
    slider('heightRatio', 'heightRatio', 0.5, 3, 0.005),
    slider('position.x', 'x', -0.5, 1.5, 0.005),
    slider('position.y', 'y', -0.5, 2, 0.005),
  )

  const presets = el('div', { class: 'chips' })

  /*
   * Whole-body first, and it is not a convenience.
   *
   * Both game framings crop at the waist -- that is what they are for, the
   * lobby shows a character from the chest up. Which means the bench opened on
   * a view where the legs are not on screen, and a motion that moves the lower
   * body played as a faint wobble of the shoulders and nothing else. The tool
   * was hiding the thing it was being asked about.
   *
   * Deliberately not added to SHARED_FRAMINGS: that list is what the emitter
   * matches against to say "this needs no nudge", and a framing the game does
   * not have would make it claim a match that cannot be pasted anywhere.
   */
  const fit = el('button', {}, '全身')
  fit.addEventListener('click', () => {
    framing = { heightRatio: 0.88, x: 0.5, y: 0.5 }
    bench.setFraming(framing)
    render()
  })
  presets.append(fit)

  SHARED_FRAMINGS.forEach(({ name, framing: preset }) => {
    const b = el('button', {}, name)
    b.addEventListener('click', () => {
      framing = { ...preset }
      bench.setFraming(framing)
      render()
    })
    presets.append(b)
  })
  const toggle = el('button', { class: overlayOn ? 'on' : '' }, '輔助框線')
  toggle.addEventListener('click', () => {
    overlayOn = !overlayOn
    bench.setOverlay(overlayOn)
    render()
  })
  presets.append(toggle)
  frame.append(presets)

  if (art) {
    frame.append(
      el(
        'div',
        { class: 'rows', style: 'margin-top:9px' },
        row('作畫範圍', `${Math.round(art.width)} × ${Math.round(art.height)}`),
        row('作畫左上', `${Math.round(art.x)}, ${Math.round(art.y)}`),
      ),
    )
  }
  right.append(frame)

  // The emitted config.
  const out = el('div', { class: 'card' })
  out.append(el('h2', {}, '設定輸出'))
  out.id = 'config-card'
  right.append(out)
  renderConfig()
}

function renderConfig(): void {
  const card = document.getElementById('config-card')
  if (!card) return
  card.textContent = ''
  card.append(el('h2', {}, '設定輸出'))

  if (!settingsReport || !source) {
    card.append(el('div', { class: 'empty' }, '載入模型後，這裡會產生可直接貼進 live2dConfig.ts 的區塊。'))
    return
  }

  const shared = matchesShared(framing)
  card.append(
    el(
      'div',
      { class: 'rows', style: 'margin-bottom:8px' },
      row('構圖', shared ? `${shared}，不需 nudge` : '偏離共用構圖'),
    ),
  )

  const code = emitConfig({
    id: modelId,
    servedPath: source.servedPath,
    settings: settingsReport,
    framing,
  })
  const pre = el('pre', {}, code)
  const copy = el('button', { style: 'margin-top:8px' }, '複製')
  copy.addEventListener('click', () => {
    void navigator.clipboard.writeText(code).then(
      () => setStatus('設定已複製'),
      () => setStatus('複製失敗 —— 手動選取即可'),
    )
  })
  card.append(pre, copy)
}

function render(): void {
  renderLeft()
  renderRight()
}

render()
void use(() => loadBuiltIn(0))
