/**
 * Builds the bench's test fixture: HARU改, which is Haru with a recoloured
 * upper garment.
 *
 * Why a fixture at all. A bench needs something to be checked *against* -- a
 * model where what should happen is already known, so that when the tool says
 * something surprising the tool is the suspect rather than the model. The four
 * models it serves out of project01 are not that: they are the subject, they
 * belong to the game, and they will change when the game changes. A fixture
 * that moves when the thing under test moves is not a fixture.
 *
 * Why it is a complete, self-contained folder rather than one texture pointing
 * at project01's Haru for the rest. Two reasons, and the second is the real one:
 *
 *   - It stays put. project01 owns its models; this one is the bench's.
 *   - **It can be dragged in.** The folder-drop path is the tool's headline
 *     feature and the only part of it never exercised by hand -- see the note
 *     in FINISH/live2d-model-viewer.md. A fixture that is a real folder makes
 *     testing it a drag rather than a hunt for a model to try.
 *
 * The voice clips are left out, which drops 645 kB and gains a second test
 * case: with no Sound anywhere the emitter takes its "no motion carries a
 * Sound" branch, which until now only Mao exercised.
 *
 * Run with `npm run fixture`. Output is committed, so a normal `npm run dev`
 * never needs sharp.
 */
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const tool = resolve(here, '..')
const repo = resolve(tool, '../..')
/* The shipped model is project01's; the source textures are the repo's, beside
   the rest of the art. Two different roots, which is the arrangement
   optimize-assets.mjs already keeps and the reason it is spelled out here. */
const SRC_SHIPPED = resolve(repo, 'project01/public/live2d/haru')
const SRC_DESIGN = resolve(repo, 'DESIGN/live2d/haru/Haru.2048')
const OUT = resolve(tool, 'fixtures/haru-kai')

/** The same settings project01 uses. Lossy alpha frays a silhouette, so the
 *  alpha channel stays bit-exact while the colour channels compress. */
const TEXTURE_WEBP = { quality: 92, alphaQuality: 100, effort: 6 }

/**
 * The recolour.
 *
 * Haru's uniform is a desaturated navy -- hsl(227, 13%, 21%) measured off the
 * middle of the vest panel. Crimson is where it is going, because the roster
 * gives Haru the accent #ff2b3d and the title 緋月劍士 -- 緋 is crimson -- and
 * neither is currently anywhere on her.
 *
 * `hue` is not a rotation in HSL, which is worth knowing before turning it:
 * sharp rotates in a linear space, so +130 on a measured 227 landed at 21 and
 * not at the 357 the arithmetic promised. These numbers were arrived at by
 * measuring the result and correcting, not by computing them -- see
 * scripts/probe-colour.mjs, which is what does the measuring.
 *
 * The saturation lift is the other half. Rotating a 13%-saturated near-grey
 * gives a differently-tinted near-grey; without the lift this reads as mud
 * rather than as a colour anybody chose.
 */
const RECOLOUR = { hue: 99, saturation: 3.8, brightness: 1.22 }

/**
 * Which parts of the atlas are the garment, and which must not move.
 *
 * Every rectangle is a drawable's UV bounding box, read off the loaded model
 * rather than estimated from the image -- `getDrawableVertexUvs` in the browser,
 * scaled by 2048 and flipped, because Live2D's UV origin is bottom-left and an
 * image's is top-left.
 *
 * The rule below is subtractive: recolour a pixel when it is in **any** garment
 * rectangle and in **no** keep rectangle. Several boxes touch or overlap by a
 * pixel or two -- a sleeve against the white blouse, a cuff against the hair --
 * and resolving those in favour of not touching what must not move is one line
 * here against ten hand-trimmed rectangles that would each need re-checking
 * whenever any of them moved.
 *
 * The one boundary that would have gone wrong on its own is measured rather
 * than guessed. The skirt's right edge and the left sleeve's left edge are
 * eight transparent pixels apart, at x=907..914, so the sleeve's rectangle
 * starts at 911 instead of at its true left edge of 893 and cuts neither.
 */
const GARMENT = [
  [45, 978, 674, 1064], // vest body
  [911, 16, 380, 657], // sleeve upper L -- left edge moved off the skirt, see above
  [1313, 0, 395, 652], // sleeve upper R
  [1102, 484, 201, 586], // sleeve mid L
  [1314, 502, 196, 590], // sleeve mid R
  [672, 1066, 352, 667], // sleeve lower L
  [1060, 1069, 353, 657], // sleeve lower R
  [1374, 1118, 566, 233], // cuff upper
  [1385, 1345, 573, 204], // cuff lower
  [1600, 596, 387, 524], // lapel
]

