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

const PNG_XMP_KEYWORD = 'XML:com.adobe.xmp'

// ── Finding the XMP packet ────────────────────────────────────────────────────

/**
 * The XMP packet in a file's bytes, as text, or null. XMP is stored as plain
 * UTF-8 in JPEG (APP1), TIFF (tag 700), PNG (uncompressed iTXt), WebP and HEIF,
 * so searching the bytes for the packet finds it in all of them.
 */
export function findXmp(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  // Where the format says the packet lives, first. A file can carry bytes that
  // look like a packet but are not the one in force — a TIFF whose XMP tag was
  // repointed, say — and a reader that scans blindly would believe the wrong one.
  const placed = (u8[0] === 0xff && u8[1] === 0xd8) ? xmpFromJpeg(u8)
    : (u8[0] === 137 && u8[1] === 80) ? xmpFromPng(u8)
    : ((u8[0] === 0x49 && u8[1] === 0x49) || (u8[0] === 0x4d && u8[1] === 0x4d)) ? xmpFromTiff(u8)
    : undefined
  if (placed !== undefined) return placed
  return scanForXmp(u8)
}

/** The packet anywhere in the bytes — the fallback for WebP, HEIF and the rest. */
function scanForXmp(u8) {
  const start = indexOf(u8, ascii('<x:xmpmeta'))
  if (start < 0) return null
  const endTag = ascii('</x:xmpmeta>')
  const end = indexOf(u8, endTag, start)
  if (end < 0) return null
  return new TextDecoder('utf-8').decode(u8.subarray(start, end + endTag.length))
}

function xmpFromJpeg(u8) {
  const header = ascii('http://ns.adobe.com/xap/1.0/\0')
  let i = 2
  while (i + 4 <= u8.length && u8[i] === 0xff) {
    const marker = u8[i + 1]
    if (marker === 0xda) break
    const len = (u8[i + 2] << 8) | u8[i + 3]
    if (marker === 0xe1 && startsWith(u8.subarray(i + 4, i + 4 + header.length), header)) {
      return new TextDecoder('utf-8').decode(u8.subarray(i + 4 + header.length, i + 2 + len))
    }
    i += 2 + len
  }
  return null
}

function xmpFromPng(u8) {
  const keyword = ascii(PNG_XMP_KEYWORD)
  let i = 8
  while (i + 8 <= u8.length) {
    const length = readU32(u8, i)
    const type = new TextDecoder('latin1').decode(u8.subarray(i + 4, i + 8))
    if (type === 'iTXt' && startsWith(u8.subarray(i + 8, i + 8 + keyword.length), keyword)) {
      const at = i + 8 + keyword.length
      // keyword\0 flag method language\0 translated\0, all empty as XMP asks
      if (u8[at] === 0 && u8[at + 1] === 0) {
        let p = at + 3
        for (let skipped = 0; skipped < 2 && p < u8.length; p++) if (u8[p] === 0) skipped++
        return new TextDecoder('utf-8').decode(u8.subarray(p, i + 8 + length))
      }
    }
    if (type === 'IEND') break
    i += 12 + length
  }
  return null
}

function xmpFromTiff(u8) {
  const little = u8[0] === 0x49
  const u16 = (o) => little ? u8[o] | (u8[o + 1] << 8) : (u8[o] << 8) | u8[o + 1]
  const u32 = (o) => (little
    ? u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16) | (u8[o + 3] << 24)
    : (u8[o] << 24) | (u8[o + 1] << 16) | (u8[o + 2] << 8) | u8[o + 3]) >>> 0
  if (u16(2) !== 42) return null
  const ifd = u32(4)
  if (ifd + 2 > u8.length) return null
  const count = u16(ifd)
  for (let i = 0; i < count; i++) {
    const at = ifd + 2 + i * 12
    if (u16(at) !== 700) continue
    const length = u32(at + 4)
    const offset = length <= 4 ? at + 8 : u32(at + 8)
    if (offset + length > u8.length) return null
    return new TextDecoder('utf-8').decode(u8.subarray(offset, offset + length))
  }
  return null
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
  return wrapPacket(`<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    ${ismDescription(fields)}
  </rdf:RDF>
</x:xmpmeta>`)
}

