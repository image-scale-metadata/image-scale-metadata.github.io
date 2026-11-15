// Test files for the fingerprint (§4.5): one picture measured and given its
// fingerprint, then resized, turned, and cropped three ways — to the same shape,
// upright out of the lying picture, and by a twentieth — so that a reader shows
// it tells a resized copy from a cropped one. Made from scratch, as the other
// raster files are. Run: node tools/make-fingerprint-testfiles.mjs
//
// The answers a reader must give for each file are in testfiles.md.

import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { embedXmpInPng, fingerprintOf, writeIsmXmp } from '../js/ism.js'

const W = 600, H = 400
const SCALE = 0.1 // mm per pixel: the picture is 60 × 40 mm

/** A light ground, an object left of the middle, a mark in the top right corner and a bar along the bottom: no two ways round look alike. */
function pattern() {
  const px = new Uint8Array(W * H * 3).fill(0xf2)
  const block = (x0, y0, w, h, v) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px.fill(v, (y * W + x) * 3, (y * W + x) * 3 + 3)
  }
  block(120, 90, 260, 170, 0x58)   // the object
  block(170, 130, 90, 60, 0x8c)    // a lighter part of it
  block(500, 30, 60, 40, 0x2a)     // the mark
  block(50, 350, 500, 6, 0x11)     // the bar, 50 mm
  return px
}

const half = (w, h, rgb) => {
  const w2 = w >> 1, h2 = h >> 1, out = new Uint8Array(w2 * h2 * 3)
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
    for (let c = 0; c < 3; c++) {
      const at = (yy, xx) => rgb[((y * 2 + yy) * w + x * 2 + xx) * 3 + c]
      out[(y * w2 + x) * 3 + c] = Math.round((at(0, 0) + at(0, 1) + at(1, 0) + at(1, 1)) / 4)
    }
  }
  return { w: w2, h: h2, rgb: out }
}

const crop = (w, rgb, x0, y0, cw, ch) => {
  const out = new Uint8Array(cw * ch * 3)
  for (let y = 0; y < ch; y++) out.set(rgb.subarray(((y0 + y) * w + x0) * 3, ((y0 + y) * w + x0 + cw) * 3), y * cw * 3)
  return { w: cw, h: ch, rgb: out }
}

const turnClockwise = (w, h, rgb) => {
  const out = new Uint8Array(w * h * 3)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const to = (x * h + (h - 1 - y)) * 3, from = (y * w + x) * 3
    out[to] = rgb[from]; out[to + 1] = rgb[from + 1]; out[to + 2] = rgb[from + 2]
  }
  return { w: h, h: w, rgb: out }
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
const crc32 = bytes => { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

function png({ w, h, rgb }) {
  const raw = new Uint8Array(h * (w * 3 + 1))
  for (let y = 0; y < h; y++) raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1) // filter: none
  const ihdr = new Uint8Array(13), view = new DataView(ihdr.buffer)
  view.setUint32(0, w); view.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 2
  const chunk = (type, data) => {
    const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer)
    dv.setUint32(0, data.length); out.set(Uint8Array.from(type, c => c.charCodeAt(0)), 4); out.set(data, 8)
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
    return out
  }
  const parts = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', new Uint8Array(deflateSync(raw))), chunk('IEND', new Uint8Array(0))]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}

const whole = { w: W, h: H, rgb: pattern() }
const small = half(W, H, whole.rgb)

// The fields are written once, on the picture as measured, and never touched
// again: every other file is what a program that knows nothing of ISM leaves.
const xmp = writeIsmXmp({
  version: '0.3', scale: SCALE, referenceWidth: W, referenceHeight: H,
  fingerprint: fingerprintOf(whole.rgb, W, H, 3),
  method: 'ruler', uncertainty: 0.002, measuredBy: 'ISM reference tools',
  measuredAt: '2026-11-15T00:00:00Z', software: 'make-fingerprint-testfiles.mjs',
})

const files = [
  ['40-png-fingerprint.png', whole],
  ['41-png-fingerprint-resized-half.png', small],
  ['42-png-fingerprint-turned-resized-half.png', turnClockwise(small.w, small.h, small.rgb)],
  ['43-png-fingerprint-cropped-same-shape.png', crop(W, whole.rgb, 150, 100, 300, 200)],
  ['44-png-fingerprint-cropped-upright.png', crop(W, whole.rgb, 100, 0, 266, 400)],
  ['45-png-fingerprint-cropped-by-a-twentieth.png', crop(W, whole.rgb, 15, 10, 570, 380)],
]
const answers = { files: {}, synthetic: {} }
for (const [name, picture] of files) {
  writeFileSync(`testfiles/${name}`, embedXmpInPng(png(picture), xmp))
  answers.files[name] = fingerprintOf(picture.rgb, picture.w, picture.h, 3)
  console.log(name, `${picture.w} × ${picture.h}`)
}

// The same bytes read as grey, grey with alpha, RGB and RGBA, so that every
// reader's arithmetic can be checked against this one's: 64 × 48 pixels from
// the generator x → (1103515245 x + 12345) mod 2³¹, starting at 1, each byte
// the bits 16–23 of the next x.
export function syntheticBytes(count) {
  const out = new Uint8Array(count)
  let x = 1n
  for (let i = 0; i < count; i++) { x = (1103515245n * x + 12345n) % 2147483648n; out[i] = Number((x >> 16n) & 255n) }
  return out
}
for (const channels of [1, 2, 3, 4]) answers.synthetic[channels] = fingerprintOf(syntheticBytes(64 * 48 * channels), 64, 48, channels)
writeFileSync('testfiles/fingerprints.json', JSON.stringify(answers, null, 2) + '\n')
