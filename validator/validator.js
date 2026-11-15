// The validator: what a file says, whether it is correct, and at which level it
// conforms. Every judgement comes from the reference library, so the page and
// the library cannot disagree; where the specification puts a duty on the
// writer that a reader cannot check, the page says so rather than pass it
// silently.

import {
  ISM_NS, ISM_REGION_VERSION, METHODS, findXmp, fingerprintOf, formatMm, gridFor, isModelFields, lengthCheck, mainObjectRegion,
  modelGeometry, modelIsm, modelScaleFor, objectCheck, parseIsm, parseRegions, readGltf, regionBox, regionScales, scaleFor,
  validate, IPTC_ROLES, ISM_ROLES, ISM_TYPES,
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
  const regions = xmp ? parseRegions(xmp) : []
  const problems = fields ? validate(fields, regions) : []
  const size = sizeFromBytes(bytes) ?? await pixelSize(file)
  // The picture's fingerprint as it is now, when the file carries one to compare with (§4.5).
  const print = fields?.fingerprint ? await printOf(file) : null
  const reading = fields && !problems.length && size ? scaleFor(fields, size.width, size.height, regions, print) : null
  const gridOnly = !!fields && fields.scale === undefined && !problems.length

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

  if (!fields) {
    if (regions.some(r => r.ism)) {
      add('fail', 'Regions carry ISM fields, but the image has no ISM grid',
        'A region\u2019s scale is per pixel of the image\u2019s reference grid, which the image must carry (§14.4). Without it nothing in the regions can be used.')
    }
    return render(file, 'No ISM', checks, null, size, regions.length ? { regions, readings: size ? regionScales(null, regions, size.width, size.height) : [], fields: null } : null)
  }

  if (isModelFields(fields)) {
    add('fail', 'The fields describe a model, not an image',
      'referenceExtent and geometryHash belong to a three-dimensional model (§13); an image carries a pixel grid.')
    return render(file, 'Not valid', checks, fields, size)
  }

  const core = ['scale', 'referenceWidth', 'referenceHeight', 'version']
  const missing = core.filter(k => fields[k] === undefined || fields[k] === null)
  if (gridOnly) {
    add('pass', 'The grid is there, and the scale is in the regions',
      'version, referenceWidth and referenceHeight without scale: allowed when a region carries a scale (§14.4). The image as a whole has no scale. A reader of 0.2 calls this core incomplete, and shows no scale either.')
  } else {
    add(missing.length ? 'fail' : 'pass',
      missing.length ? `The core is incomplete: ${missing.join(', ')} missing` : 'All four core fields are there',
      'scale, referenceWidth, referenceHeight, version (§4.1).')
  }

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

    if (reading && reading.regionsOnly) {
      add('pass', 'A reader shows no scale for the image as a whole', reading.reason)
    } else if (reading) {
      add(reading.ok ? 'pass' : 'fail',
        reading.ok ? `A reader shows ${format0(reading.scale)} mm per pixel` : 'A reader must show no scale',
        reading.ok
          ? (reading.resized ? `Rescaled from the reference grid by ×${round(reading.factor, 4)} (§6.3).` : 'Straight from the file (§6.2).')
          : reading.reason)
      if (reading.ok && reading.resized) {
        add(reading.checked ? 'pass' : 'skip',
          reading.checked ? 'The fingerprint matches: a whole copy, resized' : 'Read as a resized copy by assumption',
          reading.checked ? 'The picture as it is now was compared with ism:fingerprint, so it is not a crop to the same shape (§4.5).'
            : fields.fingerprint ? 'The file has a fingerprint, but it could not be checked here, so a crop to the same shape would not be noticed (§6.3).'
              : 'The file has no ism:fingerprint, so a crop to the same shape cannot be told from a resize. If the picture was cropped, the answer above is wrong (§6.3). The duty is the writer’s: rewrite the fields or remove them when pixels move (§5.4).')
      }
    }
  } else {
    add('skip', 'The picture’s size could not be read here', 'The browser could not decode it, so the reading rules are not checked.')
  }

  let regionReport = null
  if (regions.length) regionReport = checkRegions(fields, regions, size, add)

  const level = levelOf(fields, problems, regionReport)
  render(file, reading && !reading.ok && !reading.regionsOnly ? `${level} — but the scale no longer applies` : level, checks, fields, size, regionReport)
}

// ── Regions (§14) ────────────────────────────────────────────────────────────