const KEEP = [
  [6, 6, 921, 968], // skirt -- 下身, and not what 上衣 means
  [1753, 21, 240, 124], // tie
  [1569, 29, 188, 241], // tie
  [1808, 154, 226, 204], // tie
  [1761, 239, 98, 98], // tie
  [1679, 343, 213, 87], // pocket
  [1776, 431, 258, 157], // strap
  [1677, 1550, 356, 496], // hair
  [1377, 1702, 283, 338], // white blouse
]

const inside = (rects, x, y) =>
  rects.some(([rx, ry, rw, rh]) => x >= rx && x < rx + rw && y >= ry && y < ry + rh)

async function recolour(from, to) {
  const original = await sharp(from).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { data: base, info } = original
  const { data: tinted } = await sharp(from)
    .ensureAlpha()
    .modulate(RECOLOUR)
    .raw()
    .toBuffer({ resolveWithObject: true })

  const out = Buffer.from(base)
  let touched = 0
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4
      // Transparent pixels carry no colour worth rotating, and skipping them
      // keeps the count below honest about how much of the garment was found.
      if (base[i + 3] === 0) continue
      if (!inside(GARMENT, x, y) || inside(KEEP, x, y)) continue
      out[i] = tinted[i]
      out[i + 1] = tinted[i + 1]
      out[i + 2] = tinted[i + 2]
      // Alpha is the original's. modulate should not move it, and the
      // silhouette is the one thing that must survive this exactly.
      touched++
    }
  }

  await sharp(out, { raw: info }).webp(TEXTURE_WEBP).toFile(to)
  return touched
}

/** Copies a directory of small JSON files. */
async function copyDir(from, to) {
  await mkdir(to, { recursive: true })
  const names = await readdir(from)
  await Promise.all(names.map((n) => copyFile(join(from, n), join(to, n))))
  return names.length
}

await mkdir(join(OUT, 'Haru.2048'), { recursive: true })

/* texture_00 is skin, hair and face -- no garment on it, so it is carried
   across as-is rather than round-tripped through a recolour that would change
   nothing but the file's bytes. */
await sharp(join(SRC_DESIGN, 'texture_00.png')).webp(TEXTURE_WEBP).toFile(join(OUT, 'Haru.2048/texture_00.webp'))
const touched = await recolour(join(SRC_DESIGN, 'texture_01.png'), join(OUT, 'Haru.2048/texture_01.webp'))

for (const file of ['Haru.moc3', 'Haru.physics3.json', 'Haru.pose3.json', 'Haru.cdi3.json', 'Haru.userdata3.json']) {
  await copyFile(join(SRC_SHIPPED, file), join(OUT, file))
}
const motions = await copyDir(join(SRC_SHIPPED, 'motions'), join(OUT, 'motions'))
const expressions = await copyDir(join(SRC_SHIPPED, 'expressions'), join(OUT, 'expressions'))

/*
 * The manifest, with every Sound reference dropped.
 *
 * Not laziness about the 645 kB of wav. A model with motions and no audio is a
 * case the bench has to report correctly -- the emitted config takes its "no
 * motion carries a Sound" branch -- and until now only Mao exercised it.
 */
const manifest = JSON.parse(await readFile(join(SRC_SHIPPED, 'Haru.model3.json'), 'utf8'))
for (const group of Object.values(manifest.FileReferences.Motions ?? {})) {
  for (const entry of group) {
    delete entry.Sound
  }
}
await writeFile(join(OUT, 'Haru.model3.json'), JSON.stringify(manifest, null, '\t') + '\n')

/* ---------- an authored motion ---------- */

/**
 * 重心轉移 -- a weight shift, written rather than recorded.
 *
 * What it is not: a leg animation. The rig has forty-two parameters and **not
 * one of them is a leg**, a knee, a foot or an ankle -- checked against the
 * loaded model, not assumed. There is no way to lift a foot, cross the legs or
 * point a toe, and no way to add one without the .cmo3 the sample models do not
 * ship.
 *
 * What the legs do have is a ride. The body angles carry the whole figure, and
 * the table below this one says exactly how far. So the honest version of "a
 * leg motion" here is the one thing a body angle can express and a person
 * actually does: shifting their weight from one foot to the other.
 *
 * The shape is what makes it read as a weight shift rather than as a sway:
 *
 *   - the hips lead, and the upper body **counters** them, so the shoulders
 *     stay roughly over the feet. A body that leans as one piece reads as a
 *     tree in wind; a body that folds at the waist reads as standing.
 *   - the head counters again, so the face stays level. Eyes lead very
 *     slightly, in the direction the weight is going.
 *   - the body sinks a little at each extreme -- `ParamBodyAngleY` against the
 *     *absolute* phase -- because settling onto one leg is a drop, not a slide.
 *   - hair and scarf are the same curve delayed. Nothing else sells weight as
 *     cheaply as something arriving late.
 *
 * Generated rather than hand-written for the same reason the recolour is: these
 * are numbers to turn, and a 4-second curve at 20Hz is nine hundred numbers of
 * JSON nobody would edit by hand twice.
 */
