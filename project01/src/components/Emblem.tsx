import { Icon, type IconName } from './icons'
import './emblem.css'

/**
 * The medallion an achievement is shown by.
 *
 * The mock draws these as rendered art -- an engraved shield or a spiked ring
 * with a sigil in the middle, tinted by how rare the achievement is. There is
 * no such art here, so it is assembled instead: a frame, a plate, and one of
 * the HUD glyphs in the middle, all coloured from a single tone variable. That
 * keeps it a file swap later -- an <img> replaces this component and nothing
 * else changes.
 *
 * Colour comes through CSS custom properties rather than SVG gradients on
 * purpose. Gradients need document-unique ids, which means a useId per
 * instance and a defs block per medallion, and there are a dozen of these on
 * screen at once.
 */
export type EmblemFrame = 'shield' | 'ring'
export type EmblemTone = 'common' | 'rare' | 'epic' | 'legend'

interface EmblemProps {
  frame: EmblemFrame
  glyph: IconName
  tone: EmblemTone
  /** Dims the whole medallion, for an achievement that is still out of reach. */
  dim?: boolean
  className?: string
}

/**
 * The eight spikes around the ring frame, as triangles pointing outwards.
 * Built once at module scope: the geometry never changes, and hand-writing
 * sixteen rotated coordinates is how it ends up subtly lopsided.
 */
const SPIKES = Array.from({ length: 8 }, (_, i) => {
  const angle = (i * Math.PI) / 4 - Math.PI / 2
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  // Perpendicular to the spike's own axis, for the base corners.
  const px = -sin
  const py = cos
  // The cardinal spikes are the long ones, which is what stops the ring from
  // reading as a cog.
  const tipR = i % 2 === 0 ? 31 : 27.5
  const baseR = 22
  const halfW = i % 2 === 0 ? 3.6 : 2.8
  const p = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`
  return [
    `M${p(32 + cos * tipR, 32 + sin * tipR)}`,
    `L${p(32 + cos * baseR + px * halfW, 32 + sin * baseR + py * halfW)}`,
    `L${p(32 + cos * baseR - px * halfW, 32 + sin * baseR - py * halfW)}`,
    'Z',
  ].join('')
}).join(' ')

const SHIELD_OUTER = 'M32 2.6 59.4 12.4v21.9C59.4 48.8 47.8 57.8 32 61.4 16.2 57.8 4.6 48.8 4.6 34.3V12.4L32 2.6Z'
const SHIELD_INNER = 'M32 9.4 53 16.9v17.4c0 11.3-9 18.4-21 21.2-12-2.8-21-9.9-21-21.2V16.9L32 9.4Z'

export function Emblem({ frame, glyph, tone, dim, className }: EmblemProps) {
  const classes = ['emblem', `emblem-${tone}`, dim ? 'is-dim' : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes} aria-hidden="true">
      <svg className="emblem-frame" viewBox="0 0 64 64" focusable="false">
        {frame === 'shield' ? (
          <>
            <path className="emblem-plate" d={SHIELD_OUTER} />
            <path className="emblem-edge" d={SHIELD_OUTER} />
            <path className="emblem-inlay" d={SHIELD_INNER} />
          </>
        ) : (
          <>
            <path className="emblem-edge emblem-spikes" d={SPIKES} />
            <circle className="emblem-plate" cx="32" cy="32" r="24" />
            <circle className="emblem-edge" cx="32" cy="32" r="24" />
            <circle className="emblem-inlay" cx="32" cy="32" r="18.5" />
          </>
        )}
      </svg>
      <Icon name={glyph} className="emblem-glyph" />
    </span>
  )
}
