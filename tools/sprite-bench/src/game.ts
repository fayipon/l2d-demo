/**
 * What project01 currently believes about sprite sheets.
 *
 * This is a copy, and copies are what this whole tool exists to catch, so it
 * needs saying why it is one. The bench must run against a sheet that has
 * never been near the game, on a machine where project01 may not even be
 * installed, and importing from `../../project01/src` would make the bench
 * fail to build whenever the game does -- see the note in
 * `tools/l2d-viewer/README.md`, which reaches the same conclusion for the same
 * reason.
 *
 * So there are now THREE places that know these numbers:
 *
 *   project01/scripts/optimize-assets.mjs   writes sheets with them
 *   project01/src/game/data/actors.ts       reads sheets with them
 *   here                                    checks sheets against them
 *
 * The first two are wrong together or right together and say so in their own
 * comments. This third one is different in kind: it is a HYPOTHESIS about a
 * sheet, printed on screen next to the answer, rather than a number anything
 * is loaded with. If it drifts from the game the bench reports a mismatch that
 * is not there, which is loud -- the failure mode of the other two is silent,
 * which is why they get a bench and this does not.
 *
 * Move these when project01 moves.
 */
export const GAME_GRID = {
  /** optimize-assets.mjs: SPRITE_FRAME / SPRITE_MARGIN / SPRITE_SPACING. */
  frameWidth: 128,
  frameHeight: 128,
  margin: 2,
  spacing: 4,
  /** actors.ts: haru is 6 columns of 4 rows. */
  columns: 6,
  rows: 4,
} as const

/**
 * How tall a character stands in the arena, in world pixels, and what that is
 * on screen.
 *
 * `ArenaScene` scales the actor by `displayHeight / frameHeight` and the
 * camera is zoomed by RENDER_SCALE onto a canvas that is RENDER_SCALE times
 * the window -- the two cancel, so a 64 world-pixel character is 64 CSS pixels
 * of a nominally sized arena, drawn from twice that many texture pixels.
 *
 * The bench draws its arena-scale preview at exactly that height. It is the
 * number that decides whether a sheet reads at all, and it is much smaller
 * than the size art gets judged at.
 */
export const ARENA = {
  displayHeight: 64,
  renderScale: 2,
} as const

/** The frame rates in `actors.ts` today, offered as starting points on the
 *  sliders. They were tuned by editing that file and restarting a run, which
 *  is the chore this bench removes. */
export const GAME_RATES: Record<string, { frameRate: number; repeat: number }> = {
  idle: { frameRate: 8, repeat: -1 },
  attack: { frameRate: 16, repeat: 0 },
  levelup: { frameRate: 9, repeat: 0 },
  hurt: { frameRate: 13, repeat: 0 },
}

/** The animation names `ActorAnim` allows. A sheet whose bands do not map onto
 *  these is not wrong -- the mushroom's move/death rows are perfectly sensible
 *  -- but it is a sheet the game's union type cannot name yet, and the emitted
 *  block says so. */
export const ACTOR_ANIMS = ['idle', 'attack', 'levelup', 'hurt'] as const
