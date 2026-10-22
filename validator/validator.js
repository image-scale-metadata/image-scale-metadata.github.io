// The validator: what a file says, whether it is correct, and at which level it
// conforms. Every judgement comes from the reference library, so the page and
// the library cannot disagree; where the specification puts a duty on the
// writer that a reader cannot check, the page says so rather than pass it
// silently.

import {
  ISM_NS, METHODS, findXmp, isModelFields, modelGeometry, modelIsm, modelScaleFor, parseIsm, readGltf, scaleFor, validate,
} from '../js/ism.js'

const drop = document.getElementById('drop')
const report = document.getElementById('report')
const fileInput = document.getElementById('file')

fileInput.addEventListener('change', () => fileInput.files[0] && check(fileInput.files[0]))
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over') })
drop.addEventListener('dragleave', () => drop.classList.remove('over'))
drop.addEventListener('drop', e => {
  e.preventDefault()
  drop.classList.remove('over')
  const file = e.dataTransfer.files[0]
  if (file) check(file)
})

async function check(file) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (isGltf(bytes)) return checkModel(file, bytes)
  const format = formatOf(bytes)
  const xmp = findXmp(bytes)
  const fields = xmp ? parseIsm(xmp) : null
  const problems = fields ? validate(fields) : []
  const size = sizeFromBytes(bytes) ?? await pixelSize(file)
  const reading = fields && !problems.length && size ? scaleFor(fields, size.width, size.height) : null

  const checks = []
  const add = (state, title, detail) => checks.push({ state, title, detail })

  add(format ? 'pass' : 'skip',
    format ? `The file is a ${format.name}` : 'The format is not one this page knows',
    format ? `The XMP packet belongs in ${format.where}.` : 'The packet is looked for anywhere in the bytes.')

  add(xmp ? 'pass' : 'fail', xmp ? 'It carries an XMP packet' : 'No XMP packet',
    xmp ? `${xmp.length} characters.` : 'Without XMP there is nowhere for ISM to be.')

  if (!xmp) return render(file, 'No ISM', checks, null, size)

  add(fields ? 'pass' : 'fail', fields ? 'The packet binds the ISM namespace' : 'The packet has no ISM',
    fields ? ISM_NS : 'The fields are absent, or bound to another namespace.')

  if (!fields) return render(file, 'No ISM', checks, null, size)

  if (isModelFields(fields)) {
    add('fail', 'The fields describe a model, not an image',
      'referenceExtent and geometryHash belong to a three-dimensional model (§13); an image carries a pixel grid.')
    return render(file, 'Not valid', checks, fields, size)
  }

  const core = ['scale', 'referenceWidth', 'referenceHeight', 'version']
  const missing = core.filter(k => fields[k] === undefined || fields[k] === null)
  add(missing.length ? 'fail' : 'pass',
    missing.length ? `The core is incomplete: ${missing.join(', ')} missing` : 'All four core fields are there',
    'scale, referenceWidth, referenceHeight, version (§4.1).')

  add(problems.length ? 'fail' : 'pass',
    problems.length ? 'A field is not valid' : 'Every field present is valid',
    problems.length ? problems.join(' ') : 'Types and ranges as the specification gives them.')

  if (fields.method !== undefined) {
    const known = METHODS.includes(fields.method)
    add(known ? 'pass' : 'fail', known ? `The method is “${fields.method}”` : `“${fields.method}” is not a method`,
      `One of: ${METHODS.join(', ')} (§4.2).`)
  }

  if (size) {
    const sameGrid = size.width === fields.referenceWidth && size.height === fields.referenceHeight
    const turned = size.width === fields.referenceHeight && size.height === fields.referenceWidth
    add(sameGrid || turned ? 'pass' : 'skip',
      sameGrid ? 'The file is on the grid it was measured on'
        : turned ? 'The file is turned a quarter turn from the grid it was measured on'
        : `The file is ${size.width} × ${size.height} px; the scale was set on ${fields.referenceWidth} × ${fields.referenceHeight} px`,
      sameGrid || turned ? 'The scale applies as written.' : 'A reader rescales, or refuses (§6).')

    if (reading) {
      add(reading.ok ? 'pass' : 'fail',
        reading.ok ? `A reader shows ${format0(reading.scale)} mm per pixel` : 'A reader must show no scale',
        reading.ok
          ? (reading.resized ? `Rescaled from the reference grid by ×${round(reading.factor, 4)} (§6.3).` : 'Straight from the file (§6.2).')
          : reading.reason)
      if (reading.ok && reading.resized) {
        add('skip', 'A crop to the same shape cannot be told from this',
          'If the picture was cropped rather than resized, the answer above is wrong. The duty is the writer’s: rewrite the fields or remove them when pixels move (§5.4).')
      }
    }
  } else {
    add('skip', 'The picture’s size could not be read here', 'The browser could not decode it, so the reading rules are not checked.')
  }

  const level = levelOf(fields, problems)
  render(file, reading && !reading.ok ? `${level} — but the scale no longer applies` : level, checks, fields, size)
}

