"""Image Scale Metadata (ISM) — the reference reader and writer for Python.

The format: https://w3id.org/ism/ — a small set of XMP fields that carry how
many millimetres one pixel covers on the object, which pixel grid that holds
for, how the scale was obtained and how certain it is.

    import ism

    fields = ism.read(open("object.jpg", "rb").read())
    print(fields["scale"], "mm per pixel")

    ok, scale, why = ism.scale_for(fields, width, height)
    if ok:
        bar_px = 50 / scale          # a 50 mm bar, in pixels

Writing into a file that has none:

    data = open("old.jpg", "rb").read()
    packet = ism.merge_into_xmp(ism.find_xmp(data), {
        "scale": 0.0428, "referenceWidth": 1509, "referenceHeight": 1509,
        "method": "ruler", "uncertainty": 0.004,
    })
    open("new.jpg", "wb").write(ism.embed_xmp(data, packet))

Nothing outside the standard library is needed, and the file's own metadata —
title, rights, camera — is kept when ISM is merged into an existing packet.

MIT licence. The JavaScript implementation in js/ism.js is the same logic; the
two are kept in step by the test files in testfiles/.
"""

from __future__ import annotations

import re
import struct
import zlib
from typing import Any, Iterable

__all__ = [
    "ISM_NS", "ISM_VERSION", "METHODS", "ASPECT_TOLERANCE",
    "find_xmp", "parse", "read", "validate", "scale_for", "nice_length", "format_mm",
    "write_xmp", "merge_into_xmp", "embed_xmp", "size_of",
    "is_model_fields", "read_gltf", "write_glb", "model_geometry", "asset_packet", "parse_json_ld",
    "model_ism", "model_scale_for", "write_model", "read_model",
]

#: The namespace keeps its address through 0.x: 0.2 only adds (§4).
ISM_NS = "https://w3id.org/ism/0.1/"
ISM_VERSION = "0.2"
METHODS = ("ruler", "calipers", "target", "optics", "scanner", "ct", "other")

#: How far two aspect ratios may differ and still count as the same picture (§6.3).
ASPECT_TOLERANCE = 0.005

CORE = ("scale", "referenceWidth", "referenceHeight", "version")
#: A model's core (§13.1).
MODEL_CORE = ("version", "scale", "referenceExtent", "geometryHash")
REALS = ("scale", "uncertainty", "objectWidthMm", "objectHeightMm", "objectThicknessMm")
INTEGERS = ("referenceWidth", "referenceHeight")
TEXTS = ("version", "method", "methodNote", "measuredBy", "measuredAt", "software", "plane", "geometryHash")
#: The fields written as an rdf:Seq of numbers.
SEQS = ("objectBox", "referenceExtent")

_PNG_XMP_KEYWORD = b"XML:com.adobe.xmp"
_JPEG_XMP_HEADER = b"http://ns.adobe.com/xap/1.0/\x00"


# ── Finding the packet ───────────────────────────────────────────────────────

def find_xmp(data: bytes) -> str | None:
    """The XMP packet of a file, taken from where the format keeps it (§4.0).

    A file can hold bytes that look like a packet but are not the one in force —
    a TIFF whose XMP tag was repointed, say — so the format is asked first and
    the plain scan is only the fallback (WebP, HEIF and the rest).
    """
    if data[:2] == b"\xff\xd8":
        return _xmp_from_jpeg(data)
    if data[:2] == b"\x89P":
        return _xmp_from_png(data)
    if data[:2] in (b"II", b"MM"):
        return _xmp_from_tiff(data)
    return _scan_for_xmp(data)


def _scan_for_xmp(data: bytes) -> str | None:
    start = data.find(b"<x:xmpmeta")
    if start < 0:
        return None
    end = data.find(b"</x:xmpmeta>", start)
    if end < 0:
        return None
    return data[start:end + len(b"</x:xmpmeta>")].decode("utf-8", "replace")


def _xmp_from_jpeg(data: bytes) -> str | None:
    i = 2
    while i + 4 <= len(data) and data[i] == 0xFF:
        marker = data[i + 1]
        if marker == 0xDA:  # start of scan: the rest is image data
            break
        length = int.from_bytes(data[i + 2:i + 4], "big")
        if marker == 0xE1 and data[i + 4:i + 4 + len(_JPEG_XMP_HEADER)] == _JPEG_XMP_HEADER:
            return data[i + 4 + len(_JPEG_XMP_HEADER):i + 2 + length].decode("utf-8", "replace")
        i += 2 + length
    return None