const wrapPacket = xmpmeta => `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
${xmpmeta}
<?xpacket end="w"?>`

/** The rdf:Description holding the ISM fields, checked first (§5.1). */
function ismDescription(fields) {
  const f = { version: ISM_VERSION, ...fields }
  const problems = validate(f)
  if (problems.length) throw new Error(problems.join(' '))
  const order = ['version', 'scale', 'referenceWidth', 'referenceHeight', 'method', 'methodNote', 'uncertainty',
    'measuredBy', 'measuredAt', 'software', 'plane', 'objectWidthMm', 'objectHeightMm', 'objectThicknessMm']
  const attrs = order.filter(k => f[k] !== undefined).map(k => `\n        ism:${k}="${escapeXml(f[k])}"`).join('')
  const box = f.objectBox
    ? `\n      <ism:objectBox>\n        <rdf:Seq>${f.objectBox.map(n => `<rdf:li>${Math.round(n)}</rdf:li>`).join('')}</rdf:Seq>\n      </ism:objectBox>\n    `
    : ''
  return `<rdf:Description rdf:about=""
        xmlns:ism="${ISM_NS}"${attrs}${box ? `>${box}</rdf:Description>` : '/>'}`
}

/**
 * An XMP packet with the ISM fields set and everything else kept: a file's own
 * title, rights, keywords and camera data survive. Any ISM fields already there
 * are replaced, not duplicated. `xmp` is the file's packet (findXmp), or null.
 */
export function mergeIsmIntoXmp(xmp, fields) {
  if (!xmp) return writeIsmXmp(fields)
  if (!/<\/rdf:RDF>/.test(xmp)) throw new Error('The file\'s XMP has no rdf:RDF to add to.')
  let out = xmp
  const binding = new RegExp(`\\sxmlns:([A-Za-z_][\\w.-]*)\\s*=\\s*["']${ISM_NS.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}["']`).exec(out)
  if (binding) {
    const p = binding[1]
    out = out
      .replace(new RegExp(`<${p}:objectBox>[\\s\\S]*?</${p}:objectBox>`, 'g'), '')
      .replace(new RegExp(`<${p}:(\\w+)>[^<]*</${p}:\\1>`, 'g'), '')
      .replace(new RegExp(`\\s${p}:\\w+\\s*=\\s*("[^"]*"|'[^']*')`, 'g'), '')
      .replace(new RegExp(`\\sxmlns:${p}\\s*=\\s*("[^"]*"|'[^']*')`, 'g'), '')
      // A Description left with nothing but rdf:about goes too.
      .replace(/<rdf:Description\s+rdf:about=(""|'')\s*\/>/g, '')
      .replace(/<rdf:Description\s+rdf:about=(""|'')\s*>\s*<\/rdf:Description>/g, '')
  }
  out = out.replace(/<\/rdf:RDF>/, `  ${ismDescription(fields)}\n  </rdf:RDF>`)
  return wrapPacket(out)
}

/**
 * The EXIF orientation of a JPEG, 1–8, or 1 when there is none. 5–8 mean the
 * stored pixels are turned by 90° against how the picture is shown, so the
 * reference grid (§3, stored) is the shown width and height swapped.
 */