// ── Models (§13) ─────────────────────────────────────────────────────────────

function isGltf(u8) {
  if (u8.length >= 4 && u8[0] === 0x67 && u8[1] === 0x6c && u8[2] === 0x54 && u8[3] === 0x46) return true
  const head = new TextDecoder().decode(u8.subarray(0, 256)).trimStart()
  return head.startsWith('{') && /"asset"\s*:/.test(new TextDecoder().decode(u8.subarray(0, 4096)))
}

function checkModel(file, bytes) {
  const checks = []
  const add = (state, title, detail) => checks.push({ state, title, detail })
  let gltf, geometry
  try {
    gltf = readGltf(bytes)
  } catch (e) {
    add('fail', 'The model could not be read', e.message)
    return render(file, 'Not read', checks, null, null)
  }
  add('pass', `The file is a glTF 2.0 model${gltf.glb ? ' (GLB)' : ''}`,
    'The XMP packet belongs in KHR_xmp_json_ld, in the packet the asset points at (§13.2).')

  try {
    geometry = modelGeometry(gltf)
    add('pass', `Its geometry was read: ${geometry.vertexCount.toLocaleString()} vertices`,
      `Extent ${showExtent(geometry.extent)} units. Hash ${geometry.hash.slice(0, 16)}… (§13.3).`)
  } catch (e) {
    add('fail', 'Its geometry could not be read', e.message)
  }

  const fields = modelIsm(gltf)
  const hasPacket = (gltf.json.extensionsUsed ?? []).includes('KHR_xmp_json_ld') && gltf.json.asset?.extensions?.KHR_xmp_json_ld
  add(hasPacket ? 'pass' : 'fail', hasPacket ? 'The asset points at an XMP packet' : 'The asset points at no XMP packet',
    hasPacket ? 'KHR_xmp_json_ld is declared in extensionsUsed.' : 'Without one there is nowhere for ISM to be.')
  if (!fields) {
    add('skip', 'No ISM: the model\u2019s scale is not measured',
      geometry ? `glTF\u2019s own unit is the metre, so the file says ${showMm(geometry.extent.map(e => e * 1000))} — but nothing says that was measured (§13.4.5).` : 'Nothing to read.')
    return render(file, 'No ISM', checks, null, null)
  }
  add('pass', 'The packet binds the ISM namespace', ISM_NS)

  const problems = validate(fields)
  const missing = ['version', 'scale', 'referenceExtent', 'geometryHash'].filter(k => fields[k] === undefined)
  add(missing.length ? 'fail' : 'pass',
    missing.length ? `The core is incomplete: ${missing.join(', ')} missing` : 'All four core fields are there',
    'version, scale, referenceExtent, geometryHash (§13.1).')
  add(problems.length ? 'fail' : 'pass', problems.length ? 'A field is not valid' : 'Every field present is valid',
    problems.length ? problems.join(' ') : 'Types and ranges as the specification gives them.')
  if (fields.method !== undefined) {
    const known = METHODS.includes(fields.method)
    add(known ? 'pass' : 'fail', known ? `The method is \u201c${fields.method}\u201d` : `\u201c${fields.method}\u201d is not a method`,
      `One of: ${METHODS.join(', ')} (§4.2).`)
  }

  let reading = null
  if (geometry && !problems.length) {
    reading = modelScaleFor(fields, geometry)
    if (reading.ok) {
      add(reading.geometry === 'measured' ? 'pass' : 'skip',
        reading.geometry === 'measured' ? 'The vertices are the ones measured' : 'The vertices have changed since the scale was set',
        reading.geometry === 'measured' ? 'The hash agrees (§13.4.6).' : 'The hash differs, but the size does not: the model was simplified or written again (§13.4.6).')
      add('pass', `A reader shows ${round(reading.scale, 6)} mm per unit: ${showMm(reading.sizeMm)}`,
        reading.rescaled ? `Every extent changed by ×${round(reading.factor, 4)}, as when the unit is changed; the scale is divided by it (§13.4.3).`
          : reading.turned ? 'Turned by quarter turns since it was measured; the scale holds (§13.4.1).' : 'Straight from the file (§13.4.2).')
    } else {
      add('fail', 'A reader must show no scale', reading.reason)
    }
  }
  const level = levelOf(fields, problems)
  render(file, reading && !reading.ok ? `${level} — but the scale no longer applies` : level, checks, fields, null)
}

const showExtent = e => e.map(n => Number(n.toPrecision(5))).join(' × ')
const showMm = e => e.map(n => round(n, 2)).join(' × ') + ' mm'

