import actorHaru from '../../assets/actor-haru.webp'

/**
 * Drawn character art for the arena, where there is any.
 *
 * The arena's sprites are shapes baked at boot -- see view/atlas.ts -- which is
 * what let it exist before there was any art at all. This is the other path:
 * a real sheet, loaded, for a character who has one. Only Haru does. Everyone
 * else keeps the shape, and the scene decides which by looking here rather
 * than by knowing anything about who is who.
 *
 * The geometry mirrors what scripts/optimize-assets.mjs writes. Those are the
 * only two places that may know it, and they are wrong together or right
 * together -- a loader told the wrong frame size does not fail, it draws a
 * quarter of one pose and a sliver of the next.
 */

export type ActorAnim = 'idle' | 'attack' | 'levelup' | 'hurt'

export interface ActorSheet {
  /** Texture key, and the animation keys are prefixed with it. */
  key: string
  url: string
  frameWidth: number
  frameHeight: number
  margin: number
  spacing: number
  columns: number
  /** Which row of the sheet each animation is, and how it plays. */
  animations: Record<ActorAnim, { row: number; frameRate: number; repeat: number }>
  /**
   * How tall the character stands in world pixels.
   *
   * Larger than the hitbox, which is a 14px radius. That is the usual bargain
   * in this genre and worth stating: what the player dodges with is the circle,
   * not the silhouette, and a sprite matched to a 28px hitbox would be a
   * thumbnail next to a 44px brute.
   */
  displayHeight: number
}

const ACTORS: Record<string, ActorSheet> = {
  haru: {
    key: 'actor-haru',
    url: actorHaru,
    frameWidth: 128,
    frameHeight: 128,
    margin: 2,
    spacing: 4,
    columns: 6,
    animations: {
      /* Six frames each, one row each, in the order the source sheet labels
         them: 待機 / 攻擊 / 升級 / 受傷. */
      idle: { row: 0, frameRate: 8, repeat: -1 },
      /* Faster than it reads on paper. The attack has to finish inside the
         gap between two volleys of a quick weapon or it never gets past its
         second frame. */
      attack: { row: 1, frameRate: 16, repeat: 0 },
      levelup: { row: 2, frameRate: 9, repeat: 0 },
      hurt: { row: 3, frameRate: 13, repeat: 0 },
    },
    displayHeight: 64,
  },
}

export function actorFor(characterId: string): ActorSheet | null {
  return ACTORS[characterId] ?? null
}
