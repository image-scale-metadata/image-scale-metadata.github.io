---
layout: default
title: Image Scale Metadata (ISM) 0.3
toc: true
---

<div class="hero">
<p class="hero__eyebrow">Specification · version 0.3 · draft for comment</p>
<h1>Image Scale Metadata</h1>
<p class="hero__lede">An open format for carrying the true scale of an image, or of a three-dimensional model, inside the file itself, so that any program can draw a scale bar, measure a distance, or place two objects side by side at the same size.</p>
<figure class="measure" aria-label="Example: 1000 pixels at 0.0428 millimetres per pixel is 42.80 millimetres">
<span class="measure__value">42.80 mm</span>
<span class="measure__line" aria-hidden="true"><svg viewBox="0 0 10 10"><path d="M1.5 1.5 8.5 8.5M8.5 1.5 1.5 8.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="square"/></svg><span class="measure__dash"></span><svg viewBox="0 0 10 10"><path d="M1.5 1.5 8.5 8.5M8.5 1.5 1.5 8.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="square"/></svg></span>
<span class="measure__calc">1000 px × 0.0428 mm/px</span>
</figure>
<p class="hero__actions"><a class="button" href="viewer/">Open the viewer</a><a class="button button--quiet" href="validator/">Check a file</a><a class="button button--quiet" href="testfiles/">Test files</a></p>
<dl class="facts">
<dt>Status</dt>
<dd>Draft 0.3 for comment, 5 November 2026. Adds image regions: ISM fields in IPTC Image Regions, so that one picture can carry a scale of its own for each of several areas, a size for each of several objects, the length of the ruler it was measured from, and the homography of a surface seen at an angle (§14), with two new fields, <code>ism:lengthMm</code> and <code>ism:homography</code>. Adds the fingerprint, <code>ism:fingerprint</code>, by which a reader that has the pixels tells a resized copy from a cropped one (§4.5). Since 15 November 2026 the specification is in two parts: a small core, which is this page, and three extensions — the object's own size (§4.3), three-dimensional models (§13) and image regions (§14) — which a reader of the core need not know (§2). A reader that knows no regions reads a file of 0.3 as before. <a href="0.2/">Version 0.2</a>, which added three-dimensional models, and <a href="0.1/">version 0.1</a> are kept as they were published.</dd>
<dt>Comments</dt>
<dd>Welcome — open an <a href="https://github.com/image-scale-metadata/image-scale-metadata.github.io/issues">issue</a>.</dd>
<dt>Editor</dt>
<dd>Daniel Lindskog (PHOTARCH)</dd>
<dt>Licence</dt>
<dd>This specification, CC BY 4.0; the code in this repository, MIT.</dd>
<dt>Namespace</dt>
<dd><code>https://w3id.org/ism/0.1/</code>, unchanged in 0.2 and 0.3 (§4)</dd>
<dt>Name</dt>
<dd>"Image Scale Metadata" is a working name.</dd>
</dl>
</div>

