// Models (§13). Run: node --test test/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  ISM_NS, ISM_VERSION, assetPacket, modelGeometry, modelScaleFor, parseIsm, readGltf, readModel, scaleFor, sha256Hex,
  validate, writeGlb, writeIsmXmp, writeModelIsm,
} from '../js/ism.js'

const file = name => new Uint8Array(readFileSync(new URL(`../testfiles/${name}`, import.meta.url)))
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))
const nearAll = (a, b, tol) => a.length === b.length && a.every((x, i) => near(x, b[i], tol))

/** A GLB with one triangle, from positions given as float32 or as normalized int16. */
function triangle({ positions = [0, 0, 0, 0.05, 0, 0, 0, 0.02, 0.01], int16 = false, node = {} } = {}) {
  const pos = int16 ? new Int16Array(positions) : new Float32Array(positions)
  const bin = new Uint8Array((pos.byteLength + 3) & ~3)
  bin.set(new Uint8Array(pos.buffer))
  return writeGlb({
    asset: { version: '2.0' },
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, ...node }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{
      bufferView: 0, componentType: int16 ? 5122 : 5126, normalized: int16 || undefined, count: 3, type: 'VEC3',
      min: [0, 0, 0], max: int16 ? [32767, 32767, 32767] : [0.05, 0.02, 0.01],
    }],
    bufferViews: [{ buffer: 0, byteLength: pos.byteLength, byteStride: int16 ? 8 : undefined }],
    buffers: [{ byteLength: bin.length }],
  }, bin)
}

const GIVEN = { scale: 1000, method: 'calipers', uncertainty: 0.001, measuredAt: '2026-10-22' }

test('SHA-256 agrees with the platform', () => {
  for (const n of [0, 3, 55, 56, 63, 64, 65, 1000]) {
    const b = new Uint8Array(n).map((_, i) => (i * 31 + 7) & 0xff)
    assert.equal(sha256Hex(b), createHash('sha256').update(b).digest('hex'))
  }
})

test('the geometry: extent after transforms, hash of the vertices as stored', () => {
  const g = modelGeometry(readGltf(triangle()))
  assert.ok(nearAll(g.extent, [0.05, 0.02, 0.01]))
  assert.equal(g.vertexCount, 3)
  const bytes = new Uint8Array(new Float32Array([0, 0, 0, 0.05, 0, 0, 0, 0.02, 0.01]).buffer)
  assert.equal(g.hash, createHash('sha256').update(bytes).digest('hex'), 'the hash is of the float32 values, little-endian')
  const moved = modelGeometry(readGltf(triangle({ node: { translation: [5, 5, 5], scale: [2, 2, 2] } })))
  assert.ok(nearAll(moved.extent, [0.1, 0.04, 0.02]), 'the node scale is in the extent')
  assert.equal(moved.hash, g.hash, 'but not in the hash')
})

test('normalized integers are decoded before they are hashed, and byteStride is honoured', () => {
  // 32767 is 1.0; with stride 8 each vertex has two bytes of padding.
  const raw = [0, 0, 0, 0, 32767, 0, 0, 0, 0, 16384, 32767, 0]
  const g = modelGeometry(readGltf(triangle({ positions: raw, int16: true, node: { scale: [0.05, 0.02, 0.01] } })))
  assert.ok(nearAll(g.extent, [0.05, 0.02 * 16384 / 32767, 0.01]))
  const decoded = new Float32Array([0, 0, 0, 1, 0, 0, 0, 16384 / 32767, 1])
  assert.equal(g.hash, createHash('sha256').update(new Uint8Array(decoded.buffer)).digest('hex'))
})

test('a .gltf with its buffer inlined is read and written as text', () => {
  const { json, buffers } = readGltf(triangle())
  json.buffers[0].uri = 'data:application/octet-stream;base64,' + Buffer.from(buffers[0]).toString('base64')
  const text = new TextEncoder().encode(JSON.stringify(json))
  const out = writeModelIsm(text, GIVEN)
  assert.equal(String.fromCharCode(out[0]), '{')
  assert.equal(readModel(out).reading.ok, true)
})

test('what the writer writes is read back, with extent and hash worked out from the file', () => {
  const out = writeModelIsm(triangle(), { ...GIVEN, referenceExtent: [9, 9, 9], geometryHash: '0'.repeat(64) })
  const { fields, geometry, reading } = readModel(out)
  assert.equal(fields.version, ISM_VERSION)
  assert.ok(nearAll(fields.referenceExtent, geometry.extent, 0), 'the given extent is ignored')
  assert.equal(fields.geometryHash, geometry.hash, 'and so is the given hash')
  assert.equal(fields.method, 'calipers')
  assert.deepEqual({ ok: reading.ok, geometry: reading.geometry, turned: reading.turned, rescaled: reading.rescaled },
    { ok: true, geometry: 'measured', turned: false, rescaled: false })
  assert.ok(nearAll(reading.sizeMm, [50, 20, 10]))
  const json = readGltf(out).json
  assert.deepEqual(json.extensionsUsed, ['KHR_xmp_json_ld'])
  assert.equal(assetPacket(json)['@context'].ism, ISM_NS)
})

