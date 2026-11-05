// Test files for PNG and TIFF, made from scratch so that nothing about them is
// borrowed or uncertain: a plain pattern with a 50 mm bar drawn on it, written
// as an uncompressed TIFF and a deflate PNG, then given ISM with the reference
// writer. Run: node tools/make-raster-testfiles.mjs
//
// The answers a reader must give for each file are in testfiles.md.

import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { IPTC_ROLES, ISM_ROLES, ISM_TYPES, embedXmpInPng, embedXmpInTiff, writeIsmXmp } from '../js/ism.js'

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

/**
 * An IPTC Image Region around the drawn bar, carrying ISM of its own: a scale
 * for the plane the bar lies in, different from the image's. A reader must not
 * take it for the scale of the whole image.
 */
const BAR_REGION = `<rdf:Description rdf:about=""
        xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"
        xmlns:ism="https://w3id.org/ism/0.1/">
      <Iptc4xmpExt:ImageRegion>
        <rdf:Bag>
          <rdf:li rdf:parseType="Resource">
            <Iptc4xmpExt:RegionBoundary rdf:parseType="Resource">
              <Iptc4xmpExt:rbShape>rectangle</Iptc4xmpExt:rbShape>
              <Iptc4xmpExt:rbUnit>pixel</Iptc4xmpExt:rbUnit>
              <Iptc4xmpExt:rbX>40</Iptc4xmpExt:rbX>
              <Iptc4xmpExt:rbY>355</Iptc4xmpExt:rbY>
              <Iptc4xmpExt:rbW>520</Iptc4xmpExt:rbW>
              <Iptc4xmpExt:rbH>35</Iptc4xmpExt:rbH>
            </Iptc4xmpExt:RegionBoundary>
            <Iptc4xmpExt:rId>bar</Iptc4xmpExt:rId>
            <ism:scale>0.15</ism:scale>
            <ism:plane>The surface the bar lies on, below the object</ism:plane>
          </rdf:li>
        </rdf:Bag>
      </Iptc4xmpExt:ImageRegion>
    </rdf:Description>`

/** A packet with the region added beside the image's own ISM, or alone. */
const withRegion = f => f
  ? writeIsmXmp(f).replace('</rdf:RDF>', `  ${BAR_REGION}\n  </rdf:RDF>`)
  : `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    ${BAR_REGION}
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`

// ── Regions (§14): files 30–35 ────────────────────────────────────────────────
//
// Each is drawn on the same 600 × 400 grid, with every length a whole number of
// pixels and every region corner a round fraction of the picture, so that the
// answers can be worked by hand.

/** A canvas to draw the region files on. */
function canvas(w, h, ground = 0xf2) {
  const px = new Uint8Array(w * h * 3).fill(ground)
  const set = (x, y, v) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const i = (y * w + x) * 3
    px[i] = px[i + 1] = px[i + 2] = v
  }
  return {
    w, h, px,
    rect(x, y, rw, rh, v) { for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) set(i, j, v) },
    circle(cx, cy, r, v) { for (let j = cy - r; j <= cy + r; j++) for (let i = cx - r; i <= cx + r; i++) if ((i - cx) ** 2 + (j - cy) ** 2 <= r * r) set(i, j, v) },
    polygon(points, v) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        let inside = false
        for (let a = 0, b = points.length - 1; a < points.length; b = a++) {
          const [xa, ya] = points[a], [xb, yb] = points[b]
          if ((ya > j + 0.5) !== (yb > j + 0.5) && i + 0.5 < (xb - xa) * (j + 0.5 - ya) / (yb - ya) + xa) inside = !inside
        }
        if (inside) set(i, j, v)
      }
    },
    /** A bar from x0 to x1 (exclusive), its two ends marked, the way the 50 mm bar of files 10–16 is drawn. */
    bar(x0, x1, y) {
      for (let i = x0; i < x1; i++) for (let t = 0; t < 4; t++) set(i, y + t, 0x11)
      for (const i of [x0, x1 - 1]) for (let j = y - 8; j < y + 12; j++) set(i, j, 0x11)
    },
  }
}

function turnClockwise(w, h, rgb) {
  const out = new Uint8Array(rgb.length)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const from = (y * w + x) * 3, to = (x * h + (h - 1 - y)) * 3
    out[to] = rgb[from]; out[to + 1] = rgb[from + 1]; out[to + 2] = rgb[from + 2]
  }
  return { w: h, h: w, rgb: out }
}