**Try it:** the [viewer](viewer/) opens an image and draws its scale from the file itself. It also writes the scale into an older picture that has a ruler in it: measure the ruler once, and the file carries its scale from then on.
[Test files](https://github.com/image-scale-metadata/image-scale-metadata.github.io/tree/main/testfiles)
and the [reference library](https://github.com/image-scale-metadata/image-scale-metadata.github.io/blob/main/js/ism.js)
are in the [repository](https://github.com/image-scale-metadata/image-scale-metadata.github.io).

## 1. Purpose

A photograph of an object only shows its size if the viewer knows how large one pixel is
on the object. Today that knowledge is lost the moment the file leaves the software that
measured it: a scale bar burnt into the picture cannot be re-used, a ruler in the frame
has to be read by eye, and the resolution fields in TIFF and EXIF are read as print
settings.

ISM is a small, open set of metadata fields, written into the image file itself, that
lets **any** program — at any museum, archive or university — open the file and show its
true scale: draw a scale bar, measure a distance, or place two objects side by side at the
same size. It says how large a pixel is on the object, which pixel grid that applies to,
how the scale was obtained, and how certain it is.

A three-dimensional model has the same problem. Its file states a unit, and glTF even fixes
it at the metre, but a stated unit is not a measurement: a photogrammetric model is often
written in metres that nobody measured. Version 0.2 lets a model carry the same claim an
image does — this size was measured, this way, this certainly — together with what a reader
needs to tell whether the model has been changed since (§13).

ISM does not describe how to photograph an object, nor how to measure one. It only
describes how the result is carried in the file, so that it can survive copying, export and
import into another system, where the software on the way keeps the file's XMP (§4).

## 2. Scope

**The core** is what every reader and writer of ISM knows, and it is small on purpose:

- **Still images of objects** photographed or scanned so that the object plane is roughly parallel
  to the image plane: finds on a copy stand, flat objects, documents, one face of a
  three-dimensional object.
- **One scale, valid in one plane**: the plane in which it was measured (§4.4). ISM makes no claim
  for depth, and §4.4 says how much depth one scale allows.
- **The fields of the core**: the scale and the grid it was measured on (§4.1), how it was obtained
  and how certain it is (§4.2), the plane (§4.4) and the fingerprint (§4.5). With the rules for
  writers and readers (§5, §6), that is the whole of it.

**The extensions** build on the core and are experimental. A file that uses one is still a file of
the core, and a reader that knows only the core reads the image's own scale from it as before.

| Extension | What it adds | Where |
|---|---|---|
| **The object** | The object's box in the picture and its width, height and thickness in millimetres | §4.3 |
| **Three-dimensional models** | A measured scale for a model in glTF, GLB, USD or USDZ, or through a sidecar | [§13](models/) |
| **Image regions** | A scale of its own for a part of the picture in another plane, a size for each of several objects, the length of the ruler, and the homography of a flat surface seen at an angle | [§14](regions/) |

An extension may change, or be withdrawn, without the core changing. What is moved out of the core
is not judged poorer; it is unproven. The core is to stand still until programs other than the
editor's own read and write it (§11).

Out of scope altogether in 0.3: curved surfaces with a scale that changes across them, video, and
images or models of scenes rather than objects.

## 3. Terms

| Term | Meaning |
|---|---|
| **Scale** | The length on the object, in millimetres, covered by one pixel of the reference grid, in the measured plane. Written `mm/px`. |
| **Reference grid** | The pixel width and height of the image the scale was measured on, as stored in the file (before any EXIF orientation is applied). |
| **Current grid** | The pixel width and height of the file being read. |
| **Writer** | Software that puts ISM fields into a file. |
| **Reader** | Software that reads them and shows or uses the scale. |
| **Model unit** | The unit a three-dimensional model's coordinates are written in. For glTF the format declares it the metre; ISM says whether that was measured (§13). |
| **Reference geometry** | A model as it was when its scale was set, known by its extent and the hash of its vertices (§13.3). |
| **Region** | A part of the picture, as an IPTC Image Region marks it: a rectangle, a circle or a polygon, with a point and a line counting as polygons. A region may carry ISM fields of its own (§14). |

<div class="figure">
<div class="figure__panels">
<svg viewBox="0 0 340 380" role="img" aria-labelledby="fig1a">
<title id="fig1a">The image: a reference grid of 1509 by 1509 pixels, with the object's box 1000 pixels wide.</title>
<text class="f-head" x="20" y="16">The image</text>
<text class="f-label" x="20" y="34">reference grid, 1509 × 1509 px</text>
<rect class="f-line" x="20" y="44" width="300" height="300"/>
<path class="f-object" d="M70.5,200 C70.5,150 110,100.86 160,100.86 C215,100.86 269.3,135 269.3,180 C269.3,235 235,286.35 185,286.35 C125,286.35 70.5,250 70.5,200 Z"/>
<rect class="f-dash" x="70.5" y="100.86" width="198.81" height="185.49"/>
<path class="f-dash" d="M70.5,98 V76 M269.31,98 V76"/>
<path class="f-line" d="M70.5,82 H269.31" stroke-dasharray="6 4"/>
<path class="f-cross" d="M66.5,78 74.5,86 M74.5,78 66.5,86 M265.31,78 273.31,86 M273.31,78 265.31,86"/>
<text class="f-label" x="169.9" y="70" text-anchor="middle">1000 px</text>
<text class="f-mono" x="70.5" y="304">ism:objectBox</text>
<text class="f-mono" x="170" y="368" text-anchor="middle">1000 px × 0.0428 mm/px = 42.80 mm</text>
</svg>
<svg viewBox="0 0 340 380" role="img" aria-labelledby="fig1b">
<title id="fig1b">One pixel, enlarged: it covers 0.0428 millimetres of the object.</title>
<text class="f-head" x="20" y="16">One pixel, enlarged</text>
<text class="f-label" x="20" y="34">ism:scale — the length one pixel covers</text>
<path class="f-hair" d="M40,56 H300 M40,108 H300 M40,160 H300 M40,212 H300 M40,264 H300 M40,316 H300 M40,56 V316 M92,56 V316 M144,56 V316 M196,56 V316 M248,56 V316 M300,56 V316"/>
<rect class="f-object" x="144" y="160" width="52" height="52"/>
<path class="f-dash" d="M144,214 V330 M196,214 V330"/>
<path class="f-line" d="M144,336 H196" stroke-dasharray="6 4"/>
<path class="f-cross" d="M140,332 148,340 M148,332 140,340 M192,332 200,340 M200,332 192,340"/>
<text class="f-head" x="170" y="360" text-anchor="middle">0.0428 mm</text>
<text class="f-mono" x="170" y="376" text-anchor="middle">on the object, in the measured plane</text>
</svg>
</div>
<p class="figcaption">What the four core fields say, using the example in §8. The reference grid is 1509 × 1509 px, and one pixel covers 0.0428 mm of the object, so an object 1000 px wide on that grid is 42.80 mm wide.</p>
</div>

"MUST", "SHOULD" and "MAY" are used as in RFC 2119.

## 4. The fields

ISM fields live in an XMP namespace of their own, so they travel with JPEG, TIFF, PNG,
WebP, HEIF, DNG and PDF.

**What keeps the fields, and what does not.** A program that edits a file in place, or copies
its XMP packet whole, keeps ISM. A program that builds a new file from the pixels, or copies
metadata field by field from a list of the fields it knows, drops it. Tried on 15 November 2026:
macOS `sips` dropped the fields on every operation, resizing and re-encoding among them; ExifTool
kept them when it edited a file in place and when it copied the packet as a block (`-xmp`), and
dropped them when it copied tags from one file to another (`-tagsFromFile … -all:all`), since it
does not know the namespace. Image servers and web publishing systems commonly deliver their
derivatives with no metadata at all. A file that has lost the fields gives no scale, never a
wrong one. A scale that is published SHOULD therefore also travel beside the image, in the
manifest or the record (§7.2, §7.3), and not in the file alone.

- **Namespace URI:** `https://w3id.org/ism/0.1/` — registered at w3id.org; it resolves to this specification.
- **Preferred prefix:** `ism`

The namespace keeps its address through the 0.x versions. Versions 0.2 and 0.3 only add fields,
values and places for them, so a file written to 0.1 is a valid 0.3 file, and a reader of 0.1
still reads the image's own scale in a file written to 0.3. `ism:version` says which text the
writer followed.

### 4.0 Where the packet lives

ISM adds no container of its own. The fields go in the file's ordinary XMP packet, in the place
each format keeps it:

| Format | Where the XMP packet goes |
|---|---|
| **JPEG** | An `APP1` segment whose payload begins `http://ns.adobe.com/xap/1.0/\0`. A packet larger than one segment uses ExtendedXMP; ISM is small and MUST fit in the first. |
| **TIFF and DNG** | Tag **700** (`XMP`) on the first IFD, type BYTE or UNDEFINED. |
| **PNG** | An uncompressed `iTXt` chunk with the keyword `XML:com.adobe.xmp`, before `IDAT`. |
| **WebP** | The `XMP ` chunk in the RIFF container. |
| **HEIF, AVIF** | An `mime` item of type `application/rdf+xml`, as the format's metadata item. |
| **PDF** | The document-level metadata stream (`/Metadata`). |
| **glTF, GLB** | The packet the `asset` points at in the `KHR_xmp_json_ld` extension, written as JSON-LD (§13.2). |
| **USD, USDZ** | No XMP: the fields in `dictionary ism` in the root layer's `customLayerData` (§13.2). |

A file MUST carry **one** XMP packet in force. A writer that adds ISM to a file that already has
XMP MUST merge into that packet rather than add a second (§5). A reader MUST take the packet from
where the format says it is, not from the first thing in the bytes that looks like one: a file can
keep an old packet that nothing points at any more.

**A sidecar** — For a format that cannot hold XMP, or a file that must not be rewritten, the
packet MAY be written beside it as `<name>.xmp`, with the same base name. Models in OBJ, PLY,
STL and other formats without a place for metadata carry ISM this way (§13.2). The sidecar holds the
same fields with the same meaning, and a reader SHOULD look for it when the file itself has none.
An original kept byte for byte is the ordinary reason to use one.

### 4.1 Core — required

| Field | Type | Meaning |
|---|---|---|
| `ism:version` | Text | The version of this specification the file follows, e.g. `0.1`. |
| `ism:scale` | Real | Millimetres per pixel in the measured plane, on the reference grid. Greater than 0. |
| `ism:referenceWidth` | Integer | Width in pixels of the reference grid. |
| `ism:referenceHeight` | Integer | Height in pixels of the reference grid. |

These four are enough for a reader to draw a correct scale bar.

### 4.2 How the scale was obtained — recommended

| Field | Type | Meaning |
|---|---|---|
| `ism:method` | Closed choice | `ruler` (a ruler or scale in the picture, or a scale bar beside a model's object), `calipers` (a length measured on the object and entered), `target` (a calibration target of known geometry in the picture), `optics` (known distance and focal length), `scanner` (the measuring instrument's own calibration: a 3D scanner, a measuring arm, a flatbed scanner at its stated resolution), `ct` (the voxel size of a CT or micro-CT scan, checked against a reference of calibrated length), `other`. `scanner` and `ct` are new in 0.2. |
| `ism:methodNote` | Text | Free description, e.g. "calipers, length of the blade, 42.80 mm". |
| `ism:uncertainty` | Real | Relative standard uncertainty of `ism:scale`, as a fraction: one standard deviation, the way the GUM (JCGM 100:2008) states the uncertainty of a result. `0.005` is a standard uncertainty of 0.5 %; the margin that holds about 95 times in 100 is twice that, ± 1.0 % (§6.7). A writer that has a margin at 95 % writes half of it. |
| `ism:measuredBy` | Text | Person or organisation that measured. |
| `ism:measuredAt` | Date | ISO 8601 date the scale was set. |
| `ism:software` | Text | Software and version that wrote the scale, e.g. "PHOTARCH 1.0", as the PHOTARCH app writes it. |

### 4.3 The object — an extension

| Field | Type | Meaning |
|---|---|---|
| `ism:objectBox` | Seq of 4 Integer | The object's bounding box on the reference grid: x, y, width, height in pixels, from the top-left of the stored image. |
| `ism:objectWidthMm` | Real | The object's width in millimetres along the reference grid's x axis. |
| `ism:objectHeightMm` | Real | The object's height in millimetres along the y axis. |
| `ism:objectThicknessMm` | Real | Thickness, when measured separately; not derivable from the image. |

When both `ism:objectBox` and `ism:scale` are present, the width and height SHOULD agree
with box × scale; a reader MAY check this.

These four fields are an extension (§2): a reader of the core draws the scale without them.

### 4.4 The plane — recommended

| Field | Type | Meaning |
|---|---|---|
| `ism:plane` | Text | Which plane the scale holds for, e.g. "upper surface of the find", "the page". |

For a three-dimensional object the scale is only exact in one plane; parts nearer the
camera look larger. Writers SHOULD say which plane, and readers SHOULD show it next to any
measurement they display. A part at another depth can carry a scale of its own in a region, and
a plane seen at an angle a homography, on a region or on the image (§14).

**How much depth one scale allows.** Through an ordinary lens, a part that rises `z` above the
measured plane is drawn larger by `D / (D − z)`, where `D` is the distance from the lens's
entrance pupil to the plane. A length measured there with the plane's scale comes out too large
by `z / (D − z)`: 1 % at 6 mm above a plane 600 mm away, 9 % at 50 mm. For a relative error of
at most `e`, the part may rise no more than `e × D / (1 + e)` above the plane, close to `e × D`.
A part below the plane is drawn smaller by the same rule. A telecentric lens and a flatbed
scanner have no such error within their depth of field.

`ism:uncertainty` is the uncertainty of the scale **in the measured plane**. It says nothing
about a part at another depth, and no field of 0.3 carries `D`. A reader SHOULD NOT show
`ism:uncertainty` as the uncertainty of a length measured on a part it has reason to think lies
out of the plane, and a writer that knows the object rises far out of the plane SHOULD say so
in `ism:plane`.

### 4.5 The fingerprint — recommended

| Field | Type | Meaning |
|---|---|---|
| `ism:fingerprint` | Text | **New in 0.3.** What the picture looked like when the scale was set, small enough to compare a later copy against: the scheme's name, a colon, and the scheme's data. 0.3 has one scheme, `y16`. |

The pixel dimensions cannot tell a copy resized to half its size from one cropped to half its
size in the same shape, nor an upright part cut from a lying picture from the whole picture
turned and made smaller (§12.1). The first two keep their scale by §6.3 and the others must not.
The fingerprint is what tells them apart, for a reader that has the pixels.

**The scheme `y16`.**

1. Take the pixels as they are stored, before any EXIF orientation, as 8-bit samples. Samples
   of 16 bits are read by their high byte. A pixel with alpha is first laid over white, each
   sample `c` with alpha `a` becoming `floor((c × a + 255 × (255 − a) + 127) / 255)`.
2. A pixel's luma, times 1000, is `299 R + 587 G + 114 B`; for a grey picture, `1000 ×` its one
   sample. The samples are taken as they stand, with no colour management.
3. Divide the picture into 16 × 16 cells. Cell `i` of a row holds the columns from
   `floor(i × width / 16)` up to, not including, `floor((i + 1) × width / 16)`; the rows of
   cell `j` likewise, by the height.
4. A cell's value is its mean luma rounded to the nearest whole number, 0–255:
   `floor((2 × sum + d) / (2 × d))`, where `sum` is the sum over its pixels of step 2 and `d` is
   1000 times the number of its pixels.
5. The field is `y16:` followed by the 256 values, row by row from the top left, each as two
   lower-case hexadecimal digits: 516 characters.

Every step is in whole numbers, so two implementations give the same characters for the same
pixels. A picture under 32 pixels on either side has no fingerprint.

**Comparing.** A reader works out the fingerprint of the picture as it is now, the same way, and
takes the correlation (Pearson's *r*) of its 256 values with the file's. The picture may have been
turned or mirrored since, so the file's cells are tried each way round that the dimensions allow:
as they stand and upside down when the picture lies as the reference grid does, the two quarter
turns when width and height are exchanged, all four for a square; and each of those mirrored.
The best *r* decides: at **0.995 or more** the picture is the whole of the one the scale was set
on. The way round that gave it says how the picture has been turned since.

Correlation does not change when a picture is made lighter, darker or more contrasty as a
whole, so such a copy still matches. It does change when the content moves across the cells,
which is what a crop does.

**What it can and cannot tell.** Tried on three photographs of objects on 15 November 2026:
copies resized to between a half and a fifth, and recompressed as JPEG down to quality 30, gave
*r* of 0.999 or more; copies cropped by a twentieth of their width and height gave 0.987 to
0.991, and by a tenth 0.94 to 0.96. Crops by a fiftieth gave 0.998 and passed: a crop that small
is not caught, and the scale read from it is wrong by as much as was cut. Three photographs
are little to set a threshold by, and it will be tried on more before 1.0. A picture whose cells
hardly differ — a standard deviation under 4 levels in the file's fingerprint, a blank sheet —
cannot be checked at all, and is read as if it had no fingerprint.

A reader ignores a fingerprint whose scheme it does not know.

## 5. Rules for writers

1. A writer MUST write the four core fields together, or none of them. The one exception is an
   image whose only scales are in its regions: it carries the grid without `ism:scale` (§14.4).
2. `ism:referenceWidth` and `ism:referenceHeight` MUST be the pixel dimensions of the file
   the fields are written into, at the moment they are written.
3. When a writer **resizes** an image it keeps ISM in, it MUST either leave the fields
   unchanged (readers rescale, §6) or rewrite `ism:scale` and both reference dimensions to
   the new grid. It MUST NOT change one without the other.
4. When a writer **crops, rotates by other than 90°, corrects perspective or otherwise
   moves pixels**, it MUST recompute the fields for the new grid or remove all of them. A
   crop keeps the size of a pixel but changes the grid, and a reader cannot tell a crop
   from a resize by the dimensions alone. `ism:fingerprint` is recomputed or removed with them.
5. A writer SHOULD also set the file's resolution to match (§7.1), so that software that
   does not know ISM still gets the right answer where it can.
6. A writer MUST NOT write ISM for an image whose scale it has not measured. An estimate
   is written with `ism:method` = `other` and an honest `ism:uncertainty`.
7. A writer MAY leave a file it passes on unchanged — an original kept byte for byte —
   without ISM, and write the fields only into the copies it makes. `ism:uncertainty` is
   left out when there is no real figure for it; a guessed one is worse than none.
8. A writer SHOULD write `ism:fingerprint` (§4.5). It MUST be the fingerprint of the pixels of
   the reference grid: of the file the fields are written into, at the moment they are written.
   A writer that resizes and leaves the fields unchanged (rule 3) leaves the fingerprint
   unchanged too; one that rewrites the fields to a new grid writes the new picture's.

## 6. Rules for readers

1. A reader MUST check that all four core fields are present and valid before using the
   scale. An image whose regions carry the scale has the grid alone, and no scale of its own
   (§14.4).
2. If the current grid equals the reference grid, the scale is `ism:scale`. So it is when the
   current grid is the reference grid with width and height exchanged: the pixels were turned by
   a quarter turn, or are shown through an EXIF orientation (rule 5), and turning does not
   change the size of a pixel. The reference size is not proof of the same picture, since a
   crop enlarged back to it has that size too: when the file has `ism:fingerprint` and the
   reader has the pixels, the reader MUST compare here as well (§4.5), and MUST NOT show a
   scale for a picture that does not match.
3. If the current grid differs but has the same aspect ratio (within 0.5 %), as it stands or
   with width and height exchanged, the picture is either a uniform resize of the reference
   grid or a crop of it to the same shape.
   - When the file has `ism:fingerprint` and the reader has the pixels, the reader MUST compare
     (§4.5). If the picture matches, it is a resize, and the scale is
     `scale_current = ism:scale × referenceWidth / currentWidth` (the current height, where
     width and height are exchanged). If it does not match, the reader MUST NOT show a scale,
     and SHOULD say that the picture has been cropped or changed.
   - When there is no fingerprint, or none the reader can check, the reader assumes a uniform
     resize and uses the same formula. It SHOULD then say that the scale rests on that
     assumption. A reader that has the pixels SHOULD check; one that reads only the metadata
     cannot.
4. If the aspect ratio differs, the image was cropped or otherwise changed without the
   fields being updated. The reader MUST NOT show a scale, and SHOULD say why.
5. EXIF orientation: the scale is the same in both directions, so orientation does not
   change it; `ism:objectBox` is given on the stored grid and MUST be rotated with the
   image when drawn.
6. A reader SHOULD show the method and uncertainty when it shows a measurement.
7. `ism:uncertainty` is a standard uncertainty, not a margin. A reader that shows it as a
   margin (±) SHOULD show twice it — the expanded uncertainty with coverage factor k = 2,
   about 95 % (GUM §6) — and say so: "± 1.0 % (95 %)". The stored figure shown as ± would
   claim the scale twice as certain as it is.

## 7. Mappings to what already exists

ISM is the source. Writers SHOULD also fill these, so older tools see as much as they can.

### 7.1 TIFF and EXIF resolution

`XResolution = YResolution = 10 / ism:scale` pixels per centimetre with
`ResolutionUnit = 3` (centimetre), or the same resolution in inches,
`25.4 / ism:scale` with `ResolutionUnit = 2`. Both say the same thing; a writer uses the
one its imaging library can write (macOS ImageIO, for one, cannot write unit 3). Readers
MUST NOT rely on the JFIF density in a JPEG: some libraries add a JFIF segment with no
unit (`DensityUnit = 0`) next to correct EXIF values. Most software reads these as print settings; some
scientific viewers (e.g. ImageJ/Fiji) read them as pixel size. They are lost on many
conversions, which is why ISM does not rely on them.

### 7.2 IIIF

On a IIIF Presentation canvas whose dimensions are the reference grid, the Physical
Dimensions service carries the same number:

```json
"service": [{
  "@context": "http://iiif.io/api/annex/services/physdim/1/context.json",
  "profile": "http://iiif.io/api/annex/services/physdim",
  "physicalScale": 0.0428,
  "physicalUnits": "mm"
}]
```

`physicalScale` is `ism:scale` rescaled to the canvas's width by §6.3. IIIF itself notes
that physical dimensions are often missing or unreliable. A field for how far to trust them, and
a list of methods by which the scale was found, were proposed in 2014 and closed unfixed in 2016
for want of interest in the service itself (IIIF/api issue 293); ISM's method and uncertainty are
what was asked for there.

The draft of Presentation 4.0 (version 4.0.0, not yet stable in November 2026) has
`spatialScale` on a Canvas: a Quantity in metres for one canvas unit. That is `ism:scale` ÷ 1000,
rescaled to the canvas's width the same way.

### 7.3 Linked Art and museum records

`ism:objectWidthMm` and `ism:objectHeightMm` can be expressed as Linked Art `dimension`
entries (Width, `aat:300055647`; Height, `aat:300055644`) with the unit millimetres
(`aat:300379097`). How they were obtained belongs on an `AttributeAssignment` linked with
`assigned_by`: `technique` for the method (a local term such as "measured from a scaled
photograph", since no shared one exists yet), `carried_out_by` and `timespan` for
`ism:measuredBy` and `ism:measuredAt`, and `used_specific_object` for the photograph itself.
Each value of `ism:method` has its own address under `https://w3id.org/ism/0.1/method/`
(for example [`https://w3id.org/ism/0.1/method/calipers`](https://w3id.org/ism/0.1/method/calipers)),
which can serve as that `technique`.
ISM's width runs along the image's x axis; a museum's width follows the object's own
orientation, and the two need not agree.

ISM does not replace a museum's own recorded dimensions; it says how large the object is
**in this picture**.

### 7.4 Prior art worth naming

- **DICOM**: the medical model, where the file says how large a pixel is, so that a viewer can
  show a true scale. ISM is that idea for heritage images. DICOM is also the warning: NEMA
  CP-586 was written because viewers read the spacing attributes differently, often without
  telling the user. The parallel runs deeper than the one field usually cited:
  - `ImagerPixelSpacing` (0018,1164) is the distance between pixel centres **on the
    detector**; `PixelSpacing` (0028,0030) is the distance **in the patient**. The
    standard states that the first "shall never be adjusted to account for correction for
    the effect of geometric magnification or calibration against an object of known size" —
    that is what the second exists for. This is §5.2
    of this specification, arrived at independently: a scale describes one pixel grid,
    and writing it onto another grid gives a confident wrong answer.
  - `EstimatedRadiographicMagnificationFactor` (0018,1114) relates the detector's plane to
    the object's: source-to-detector distance over source-to-object distance. It is the
    geometry of §4.4, where a part nearer the camera is drawn larger.
  - `PixelSpacingCalibrationType` (0028,0A02) and `PixelSpacingCalibrationDescription`
    (0028,0A04) record *how*
    the calibration was obtained — a controlled value beside free text, which is what
    `method` and `methodNote` are here.

  Projection radiography had to make these distinctions explicit because getting them
  wrong is clinically consequential (NEMA CP-586). Nothing about them is medical: they
  follow from measuring anything at all from an image.
- **Metamorfoze, FADGI, ISO 19264-1**: image quality, with the sampling rate among the things
  measured. ISO 19264-1 measures sampling rate and reproduction scale against a target, and FADGI
  sets pixels-per-inch aims with a tolerance. For a flat original that is the scale, measured
  with care; the result is a quality report and a resolution tag, with no plane, no method and
  no uncertainty in the file. An institution that already images to these guidelines has the
  number ISM needs at every check. The two are complementary.
- **The same idea, standardised before.** ISM is not the first place a file may say how large a
  pixel is on the subject:
  - **PNG `sCAL`**, "physical scale of image subject", a registered chunk in the PNG extensions: one
    pixel's width and height in metres (or radians), written for maps, photomicrographs and
    floor plans, and set apart from `pHYs`, which is the size the image is to be printed at.
  - **MIX / NISO Z39.87** (2006): `samplingFrequencyPlane` may be "object plane", beside
    `xSamplingFrequency` and `ySamplingFrequency`.
  - **IIIF Physical Dimensions** (2014) and `spatialScale` in the draft of Presentation 4.0:
    §7.2.

  None of them is in wide use for pictures of objects: little writes them, and less reads them.
  What ISM adds is the reference grid, which makes a resized copy safe to read; the method and
  the uncertainty; the plane; regions (§14); and models (§13).

### 7.5 IPTC Photo Metadata: Image Quality

IPTC Photo Metadata 2026.1 adds a structure, *Image Quality*, proposed by the Digital Object
Authenticity Working Group (DOAWG), which records how a picture was digitised and how well. Its
text is not published at the time of writing (15 November 2026); what follows goes by DOAWG's
draft schema, whose properties are the date digitised, the method, the name of the benchmark
(FADGI, Metamorfoze, ISO 19264-1), the performance level reached, the software that evaluated it,
the target, the target's identifier and a job identifier. It will be checked against 2026.1.

None of these says how large a pixel is on the object. But a picture judged against such a
benchmark has had its sampling rate measured against a target, and the benchmark sets how far the
resolution stated in the file may lie from the measured one: FADGI's *Reproduction Scale Accuracy*
allows ± 1 % at four stars and ± 2 % at three, Metamorfoze ± 2 % at each of its levels. So a file
that carries Image Quality already holds a measured scale, in the plane of the target. ISM is
where it is said outright:

| ISM | From a file that carries Image Quality |
|---|---|
| `ism:scale` | `25.4 / XResolution` when the resolution is in pixels per inch, `10 / XResolution` per centimetre (§7.1), on the grid of the file as it is |
| `ism:referenceWidth`, `ism:referenceHeight` | The pixel dimensions of that file |
| `ism:method` | `target` |
| `ism:methodNote` | The benchmark, the level and the target's identifier, e.g. "FADGI 2023, four stars; target GT-C 1234" |
| `ism:uncertainty` | The level's tolerance ÷ √3, the tolerance being a limit and not a standard deviation (GUM 4.3.7): 0.0058 for ± 1 %, 0.0115 for ± 2 % |
| `ism:plane` | The plane the target lay in |
| `ism:measuredAt`, `ism:software` | The date digitised and the evaluating software |

A writer may do this only for a picture whose level was in fact measured, for itself or for the
run it belongs to: a benchmark named as an aim is not a measurement (§5.6). The ISM fields stand
beside the Image Quality structure, on the image's own description, and neither needs the other
to be read. Whether Image Quality should itself say how large a pixel is on the object is a
question for IPTC (§12).

## 8. Example

A JPEG exported at 1509 × 1509 px, measured with calipers:

```xml
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:ism="https://w3id.org/ism/0.1/"
        ism:version="0.1"
        ism:scale="0.0428"
        ism:referenceWidth="1509"
        ism:referenceHeight="1509"
        ism:method="calipers"
        ism:methodNote="Length of the blade, 42.80 mm, measured with calipers"
        ism:uncertainty="0.004"
        ism:measuredAt="2026-09-21"
        ism:software="PHOTARCH 1.0"
        ism:plane="Upper surface of the find"
        ism:objectWidthMm="42.80"
        ism:objectHeightMm="39.92">
      <ism:objectBox>
        <rdf:Seq><rdf:li>254</rdf:li><rdf:li>286</rdf:li><rdf:li>1000</rdf:li><rdf:li>933</rdf:li></rdf:Seq>
      </ism:objectBox>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
```

A reader opening a 1000 px wide copy of the same image uses 0.0428 × 1509 / 1000 =
0.0646 mm/px.

## 9. Conformance

**The core**

| Level | Writer writes | A reader can |
|---|---|---|
| **ISM-A** | the four core fields (§4.1) | draw a true scale bar |
| **ISM-B** | A + method, uncertainty, measuredAt, software (§4.2), and SHOULD write the plane (§4.4) and the fingerprint (§4.5) | say how far to trust it, and tell a cropped copy from a resized one |

**The extensions**, each standing beside the core's levels:

| Level | Writer writes | A reader can |
|---|---|---|
| **ISM-C**, the object | B + objectBox and the object's dimensions (§4.3) | show and check the object's size |
| **ISM-D**, regions | regions that carry ISM fields by [§14](regions/), on an image with the reference grid | measure each part of the picture by the scale that holds there |
| **Models** | the model's own core in place of the image's ([§13.1](models/)): `version`, `scale`, `referenceExtent` and `geometryHash` | show a model at its measured size, and tell whether it has been changed since |

A file can be ISM-C and ISM-D. ISM-D stands alone when only the regions have a scale (§14.4). A
region with a scale of its own SHOULD also say how it was obtained and how certain it is, as ISM-B
asks of the image. A model reaches the levels A to C with its own core; it has no object box.

A program conforms to the core when it passes the core's test files, and to an extension when it
passes that extension's. It may conform to the core alone.

The reference implementation and test files (§10) decide what "correct" means in practice:
a writer or reader conforms when it passes them.

## 10. What will be published with 1.0

- This specification, versioned, under **CC BY 4.0**, with a DOI (Zenodo).
- A **reference library** that reads and writes ISM — under **MIT**.
  *(Done in 0.1: [JavaScript](https://github.com/image-scale-metadata/image-scale-metadata.github.io/blob/main/js/ism.js)
  and [Python](https://github.com/image-scale-metadata/image-scale-metadata.github.io/blob/main/python/ism.py),
  both reading and writing JPEG, PNG and TIFF, and checked against each other by the test files.
  In 0.2 both also read and write models in GLB and in glTF with its buffers inlined; the
  geometry of other model formats is not read yet. In 0.3 both read image regions, and the
  JavaScript library writes them. Swift to come.)*
- **Test files** with the answer a reader must give for each. *(Done in 0.1:
  [the set](testfiles/) covers JPEG, PNG and TIFF, resized, turned and cropped; in 0.2 also
  models, simplified, turned, rewritten in millimetres and cut; in 0.3 also images with regions:
  two planes, several objects, and scales in the regions only.)*
- A **validator**: a web page where a file can be dropped and checked.
  *(Done in 0.1: [the validator](validator/), which reads models too since 0.2, and regions since 0.3.)*
- A **viewer demo**: a plain web page, not PHOTARCH, that opens a file and draws its scale.
  *(Done in 0.1: [the viewer](viewer/), which also writes the scale into a file that has none,
  and since 0.3 draws the regions and measures by the scale that holds where the line is drawn.)*
- The namespace at a neutral address that does not depend on any company: done in 0.1,
  `https://w3id.org/ism/`.

## 11. Governance (to be agreed with an academic partner)

- The specification is edited in a public repository; changes by pull request and a short
  public comment period.
- Version 1.0 is intended to be published jointly with an academic partner. Later
  versions are decided by a small working group; the first change made by someone other
  than the original editor is the sign that it is a standard.

## 12. Open questions

1. **Crop to the same aspect ratio** cannot be detected from the dimensions (§5.4): answered in
   0.3 with `ism:fingerprint` (§4.5), for a file that carries one and a reader that has the
   pixels. Still open: the threshold, set from three photographs; crops smaller than about a
   twentieth, which pass; and whether a file without a fingerprint should still be read by
   assumption (§6.3) or refused.
2. **Units**: millimetres only, or allow micrometres for very small objects? (A real field:
   `ism:scale` = 0.001 is already 1 µm/px.)
3. **Several planes**: answered in 0.3 — a part of the picture in another plane carries its own
   scale in an IPTC Image Region (§14).
4. **Relation to 3D**: answered in 0.2 — models are described in the same namespace (§13).
   ISM in USD and USDZ was added on 30 October 2026 (§13.2, §13.3). Still open: instanced prims
   in USD; packets on single nodes, for a model whose parts were measured apart; and skinned or
   morphing meshes, which 0.2 reads in their rest pose.
5. **Name**: "Image Scale Metadata" is a working name. Decide with the partner.
6. **Where the namespace lives**: settled at w3id.org, which can be pointed at a university
   address later without changing any file.
7. **Regions in several parts.** IPTC Photo Metadata 2026.1 adds regions that are not contiguous.
   §14 follows 2025.1 until the text of 2026.1 is published, and will then be checked against it.
8. **Terms at IPTC.** The roles and content types of §14.8 are to be proposed for IPTC's
   NewsCodes. How IPTC takes such proposals is not yet known.
9. **Regions in a turned copy.** A reader cannot place regions in a copy whose pixels were turned
   by a quarter turn (§14.6). Since 0.3 the fingerprint says which way a copy was turned
   (§4.5), for a file that has one. The reference readers do not yet use it to place regions.
10. **A region's provenance.** A region without a scale of its own has no `ism:measuredBy` or
    `ism:measuredAt` for its object dimensions, as the image has none for its own. Is that
    enough, when several objects in one picture were measured at different times?
11. **The camera's pose.** A homography needs neither the camera's tilt nor its distance. With
    the lens's focal length they can be worked out from it. Is either worth a field of its own?
12. **Curved surfaces.** A homography holds for a plane. A curved surface still takes several
    regions, each with its own scale and uncertainty.
13. **The scale in IPTC's own fields.** The core is small enough to be one structure in IPTC Photo
    Metadata, beside Image Quality or within it (§7.5): the scale, the grid, the method, the
    uncertainty and the plane. Should it be proposed there, and would ISM then keep only what
    IPTC does not take?
14. **The distance to the plane.** With it a reader could work out how tall an object the scale
    allows (§4.4) and warn. A field for it, or for a lens that is telecentric?

## 13. Extension: three-dimensional models

A model in glTF, GLB, USD or USDZ, or beside a sidecar, can carry the same claim an image does: this
size was measured, this way, this certainly. It is an extension, on a page of its own:
**[Three-dimensional models](models/)** (§13.1–13.8).

## 14. Extension: image regions

A part of a picture can carry ISM fields of its own, in an IPTC Image Region: a scale for another
plane, a size for each of several objects, the ruler the scale was read from, the homography of a
surface seen at an angle. It is an extension, on a page of its own:
**[Image regions](regions/)** (§14.1–14.12).
