// ISM viewer: reads the scale from the file itself and draws it on the image,
// and — for a JPEG — writes it: drag along a ruler in the picture, give its
// length, and download the picture with the scale in its metadata.
// Everything happens in the browser; no file leaves the machine.
import {
  METHODS, embedXmpInJpeg, findXmp, formatMm, jpegHasXmpSegment, jpegOrientation, mergeIsmIntoXmp,
  niceLength, readIsm, scaleFor,
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
    current = { file, bytes, img: null, fields, isJpeg,
      result: { ok: false, reason: 'This browser cannot display the file. The fields are listed anyway.' } }
    show()
    return
  }
  // naturalWidth/Height come after EXIF orientation, which is what §6.5 expects.
  current = { file, bytes, img, fields, isJpeg, result: scaleFor(fields, img.naturalWidth, img.naturalHeight) }
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
      ['Uncertainty', fields.uncertainty !== undefined ? `± ${pct(fields.uncertainty)} of the scale` : undefined],
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
  statusEl.className = 'status ' + (result.ok ? 'ok' : 'bad')
  if (result.ok) {
    const how = result.resized
      ? `Resized copy (${pct(result.factor)} of the measured image); the scale is adjusted to match.`
      : 'Same pixels as when it was measured.'
    statusEl.innerHTML = `<strong>${esc(formatMm(result.scale))} per pixel</strong><br>${esc(how)}${result.turned ? ' Turned by 90°; the scale is the same.' : ''}<br><span class="hint">Drag across the image to measure.</span>`
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
    out.textContent = `= ${formatMm(s)} per pixel, ± ${pct(uncertainty())} from where the line was drawn.`
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
 * Relative uncertainty of the scale from drawing the line: each end is placed
 * to about one screen pixel, which on a picture shown smaller than its size is
 * several picture pixels.
 */
function uncertainty() {
  return Math.round((Math.SQRT2 * reference.screenPx / reference.px) * 10000) / 10000
}

function write(lengthMm, method, measuredBy) {
  const { bytes, img, file } = current
  try {
    if (!(lengthMm > 0)) throw new Error('Give the length of the line in millimetres.')
    const existing = findXmp(bytes)
    if (!existing && jpegHasXmpSegment(bytes)) {
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
    const out = embedXmpInJpeg(bytes, mergeIsmIntoXmp(existing, fields))
    const name = file.name.replace(/(\.[^.]+)?$/, '-ism.jpg')
    const blob = new Blob([out], { type: 'image/jpeg' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    // Show the file as written, read back from its own bytes.
    open(new File([out], name, { type: 'image/jpeg' }))
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

// ── The overlay: scale bar, object box, measuring line ─────────────────────────

function overlay(w, h, fields, result) {
  const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none' })
  const unit = Math.max(w, h) / 600 // one "screen pixel" at a typical display size

  if (result.ok) {
    // The object box is in the measured image's pixels; follow a resize, not a turn.
    if (fields.objectBox && !result.turned) {
      const f = result.resized ? result.factor : 1
      const [x, y, bw, bh] = fields.objectBox.map(n => n * f)
      svg.append(el('rect', { x, y, width: bw, height: bh, fill: 'none', stroke: '#0b57d0', 'stroke-width': 1.5 * unit, 'stroke-dasharray': `${6 * unit} ${4 * unit}` }))
      if (fields.objectWidthMm) svg.append(label(x + bw / 2, y - 6 * unit, formatMm(fields.objectWidthMm), unit, 'middle'))
      if (fields.objectHeightMm) svg.append(label(x + bw + 6 * unit, y + bh / 2, formatMm(fields.objectHeightMm), unit, 'start'))
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
    text.textContent = !px ? '' : mode === 'view' && result.ok ? formatMm(px * result.scale) : `${px.toFixed(0)} px`
  }
  const api = { clearLine: () => { line.setAttribute('visibility', 'hidden'); text.setAttribute('visibility', 'hidden') } }
  return { svg, api }
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