const rel = (px, of) => Number((px / of).toFixed(6))
const vertices = points => points.map(([x, y]) => ({ x: rel(x, W), y: rel(y, H) }))

// 30 — two planes. The image's scale is for the upper surface of a stepped
// object; the lower surface, further from the camera, has its own.
const LOWER = [[360, 60], [576, 60], [576, 340], [366, 340]]
const twoPlanes = (() => {
  const c = canvas(W, H)
  c.rect(30, 60, 300, 220, 0x7a)    // the upper surface
  c.polygon(LOWER, 0xa8)            // the lower surface
  c.bar(30, 330, 320)               // 30 mm at 0.1 mm/px: 300 px
  c.bar(372, 564, 300)              // 24 mm at 0.125 mm/px: 192 px
  return c.px
})()
const TWO_PLANES = {
  fields: fields(W, H, SCALE, { plane: 'Upper surface of the step', methodNote: 'A 30 mm bar on the upper surface, 300 px' }),
  regions: [
    {
      id: 'lower', name: 'Lower surface of the step', shape: 'polygon', vertices: vertices(LOWER),
      ism: {
        scale: 0.125, plane: 'Lower surface of the step, further from the camera', method: 'ruler',
        methodNote: 'A 24 mm bar on the lower surface, 192 px', uncertainty: 0.002,
        measuredBy: 'ISM reference tools', measuredAt: '2026-11-05',
      },
    },
    { id: 'upper-bar', name: 'Bar on the upper surface, 30 mm', shape: 'polygon', vertices: vertices([[30, 322], [330, 322]]), roles: [ISM_ROLES.scaleReference], ism: { lengthMm: 30 } },
    { id: 'lower-bar', name: 'Bar on the lower surface, 24 mm', shape: 'polygon', vertices: vertices([[372, 302], [564, 302]]), roles: [ISM_ROLES.scaleReference], ism: { lengthMm: 24 } },
  ],
}

// 32 — several objects on one board, each a region of its own with its size;
// the coin is the image's own object, so ism:objectBox is its bounds.
const SHARD = [[420, 60], [540, 90], [510, 210], [432, 180]]
const severalObjects = (() => {
  const c = canvas(W, H)
  c.rect(60, 60, 120, 80, 0x55)     // a block, 12 × 8 mm
  c.circle(300, 150, 90, 0x6b)      // a coin, 18 mm across
  c.polygon(SHARD, 0x80)            // a shard, 12 × 15 mm across its bounds
  c.bar(60, 540, 360)               // the ruler: 48 mm, 480 px
  return c.px
})()
const SEVERAL_OBJECTS = {
  fields: fields(W, H, SCALE, {
    plane: 'The board', methodNote: 'The 48 mm ruler on the board, 480 px',
    objectBox: [210, 60, 180, 180], objectWidthMm: 18, objectHeightMm: 18,
  }),
  regions: [
    { id: 'coin', name: 'Coin', shape: 'circle', x: 0.5, y: 0.375, rx: 0.15, roles: [IPTC_ROLES.mainSubjectArea, ISM_ROLES.measuredObject], ism: { objectWidthMm: 18, objectHeightMm: 18, objectThicknessMm: 1.2 } },
    { id: 'block', name: 'Block', shape: 'rectangle', x: 0.1, y: 0.15, w: 0.2, h: 0.2, roles: [IPTC_ROLES.subjectArea, ISM_ROLES.measuredObject], ism: { objectWidthMm: 12, objectHeightMm: 8 } },
    { id: 'shard', name: 'Shard', shape: 'polygon', vertices: vertices(SHARD), roles: [IPTC_ROLES.subjectArea, ISM_ROLES.measuredObject], ism: { objectWidthMm: 12, objectHeightMm: 15 } },
    { id: 'ruler', name: 'Ruler', shape: 'rectangle', x: 0.08, y: 0.85, w: 0.84, h: 0.1, roles: [ISM_ROLES.scaleReference], types: [ISM_TYPES.ruler] },
    { id: 'ruler-48', name: 'Ruler, 0 to 48 mm', shape: 'polygon', vertices: vertices([[60, 362], [540, 362]]), roles: [ISM_ROLES.scaleReference], ism: { lengthMm: 48 } },
  ],
}