test('the writer keeps the packet\'s other metadata and replaces older ISM, under its own prefix', () => {
  const { json, buffers } = readGltf(triangle())
  json.extensionsUsed = ['KHR_xmp_json_ld']
  json.extensions = { KHR_xmp_json_ld: { packets: [{
    '@context': { dc: 'http://purl.org/dc/elements/1.1/', sc: ISM_NS }, '@id': '',
    'dc:creator': { '@list': ['A. Person'] }, 'sc:scale': 1, 'sc:method': 'other',
  }] } }
  json.asset.extensions = { KHR_xmp_json_ld: { packet: 0 } }
  const out = writeModelIsm(writeGlb(json, buffers[0]), GIVEN)
  const packet = assetPacket(readGltf(out).json)
  assert.deepEqual(packet['dc:creator'], { '@list': ['A. Person'] })
  assert.equal(packet['sc:scale'], 1000)
  assert.equal(packet['sc:method'], 'calipers')
  assert.equal(packet['ism:scale'], undefined, 'no second prefix for the same namespace')
  assert.equal(readGltf(out).json.extensions.KHR_xmp_json_ld.packets.length, 1)
})

test('a writer refuses an incomplete core', () => {
  assert.throws(() => writeModelIsm(triangle(), { method: 'calipers' }), /scale/)
})

test('model fields are checked as a model\'s, and kept apart from an image\'s', () => {
  const f = { version: '0.2', scale: 1000, referenceExtent: [0.05, 0.02, 0.01], geometryHash: 'a'.repeat(64) }
  assert.deepEqual(validate(f), [])
  assert.match(validate({ ...f, geometryHash: undefined }).join(), /geometryHash/)
  assert.match(validate({ ...f, geometryHash: 'ABC' }).join(), /64 lower-case/)
  assert.match(validate({ ...f, referenceExtent: [1, 0, 1] }).join(), /three numbers above 0/)
  assert.match(validate({ ...f, referenceWidth: 10, referenceHeight: 10 }).join(), /either an image or a model/)
  assert.match(scaleFor(f, 100, 100).reason, /three-dimensional model/)
  assert.match(modelScaleFor({ version: '0.2', scale: 0.1, referenceWidth: 10, referenceHeight: 10 }, { extent: [1, 1, 1], hash: '' }).reason, /an image, not a model/)
  assert.match(validate({ ...f, method: 'scanner' }).join() + validate({ ...f, method: 'ct' }).join(), /^$/)
})

test('a sidecar holds the model fields as XMP, and they are read back', () => {
  const f = { scale: 1, referenceExtent: [60, 20, 40], geometryHash: 'b'.repeat(64), method: 'scanner' }
  assert.deepEqual(parseIsm(writeIsmXmp(f)), { version: ISM_VERSION, ...f })
})

// The answers in testfiles.md, file by file.
const ANSWERS = {
  '20-model-measured.glb': { scale: 1000, geometry: 'measured', turned: false, rescaled: false, sizeMm: [60, 20, 40] },
  '21-model-decimated.glb': { scale: 1000, geometry: 'changed', turned: false, rescaled: false, sizeMm: [60, 20, 40] },
  '22-model-turned.glb': { scale: 1000, geometry: 'measured', turned: true, rescaled: false, sizeMm: [60, 40, 20] },
  '23-model-in-millimetres.glb': { scale: 1, geometry: 'changed', turned: false, rescaled: true, sizeMm: [60, 20, 40] },
}

test('the test files give their answers (testfiles.md)', () => {
  for (const [name, want] of Object.entries(ANSWERS)) {
    const { reading } = readModel(file(name))
    assert.equal(reading.ok, true, name)
    assert.ok(near(reading.scale, want.scale), `${name}: ${reading.scale}`)
    assert.ok(nearAll(reading.sizeMm, want.sizeMm), `${name}: ${reading.sizeMm}`)
    for (const k of ['geometry', 'turned', 'rescaled']) assert.equal(reading[k], want[k], `${name}: ${k}`)
  }
  const cut = readModel(file('24-model-cut.glb')).reading
  assert.equal(cut.ok, false)
  assert.match(cut.reason, /cut or changed/)
  const none = readModel(file('25-model-no-ism.glb'))
  assert.equal(none.fields, null)
  assert.ok(nearAll(none.geometry.extent, [0.06, 0.02, 0.04]), 'without ISM the file\'s own metres are all there is')
})
