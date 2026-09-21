// Makes the ISM test files from one measured JPEG (macOS: uses sips).
//
//   node tools/make-testfiles.mjs <source.jpg> <mm-per-px> [out-dir]
//
// The source is first cropped to a non-square frame and taken as "the image
// as measured". Every copy then gets the fields of that measured image, as a
// copy that kept its metadata would, and the viewer must decide per copy
// whether the scale still holds (§6).
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { embedXmpInJpeg, readIsm, scaleFor, writeIsmXmp } from '../js/ism.js'

const [src, scaleArg, outDir = 'testfiles'] = process.argv.slice(2)
if (!src || !scaleArg) {
  console.error('usage: node tools/make-testfiles.mjs <source.jpg> <mm-per-px> [out-dir]')
  process.exit(1)
}
const scale = Number(scaleArg)
mkdirSync(outDir, { recursive: true })
const tmp = join(outDir, '.tmp.jpg')

const sips = (...args) => execFileSync('sips', args, { stdio: 'ignore' })
const size = file => {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file]).toString()
  return [Number(/pixelWidth: (\d+)/.exec(out)[1]), Number(/pixelHeight: (\d+)/.exec(out)[1])]
}

// The measured image: a centred 3:2-ish crop, so that a crop can change the shape.
const [sw, sh] = size(src)
const W = sw, H = Math.round(Math.min(sh, sw) * 0.65)
const measured = join(outDir, '01-measured.jpg')
sips('-c', String(H), String(W), src, '--out', measured)

const fields = {
  scale, referenceWidth: W, referenceHeight: H,
  methodNote: 'Test file: the scale of the source image, carried over.',
  software: 'ISM make-testfiles',
}
const xmp = writeIsmXmp(fields)

const variants = [
  ['01-measured.jpg', null, 'the image as measured: scale applies as written'],
  ['02-resized-half.jpg', f => sips('-z', String(Math.round(H / 2)), String(Math.round(W / 2)), measured, '--out', f), 'resized to half: scale doubles'],
  ['03-turned.jpg', f => sips('-r', '90', measured, '--out', f), 'turned 90°: scale unchanged'],
  ['04-cropped-square.jpg', f => sips('-c', String(H), String(H), measured, '--out', f), 'cropped to a square: must be refused'],
  ['05-cropped-same-shape.jpg', f => sips('-c', String(Math.round(H / 2)), String(Math.round(W / 2)), measured, '--out', f), 'KNOWN LIMIT: cropped keeping the shape — a reader takes it for a resize (wrong scale)'],
  ['06-no-ism.jpg', f => sips('-z', String(H), String(W), measured, '--out', f), 'no ISM fields: nothing to show'],
]

const report = []
for (const [name, make, what] of variants) {
  const file = join(outDir, name)
  if (make) make(file)
  if (name !== '06-no-ism.jpg') {
    writeFileSync(file, embedXmpInJpeg(readFileSync(file), xmp))
  } else {
    // sips may carry metadata over; make sure the copy has none of ours.
    sips('-s', 'format', 'jpeg', file, '--out', tmp)
    writeFileSync(file, readFileSync(tmp))
  }
  const [w, h] = size(file)
  const r = scaleFor(readIsm(readFileSync(file)), w, h)
  report.push(`${name.padEnd(28)} ${`${w}×${h}`.padEnd(10)} ${r.ok ? `${r.scale.toPrecision(4)} mm/px` : 'refused'.padEnd(10)}  ${what}`)
}
rmSync(tmp, { force: true })
console.log(`measured image ${W}×${H}, ${scale} mm/px\n`)
console.log(report.join('\n'))