// 33 — only the regions have a scale: two surfaces side by side, neither of
// them the image's. The image keeps its grid and has no scale of its own.
const regionsOnly = (() => {
  const c = canvas(W, H)
  c.rect(0, 0, 294, 400, 0x9a)
  c.rect(306, 0, 294, 400, 0xc4)
  c.bar(48, 248, 200)               // 20 mm at 0.1 mm/px: 200 px
  c.bar(402, 502, 200)              // 20 mm at 0.2 mm/px: 100 px
  return c.px
})()
const REGIONS_ONLY = {
  fields: { referenceWidth: W, referenceHeight: H, software: 'make-raster-testfiles.mjs' },
  regions: [
    { id: 'left', name: 'Left surface', shape: 'rectangle', x: 0, y: 0, w: 0.49, h: 1, ism: { scale: 0.1, plane: 'Left surface', method: 'ruler', methodNote: 'A 20 mm bar, 200 px', uncertainty: 0.002 } },
    { id: 'right', name: 'Right surface', shape: 'rectangle', x: 0.51, y: 0, w: 0.49, h: 1, ism: { scale: 0.2, plane: 'Right surface, further away', method: 'ruler', methodNote: 'A 20 mm bar, 100 px', uncertainty: 0.002 } },
  ],
}

// 37 — a board seen at an angle: its far edge further from the camera, so the
// scale changes across it. Its region carries the plane's homography, worked
// out here from where its corners fall, as a writer would work it out from the
// corners of the four markers (§14.7). The image has the grid and no scale.

/** The homography that carries four points onto four others, as nine numbers with the last 1. */
function homographyFrom(from, to) {
  const A = [], b = []
  from.forEach(([x, y], i) => {
    const [u, v] = to[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v)
  })
  for (let c = 0; c < 8; c++) { // Gaussian elimination with partial pivoting
    let p = c
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r
    ;[A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]]
    for (let r = 0; r < 8; r++) {
      if (r === c) continue
      const k = A[r][c] / A[c][c]
      for (let q = c; q < 8; q++) A[r][q] -= k * A[c][q]
      b[r] -= k * b[c]
    }
  }
  return [...b.map((v, i) => v / A[i][i]), 1]
}
const carry = (h, [x, y]) => { const w = h[6] * x + h[7] * y + h[8]; return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w] }

const BOARD_MM = [[0, 0], [80, 0], [80, 60], [0, 60]]
const BOARD_PX = [[150, 60], [450, 60], [560, 360], [40, 360]]
const toImage = homographyFrom(BOARD_MM, BOARD_PX)       // the plane in mm → the reference grid
const toPlane = homographyFrom(BOARD_PX, BOARD_MM)       // the reference grid → the plane in mm: ism:homography
const MARKERS = [[12, 2, 2], [13, 60, 2], [14, 60, 40], [15, 2, 40]] // id, x, y of the top-left corner, in mm
const BLOCK = [30, 25, 20, 10]                            // x, y, width, height in mm: 20 × 10 mm, measured with calipers
const square = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
const onImage = corners => corners.map(p => carry(toImage, p))

/** mm per pixel where the plane meets a point of the grid: the square root of the area one pixel covers. */
function localScale(h, [x, y]) {
  const p = carry(h, [x, y]), px = carry(h, [x + 0.5, y]), py = carry(h, [x, y + 0.5])
  return Math.sqrt(Math.abs((px[0] - p[0]) * (py[1] - p[1]) - (px[1] - p[1]) * (py[0] - p[0]))) / 0.5
}

