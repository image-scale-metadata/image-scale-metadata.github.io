// ISM viewer: reads the scale from the file itself and draws it on the image,
// and — for a JPEG — writes it: drag along a ruler in the picture, give its
// length, and download the picture with the scale in its metadata. Draws the
// image's IPTC regions too, and measures by the scale that holds where the
// line is drawn (§14).
// Everything happens in the browser; no file leaves the machine.
import {
  IPTC_ROLES, ISM_ROLES, METHODS, embedXmp, findXmp, formatMm, gridFor, hasRole, jpegHasXmpSegment, jpegOrientation, lengthCheck,
  measure, mergeIsmIntoXmp, niceLength, readIsm, readRegions, regionScales, scaleFor,
} from '../js/ism.js'

const stage = document.getElementById('stage')
const empty = document.getElementById('empty')
const input = document.getElementById('file')
const statusEl = document.getElementById('status')
const details = document.getElementById('details')
const writer = document.getElementById('writer')
const SVG = 'http://www.w3.org/2000/svg'
const SOFTWARE = 'ISM viewer 0.1'

let objectUrl = null
/** The open file: { file, bytes, img, fields, result, isJpeg }. */
let current = null
/** 'view' or 'calibrate'. */
let mode = 'view'
/** The line drawn along the ruler: { px, screenPx } in image pixels. */
let reference = null
let overlayApi = null

input.addEventListener('change', () => { if (input.files[0]) open(input.files[0]) })
stage.addEventListener('dragover', e => { e.preventDefault(); stage.classList.add('drag') })
stage.addEventListener('dragleave', () => stage.classList.remove('drag'))
stage.addEventListener('drop', e => {
  e.preventDefault()
  stage.classList.remove('drag')
  const file = e.dataTransfer.files[0]
  if (file) open(file)
})

async function open(file) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const fields = readIsm(bytes)
  const regions = readRegions(bytes)
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = URL.createObjectURL(file)
  const img = new Image()
  img.alt = file.name
  img.src = objectUrl
  mode = 'view'
  reference = null
  try {
    await img.decode()
  } catch {
    current = { file, bytes, img: null, fields, regions, readings: [], isJpeg,
      result: { ok: false, reason: 'This browser cannot display the file. The fields are listed anyway.' } }
    show()
    return
  }
  // naturalWidth/Height come after EXIF orientation, which is what §6.5 expects.
  // Regions and the object box are on the stored grid, before orientation (§14.6).
  const orientation = isJpeg ? jpegOrientation(bytes) : 1
  const stored = orientation >= 5 ? { w: img.naturalHeight, h: img.naturalWidth } : { w: img.naturalWidth, h: img.naturalHeight }
  current = {
    file, bytes, img, fields, regions, isJpeg, orientation, stored,
    result: scaleFor(fields, img.naturalWidth, img.naturalHeight, regions),
    readings: regionScales(fields, regions, stored.w, stored.h),
  }
  show()
}

function show() {
  const { file, img, fields, result } = current
  stage.replaceChildren()
  if (img) {
    const frame = document.createElement('div')
    frame.className = 'frame'
    frame.append(img)
    const o = overlay(img.naturalWidth, img.naturalHeight, fields, result)
    overlayApi = o.api
    frame.append(o.svg)
    stage.append(frame)
  } else {
    stage.append(empty)
  }

  showStatus()

  details.replaceChildren()
  const img_ = img ? `${img.naturalWidth} × ${img.naturalHeight} px` : '—'
  section('File', [['Name', file.name], ['Pixels', img_], ['Size', `${(file.size / 1024).toFixed(0)} KB`]])
  if (fields) {
    section('Measured on', [
      ['Scale', fields.scale !== undefined ? `${fields.scale} mm/px` : undefined],
      ['Pixels', fields.referenceWidth ? `${fields.referenceWidth} × ${fields.referenceHeight} px` : undefined],
      ['Version', fields.version],
    ])
    section('How it was measured', [
      ['Method', fields.method && (METHODS.includes(fields.method) ? fields.method : `${fields.method} (unknown)`)],
      ['Note', fields.methodNote],
      // The field is a standard uncertainty; the margin shown is twice it, about 95 % (§6.7).
      ['Uncertainty', fields.uncertainty !== undefined
        ? `± ${pct(2 * fields.uncertainty)} of the scale, at about 95% (standard uncertainty ${pct(fields.uncertainty)})`
        : undefined],
      ['By', fields.measuredBy],
      ['When', fields.measuredAt],
      ['Software', fields.software],
    ])
    section('The object', [
      ['Plane', fields.plane],
      ['Width', mm(fields.objectWidthMm)],
      ['Height', mm(fields.objectHeightMm)],
      ['Thickness', mm(fields.objectThicknessMm)],
      ['Box', fields.objectBox ? fields.objectBox.join(', ') + ' px' : undefined],
    ])
  }
  regionSection()
  showWriter()
}

