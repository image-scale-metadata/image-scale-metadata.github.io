// Run: node --test test/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ISM_NS, embedXmpInJpeg, findXmp, niceLength, parseIsm, readIsm, scaleFor, validate, writeIsmXmp,
} from '../js/ism.js'

const FULL = {
  scale: 0.0428, referenceWidth: 1509, referenceHeight: 1509,
  method: 'calipers', methodNote: 'Length of the blade, 42.80 mm, measured with calipers',
  uncertainty: 0.004, measuredAt: '2026-09-21', software: 'PHOTARCH Desktop 1.0',
  plane: 'Upper surface of the find', objectWidthMm: 42.8, objectHeightMm: 39.92,
  objectBox: [254, 286, 1000, 933],
}

test('what is written is read back, all of it', () => {
  const back = parseIsm(writeIsmXmp(FULL))
  assert.deepEqual(back, { version: '0.1', ...FULL })
})

test('the same fields always give the same packet', () => {
  assert.equal(writeIsmXmp(FULL), writeIsmXmp({ ...FULL }))
})

test('a writer refuses an incomplete core', () => {
  assert.throws(() => writeIsmXmp({ scale: 0.05, referenceWidth: 100 }), /referenceHeight/)
})

test('the element form and another prefix are read too', () => {
  const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:sc="${ISM_NS}">
      <sc:version>0.1</sc:version><sc:scale>0.01</sc:scale>
      <sc:referenceWidth>2000</sc:referenceWidth><sc:referenceHeight>1000</sc:referenceHeight>
      <sc:methodNote>ruler &amp; eye</sc:methodNote>
    </rdf:Description></rdf:RDF></x:xmpmeta>`
  assert.deepEqual(parseIsm(xmp), { version: '0.1', scale: 0.01, referenceWidth: 2000, referenceHeight: 1000, methodNote: 'ruler & eye' })
})

test('a packet without the namespace has no ISM', () => {
  assert.equal(parseIsm('<x:xmpmeta><rdf:Description photarch:widthMm="4"/></x:xmpmeta>'), null)
  assert.equal(findXmp(new Uint8Array([1, 2, 3])), null)
})

test('readers: same grid, resized, turned, cropped (§6)', () => {
  const f = { version: '0.1', scale: 0.04, referenceWidth: 3000, referenceHeight: 2000 }
  assert.deepEqual(scaleFor(f, 3000, 2000), { ok: true, scale: 0.04, resized: false, turned: false })
  const half = scaleFor(f, 1500, 1000)
  assert.equal(half.ok, true)
  assert.ok(Math.abs(half.scale - 0.08) < 1e-12, 'half the pixels, twice the millimetres each')
  assert.equal(scaleFor(f, 2000, 3000).turned, true, 'turned by 90°: same scale')
  assert.equal(scaleFor(f, 1000, 1500).scale, 0.08, 'turned and at half size: 1000 × 1500 is 1500 × 1000 turned')
  const cropped = scaleFor(f, 2000, 2000)
  assert.equal(cropped.ok, false)
  assert.match(cropped.reason, /cropped/)
})

test('readers refuse what is not valid', () => {
  assert.match(scaleFor(null, 10, 10).reason, /No Image Scale Metadata/)
  assert.match(validate({ version: '0.1', scale: -1, referenceWidth: 10, referenceHeight: 10 }).join(), /above 0/)
  assert.match(validate({ version: '0.1', scale: 1, referenceWidth: 10, referenceHeight: 10, method: 'guess' }).join(), /method/)
  assert.match(validate({ version: '0.1', scale: 1, referenceWidth: 10.5, referenceHeight: 10 }).join(), /whole number/)
})

test('a round scale bar length', () => {
  assert.deepEqual(niceLength(0.1, 100), { mm: 10, px: 100 })
  assert.equal(niceLength(0.0428, 300).mm, 10)
  assert.equal(niceLength(0.0428, 120).mm, 5)
})

test('embedded in a JPEG, replacing an older XMP, and read back from the bytes', () => {
  // The smallest stream with the markers that matter: SOI, an old XMP APP1, SOS, EOI.
  const header = new TextEncoder().encode('http://ns.adobe.com/xap/1.0/\0')
  const oldXmp = new TextEncoder().encode('<x:xmpmeta>old</x:xmpmeta>')
  const len = 2 + header.length + oldXmp.length
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...header, ...oldXmp, 0xff, 0xda, 0, 2, 9, 9, 0xff, 0xd9])
  const out = embedXmpInJpeg(jpeg, writeIsmXmp(FULL))
  assert.equal(readIsm(out).scale, 0.0428)
  assert.equal(new TextDecoder().decode(out).includes('>old<'), false, 'the old XMP is gone')
  assert.deepEqual([...out.subarray(-6)], [0xff, 0xda, 0, 2, 9, 9, 0xff, 0xd9].slice(-6), 'the image data is untouched')
})