export function jpegOrientation(jpeg) {
  const u8 = jpeg instanceof Uint8Array ? jpeg : new Uint8Array(jpeg)
  let i = 2
  while (i + 4 <= u8.length && u8[i] === 0xff) {
    const marker = u8[i + 1]
    if (marker === 0xda) break
    const len = (u8[i + 2] << 8) | u8[i + 3]
    if (marker === 0xe1 && u8[i + 4] === 0x45 && u8[i + 5] === 0x78 && u8[i + 6] === 0x69 && u8[i + 7] === 0x66) {
      const t = i + 10 // TIFF header after "Exif\0\0"
      const le = u8[t] === 0x49
      const r16 = o => le ? u8[o] | (u8[o + 1] << 8) : (u8[o] << 8) | u8[o + 1]
      const r32 = o => le ? (u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16) | (u8[o + 3] << 24)) >>> 0
        : ((u8[o] << 24) | (u8[o + 1] << 16) | (u8[o + 2] << 8) | u8[o + 3]) >>> 0
      const ifd = t + r32(t + 4)
      const n = r16(ifd)
      for (let k = 0; k < n; k++) {
        const e = ifd + 2 + k * 12
        if (e + 12 > u8.length) break
        if (r16(e) === 0x0112) {
          const v = r16(e + 8)
          return v >= 1 && v <= 8 ? v : 1
        }
      }
      return 1
    }
    i += 2 + len
  }
  return 1
}

