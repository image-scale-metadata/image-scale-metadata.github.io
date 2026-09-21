// Image Scale Metadata (ISM) — reference reader and writer, version 0.1 (draft).
//
// Reads the scale an image carries in its own XMP and says whether it can be
// trusted for the file at hand; writes the fields and embeds them in a JPEG.
// No dependencies; works in browsers and in Node 18+.
//
// Spec: Image Scale Metadata 0.1, §4 (fields), §5 (writers), §6 (readers).
// Licence: MIT.

export const ISM_NS = 'https://w3id.org/ism/0.1/'
export const ISM_VERSION = '0.1'

const CORE = ['version', 'scale', 'referenceWidth', 'referenceHeight']
const REALS = ['scale', 'uncertainty', 'objectWidthMm', 'objectHeightMm', 'objectThicknessMm']
const INTEGERS = ['referenceWidth', 'referenceHeight']
const TEXTS = ['version', 'method', 'methodNote', 'measuredBy', 'measuredAt', 'software', 'plane']
export const METHODS = ['ruler', 'calipers', 'target', 'optics', 'other']
/** §6.3: a copy with the same aspect ratio, within this, is taken to be resized. */
export const ASPECT_TOLERANCE = 0.005

// ── Finding the XMP packet ────────────────────────────────────────────────────

/**
 * The XMP packet in a file's bytes, as text, or null. XMP is stored as plain
 * UTF-8 in JPEG (APP1), TIFF (tag 700), PNG (uncompressed iTXt), WebP and HEIF,
 * so searching the bytes for the packet finds it in all of them.
 */
export function findXmp(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const start = indexOf(u8, ascii('<x:xmpmeta'))
  if (start < 0) return null
  const endTag = ascii('</x:xmpmeta>')
  const end = indexOf(u8, endTag, start)
  if (end < 0) return null
  return new TextDecoder('utf-8').decode(u8.subarray(start, end + endTag.length))
}

function ascii(s) {
  return Uint8Array.from(s, c => c.charCodeAt(0))
}

function indexOf(hay, needle, from = 0) {
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer
    return i
  }
  return -1
}

// ── Reading the fields ────────────────────────────────────────────────────────

const unescapeXml = s => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&amp;/g, '&')

/**
 * The ISM fields in an XMP packet, typed, or null when the packet has none.
 * The prefix is whatever the packet binds to the ISM namespace, not assumed to
 * be "ism". Both XMP forms are read: attributes on rdf:Description, and
 * child elements; objectBox as an rdf:Seq.
 */
export function parseIsm(xmp) {
  if (!xmp) return null
  const binding = new RegExp(`xmlns:([A-Za-z_][\\w.-]*)\\s*=\\s*["']${ISM_NS.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}["']`).exec(xmp)
  if (!binding) return null
  const p = binding[1]
  const raw = {}
  for (const m of xmp.matchAll(new RegExp(`\\b${p}:(\\w+)\\s*=\\s*"([^"]*)"`, 'g'))) raw[m[1]] = unescapeXml(m[2])
  for (const m of xmp.matchAll(new RegExp(`\\b${p}:(\\w+)\\s*=\\s*'([^']*)'`, 'g'))) raw[m[1]] = unescapeXml(m[2])
  for (const m of xmp.matchAll(new RegExp(`<${p}:(\\w+)>([^<]*)</${p}:\\1>`, 'g'))) raw[m[1]] = unescapeXml(m[2].trim())
  const box = new RegExp(`<${p}:objectBox>([\\s\\S]*?)</${p}:objectBox>`).exec(xmp)
  const fields = {}
  for (const k of TEXTS) if (raw[k] !== undefined) fields[k] = raw[k]
  for (const k of REALS) if (raw[k] !== undefined) fields[k] = Number(raw[k])
  for (const k of INTEGERS) if (raw[k] !== undefined) fields[k] = Number(raw[k])
  if (box) {
    const values = [...box[1].matchAll(/<rdf:li>\s*([^<]*?)\s*<\/rdf:li>/g)].map(m => Number(m[1]))
    fields.objectBox = values
  }
  return Object.keys(fields).length ? fields : null
}

/** The ISM fields in a file's bytes, or null. */
export function readIsm(bytes) {
  return parseIsm(findXmp(bytes))
}

// ── Checking the fields ───────────────────────────────────────────────────────

/** Problems with the fields themselves, before any image is involved (§4, §6.1). */
export function validate(fields) {
  const problems = []
  if (!fields) return ['No Image Scale Metadata in the file.']
  const missing = CORE.filter(k => fields[k] === undefined)
  if (missing.length) problems.push(`Missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`)
  if (fields.scale !== undefined && !(Number.isFinite(fields.scale) && fields.scale > 0)) problems.push('scale must be a number above 0.')
  for (const k of INTEGERS) {
    if (fields[k] !== undefined && !(Number.isInteger(fields[k]) && fields[k] > 0)) problems.push(`${k} must be a whole number above 0.`)
  }
  if (fields.method !== undefined && !METHODS.includes(fields.method)) problems.push(`method "${fields.method}" is not one of ${METHODS.join(', ')}.`)
  if (fields.uncertainty !== undefined && !(Number.isFinite(fields.uncertainty) && fields.uncertainty >= 0)) problems.push('uncertainty must be a number of 0 or more.')
  if (fields.objectBox !== undefined && !(fields.objectBox.length === 4 && fields.objectBox.every(n => Number.isFinite(n)))) problems.push('objectBox must hold four numbers: x, y, width, height.')
  return problems
}

