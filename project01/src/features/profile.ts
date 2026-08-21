import { useSyncExternalStore } from 'react'

/**
 * The account behind the lobby.
 *
 * Until now every currency on screen was a string typed into the markup, and
 * an arena run ended with nothing to show for it. This is the one place those
 * numbers live, so a run can pay into them and four screens can read them.
 *
 * Persisted, because a demo that forgets what you did the moment you reload is
 * a demo that never rewards playing it. Same shape as features/portraits: a
 * module holds the truth, React subscribes.
 */
export interface Profile {
  coins: number
  gems: number
  level: number
  xp: number
  xpToLevel: number

  /* Arena records. Achievements read these rather than keeping their own. */
  runs: number
  bestWave: number
  bestRunKills: number
  totalKills: number
  /** Runs finished without being hit once. */
  flawlessRuns: number
}

/*
 * The starting account is the one the mocks show, so the lobby looks the same
 * on a first visit as it always has. Everything below moves from here.
 */
const STARTING: Profile = {
  coins: 99999,
  gems: 8420,
  level: 34,
  xp: 7569,
  xpToLevel: 18000,
  runs: 0,
  bestWave: 0,
  bestRunKills: 0,
  totalKills: 0,
  flawlessRuns: 0,
}

const STORAGE_KEY = 'l2d-demo:profile:v1'

let profile: Profile = load()

/**
 * What the last finished run paid, for the death panel to show.
 *
 * Deliberately not part of Profile and deliberately not persisted: it is about
 * the run that just ended, and a reward banner from three days ago on a fresh
 * page load would be nonsense. Shares the listener set, so a component reading
 * both wakes once.
 */
let lastReward: RunReward | null = null

const listeners = new Set<() => void>()

function load(): Profile {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object') {
      // Spread over the defaults rather than trusting the stored shape: a
      // profile written by an older build is missing whatever was added since,
      // and a missing number renders as NaN all over the lobby.
      return { ...STARTING, ...(parsed as Partial<Profile>) }
    }
  } catch {
    // Unreadable or blocked storage only costs the save.
  }
  return { ...STARTING }
}

function commit(next: Profile): void {
  profile = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Over quota or blocked -- the session still has it.
  }
  listeners.forEach((notify) => notify())
}

export interface RunResult {
  wave: number
  kills: number
  /** Coins still unspent when the run ended. */
  coins: number
  /** Contact hits taken across the whole run. */
  hitsTaken: number
}

export interface RunReward {
  coins: number
  gems: number
  exp: number
  /** True when this run beat the recorded best wave. */
  record: boolean
}

/**
 * What a run is worth.
 *
 * Waves carry most of it and kills top it up, so pushing one wave further pays
 * better than farming a wave already survived -- otherwise the optimal play is
 * to stand in wave one forever. Unspent coins come home at half rate: enough
 * that hoarding is not punished, little enough that spending in the shop is
 * still the better move.
 */
export function rewardFor(result: RunResult): RunReward {
  return {
    coins: result.wave * 45 + result.kills * 2 + Math.floor(result.coins / 2),
    gems: Math.floor(result.wave / 3) * 4,
    exp: result.wave * 60 + result.kills * 3,
    record: result.wave > profile.bestWave,
  }
}

/** Banks a finished run. What it paid is readable from useLastReward. */
export function recordRun(result: RunResult): RunReward {
  const reward = rewardFor(result)
  const next: Profile = {
    ...profile,
    coins: profile.coins + reward.coins,
    gems: profile.gems + reward.gems,
    xp: profile.xp + reward.exp,
    level: profile.level,
    xpToLevel: profile.xpToLevel,
    runs: profile.runs + 1,
    bestWave: Math.max(profile.bestWave, result.wave),
    bestRunKills: Math.max(profile.bestRunKills, result.kills),
    totalKills: profile.totalKills + result.kills,
    flawlessRuns: profile.flawlessRuns + (result.hitsTaken === 0 && result.wave > 1 ? 1 : 0),
  }

  while (next.xp >= next.xpToLevel) {
    next.xp -= next.xpToLevel
    next.level += 1
    next.xpToLevel = Math.round(12000 + next.level * 220)
  }

  lastReward = reward
  commit(next)
  return reward
}

/** Wipes the account. Only the lobby offers this. */
export function resetProfile(): void {
  commit({ ...STARTING })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getSnapshot = () => profile

export function useProfile(): Profile {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

const getLastReward = () => lastReward

export function useLastReward(): RunReward | null {
  return useSyncExternalStore(subscribe, getLastReward, getLastReward)
}

/** For anything outside React that needs the current numbers. */
export function readProfile(): Profile {
  return profile
}

/** Formats a currency the way the lobby has always shown them. */
export function formatCurrency(value: number): string {
  return value.toLocaleString('en-US')
}
