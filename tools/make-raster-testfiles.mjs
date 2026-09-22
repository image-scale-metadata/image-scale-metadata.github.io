// Test files for PNG and TIFF, made from scratch so that nothing about them is
// borrowed or uncertain: a plain pattern with a 50 mm bar drawn on it, written
// as an uncompressed TIFF and a deflate PNG, then given ISM with the reference
// writer. Run: node tools/make-raster-testfiles.mjs
//
// The answers a reader must give for each file are in testfiles/README.md.

import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { embedXmpInPng, embedXmpInTiff, writeIsmXmp } from '../js/ism.js'

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const W = 600, H = 400
const SCALE = 0.1        // mm per pixel: the picture is 60 × 40 mm
const BAR_MM = 50

/** A grey ground, a darker object block, and a 50 mm bar along the bottom. */
function pattern(w, h, mmPerPx) {
  const px = new Uint8Array(w * h * 3).fill(0xf2)
  const set = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const i = (y * w + x) * 3
    px[i] = r; px[i + 1] = g; px[i + 2] = b
  }
  // the object: a block 30 mm wide and 20 mm tall, centred
  const ow = Math.round(30 / mmPerPx), oh = Math.round(20 / mmPerPx)
  const ox = Math.round((w - ow) / 2), oy = Math.round((h - oh) / 2)
  for (let y = oy; y < oy + oh; y++) for (let x = ox; x < ox + ow; x++) set(x, y, 0x55, 0x57, 0x5c)
  // the bar: exactly BAR_MM long, so a reader can check itself against the picture
  const bar = Math.round(BAR_MM / mmPerPx)
  const bx = Math.round((w - bar) / 2), by = h - Math.round(h * 0.08)
  for (let x = bx; x < bx + bar; x++) for (let t = 0; t < Math.max(2, Math.round(h / 100)); t++) set(x, by + t, 0x11, 0x11, 0x11)
  for (const x of [bx, bx + bar - 1]) for (let y = by - 8; y < by + 12; y++) set(x, y, 0x11, 0x11, 0x11)
  return px
}

function png(w, h, rgb) {
  const raw = new Uint8Array(h * (w * 3 + 1))
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0 // filter: none
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1)
  }
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, w); view.setUint32(4, h)
  ihdr[8] = 8; ihdr[9] = 2 // 8 bits, truecolour
  const parts = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', new Uint8Array(deflateSync(raw))), chunk('IEND', new Uint8Array(0))]
  return concat(parts)

  function chunk(type, data) {
    const out = new Uint8Array(12 + data.length)
    new DataView(out.buffer).setUint32(0, data.length)
    out.set(Uint8Array.from(type, c => c.charCodeAt(0)), 4)
    out.set(data, 8)
    new DataView(out.buffer).setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
    return out
  }
}

/** An uncompressed little-endian TIFF, one strip, RGB. */
function tiff(w, h, rgb) {
  const tags = [
    [256, 3, 1, w],            // ImageWidth
    [257, 3, 1, h],            // ImageLength
    [258, 3, 3, 0],            // BitsPerSample → offset, filled below
    [259, 3, 1, 1],            // Compression: none
    [262, 3, 1, 2],            // PhotometricInterpretation: RGB
    [273, 4, 1, 0],            // StripOffsets → offset, filled below
    [277, 3, 1, 3],            // SamplesPerPixel
    [278, 3, 1, h],            // RowsPerStrip
    [279, 4, 1, rgb.length],   // StripByteCounts
    [284, 3, 1, 1],            // PlanarConfiguration
  ]
  const headerLen = 8
  const ifdLen = 2 + tags.length * 12 + 4
  const bitsAt = headerLen + ifdLen           // three shorts
  const pixelsAt = bitsAt + 6
  const out = new Uint8Array(pixelsAt + rgb.length)
  const dv = new DataView(out.buffer)
  out[0] = 0x49; out[1] = 0x49
  dv.setUint16(2, 42, true)
  dv.setUint32(4, headerLen, true)
  dv.setUint16(headerLen, tags.length, true)
  tags.forEach(([tag, type, count, value], i) => {
    const at = headerLen + 2 + i * 12
    dv.setUint16(at, tag, true)
    dv.setUint16(at + 2, type, true)
    dv.setUint32(at + 4, count, true)
    if (tag === 258) dv.setUint32(at + 8, bitsAt, true)
    else if (tag === 273) dv.setUint32(at + 8, pixelsAt, true)
    else if (type === 3 && count === 1) dv.setUint16(at + 8, value, true)
    else dv.setUint32(at + 8, value, true)
  })
  dv.setUint32(headerLen + 2 + tags.length * 12, 0, true) // no next directory
  for (let i = 0; i < 3; i++) dv.setUint16(bitsAt + i * 2, 8, true)
  out.set(rgb, pixelsAt)
  return out
}

function half(w, h, rgb) {
  const w2 = w >> 1, h2 = h >> 1
  const out = new Uint8Array(w2 * h2 * 3)
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
    const from = ((y * 2) * w + x * 2) * 3, to = (y * w2 + x) * 3
    out[to] = rgb[from]; out[to + 1] = rgb[from + 1]; out[to + 2] = rgb[from + 2]
  }
  return { w: w2, h: h2, rgb: out }
}

const fields = (w, h, scale, extra = {}) => ({
  scale, referenceWidth: w, referenceHeight: h, version: '0.1',
  method: 'ruler', uncertainty: 0.002, measuredBy: 'ISM reference tools',
  measuredAt: '2026-09-22T00:00:00Z', software: 'make-raster-testfiles.mjs',
  ...extra,
})

const rgb = pattern(W, H, SCALE)
const small = half(W, H, rgb)

const files = [
  ['testfiles/10-png-measured.png', png(W, H, rgb), fields(W, H, SCALE), embedXmpInPng],
  ['testfiles/11-png-resized-half.png', png(small.w, small.h, small.rgb), fields(W, H, SCALE), embedXmpInPng],
  ['testfiles/12-tiff-measured.tif', tiff(W, H, rgb), fields(W, H, SCALE), embedXmpInTiff],
  ['testfiles/13-tiff-resized-half.tif', tiff(small.w, small.h, small.rgb), fields(W, H, SCALE), embedXmpInTiff],
  ['testfiles/14-png-no-ism.png', png(W, H, rgb), null, null],
]

for (const [path, bytes, f, embed] of files) {
  const out = f ? embed(bytes, writeIsmXmp(f)) : bytes
  writeFileSync(path, out)
  console.log(path.padEnd(36), out.length.toString().padStart(8), 'bytes')
}

// ── helpers ───────────────────────────────────────────────────────────────────

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