function showStatus() {
  const { result } = current
  if (mode === 'calibrate') {
    statusEl.className = 'status'
    statusEl.innerHTML = reference
      ? `<strong>Line drawn: ${reference.px.toFixed(1)} px.</strong><br>Give its length below, or drag again.`
      : '<strong>Drag along a known length</strong> — between two marks on a ruler, or along a scale bar. The longer the line, the more exact the scale.'
    return
  }
  const own = current.readings.filter(r => r.own)
  if (result.regionsOnly) {
    statusEl.className = 'status ok'
    statusEl.innerHTML = `<strong>No scale for the picture as a whole.</strong><br>${own.length === 1 ? '1 region has a scale of its own; it holds only inside it' : `${own.length} regions have scales of their own; each holds only inside its region`}.<br><span class="hint">Drag inside a region to measure.</span>`
    return
  }
  statusEl.className = 'status ' + (result.ok ? 'ok' : 'bad')
  if (result.ok) {
    const how = result.resized
      ? `Resized copy (${pct(result.factor)} of the measured image); the scale is adjusted to match.`
      : 'Same pixels as when it was measured.'
    const parts = !own.length ? '' : own.length === 1
      ? '<br>1 region has a scale of its own, for another plane; inside it, that one holds.'
      : `<br>${own.length} regions have scales of their own, for other planes; inside each, its own holds.`
    const lost = current.readings.some(r => !r.placed && r.region.ism?.scale) ? '<br>Parts of the picture have scales of their own that cannot be placed in this copy.' : ''
    statusEl.innerHTML = `<strong>${esc(formatMm(result.scale))} per pixel</strong><br>${esc(how)}${result.turned ? ' Turned by 90°; the scale is the same.' : ''}${parts}${lost}<br><span class="hint">Drag across the image to measure.</span>`
  } else {
    statusEl.textContent = result.reason
  }
}

// ── Writing the scale ─────────────────────────────────────────────────────────

function showWriter() {
  writer.replaceChildren()
  if (!current?.img) return
  const h = document.createElement('h2')
  h.textContent = 'Set the scale'
  writer.append(h)

  if (!current.isJpeg) {
    writer.append(para('Writing the scale works on JPEG files in this version.', 'hint'))
    return
  }
  if (mode === 'view') {
    writer.append(para(current.fields
      ? 'The file already has a scale. Measuring a ruler again replaces it; everything else in the file is kept.'
      : 'Has the picture a ruler or a scale bar in it? Measure it once and the file carries its scale from then on.', 'hint'))
    writer.append(button('Measure a ruler in the picture', () => { mode = 'calibrate'; reference = null; showStatus(); showWriter() }))
    return
  }

  // Calibrating.
  if (!reference) {
    writer.append(para('Drag along the ruler in the picture.', 'hint'))
    writer.append(button('Cancel', cancel, true))
    return
  }
  const form = document.createElement('form')
  form.className = 'writer-form'
  const length = field(form, 'Length of the line (mm)', 'number', { min: '0', step: 'any', required: true, placeholder: 'e.g. 50' })
  const method = document.createElement('select')
  for (const m of ['ruler', 'target', 'calipers', 'other']) method.append(new Option(m, m))
  field(form, 'Measured with', method)
  const by = field(form, 'Measured by (optional)', 'text', { placeholder: 'Name or organisation' })
  const out = para('', 'hint')
  form.append(out)
  const update = () => {
    const v = Number(length.value)
    if (!(v > 0)) { out.textContent = ''; return }
    const s = v / reference.px
    out.textContent = `= ${formatMm(s)} per pixel, ± ${pct(2 * uncertainty())} at about 95%, from where the line was drawn.`
  }
  length.addEventListener('input', update)
  const actions = document.createElement('div')
  actions.className = 'actions'
  actions.append(button('Write the scale and download', null), button('Cancel', cancel, true))
  form.append(actions)
  form.addEventListener('submit', e => {
    e.preventDefault()
    write(Number(length.value), method.value, by.value.trim())
  })
  writer.append(form)
  length.focus()
}

