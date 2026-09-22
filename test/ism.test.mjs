// Run: node --test test/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ISM_NS, embedXmpInJpeg, findXmp, jpegHasXmpSegment, jpegOrientation, mergeIsmIntoXmp, niceLength, parseIsm, readIsm,
  scaleFor, validate, writeIsmXmp,
} from '../js/ism.js'
import * as ism from '../js/ism.js'

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

test('merging keeps the file\'s own metadata and replaces older ISM', () => {
  const museum = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
      photoshop:Credit="Kalmar läns museum">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">Bronze bird</rdf:li></rdf:Alt></dc:title>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:sc="${ISM_NS}" sc:version="0.1" sc:scale="0.5" sc:referenceWidth="10" sc:referenceHeight="10"/>
  </rdf:RDF></x:xmpmeta>`
  const merged = mergeIsmIntoXmp(museum, { scale: 0.037, referenceWidth: 1078, referenceHeight: 1077, method: 'ruler' })
  assert.match(merged, /Bronze bird/)
  assert.match(merged, /photoshop:Credit="Kalmar läns museum"/)
  assert.deepEqual(parseIsm(merged), { version: '0.1', method: 'ruler', scale: 0.037, referenceWidth: 1078, referenceHeight: 1077 })
  assert.equal((merged.match(/https:\/\/w3id\.org\/ism\/0\.1\//g) || []).length, 1, 'one ISM namespace, the old one gone')
  assert.doesNotMatch(merged, /sc:/)
})

test('merging into a packet that shares its Description with other fields keeps them', () => {
  const shared = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:photarch="https://photarch.com/ns/" xmlns:ism="${ISM_NS}"
      photarch:widthMm="28" ism:version="0.1" ism:scale="0.03" ism:referenceWidth="100" ism:referenceHeight="50">
      <ism:objectBox><rdf:Seq><rdf:li>1</rdf:li><rdf:li>2</rdf:li><rdf:li>3</rdf:li><rdf:li>4</rdf:li></rdf:Seq></ism:objectBox>
    </rdf:Description></rdf:RDF></x:xmpmeta>`
  const merged = mergeIsmIntoXmp(shared, { scale: 0.04, referenceWidth: 100, referenceHeight: 50 })
  assert.match(merged, /photarch:widthMm="28"/)
  assert.deepEqual(parseIsm(merged), { version: '0.1', scale: 0.04, referenceWidth: 100, referenceHeight: 50 })
})

test('EXIF orientation is read, and an XMP segment is noticed', () => {
  // SOI, APP1 Exif (big-endian TIFF, IFD0 with one entry: Orientation = 6), SOS, EOI.
  const tiff = [0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0]
  const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
  const len = 2 + body.length
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...body, 0xff, 0xda, 0, 2, 0xff, 0xd9])
  assert.equal(jpegOrientation(jpeg), 6)
  assert.equal(jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2])), 1)
  assert.equal(jpegHasXmpSegment(jpeg), false)
  assert.equal(jpegHasXmpSegment(embedXmpInJpeg(jpeg, writeIsmXmp({ scale: 1, referenceWidth: 1, referenceHeight: 1 }))), true)
  assert.equal(jpegOrientation(embedXmpInJpeg(jpeg, writeIsmXmp({ scale: 1, referenceWidth: 1, referenceHeight: 1 }))), 6, 'Exif kept')
})

test('written into a PNG, replacing an older packet, and read back', () => {
  const png = makePng()
  const first = ism.embedXmpInPng(png, ism.writeIsmXmp({ scale: 0.05, referenceWidth: 8, referenceHeight: 4, version: '0.1' }))
  const second = ism.embedXmpInPng(first, ism.writeIsmXmp({ scale: 0.02, referenceWidth: 8, referenceHeight: 4, version: '0.1' }))
  assert.equal(ism.readIsm(second).scale, 0.02)
  // one packet, not two
  assert.equal(countOf(second, 'XML:com.adobe.xmp'), 1)
  // the picture itself is untouched
  assert.ok(indexOfBytes(second, png.subarray(8, 33)) > 0)
})

