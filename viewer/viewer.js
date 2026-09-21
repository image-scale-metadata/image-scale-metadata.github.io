// ISM viewer: reads the scale from the file itself and draws it on the image.
// Everything happens in the browser; no file leaves the machine.
import { METHODS, formatMm, niceLength, readIsm, scaleFor } from '../js/ism.js'

const stage = document.getElementById('stage')
const empty = document.getElementById('empty')
const input = document.getElementById('file')
const statusEl = document.getElementById('status')
const details = document.getElementById('details')
const SVG = 'http://www.w3.org/2000/svg'

let objectUrl = null

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
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = URL.createObjectURL(file)
  const img = new Image()
  img.alt = file.name
  img.src = objectUrl
  try {
    await img.decode()
  } catch {
    show(file, null, fields, { ok: false, reason: 'This browser cannot display the file. The fields are listed anyway.' })
    return
  }
  // naturalWidth/Height come after EXIF orientation, which is what §6.5 expects.
  const result = scaleFor(fields, img.naturalWidth, img.naturalHeight)
  show(file, img, fields, result)
}

function show(file, img, fields, result) {
  stage.replaceChildren()
  if (img) {
    const frame = document.createElement('div')
    frame.className = 'frame'
    frame.append(img)
    if (result.ok) frame.append(overlay(img.naturalWidth, img.naturalHeight, fields, result))
    stage.append(frame)
  } else {
    stage.append(empty)
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

  details.replaceChildren()
  const img_ = img ? `${img.naturalWidth} × ${img.naturalHeight} px` : '—'
  section('File', [['Name', file.name], ['Pixels', img_], ['Size', `${(file.size / 1024).toFixed(0)} KB`]])
  if (!fields) return
  section('Measured on', [
    ['Scale', fields.scale !== undefined ? `${fields.scale} mm/px` : undefined],
    ['Pixels', fields.referenceWidth ? `${fields.referenceWidth} × ${fields.referenceHeight} px` : undefined],
    ['Version', fields.version],
  ])
  section('How it was measured', [
    ['Method', fields.method && (METHODS.includes(fields.method) ? fields.method : `${fields.method} (unknown)`)],
    ['Note', fields.methodNote],
    ['Uncertainty', fields.uncertainty !== undefined ? `± ${fields.uncertainty} mm/px (${pct(fields.uncertainty / fields.scale)})` : undefined],
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

// ── The overlay: scale bar, object box, measuring line ─────────────────────────

function overlay(w, h, fields, result) {
  const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none' })
  const unit = Math.max(w, h) / 600 // one "screen pixel" at a typical display size
  const stroke = { stroke: '#fff', 'stroke-width': 2.5 * unit, 'paint-order': 'stroke' }

  // The object box is in the measured image's pixels; follow a resize, not a turn.
  if (fields.objectBox && !result.turned) {
    const f = result.resized ? result.factor : 1
    const [x, y, bw, bh] = fields.objectBox.map(n => n * f)
    svg.append(el('rect', { x, y, width: bw, height: bh, fill: 'none', stroke: '#0b57d0', 'stroke-width': 1.5 * unit, 'stroke-dasharray': `${6 * unit} ${4 * unit}` }))
    if (fields.objectWidthMm) svg.append(label(x + bw / 2, y - 6 * unit, `${formatMm(fields.objectWidthMm)}`, unit, 'middle'))
    if (fields.objectHeightMm) svg.append(label(x + bw + 6 * unit, y + bh / 2, `${formatMm(fields.objectHeightMm)}`, unit, 'start'))
  }

  // Scale bar, bottom left, about a fifth of the width.
  const bar = niceLength(result.scale, w / 5)
  const bx = 24 * unit, by = h - 24 * unit
  svg.append(el('rect', { x: bx - 8 * unit, y: by - 30 * unit, width: bar.px + 16 * unit, height: 40 * unit, fill: 'rgba(255,255,255,.85)' }))
  svg.append(el('rect', { x: bx, y: by - 6 * unit, width: bar.px, height: 6 * unit, fill: '#111' }))
  svg.append(label(bx + bar.px / 2, by - 12 * unit, formatMm(bar.mm), unit, 'middle', '#111'))

  // Drag to measure.
  const line = el('line', { stroke: '#d93025', 'stroke-width': 2 * unit, visibility: 'hidden' })
  const text = label(0, 0, '', unit, 'middle', '#d93025', stroke)
  text.setAttribute('visibility', 'hidden')
  svg.append(line, text)
  let start = null
  const at = e => {
    const r = svg.getBoundingClientRect()
    return [(e.clientX - r.left) * w / r.width, (e.clientY - r.top) * h / r.height]
  }
  svg.addEventListener('pointerdown', e => {
    start = at(e)
    svg.setPointerCapture(e.pointerId)
    line.setAttribute('visibility', 'visible'); text.setAttribute('visibility', 'visible')
    draw(start)
  })
  svg.addEventListener('pointermove', e => { if (start) draw(at(e)) })
  svg.addEventListener('pointerup', () => { start = null })
  function draw([x, y]) {
    const [x0, y0] = start
    Object.entries({ x1: x0, y1: y0, x2: x, y2: y }).forEach(([k, v]) => line.setAttribute(k, v))
    const px = Math.hypot(x - x0, y - y0)
    text.setAttribute('x', (x0 + x) / 2)
    text.setAttribute('y', (y0 + y) / 2 - 10 * unit)
    text.textContent = px ? formatMm(px * result.scale) : ''
  }
  return svg
}

function label(x, y, s, unit, anchor, fill = '#0b57d0', extra = { stroke: '#fff', 'stroke-width': 3 * unit, 'paint-order': 'stroke' }) {
  const t = el('text', { x, y, 'text-anchor': anchor, 'dominant-baseline': 'middle', 'font-size': 14 * unit, 'font-family': 'system-ui, sans-serif', 'font-weight': 600, fill, ...extra })
  t.textContent = s
  return t
}

function el(name, attrs) {
  const n = document.createElementNS(SVG, name)
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v)
  return n
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const pct = x => `${Number((x * 100).toFixed(1))}%`
const mm = v => (v === undefined ? undefined : formatMm(v))