def _xmp_from_png(data: bytes) -> str | None:
    i = 8
    while i + 8 <= len(data):
        length = int.from_bytes(data[i:i + 4], "big")
        kind = data[i + 4:i + 8]
        if kind == b"iTXt" and data[i + 8:i + 8 + len(_PNG_XMP_KEYWORD)] == _PNG_XMP_KEYWORD:
            at = i + 8 + len(_PNG_XMP_KEYWORD)
            # keyword \0 flag method language \0 translated \0 text
            if data[at] == 0 and data[at + 1] == 0:
                p = at + 3
                skipped = 0
                while skipped < 2 and p < len(data):
                    if data[p] == 0:
                        skipped += 1
                    p += 1
                return data[p:i + 8 + length].decode("utf-8", "replace")
        if kind == b"IEND":
            break
        i += 12 + length
    return None


def _xmp_from_tiff(data: bytes) -> str | None:
    little = data[:2] == b"II"
    end = "<" if little else ">"
    if struct.unpack_from(end + "H", data, 2)[0] != 42:
        return None
    ifd = struct.unpack_from(end + "I", data, 4)[0]
    if ifd + 2 > len(data):
        return None
    count = struct.unpack_from(end + "H", data, ifd)[0]
    for n in range(count):
        at = ifd + 2 + n * 12
        tag = struct.unpack_from(end + "H", data, at)[0]
        if tag != 700:
            continue
        length = struct.unpack_from(end + "I", data, at + 4)[0]
        offset = at + 8 if length <= 4 else struct.unpack_from(end + "I", data, at + 8)[0]
        if offset + length > len(data):
            return None
        return data[offset:offset + length].decode("utf-8", "replace")
    return None


# ── Reading the fields ───────────────────────────────────────────────────────

def _unescape(text: str) -> str:
    out = (text.replace("&lt;", "<").replace("&gt;", ">")
           .replace("&quot;", '"').replace("&apos;", "'"))
    out = re.sub(r"&#(\d+);", lambda m: chr(int(m.group(1))), out)
    return out.replace("&amp;", "&")


def parse(xmp: str | None) -> dict[str, Any] | None:
    """The ISM fields in a packet, typed, or None when it has none.

    The prefix is whatever the packet binds to the namespace, not assumed to be
    ``ism``; both XMP forms are read — attributes on rdf:Description and child
    elements — and objectBox as an rdf:Seq.
    """
    if not xmp:
        return None
    binding = re.search(r'xmlns:([A-Za-z_][\w.-]*)\s*=\s*["\']%s["\']' % re.escape(ISM_NS), xmp)
    if not binding:
        return None
    p = binding.group(1)
    raw: dict[str, str] = {}
    for m in re.finditer(r'\b%s:(\w+)\s*=\s*"([^"]*)"' % p, xmp):
        raw[m.group(1)] = _unescape(m.group(2))
    for m in re.finditer(r"\b%s:(\w+)\s*=\s*'([^']*)'" % p, xmp):
        raw[m.group(1)] = _unescape(m.group(2))
    for m in re.finditer(r"<%s:(\w+)>([^<]*)</%s:\1>" % (p, p), xmp):
        raw[m.group(1)] = _unescape(m.group(2).strip())

    fields: dict[str, Any] = {}
    for key in TEXTS:
        if key in raw:
            fields[key] = raw[key]
    for key in REALS:
        if key in raw:
            fields[key] = _number(raw[key])
    for key in INTEGERS:
        if key in raw:
            fields[key] = _number(raw[key])

    for key in SEQS:
        seq = re.search(r"<%s:%s>(.*?)</%s:%s>" % (p, key, p, key), xmp, re.S)
        if seq:
            fields[key] = [_number(v) for v in re.findall(r"<rdf:li>\s*([^<]*?)\s*</rdf:li>", seq.group(1))]
    return fields or None


def read(data: bytes) -> dict[str, Any] | None:
    """The ISM fields in a file's bytes, or None."""
    return parse(find_xmp(data))


def _number(text: str) -> Any:
    try:
        value = float(text)
    except (TypeError, ValueError):
        return float("nan")
    return int(value) if value.is_integer() and "." not in text and "e" not in text.lower() else value


# ── Checking them ────────────────────────────────────────────────────────────

def is_model_fields(fields: dict[str, Any] | None) -> bool:
    """Whether the fields describe a model (§13) rather than an image."""
    return bool(fields) and ("referenceExtent" in fields or "geometryHash" in fields)


