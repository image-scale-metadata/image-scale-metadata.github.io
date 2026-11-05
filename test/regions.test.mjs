// ISM in IPTC Image Regions (§14). Run: node --test test/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  IPTC_EXT_NS, IPTC_ROLES, ISM_NS, ISM_ROLES, ISM_TYPES, checkRegion, findXmp, hasRole, hasType, lengthCheck,
  mainObjectRegion, measure, mergeIsmIntoXmp, objectCheck, parseIsm, parseRegions, readIsm, readRegions, regionBox,
  regionScales, scaleAt, scaleFor, shapeContains, validate, writeIsmXmp,
} from '../js/ism.js'

const file = name => new Uint8Array(readFileSync(new URL(`../testfiles/${name}`, import.meta.url)))
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b))
const open = name => {
  const bytes = file(name)
  const dv = new DataView(bytes.buffer, bytes.byteOffset + 16, 8)
  return { fields: readIsm(bytes), regions: readRegions(bytes), w: dv.getUint32(0), h: dv.getUint32(4) }
}
const byId = (readings, id) => readings.find(r => r.region.id === id)

const GRID = { version: '0.2', scale: 0.1, referenceWidth: 600, referenceHeight: 400, method: 'ruler', uncertainty: 0.002 }
const LOWER = {
  id: 'lower', name: 'Lower surface', shape: 'polygon',
  vertices: [{ x: 0.6, y: 0.15 }, { x: 0.96, y: 0.15 }, { x: 0.96, y: 0.85 }, { x: 0.61, y: 0.85 }],
  ism: { scale: 0.125, plane: 'Lower surface', method: 'ruler', uncertainty: 0.002, measuredBy: 'Someone', measuredAt: '2026-11-05' },
}

// ── Writing and reading back ────────────────────────────────────────────────

test('regions written are read back, shapes, roles, types and ISM fields alike', () => {
  const regions = [
    LOWER,
    { id: 'coin', name: 'Coin', shape: 'circle', x: 0.5, y: 0.375, rx: 0.15, roles: [IPTC_ROLES.mainSubjectArea, ISM_ROLES.measuredObject], ism: { objectWidthMm: 18, objectHeightMm: 18 } },
    { id: 'ruler', shape: 'rectangle', x: 0.08, y: 0.85, w: 0.84, h: 0.1, roles: [ISM_ROLES.scaleReference], types: [ISM_TYPES.ruler] },
    { id: 'bar', shape: 'polygon', vertices: [{ x: 0.1, y: 0.9 }, { x: 0.9, y: 0.9 }], ism: { lengthMm: 48 } },
  ]
  const xmp = writeIsmXmp(GRID, regions)
  const back = parseRegions(xmp)
  assert.equal(back.length, 4)
  assert.deepEqual(back[0].vertices, LOWER.vertices)
  assert.deepEqual(back[0].ism, LOWER.ism)
  assert.equal(back[0].unit, 'relative')
  assert.equal(back[0].name, 'Lower surface')
  assert.deepEqual([back[1].x, back[1].y, back[1].rx], [0.5, 0.375, 0.15])
  assert.ok(hasRole(back[1], IPTC_ROLES.mainSubjectArea) && hasRole(back[1], ISM_ROLES.measuredObject))
  assert.equal(back[1].roles[1].name, 'measured object')
  assert.ok(hasType(back[2], ISM_TYPES.ruler))
  assert.equal(back[2].ism, null)
  assert.deepEqual(back[3].ism, { lengthMm: 48 })
  // The image's own fields are what they were; the regions only add.
  assert.deepEqual(parseIsm(xmp), { ...GRID, version: '0.3' })
  for (const r of back) assert.deepEqual(checkRegion(r), { boundary: [], ism: [], warnings: [] }, r.id)
})

test('the same regions always give the same packet', () => {
  assert.equal(writeIsmXmp(GRID, [LOWER]), writeIsmXmp({ ...GRID }, [{ ...LOWER }]))
})

