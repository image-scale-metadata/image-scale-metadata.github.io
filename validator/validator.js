// The validator: what a file says, whether it is correct, and at which level it
// conforms. Every judgement comes from the reference library, so the page and
// the library cannot disagree; where the specification puts a duty on the
// writer that a reader cannot check, the page says so rather than pass it
// silently.

import { METHODS, findXmp, parseIsm, scaleFor, validate } from '../js/ism.js'

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
    fields ? 'https://w3id.org/ism/0.1/' : 'The fields are absent, or bound to another namespace.')

  if (!fields) return render(file, 'No ISM', checks, null, size)

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

/** The conformance level the fields reach (§9). */
function levelOf(f, problems) {
  if (problems.length) return 'Not valid'
  const core = f.scale != null && f.referenceWidth != null && f.referenceHeight != null && f.version != null
  if (!core) return 'Not valid'
  const b = f.method != null && f.uncertainty != null && f.measuredAt != null && f.software != null
  const c = b && f.objectBox != null && (f.objectWidthMm != null || f.objectHeightMm != null)
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