def validate(fields: dict[str, Any] | None) -> list[str]:
    """Problems with the fields themselves, before any image or model is involved (§4, §6.1, §13.1)."""
    if not fields:
        return ["No Image Scale Metadata in the file."]
    problems: list[str] = []
    model = is_model_fields(fields)
    if model and ("referenceWidth" in fields or "referenceHeight" in fields):
        problems.append("The fields carry both a pixel grid and a model extent; they describe either an image or a model.")
    missing = [k for k in (MODEL_CORE if model else CORE) if k not in fields]
    if missing:
        problems.append("Missing required field%s: %s." % ("s" if len(missing) > 1 else "", ", ".join(missing)))
    scale = fields.get("scale")
    if scale is not None and not (_finite(scale) and scale > 0):
        problems.append("scale must be a number above 0.")
    for key in INTEGERS:
        value = fields.get(key)
        if value is not None and not (isinstance(value, int) and not isinstance(value, bool) and value > 0):
            problems.append("%s must be a whole number above 0." % key)
    method = fields.get("method")
    if method is not None and method not in METHODS:
        problems.append('method "%s" is not one of %s.' % (method, ", ".join(METHODS)))
    uncertainty = fields.get("uncertainty")
    if uncertainty is not None and not (_finite(uncertainty) and uncertainty >= 0):
        problems.append("uncertainty must be a number of 0 or more.")
    box = fields.get("objectBox")
    if box is not None and not (len(box) == 4 and all(_finite(n) for n in box)):
        problems.append("objectBox must hold four numbers: x, y, width, height.")
    extent = fields.get("referenceExtent")
    if extent is not None and not (isinstance(extent, (list, tuple)) and len(extent) == 3
                                   and all(_finite(n) and n > 0 for n in extent)):
        problems.append("referenceExtent must hold three numbers above 0: x, y, z.")
    digest = fields.get("geometryHash")
    if digest is not None and not (isinstance(digest, str) and re.fullmatch(r"[0-9a-f]{64}", digest)):
        problems.append("geometryHash must be a SHA-256 written as 64 lower-case hexadecimal digits.")
    return problems