/**
 * Relative standard uncertainty of the scale from drawing the line: each end is
 * placed to about one screen pixel, which on a picture shown smaller than its
 * size is several picture pixels. Written as it is (ism:uncertainty), shown doubled.
 */
function uncertainty() {
  return Math.round((Math.SQRT2 * reference.screenPx / reference.px) * 10000) / 10000
}

/** The formats this viewer writes into: JPEG, PNG and TIFF (§4.0). */
function writableKind(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { ext: 'jpg', type: 'image/jpeg' }
  if (bytes[0] === 137 && bytes[1] === 80) return { ext: 'png', type: 'image/png' }
  if ((bytes[0] === 0x49 && bytes[1] === 0x49) || (bytes[0] === 0x4d && bytes[1] === 0x4d)) return { ext: 'tif', type: 'image/tiff' }
  return null
}

function write(lengthMm, method, measuredBy) {
  const { bytes, img, file } = current
  try {
    if (!(lengthMm > 0)) throw new Error('Give the length of the line in millimetres.')
    const kind = writableKind(bytes)
    if (!kind) {
      throw new Error('The scale can be written into a JPEG, a PNG or a TIFF here. Other formats are read only.')
    }
    const existing = findXmp(bytes)
    if (!existing && kind.ext === 'jpg' && jpegHasXmpSegment(bytes)) {
      throw new Error('The file has metadata this viewer cannot read safely, so nothing was written.')
    }
    // The reference grid is the stored one (§3): a JPEG shown turned by its
    // EXIF orientation stores its pixels the other way round.
    const turned = jpegOrientation(bytes) >= 5
    const scale = lengthMm / reference.px
    const fields = {
      scale: Number(scale.toPrecision(7)),
      referenceWidth: turned ? img.naturalHeight : img.naturalWidth,
      referenceHeight: turned ? img.naturalWidth : img.naturalHeight,
      method,
      methodNote: `${method === 'ruler' ? 'A ruler in the picture' : method === 'target' ? 'A target in the picture' : 'A known length'}: ${lengthMm} mm over ${reference.px.toFixed(1)} px, drawn in the ISM viewer`,
      uncertainty: uncertainty(),
      ...(measuredBy ? { measuredBy } : {}),
      measuredAt: new Date().toISOString().slice(0, 10),
      software: SOFTWARE,
    }
    const out = embedXmp(bytes, mergeIsmIntoXmp(existing, fields))
    const name = file.name.replace(/(\.[^.]+)?$/, `-ism.${kind.ext}`)
    const blob = new Blob([out], { type: kind.type })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    // Show the file as written, read back from its own bytes.
    open(new File([out], name, { type: kind.type }))
  } catch (err) {
    statusEl.className = 'status bad'
    statusEl.textContent = err.message
  }
}

function cancel() {
  mode = 'view'
  reference = null
  overlayApi?.clearLine()
  showStatus()
  showWriter()
}

// ── Regions (§14) ─────────────────────────────────────────────────────────────

/**
 * Where a point of the stored grid is shown, and back: the EXIF orientation
 * turns or mirrors the picture on screen, and the regions with it (§6.5, §14.6).
 */
function toShown(x, y) {
  const { orientation: o = 1, stored: { w: W, h: H } } = current
  return [[x, y], [W - x, y], [W - x, H - y], [x, H - y], [y, x], [H - y, x], [H - y, W - x], [y, W - x]][o - 1] ?? [x, y]
}
function toStored(x, y) {
  const { orientation: o = 1, stored: { w: W, h: H } } = current
  return [[x, y], [W - x, y], [W - x, H - y], [x, H - y], [y, x], [y, H - x], [W - y, H - x], [W - y, x]][o - 1] ?? [x, y]
}

