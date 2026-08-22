import { useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { Emblem, type EmblemTone } from '../components/Emblem'
import {
  MAX_WEAPON_SLOTS,
  WEAPONS,
  canMerge,
  tierDamageScale,
  tierRateScale,
} from '../game/data/content'
import { requestMerge } from '../game/runStore'
import type { RunSnapshot } from '../game/runStore'

/**
 * The rack, as slots you can drag one onto another to fuse.
 *
 * Pointer events rather than HTML drag-and-drop. Native DnD brings a drag
 * image nobody asked for, a drop protocol built for text and files, and
 * behaviour that differs between browsers on exactly the details this needs --
 * where the pointer is, and what is under it. Six slots and a ghost is less
 * code done directly.
 *
 * The simulation decides whether a fusion is legal; this only asks, through
 * the same queue a purchase goes through. What it does know in advance is
 * `canMerge`, shared with the simulation, so the slots a dragged weapon could
 * land on can light up before it is dropped -- a rule the player cannot see
 * until they have already failed it is a rule they will think is broken.
 */

const TIER_MARK = ['', 'I', 'II', 'III', 'IV']
const RARITY_BY_TIER: EmblemTone[] = ['common', 'common', 'rare', 'epic', 'legend']
const hexOf = (tint: number) => `#${tint.toString(16).padStart(6, '0')}`

/** How long the ghost takes to fall back into the slot it came from. Long
 *  enough to read as a refusal, short enough not to be a penalty. */
const SNAP_BACK_MS = 170

interface Drag {
  from: number
  /** Where the ghost is now, in page coordinates. */
  x: number
  y: number
  /** Grab offset, so the ghost stays under the same part of the slot rather
   *  than jumping its centre to the cursor. */
  dx: number
  dy: number
  /** Set on release when the drop was refused: the ghost animates home rather
   *  than vanishing, which is what tells the player the drop was seen and
   *  rejected instead of missed. */
  rejected?: { x: number; y: number }
}

interface WeaponGridProps {
  run: RunSnapshot
  /** Adds each weapon's live numbers under its name. Off in the shop, where
   *  the column is narrow and the cards are what wants reading. */
  detailed?: boolean
}

export function WeaponGrid({ run, detailed = false }: WeaponGridProps) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const gridRef = useRef<HTMLUListElement>(null)

  const weapons = run.weapons
  const dragging = drag && !drag.rejected ? weapons[drag.from] : undefined

  /* Which slot the pointer is over, by asking the document rather than by
     keeping a table of rectangles: the grid reflows whenever a fusion removes
     a slot, and cached rectangles would be stale exactly when it matters. */
  const slotUnder = (x: number, y: number): number => {
    const el = document.elementFromPoint(x, y)?.closest('[data-slot]')
    const index = el?.getAttribute('data-slot')
    return index === null || index === undefined ? -1 : Number(index)
  }

  const onPointerDown = (event: PointerEvent<HTMLLIElement>, from: number) => {
    if (!weapons[from]) {
      return
    }
    const box = event.currentTarget.getBoundingClientRect()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({
      from,
      x: event.clientX,
      y: event.clientY,
      dx: event.clientX - box.left,
      dy: event.clientY - box.top,
    })
  }

  const onPointerMove = (event: PointerEvent<HTMLLIElement>) => {
    setDrag((current) =>
      current && !current.rejected
        ? { ...current, x: event.clientX, y: event.clientY }
        : current,
    )
  }

  const onPointerUp = (event: PointerEvent<HTMLLIElement>) => {
    if (!drag || drag.rejected) {
      return
    }
    const to = slotUnder(event.clientX, event.clientY)
    if (to >= 0 && canMerge(weapons[drag.from], weapons[to])) {
      requestMerge(drag.from, to)
      setDrag(null)
      return
    }

    /* Refused. The ghost goes back where it came from, and the slot it came
       from is worked out now rather than remembered: it has not moved, and
       reading it here means one less thing to keep in sync. */
    const home = gridRef.current
      ?.querySelector(`[data-slot="${drag.from}"]`)
      ?.getBoundingClientRect()
    if (!home) {
      setDrag(null)
      return
    }
    setDrag({ ...drag, rejected: { x: home.left + drag.dx, y: home.top + drag.dy } })
    window.setTimeout(() => setDrag(null), SNAP_BACK_MS)
  }

  const ghost = drag ? (drag.rejected ?? { x: drag.x, y: drag.y }) : null

  return (
    <>
      <ul className="grid" ref={gridRef}>
        {Array.from({ length: MAX_WEAPON_SLOTS }, (_, slot) => {
          const held = weapons[slot]
          if (!held) {
            return (
              <li key={`empty-${slot}`} className="grid-cell is-empty" data-slot={slot}>
                <span className="grid-empty-mark" />
              </li>
            )
          }

          const weapon = WEAPONS[held.kind]
          const tone = RARITY_BY_TIER[held.tier] ?? 'common'
          const isSource = drag?.from === slot && !drag.rejected
          // Lit while something is being dragged that this slot would take.
          const isTarget = dragging !== undefined && slot !== drag?.from && canMerge(dragging, held)

          return (
            <li
              key={`${held.kind}-${held.tier}-${slot}`}
              data-slot={slot}
              className={[
                'grid-cell',
                `tone-${tone}`,
                isSource ? 'is-source' : '',
                isTarget ? 'is-target' : '',
                dragging !== undefined && !isTarget && !isSource ? 'is-dimmed' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ '--weapon-tint': hexOf(weapon.tint) } as CSSProperties}
              onPointerDown={(event) => onPointerDown(event, slot)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => setDrag(null)}
            >
              <Emblem className="grid-art" frame="ring" glyph="swords" tone={tone} />
              <span className="grid-name">{weapon.label}</span>
              <span className="grid-tier">{TIER_MARK[held.tier]}</span>
              {detailed ? (
                <span className="grid-numbers">
                  {(weapon.damage * tierDamageScale(held.tier)).toFixed(1)} 傷 ·{' '}
                  {(weapon.cooldown / tierRateScale(held.tier)).toFixed(2)}s
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>

      {/* The dragged slot, following the pointer. Outside the grid's flow and
          deaf to the pointer, so what is under the cursor is the slot beneath
          it rather than the thing being carried.

          It is `position: fixed` against pointer coordinates, and the panel
          above it has a transform left behind by its open animation -- which
          makes that panel, not the viewport, the containing block. It happens
          to be exactly the viewport (inset 0, no border, so its padding box is
          the whole screen) and the ghost lands within 3px of the cursor,
          measured. Give the panel a border or an offset and this drifts by
          exactly that much. */}
      {drag && ghost && weapons[drag.from] ? (
        <div
          className={`grid-ghost${drag.rejected ? ' is-returning' : ''}`}
          style={
            {
              left: `${ghost.x - drag.dx}px`,
              top: `${ghost.y - drag.dy}px`,
              '--weapon-tint': hexOf(WEAPONS[weapons[drag.from].kind].tint),
              '--snap-back': `${SNAP_BACK_MS}ms`,
            } as CSSProperties
          }
        >
          <Emblem
            className="grid-art"
            frame="ring"
            glyph="swords"
            tone={RARITY_BY_TIER[weapons[drag.from].tier] ?? 'common'}
          />
          <span className="grid-name">{WEAPONS[weapons[drag.from].kind].label}</span>
          <span className="grid-tier">{TIER_MARK[weapons[drag.from].tier]}</span>
        </div>
      ) : null}
    </>
  )
}