test('a file with regions that carry ISM says 0.3; one whose regions carry none keeps 0.2', () => {
  assert.equal(parseIsm(writeIsmXmp(GRID, [LOWER])).version, '0.3')
  assert.equal(parseIsm(writeIsmXmp({ ...GRID, version: '0.1' }, [LOWER])).version, '0.3')
  assert.equal(parseIsm(writeIsmXmp(GRID, [{ id: 'r', shape: 'rectangle', x: 0, y: 0, w: 1, h: 1 }])).version, '0.2')
})

test('the writer refuses a region it must not write', () => {
  const bad = [
    [{ ...LOWER, unit: 'pixel' }, /relative units/],
    [{ ...LOWER, ism: { ...LOWER.ism, objectBox: [1, 2, 3, 4] } }, /belongs to the image/],
    [{ ...LOWER, ism: { plane: 'only a plane' } }, /none of its own/],
    [{ id: 'r', shape: 'rectangle', x: 0, y: 0, w: 1, h: 1, ism: { lengthMm: 10 } }, /belongs on a line/],
    [{ id: 'r', shape: 'rectangle', x: 0.5, y: 0, w: 0.6, h: 1 }, /outside the image/],
    [{ id: 'r', shape: 'polygon', vertices: [] }, /at least one vertex/],
    [{ id: 'r', shape: 'square', x: 0, y: 0, w: 1, h: 1 }, /not one of rectangle, circle, polygon/],
  ]
  for (const [region, why] of bad) assert.throws(() => writeIsmXmp(GRID, [region]), why, region.id)
})

// ── Reading what other writers write ─────────────────────────────────────────

/** One region written three ways RDF allows, with other prefixes than the usual. */
const FORMS = [
  `<rdf:li rdf:parseType="Resource">
     <ie:RegionBoundary rdf:parseType="Resource"><ie:rbShape>rectangle</ie:rbShape><ie:rbUnit>relative</ie:rbUnit>
       <ie:rbX>0.5</ie:rbX><ie:rbY>0</ie:rbY><ie:rbW>0.5</ie:rbW><ie:rbH>1</ie:rbH></ie:RegionBoundary>
     <ie:rId>right</ie:rId><s:scale>0.2</s:scale><s:plane>Right</s:plane>
   </rdf:li>`,
  `<rdf:li><rdf:Description ie:rId="right" s:scale="0.2" s:plane="Right">
     <ie:RegionBoundary><rdf:Description ie:rbShape="rectangle" ie:rbUnit="relative" ie:rbX="0.5" ie:rbY="0" ie:rbW="0.5" ie:rbH="1"/></ie:RegionBoundary>
   </rdf:Description></rdf:li>`,
  `<rdf:li ie:rId='right' s:scale='0.2' s:plane='Right'>
     <ie:RegionBoundary ie:rbShape='rectangle' ie:rbUnit='relative' ie:rbX='0.5' ie:rbY='0' ie:rbW='0.5' ie:rbH='1'/>
   </rdf:li>`,
]
const packet = li => `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:s="${ISM_NS}" s:version="0.3" s:scale="0.1" s:referenceWidth="600" s:referenceHeight="400"/>
  <rdf:Description rdf:about="" xmlns:ie="${IPTC_EXT_NS}" xmlns:s="${ISM_NS}">
    <ie:ImageRegion><rdf:Bag>${li}</rdf:Bag></ie:ImageRegion>
  </rdf:Description></rdf:RDF></x:xmpmeta>`

test('a region is read the same in every RDF form, whatever the prefixes', () => {
  for (const li of FORMS) {
    const [r] = parseRegions(packet(li))
    assert.deepEqual({ id: r.id, shape: r.shape, unit: r.unit, x: r.x, y: r.y, w: r.w, h: r.h, ism: r.ism },
      { id: 'right', shape: 'rectangle', unit: 'relative', x: 0.5, y: 0, w: 0.5, h: 1, ism: { scale: 0.2, plane: 'Right' } })
    assert.equal(parseIsm(packet(li)).scale, 0.1, 'the image keeps its own scale')
  }
})

