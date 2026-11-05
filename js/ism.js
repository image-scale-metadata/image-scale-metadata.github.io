// Image Scale Metadata (ISM) — reference reader and writer, version 0.3 (draft).
//
// Reads the scale an image carries in its own XMP and says whether it can be
// trusted for the file at hand; writes the fields and embeds them in a JPEG.
// Does the same for a three-dimensional model in glTF/GLB (§13), and reads and
// writes ISM in IPTC Image Regions (§14).
// No dependencies; works in browsers and in Node 18+.
//
// Spec: Image Scale Metadata 0.3, §4 (fields), §5 (writers), §6 (readers),
// §13 (models), §14 (regions). Licence: MIT.

/** The namespace keeps its address through 0.x: 0.2 only adds (§4). */
export const ISM_NS = 'https://w3id.org/ism/0.1/'
export const ISM_VERSION = '0.2'
/** §14: a file whose regions carry ISM says it follows 0.3. One without regions may still say 0.2. */
export const ISM_REGION_VERSION = '0.3'

const CORE = ['version', 'scale', 'referenceWidth', 'referenceHeight']
/** §13.1: a model's core. */
const MODEL_CORE = ['version', 'scale', 'referenceExtent', 'geometryHash']
const REALS = ['scale', 'uncertainty', 'objectWidthMm', 'objectHeightMm', 'objectThicknessMm']
const INTEGERS = ['referenceWidth', 'referenceHeight']
const TEXTS = ['version', 'method', 'methodNote', 'measuredBy', 'measuredAt', 'software', 'plane', 'geometryHash']
export const METHODS = ['ruler', 'calipers', 'target', 'optics', 'scanner', 'ct', 'other']
/** §6.3: a copy with the same aspect ratio, within this, is taken to be resized. */
export const ASPECT_TOLERANCE = 0.005

/** The fields written as an rdf:Seq of numbers. */
const SEQS = ['objectBox', 'referenceExtent', 'homography']

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

/** A tag, a comment, a processing instruction or a CDATA section in an XMP packet. */
const XML_TOKEN = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g

/**
 * The properties that belong to the image as a whole: the attributes of each
 * rdf:Description directly under rdf:RDF, and the elements directly inside it.
 * A field nested deeper — inside an IPTC Image Region, say — belongs to that
 * structure, not to the image, and is left out. Each property comes back with
 * where it stands in the packet, so a writer can take out exactly these.
 */