const MOTION = {
  file: 'haru_kai_weight_shift.motion3.json',
  group: 'WeightShift',
  duration: 4,
  /** Keys per second. The playback rate is 30; the curve is slow, so sampling
   *  below it and letting linear segments join the dots costs nothing visible
   *  and two thirds of the file. */
  rate: 20,
}

/** 0 -> -1 -> +1 -> 0, with the two extremes held. `t` in seconds. */
function phase(t) {
  const ease = (x) => x * x * (3 - 2 * x) // smoothstep
  const seg = (from, to, a, b) => from + (to - from) * ease(Math.min(1, Math.max(0, (t - a) / (b - a))))
  if (t < 0) return 0
  if (t < 0.9) return seg(0, -1, 0, 0.9)
  if (t < 1.5) return -1
  if (t < 2.6) return seg(-1, 1, 1.5, 2.6)
  if (t < 3.2) return 1
  return seg(1, 0, 3.2, 4)
}

/**
 * Every curve, as a function of time.
 *
 * `lag` is the same phase read a moment ago, which is the whole of the hair and
 * the scarf: they are not animated, they are *late*.
 */
/*
 * What each parameter is worth to the legs, measured rather than assumed.
 *
 * The leg drawables' centroid, swept from one end of each parameter to the
 * other, in canvas pixels on a 2400x4500 model:
 *
 *   parameter          Δx      Δy    over
 *   ParamBodyAngleZ    97.1    -0.2   ±10     <- the lateral one
 *   ParamBodyAngleX    33.9    -0.1   ±10
 *   ParamBodyAngleY     0.6   113.8   ±10     <- the vertical one
 *   ParamBodyUpper     -4.9    24.9   ±10     <- barely reaches them
 *   ParamBreath        -0.6    10.8   ±1
 *   ParamBustY          0       0     ±1
 *
 * Two things fall out of that table and both shape the motion below.
 *
 * **Z, not X, is what moves the legs sideways** -- by three to one. The name
 * says body *angle*, and the intuition that X is the side-to-side one is
 * wrong: X leans, Z rolls, and rolling swings the feet.
 *
 * **`ParamBodyUpper` is nearly free.** It moves the legs by five pixels over
 * its whole range, which makes it the ideal counter-rotation: it can bring the
 * shoulders back over the feet without undoing any of the work below the waist.
 * A counter built out of Z instead would have cancelled the motion it was
 * meant to complete.
 */
const CURVES = {
  /* The roll, and the workhorse -- three quarters of the lateral travel. Run to
     the declared maximum, because the legs are the point of this motion and
     anything left here is movement the rig could express and did not. */
  ParamBodyAngleZ: (t) => phase(t) * 10,
  /* The lean. Same direction, a third of the effect, and it is what keeps the
     roll from reading as the figure tipping over rather than stepping across. */
  ParamBodyAngleX: (t) => phase(t) * 10,
  /* Sinking onto the loaded leg. Absolute, so it dips at both extremes rather
     than leaning through the middle -- settling onto one leg is a drop, not a
     slide. Small, because this parameter is worth 114 pixels over its range and
     a quarter of that is already a visible knee-bend's worth of travel. */
  ParamBodyAngleY: (t) => -Math.abs(phase(t)) * 4,
  /* The counter. Without this the figure leans as one piece and stops looking
     like it has a waist -- and per the table it costs the legs almost nothing. */
  ParamBodyUpper: (t) => -phase(t) * 6,
  /* And the head counters again, so the face stays level over the feet. */
  ParamAngleX: (t) => -phase(t) * 8,
  ParamAngleZ: (t) => -phase(t) * 5,
  /* Eyes lead the movement very slightly -- people look where they are going,
     even when where they are going is six inches sideways. */
  ParamEyeBallX: (t) => phase(t + 0.15) * 0.35,
  /* Late, and progressively later the further from the body it hangs. */
  ParamScarf: (t) => phase(t - 0.15) * 0.8,
  ParamHairSide: (t) => phase(t - 0.12) * 0.7,
  ParamHairBack: (t) => phase(t - 0.2) * 0.5,
  /* Breathing runs on its own clock, deliberately out of step with the shift so
     the two never line up into one pulse. */
  ParamBreath: (t) => (1 - Math.cos((t / 3.4) * Math.PI * 2)) / 2,
}