/** Whether a JPEG has an XMP segment at all (whether or not it can be read). */
export function jpegHasXmpSegment(jpeg) {
  const u8 = jpeg instanceof Uint8Array ? jpeg : new Uint8Array(jpeg)
  return indexOf(u8, ascii('http://ns.adobe.com/xap/1.0/\0')) >= 0
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

// ── Writing the packet into PNG and TIFF ──────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}


/**
 * The XMP packet written into a PNG, as the uncompressed iTXt chunk XMP asks
 * for (keyword `XML:com.adobe.xmp`). An older XMP chunk is replaced. The chunk
 * goes before IEND, and before IDAT, so a reader meets the metadata first.
 */
export function embedXmpInPng(png, xmp) {
  const u8 = png instanceof Uint8Array ? png : new Uint8Array(png)
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  for (let i = 0; i < 8; i++) if (u8[i] !== signature[i]) throw new Error('Not a PNG')

  const keyword = ascii(PNG_XMP_KEYWORD)
  const text = new TextEncoder().encode(xmp)
  // iTXt: keyword \0 compression-flag compression-method language \0 translated \0 text
  const data = new Uint8Array(keyword.length + 5 + text.length)
  data.set(keyword, 0)
  // keyword\0, flag 0 (not compressed), method 0, empty language\0, empty translated\0
  data.set([0, 0, 0, 0, 0], keyword.length)
  data.set(text, keyword.length + 5)
  const chunk = pngChunk('iTXt', data)

  const parts = [u8.subarray(0, 8)]
  let i = 8
  let written = false
  while (i + 8 <= u8.length) {
    const length = readU32(u8, i)
    const type = new TextDecoder('latin1').decode(u8.subarray(i + 4, i + 8))
    const whole = u8.subarray(i, i + 12 + length)
    const isXmp = type === 'iTXt' && startsWith(u8.subarray(i + 8, i + 8 + keyword.length), keyword)
    if (!written && (type === 'IDAT' || type === 'IEND')) { parts.push(chunk); written = true }
    if (!isXmp) parts.push(whole)
    i += 12 + length
    if (type === 'IEND') break
  }
  if (!written) throw new Error('PNG has no IEND')
  return concat(parts)
}

function pngChunk(type, data) {
  const out = new Uint8Array(12 + data.length)
  writeU32(out, 0, data.length)
  out.set(ascii(type), 4)
  out.set(data, 8)
  writeU32(out, 8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/**
 * The XMP packet written into a TIFF, as tag 700 on the first directory, the
 * place TIFF keeps XMP. The packet and a rebuilt directory are appended, and
 * the header is pointed at the new directory; the original values are left
 * where they are, so nothing else in the file moves. An older tag 700 is
 * replaced.
 */
export function embedXmpInTiff(tiff, xmp) {
  const u8 = tiff instanceof Uint8Array ? tiff : new Uint8Array(tiff)
  const little = u8[0] === 0x49 && u8[1] === 0x49
  const big = u8[0] === 0x4d && u8[1] === 0x4d
  if (!little && !big) throw new Error('Not a TIFF')
  const u16 = (o) => little ? u8[o] | (u8[o + 1] << 8) : (u8[o] << 8) | u8[o + 1]
  const u32 = (o) => (little
    ? u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16) | (u8[o + 3] << 24)
    : (u8[o] << 24) | (u8[o + 1] << 16) | (u8[o + 2] << 8) | u8[o + 3]) >>> 0
  if (u16(2) !== 42) throw new Error('Not a TIFF (bad magic)')

  const ifd = u32(4)
  const count = u16(ifd)
  const entries = []
  for (let i = 0; i < count; i++) {
    const at = ifd + 2 + i * 12
    const tag = u16(at)
    if (tag !== 700) entries.push(u8.subarray(at, at + 12))
  }
  const nextIfd = u32(ifd + 2 + count * 12)

  const packet = new TextEncoder().encode(xmp)
  const pad = packet.length % 2 // keep the directory on an even offset
  const xmpAt = u8.length
  const ifdAt = xmpAt + packet.length + pad

  const entry = new Uint8Array(12)
  const put16 = (arr, o, v) => { if (little) { arr[o] = v & 0xff; arr[o + 1] = v >> 8 } else { arr[o] = v >> 8; arr[o + 1] = v & 0xff } }
  const put32 = (arr, o, v) => {
    if (little) { arr[o] = v & 0xff; arr[o + 1] = (v >>> 8) & 0xff; arr[o + 2] = (v >>> 16) & 0xff; arr[o + 3] = (v >>> 24) & 0xff }
    else { arr[o] = (v >>> 24) & 0xff; arr[o + 1] = (v >>> 16) & 0xff; arr[o + 2] = (v >>> 8) & 0xff; arr[o + 3] = v & 0xff }
  }
  put16(entry, 0, 700)      // XMP
  put16(entry, 2, 1)        // BYTE
  put32(entry, 4, packet.length)
  put32(entry, 8, xmpAt)

  const all = [...entries, entry].sort((a, b) => tagOf(a, little) - tagOf(b, little))
  const directory = new Uint8Array(2 + all.length * 12 + 4)
  put16(directory, 0, all.length)
  all.forEach((e, i) => directory.set(e, 2 + i * 12))
  put32(directory, 2 + all.length * 12, nextIfd)

  const out = new Uint8Array(ifdAt + directory.length)
  out.set(u8, 0)
  out.set(packet, xmpAt)
  out.set(directory, ifdAt)
  put32(out, 4, ifdAt) // the header now points at the rebuilt directory
  return out

  function tagOf(e, le) { return le ? e[0] | (e[1] << 8) : (e[0] << 8) | e[1] }
}

/** The packet written into whichever of JPEG, PNG or TIFF the bytes are. */
export function embedXmp(bytes, xmp) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (u8[0] === 0xff && u8[1] === 0xd8) return embedXmpInJpeg(u8, xmp)
  if (u8[0] === 137 && u8[1] === 80) return embedXmpInPng(u8, xmp)
  if ((u8[0] === 0x49 && u8[1] === 0x49) || (u8[0] === 0x4d && u8[1] === 0x4d)) return embedXmpInTiff(u8, xmp)
  throw new Error('Unsupported format: ISM is written into JPEG, PNG or TIFF here')
}

function startsWith(hay, needle) {
  if (hay.length < needle.length) return false
  for (let i = 0; i < needle.length; i++) if (hay[i] !== needle[i]) return false
  return true
}

function readU32(u8, o) { return ((u8[o] << 24) | (u8[o + 1] << 16) | (u8[o + 2] << 8) | u8[o + 3]) >>> 0 }
function writeU32(u8, o, v) { u8[o] = (v >>> 24) & 0xff; u8[o + 1] = (v >>> 16) & 0xff; u8[o + 2] = (v >>> 8) & 0xff; u8[o + 3] = v & 0xff }
function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