const REGION_COLOURS = { scale: '#b3261e', object: '#0b57d0', reference: '#146c2e', other: '#5f6368' }
const kindOf = r => r.own ? 'scale' : hasRole(r.region, ISM_ROLES.scaleReference) ? 'reference' : r.region.ism?.objectWidthMm !== undefined || hasRole(r.region, ISM_ROLES.measuredObject) ? 'object' : 'other'
const nameOf = r => r.name ?? r.id ?? `Region ${r.index + 1}`

function drawRegions(svg, unit) {
  for (const r of current.readings) {
    if (!r.placed) continue
    const colour = REGION_COLOURS[kindOf(r)]
    const s = r.shape
    const pts = s.shape === 'rectangle' ? [[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.h], [s.x, s.y + s.h]]
      : s.shape === 'polygon' ? s.points : null
    const style = { fill: r.own ? 'rgba(179,38,30,.08)' : 'none', stroke: colour, 'stroke-width': 1.5 * unit }
    let anchor
    if (s.shape === 'circle') {
      const [cx, cy] = toShown(s.x, s.y)
      svg.append(el('circle', { cx, cy, r: s.r, ...style }))
      anchor = [cx, cy - s.r]
    } else if (pts.length === 1) {
      const [x, y] = toShown(...pts[0])
      svg.append(el('path', { d: `M${x - 6 * unit},${y}h${12 * unit}M${x},${y - 6 * unit}v${12 * unit}`, stroke: colour, 'stroke-width': 1.5 * unit }))
      anchor = [x, y]
    } else {
      const shown = pts.map(p => toShown(...p))
      const d = 'M' + shown.map(p => p.join(',')).join('L') + (pts.length > 2 ? 'Z' : '')
      svg.append(el('path', { d, ...style, fill: pts.length > 2 ? style.fill : 'none', 'stroke-dasharray': pts.length === 2 ? 'none' : (r.own ? 'none' : `${5 * unit} ${3 * unit}`) }))
      // The label stands above the middle of the shape.
      const xs = shown.map(p => p[0])
      anchor = [(Math.min(...xs) + Math.max(...xs)) / 2, Math.min(...shown.map(p => p[1]))]
    }
    const f = r.region.ism ?? {}
    const words = [nameOf(r.region)]
    if (r.own) words.push(r.homography ? `plane at an angle, ${formatMm(r.scale)}/px at its centre` : `${formatMm(r.scale)}/px`)
    if (f.objectWidthMm !== undefined) words.push([f.objectWidthMm, f.objectHeightMm].filter(n => n !== undefined).map(formatMm).join(' × '))
    // A line's known length, unless its name already says it.
    if (f.lengthMm !== undefined && f.objectWidthMm === undefined && !words[0].includes(formatMm(f.lengthMm))) words.push(formatMm(f.lengthMm))
    svg.append(label(anchor[0], anchor[1] - 8 * unit, words.join(' · '), unit * 0.85, 'middle', colour))
  }
}

function regionSection() {
  const { readings, fields, regions } = current
  if (!readings.length) return
  const h = document.createElement('h2')
  h.textContent = `Regions (${readings.length})`
  const list = document.createElement('dl')
  list.className = 'regions'
  for (const r of readings) {
    const f = r.region.ism ?? {}
    const lines = []
    if (r.own) lines.push(`Scale ${formatMm(r.scale)}/px, its own${r.homography ? ', at its centre; measured through the homography of its plane' : ''}${f.plane ? `: ${f.plane}` : ''}`)
    else if (r.scale) lines.push(`Scale ${formatMm(r.scale)}/px, ${r.scaleSource === 'region' ? 'another region\u2019s' : 'the image\u2019s'}`)
    if (f.method) lines.push(`Method: ${f.method}${f.uncertainty !== undefined ? `, ± ${pct(2 * f.uncertainty)} at about 95%` : ''}`)
    if (f.objectWidthMm !== undefined) lines.push(`Object: ${[f.objectWidthMm, f.objectHeightMm].filter(n => n !== undefined).map(formatMm).join(' × ')}${f.objectThicknessMm !== undefined ? `, ${formatMm(f.objectThicknessMm)} thick` : ''}`)
    const check = lengthCheck(fields, regions, r.region)
    if (check?.ok) lines.push(check.within === 'pixel'
      ? `Length ${formatMm(check.lengthMm)}: ${formatMm(check.mm)} through the plane, ${check.agrees ? 'within' : 'more than'} a pixel`
      : `Length ${formatMm(check.lengthMm)}: gives ${formatMm(check.impliedScale)}/px, ${(check.difference * 100).toFixed(2)}% from the scale there${check.agrees === undefined ? '' : check.agrees ? ', within the uncertainty' : ', more than the uncertainty allows'}`)
    if (!r.placed || (r.reason && !r.own && !r.scale)) lines.push(r.reason ?? 'Cannot be placed.')
    for (const w of r.check.warnings) lines.push(w)
    const dt = document.createElement('dt'); dt.textContent = nameOf(r.region)
    dt.style.color = REGION_COLOURS[kindOf(r)]
    const dd = document.createElement('dd'); dd.textContent = lines.join(' · ') || 'An IPTC region, with no ISM fields.'
    list.append(dt, dd)
  }
  details.append(h, list)
}