test('ISM nested deeper than the region, and regions that are not the image’s, are not read', () => {
  const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:Iptc4xmpExt="${IPTC_EXT_NS}" xmlns:ism="${ISM_NS}">
      <Iptc4xmpExt:ArtworkOrObject><rdf:Bag><rdf:li rdf:parseType="Resource">
        <Iptc4xmpExt:ImageRegion><rdf:Bag><rdf:li rdf:parseType="Resource"><ism:scale>9</ism:scale></rdf:li></rdf:Bag></Iptc4xmpExt:ImageRegion>
      </rdf:li></rdf:Bag></Iptc4xmpExt:ArtworkOrObject>
      <Iptc4xmpExt:ImageRegion><rdf:Bag><rdf:li rdf:parseType="Resource">
        <Iptc4xmpExt:rId>a</Iptc4xmpExt:rId>
        <Iptc4xmpExt:ArtworkOrObject><rdf:Bag><rdf:li rdf:parseType="Resource"><ism:scale>9</ism:scale></rdf:li></rdf:Bag></Iptc4xmpExt:ArtworkOrObject>
      </rdf:li></rdf:Bag></Iptc4xmpExt:ImageRegion>
    </rdf:Description></rdf:RDF></x:xmpmeta>`
  const regions = parseRegions(xmp)
  assert.equal(regions.length, 1)
  assert.equal(regions[0].id, 'a')
  assert.equal(regions[0].ism, null)
})

test('what a reader ignores in a region, it says', () => {
  const [r] = parseRegions(writeIsmXmp(GRID, []).replace('</rdf:RDF>', `<rdf:Description rdf:about="" xmlns:Iptc4xmpExt="${IPTC_EXT_NS}" xmlns:ism="${ISM_NS}">
    <Iptc4xmpExt:ImageRegion><rdf:Bag><rdf:li rdf:parseType="Resource">
      <Iptc4xmpExt:RegionBoundary rdf:parseType="Resource"><Iptc4xmpExt:rbShape>circle</Iptc4xmpExt:rbShape><Iptc4xmpExt:rbUnit>pixel</Iptc4xmpExt:rbUnit>
        <Iptc4xmpExt:rbX>10</Iptc4xmpExt:rbX><Iptc4xmpExt:rbY>10</Iptc4xmpExt:rbY><Iptc4xmpExt:rbRx>5</Iptc4xmpExt:rbRx><Iptc4xmpExt:rbW>3</Iptc4xmpExt:rbW></Iptc4xmpExt:RegionBoundary>
      <ism:referenceWidth>9</ism:referenceWidth><ism:plane>a plane, but no scale</ism:plane><ism:lengthMm>4</ism:lengthMm>
    </rdf:li></rdf:Bag></Iptc4xmpExt:ImageRegion></rdf:Description></rdf:RDF>`))
  const { boundary, ism, warnings } = checkRegion(r)
  assert.deepEqual([boundary, ism], [[], []])
  assert.equal(warnings.length, 5)
  for (const why of [/does not use rbW/, /referenceWidth belongs to the image/, /plane describes a scale/, /belongs on a line/, /relative units/]) {
    assert.ok(warnings.some(w => why.test(w)), String(why))
  }
})

// ── The reading rules ────────────────────────────────────────────────────────

test('a region’s scale holds inside it and goes before the image’s there', () => {
  const regions = parseRegions(writeIsmXmp(GRID, [LOWER]))
  assert.equal(scaleAt(GRID, regions, 600, 400, 450, 200).scale, 0.125)
  assert.equal(scaleAt(GRID, regions, 600, 400, 450, 200).source, 'region')
  assert.equal(scaleAt(GRID, regions, 600, 400, 100, 100).scale, 0.1)
  assert.equal(scaleAt(GRID, regions, 600, 400, 576, 60).scale, 0.125, 'the boundary is part of the region')
  assert.equal(scaleFor(GRID, 600, 400, regions).scale, 0.1, 'the image as a whole keeps its own')
})

test('regions with different scales that overlap leave the overlap without a scale', () => {
  const a = { id: 'a', shape: 'rectangle', x: 0, y: 0, w: 0.6, h: 1, ism: { scale: 0.2 } }
  const b = { id: 'b', shape: 'circle', x: 0.6, y: 0.5, rx: 0.2, ism: { scale: 0.3 } }
  const c = { id: 'c', shape: 'rectangle', x: 0.5, y: 0, w: 0.5, h: 0.2, ism: { scale: 0.2 } }
  const regions = parseRegions(writeIsmXmp(GRID, [a, b, c]))
  assert.equal(scaleAt(GRID, regions, 600, 400, 340, 200).ok, false)
  assert.match(scaleAt(GRID, regions, 600, 400, 340, 200).reason, /overlap/)
  assert.equal(scaleAt(GRID, regions, 600, 400, 330, 40).scale, 0.2, 'two regions that agree are one scale')
  assert.equal(scaleAt(GRID, regions, 600, 400, 420, 200).scale, 0.3)
})

test('a polygon is filled by the even-odd rule, and a point or a line has no inside', () => {
  const notch = { shape: 'polygon', points: [[0, 0], [10, 0], [10, 10], [5, 4], [0, 10]] }
  assert.equal(shapeContains(notch, 5, 2), true)
  assert.equal(shapeContains(notch, 5, 8), false, 'inside the notch is outside the polygon')
  assert.equal(shapeContains(notch, 10, 5), true, 'on an edge')
  assert.equal(shapeContains({ shape: 'polygon', points: [[0, 0], [10, 0]] }, 5, 0), false)
  assert.equal(shapeContains({ shape: 'circle', x: 0, y: 0, r: 5 }, 3, 4), true)
})

test('a distance across two scales is not given', () => {
  const regions = parseRegions(writeIsmXmp(GRID, [LOWER]))
  assert.equal(measure(GRID, regions, 600, 400, [100, 100], [450, 200]).ok, false)
  assert.ok(near(measure(GRID, regions, 600, 400, [372, 302], [564, 302]).mm, 24))
})

test('the grid may stand alone only when a region carries a scale (§5.1, §14.4)', () => {
  const grid = { version: '0.3', referenceWidth: 600, referenceHeight: 400 }
  assert.match(validate(grid).join(' '), /Missing required field: scale/)
  assert.deepEqual(validate(grid, parseRegions(writeIsmXmp(GRID, [LOWER]))), [])
  assert.match(validate(grid, parseRegions(writeIsmXmp(GRID, [{ id: 'r', shape: 'rectangle', x: 0, y: 0, w: 1, h: 1 }]))).join(' '), /scale/)
  assert.throws(() => writeIsmXmp({ referenceWidth: 600, referenceHeight: 400 }, []), /scale/)
  assert.doesNotThrow(() => writeIsmXmp({ referenceWidth: 600, referenceHeight: 400 }, [LOWER]))
})

test('merging keeps the regions and their ISM, and the file says 0.3', () => {
  const xmp = writeIsmXmp(GRID, [LOWER])
  const merged = mergeIsmIntoXmp(xmp, { scale: 0.11, referenceWidth: 600, referenceHeight: 400 })
  assert.equal(parseIsm(merged).scale, 0.11)
  assert.equal(parseIsm(merged).version, '0.3')
  assert.deepEqual(parseRegions(merged).map(r => r.ism), [LOWER.ism])
})

// ── The test files (testfiles.md) ───────────────────────────────────────────

test('30 and 36: two planes, and the same file as ExifTool rewrites it', () => {
  for (const name of ['30-png-two-planes.png', '36-png-two-planes-rewritten-by-exiftool.png']) {
    const { fields, regions, w, h } = open(name)
    assert.equal(scaleFor(fields, w, h, regions).scale, 0.1, name)
    assert.equal(scaleAt(fields, regions, w, h, 450, 200).scale, 0.125, name)
    assert.equal(scaleAt(fields, regions, w, h, 100, 100).scale, 0.1, name)
    assert.ok(near(measure(fields, regions, w, h, [372, 302], [564, 302]).mm, 24), name)
    assert.ok(near(measure(fields, regions, w, h, [30, 322], [330, 322]).mm, 30), name)
    assert.equal(measure(fields, regions, w, h, [100, 100], [450, 200]).ok, false, name)
    const readings = regionScales(fields, regions, w, h)
    assert.equal(byId(readings, 'lower-bar').scale, 0.125, `${name}: a line in the lower surface has its scale`)
    for (const id of ['upper-bar', 'lower-bar']) {
      const check = lengthCheck(fields, regions, regions.find(r => r.id === id))
      assert.ok(check.ok && near(check.difference, 0) && check.agrees, `${name} ${id}`)
    }
  }
})

test('31: two planes at half size, both scales doubled', () => {
  const { fields, regions, w, h } = open('31-png-two-planes-resized-half.png')
  assert.equal(scaleFor(fields, w, h, regions).scale, 0.2)
  assert.equal(scaleAt(fields, regions, w, h, 225, 100).scale, 0.25)
  assert.ok(near(measure(fields, regions, w, h, [186, 151], [282, 151]).mm, 24))
})

test('32: several objects, each its own size, the coin the image’s object', () => {
  const { fields, regions, w, h } = open('32-png-several-objects.png')
  assert.equal(scaleFor(fields, w, h, regions).scale, 0.1)
  const coin = mainObjectRegion(regions)
  assert.equal(coin.id, 'coin')
  assert.deepEqual(regionBox(fields, coin), fields.objectBox)
  for (const [id, wmm, hmm] of [['coin', 18, 18], ['block', 12, 8], ['shard', 12, 15]]) {
    const r = regions.find(x => x.id === id)
    assert.ok(hasRole(r, ISM_ROLES.measuredObject), id)
    const c = objectCheck(fields, regions, r)
    assert.ok(near(c.widthMm, wmm) && near(c.heightMm, hmm), `${id}: ${c.widthMm} × ${c.heightMm}`)
    assert.deepEqual([c.objectWidthMm, c.objectHeightMm], [wmm, hmm])
  }
  assert.ok(hasType(regions.find(x => x.id === 'ruler'), ISM_TYPES.ruler))
  assert.ok(lengthCheck(fields, regions, regions.find(x => x.id === 'ruler-48')).agrees)
})

test('33: only the regions have a scale, so the image has none', () => {
  const { fields, regions, w, h } = open('33-png-regions-only-scale.png')
  const image = scaleFor(fields, w, h, regions)
  assert.equal(image.ok, false)
  assert.equal(image.regionsOnly, true)
  assert.match(scaleFor(fields, w, h).reason, /Missing required field: scale/, 'a reader that knows no regions refuses it too')
  assert.equal(scaleAt(fields, regions, w, h, 100, 200).scale, 0.1)
  assert.equal(scaleAt(fields, regions, w, h, 450, 200).scale, 0.2)
  assert.equal(scaleAt(fields, regions, w, h, 300, 200).ok, false, 'between the two there is no scale')
  assert.ok(near(measure(fields, regions, w, h, [48, 202], [248, 202]).mm, 20))
  assert.ok(near(measure(fields, regions, w, h, [402, 202], [502, 202]).mm, 20))
})

test('34: a region in pixels, in a resized copy, cannot be placed', () => {
  const { fields, regions, w, h } = open('34-png-region-in-pixels-resized-half.png')
  assert.equal(scaleFor(fields, w, h, regions).scale, 0.2)
  const [r] = regionScales(fields, regions, w, h)
  assert.equal(r.placed, false)
  assert.match(r.reason, /in pixels/)
})

test('35: two planes, turned: the image keeps its scale, the regions cannot be placed', () => {
  const { fields, regions, w, h } = open('35-png-two-planes-turned.png')
  assert.equal(scaleFor(fields, w, h, regions).scale, 0.1)
  assert.ok(regionScales(fields, regions, w, h).every(r => !r.placed))
  const here = scaleAt(fields, regions, w, h, 200, 300)
  assert.equal(here.scale, 0.1)
  assert.match(here.caveat, /cannot be placed/)
})

test('15 and 16, the files of 0.2: a region in pixels on its own grid holds; without a grid nothing does', () => {
  const a = open('15-png-region-with-scale.png')
  assert.equal(scaleFor(a.fields, a.w, a.h, a.regions).scale, 0.1)
  assert.equal(scaleAt(a.fields, a.regions, a.w, a.h, 300, 370).scale, 0.15)
  const b = open('16-png-region-only.png')
  assert.equal(scaleFor(b.fields, b.w, b.h, b.regions).ok, false)
  assert.equal(scaleAt(b.fields, b.regions, b.w, b.h, 300, 370).ok, false)
  assert.equal(regionScales(b.fields, b.regions, b.w, b.h)[0].scale, null)
})

test('the packet of each region file is read the same through findXmp and parseRegions', () => {
  for (const n of ['30', '31', '32', '33', '35']) {
    const name = { 30: '30-png-two-planes.png', 31: '31-png-two-planes-resized-half.png', 32: '32-png-several-objects.png', 33: '33-png-regions-only-scale.png', 35: '35-png-two-planes-turned.png' }[n]
    assert.deepEqual(parseRegions(findXmp(file(name))), readRegions(file(name)))
  }
})

// ── Overlaps and planes at an angle (§14.5, §14.7) ──────────────────────────

test('where regions overlap, the one inside the other holds; where neither is, none does', () => {
  const outer = { id: 'surface', shape: 'rectangle', x: 0, y: 0, w: 0.8, h: 1, ism: { scale: 0.2 } }
  const inner = { id: 'detail', shape: 'circle', x: 0.4, y: 0.5, rx: 0.1, ism: { scale: 0.18 } }
  const across = { id: 'across', shape: 'rectangle', x: 0.7, y: 0.2, w: 0.3, h: 0.2, ism: { scale: 0.25 } }
  const regions = parseRegions(writeIsmXmp(GRID, [outer, inner, across]))
  assert.equal(scaleAt(GRID, regions, 600, 400, 240, 200).scale, 0.18, 'the detail lies inside the surface')
  assert.equal(scaleAt(GRID, regions, 600, 400, 60, 200).scale, 0.2)
  assert.equal(scaleAt(GRID, regions, 600, 400, 450, 120).ok, false, 'a partial overlap gives no scale')
  assert.equal(scaleAt(GRID, regions, 600, 400, 560, 120).scale, 0.25)
  // The order regions are written in decides nothing: a Bag has none.
  const turned = parseRegions(writeIsmXmp(GRID, [across, inner, outer]))
  assert.equal(scaleAt(GRID, turned, 600, 400, 240, 200).scale, 0.18)
  // Two regions with the same boundary and different scales: neither is inside the other.
  const twin = parseRegions(writeIsmXmp(GRID, [outer, { ...outer, id: 'twin', ism: { scale: 0.3 } }]))
  assert.equal(scaleAt(GRID, twin, 600, 400, 60, 200).ok, false)
})

/** The inverse of a 3 × 3 matrix written as nine numbers. */
function invert([a, b, c, d, e, f, g, h, i]) {
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g
  const det = a * A + b * B + c * C
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map(n => n / det)
}
const carry = (h, [x, y]) => { const w = h[6] * x + h[7] * y + h[8]; return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w] }

test('37 and 38: a board at an angle, measured through its homography', () => {
  for (const [name, k] of [['37-png-tilted-board.png', 1], ['38-png-tilted-board-resized-half.png', 0.5]]) {
    const { fields, regions, w, h } = open(name)
    const image = scaleFor(fields, w, h, regions)
    assert.equal(image.ok, false, name)
    assert.equal(image.regionsOnly, true, name)
    const board = regions.find(r => r.id === 'board')
    const toImage = invert(board.ism.homography)
    const at = (X, Y) => carry(toImage, [X, Y]).map(n => n * k) // a point of the board, in pixels of this copy
    // Along the board, across it, and on the slant: the plane gives each its true length.
    for (const [p, q, mm] of [[[10, 30], [70, 30], 60], [[40, 5], [40, 55], 50], [[10, 10], [70, 50], Math.hypot(60, 40)], [[10, 50], [70, 50], 60]]) {
      const m = measure(fields, regions, w, h, at(...p), at(...q))
      assert.ok(m.ok && near(m.mm, mm, 1e-9), `${name}: ${m.mm} for ${mm}`)
    }
    // A single number would get the near edge and the far edge wrong in opposite directions.
    const far = Math.hypot(...[0, 1].map(i => at(70, 10)[i] - at(10, 10)[i])) * board.ism.scale / k
    const near_ = Math.hypot(...[0, 1].map(i => at(70, 50)[i] - at(10, 50)[i])) * board.ism.scale / k
    assert.ok(far < 59 && near_ > 61, `the stated scale alone gives ${far} and ${near_} for 60 mm`)
    const centre = scaleAt(fields, regions, w, h, ...at(40, 30))
    assert.ok(near(centre.local, board.ism.scale / k, 1e-4), 'the stated scale is the one at the centre')
    for (const id of ['marker-12', 'marker-13', 'marker-14', 'marker-15']) {
      const c = lengthCheck(fields, regions, regions.find(r => r.id === id))
      assert.ok(c.ok && c.agrees && Math.abs(c.difference) < 1e-5 && c.within === 'pixel', `${name} ${id}`)
    }
    const block = objectCheck(fields, regions, regions.find(r => r.id === 'block'))
    assert.ok(block.homography && near(block.widthMm, 20, 1e-5) && near(block.heightMm, 10, 1e-5), `${block.widthMm} × ${block.heightMm}`)
  }
})

test('a homography is written and read back, on a region and on the image, and a bad one is refused', () => {
  const hmg = [0.2, 0.01, -3, 0, 0.25, -2, 0, 0.0004, 1]
  const xmp = writeIsmXmp({ ...GRID, homography: hmg }, [{ ...LOWER, ism: { ...LOWER.ism, homography: hmg } }])
  assert.deepEqual(parseIsm(xmp).homography, hmg)
  assert.deepEqual(parseRegions(xmp)[0].ism.homography, hmg)
  assert.match(validate({ ...GRID, homography: [1, 2, 3] }).join(' '), /nine numbers/)
  assert.match(validate({ version: '0.3', referenceWidth: 10, referenceHeight: 10, homography: hmg }, [LOWER]).join(' '), /scale beside it/)
  assert.throws(() => writeIsmXmp(GRID, [{ ...LOWER, ism: { ...LOWER.ism, homography: [0, 0, 0, 0, 0, 0, 0, 0, 0] } }]), /singular/)
  assert.throws(() => writeIsmXmp(GRID, [{ ...LOWER, ism: { homography: hmg } }]), /none of its own/)
})

test('the image’s own homography holds outside the regions, and not in a turned copy', () => {
  // A plane where x and y both run at 0.1 mm per pixel, plus a tilt that slows y towards the bottom.
  const hmg = [0.1, 0, 0, 0, 0.1, 0, 0, 0.001, 1]
  const fields = { ...GRID, homography: hmg }
  const m = measure(fields, [], 600, 400, [100, 0], [100, 300])
  const [a, b] = [carry(hmg, [100, 0]), carry(hmg, [100, 300])]
  assert.ok(near(m.mm, Math.hypot(b[0] - a[0], b[1] - a[1]), 1e-12), String(m.mm))
  assert.ok(Math.abs(m.mm - 300 * 0.1) > 5, 'not the stated scale times the pixels')
  const half = measure(fields, [], 300, 200, [50, 0], [50, 150])
  assert.ok(near(half.mm, m.mm, 1e-9), 'a resized copy measures the same')
  const turned = scaleAt(fields, [], 400, 600, 10, 10)
  assert.equal(turned.homography, null)
  assert.match(turned.caveat, /turned/)
})