/**
 * Writes one curve as a run of linear segments.
 *
 * The encoding, from Live2D's own files: the array opens with the first point
 * as a bare `t, v` pair, and every segment after it is a type byte followed by
 * its points -- 0 is linear and takes one point, 1 is a cubic bezier and takes
 * three. Only linear is used here, because the shape is already in `phase` and
 * a bezier would be a second, worse description of it.
 */
function curveSegments(fn, duration, rate) {
  const steps = Math.round(duration * rate)
  const round = (n) => Math.round(n * 10000) / 10000
  const segments = [0, round(fn(0))]
  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * duration
    segments.push(0, round(t), round(fn(t)))
  }
  return { segments, count: steps, points: steps + 1 }
}

function buildMotion() {
  const curves = []
  let totalSegments = 0
  let totalPoints = 0
  for (const [id, fn] of Object.entries(CURVES)) {
    const { segments, count, points } = curveSegments(fn, MOTION.duration, MOTION.rate)
    curves.push({ Target: 'Parameter', Id: id, Segments: segments })
    totalSegments += count
    totalPoints += points
  }
  return {
    Version: 3,
    Meta: {
      Duration: MOTION.duration,
      Fps: 30,
      Loop: false,
      AreBeziersRestricted: true,
      CurveCount: curves.length,
      TotalSegmentCount: totalSegments,
      TotalPointCount: totalPoints,
      UserDataCount: 0,
      TotalUserDataSize: 0,
    },
    Curves: curves,
  }
}

const motion = buildMotion()
await writeFile(join(OUT, 'motions', MOTION.file), JSON.stringify(motion) + '\n')
manifest.FileReferences.Motions[MOTION.group] = [{ File: `motions/${MOTION.file}` }]
await writeFile(join(OUT, 'Haru.model3.json'), JSON.stringify(manifest, null, '\t') + '\n')

/* ---------- and then prove it only did what it said ---------- */

/**
 * "Only the top" is a claim, so it is checked rather than asserted.
 *
 * Every keep rectangle is sampled in the source and again in the written
 * output. The two are different encodings -- a PNG against a quality-92 WebP --
 * so they will not be identical; what they must be is *close*, and a recolour
 * that leaked into one of them would move it by tens of points rather than by
 * the one or two that compression costs.
 *
 * The garment is sampled the same way, and reported, because the numbers in
 * RECOLOUR were arrived at by reading this output and correcting -- sharp's hue
 * is not an HSL rotation, so there is no arithmetic that substitutes for
 * looking.
 */
const rgbToHsl = (r, g, b) => {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, Math.round(l * 100)]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [Math.round(h * 60), Math.round(s * 100), Math.round(l * 100)]
}

async function sample(file, [left, top, w, h]) {
  // The middle of the rectangle, well inside any edge or piping.
  const size = Math.max(8, Math.min(48, Math.floor(Math.min(w, h) / 3)))
  const { data } = await sharp(file)
    .extract({ left: left + Math.floor(w / 2 - size / 2), top: top + Math.floor(h / 2 - size / 2), width: size, height: size })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++
  }
  return n ? [r / n, g / n, b / n] : null
}

const srcTex = join(SRC_DESIGN, 'texture_01.png')
const outTex = join(OUT, 'Haru.2048/texture_01.webp')
/** Larger than compression costs, far smaller than a recolour. */
const TOLERANCE = 6

let worst = { name: '', drift: 0 }
for (const rect of KEEP) {
  const a = await sample(srcTex, rect)
  const b = await sample(outTex, rect)
  if (!a || !b) continue
  const drift = Math.max(...a.map((v, i) => Math.abs(v - b[i])))
  if (drift > worst.drift) worst = { name: rect.join(','), drift }
}

const vestBefore = await sample(srcTex, GARMENT[0])
const vestAfter = await sample(outTex, GARMENT[0])
const hslOf = (c) => (c ? `hsl(${rgbToHsl(...c).join(', ')})` : 'n/a')

console.log('fixtures/haru-kai')
console.log(`  texture_01   ${touched.toLocaleString()} pixels recoloured`)
console.log(`  vest         ${hslOf(vestBefore)}  ->  ${hslOf(vestAfter)}`)
console.log(
  `  ${MOTION.group}  ${motion.Meta.Duration}s, ${motion.Meta.CurveCount} curves, ` +
    `${motion.Meta.TotalSegmentCount} segments`,
)
console.log(`  ${motions + 1} motions, ${expressions} expressions, no sounds`)
if (worst.drift > TOLERANCE) {
  console.error(`\n  FAIL  a keep region moved by ${worst.drift.toFixed(1)} at [${worst.name}]`)
  console.error('  The recolour leaked outside the garment. Check GARMENT against KEEP.')
  process.exit(1)
}
console.log(`  keep regions intact (worst drift ${worst.drift.toFixed(1)} of ${TOLERANCE} allowed)`)