function topLevelProperties(xmp) {
  const attrs = [], elements = []
  const stack = []
  let open = null // the property element being read: { name, from, start, depth }
  for (const m of xmp.matchAll(XML_TOKEN)) {
    const [whole, closing, name, attributes, selfClosing] = m
    if (!name) continue
    if (closing) {
      stack.pop()
      if (open && stack.length === open.depth) {
        elements.push({ name: open.name, inner: xmp.slice(open.from, m.index), start: open.start, end: m.index + whole.length })
        open = null
      }
      continue
    }
    const parent = stack[stack.length - 1]
    if (name === 'rdf:Description' && parent === 'rdf:RDF') {
      const at = m.index + 1 + name.length
      for (const a of attributes.matchAll(/\s+([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        attrs.push({ name: a[1], value: a[2] ?? a[3], start: at + a.index, end: at + a.index + a[0].length })
      }
    } else if (parent === 'rdf:Description' && stack[stack.length - 2] === 'rdf:RDF' && !selfClosing) {
      open = { name, from: m.index + whole.length, start: m.index, depth: stack.length }
    }
    if (!selfClosing) stack.push(name)
  }
  return { attrs, elements }
}

/** Every prefix a packet binds to the ISM namespace, anywhere in it. */
function ismPrefixes(xmp) {
  const ns = ISM_NS.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  return new Set([...xmp.matchAll(new RegExp(`xmlns:([A-Za-z_][\\w.-]*)\\s*=\\s*["']${ns}["']`, 'g'))].map(m => m[1]))
}

/** The ISM field a qualified name stands for, or null when it is not ISM. */
const ismField = (name, prefixes) => {
  const colon = name.indexOf(':')
  return colon > 0 && prefixes.has(name.slice(0, colon)) ? name.slice(colon + 1) : null
}

/**
 * The ISM fields in an XMP packet, typed, or null when the packet has none.
 * The prefix is whatever the packet binds to the ISM namespace, not assumed to
 * be "ism". Both XMP forms are read: attributes on rdf:Description, and
 * child elements; objectBox as an rdf:Seq. Only the image's own fields count:
 * ISM written inside another structure, such as an IPTC Image Region, is not
 * read as the scale of the whole image.
 */
export function parseIsm(xmp) {
  if (!xmp) return null
  const prefixes = ismPrefixes(xmp)
  if (!prefixes.size) return null
  const { attrs, elements } = topLevelProperties(xmp)
  const raw = {}, seqs = {}
  for (const { name, value } of attrs) {
    const k = ismField(name, prefixes)
    if (k) raw[k] = unescapeXml(value)
  }
  for (const { name, inner } of elements) {
    const k = ismField(name, prefixes)
    if (!k) continue
    if (SEQS.includes(k)) seqs[k] = inner
    else if (!inner.includes('<')) raw[k] = unescapeXml(inner.trim())
  }
  const fields = {}
  for (const k of TEXTS) if (raw[k] !== undefined) fields[k] = raw[k]
  for (const k of REALS) if (raw[k] !== undefined) fields[k] = Number(raw[k])
  for (const k of INTEGERS) if (raw[k] !== undefined) fields[k] = Number(raw[k])
  for (const k of SEQS) {
    if (seqs[k] !== undefined) fields[k] = [...seqs[k].matchAll(/<rdf:li>\s*([^<]*?)\s*<\/rdf:li>/g)].map(m => Number(m[1]))
  }
  return Object.keys(fields).length ? fields : null
}

/** The ISM fields in a file's bytes, or null. */
export function readIsm(bytes) {
  return parseIsm(findXmp(bytes))
}

// ── Checking the fields ───────────────────────────────────────────────────────

/** Whether the fields describe a model (§13) rather than an image. */
export function isModelFields(fields) {
  return !!fields && (fields.referenceExtent !== undefined || fields.geometryHash !== undefined)
}

/** Problems with the fields themselves, before any image or model is involved (§4, §6.1, §13.1). */
export function validate(fields, regions = null) {
  const problems = []
  if (!fields) return ['No Image Scale Metadata in the file.']
  const model = isModelFields(fields)
  if (model && (fields.referenceWidth !== undefined || fields.referenceHeight !== undefined)) {
    problems.push('The fields carry both a pixel grid and a model extent; they describe either an image or a model.')
  }
  // §5.1 as 0.3 has it: the grid may stand without a scale when a region carries one (§14.4).
  const gridOnly = !model && fields.scale === undefined && regionsCarryScale(regions)
  const missing = (model ? MODEL_CORE : gridOnly ? CORE.filter(k => k !== 'scale') : CORE).filter(k => fields[k] === undefined)
  if (missing.length) problems.push(`Missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`)
  if (fields.scale !== undefined && !(Number.isFinite(fields.scale) && fields.scale > 0)) problems.push('scale must be a number above 0.')
  for (const k of INTEGERS) {
    if (fields[k] !== undefined && !(Number.isInteger(fields[k]) && fields[k] > 0)) problems.push(`${k} must be a whole number above 0.`)
  }
  if (fields.method !== undefined && !METHODS.includes(fields.method)) problems.push(`method "${fields.method}" is not one of ${METHODS.join(', ')}.`)
  if (fields.uncertainty !== undefined && !(Number.isFinite(fields.uncertainty) && fields.uncertainty >= 0)) problems.push('uncertainty must be a number of 0 or more.')
  if (fields.homography !== undefined && !homographyOk(fields.homography)) problems.push('homography must hold nine numbers, and not be singular (§14.7).')
  if (fields.homography !== undefined && fields.scale === undefined) problems.push('A homography is written with a scale beside it, for readers that know none (§14.7).')
  if (fields.objectBox !== undefined && !(fields.objectBox.length === 4 && fields.objectBox.every(n => Number.isFinite(n)))) problems.push('objectBox must hold four numbers: x, y, width, height.')
  if (fields.referenceExtent !== undefined && !(Array.isArray(fields.referenceExtent) && fields.referenceExtent.length === 3 && fields.referenceExtent.every(n => Number.isFinite(n) && n > 0))) problems.push('referenceExtent must hold three numbers above 0: x, y, z.')
  if (fields.geometryHash !== undefined && !/^[0-9a-f]{64}$/.test(fields.geometryHash)) problems.push('geometryHash must be a SHA-256 written as 64 lower-case hexadecimal digits.')
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
export function scaleFor(fields, width, height, regions = null) {
  const problems = validate(fields, regions)
  if (problems.length) return { ok: false, reason: problems.join(' ') }
  if (isModelFields(fields)) return { ok: false, reason: 'These fields describe a three-dimensional model, not an image.' }
  const grid = gridFor(fields, width, height)
  if (!grid.ok) return grid
  if (fields.scale === undefined) {
    return { ok: false, regionsOnly: true, reason: 'The image has no scale of its own: only its regions carry one (§14.4).' }
  }
  if (!grid.resized) return { ok: true, scale: fields.scale, resized: false, turned: grid.turned }
  const w = grid.turned ? height : width
  return { ok: true, scale: fields.scale * fields.referenceWidth / w, resized: true, turned: grid.turned, factor: grid.factor }
}

/**
 * How the image as it is now stands to the reference grid (§6.2–6.4), whatever
 * the scale: the same grid, turned by a quarter turn, resized by `factor`
 * (current width over reference width), or changed so that nothing applies.
 */
export function gridFor(fields, width, height) {
  const rw = fields?.referenceWidth, rh = fields?.referenceHeight
  if (!(Number.isInteger(rw) && rw > 0 && Number.isInteger(rh) && rh > 0)) {
    return { ok: false, none: true, reason: 'The image has no reference grid: referenceWidth and referenceHeight are missing or not valid.' }
  }
  if (width === rw && height === rh) return { ok: true, resized: false, turned: false, factor: 1 }
  if (width === rh && height === rw) return { ok: true, resized: false, turned: true, factor: 1 }
  // Resized? Same aspect ratio, either way round.
  for (const [w, h, turned] of [[width, height, false], [height, width, true]]) {
    if (Math.abs(w / h - rw / rh) / (rw / rh) <= ASPECT_TOLERANCE) return { ok: true, resized: true, turned, factor: w / rw }
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

// ── Image regions (§14) ───────────────────────────────────────────────────────

/** IPTC Photo Metadata's extension schema, where Image Region lives (IPTC 2025.1 §11.20, §12.6–12.8). */
export const IPTC_EXT_NS = 'http://iptc.org/std/Iptc4xmpExt/2008-02-29/'
const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const XMP_NS = 'http://ns.adobe.com/xap/1.0/'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'

/** §14.2: the ISM fields a region may carry. The rest belong to the image as a whole. */
export const REGION_FIELDS = ['scale', 'homography', 'plane', 'method', 'methodNote', 'uncertainty', 'measuredBy', 'measuredAt',
  'objectWidthMm', 'objectHeightMm', 'objectThicknessMm', 'lengthMm']
/** §14.2: the fields that describe a region's own scale, and mean nothing without it. */
export const REGION_SCALE_FIELDS = ['homography', 'plane', 'method', 'methodNote', 'uncertainty', 'measuredBy', 'measuredAt']
const REGION_REALS = ['scale', 'uncertainty', 'objectWidthMm', 'objectHeightMm', 'objectThicknessMm', 'lengthMm']
export const REGION_SHAPES = ['rectangle', 'circle', 'polygon']
export const REGION_UNITS = ['pixel', 'relative']

/** §14.8: ISM's terms for region roles and content types, until IPTC has its own. */
export const ISM_ROLES = { scaleReference: `${ISM_NS}role/scaleReference`, measuredObject: `${ISM_NS}role/measuredObject` }
export const ISM_TYPES = { ruler: `${ISM_NS}type/ruler`, target: `${ISM_NS}type/target` }
/** The IPTC region roles ISM refers to (http://cv.iptc.org/newscodes/imageregionrole/). */
export const IPTC_ROLES = {
  mainSubjectArea: 'http://cv.iptc.org/newscodes/imageregionrole/mainSubjectArea',
  subjectArea: 'http://cv.iptc.org/newscodes/imageregionrole/subjectArea',
  areaOfInterest: 'http://cv.iptc.org/newscodes/imageregionrole/areaOfInterest',
}
const TERM_NAMES = {
  [ISM_ROLES.scaleReference]: 'scale reference', [ISM_ROLES.measuredObject]: 'measured object',
  [ISM_TYPES.ruler]: 'ruler', [ISM_TYPES.target]: 'target',
  [IPTC_ROLES.mainSubjectArea]: 'main subject area', [IPTC_ROLES.subjectArea]: 'subject area',
  [IPTC_ROLES.areaOfInterest]: 'area of interest',
}

/**
 * The packet as a tree of elements, each with its attributes and its text.
 * Names are expanded against the namespaces in scope, so a region is found
 * whatever prefixes the writer chose.
 */
function xmlTree(xmp) {
  const root = { name: '', attrs: {}, children: [], text: '' }
  const stack = [root]
  let last = 0
  for (const m of xmp.matchAll(XML_TOKEN)) {
    const [whole, closing, name, attributes, selfClosing] = m
    const top = stack[stack.length - 1]
    top.text += xmp.slice(last, m.index)
    last = m.index + whole.length
    if (!name) {
      if (whole.startsWith('<![CDATA[')) top.text += escapeXml(whole.slice(9, -3))
      continue
    }
    if (closing) {
      if (stack.length > 1) stack.pop()
      continue
    }
    const attrs = {}
    for (const a of attributes.matchAll(/\s+([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = unescapeXml(a[2] ?? a[3])
    const node = { name, attrs, children: [], text: '' }
    top.children.push(node)
    if (!selfClosing) stack.push(node)
  }
  expandNames(root, { xml: XML_NS })
  return root
}

function expandNames(node, inherited) {
  const ns = { ...inherited }
  for (const [k, v] of Object.entries(node.attrs)) if (k.startsWith('xmlns:')) ns[k.slice(6)] = v
  const q = n => {
    const i = n.indexOf(':')
    return i > 0 && ns[n.slice(0, i)] !== undefined ? ns[n.slice(0, i)] + n.slice(i + 1) : n
  }
  node.uri = q(node.name)
  node.props = Object.entries(node.attrs).filter(([k]) => k !== 'xmlns' && !k.startsWith('xmlns:')).map(([k, v]) => [q(k), v])
  for (const c of node.children) expandNames(c, ns)
}

const isPropertyAttr = k => !k.startsWith(RDF_NS) && !k.startsWith(XML_NS)

/** An RDF/XML property's value: text, an array (Bag, Seq), { alt } (Alt), or a structure. */
function rdfValue(node) {
  if (node.props.some(([k, v]) => k === `${RDF_NS}parseType` && v === 'Resource')) return rdfStruct(node)
  const resource = node.props.find(([k]) => k === `${RDF_NS}resource`)
  if (resource) return resource[1]
  const kids = node.children
  if (kids.length === 1 && [`${RDF_NS}Bag`, `${RDF_NS}Seq`, `${RDF_NS}Alt`].includes(kids[0].uri)) {
    const items = kids[0].children.filter(c => c.uri === `${RDF_NS}li`)
    if (kids[0].uri === `${RDF_NS}Alt`) {
      return { alt: items.map(li => ({ lang: li.props.find(([k]) => k === `${XML_NS}lang`)?.[1], value: rdfValue(li) })) }
    }
    return items.map(rdfValue)
  }
  if (kids.length === 1 && kids[0].uri === `${RDF_NS}Description`) return rdfStruct(kids[0])
  if (kids.length || node.props.some(([k]) => isPropertyAttr(k))) return rdfStruct(node)
  return unescapeXml(node.text.trim())
}

/** The properties of a structure, from its attributes and its child elements, keyed by expanded name. */
function rdfStruct(node) {
  const out = {}
  for (const [k, v] of node.props) if (isPropertyAttr(k)) out[k] = v
  for (const c of node.children) out[c.uri] = rdfValue(c)
  return out
}

/** A text value: a string as it is, the default (or first) of a language alternative. */
function textOf(v) {
  if (typeof v === 'string') return v
  if (v?.alt) return textOf((v.alt.find(a => a.lang === 'x-default') ?? v.alt[0])?.value)
  if (Array.isArray(v)) return textOf(v[0])
  return undefined
}

const numberOf = v => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v === undefined ? undefined : NaN)

/** IPTC Entity or Concept structures (rRole, rCtype): { ids, name } each. */
function entitiesOf(v) {
  if (!Array.isArray(v)) return []
  return v.filter(e => e && typeof e === 'object').map(e => {
    const id = e[`${XMP_NS}Identifier`]
    return { ids: (Array.isArray(id) ? id : id === undefined ? [] : [id]).map(textOf).filter(Boolean), name: textOf(e[`${IPTC_EXT_NS}Name`]) }
  })
}

function regionFrom(s, index) {
  const E = IPTC_EXT_NS
  const b = s[`${E}RegionBoundary`] && typeof s[`${E}RegionBoundary`] === 'object' ? s[`${E}RegionBoundary`] : {}
  const vertices = b[`${E}rbVertices`]
  const ism = {}, notAllowed = []
  for (const [k, v] of Object.entries(s)) {
    if (!k.startsWith(ISM_NS)) continue
    const f = k.slice(ISM_NS.length)
    if (!REGION_FIELDS.includes(f)) { notAllowed.push(f); continue }
    ism[f] = f === 'homography' ? (Array.isArray(v) ? v.map(x => numberOf(textOf(x) ?? x)) : [NaN])
      : REGION_REALS.includes(f) ? numberOf(textOf(v) ?? v) : textOf(v)
  }
  return {
    index,
    id: textOf(s[`${E}rId`]),
    name: textOf(s[`${E}Name`]),
    shape: textOf(b[`${E}rbShape`]),
    unit: textOf(b[`${E}rbUnit`]),
    x: numberOf(b[`${E}rbX`]), y: numberOf(b[`${E}rbY`]),
    w: numberOf(b[`${E}rbW`]), h: numberOf(b[`${E}rbH`]), rx: numberOf(b[`${E}rbRx`]),
    vertices: Array.isArray(vertices)
      ? vertices.map(p => ({ x: numberOf(p?.[`${E}rbX`]), y: numberOf(p?.[`${E}rbY`]) }))
      : undefined,
    roles: entitiesOf(s[`${E}rRole`]),
    types: entitiesOf(s[`${E}rCtype`]),
    ism: Object.keys(ism).length ? ism : null,
    notAllowed,
  }
}

/**
 * The IPTC Image Regions of the image (§14.1), each with the ISM fields it
 * carries. Only regions in the image's own Iptc4xmpExt:ImageRegion count: the
 * property of an rdf:Description directly under rdf:RDF.
 */
export function parseRegions(xmp) {
  if (!xmp) return []
  const root = xmlTree(xmp)
  const rdf = (function find(n) {
    if (n.uri === `${RDF_NS}RDF`) return n
    for (const c of n.children) { const r = find(c); if (r) return r }
    return null
  })(root)
  if (!rdf) return []
  const out = []
  for (const d of rdf.children.filter(c => c.uri === `${RDF_NS}Description`)) {
    const bag = rdfStruct(d)[`${IPTC_EXT_NS}ImageRegion`]
    if (Array.isArray(bag)) for (const r of bag) if (r && typeof r === 'object') out.push(regionFrom(r, out.length))
  }
  return out
}

/** The image regions in a file's bytes. */
export function readRegions(bytes) {
  return parseRegions(findXmp(bytes))
}

/** Whether a region is marked with a role or a content type, by its identifier. */
export function hasRole(region, uri) {
  return region.roles.some(r => r.ids.includes(uri))
}
export function hasType(region, uri) {
  return region.types.some(r => r.ids.includes(uri))
}

const scaleOk = s => Number.isFinite(s) && s > 0
function regionsCarryScale(regions) {
  return Array.isArray(regions) && regions.some(r => scaleOk(r.ism?.scale))
}

/**
 * What is wrong with a region, apart from any image (§14.2, §14.3, IPTC
 * §12.7). `boundary`: problems that keep it from being placed. `ism`: problems
 * that keep its ISM fields from being used. `warnings`: what a writer should
 * not have done, but a reader can live with; the fields named are ignored.
 */
export function checkRegion(region) {
  const boundary = [], ism = [], warnings = []
  const { shape, unit } = region
  const fin = n => Number.isFinite(n)
  const rel = unit === 'relative'
  const inRange = n => fin(n) && n >= 0 && (!rel || n <= 1 + 1e-9)
  if (!REGION_SHAPES.includes(shape)) boundary.push(shape === undefined ? 'The region has no boundary shape (rbShape).' : `The boundary shape "${shape}" is not one of ${REGION_SHAPES.join(', ')}.`)
  if (!REGION_UNITS.includes(unit)) boundary.push(unit === undefined ? 'The region has no boundary unit (rbUnit).' : `The boundary unit "${unit}" is not one of ${REGION_UNITS.join(', ')}.`)
  if (shape === 'rectangle') {
    if (![region.x, region.y].every(inRange) || !(region.w > 0) || !(region.h > 0)) boundary.push('A rectangle needs rbX, rbY, rbW and rbH, none negative, and a width and height above 0.')
    else if (rel && (region.x + region.w > 1 + 1e-9 || region.y + region.h > 1 + 1e-9)) boundary.push('The rectangle reaches outside the image.')
  } else if (shape === 'circle') {
    if (![region.x, region.y].every(inRange) || !(region.rx > 0) || (rel && region.rx > 1 + 1e-9)) boundary.push('A circle needs rbX, rbY and a radius rbRx above 0.')
  } else if (shape === 'polygon') {
    if (!region.vertices?.length) boundary.push('A polygon needs at least one vertex in rbVertices.')
    else if (!region.vertices.every(p => inRange(p.x) && inRange(p.y))) boundary.push('Every vertex needs rbX and rbY inside the image.')
  }
  const extra = { rectangle: ['rx', 'vertices'], circle: ['w', 'h', 'vertices'], polygon: ['x', 'y', 'w', 'h', 'rx'] }[shape] ?? []
  const stray = extra.filter(k => region[k] !== undefined)
  if (stray.length) warnings.push(`A ${shape} does not use ${stray.map(k => ({ x: 'rbX', y: 'rbY', w: 'rbW', h: 'rbH', rx: 'rbRx', vertices: 'rbVertices' })[k]).join(', ')} (IPTC §12.7); ignored.`)

  const f = region.ism
  if (region.notAllowed?.length) warnings.push(`ism:${region.notAllowed.join(', ism:')} belong${region.notAllowed.length > 1 ? '' : 's'} to the image, not to a region (§14.2); ignored.`)
  if (f) {
    if (f.scale !== undefined && !scaleOk(f.scale)) ism.push('The region’s scale must be a number above 0.')
    if (f.method !== undefined && !METHODS.includes(f.method)) ism.push(`The region’s method "${f.method}" is not one of ${METHODS.join(', ')}.`)
    if (f.uncertainty !== undefined && !(Number.isFinite(f.uncertainty) && f.uncertainty >= 0)) ism.push('The region’s uncertainty must be a number of 0 or more.')
    for (const k of ['objectWidthMm', 'objectHeightMm', 'objectThicknessMm', 'lengthMm']) {
      if (f[k] !== undefined && !(Number.isFinite(f[k]) && f[k] > 0)) ism.push(`The region’s ${k} must be a number above 0.`)
    }
    if (f.scale === undefined) {
      const loose = REGION_SCALE_FIELDS.filter(k => f[k] !== undefined)
      if (loose.length) warnings.push(`ism:${loose.join(', ism:')} describe${loose.length > 1 ? '' : 's'} a scale, and the region has none of its own (§14.2); ignored.`)
    }
    if (f.homography !== undefined && !homographyOk(f.homography)) ism.push('The region\u2019s homography must hold nine numbers, and not be singular (§14.7).')
    if (f.lengthMm !== undefined && !(shape === 'polygon' && region.vertices?.length >= 2)) {
      warnings.push('ism:lengthMm belongs on a line, or on the first edge of a polygon (§14.3); ignored.')
    }
    if (unit === 'pixel') warnings.push('A region that carries ISM is written in relative units (§14.6); this one is in pixels, so it holds only on the grid it was set on.')
  }
  return { boundary, ism, warnings }
}

/** A region's boundary in pixels of a grid `width` × `height`. */
export function regionShape(region, width, height) {
  const sx = region.unit === 'relative' ? width : 1, sy = region.unit === 'relative' ? height : 1
  if (region.shape === 'rectangle') return { shape: 'rectangle', x: region.x * sx, y: region.y * sy, w: region.w * sx, h: region.h * sy }
  // IPTC measures a circle's radius along the x axis (§12.7.7).
  if (region.shape === 'circle') return { shape: 'circle', x: region.x * sx, y: region.y * sy, r: region.rx * sx }
  return { shape: 'polygon', points: region.vertices.map(p => [p.x * sx, p.y * sy]) }
}

/** The box around a shape from regionShape: x, y, width, height. */
export function shapeBounds(s) {
  if (s.shape === 'rectangle') return { x: s.x, y: s.y, w: s.w, h: s.h }
  if (s.shape === 'circle') return { x: s.x - s.r, y: s.y - s.r, w: 2 * s.r, h: 2 * s.r }
  const xs = s.points.map(p => p[0]), ys = s.points.map(p => p[1])
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

/**
 * Whether a point lies inside a shape, its boundary included (IPTC §11.20).
 * A point or a line, a polygon of fewer than three vertices, has no inside.
 */
export function shapeContains(s, x, y) {
  const e = 1e-9
  if (s.shape === 'rectangle') return x >= s.x - e && x <= s.x + s.w + e && y >= s.y - e && y <= s.y + s.h + e
  if (s.shape === 'circle') return Math.hypot(x - s.x, y - s.y) <= s.r + e
  const p = s.points
  if (p.length < 3) return false
  let inside = false
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j]
    // On an edge counts as inside.
    const cross = (xj - xi) * (y - yi) - (yj - yi) * (x - xi)
    if (Math.abs(cross) <= e * Math.hypot(xj - xi, yj - yi) && x >= Math.min(xi, xj) - e && x <= Math.max(xi, xj) + e && y >= Math.min(yi, yj) - e && y <= Math.max(yi, yj) + e) return true
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * Every region read against the image as it is now (§14.4–14.6). For each:
 * whether it can be placed and where (`shape`, `bounds`, in pixels of the
 * stored grid `width` × `height`), and the scale that holds inside it — its
 * own (`own`), or the image's — in millimetres per current pixel, with the
 * homography that goes with it (§14.7), if any.
 *
 * width and height are the stored pixel dimensions, before EXIF orientation:
 * region boundaries are on the stored grid, as ism:objectBox is (§6.5).
 */
export function regionScales(fields, regions, width, height) {
  const isImage = !!fields && !isModelFields(fields)
  const grid = isImage ? gridFor(fields, width, height)
    : { ok: false, none: true, reason: 'The image has no ISM grid, so no region’s ISM fields can be used (§14.4).' }
  const image = scaleFor(fields, width, height, regions)
  const readings = regions.map(region => {
    const check = checkRegion(region)
    const out = { region, check, placed: false, own: false, scale: null, homography: null, reason: null, shape: null, bounds: null }
    if (check.boundary.length) return { ...out, reason: check.boundary.join(' ') }
    let unplaced = null
    if (grid.ok && grid.turned) unplaced = 'The picture has been turned since its regions were set; which way cannot be told, so the regions cannot be placed (§14.6).'
    else if (grid.ok && grid.resized && region.unit === 'pixel') unplaced = 'The region is in pixels and the picture has been resized since, so its boundary no longer fits (§14.6).'
    else if (!grid.ok && !grid.none) unplaced = grid.reason // cropped or changed: neither the boundary nor a scale can be trusted
    if (unplaced) return { ...out, reason: unplaced }
    const shape = regionShape(region, width, height)
    const placed = { ...out, placed: true, shape, bounds: shapeBounds(shape), factor: grid.factor }
    // Without a grid it is an IPTC region and nothing more: placed as IPTC places it, with no scale.
    if (!grid.ok) return { ...placed, reason: region.ism ? grid.reason : null }
    if (scaleOk(region.ism?.scale) && !check.ism.length) {
      return { ...placed, own: true, scale: region.ism.scale * fields.referenceWidth / width, homography: region.ism.homography ?? null, owner: region }
    }
    return { ...placed, reason: check.ism.length ? check.ism.join(' ') : null }
  })
  // A region without a scale of its own has the scale that holds at the points
  // that define its boundary: an own region's, or the image's (§14.5).
  for (const r of readings) {
    if (!r.placed || r.own || !grid.ok) continue
    const at = shapePoints(r.shape).map(([x, y]) => scaleFrom(readings, image, fields, grid, x, y))
    const bad = at.find(a => !a.ok)
    if (bad) r.reason ??= bad.reason
    else if (at.some(a => !sameSource(a, at[0]))) r.reason ??= 'The region lies under more than one scale (§14.5).'
    else Object.assign(r, { scale: at[0].scale, scaleSource: at[0].source, owner: at[0].owner, homography: at[0].homography, uncertainty: at[0].uncertainty, plane: at[0].plane })
  }
  return readings
}

/** The points that define a shape: a rectangle's corners, a circle's four extremes, a polygon's vertices. */
function shapePoints(s) {
  if (s.shape === 'rectangle') return [[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.h], [s.x, s.y + s.h]]
  if (s.shape === 'circle') return [[s.x - s.r, s.y], [s.x + s.r, s.y], [s.x, s.y - s.r], [s.x, s.y + s.r]]
  return s.points
}

/** Points along a shape's whole boundary, close enough to tell whether it lies inside another. */
function shapeOutline(s) {
  if (s.shape === 'circle') return Array.from({ length: 64 }, (_, i) => [s.x + s.r * Math.cos(i * Math.PI / 32), s.y + s.r * Math.sin(i * Math.PI / 32)])
  const p = shapePoints(s)
  if (p.length < 2) return p
  const out = []
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length]
    for (let k = 0; k < 16; k++) out.push([x0 + (x1 - x0) * k / 16, y0 + (y1 - y0) * k / 16])
  }
  return out
}

/** Whether shape a lies wholly inside shape b, its boundary included (§14.5). */
export function shapeWithin(a, b) {
  return shapeOutline(a).every(([x, y]) => shapeContains(b, x, y))
}

/** Whether two answers from scaleFrom are the same scale: the same homography, or the same number. */
const sameSource = (a, b) => (a.homography || b.homography) ? a.owner === b.owner : sameScale(a.scale, b.scale)

/**
 * The scale at a point, from region readings already made (§14.5). When the
 * regions that hold the point disagree, the one that lies inside all the
 * others holds; when none does, no scale holds there.
 */
function scaleFrom(readings, image, fields, grid, x, y) {
  const here = readings.filter(r => r.placed && r.own && shapeContains(r.shape, x, y))
  if (!here.length) {
    if (!image.ok) return { ok: false, reason: image.reason }
    const lost = readings.some(r => !r.placed && scaleOk(r.region.ism?.scale) && !r.check.ism.length && !r.check.boundary.length)
    const turnedPlane = homographyOk(fields.homography) && grid?.turned
    const caveat = lost ? 'Parts of the picture have scales of their own that cannot be placed in this copy (§14.6).'
      : turnedPlane ? 'The picture has been turned since its plane was set, so the stated scale is used, not the plane (§14.7).' : null
    const homography = homographyOk(fields.homography) && !grid?.turned ? fields.homography : null
    return { ok: true, scale: image.scale, source: 'image', owner: 'image', homography, factor: grid?.factor ?? 1, uncertainty: fields.uncertainty, plane: fields.plane, regions: [], caveat }
  }
  let chosen = here[0]
  const answer = r => ({ scale: r.scale, homography: r.homography, owner: r.owner })
  if (here.some(r => !sameSource(answer(r), answer(here[0])))) {
    // The inner one: inside every other, and none of them inside it.
    chosen = here.find(r => here.every(o => o === r || (shapeWithin(r.shape, o.shape) && !shapeWithin(o.shape, r.shape))))
    if (!chosen) {
      return { ok: false, reason: 'Regions with different scales overlap here, and neither lies inside the other, so no scale holds (§14.5).', regions: here.map(r => r.region) }
    }
  }
  const f = chosen.region.ism
  return {
    ok: true, scale: chosen.scale, source: 'region', owner: chosen.region, homography: chosen.homography, factor: chosen.factor ?? 1,
    uncertainty: f.uncertainty, plane: f.plane, regions: here.map(r => r.region),
  }
}

const sameScale = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(a, b)

/** Whether a value is a usable homography: nine finite numbers, not singular (§14.7). */
function homographyOk(h) {
  if (!Array.isArray(h) || h.length !== 9 || !h.every(Number.isFinite)) return false
  const [a, b, c, d, e, f, g, i, j] = h
  const det = a * (e * j - f * i) - b * (d * j - f * g) + c * (d * i - e * g)
  return Math.abs(det) > 1e-300
}

/** A point of the reference grid carried onto the plane, in millimetres (§14.7). */
export function applyHomography(h, x, y) {
  const w = h[6] * x + h[7] * y + h[8]
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]
}

/**
 * The scale at one point of the image as it is now (§14.5): the scale of the
 * regions with a scale of their own that hold the point, or the image's where
 * none does. `x`, `y` are in pixels of the stored grid `width` × `height`.
 * Where a homography holds, `local` is the scale at that very point (the
 * square root of the area one pixel covers), and `scale` the stated one.
 */
export function scaleAt(fields, regions, width, height, x, y) {
  const grid = fields && !isModelFields(fields) ? gridFor(fields, width, height) : null
  const a = scaleFrom(regionScales(fields, regions, width, height), scaleFor(fields, width, height, regions), fields, grid, x, y)
  if (a.ok && a.homography) {
    const f = a.factor, h = a.homography, e = 0.5
    const [x0, y0] = [x / f, y / f]
    const p = applyHomography(h, x0, y0), px = applyHomography(h, x0 + e, y0), py = applyHomography(h, x0, y0 + e)
    const area = Math.abs((px[0] - p[0]) * (py[1] - p[1]) - (px[1] - p[1]) * (py[0] - p[0])) / (e * e)
    a.local = Math.sqrt(area) / f
  }
  return a
}

/** The distance between two points of the reference grid, by a homography or by a scale per reference pixel. */
function distanceOnGrid(source, [x0, y0], [x1, y1]) {
  if (source.homography) {
    const [a, b] = [applyHomography(source.homography, x0, y0), applyHomography(source.homography, x1, y1)]
    return Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return null
}

/**
 * The distance between two points in millimetres (§14.5), or why there is
 * none: both ends must lie under the same scale. Under a homography the
 * distance is worked out on the plane (§14.7).
 */
export function measure(fields, regions, width, height, [x0, y0], [x1, y1]) {
  const a = scaleAt(fields, regions, width, height, x0, y0)
  const b = scaleAt(fields, regions, width, height, x1, y1)
  if (!a.ok) return a
  if (!b.ok) return b
  if (!sameSource(a, b)) return { ok: false, reason: 'The two ends lie under different scales, so the distance between them is not known (§14.5).' }
  const f = a.factor ?? 1
  const mm = distanceOnGrid(a, [x0 / f, y0 / f], [x1 / f, y1 / f]) ?? Math.hypot(x1 - x0, y1 - y0) * a.scale
  return { ...a, ok: true, mm, caveat: a.caveat ?? b.caveat }
}

/**
 * A known length checked against the scale in force along it (§14.3): on a
 * line, between its two vertices; on a polygon of more, along its first edge,
 * a marker's side. Gives the scale the length implies, the one the file gives
 * along the same stretch, and how far apart they are. Worked on the reference
 * grid. Null when the region has no ism:lengthMm.
 */
export function lengthCheck(fields, regions, region) {
  const length = region.ism?.lengthMm
  if (length === undefined) return null
  if (!(region.shape === 'polygon' && region.vertices?.length >= 2)) return { ok: false, reason: 'ism:lengthMm belongs on a line, or on the first edge of a polygon (§14.3).' }
  const rw = fields?.referenceWidth, rh = fields?.referenceHeight
  const grid = gridFor(fields, rw, rh)
  if (!grid.ok) return { ok: false, reason: grid.reason }
  if (!(length > 0)) return { ok: false, reason: 'ism:lengthMm must be a number above 0.' }
  const [p0, p1] = regionShape(region, rw, rh).points
  const px = Math.hypot(p1[0] - p0[0], p1[1] - p0[1])
  if (!(px > 0)) return { ok: false, reason: 'The line has no length: its two ends are the same point.' }
  let mm, source, u, through
  if (scaleOk(region.ism.scale) && !checkRegion(region).ism.length) {
    through = homographyOk(region.ism.homography)
    mm = distanceOnGrid({ homography: through ? region.ism.homography : null }, p0, p1) ?? px * region.ism.scale
    source = 'region'
    u = region.ism.uncertainty
  } else {
    const m = measure(fields, regions, rw, rh, p0, p1)
    if (!m.ok) return { ok: false, lengthMm: length, px, impliedScale: length / px, reason: m.reason }
    mm = m.mm
    source = m.source
    through = !!m.homography
    u = m.uncertainty
  }
  if (through) u = undefined // a homography's stated uncertainty is the spread of its scale, not the error of a length
  const difference = length / mm - 1
  // Under a homography the length is held to a pixel of the line, the most its ends can be placed by.
  const within = through ? 'pixel' : Number.isFinite(u) && u > 0 ? 'uncertainty' : null
  return {
    ok: true, lengthMm: length, px, impliedScale: length / px, scale: mm / px, mm, source, difference, uncertainty: u, within,
    agrees: within === 'pixel' ? Math.abs(difference) <= 1 / px : within ? Math.abs(difference) <= 2 * u : undefined,
  }
}

/**
 * The size of a region on the reference grid, in millimetres by the scale in
 * force in it, beside the object dimensions it gives (§14.2): its box times the
 * scale, or — under a homography — its outline carried onto the plane, and the
 * box around it there (§14.7). Null when it gives no dimensions.
 */
export function objectCheck(fields, regions, region) {
  const f = region.ism
  if (!f || (f.objectWidthMm === undefined && f.objectHeightMm === undefined)) return null
  const rw = fields?.referenceWidth, rh = fields?.referenceHeight
  const reading = regionScales(fields, regions, rw, rh)[regions.indexOf(region)]
  if (!reading?.placed) return { ok: false, reason: reading?.reason ?? 'The region cannot be placed.' }
  if (!reading.scale) return { ok: false, reason: reading.reason ?? 'No scale holds in the region.' }
  let widthMm, heightMm
  if (reading.homography) {
    const onPlane = shapeOutline(reading.shape).map(([x, y]) => applyHomography(reading.homography, x, y))
    const xs = onPlane.map(p => p[0]), ys = onPlane.map(p => p[1])
    widthMm = Math.max(...xs) - Math.min(...xs)
    heightMm = Math.max(...ys) - Math.min(...ys)
  } else {
    widthMm = reading.bounds.w * reading.scale
    heightMm = reading.bounds.h * reading.scale
  }
  return { ok: true, scale: reading.scale, homography: !!reading.homography, widthMm, heightMm, objectWidthMm: f.objectWidthMm, objectHeightMm: f.objectHeightMm }
}

/**
 * The region that is the image's own object, when there is one (§14.9): the
 * one marked IPTC main subject area. ism:objectBox is its outer bounds.
 */
export function mainObjectRegion(regions) {
  const main = regions.filter(r => hasRole(r, IPTC_ROLES.mainSubjectArea))
  return main.length === 1 ? main[0] : null
}

/** A region's outer bounds on the reference grid in whole pixels, rounded outwards, as ism:objectBox is written. */
export function regionBox(fields, region) {
  const b = shapeBounds(regionShape(region, fields.referenceWidth, fields.referenceHeight))
  const x = Math.floor(b.x + 1e-9), y = Math.floor(b.y + 1e-9)
  return [x, y, Math.ceil(b.x + b.w - 1e-9) - x, Math.ceil(b.y + b.h - 1e-9) - y]
}

// ── Writing ───────────────────────────────────────────────────────────────────

const escapeXml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * An XMP packet holding the given ISM fields (§8), fields in a fixed order so
 * the same input always gives the same bytes. Throws when the core is
 * incomplete: a writer writes all four or none (§5.1).
 *
 * `regions`, when given, are written as the image's IPTC Image Regions (§14),
 * each { id, name, shape, x, y, w, h, rx, vertices: [{ x, y }], roles, types,
 * ism }, in relative units. roles and types are lists of term addresses.
 * With a region that carries a scale, the image may have the grid alone (§14.4).
 */
export function writeIsmXmp(fields, regions = []) {
  return wrapPacket(`<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    ${ismDescription(fields, regions)}
  </rdf:RDF>
</x:xmpmeta>`)
}

const wrapPacket = xmpmeta => `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
${xmpmeta}
<?xpacket end="w"?>`

/** The order fields are written in, so the same input always gives the same bytes. */
const ORDER = ['version', 'scale', 'referenceWidth', 'referenceHeight', 'geometryHash', 'method', 'methodNote',
  'uncertainty', 'measuredBy', 'measuredAt', 'software', 'plane', 'objectWidthMm', 'objectHeightMm', 'objectThicknessMm']

/** Whether `a` names an earlier version than `b`: "0.2" before "0.3". */
const versionBefore = (a, b) => {
  const [x, y] = [a, b].map(v => String(v).split('.').map(Number))
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0)
  return false
}

/**
 * The rdf:Description holding the ISM fields, checked first (§5.1), with the
 * regions to write. `present` are the regions already in the packet, which
 * count when deciding the version and whether the grid may stand alone.
 */
function ismDescription(fields, regions = [], present = []) {
  const all = [...present, ...regions]
  const f = { version: ISM_VERSION, ...fields }
  // §14.9: a file whose regions carry ISM says it follows 0.3.
  if (all.some(r => r.ism && Object.keys(r.ism).length) && versionBefore(f.version, ISM_REGION_VERSION)) f.version = ISM_REGION_VERSION
  const problems = validate(f, all)
  if (problems.length) throw new Error(problems.join(' '))
  for (const r of regions) {
    const c = checkRegion({ unit: 'relative', ...r, notAllowed: Object.keys(r.ism ?? {}).filter(k => !REGION_FIELDS.includes(k)) })
    const wrong = [...c.boundary, ...c.ism, ...c.warnings]
    if (r.unit !== undefined && r.unit !== 'relative') wrong.push('The reference writer writes regions in relative units (§14.6).')
    if (wrong.length) throw new Error(`Region ${r.id ?? r.name ?? regions.indexOf(r) + 1}: ${wrong.join(' ')}`)
  }
  const attrs = ORDER.filter(k => f[k] !== undefined).map(k => `\n        ism:${k}="${escapeXml(f[k])}"`).join('')
  const seq = (k, show) => f[k]
    ? `\n      <ism:${k}>\n        <rdf:Seq>${f[k].map(n => `<rdf:li>${show(n)}</rdf:li>`).join('')}</rdf:Seq>\n      </ism:${k}>`
    : ''
  const body = seq('referenceExtent', n => n) + seq('homography', n => n) + seq('objectBox', n => Math.round(n)) + regionsXml(regions)
  const ns = regions.length
    ? `\n        xmlns:Iptc4xmpExt="${IPTC_EXT_NS}"${regions.some(r => r.roles?.length || r.types?.length) ? `\n        xmlns:xmp="${XMP_NS}"` : ''}`
    : ''
  return `<rdf:Description rdf:about=""
        xmlns:ism="${ISM_NS}"${ns}${attrs}${body ? `>${body}\n    </rdf:Description>` : '/>'}`
}

/** Iptc4xmpExt:ImageRegion with the given regions, structures written as rdf:parseType="Resource". */
function regionsXml(regions) {
  if (!regions.length) return ''
  const I = '\n' + ' '.repeat(10)
  const el = (name, value, pad) => `${pad}<${name}>${escapeXml(value)}</${name}>`
  const alt = (name, text, pad) => `${pad}<${name}><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(text)}</rdf:li></rdf:Alt></${name}>`
  const entities = (name, uris, pad) => uris?.length
    ? `${pad}<${name}>${pad}  <rdf:Bag>${uris.map(u => `${pad}    <rdf:li rdf:parseType="Resource">${pad}      <xmp:Identifier><rdf:Bag><rdf:li>${escapeXml(u)}</rdf:li></rdf:Bag></xmp:Identifier>${TERM_NAMES[u] ? alt('Iptc4xmpExt:Name', TERM_NAMES[u], `${pad}      `) : ''}${pad}    </rdf:li>`).join('')}${pad}  </rdf:Bag>${pad}</${name}>`
    : ''
  const items = regions.map(r => {
    const b = I + '  '
    const boundary = [el('Iptc4xmpExt:rbShape', r.shape, b + '  '), el('Iptc4xmpExt:rbUnit', 'relative', b + '  ')]
    if (r.shape === 'rectangle') for (const [k, v] of [['rbX', r.x], ['rbY', r.y], ['rbW', r.w], ['rbH', r.h]]) boundary.push(el(`Iptc4xmpExt:${k}`, v, b + '  '))
    if (r.shape === 'circle') for (const [k, v] of [['rbX', r.x], ['rbY', r.y], ['rbRx', r.rx]]) boundary.push(el(`Iptc4xmpExt:${k}`, v, b + '  '))
    if (r.shape === 'polygon') {
      const p = b + '    '
      boundary.push(`${b}  <Iptc4xmpExt:rbVertices>${p}<rdf:Seq>${r.vertices.map(v => `${p}  <rdf:li rdf:parseType="Resource"><Iptc4xmpExt:rbX>${v.x}</Iptc4xmpExt:rbX><Iptc4xmpExt:rbY>${v.y}</Iptc4xmpExt:rbY></rdf:li>`).join('')}${p}</rdf:Seq>${b}  </Iptc4xmpExt:rbVertices>`)
    }
    return `${I}<rdf:li rdf:parseType="Resource">`
      + (r.id !== undefined ? el('Iptc4xmpExt:rId', r.id, b) : '')
      + (r.name !== undefined ? alt('Iptc4xmpExt:Name', r.name, b) : '')
      + `${b}<Iptc4xmpExt:RegionBoundary rdf:parseType="Resource">${boundary.join('')}${b}</Iptc4xmpExt:RegionBoundary>`
      + entities('Iptc4xmpExt:rRole', r.roles, b)
      + entities('Iptc4xmpExt:rCtype', r.types, b)
      + REGION_FIELDS.filter(k => r.ism?.[k] !== undefined).map(k => Array.isArray(r.ism[k])
        ? `${b}<ism:${k}><rdf:Seq>${r.ism[k].map(n => `<rdf:li>${n}</rdf:li>`).join('')}</rdf:Seq></ism:${k}>`
        : el(`ism:${k}`, r.ism[k], b)).join('')
      + `${I}</rdf:li>`
  }).join('')
  return `\n      <Iptc4xmpExt:ImageRegion>\n        <rdf:Bag>${items}\n        </rdf:Bag>\n      </Iptc4xmpExt:ImageRegion>`
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
  const prefixes = ismPrefixes(out)
  if (prefixes.size) {
    // Only the image's own ISM is replaced; ISM inside an image region belongs
    // to the region and stays where it is.
    const { attrs, elements } = topLevelProperties(out)
    const old = [...attrs, ...elements].filter(x => ismField(x.name, prefixes)).sort((a, b) => b.start - a.start)
    for (const { start, end } of old) out = out.slice(0, start) + out.slice(end)
    // A binding goes only when nothing left in the packet uses it.
    for (const p of prefixes) {
      const q = p.replace(/[.-]/g, '\\$&')
      if (!new RegExp(`[<\\s/]${q}:\\w`).test(out)) out = out.replace(new RegExp(`\\sxmlns:${q}\\s*=\\s*("[^"]*"|'[^']*')`, 'g'), '')
    }
    out = out
      // A Description left with nothing but rdf:about goes too.
      .replace(/<rdf:Description\s+rdf:about=(""|'')\s*\/>/g, '')
      .replace(/<rdf:Description\s+rdf:about=(""|'')\s*>\s*<\/rdf:Description>/g, '')
  }
  // Regions already in the packet stay as they are, and count for the version and the grid (§14.9).
  out = out.replace(/<\/rdf:RDF>/, `  ${ismDescription(fields, [], parseRegions(xmp))}\n  </rdf:RDF>`)
  // One packet wrapper: the file's own, if it had one, makes way for ours.
  return wrapPacket(out.replace(/<\?xpacket[\s\S]*?\?>/g, '').trim())
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

// ── Models (§13) ──────────────────────────────────────────────────────────────
//
// A model carries ISM in glTF's own XMP extension, KHR_xmp_json_ld: the packet
// the asset points at, written as JSON-LD (§13.2). The pixel grid of an image
// becomes the model's extent and a hash of its vertices (§13.1), and the
// reader decides from them whether the scale still holds (§13.4).

const KHR_XMP = 'KHR_xmp_json_ld'
const GLB_MAGIC = 0x46546c67 // "glTF"
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942

/**
 * A glTF asset from its bytes: a GLB, or a .gltf whose buffers are data: URIs.
 * Returns { json, buffers, glb }; throws on what it cannot read. A .gltf whose
 * buffers lie in other files cannot be read from its bytes alone.
 */
export function readGltf(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  let json, bin = null, glb = false
  if (u8.length >= 12 && dv.getUint32(0, true) === GLB_MAGIC) {
    glb = true
    if (dv.getUint32(4, true) !== 2) throw new Error('Only glTF 2.0 is read.')
    let o = 12
    while (o + 8 <= u8.length) {
      const len = dv.getUint32(o, true), type = dv.getUint32(o + 4, true)
      const data = u8.subarray(o + 8, o + 8 + len)
      if (type === CHUNK_JSON && json === undefined) json = JSON.parse(new TextDecoder('utf-8').decode(data))
      else if (type === CHUNK_BIN && bin === null) bin = data
      o += 8 + len
    }
    if (json === undefined) throw new Error('The GLB has no JSON chunk.')
  } else {
    json = JSON.parse(new TextDecoder('utf-8').decode(u8))
  }
  if (!json.asset || !String(json.asset.version).startsWith('2.')) throw new Error('Only glTF 2.0 is read.')
  const buffers = (json.buffers ?? []).map((b, i) => {
    if (b.uri === undefined) {
      if (glb && i === 0 && bin) return bin
      throw new Error(`Buffer ${i} has no data.`)
    }
    const m = /^data:[^,]*;base64,(.*)$/.exec(b.uri)
    if (!m) throw new Error(`Buffer ${i} lies in another file (${b.uri}); read the model with its buffers inlined, or as a GLB.`)
    return base64Bytes(m[1])
  })
  return { json, buffers, glb }
}

/** A GLB from a glTF's JSON and its binary chunk (§13.2): JSON padded with spaces, BIN with zeros. */
export function writeGlb(json, bin) {
  const text = new TextEncoder().encode(JSON.stringify(json))
  const jsonChunk = padTo4(text, 0x20)
  const binChunk = bin && bin.length ? padTo4(bin, 0) : null
  const total = 12 + 8 + jsonChunk.length + (binChunk ? 8 + binChunk.length : 0)
  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, GLB_MAGIC, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true)
  dv.setUint32(12, jsonChunk.length, true); dv.setUint32(16, CHUNK_JSON, true)
  out.set(jsonChunk, 20)
  if (binChunk) {
    const o = 20 + jsonChunk.length
    dv.setUint32(o, binChunk.length, true); dv.setUint32(o + 4, CHUNK_BIN, true)
    out.set(binChunk, o + 8)
  }
  return out
}

function padTo4(u8, fill) {
  const n = (u8.length + 3) & ~3
  if (n === u8.length) return u8
  const out = new Uint8Array(n).fill(fill)
  out.set(u8)
  return out
}

function base64Bytes(b64) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// ── The geometry: extent and hash (§13.3) ─────────────────────────────────────

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }

/**
 * An accessor's values as a Float32Array, decoded as the glTF specification
 * decodes them: normalized integers to their fractions, sparse values put in.
 */
function accessorFloats(gltf, index) {
  const { json, buffers } = gltf
  const a = json.accessors?.[index]
  if (!a) throw new Error(`Accessor ${index} does not exist.`)
  const n = COMPONENTS[a.type], size = COMPONENT_BYTES[a.componentType]
  if (!n || !size) throw new Error(`Accessor ${index} has a type this reader does not know.`)
  const out = new Float32Array(a.count * n)
  const decode = (dv, o, type, normalized) => {
    switch (type) {
      case 5126: return dv.getFloat32(o, true)
      case 5120: { const c = dv.getInt8(o); return normalized ? Math.max(c / 127, -1) : c }
      case 5121: { const c = dv.getUint8(o); return normalized ? c / 255 : c }
      case 5122: { const c = dv.getInt16(o, true); return normalized ? Math.max(c / 32767, -1) : c }
      case 5123: { const c = dv.getUint16(o, true); return normalized ? c / 65535 : c }
      case 5125: return dv.getUint32(o, true)
    }
  }
  const view = (viewIndex) => {
    const bv = json.bufferViews?.[viewIndex]
    if (!bv) throw new Error(`Buffer view ${viewIndex} does not exist.`)
    if (bv.extensions && (bv.extensions.EXT_meshopt_compression || bv.extensions.KHR_meshopt_compression)) {
      throw new Error('The geometry is meshopt-compressed; this reader cannot decode it.')
    }
    const buf = buffers[bv.buffer]
    if (!buf) throw new Error(`Buffer ${bv.buffer} does not exist.`)
    return { dv: new DataView(buf.buffer, buf.byteOffset + (bv.byteOffset ?? 0), bv.byteLength), stride: bv.byteStride }
  }
  if (a.bufferView !== undefined) {
    const { dv, stride } = view(a.bufferView)
    const step = stride || n * size
    const base = a.byteOffset ?? 0
    for (let i = 0; i < a.count; i++) {
      for (let c = 0; c < n; c++) out[i * n + c] = decode(dv, base + i * step + c * size, a.componentType, a.normalized)
    }
  }
  if (a.sparse) {
    const s = a.sparse
    const iv = view(s.indices.bufferView), vv = view(s.values.bufferView)
    const isize = COMPONENT_BYTES[s.indices.componentType]
    for (let k = 0; k < s.count; k++) {
      const i = decode(iv.dv, (s.indices.byteOffset ?? 0) + k * isize, s.indices.componentType, false)
      for (let c = 0; c < n; c++) out[i * n + c] = decode(vv.dv, (s.values.byteOffset ?? 0) + (k * n + c) * size, a.componentType, a.normalized)
    }
  }
  return out
}

/** A node's own matrix, column-major, from `matrix` or from translation, rotation and scale. */
function localMatrix(node) {
  if (node.matrix) return node.matrix.slice()
  const [tx, ty, tz] = node.translation ?? [0, 0, 0]
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = node.scale ?? [1, 1, 1]
  return [
    (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
    (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
    (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ]
}

function multiply(a, b) {
  const out = new Array(16)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]
  }
  return out
}

/**
 * The model's geometry as ISM sees it (§13.3):
 *
 * - `extent`: the width, height and depth, in the model's units, of the box
 *   around every vertex of the scene, after every node's transform.
 * - `hash`: SHA-256, in hex, of every POSITION value of every primitive of
 *   every mesh, in the order the file lists them, each as a little-endian
 *   32-bit float. Transforms are not in it: the hash says whether the vertices
 *   are the ones measured, the extent whether the size still holds.
 * - `vertexCount`: how many vertices went into the hash.
 */
export function modelGeometry(gltf) {
  const { json } = gltf
  for (const name of json.extensionsRequired ?? []) {
    if (name === 'KHR_draco_mesh_compression' || name === 'EXT_meshopt_compression' || name === 'KHR_meshopt_compression') {
      throw new Error(`The geometry is compressed (${name}); this reader cannot decode it.`)
    }
  }
  const positions = new Map() // accessor index → Float32Array
  const meshPositions = []
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.extensions?.KHR_draco_mesh_compression) throw new Error('The geometry is Draco-compressed; this reader cannot decode it.')
      const idx = prim.attributes?.POSITION
      if (idx === undefined) continue
      if (!positions.has(idx)) positions.set(idx, accessorFloats(gltf, idx))
      meshPositions.push(positions.get(idx))
    }
  }
  const vertexCount = meshPositions.reduce((n, p) => n + p.length / 3, 0)
  if (!vertexCount) throw new Error('The model has no vertices.')
  const bytes = new Uint8Array(vertexCount * 12)
  const out = new DataView(bytes.buffer)
  let o = 0
  for (const p of meshPositions) for (let i = 0; i < p.length; i++, o += 4) out.setFloat32(o, p[i], true)

  // The extent: the scene's nodes, from its roots, with each node's world transform.
  const nodes = json.nodes ?? []
  let roots
  if (json.scenes?.length) roots = json.scenes[json.scene ?? 0]?.nodes ?? []
  else {
    const children = new Set(nodes.flatMap(n => n.children ?? []))
    roots = nodes.map((_, i) => i).filter(i => !children.has(i))
  }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  const visit = (i, parent, seen) => {
    if (seen.has(i)) throw new Error('The node hierarchy has a cycle.')
    const node = nodes[i]
    if (!node) throw new Error(`Node ${i} does not exist.`)
    const world = multiply(parent, localMatrix(node))
    if (node.mesh !== undefined) {
      for (const prim of json.meshes[node.mesh].primitives ?? []) {
        const p = positions.get(prim.attributes?.POSITION)
        if (!p) continue
        for (let v = 0; v < p.length; v += 3) {
          const x = p[v], y = p[v + 1], z = p[v + 2]
          for (let r = 0; r < 3; r++) {
            const w = world[r] * x + world[4 + r] * y + world[8 + r] * z + world[12 + r]
            if (w < min[r]) min[r] = w
            if (w > max[r]) max[r] = w
          }
        }
      }
    }
    for (const c of node.children ?? []) visit(c, world, new Set(seen).add(i))
  }
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  for (const r of roots) visit(r, identity, new Set())
  if (!Number.isFinite(min[0])) throw new Error('No mesh in the scene.')
  return { extent: [0, 1, 2].map(r => max[r] - min[r]), hash: sha256Hex(bytes), vertexCount }
}

// ── The fields in the file (§13.2) ────────────────────────────────────────────

/** The packet the asset points at, in KHR_xmp_json_ld, or null. */
export function assetPacket(json) {
  const i = json.asset?.extensions?.[KHR_XMP]?.packet
  return i === undefined ? null : json.extensions?.[KHR_XMP]?.packets?.[i] ?? null
}

/** The prefix a JSON-LD packet binds to the ISM namespace, or null. */
function ismPrefix(packet) {
  const ctx = packet?.['@context']
  if (!ctx || typeof ctx !== 'object') return null
  return Object.keys(ctx).find(k => ctx[k] === ISM_NS) ?? null
}

/**
 * The ISM fields in a JSON-LD packet (§13.2), typed as parseIsm types them, or
 * null. The prefix is whatever the packet's @context binds to the namespace.
 */
export function parseIsmJsonLd(packet) {
  const p = ismPrefix(packet)
  if (!p) return null
  const fields = {}
  for (const [key, value] of Object.entries(packet)) {
    if (!key.startsWith(p + ':')) continue
    const name = key.slice(p.length + 1)
    if (SEQS.includes(name)) fields[name] = (value?.['@list'] ?? []).map(Number)
    else if (REALS.includes(name) || INTEGERS.includes(name)) fields[name] = Number(value)
    else if (TEXTS.includes(name)) fields[name] = String(value)
  }
  return Object.keys(fields).length ? fields : null
}

/** The ISM fields of a glTF asset (readGltf), or null. */
export function modelIsm(gltf) {
  return parseIsmJsonLd(assetPacket(gltf.json))
}

/**
 * The model's scale as the file is now (§13.4): millimetres per model unit,
 * or the reason there is none. `geometry` is modelGeometry of the same file.
 *
 * The extents are compared sorted, so a model turned by quarter turns — from
 * Y up to Z up, as many programs do on import — keeps its scale.
 *
 * - `geometry: 'measured'` — the vertices are the ones measured (the hash agrees).
 * - `geometry: 'changed'` — they are not, but the size is: the scale holds.
 * - `rescaled: true` — every extent changed by the same factor, as when the
 *   units were changed; the scale is divided by that factor.
 * - `sizeMm` — the model's extent along its own axes, in millimetres.
 */
export function modelScaleFor(fields, geometry) {
  const problems = validate(fields)
  if (problems.length) return { ok: false, reason: problems.join(' ') }
  if (!isModelFields(fields)) return { ok: false, reason: 'These fields describe an image, not a model.' }
  const ref = [...fields.referenceExtent].sort((a, b) => a - b)
  const cur = [...geometry.extent].sort((a, b) => a - b)
  const ratios = cur.map((c, i) => c / ref[i])
  const same = geometry.hash === fields.geometryHash ? 'measured' : 'changed'
  // Turned when the axes no longer line up one to one, whatever the factor.
  const turnedAt = k => !geometry.extent.every((c, i) => Math.abs(c / fields.referenceExtent[i] / k - 1) <= ASPECT_TOLERANCE)
  const done = (scale, k, rest) => ({
    ok: true, scale, geometry: same, turned: turnedAt(k), sizeMm: geometry.extent.map(e => e * scale), ...rest,
  })
  if (ratios.every(r => Math.abs(r - 1) <= ASPECT_TOLERANCE)) return done(fields.scale, 1, { rescaled: false })
  const k = ratios[2]
  if (ratios.every(r => Math.abs(r / k - 1) <= ASPECT_TOLERANCE)) return done(fields.scale / k, k, { rescaled: true, factor: k })
  const show = e => e.map(n => Number(n.toPrecision(4))).join(' × ')
  return {
    ok: false,
    reason: `The model's extent is ${show(geometry.extent)} units but the scale was set on ${show(fields.referenceExtent)}, in other proportions. It has been cut or changed since, so the scale no longer applies.`,
  }
}

/**
 * The model with ISM written into it (§13.5), as a GLB or as .gltf text, as it
 * came. The writer works out referenceExtent and geometryHash from the file
 * itself; the caller gives the scale and how it was obtained. Other metadata in
 * the asset's packet is kept, and ISM already there is replaced.
 */
export function writeModelIsm(bytes, fields) {
  const gltf = readGltf(bytes)
  const geometry = modelGeometry(gltf)
  const { referenceExtent: _e, geometryHash: _h, ...given } = fields
  const f = { version: ISM_VERSION, ...given, referenceExtent: geometry.extent, geometryHash: geometry.hash }
  const problems = validate(f)
  if (problems.length) throw new Error(problems.join(' '))

  const json = structuredClone(gltf.json)
  json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), KHR_XMP])]
  json.extensions ??= {}
  json.extensions[KHR_XMP] ??= { packets: [] }
  const packets = json.extensions[KHR_XMP].packets ??= []
  json.asset.extensions ??= {}
  let index = json.asset.extensions[KHR_XMP]?.packet
  if (index === undefined || !packets[index]) {
    packets.push({ '@context': {}, '@id': '' })
    index = packets.length - 1
    json.asset.extensions[KHR_XMP] = { packet: index }
  }
  const packet = packets[index]
  packet['@context'] ??= {}
  let p = ismPrefix(packet)
  if (p) for (const key of Object.keys(packet)) if (key.startsWith(p + ':')) delete packet[key]
  if (!p) {
    p = 'ism'
    for (let n = 1; packet['@context'][p] !== undefined; n++) p = `ism${n}`
    packet['@context'][p] = ISM_NS
  }
  for (const k of ['version', 'scale', 'referenceExtent', ...ORDER.filter(k => !['version', 'scale', 'referenceWidth', 'referenceHeight'].includes(k))]) {
    if (f[k] === undefined) continue
    packet[`${p}:${k}`] = SEQS.includes(k) ? { '@list': f[k] } : f[k]
  }
  if (gltf.glb) return writeGlb(json, gltf.buffers[0] && json.buffers?.[0]?.uri === undefined ? gltf.buffers[0] : null)
  return new TextEncoder().encode(JSON.stringify(json, null, 2))
}

/** The ISM fields of a model file, its geometry and the reading, all at once. */
export function readModel(bytes) {
  const gltf = readGltf(bytes)
  const fields = modelIsm(gltf)
  const geometry = modelGeometry(gltf)
  return { fields, geometry, reading: fields ? modelScaleFor(fields, geometry) : null }
}

// ── SHA-256 (FIPS 180-4), so the library stays without dependencies ──────────

const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

/** SHA-256 of the bytes, as 64 lower-case hexadecimal digits. */
export function sha256Hex(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const bitLen = u8.length * 8
  const padded = new Uint8Array(((u8.length + 9 + 63) >> 6) << 6)
  padded.set(u8)
  padded[u8.length] = 0x80
  const pdv = new DataView(padded.buffer)
  pdv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000))
  pdv.setUint32(padded.length - 4, bitLen >>> 0)
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const w = new Uint32Array(64)
  const rotr = (x, n) => (x >>> n) | (x << (32 - n))
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = pdv.getUint32(off + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) >>> 0
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh
  }
  return [...h].map(x => x.toString(16).padStart(8, '0')).join('')
}
