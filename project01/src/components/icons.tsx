import type { ReactElement } from 'react'

/**
 * Line icons for the HUD. Emoji render differently per platform and cannot be
 * tinted, so the mock's thin white glyphs are drawn as inline SVG instead.
 */
export type IconName =
  | 'book'
  | 'sword'
  | 'compass'
  | 'mail'
  | 'gift'
  | 'trophy'
  | 'friends'
  | 'menu'
  | 'coin'
  | 'gem'
  | 'soundOn'
  | 'soundOff'
  | 'pencil'
  | 'back'
  | 'star'
  | 'chat'
  | 'face'
  | 'lock'
  | 'moon'
  | 'burst'
  | 'shield'
  | 'sigil'
  | 'home'
  | 'chevron'
  | 'swords'
  | 'exp'
  | 'skull'
  | 'banner'
  | 'person'
  | 'check'
  | 'sparkle'
  | 'heart'
  | 'droplet'
  | 'bolt'
  | 'crosshair'
  | 'scatter'
  | 'eye'
  | 'axe'
  | 'bow'
  | 'flame'

const PATHS: Record<IconName, ReactElement> = {
  book: (
    <>
      <path d="M12 6.6C10.2 5.2 7.7 4.6 4 4.6v12.8c3.7 0 6.2.6 8 2 1.8-1.4 4.3-2 8-2V4.6c-3.7 0-6.2.6-8 2Z" />
      <path d="M12 6.6v12.8" />
    </>
  ),
  sword: (
    <>
      <path d="M12 3 14.2 8.4v7.1h-4.4V8.4L12 3Z" />
      <path d="M8.4 15.5h7.2" />
      <path d="M12 15.5V21" />
      <path d="M9.8 18.4h4.4" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="m15.4 8.6-1.9 4.9-4.9 1.9 1.9-4.9 4.9-1.9Z" />
    </>
  ),
  mail: (
    <>
      <rect x="3.2" y="5.6" width="17.6" height="12.8" rx="1.6" />
      <path d="m3.8 7 8.2 6 8.2-6" />
    </>
  ),
  gift: (
    <>
      <rect x="3.4" y="9.6" width="17.2" height="10.8" rx="1.4" />
      <path d="M2.6 9.6h18.8M12 9.6v10.8" />
      <path d="M12 9.6C10.4 6.6 9.2 5 7.8 5a2.1 2.1 0 0 0 0 4.6ZM12 9.6c1.6-3 2.8-4.6 4.2-4.6a2.1 2.1 0 0 1 0 4.6Z" />
    </>
  ),
  trophy: (
    <>
      <path d="M7.4 4.4h9.2v5a4.6 4.6 0 0 1-9.2 0v-5Z" />
      <path d="M7.4 6h-3v1.6A3.4 3.4 0 0 0 7.8 11M16.6 6h3v1.6A3.4 3.4 0 0 1 16.2 11" />
      <path d="M12 14v3.4M8.4 20h7.2l-.8-2.6H9.2L8.4 20Z" />
    </>
  ),
  friends: (
    <>
      <circle cx="9.2" cy="8.4" r="3.2" />
      <path d="M3.4 19.4c0-3.2 2.6-5.4 5.8-5.4s5.8 2.2 5.8 5.4" />
      <path d="M16 6.1a3.2 3.2 0 0 1 0 6.1M16.6 14.4c2.4.5 4 2.5 4 5" />
    </>
  ),
  menu: (
    <>
      <path d="M4 6.6h16M4 12h16M4 17.4h16" />
      <circle cx="4.2" cy="6.6" r="0.1" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="8.6" fill="#ffcf4a" stroke="#c98a10" />
      <circle cx="12" cy="12" r="5.6" fill="none" stroke="#c98a10" />
    </>
  ),
  gem: (
    <>
      <path d="M12 3.4 21 10l-9 10.6L3 10l9-6.6Z" fill="#4fc3ff" stroke="#1173c4" />
      <path d="M3 10h18M12 3.4 8.4 10l3.6 10.6L15.6 10 12 3.4Z" fill="none" stroke="#1173c4" />
    </>
  ),
  soundOn: (
    <>
      <path d="M4.6 9.4h3l4-3.4v12l-4-3.4h-3v-5.2Z" />
      <path d="M15 9.2a3.8 3.8 0 0 1 0 5.6M17.6 6.8a7.4 7.4 0 0 1 0 10.4" />
    </>
  ),
  soundOff: (
    <>
      <path d="M4.6 9.4h3l4-3.4v12l-4-3.4h-3v-5.2Z" />
      <path d="m15.4 9.6 5 4.8M20.4 9.6l-5 4.8" />
    </>
  ),
  pencil: <path d="m4.8 19.2 3.5-.8 10-10a1.9 1.9 0 0 0-2.7-2.7l-10 10-.8 3.5Z" />,
  back: <path d="M14.6 5.4 8 12l6.6 6.6" />,
  // Solid body, stroked shackle: an outlined body disappears against the busy
  // chapter art it now sits on.
  lock: (
    <>
      <path d="M8.2 10.4V7.8a3.8 3.8 0 0 1 7.6 0v2.6" />
      <rect x="5" y="10.4" width="14" height="9.4" rx="1.8" fill="currentColor" stroke="none" />
    </>
  ),
  sigil: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 1.6v6.2M12 16.2v6.2M1.6 12h6.2M16.2 12h6.2" />
      <path d="m6.2 6.2 3.1 3.1M14.7 14.7l3.1 3.1M17.8 6.2l-3.1 3.1M9.3 14.7l-3.1 3.1" />
    </>
  ),
  home: (
    <>
      <path d="M3.6 10.6 12 3.4l8.4 7.2" />
      <path d="M5.8 9.4V19a1.4 1.4 0 0 0 1.4 1.4h9.6A1.4 1.4 0 0 0 18.2 19V9.4" />
    </>
  ),
  chevron: <path d="m9.4 5.4 6.6 6.6-6.6 6.6" />,
  /*
   * Crossed swords: two full diagonals that meet in the middle, a guard across
   * each near its hilt, and a short grip past it. Both earlier versions failed
   * at small sizes -- corner brackets on the tips read as arrowheads, and
   * crossing the blades low down read as a single V.
   */
  swords: (
    <>
      <path d="M20.6 3.4 7.6 16.4" strokeWidth={2.6} />
      <path d="M3.4 3.4 16.4 16.4" strokeWidth={2.6} />
      <path d="M6.2 13.8 10.2 17.8" strokeWidth={1.6} />
      <path d="M17.8 13.8 13.8 17.8" strokeWidth={1.6} />
      <path d="M7.6 16.4 5.2 18.8" strokeWidth={2} />
      <path d="M16.4 16.4 18.8 18.8" strokeWidth={2} />
    </>
  ),
  exp: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M9 9.2h6M12 9.2v5.6" />
    </>
  ),
  /*
   * The next three are solid rather than stroked because their only job is to
   * sit in the middle of an achievement medallion at about 20px, where a 1.7px
   * outline turns into a grey smudge. Sockets and cut-outs are holes in the
   * same path, punched with evenodd, so the glyph is one colour and works over
   * whatever the plate behind it happens to be.
   */
  skull: (
    <path
      fillRule="evenodd"
      fill="currentColor"
      stroke="none"
      d="M12 2.6c-4.6 0-7.7 3.2-7.7 7.6 0 2.5 1 4.5 2.5 5.8v2.4c0 1 .8 1.8 1.8 1.8h.7v1.6h1.6v-1.6h2.2v1.6h1.6v-1.6h.7c1 0 1.8-.8 1.8-1.8v-2.4c1.5-1.3 2.5-3.3 2.5-5.8 0-4.4-3.1-7.6-7.7-7.6ZM6.9 10.6a2.1 2.4 0 0 1 4.2 0 2.1 2.4 0 0 1-4.2 0ZM12.9 10.6a2.1 2.4 0 0 1 4.2 0 2.1 2.4 0 0 1-4.2 0ZM12 13.4 10.6 16.2h2.8L12 13.4Z"
    />
  ),
  banner: (
    <path
      fillRule="evenodd"
      fill="currentColor"
      stroke="none"
      d="M5.6 2.8h12.8v18.4L12 17.4l-6.4 3.8V2.8ZM11.2 6h1.6v2.2H15v1.6h-2.2V12h-1.6V9.8H9V8.2h2.2V6Z"
    />
  ),
  person: (
    <path
      fill="currentColor"
      stroke="none"
      d="M12 3.6a3.9 3.9 0 1 0 0 7.8 3.9 3.9 0 0 0 0-7.8ZM12 12.8c-4.2 0-7 2.6-7 6V21h14v-2.2c0-3.4-2.8-6-7-6Z"
    />
  ),
  check: <path d="m5 12.6 4.6 4.6L19 7.6" strokeWidth={2.2} />,
  /* The flourish either side of the ACHIEVEMENTS title. */
  sparkle: (
    <path
      fill="currentColor"
      stroke="none"
      d="M12 1.6c.8 6 4.4 9.6 10.4 10.4-6 .8-9.6 4.4-10.4 10.4-.8-6-4.4-9.6-10.4-10.4C7.6 11.2 11.2 7.6 12 1.6Z"
    />
  ),
  /* The arena's stat glyphs. Solid, because they are read at a glance on an
     upgrade card rather than studied. */
  heart: (
    <path
      fill="currentColor"
      stroke="none"
      d="M12 20.8C6.4 16.8 3.2 13.4 3.2 9.6a4.8 4.8 0 0 1 8.8-2.7 4.8 4.8 0 0 1 8.8 2.7c0 3.8-3.2 7.2-8.8 11.2Z"
    />
  ),
  droplet: (
    <path
      fill="currentColor"
      stroke="none"
      d="M12 2.6c3.6 4.4 5.6 7.4 5.6 10a5.6 5.6 0 0 1-11.2 0c0-2.6 2-5.6 5.6-10Z"
    />
  ),
  bolt: (
    <path
      fill="currentColor"
      stroke="none"
      d="M13.6 2 5.8 13.4h4.5L9.2 22l8.8-11.8h-5.2L13.6 2Z"
    />
  ),
  crosshair: (
    <>
      <circle cx="12" cy="12" r="7.2" />
      <path d="M12 1.8v3.8M12 18.4v3.8M1.8 12h3.8M18.4 12h3.8" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
    </>
  ),
  /* Melee attack power. An axe head rather than another sword: the plain
     sword is already the universal attack stat, and two swords side by side on
     the same strip would be one glyph asked to mean two things. */
  axe: (
    <>
      <path d="M13.5 4.2 6 11.7l2.4 2.4 7.5-7.5a4.4 4.4 0 0 0-2.4-2.4Z" />
      <path d="M8.4 13.2 4 20.4l7.2-4.4" strokeWidth={1.7} />
    </>
  ),
  /* Ranged attack power. A drawn bow: the crosshair is taken by the range
     stat, which is a different thing -- how far, not how hard. */
  bow: (
    <>
      <path d="M6.6 3.8a13 13 0 0 1 0 16.4" />
      <path d="M6.6 3.8 19 12 6.6 20.2" strokeWidth={1.3} />
      <path d="M9.4 12h9.2" strokeWidth={1.7} />
    </>
  ),
  /* Elemental attack power. */
  flame: (
    <path d="M12 2.8c3.4 3.5 5.6 6.2 5.6 9.4a5.6 5.6 0 0 1-11.2 0c0-1.7.8-3.2 2.1-4.7.5 1 1.1 1.7 1.9 2.1.5-2.6.4-4.6 1.6-6.8Z" />
  ),
  /* The vision stat. An iris rather than a lens: the shape has to still read
     as an eye at sixteen pixels on the stat strip. */
  eye: (
    <>
      <path d="M2.4 12S6.2 5.6 12 5.6 21.6 12 21.6 12 17.8 18.4 12 18.4 2.4 12 2.4 12Z" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    </>
  ),
  /* Three shots leaving one muzzle -- the projectile-count upgrade. */
  scatter: (
    <>
      <path d="M12 21.6 8.2 15.6M12 21.6V14.6M12 21.6l3.8-6" strokeWidth={1.6} />
      <circle cx="7.5" cy="13.4" r="2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12.2" r="2" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="13.4" r="2" fill="currentColor" stroke="none" />
    </>
  ),
  moon: <path d="M20 14.4A8.4 8.4 0 0 1 9.6 4 8.4 8.4 0 1 0 20 14.4Z" />,
  burst: (
    <>
      <path d="m12 2.8 2.3 5.1 5.1 2.3-5.1 2.3-2.3 5.1-2.3-5.1L4.6 10.2l5.1-2.3L12 2.8Z" />
      <path d="M18.4 16.6l.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9.9-2Z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.2 19 5.8v5.6c0 4-2.8 7.5-7 9.4-4.2-1.9-7-5.4-7-9.4V5.8l7-2.6Z" />
      <path d="m9 12 2.2 2.2L15.4 10" />
    </>
  ),
  star: (
    <path
      d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 17l-5.3 2.8 1.1-5.9L3.5 9.8l5.9-.8L12 3.6Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  chat: (
    <>
      <path d="M20.4 12.6c0 3.7-3.8 6.6-8.4 6.6-1 0-2-.1-2.9-.4L4.2 20.4l1.3-3.7c-1.3-1.2-2-2.7-2-4.4 0-3.7 3.8-6.7 8.5-6.7s8.4 3 8.4 6.7Z" />
      <path d="M8.6 12.4h.1M12 12.4h.1M15.4 12.4h.1" />
    </>
  ),
  face: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M9 10.2h.1M15 10.2h.1" />
      <path d="M8.8 14.4a4 4 0 0 0 6.4 0" />
    </>
  ),
}

interface IconProps {
  name: IconName
  className?: string
}

export function Icon({ name, className }: IconProps) {
  const colored = name === 'coin' || name === 'gem'
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke={colored ? undefined : 'currentColor'}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  )
}
