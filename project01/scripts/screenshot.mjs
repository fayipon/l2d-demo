/**
 * Screenshots a route from the running dev server.
 *
 * Exists because tuning a screen against a mock by description alone does not
 * converge -- several rounds of "still not right" on the story screen were all
 * spent adjusting numbers that could have been checked in a second.
 *
 * Drives the Chrome already installed on the machine through puppeteer-core,
 * so there is no second browser to download.
 *
 *   npm run shot -- story
 *   npm run shot -- story --out story.png --clip 0,0,400,900
 *   npm run shot -- achievements --click ".ach-tab:nth-child(3)"
 *
 * --clip takes x,y,width,height in CSS pixels, for looking at one component
 * rather than the whole screen.
 *
 * --click takes CSS selectors separated by ">>" and clicks them in order
 * before the shot, which is the only way to see a state that needs a tab or a
 * filter -- half a screen's rules only apply to something that has been picked.
 */
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

// Split flags from positionals first; working it out per-argument gets the
// value of `--out story.png` mistaken for the route.
const args = process.argv.slice(2)
const flags = new Map()
const positional = []
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    flags.set(args[i].slice(2), args[++i])
  } else {
    positional.push(args[i])
  }
}
const flag = (name, fallback) => flags.get(name) ?? fallback

/*
 * Accepts "story" as well as "/story". Git Bash on Windows rewrites a leading
 * slash into a filesystem path before node ever sees it -- "/story" arrives as
 * "C:/Program Files/Git/story" -- so the leading slash cannot be required, and
 * anything that arrives looking like a path is trimmed back to its last
 * segment.
 */
const rawRoute = positional[0] ?? "/"
const route = `/${rawRoute.split(/[\\/]/).pop()}`
const base = flag('base', 'http://localhost:5173')
const out = resolve(root, '.shots', flag('out', 'shot.png'))
const width = Number(flag('width', 1600))
const height = Number(flag('height', 900))
const clip = flag('clip')
const wait = Number(flag('wait', 1500))
const clicks = (flag('click') ?? '').split('>>').map((c) => c.trim()).filter(Boolean)

const { existsSync } = await import('node:fs')
const executablePath = CHROME_CANDIDATES.find((p) => p && existsSync(p))
if (!executablePath) {
  throw new Error('no Chrome or Edge found; pass one with --chrome')
}

const browser = await puppeteer.launch({
  executablePath: flag('chrome', executablePath),
  headless: true,
  args: ['--hide-scrollbars', '--force-device-scale-factor=1'],
})

try {
  const page = await browser.newPage()
  await page.setViewport({ width, height, deviceScaleFactor: 1 })

  const problems = []
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`))
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))

  await page.goto(`${base}${route}`, { waitUntil: 'networkidle2', timeout: 30000 })
  // The Live2D model and the HUD fade-in both settle after load, and a shot
  // taken mid-animation is not what the screen looks like.
  await new Promise((r) => setTimeout(r, wait))

  for (const selector of clicks) {
    await page.click(selector)
    // Long enough for a CSS transition to finish; React has already rerendered.
    await new Promise((r) => setTimeout(r, 350))
  }

  await mkdir(dirname(out), { recursive: true })
  await page.screenshot({
    path: out,
    clip: clip
      ? (([x, y, w, h]) => ({ x, y, width: w, height: h }))(clip.split(',').map(Number))
      : undefined,
  })

  console.log(`${base}${route} -> ${out}`)
  if (problems.length) {
    console.log(`page reported ${problems.length} problem(s):`)
    problems.forEach((p) => console.log(`  ${p}`))
  }
} finally {
  await browser.close()
}
