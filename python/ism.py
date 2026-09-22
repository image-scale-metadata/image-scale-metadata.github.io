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
]

ISM_NS = "https://w3id.org/ism/0.1/"
ISM_VERSION = "0.1"
METHODS = ("ruler", "calipers", "target", "optics", "other")

#: How far two aspect ratios may differ and still count as the same picture (§6.3).
ASPECT_TOLERANCE = 0.005

CORE = ("scale", "referenceWidth", "referenceHeight", "version")
REALS = ("scale", "uncertainty", "objectWidthMm", "objectHeightMm", "objectThicknessMm")
INTEGERS = ("referenceWidth", "referenceHeight")
TEXTS = ("version", "method", "methodNote", "measuredBy", "measuredAt", "software", "plane")

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

    box = re.search(r"<%s:objectBox>(.*?)</%s:objectBox>" % (p, p), xmp, re.S)
    if box:
        fields["objectBox"] = [_number(v) for v in re.findall(r"<rdf:li>\s*([^<]*?)\s*</rdf:li>", box.group(1))]
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

def validate(fields: dict[str, Any] | None) -> list[str]:
    """Problems with the fields themselves, before any image is involved (§4, §6.1)."""
    if not fields:
        return ["No Image Scale Metadata in the file."]
    problems: list[str] = []
    missing = [k for k in CORE if k not in fields]
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

_ORDER = ("version", "scale", "referenceWidth", "referenceHeight", "method", "methodNote", "uncertainty",
          "measuredBy", "measuredAt", "software", "plane", "objectWidthMm", "objectHeightMm", "objectThicknessMm")


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
    box = f.get("objectBox")
    inner = ""
    if box:
        items = "".join("<rdf:li>%d</rdf:li>" % round(n) for n in box)
        inner = "\n      <ism:objectBox>\n        <rdf:Seq>%s</rdf:Seq>\n      </ism:objectBox>\n    " % items
    open_tag = '<rdf:Description rdf:about=""\n        xmlns:ism="%s"%s' % (ISM_NS, attrs)
    return open_tag + (">%s</rdf:Description>" % inner if inner else "/>")


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
        xmp = re.sub(r"<%s:objectBox>.*?</%s:objectBox>" % (p, p), "", xmp, flags=re.S)
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
