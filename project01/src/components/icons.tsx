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
  lock: (
    <>
      <rect x="5" y="10.4" width="14" height="9.4" rx="1.8" />
      <path d="M8.2 10.4V7.8a3.8 3.8 0 0 1 7.6 0v2.6" />
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
