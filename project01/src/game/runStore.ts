import { useSyncExternalStore } from 'react'
import type { PlayerStats, UpgradeId } from './data/content'
import { BASE_STATS } from './data/content'
import type { ShopOffer } from './data/shop'
import type { RunStatus } from './sim/world'

/**
 * The one-way channel from the arena to the HUD.
 *
 * React must not own any of this. A component that held the run state would
 * re-render on every change, and re-rendering GameCanvas tears down the Phaser
 * game -- which is why the rule is written on GameCanvas itself. So the scene
 * owns the truth and pushes a flat snapshot here; the HUD subscribes to it the
 * same way the roster subscribes to captured portraits.
 *
 * The scene publishes on a timer rather than every step. At 60Hz this would
 * re-render the overlay sixty times a second to move a health bar by a pixel;
 * bars smooth the gap out with a CSS transition instead.
 */
export interface RunSnapshot {
  status: RunStatus
  wave: number
  /** Seconds left in the wave, or in the break before the next one. */
  timeLeft: number
  hp: number
  maxHp: number
  level: number
  /** Fractional once the experience multiplier is above 1; the HUD floors it. */
  xp: number
  xpToLevel: number
  coins: number
  kills: number
  hitsTaken: number
  /** Increments once per finished run, so the lobby is paid exactly once. */
  deaths: number
  /** Live entity counts, so a performance problem is visible rather than felt. */
  enemies: number
  fps: number
  /** Levels earned and not yet spent. Above zero the arena is frozen and the
   *  choice overlay is up. */
  pendingLevels: number
  offers: UpgradeId[]
  /** A copy, not the live block -- the HUD compares snapshots by identity and
   *  would never see a stat that was mutated in place. */
  stats: PlayerStats
  /** The rack, in slot order. Copies for the same reason as the stats. */
  weapons: { kind: number; tier: number }[]
  /** Item ids taken this run. */
  items: string[]
  /** Laid out only while the status is 'shop'. */
  shop: ShopOffer[]
  rerollPrice: number

  /* ---------- the minimap's feed ---------- */
  /**
   * Live positions, as flat x,y pairs, with a count of how many of the buffer
   * is in use.
   *
   * The one thing here that is reused rather than replaced. Everything else in
   * this snapshot is copied because the HUD compares by identity and would
   * never see a value mutated in place -- but these are read by a canvas that
   * draws imperatively on every publish rather than by anything that diffs
   * them, and the snapshot object around them is still new each time, so the
   * redraw always happens. Copying 1400 floats fifteen times a second to
   * satisfy a rule that does not apply here would be a garbage generator
   * dressed as consistency.
   */
  radar: Float32Array
  radarCount: number
  loot: Float32Array
  lootCount: number
  /** Where the player is in the world, which is the only thing that makes the
   *  numbers above mean anything. */
  x: number
  y: number
  /** Which way they are pointing, in radians. Held from the last real input,
   *  so a standing player keeps facing where they were going. */
  facing: number
}

const EMPTY: RunSnapshot = {
  status: 'fighting',
  wave: 1,
  timeLeft: 0,
  hp: 100,
  maxHp: 100,
  level: 1,
  xp: 0,
  xpToLevel: 1,
  coins: 0,
  kills: 0,
  hitsTaken: 0,
  deaths: 0,
  enemies: 0,
  fps: 0,
  pendingLevels: 0,
  offers: [],
  stats: { ...BASE_STATS },
  weapons: [],
  items: [],
  shop: [],
  rerollPrice: 0,
  radar: new Float32Array(0),
  radarCount: 0,
  loot: new Float32Array(0),
  lootCount: 0,
  x: 0,
  y: 0,
  facing: 0,
}

let snapshot: RunSnapshot = EMPTY
const listeners = new Set<() => void>()

/** Replaced rather than mutated: useSyncExternalStore compares by identity, so
 *  an in-place edit would never reach the HUD. */
export function publishRun(next: RunSnapshot): void {
  snapshot = next
  listeners.forEach((notify) => notify())
}

/** Called when the arena unmounts, so a stale run does not flash back up on
 *  the next visit before the first publish. */
export function resetRun(): void {
  publishRun(EMPTY)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getSnapshot = () => snapshot

export function useRunSnapshot(): RunSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/*
 * The one command that goes the other way.
 *
 * A flag rather than a callback registration: the scene may not exist when the
 * button is pressed (React renders the overlay before Phaser finishes booting)
 * and a flag needs nobody to be listening. The scene consumes it every frame,
 * so it can never go stale and fire a restart later.
 */
let restartRequested = false
let upgradeRequested: UpgradeId | null = null

/**
 * Player actions, queued rather than latched.
 *
 * A single pending value would drop the second of two landing in the same
 * frame, and buying is the one action where losing an input costs the player
 * money they cannot see leave.
 *
 * Not shop-only any more: fusing two weapons is the same shape of thing --
 * something the HUD asks for and the simulation decides on -- and it can
 * happen mid-wave, on the equipment sheet.
 */
type RunCommand =
  | { sort: 'buy'; slot: number }
  | { sort: 'reroll' }
  | { sort: 'leave' }
  | { sort: 'merge'; from: number; to: number }
const commandQueue: RunCommand[] = []

export function requestBuy(slot: number): void {
  commandQueue.push({ sort: 'buy', slot })
}

export function requestReroll(): void {
  commandQueue.push({ sort: 'reroll' })
}

export function requestLeaveShop(): void {
  commandQueue.push({ sort: 'leave' })
}

/** Fuses the weapon in one rack slot into another. The simulation decides
 *  whether the pair is legal; the HUD only asks. */
export function requestMerge(from: number, to: number): void {
  commandQueue.push({ sort: 'merge', from, to })
}

export function drainCommands(): RunCommand[] {
  if (commandQueue.length === 0) {
    return EMPTY_COMMANDS
  }
  return commandQueue.splice(0, commandQueue.length)
}

/** Shared, so the common case of nothing queued allocates nothing. */
const EMPTY_COMMANDS: RunCommand[] = []

export function requestRestart(): void {
  restartRequested = true
}

export function consumeRestart(): boolean {
  const requested = restartRequested
  restartRequested = false
  return requested
}

export function requestUpgrade(id: UpgradeId): void {
  upgradeRequested = id
}

export function consumeUpgrade(): UpgradeId | null {
  const requested = upgradeRequested
  upgradeRequested = null
  return requested
}