/**
 * The scale for the image as it is now (§6): millimetres per pixel of the
 * current grid, or the reason there is none.
 *
 * width and height are the image's stored pixel dimensions. A browser reports
 * dimensions after EXIF orientation; a copy turned by 90° therefore arrives with
 * width and height swapped, and since the scale is the same both ways (§6.5) a
 * swapped grid counts as the same grid.
 */
export function scaleFor(fields, width, height) {
  const problems = validate(fields)
  if (problems.length) return { ok: false, reason: problems.join(' ') }
  const rw = fields.referenceWidth, rh = fields.referenceHeight
  const same = (a, b) => a === rw && b === rh
  if (same(width, height)) return { ok: true, scale: fields.scale, resized: false, turned: false }
  if (same(height, width)) return { ok: true, scale: fields.scale, resized: false, turned: true }
  // Resized? Same aspect ratio, either way round.
  for (const [w, h, turned] of [[width, height, false], [height, width, true]]) {
    if (Math.abs(w / h - rw / rh) / (rw / rh) <= ASPECT_TOLERANCE) {
      return { ok: true, scale: fields.scale * rw / w, resized: true, turned, factor: w / rw }
    }
  }
  return {
    ok: false,
    reason: `The image is ${width} × ${height} px but the scale was set on ${rw} × ${rh} px, with a different shape. It has been cropped or changed since, so the scale no longer applies.`,
  }
}

/** A round length for a scale bar about `targetPx` pixels long: 1, 2 or 5 × 10ⁿ mm. */
export function niceLength(scaleMmPerPx, targetPx) {
  const target = scaleMmPerPx * targetPx
  const base = 10 ** Math.floor(Math.log10(target))
  const step = [1, 2, 5, 10].map(m => m * base).filter(v => v <= target).pop() ?? base
  return { mm: step, px: step / scaleMmPerPx }
}

export function formatMm(mm) {
  if (mm >= 10) return `${Number(mm.toFixed(1))} mm`
  if (mm >= 1) return `${Number(mm.toFixed(2))} mm`
  const um = mm * 1000
  return `${Number(um.toFixed(um >= 100 ? 0 : 1))} µm`
}

// ── Writing ───────────────────────────────────────────────────────────────────

const escapeXml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * An XMP packet holding the given ISM fields (§8), fields in a fixed order so
 * the same input always gives the same bytes. Throws when the core is
 * incomplete: a writer writes all four or none (§5.1).
 */
export function writeIsmXmp(fields) {
  const f = { version: ISM_VERSION, ...fields }
  const problems = validate(f)
  if (problems.length) throw new Error(problems.join(' '))
  const order = ['version', 'scale', 'referenceWidth', 'referenceHeight', 'method', 'methodNote', 'uncertainty',
    'measuredBy', 'measuredAt', 'software', 'plane', 'objectWidthMm', 'objectHeightMm', 'objectThicknessMm']
  const attrs = order.filter(k => f[k] !== undefined).map(k => `\n        ism:${k}="${escapeXml(f[k])}"`).join('')
  const box = f.objectBox
    ? `\n      <ism:objectBox>\n        <rdf:Seq>${f.objectBox.map(n => `<rdf:li>${Math.round(n)}</rdf:li>`).join('')}</rdf:Seq>\n      </ism:objectBox>\n    `
    : ''
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:ism="${ISM_NS}"${attrs}${box ? `>${box}</rdf:Description>` : '/>'}
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`
}

/**
 * A JPEG with the XMP packet embedded as its APP1 XMP segment, replacing any
 * XMP segment already there. Other segments are kept as they are.
 */
export function embedXmpInJpeg(jpeg, xmp) {
  const u8 = jpeg instanceof Uint8Array ? jpeg : new Uint8Array(jpeg)
  if (u8[0] !== 0xff || u8[1] !== 0xd8) throw new Error('Not a JPEG')
  const header = ascii('http://ns.adobe.com/xap/1.0/\0')
  const body = new TextEncoder().encode(xmp)
  const length = 2 + header.length + body.length
  if (length > 0xffff) throw new Error('XMP packet too large for one APP1 segment')
  const segment = new Uint8Array(2 + length)
  segment.set([0xff, 0xe1, length >> 8, length & 0xff])
  segment.set(header, 4)
  segment.set(body, 4 + header.length)
  // Copy the existing segments up to the image data, leaving out any XMP APP1.
  const parts = [u8.subarray(0, 2), segment]
  let i = 2
  while (i + 4 <= u8.length && u8[i] === 0xff) {
    const marker = u8[i + 1]
    if (marker === 0xda) break // start of scan: the rest is image data
    const len = (u8[i + 2] << 8) | u8[i + 3]
    const seg = u8.subarray(i, i + 2 + len)
    const isXmp = marker === 0xe1 && indexOf(seg.subarray(4, 4 + header.length), header) === 0
    if (!isXmp) parts.push(seg)
    i += 2 + len
  }
  parts.push(u8.subarray(i))
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