// ── The overlay: scale bar, object box, regions, measuring line ───────────────

function overlay(w, h, fields, result) {
  const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none' })
  const unit = Math.max(w, h) / 600 // one "screen pixel" at a typical display size
  // Whether the stored pixels still stand as they were measured: then the box
  // and the regions can be placed, turned only by the EXIF orientation.
  const grid = fields ? gridFor(fields, current.stored.w, current.stored.h) : { ok: false }

  drawRegions(svg, unit)

  if (result.ok) {
    // The object box is in the measured image's stored pixels; follow a resize and the EXIF orientation, not a turn of the pixels.
    if (fields.objectBox && grid.ok && !grid.turned) {
      const f = grid.factor
      const [bx0, by0, bw0, bh0] = fields.objectBox.map(n => n * f)
      const corners = [toShown(bx0, by0), toShown(bx0 + bw0, by0 + bh0)]
      const x = Math.min(corners[0][0], corners[1][0]), y = Math.min(corners[0][1], corners[1][1])
      const bw = Math.abs(corners[1][0] - corners[0][0]), bh = Math.abs(corners[1][1] - corners[0][1])
      const swapped = current.orientation >= 5
      svg.append(el('rect', { x, y, width: bw, height: bh, fill: 'none', stroke: '#0b57d0', 'stroke-width': 1.5 * unit, 'stroke-dasharray': `${6 * unit} ${4 * unit}` }))
      const across = swapped ? fields.objectHeightMm : fields.objectWidthMm
      const down = swapped ? fields.objectWidthMm : fields.objectHeightMm
      // When the image's object has a region of its own, the region carries the size (§14.9).
      const labelled = current.readings.some(r => r.placed && hasRole(r.region, IPTC_ROLES.mainSubjectArea))
      if (across && !labelled) svg.append(label(x + bw / 2, y - 6 * unit, formatMm(across), unit, 'middle'))
      if (down && !labelled) svg.append(label(x + bw + 6 * unit, y + bh / 2, formatMm(down), unit, 'start'))
    }
    // Scale bar, bottom left, about a fifth of the width.
    const bar = niceLength(result.scale, w / 5)
    const bx = 24 * unit, by = h - 24 * unit
    svg.append(el('rect', { x: bx - 8 * unit, y: by - 30 * unit, width: bar.px + 16 * unit, height: 40 * unit, fill: 'rgba(255,255,255,.85)' }))
    svg.append(el('rect', { x: bx, y: by - 6 * unit, width: bar.px, height: 6 * unit, fill: '#111' }))
    svg.append(label(bx + bar.px / 2, by - 12 * unit, formatMm(bar.mm), unit, 'middle', '#111'))
  }

  // Drag to measure, or — calibrating — to mark the ruler.
  const line = el('line', { stroke: '#d93025', 'stroke-width': 2 * unit, 'stroke-linecap': 'round', visibility: 'hidden' })
  const text = label(0, 0, '', unit, 'middle', '#d93025')
  text.setAttribute('visibility', 'hidden')
  svg.append(line, text)
  let start = null
  let end = null
  const at = e => {
    const r = svg.getBoundingClientRect()
    return [(e.clientX - r.left) * w / r.width, (e.clientY - r.top) * h / r.height]
  }
  svg.addEventListener('pointerdown', e => {
    start = at(e)
    end = start
    svg.setPointerCapture(e.pointerId)
    line.setAttribute('visibility', 'visible'); text.setAttribute('visibility', 'visible')
    draw()
  })
  svg.addEventListener('pointermove', e => { if (start) { end = at(e); draw() } })
  svg.addEventListener('pointerup', () => {
    if (!start) return
    const px = Math.hypot(end[0] - start[0], end[1] - start[1])
    start = null
    if (mode === 'calibrate' && px > 5) {
      reference = { px, screenPx: w / svg.getBoundingClientRect().width }
      showStatus()
      showWriter()
    }
  })
  function draw() {
    const [x0, y0] = start, [x, y] = end
    line.setAttribute('stroke', mode === 'calibrate' ? '#0b57d0' : '#d93025')
    text.setAttribute('fill', mode === 'calibrate' ? '#0b57d0' : '#d93025')
    Object.entries({ x1: x0, y1: y0, x2: x, y2: y }).forEach(([k, v]) => line.setAttribute(k, v))
    const px = Math.hypot(x - x0, y - y0)
    text.setAttribute('x', (x0 + x) / 2)
    text.setAttribute('y', (y0 + y) / 2 - 10 * unit)
    text.textContent = !px ? '' : mode === 'view' ? lengthOf(x0, y0, x, y, px) : `${px.toFixed(0)} px`
  }
  const api = { clearLine: () => { line.setAttribute('visibility', 'hidden'); text.setAttribute('visibility', 'hidden') } }
  return { svg, api }
}

