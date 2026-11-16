// Run: node --test test/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { fingerprintMatch, fingerprintOf, gridFor, parseIsm, readIsm, scaleFor, writeIsmXmp } from '../js/ism.js'

const answers = JSON.parse(readFileSync(new URL('../testfiles/fingerprints.json', import.meta.url)))

/** The pixels of one of the test PNGs: 8-bit RGB, no filter, as tools/make-fingerprint-testfiles.mjs writes them. */
function open(name) {
  const bytes = new Uint8Array(readFileSync(new URL(`../testfiles/${name}`, import.meta.url)))
  const view = new DataView(bytes.buffer, bytes.byteOffset)
  const data = []
  let width, height
  for (let at = 8; at < bytes.length;) {
    const length = view.getUint32(at), type = String.fromCharCode(...bytes.subarray(at + 4, at + 8))
    if (type === 'IHDR') { width = view.getUint32(at + 8); height = view.getUint32(at + 12) }
    if (type === 'IDAT') data.push(bytes.subarray(at + 8, at + 8 + length))
    at += 12 + length
  }
  const raw = inflateSync(Buffer.concat(data)), rgb = new Uint8Array(width * height * 3)
  for (let y = 0; y < height; y++) {
    assert.equal(raw[y * (width * 3 + 1)], 0, 'filter: none')
    rgb.set(raw.subarray(y * (width * 3 + 1) + 1, (y + 1) * (width * 3 + 1)), y * width * 3)
  }
  return { fields: readIsm(bytes), width, height, print: fingerprintOf(rgb, width, height, 3) }
}

function syntheticBytes(count) {
  const out = new Uint8Array(count)
  let x = 1n
  for (let i = 0; i < count; i++) { x = (1103515245n * x + 12345n) % 2147483648n; out[i] = Number((x >> 16n) & 255n) }
  return out
}

test('fingerprint: the same arithmetic in every reader (§4.5)', () => {
  for (const [name, print] of Object.entries(answers.files)) assert.equal(open(name).print, print, name)
  for (const channels of [1, 2, 3, 4]) assert.equal(fingerprintOf(syntheticBytes(64 * 48 * channels), 64, 48, channels), answers.synthetic[channels], `${channels} channels`)
  assert.match(answers.files['40-png-fingerprint.png'], /^y16:[0-9a-f]{512}$/)
  assert.equal(fingerprintOf(new Uint8Array(31 * 100 * 3), 31, 100, 3), null, 'too small to tell by')
})

test('fingerprint: the file carries the fingerprint of its own pixels (§5.8)', () => {
  const whole = open('40-png-fingerprint.png')
  assert.equal(whole.fields.fingerprint, whole.print)
  assert.equal(parseIsm(writeIsmXmp(whole.fields)).fingerprint, whole.print, 'written and read back')
})

test('fingerprint: a resized copy keeps its scale, a cropped one loses it (§6.3)', () => {
  const answer = name => { const f = open(name); return scaleFor(f.fields, f.width, f.height, null, f.print) }
  const blind = name => { const f = open(name); return scaleFor(f.fields, f.width, f.height) }

  assert.deepEqual(answer('40-png-fingerprint.png'), { ok: true, scale: 0.1, resized: false, turned: false })

  const half = answer('41-png-fingerprint-resized-half.png')
  assert.equal(half.ok, true)
  assert.ok(Math.abs(half.scale - 0.2) < 1e-12)
  assert.equal(half.checked, true)

  const turned = answer('42-png-fingerprint-turned-resized-half.png')
  assert.ok(turned.ok && Math.abs(turned.scale - 0.2) < 1e-12 && turned.turned && turned.checked)
  const f = open('42-png-fingerprint-turned-resized-half.png')
  const grid = gridFor(f.fields, f.width, f.height, f.print)
  assert.deepEqual([grid.turn, grid.mirrored], [90, false], 'and the fingerprint says which way it was turned')

  for (const name of ['43-png-fingerprint-cropped-same-shape.png', '44-png-fingerprint-cropped-upright.png', '45-png-fingerprint-cropped-by-a-twentieth.png']) {
    const a = answer(name)
    assert.equal(a.ok, false, name)
    assert.equal(a.cropped, true, name)
    assert.match(a.reason, /cropped/)
    // What the dimensions alone say, and why the fingerprint is there: a scale, and a wrong one.
    assert.equal(blind(name).ok, true, `${name}, read without its pixels`)
    assert.equal(blind(name).checked, undefined)
  }
})

test('fingerprint: what cannot be checked is read as before (§6.3)', () => {
  const f = open('43-png-fingerprint-cropped-same-shape.png')
  const even = 'y16:' + '80'.repeat(256)
  assert.equal(fingerprintMatch(even, f.print).checkable, false, 'an even picture tells nothing')
  assert.equal(fingerprintMatch('z9:abc', f.print).checkable, false, 'a scheme this reader does not know')
  assert.equal(scaleFor({ ...f.fields, fingerprint: 'z9:abc' }, f.width, f.height, null, f.print).ok, true)
  assert.equal(scaleFor({ ...f.fields, fingerprint: even }, f.width, f.height, null, f.print).ok, true)
})

test('fingerprint: the reference size is not proof of the same picture (§6.2)', () => {
  const whole = open('40-png-fingerprint.png'), crop = open('43-png-fingerprint-cropped-same-shape.png')
  const same = gridFor(whole.fields, whole.width, whole.height, whole.print)
  assert.deepEqual([same.ok, same.resized, same.factor, same.checked], [true, false, 1, true], 'the file itself, checked')
  // The crop enlarged back to the reference size has the crop's fingerprint and the whole picture's dimensions.
  const enlarged = scaleFor(whole.fields, whole.width, whole.height, null, crop.print)
  assert.deepEqual([enlarged.ok, enlarged.cropped], [false, true], 'a crop enlarged back to the reference size')
  assert.equal(scaleFor(whole.fields, whole.width, whole.height).ok, true, 'without the pixels it is read as before')
})