def _finite(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value == value and value not in (float("inf"), float("-inf"))


# ── The reading rules ────────────────────────────────────────────────────────

def scale_for(fields: dict[str, Any] | None, width: int, height: int) -> tuple[bool, float | None, str | None]:
    """The scale for the image as it is now (§6).

    Returns ``(ok, mm_per_pixel, why_not)``. The scale is refused — rather than
    guessed — when the picture no longer has the shape it was measured on.
    """
    problems = validate(fields)
    if problems:
        return False, None, " ".join(problems)
    assert fields is not None
    if is_model_fields(fields):
        return False, None, "These fields describe a three-dimensional model, not an image."
    rw, rh = fields["referenceWidth"], fields["referenceHeight"]
    if (width, height) == (rw, rh) or (width, height) == (rh, rw):
        return True, fields["scale"], None
    for w, h in ((width, height), (height, width)):
        if h and rh and abs(w / h - rw / rh) / (rw / rh) <= ASPECT_TOLERANCE:
            return True, fields["scale"] * rw / w, None
    return False, None, (
        "The image is %d × %d px but the scale was set on %d × %d px, with a different shape. "
        "It has been cropped or changed since, so the scale no longer applies." % (width, height, rw, rh)
    )


def nice_length(scale_mm_per_px: float, target_px: float) -> tuple[float, float]:
    """A round length for a scale bar no longer than ``target_px``.

    Returns ``(millimetres, pixels)`` — the same answer as the JavaScript
    implementation, so a bar drawn by one is the bar drawn by the other.
    """
    from math import floor, log10
    target = scale_mm_per_px * target_px
    base = 10 ** floor(log10(target)) if target > 0 else 1
    fitting = [m * base for m in (1, 2, 5, 10) if m * base <= target]
    step = fitting[-1] if fitting else base
    return step, step / scale_mm_per_px


def format_mm(mm: float) -> str:
    """A measurement written the way a person reads it, as the viewer writes it."""
    if mm >= 10:
        return "%s mm" % _trim(round(mm, 1))
    if mm >= 1:
        return "%s mm" % _trim(round(mm, 2))
    um = mm * 1000
    return "%s \u00b5m" % _trim(round(um, 0 if um >= 100 else 1))


def _trim(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else str(value)


# ── Writing ──────────────────────────────────────────────────────────────────

_ORDER = ("version", "scale", "referenceWidth", "referenceHeight", "geometryHash", "method", "methodNote",
          "uncertainty", "measuredBy", "measuredAt", "software", "plane", "objectWidthMm", "objectHeightMm",
          "objectThicknessMm")


def _escape(value: Any) -> str:
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return (str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;").replace("'", "&apos;"))


def _description(fields: dict[str, Any]) -> str:
    f = {"version": ISM_VERSION, **fields}
    problems = validate(f)
    if problems:
        raise ValueError(" ".join(problems))
    attrs = "".join('\n        ism:%s="%s"' % (k, _escape(f[k])) for k in _ORDER if k in f)
    inner = ""
    for key, show in (("referenceExtent", _js_number), ("objectBox", lambda n: "%d" % round(n))):
        if f.get(key):
            items = "".join("<rdf:li>%s</rdf:li>" % show(n) for n in f[key])
            inner += "\n      <ism:%s>\n        <rdf:Seq>%s</rdf:Seq>\n      </ism:%s>" % (key, items, key)
    if inner:
        inner += "\n    "
    open_tag = '<rdf:Description rdf:about=""\n        xmlns:ism="%s"%s' % (ISM_NS, attrs)
    return open_tag + (">%s</rdf:Description>" % inner if inner else "/>")


def _js_number(value: float) -> str:
    """A number written as JavaScript writes it (Number::toString), so both writers give the same bytes."""
    from decimal import Decimal
    value = float(value)
    if value == 0:
        return "0"
    sign = "-" if value < 0 else ""
    t = Decimal(repr(abs(value))).normalize().as_tuple()
    digits = "".join(map(str, t.digits))
    k, n = len(digits), len(digits) + t.exponent
    if k <= n <= 21:
        return sign + digits + "0" * (n - k)
    if 0 < n <= 21:
        return sign + digits[:n] + "." + digits[n:]
    if -6 < n <= 0:
        return sign + "0." + "0" * -n + digits
    e = n - 1
    return sign + digits[0] + ("." + digits[1:] if k > 1 else "") + "e" + ("+" if e >= 0 else "-") + str(abs(e))


def write_xmp(fields: dict[str, Any]) -> str:
    """A complete XMP packet holding these fields and nothing else."""
    return _wrap('<x:xmpmeta xmlns:x="adobe:ns:meta/">\n'
                 '  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n'
                 '    %s\n'
                 '  </rdf:RDF>\n'
                 '</x:xmpmeta>' % _description(fields))


def _wrap(xmpmeta: str) -> str:
    return ('<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>\n%s\n<?xpacket end="w"?>' % xmpmeta)


def merge_into_xmp(xmp: str | None, fields: dict[str, Any]) -> str:
    """ISM set in an existing packet, with everything else in it kept (§5).

    The file's own title, rights, keywords and camera data survive; ISM fields
    already there are replaced rather than duplicated. Pass ``None`` for a file
    that has no packet yet.
    """
    if not xmp or "<rdf:RDF" not in xmp:
        return write_xmp(fields)

    binding = re.search(r'xmlns:([A-Za-z_][\w.-]*)\s*=\s*["\']%s["\']' % re.escape(ISM_NS), xmp)
    if binding:
        p = binding.group(1)
        # Drop the old ISM: attributes, child elements, and the objectBox Seq.
        xmp = re.sub(r"<%s:(objectBox|referenceExtent)>.*?</%s:\1>" % (p, p), "", xmp, flags=re.S)
        xmp = re.sub(r"<%s:(\w+)>[^<]*</%s:\1>" % (p, p), "", xmp)
        xmp = re.sub(r'\s*\b%s:(\w+)\s*=\s*"[^"]*"' % p, "", xmp)
        xmp = re.sub(r"\s*\b%s:(\w+)\s*=\s*'[^']*'" % p, "", xmp)
        xmp = re.sub(r'\s*xmlns:%s\s*=\s*["\']%s["\']' % (p, re.escape(ISM_NS)), "", xmp)
        # An rdf:Description left with nothing but rdf:about goes too.
        xmp = re.sub(r'<rdf:Description\s+rdf:about=""\s*/>', "", xmp)

    at = xmp.rindex("</rdf:RDF>")
    return xmp[:at] + "    " + _description(fields) + "\n  " + xmp[at:]


def embed_xmp(data: bytes, xmp: str) -> bytes:
    """The packet written into whichever of JPEG, PNG or TIFF the bytes are (§4.0)."""
    if data[:2] == b"\xff\xd8":
        return _embed_jpeg(data, xmp)
    if data[:2] == b"\x89P":
        return _embed_png(data, xmp)
    if data[:2] in (b"II", b"MM"):
        return _embed_tiff(data, xmp)
    raise ValueError("Unsupported format: ISM is written into JPEG, PNG or TIFF here")


def _embed_jpeg(data: bytes, xmp: str) -> bytes:
    body = xmp.encode("utf-8")
    length = 2 + len(_JPEG_XMP_HEADER) + len(body)
    if length > 0xFFFF:
        raise ValueError("XMP packet too large for one APP1 segment")
    segment = b"\xff\xe1" + length.to_bytes(2, "big") + _JPEG_XMP_HEADER + body

    parts = [data[:2], segment]
    i = 2
    while i + 4 <= len(data) and data[i] == 0xFF:
        marker = data[i + 1]
        if marker == 0xDA:
            break
        size = int.from_bytes(data[i + 2:i + 4], "big")
        chunk = data[i:i + 2 + size]
        is_xmp = marker == 0xE1 and chunk[4:4 + len(_JPEG_XMP_HEADER)] == _JPEG_XMP_HEADER
        if not is_xmp:
            parts.append(chunk)
        i += 2 + size
    parts.append(data[i:])
    return b"".join(parts)


def _png_chunk(kind: bytes, payload: bytes) -> bytes:
    return (len(payload).to_bytes(4, "big") + kind + payload
            + (zlib.crc32(kind + payload) & 0xFFFFFFFF).to_bytes(4, "big"))


def _embed_png(data: bytes, xmp: str) -> bytes:
    payload = _PNG_XMP_KEYWORD + b"\x00\x00\x00\x00\x00" + xmp.encode("utf-8")
    chunk = _png_chunk(b"iTXt", payload)

    parts = [data[:8]]
    i, written = 8, False
    while i + 8 <= len(data):
        length = int.from_bytes(data[i:i + 4], "big")
        kind = data[i + 4:i + 8]
        whole = data[i:i + 12 + length]
        is_xmp = kind == b"iTXt" and data[i + 8:i + 8 + len(_PNG_XMP_KEYWORD)] == _PNG_XMP_KEYWORD
        if not written and kind in (b"IDAT", b"IEND"):
            parts.append(chunk)
            written = True
        if not is_xmp:
            parts.append(whole)
        i += 12 + length
        if kind == b"IEND":
            break
    if not written:
        raise ValueError("PNG has no IEND")
    return b"".join(parts)


def _embed_tiff(data: bytes, xmp: str) -> bytes:
    little = data[:2] == b"II"
    end = "<" if little else ">"
    if struct.unpack_from(end + "H", data, 2)[0] != 42:
        raise ValueError("Not a TIFF (bad magic)")

    ifd = struct.unpack_from(end + "I", data, 4)[0]
    count = struct.unpack_from(end + "H", data, ifd)[0]
    entries = [data[ifd + 2 + n * 12:ifd + 2 + (n + 1) * 12] for n in range(count)]
    entries = [e for e in entries if struct.unpack_from(end + "H", e, 0)[0] != 700]
    next_ifd = struct.unpack_from(end + "I", data, ifd + 2 + count * 12)[0]

    packet = xmp.encode("utf-8")
    pad = len(packet) % 2  # keep the directory on an even offset
    xmp_at = len(data)
    ifd_at = xmp_at + len(packet) + pad

    entries.append(struct.pack(end + "HHII", 700, 1, len(packet), xmp_at))
    entries.sort(key=lambda e: struct.unpack_from(end + "H", e, 0)[0])

    directory = struct.pack(end + "H", len(entries)) + b"".join(entries) + struct.pack(end + "I", next_ifd)
    out = bytearray(data + packet + b"\x00" * pad + directory)
    struct.pack_into(end + "I", out, 4, ifd_at)  # the header now points at the rebuilt directory
    return bytes(out)


# ── The picture's own size ───────────────────────────────────────────────────

def size_of(data: bytes) -> tuple[int, int] | None:
    """The stored pixel size of a JPEG, PNG or TIFF, or None.

    A reader needs it to apply §6, and it is read here so that nothing outside
    the standard library is required.
    """
    if data[:2] == b"\x89P":
        return struct.unpack_from(">II", data, 16)
    if data[:2] in (b"II", b"MM"):
        little = data[:2] == b"II"
        end = "<" if little else ">"
        ifd = struct.unpack_from(end + "I", data, 4)[0]
        count = struct.unpack_from(end + "H", data, ifd)[0]
        width = height = None
        for n in range(count):
            at = ifd + 2 + n * 12
            tag, kind = struct.unpack_from(end + "HH", data, at)
            value = struct.unpack_from(end + "H", data, at + 8)[0] if kind == 3 else struct.unpack_from(end + "I", data, at + 8)[0]
            if tag == 256:
                width = value
            elif tag == 257:
                height = value
        return (width, height) if width and height else None
    if data[:2] == b"\xff\xd8":
        i = 2
        while i + 4 <= len(data) and data[i] == 0xFF:
            marker = data[i + 1]
            length = int.from_bytes(data[i + 2:i + 4], "big")
            if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                height, width = struct.unpack_from(">HH", data, i + 5)
                return width, height
            if marker == 0xDA:
                break
            i += 2 + length
    return None


# ── Models (§13) ─────────────────────────────────────────────────────────────
#
# A model carries ISM in glTF's own XMP extension, KHR_xmp_json_ld: the packet
# the asset points at, written as JSON-LD (§13.2). The pixel grid of an image
# becomes the model's extent and a hash of its vertices (§13.1), and the
# reader decides from them whether the scale still holds (§13.4).

_KHR_XMP = "KHR_xmp_json_ld"
_GLB_MAGIC = 0x46546C67
_CHUNK_JSON = 0x4E4F534A
_CHUNK_BIN = 0x004E4942
_COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}
_COMPONENT = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
_COMPRESSED = ("KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_meshopt_compression")


def read_gltf(data: bytes) -> dict[str, Any]:
    """A glTF asset from its bytes: a GLB, or a .gltf whose buffers are data: URIs.

    Returns ``{"json": ..., "buffers": [...], "glb": bool}``; raises ValueError on
    what it cannot read.
    """
    import base64
    import json as _json
    glb = False
    bin_chunk = None
    if len(data) >= 12 and struct.unpack_from("<I", data, 0)[0] == _GLB_MAGIC:
        glb = True
        if struct.unpack_from("<I", data, 4)[0] != 2:
            raise ValueError("Only glTF 2.0 is read.")
        doc = None
        o = 12
        while o + 8 <= len(data):
            length, kind = struct.unpack_from("<II", data, o)
            chunk = data[o + 8:o + 8 + length]
            if kind == _CHUNK_JSON and doc is None:
                doc = _json.loads(chunk.decode("utf-8"))
            elif kind == _CHUNK_BIN and bin_chunk is None:
                bin_chunk = chunk
            o += 8 + length
        if doc is None:
            raise ValueError("The GLB has no JSON chunk.")
    else:
        doc = _json.loads(data.decode("utf-8"))
    if not str(doc.get("asset", {}).get("version", "")).startswith("2."):
        raise ValueError("Only glTF 2.0 is read.")
    buffers = []
    for i, b in enumerate(doc.get("buffers", [])):
        if "uri" not in b:
            if glb and i == 0 and bin_chunk is not None:
                buffers.append(bin_chunk)
                continue
            raise ValueError("Buffer %d has no data." % i)
        m = re.match(r"^data:[^,]*;base64,(.*)$", b["uri"], re.S)
        if not m:
            raise ValueError("Buffer %d lies in another file (%s); read the model with its buffers inlined, or as a GLB." % (i, b["uri"]))
        buffers.append(base64.b64decode(m.group(1)))
    return {"json": doc, "buffers": buffers, "glb": glb}


def write_glb(doc: dict[str, Any], bin_chunk: bytes | None) -> bytes:
    """A GLB from a glTF's JSON and its binary chunk: JSON padded with spaces, BIN with zeros."""
    import json as _json
    text = _json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    text += b" " * (-len(text) % 4)
    out = struct.pack("<II", len(text), _CHUNK_JSON) + text
    if bin_chunk:
        bin_chunk = bytes(bin_chunk) + b"\0" * (-len(bin_chunk) % 4)
        out += struct.pack("<II", len(bin_chunk), _CHUNK_BIN) + bin_chunk
    return struct.pack("<III", _GLB_MAGIC, 2, 12 + len(out)) + out


def _accessor_floats(gltf: dict[str, Any], index: int) -> list[float]:
    """An accessor's values, decoded as glTF decodes them and rounded to 32-bit floats."""
    doc, buffers = gltf["json"], gltf["buffers"]
    accessors = doc.get("accessors", [])
    if index >= len(accessors):
        raise ValueError("Accessor %d does not exist." % index)
    a = accessors[index]
    n = _COMPONENTS.get(a["type"])
    if not n or a["componentType"] not in _COMPONENT:
        raise ValueError("Accessor %d has a type this reader does not know." % index)
    fmt, size = _COMPONENT[a["componentType"]]
    normalized = bool(a.get("normalized"))
    divisor = {"b": 127, "B": 255, "h": 32767, "H": 65535}.get(fmt)

    def decode(c: float) -> float:
        if normalized and divisor:
            c = max(c / divisor, -1.0)
        return struct.unpack("<f", struct.pack("<f", c))[0]

    def view(i: int) -> tuple[bytes, int, int | None]:
        bv = doc.get("bufferViews", [])[i]
        ext = bv.get("extensions", {})
        if "EXT_meshopt_compression" in ext or "KHR_meshopt_compression" in ext:
            raise ValueError("The geometry is meshopt-compressed; this reader cannot decode it.")
        return buffers[bv["buffer"]], bv.get("byteOffset", 0), bv.get("byteStride")

    out = [0.0] * (a["count"] * n)
    if "bufferView" in a:
        buf, base, stride = view(a["bufferView"])
        step = stride or n * size
        base += a.get("byteOffset", 0)
        for i in range(a["count"]):
            values = struct.unpack_from("<%d%s" % (n, fmt), buf, base + i * step)
            out[i * n:(i + 1) * n] = [decode(c) for c in values]
    sparse = a.get("sparse")
    if sparse:
        ib, io, _ = view(sparse["indices"]["bufferView"])
        vb, vo, _ = view(sparse["values"]["bufferView"])
        ifmt, isize = _COMPONENT[sparse["indices"]["componentType"]]
        io += sparse["indices"].get("byteOffset", 0)
        vo += sparse["values"].get("byteOffset", 0)
        for k in range(sparse["count"]):
            i = struct.unpack_from("<" + ifmt, ib, io + k * isize)[0]
            values = struct.unpack_from("<%d%s" % (n, fmt), vb, vo + k * n * size)
            out[i * n:(i + 1) * n] = [decode(c) for c in values]
    return out


def _local_matrix(node: dict[str, Any]) -> list[float]:
    if "matrix" in node:
        return list(node["matrix"])
    tx, ty, tz = node.get("translation", (0, 0, 0))
    x, y, z, w = node.get("rotation", (0, 0, 0, 1))
    sx, sy, sz = node.get("scale", (1, 1, 1))
    return [
        (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
        (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
        (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
        tx, ty, tz, 1,
    ]


def _multiply(a: list[float], b: list[float]) -> list[float]:
    out = [0.0] * 16
    for c in range(4):
        for r in range(4):
            out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]
    return out


def model_geometry(gltf: dict[str, Any]) -> dict[str, Any]:
    """The model's geometry as ISM sees it (§13.3).

    ``extent``: width, height and depth in the model's units of the box around
    every vertex of the scene, after every node's transform. ``hash``: SHA-256 in
    hex of every POSITION value of every primitive of every mesh, in the order
    the file lists them, each as a little-endian 32-bit float — transforms are
    not in it. ``vertexCount``: how many vertices went into the hash.
    """
    import hashlib
    doc = gltf["json"]
    for name in doc.get("extensionsRequired", []):
        if name in _COMPRESSED:
            raise ValueError("The geometry is compressed (%s); this reader cannot decode it." % name)
    positions: dict[int, list[float]] = {}
    ordered: list[list[float]] = []
    for mesh in doc.get("meshes", []):
        for prim in mesh.get("primitives", []):
            if "KHR_draco_mesh_compression" in prim.get("extensions", {}):
                raise ValueError("The geometry is Draco-compressed; this reader cannot decode it.")
            idx = prim.get("attributes", {}).get("POSITION")
            if idx is None:
                continue
            if idx not in positions:
                positions[idx] = _accessor_floats(gltf, idx)
            ordered.append(positions[idx])
    count = sum(len(p) // 3 for p in ordered)
    if not count:
        raise ValueError("The model has no vertices.")
    digest = hashlib.sha256()
    for p in ordered:
        digest.update(struct.pack("<%df" % len(p), *p))

    nodes = doc.get("nodes", [])
    if doc.get("scenes"):
        roots = doc["scenes"][doc.get("scene", 0)].get("nodes", [])
    else:
        children = {c for n in nodes for c in n.get("children", [])}
        roots = [i for i in range(len(nodes)) if i not in children]
    lo = [float("inf")] * 3
    hi = [float("-inf")] * 3

    def visit(i: int, parent: list[float], seen: frozenset) -> None:
        if i in seen:
            raise ValueError("The node hierarchy has a cycle.")
        node = nodes[i]
        world = _multiply(parent, _local_matrix(node))
        if "mesh" in node:
            for prim in doc["meshes"][node["mesh"]].get("primitives", []):
                p = positions.get(prim.get("attributes", {}).get("POSITION"))
                if p is None:
                    continue
                for v in range(0, len(p), 3):
                    x, y, z = p[v], p[v + 1], p[v + 2]
                    for r in range(3):
                        w = world[r] * x + world[4 + r] * y + world[8 + r] * z + world[12 + r]
                        lo[r] = min(lo[r], w)
                        hi[r] = max(hi[r], w)
        for c in node.get("children", []):
            visit(c, world, seen | {i})

    identity = [1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0]
    for r in roots:
        visit(r, identity, frozenset())
    if lo[0] == float("inf"):
        raise ValueError("No mesh in the scene.")
    return {"extent": [hi[r] - lo[r] for r in range(3)], "hash": digest.hexdigest(), "vertexCount": count}


def asset_packet(doc: dict[str, Any]) -> dict[str, Any] | None:
    """The packet the asset points at, in KHR_xmp_json_ld, or None."""
    i = doc.get("asset", {}).get("extensions", {}).get(_KHR_XMP, {}).get("packet")
    packets = doc.get("extensions", {}).get(_KHR_XMP, {}).get("packets", [])
    return packets[i] if i is not None and i < len(packets) else None


def _ism_prefix(packet: dict[str, Any] | None) -> str | None:
    ctx = (packet or {}).get("@context")
    if not isinstance(ctx, dict):
        return None
    return next((k for k, v in ctx.items() if v == ISM_NS), None)


def parse_json_ld(packet: dict[str, Any] | None) -> dict[str, Any] | None:
    """The ISM fields in a JSON-LD packet (§13.2), typed as ``parse`` types them, or None."""
    p = _ism_prefix(packet)
    if not p:
        return None
    assert packet is not None
    fields: dict[str, Any] = {}
    for key, value in packet.items():
        if not key.startswith(p + ":"):
            continue
        name = key[len(p) + 1:]
        if name in SEQS:
            fields[name] = list((value or {}).get("@list", []))
        elif name in REALS or name in INTEGERS:
            fields[name] = value
        elif name in TEXTS:
            fields[name] = str(value)
    return fields or None


def model_ism(gltf: dict[str, Any]) -> dict[str, Any] | None:
    """The ISM fields of a glTF asset (``read_gltf``), or None."""
    return parse_json_ld(asset_packet(gltf["json"]))


def model_scale_for(fields: dict[str, Any] | None, geometry: dict[str, Any]) -> dict[str, Any]:
    """The model's scale as the file is now (§13.4): the same answer as the JavaScript reader.

    Returns a dict with ``ok`` and either ``reason``, or ``scale`` (mm per model
    unit), ``geometry`` ("measured" or "changed"), ``turned``, ``rescaled``,
    ``factor`` (when rescaled) and ``sizeMm``.
    """
    problems = validate(fields)
    if problems:
        return {"ok": False, "reason": " ".join(problems)}
    assert fields is not None
    if not is_model_fields(fields):
        return {"ok": False, "reason": "These fields describe an image, not a model."}
    ref_axes, cur_axes = fields["referenceExtent"], geometry["extent"]
    ref, cur = sorted(ref_axes), sorted(cur_axes)
    ratios = [c / r for c, r in zip(cur, ref)]
    same = "measured" if geometry["hash"] == fields["geometryHash"] else "changed"

    def done(scale: float, k: float, **rest: Any) -> dict[str, Any]:
        turned = not all(abs(c / r / k - 1) <= ASPECT_TOLERANCE for c, r in zip(cur_axes, ref_axes))
        return {"ok": True, "scale": scale, "geometry": same, "turned": turned,
                "sizeMm": [e * scale for e in cur_axes], **rest}

    if all(abs(r - 1) <= ASPECT_TOLERANCE for r in ratios):
        return done(fields["scale"], 1, rescaled=False)
    k = ratios[2]
    if all(abs(r / k - 1) <= ASPECT_TOLERANCE for r in ratios):
        return done(fields["scale"] / k, k, rescaled=True, factor=k)
    show = lambda e: " × ".join("%.4g" % n for n in e)
    return {"ok": False, "reason": (
        "The model's extent is %s units but the scale was set on %s, in other proportions. "
        "It has been cut or changed since, so the scale no longer applies." % (show(cur_axes), show(ref_axes)))}


def write_model(data: bytes, fields: dict[str, Any]) -> bytes:
    """The model with ISM written into it (§13.5), as a GLB or as .gltf text, as it came.

    referenceExtent and geometryHash are worked out from the file itself; the
    caller gives the scale and how it was obtained. Other metadata in the
    asset's packet is kept, and ISM already there is replaced.
    """
    import copy
    import json as _json
    gltf = read_gltf(data)
    geometry = model_geometry(gltf)
    given = {k: v for k, v in fields.items() if k not in ("referenceExtent", "geometryHash")}
    f = {"version": ISM_VERSION, **given, "referenceExtent": geometry["extent"], "geometryHash": geometry["hash"]}
    problems = validate(f)
    if problems:
        raise ValueError(" ".join(problems))

    doc = copy.deepcopy(gltf["json"])
    used = doc.setdefault("extensionsUsed", [])
    if _KHR_XMP not in used:
        used.append(_KHR_XMP)
    packets = doc.setdefault("extensions", {}).setdefault(_KHR_XMP, {}).setdefault("packets", [])
    asset_ext = doc["asset"].setdefault("extensions", {})
    index = asset_ext.get(_KHR_XMP, {}).get("packet")
    if index is None or index >= len(packets):
        packets.append({"@context": {}, "@id": ""})
        index = len(packets) - 1
        asset_ext[_KHR_XMP] = {"packet": index}
    packet = packets[index]
    ctx = packet.setdefault("@context", {})
    p = _ism_prefix(packet)
    if p:
        for key in [k for k in packet if k.startswith(p + ":")]:
            del packet[key]
    else:
        p, n = "ism", 1
        while p in ctx:
            p, n = "ism%d" % n, n + 1
        ctx[p] = ISM_NS
    order = ("version", "scale", "referenceExtent") + tuple(
        k for k in _ORDER if k not in ("version", "scale", "referenceWidth", "referenceHeight"))
    for key in order:
        if key in f:
            packet["%s:%s" % (p, key)] = {"@list": list(f[key])} if key in SEQS else f[key]
    if gltf["glb"]:
        first = gltf["buffers"][0] if gltf["buffers"] and "uri" not in doc["buffers"][0] else None
        return write_glb(doc, first)
    return _json.dumps(doc, indent=2, ensure_ascii=False).encode("utf-8")


def read_model(data: bytes) -> dict[str, Any]:
    """The ISM fields of a model file, its geometry and the reading, all at once."""
    gltf = read_gltf(data)
    fields = model_ism(gltf)
    geometry = model_geometry(gltf)
    return {"fields": fields, "geometry": geometry, "reading": model_scale_for(fields, geometry) if fields else None}