/** A drawn line's length: by the scale that holds at both ends (§14.5), or why there is none. */
function lengthOf(x0, y0, x1, y1, px) {
  const { fields, regions, stored, result } = current
  if (!regions.length) return result.ok ? formatMm(px * result.scale) : `${px.toFixed(0)} px`
  const m = measure(fields, regions, stored.w, stored.h, toStored(x0, y0), toStored(x1, y1))
  if (m.ok) return formatMm(m.mm)
  return /different scales|overlap/.test(m.reason) ? `${px.toFixed(0)} px — two scales` : `${px.toFixed(0)} px`
}

function label(x, y, s, unit, anchor, fill = '#0b57d0') {
  const t = el('text', { x, y, 'text-anchor': anchor, 'dominant-baseline': 'middle', 'font-size': 14 * unit, 'font-family': 'system-ui, sans-serif', 'font-weight': 600, fill, stroke: '#fff', 'stroke-width': 3 * unit, 'paint-order': 'stroke' })
  t.textContent = s
  return t
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function section(title, rows) {
  rows = rows.filter(([, v]) => v !== undefined && v !== '')
  if (!rows.length) return
  const h = document.createElement('h2')
  h.textContent = title
  const dl = document.createElement('dl')
  for (const [k, v] of rows) {
    const dt = document.createElement('dt'); dt.textContent = k
    const dd = document.createElement('dd'); dd.textContent = v
    dl.append(dt, dd)
  }
  details.append(h, dl)
}

function para(s, cls) {
  const p = document.createElement('p')
  if (cls) p.className = cls
  p.textContent = s
  return p
}

function button(s, onClick, secondary = false) {
  const b = document.createElement('button')
  b.textContent = s
  b.type = onClick ? 'button' : 'submit'
  if (secondary) b.className = 'secondary'
  if (onClick) b.addEventListener('click', onClick)
  return b
}

function field(form, labelText, typeOrEl, attrs = {}) {
  const l = document.createElement('label')
  l.textContent = labelText
  const inputEl = typeof typeOrEl === 'string' ? Object.assign(document.createElement('input'), { type: typeOrEl }) : typeOrEl
  for (const [k, v] of Object.entries(attrs)) inputEl.setAttribute(k, v)
  l.append(inputEl)
  form.append(l)
  return inputEl
}

function el(name, attrs) {
  const n = document.createElementNS(SVG, name)
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v)
  return n
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const pct = x => `${Number((x * 100).toFixed(x < 0.01 ? 2 : 1))}%`
const mm = v => (v === undefined ? undefined : formatMm(v))