/** The checks for the image's IPTC Image Regions, added to the list; what the region table needs. */
function checkRegions(fields, regions, size, add) {
  const withIsm = regions.filter(r => r.ism)
  add('pass', `The image has ${regions.length} IPTC Image Region${regions.length > 1 ? 's' : ''}`,
    withIsm.length ? `${withIsm.length} of them carr${withIsm.length > 1 ? 'y' : 'ies'} ISM fields of their own (§14.2).` : 'None carries ISM fields; they are read as IPTC has them.')
  if (withIsm.length) {
    const v = String(fields.version ?? '')
    const ok = v && !(Number(v.split('.')[0]) === 0 && Number(v.split('.')[1] ?? 0) < 3)
    add(ok ? 'pass' : 'fail', ok ? `ism:version is ${v}` : `ism:version is ${v || 'missing'}, not ${ISM_REGION_VERSION}`,
      ok ? 'A file whose regions carry ISM says 0.3 or later (§14.9).' : 'A file whose regions carry ISM fields must say 0.3 or later (§14.9). The regions are read all the same.')
  }
  const ids = regions.map(r => r.id).filter(Boolean)
  const doubled = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (doubled.length) add('fail', `Two regions share the identifier “${doubled[0]}”`, 'rId must be unique among an image\u2019s regions (IPTC §12.6.2, §14.9).')

  const readings = size ? regionScales(fields, regions, size.width, size.height) : []
  const warnings = regions.flatMap(r => readings.find(x => x.region === r)?.check.warnings ?? [])
  if (warnings.length) add('fail', `A reader ignores ${warnings.length === 1 ? 'something' : `${warnings.length} things`} in the regions`, [...new Set(warnings)].join(' '))
  const broken = readings.filter(r => r.check.boundary.length || r.check.ism.length)
  if (broken.length) add('fail', `${broken.length} region${broken.length > 1 ? 's' : ''} cannot be read`, broken.map(r => `${label(r.region)}: ${r.reason}`).join(' '))
  const unplaced = readings.filter(r => !r.placed && !r.check.boundary.length)
  if (unplaced.length) add('skip', `${unplaced.length} region${unplaced.length > 1 ? 's' : ''} cannot be placed on this copy`, [...new Set(unplaced.map(r => r.reason))].join(' '))

  const main = mainObjectRegion(regions)
  if (main && fields.objectBox && gridFor(fields, fields.referenceWidth, fields.referenceHeight).ok && !main.check?.boundary?.length) {
    const box = regionBox(fields, main)
    const agrees = box.every((n, i) => Math.abs(n - fields.objectBox[i]) <= 1)
    add(agrees ? 'pass' : 'fail', agrees ? `ism:objectBox is the outer bounds of “${label(main)}”` : `ism:objectBox is not the outer bounds of “${label(main)}”`,
      `The region marked main subject area gives ${box.join(', ')}; the image’s box is ${fields.objectBox.join(', ')} (§14.9).`)
  }

  const rows = regions.map(region => {
    const r = readings.find(x => x.region === region)
    return { region, reading: r, length: lengthCheck(fields, regions, region), object: objectCheck(fields, regions, region) }
  })
  for (const { region, length } of rows) {
    if (!length) continue
    if (!length.ok) { add('fail', `The length along “${label(region)}” cannot be checked`, length.reason); continue }
    const diff = `${(length.difference * 100).toFixed(2)} %`
    add(length.agrees === false ? 'fail' : 'pass',
      `${formatMm(length.lengthMm)} along “${label(region)}” gives ${round(length.impliedScale, 6)} mm per pixel`,
      length.within === 'pixel'
        ? `${length.px.toFixed(1)} px on the reference grid, ${round(length.mm, 4)} mm through the ${length.source === 'region' ? 'region\u2019s' : 'image\u2019s'} homography: a difference of ${diff}, ${length.agrees ? 'within' : 'more than'} a pixel of the line (§14.3, §14.7).`
        : `${length.px.toFixed(1)} px on the reference grid. The ${length.source === 'region' ? 'region\u2019s' : 'image\u2019s'} scale there is ${round(length.scale, 6)}: a difference of ${diff}${length.agrees === undefined ? ', with no uncertainty to judge it by' : length.agrees ? ', within twice the uncertainty' : ', more than twice the uncertainty'} (§6.7, §14.3).`)
  }
  for (const { region, object } of rows) {
    if (!object?.ok) continue
    const show = (got, want) => want === undefined ? null : `${round(got, 2)} mm against ${round(want, 2)} mm`
    const parts = [show(object.widthMm, object.objectWidthMm), show(object.heightMm, object.objectHeightMm)].filter(Boolean)
    const tolerance = 2 * object.scale // two pixels
    const agree = [[object.widthMm, object.objectWidthMm], [object.heightMm, object.objectHeightMm]].every(([g, w]) => w === undefined || Math.abs(g - w) <= tolerance)
    const how = object.homography ? 'Its outline carried onto the plane by the homography' : 'Its outer bounds by the scale that holds there'
    const thick = object.homography && region.ism.objectThicknessMm ? ` Its upper side lies ${round(region.ism.objectThicknessMm, 2)} mm above the plane, so an outline traced on top comes out a little large (§14.7).` : ''
    add(agree ? 'pass' : 'skip', agree ? `“${label(region)}” is the size it says` : `“${label(region)}” is not quite the size it says`,
      `${how}: ${parts.join(', ')}${agree ? ', within two pixels' : '. A polygon drawn inside the outline, or a size taken along other axes, gives this'} (§14.2).${thick}`)
  }
  // ISM-D asks that the regions be written as §14.9 says: right version, relative units, nothing ignored.
  const versionOk = !withIsm.length || (String(fields.version ?? '').split('.').map(Number)[1] ?? 0) >= 3 || Number(String(fields.version).split('.')[0]) > 0
  const conforms = withIsm.length > 0 && versionOk && !doubled.length && !warnings.length && !broken.length
  return { regions, readings, rows, fields, conforms }
}