/** The conformance level the fields reach (§9). */
function levelOf(f, problems) {
  if (problems.length) return 'Not valid'
  const model = isModelFields(f)
  const core = model
    ? f.scale != null && f.referenceExtent != null && f.geometryHash != null && f.version != null
    : f.scale != null && f.referenceWidth != null && f.referenceHeight != null && f.version != null
  if (!core) return 'Not valid'
  const b = f.method != null && f.uncertainty != null && f.measuredAt != null && f.software != null
  const c = b && (model || f.objectBox != null) && (f.objectWidthMm != null || f.objectHeightMm != null)
  return c ? 'ISM-C' : b ? 'ISM-B' : 'ISM-A'
}

function render(file, level, checks, fields, size) {
  const reached = level.startsWith('ISM') && !level.includes('no longer')
  report.innerHTML = `
    <div class="verdict">
      <div class="verdict__head">
        <span class="verdict__level">${level}</span>
        <span class="verdict__file">${escape(file.name)} · ${Math.round(file.size / 1024).toLocaleString()} kB${size ? ` · ${size.width} × ${size.height} px` : ''}</span>
      </div>
      <ul class="checks">
        ${checks.map(c => `
          <li class="${c.state}">
            <span class="mark">${c.state === 'pass' ? '●' : c.state === 'fail' ? '✕' : '○'}</span>
            <span><b>${escape(c.title)}</b><span>${escape(c.detail)}</span></span>
          </li>`).join('')}
      </ul>
    </div>
    ${fields ? fieldList(fields) : ''}
    ${reached ? `<p class="hint">Level ${level.slice(4)} is what this file reaches. A file conforms at the level whose fields it carries, all of them valid; the levels are in §9 of the specification.</p>` : ''}
  `
}

function fieldList(fields) {
  const rows = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `<dt>ism:${escape(k)}</dt><dd>${escape(Array.isArray(v) ? v.join(', ') : String(v))}</dd>`)
    .join('')
  return `<div class="fields"><h2>What the file says</h2><dl>${rows}</dl></div>`
}

function formatOf(u8) {
  if (u8[0] === 0xff && u8[1] === 0xd8) return { name: 'JPEG', where: 'an APP1 segment' }
  if (u8[0] === 137 && u8[1] === 80) return { name: 'PNG', where: 'an iTXt chunk, keyword XML:com.adobe.xmp' }
  if ((u8[0] === 0x49 && u8[1] === 0x49) || (u8[0] === 0x4d && u8[1] === 0x4d)) return { name: 'TIFF', where: 'tag 700 on the first directory' }
  const ascii = (o, s) => [...s].every((c, i) => u8[o + i] === c.charCodeAt(0))
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return { name: 'WebP', where: 'the XMP chunk' }
  if (ascii(4, 'ftyp')) return { name: 'HEIF or AVIF', where: 'a metadata item' }
  return null
}

/** The stored size, read from the file's own header, so a TIFF is checked too. */
function sizeFromBytes(u8) {
  if (u8[0] === 137 && u8[1] === 80) {
    const dv = new DataView(u8.buffer, u8.byteOffset + 16, 8)
    return { width: dv.getUint32(0), height: dv.getUint32(4) }
  }
  if ((u8[0] === 0x49 && u8[1] === 0x49) || (u8[0] === 0x4d && u8[1] === 0x4d)) {
    const little = u8[0] === 0x49
    const dv = new DataView(u8.buffer, u8.byteOffset)
    if (dv.getUint16(2, little) !== 42) return null
    const ifd = dv.getUint32(4, little)
    const count = dv.getUint16(ifd, little)
    let width, height
    for (let i = 0; i < count; i++) {
      const at = ifd + 2 + i * 12
      const tag = dv.getUint16(at, little)
      const type = dv.getUint16(at + 2, little)
      const value = type === 3 ? dv.getUint16(at + 8, little) : dv.getUint32(at + 8, little)
      if (tag === 256) width = value
      if (tag === 257) height = value
    }
    return width && height ? { width, height } : null
  }
  if (u8[0] === 0xff && u8[1] === 0xd8) {
    let i = 2
    while (i + 4 <= u8.length && u8[i] === 0xff) {
      const marker = u8[i + 1]
      const len = (u8[i + 2] << 8) | u8[i + 3]
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: (u8[i + 7] << 8) | u8[i + 8], height: (u8[i + 5] << 8) | u8[i + 6] }
      }
      if (marker === 0xda) break
      i += 2 + len
    }
  }
  return null
}

function pixelSize(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url) }
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url) }
    img.src = url
  })
}

const round = (n, places) => Number(n.toFixed(places))
const format0 = n => n < 0.01 ? n.toPrecision(4) : round(n, 5)
const escape = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))
