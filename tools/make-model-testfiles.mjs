// Test files for models (§13), made from scratch so that every number in them
// is known exactly: an ellipsoid 60 × 20 × 40 mm (x × y × z, y up, as glTF
// stands a model), written as GLB, given ISM by the reference writer, and then
// changed the ways models are changed on their way between programs. Each copy
// keeps the packet of the measured file, as a program that kept the metadata
// would, and the reader must decide per copy whether the scale still holds.
// Run: node tools/make-model-testfiles.mjs
//
// The answers a reader must give for each file are in testfiles.md.

import { writeFileSync } from 'node:fs'
import { assetPacket, readGltf, writeGlb, writeModelIsm } from '../js/ism.js'

const OUT = 'testfiles'
// Semi-axes in metres, glTF's unit: 60 mm long, 40 mm wide, 20 mm thick.
const A = 0.030, B = 0.020, C = 0.010

/**
 * An ellipsoid as rings of latitude from pole to pole. With an even number of
 * rings and a multiple of four meridians there are vertices exactly at ±A, ±B
 * and ±C, so the extent is the ellipsoid's own size.
 *
 * `from`/`to` limit the meridians (radians), to cut the ellipsoid open.
 */
function ellipsoid(rings, meridians, { from = 0, to = 2 * Math.PI, factor = 1 } = {}) {
  const whole = to - from >= 2 * Math.PI - 1e-9
  const cols = whole ? meridians : Math.round(meridians * (to - from) / (2 * Math.PI)) + 1
  const pos = [], idx = []
  for (let i = 0; i <= rings; i++) {
    const t = Math.PI * i / rings
    for (let j = 0; j < cols; j++) {
      const f = from + (to - from) * j / (whole ? cols : cols - 1)
      // Exact zeros and ones where the trigonometry is only nearly so.
      const st = i === rings / 2 ? 1 : Math.sin(t), ct = i === rings / 2 ? 0 : Math.cos(t)
      pos.push(A * st * Math.cos(f) * factor, C * ct * factor, B * st * Math.sin(f) * factor)
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < (whole ? cols : cols - 1); j++) {
      const a = i * cols + j, b = i * cols + (j + 1) % cols
      idx.push(a, a + cols, b, b, a + cols, b + cols)
    }
  }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx) }
}

/** A GLB holding one mesh, with an optional transform on its node. */
function glbOf({ pos, idx }, node = {}) {
  const bin = new Uint8Array(pos.byteLength + idx.byteLength)
  bin.set(new Uint8Array(pos.buffer), 0)
  bin.set(new Uint8Array(idx.buffer), pos.byteLength)
  const min = [0, 1, 2].map(c => Math.min(...pos.filter((_, i) => i % 3 === c)))
  const max = [0, 1, 2].map(c => Math.max(...pos.filter((_, i) => i % 3 === c)))
  const json = {
    asset: { version: '2.0', generator: 'ISM reference tools' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'object', mesh: 0, ...node }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5125, count: idx.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: pos.byteLength, target: 34962 },
      { buffer: 0, byteOffset: pos.byteLength, byteLength: idx.byteLength, target: 34963 },
    ],
    buffers: [{ byteLength: bin.length }],
  }
  return writeGlb(json, bin)
}

/** A copy of `glb` carrying the measured file's packet, as a program that kept it would. */
function withPacketOf(measured, glb) {
  const from = readGltf(measured).json
  const { json, buffers } = readGltf(glb)
  json.extensionsUsed = from.extensionsUsed
  json.extensions = from.extensions
  json.asset.extensions = from.asset.extensions
  return writeGlb(json, buffers[0])
}

// The measured model, with a little XMP of its own already in it: the writer
// must keep it and add ISM beside it (§4.0, §13.5).
const fine = ellipsoid(32, 64)
const plain = glbOf(fine)
const own = readGltf(plain)
own.json.extensionsUsed = ['KHR_xmp_json_ld']
own.json.extensions = { KHR_xmp_json_ld: { packets: [{
  '@context': { xmp: 'http://ns.adobe.com/xap/1.0/' }, '@id': '', 'xmp:CreatorTool': 'ISM reference tools',
}] } }
own.json.asset.extensions = { KHR_xmp_json_ld: { packet: 0 } }
const measured = writeModelIsm(writeGlb(own.json, own.buffers[0]), {
  scale: 1000,
  method: 'other',
  methodNote: 'Made file: an ellipsoid drawn to 60 × 20 × 40 mm, exact by construction',
  measuredBy: 'ISM reference tools',
  software: 'ISM reference tools 0.2',
})

const files = {
  '20-model-measured.glb': measured,
  // Fewer vertices on the same ellipsoid: the vertices change, the size does not.
  '21-model-decimated.glb': withPacketOf(measured, glbOf(ellipsoid(8, 16))),
  // Stood on end, Y up to Z up, by the node's rotation, as many programs do on import.
  '22-model-turned.glb': withPacketOf(measured, glbOf(fine, { rotation: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] })),
  // Exported in millimetres: every coordinate a thousand times larger.
  '23-model-in-millimetres.glb': withPacketOf(measured, glbOf(ellipsoid(32, 64, { factor: 1000 }))),
  // Cut in half along its length: the shape changed.
  '24-model-cut.glb': withPacketOf(measured, glbOf(ellipsoid(32, 64, { from: -Math.PI / 2, to: Math.PI / 2 }))),
  // The same model with no ISM at all.
  '25-model-no-ism.glb': plain,
}

for (const [name, bytes] of Object.entries(files)) {
  writeFileSync(`${OUT}/${name}`, bytes)
  const packet = assetPacket(readGltf(bytes).json)
  console.log(name, bytes.length, 'bytes', packet ? 'with packet' : 'no packet')
}
