import { useSyncExternalStore } from 'react'
import type { PlayerStats, UpgradeId } from './data/content'
import { BASE_STATS } from './data/content'
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
  xp: number
  xpToLevel: number
  coins: number
  kills: number
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
  enemies: 0,
  fps: 0,
  pendingLevels: 0,
  offers: [],
  stats: { ...BASE_STATS },
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