const label = r => r.name ?? r.id ?? `region ${r.index + 1}`

function regionTable(report) {
  const roleName = { [ISM_ROLES.scaleReference]: 'scale reference', [ISM_ROLES.measuredObject]: 'measured object', [ISM_TYPES.ruler]: 'ruler', [ISM_TYPES.target]: 'target', [IPTC_ROLES.mainSubjectArea]: 'main subject area', [IPTC_ROLES.subjectArea]: 'subject area' }
  const terms = list => list.flatMap(e => e.ids.map(id => roleName[id] ?? e.name ?? id))
  const shapeOf = r => r.shape === 'polygon' ? (r.vertices?.length === 1 ? 'point' : r.vertices?.length === 2 ? 'line' : `polygon, ${r.vertices?.length ?? 0} vertices`) : r.shape ?? '?'
  const rows = (report.rows ?? report.regions.map(region => ({ region, reading: report.readings.find(x => x.region === region) }))).map(({ region, reading }) => {
    const what = [...terms(region.roles), ...terms(region.types)]
    const f = region.ism ?? {}
    const plane = reading?.homography ? ', through a homography: the scale at its centre' : ''
    const scale = reading?.own ? `${round(reading.scale, 6)} mm/px, its own${plane}` : reading?.scale ? `${round(reading.scale, 6)} mm/px, ${reading.scaleSource === 'region' ? 'another region\u2019s' : 'the image\u2019s'}${plane}` : '—'
    const facts = [
      f.plane && `plane: ${f.plane}`,
      f.objectWidthMm !== undefined && `object ${[f.objectWidthMm, f.objectHeightMm].filter(n => n !== undefined).map(n => round(n, 2)).join(' × ')} mm${f.objectThicknessMm !== undefined ? `, ${round(f.objectThicknessMm, 2)} mm thick` : ''}`,
      f.lengthMm !== undefined && `length ${round(f.lengthMm, 3)} mm`,
      f.method && `method: ${f.method}`,
      f.uncertainty !== undefined && `± ${round(2 * f.uncertainty * 100, 2)} % (95 %)`,
    ].filter(Boolean)
    return `<tr><td>${escape(label(region))}${region.id && region.name ? `<span>${escape(region.id)}</span>` : ''}</td>
      <td>${escape(shapeOf(region))}<span>${escape(region.unit ?? '')}</span></td>
      <td>${escape(scale)}${reading && !reading.placed ? `<span>${escape(reading.reason ?? '')}</span>` : ''}</td>
      <td>${escape(facts.join('; ') || '—')}${what.length ? `<span>${escape(what.join(', '))}</span>` : ''}</td></tr>`
  }).join('')
  return `<div class="fields regions"><h2>The regions</h2><table><thead><tr><th>Region</th><th>Shape</th><th>Scale inside it</th><th>What it says</th></tr></thead><tbody>${rows}</tbody></table></div>`
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
function levelOf(f, problems, regionReport = null) {
  if (problems.length) return 'Not valid'
  const model = isModelFields(f)
  // ISM-D: regions with ISM fields that a reader can use, on an image with the grid (§9, §14).
  const d = !model && !!regionReport?.conforms
  const core = model
    ? f.scale != null && f.referenceExtent != null && f.geometryHash != null && f.version != null
    : f.scale != null && f.referenceWidth != null && f.referenceHeight != null && f.version != null
  if (!core) return d && f.referenceWidth != null && f.referenceHeight != null && f.version != null ? 'ISM-D' : 'Not valid'
  const level = imageLevel(f, model)
  return d ? `${level} + D` : level
}

function imageLevel(f, model) {
  const b = f.method != null && f.uncertainty != null && f.measuredAt != null && f.software != null
  const c = b && (model || f.objectBox != null) && (f.objectWidthMm != null || f.objectHeightMm != null)
  return c ? 'ISM-C' : b ? 'ISM-B' : 'ISM-A'
}

function render(file, level, checks, fields, size, regionReport = null) {
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
    ${regionReport ? regionTable(regionReport) : ''}
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

/** The fingerprint of the picture as the browser draws it, from a copy no larger than 1024 pixels (§4.5); null when it cannot be drawn. */
function printOf(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const k = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.naturalWidth * k))
        canvas.height = Math.max(1, Math.round(img.naturalHeight * k))
        const context = canvas.getContext('2d', { willReadFrequently: true })
        context.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(fingerprintOf(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, 4))
      } catch { resolve(null) }
      URL.revokeObjectURL(url)
    }
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url) }
    img.src = url
  })
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