test('written into a TIFF as tag 700, and read back', () => {
  const tiff = makeTiff()
  const out = ism.embedXmpInTiff(tiff, ism.writeIsmXmp({ scale: 0.1, referenceWidth: 4, referenceHeight: 2, version: '0.1' }))
  assert.equal(ism.readIsm(out).scale, 0.1)
  // the header points at a directory that now holds tag 700
  const dv = new DataView(out.buffer, out.byteOffset)
  const ifd = dv.getUint32(4, true)
  const count = dv.getUint16(ifd, true)
  const tags = Array.from({ length: count }, (_, i) => dv.getUint16(ifd + 2 + i * 12, true))
  assert.ok(tags.includes(700), 'tag 700 is there')
  assert.deepEqual(tags, [...tags].sort((a, b) => a - b), 'entries stay in tag order')
  // writing again replaces it rather than adding a second
  const again = ism.embedXmpInTiff(out, ism.writeIsmXmp({ scale: 0.2, referenceWidth: 4, referenceHeight: 2, version: '0.1' }))
  const dv2 = new DataView(again.buffer, again.byteOffset)
  const ifd2 = dv2.getUint32(4, true)
  const count2 = dv2.getUint16(ifd2, true)
  assert.equal(count2, count)
  assert.equal(ism.readIsm(again).scale, 0.2)
})

test('embedXmp picks the format from the bytes', () => {
  const xmp = ism.writeIsmXmp({ scale: 0.1, referenceWidth: 4, referenceHeight: 2, version: '0.1' })
  for (const bytes of [makePng(), makeTiff()]) {
    assert.equal(ism.readIsm(ism.embedXmp(bytes, xmp)).scale, 0.1)
  }
  assert.throws(() => ism.embedXmp(Uint8Array.from([1, 2, 3, 4]), xmp), /Unsupported format/)
})

// ── small files to write into ─────────────────────────────────────────────────

function makePng() {
  const chunk = (type, data) => {
    const out = new Uint8Array(12 + data.length)
    new DataView(out.buffer).setUint32(0, data.length)
    out.set(Uint8Array.from(type, c => c.charCodeAt(0)), 4)
    out.set(data, 8)
    new DataView(out.buffer).setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
    return out
  }
  const ihdr = new Uint8Array(13)
  const dv = new DataView(ihdr.buffer)
  dv.setUint32(0, 8); dv.setUint32(4, 4); ihdr[8] = 8; ihdr[9] = 2
  const parts = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', Uint8Array.from([120, 1, 1, 0, 0, 255, 255, 0, 0, 0, 1])), chunk('IEND', new Uint8Array(0))]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

function makeTiff() {
  const tags = [[256, 3, 1, 4], [257, 3, 1, 2], [258, 3, 1, 8], [259, 3, 1, 1], [262, 3, 1, 1], [273, 4, 1, 0], [277, 3, 1, 1], [279, 4, 1, 8]]
  const ifdAt = 8
  const pixelsAt = ifdAt + 2 + tags.length * 12 + 4
  const out = new Uint8Array(pixelsAt + 8)
  const dv = new DataView(out.buffer)
  out[0] = 0x49; out[1] = 0x49
  dv.setUint16(2, 42, true)
  dv.setUint32(4, ifdAt, true)
  dv.setUint16(ifdAt, tags.length, true)
  tags.forEach(([tag, type, count, value], i) => {
    const at = ifdAt + 2 + i * 12
    dv.setUint16(at, tag, true); dv.setUint16(at + 2, type, true); dv.setUint32(at + 4, count, true)
    if (tag === 273) dv.setUint32(at + 8, pixelsAt, true)
    else if (type === 3) dv.setUint16(at + 8, value, true)
    else dv.setUint32(at + 8, value, true)
  })
  dv.setUint32(ifdAt + 2 + tags.length * 12, 0, true)
  return out
}

function countOf(bytes, text) {
  const needle = Uint8Array.from(text, c => c.charCodeAt(0))
  let n = 0
  for (let i = 0; i <= bytes.length - needle.length; i++) {
    let hit = true
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) { hit = false; break }
    if (hit) n++
  }
  return n
}

function indexOfBytes(hay, needle) {
  outer: for (let i = 0; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer
    return i
  }
  return -1
}

function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return (c ^ 0xffffffff) >>> 0
}