const tiltedBoard = (() => {
  const c = canvas(W, H)
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const [X, Y] = carry(toPlane, [i + 0.5, j + 0.5])
    if (X < 0 || Y < 0 || X > 80 || Y > 60) continue
    let v = (X % 10 < 0.35 || Y % 10 < 0.35) ? 0xa4 : 0xc8 // the board, with a line every 10 mm
    for (const [, mx, my] of MARKERS) {
      if (X >= mx && X <= mx + 18 && Y >= my && Y <= my + 18) v = (X >= mx + 6 && X <= mx + 12 && Y >= my + 6 && Y <= my + 12) ? 0xff : 0x11
    }
    const [bx, by, bw, bh] = BLOCK
    if (X >= bx && X <= bx + bw && Y >= by && Y <= by + bh) v = 0x55
    c.rect(i, j, 1, 1, v)
  }
  return c.px
})()
const centre = carry(toImage, [40, 30])
const atCorners = BOARD_PX.map(p => localScale(toPlane, p))
const boardScale = Number(localScale(toPlane, centre).toPrecision(6))
const TILTED = {
  fields: { referenceWidth: W, referenceHeight: H, software: 'make-raster-testfiles.mjs' },
  regions: [
    {
      id: 'board', name: 'Board, 80 × 60 mm, tilted away from the camera', shape: 'polygon', vertices: vertices(BOARD_PX),
      ism: {
        scale: boardScale, homography: toPlane.map(n => (Math.abs(n) < 1e-12 ? 0 : Number(n.toPrecision(15)))),
        plane: 'The board, tilted away from the camera', method: 'target',
        methodNote: 'A homography from the corners of four 18 mm markers, ids 12 to 15, at the corners of the board. The scale is the one at its centre',
        // The scale across the board, from its nearest corner to its furthest, taken as the edges of a rectangular spread.
        uncertainty: Number(((Math.max(...atCorners) - Math.min(...atCorners)) / 2 / Math.sqrt(3) / boardScale).toPrecision(3)),
        measuredBy: 'ISM reference tools', measuredAt: '2026-11-05',
      },
    },
    ...MARKERS.map(([id, x, y]) => ({
      id: `marker-${id}`, name: `Marker ${id}, 18 mm`, shape: 'polygon', vertices: vertices(onImage(square(x, y, 18, 18))),
      roles: [ISM_ROLES.scaleReference], types: [ISM_TYPES.target], ism: { lengthMm: 18 },
    })),
    {
      id: 'block', name: 'Block, 20 × 10 mm by calipers', shape: 'polygon', vertices: vertices(onImage(square(...BLOCK))),
      roles: [ISM_ROLES.measuredObject], ism: { objectWidthMm: 20, objectHeightMm: 10 },
    },
  ],
}
const tiltedHalf = half(W, H, tiltedBoard)

const twoPlanesHalf = half(W, H, twoPlanes)
const twoPlanesTurned = turnClockwise(W, H, twoPlanes)
const regionXmp = ({ fields, regions }) => writeIsmXmp(fields, regions)

const files = [
  ['testfiles/10-png-measured.png', png(W, H, rgb), writeIsmXmp(fields(W, H, SCALE)), embedXmpInPng],
  ['testfiles/11-png-resized-half.png', png(small.w, small.h, small.rgb), writeIsmXmp(fields(W, H, SCALE)), embedXmpInPng],
  ['testfiles/12-tiff-measured.tif', tiff(W, H, rgb), writeIsmXmp(fields(W, H, SCALE)), embedXmpInTiff],
  ['testfiles/13-tiff-resized-half.tif', tiff(small.w, small.h, small.rgb), writeIsmXmp(fields(W, H, SCALE)), embedXmpInTiff],
  ['testfiles/14-png-no-ism.png', png(W, H, rgb), null, null],
  ['testfiles/15-png-region-with-scale.png', png(W, H, rgb), withRegion(fields(W, H, SCALE)), embedXmpInPng],
  ['testfiles/16-png-region-only.png', png(W, H, rgb), withRegion(null), embedXmpInPng],
  ['testfiles/30-png-two-planes.png', png(W, H, twoPlanes), regionXmp(TWO_PLANES), embedXmpInPng],
  ['testfiles/31-png-two-planes-resized-half.png', png(twoPlanesHalf.w, twoPlanesHalf.h, twoPlanesHalf.rgb), regionXmp(TWO_PLANES), embedXmpInPng],
  ['testfiles/32-png-several-objects.png', png(W, H, severalObjects), regionXmp(SEVERAL_OBJECTS), embedXmpInPng],
  ['testfiles/33-png-regions-only-scale.png', png(W, H, regionsOnly), regionXmp(REGIONS_ONLY), embedXmpInPng],
  ['testfiles/34-png-region-in-pixels-resized-half.png', png(small.w, small.h, small.rgb), withRegion(fields(W, H, SCALE)), embedXmpInPng],
  ['testfiles/35-png-two-planes-turned.png', png(twoPlanesTurned.w, twoPlanesTurned.h, twoPlanesTurned.rgb), regionXmp(TWO_PLANES), embedXmpInPng],
  ['testfiles/37-png-tilted-board.png', png(W, H, tiltedBoard), regionXmp(TILTED), embedXmpInPng],
  ['testfiles/38-png-tilted-board-resized-half.png', png(tiltedHalf.w, tiltedHalf.h, tiltedHalf.rgb), regionXmp(TILTED), embedXmpInPng],
]

for (const [path, bytes, xmp, embed] of files) {
  const out = xmp ? embed(bytes, xmp) : bytes
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

