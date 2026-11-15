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
<dd>Draft 0.3 for comment, 5 November 2026. Adds image regions: ISM fields in IPTC Image Regions, so that one picture can carry a scale of its own for each of several areas, a size for each of several objects, the length of the ruler it was measured from, and the homography of a surface seen at an angle (§14), with two new fields, <code>ism:lengthMm</code> and <code>ism:homography</code>. Adds the fingerprint, <code>ism:fingerprint</code>, by which a reader that has the pixels tells a resized copy from a cropped one (§4.5). A reader that knows no regions reads a file of 0.3 as before. <a href="0.2/">Version 0.2</a>, which added three-dimensional models, and <a href="0.1/">version 0.1</a> are kept as they were published.</dd>
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

- **Still images of objects** photographed or scanned so that the object plane is
  roughly parallel to the image plane: finds on a copy stand, flat objects, documents,
  one face of a three-dimensional object.
- The scale is valid **in one plane**: the plane in which it was measured (§4.4). ISM makes
  no claim for depth. Since 0.3, a part of the picture that lies in another plane can carry a
  scale of its own, in an IPTC Image Region (§14).
- **Several objects in one picture**, each with its own size, in regions (§14).
- **Three-dimensional models of objects**, in glTF and GLB, and in other formats through a
  sidecar: §13.
- **A flat surface seen at an angle**, through the homography of its plane (§14.7).
- Out of scope in 0.3: curved surfaces with a scale that changes across them, video, and
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

### 4.3 The object — optional

| Field | Type | Meaning |
|---|---|---|
| `ism:objectBox` | Seq of 4 Integer | The object's bounding box on the reference grid: x, y, width, height in pixels, from the top-left of the stored image. |
| `ism:objectWidthMm` | Real | The object's width in millimetres along the reference grid's x axis. |
| `ism:objectHeightMm` | Real | The object's height in millimetres along the y axis. |
| `ism:objectThicknessMm` | Real | Thickness, when measured separately; not derivable from the image. |

When both `ism:objectBox` and `ism:scale` are present, the width and height SHOULD agree
with box × scale; a reader MAY check this.

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
   change the size of a pixel.
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

| Level | Writer writes | A reader can |
|---|---|---|
| **ISM-A** | the four core fields | draw a true scale bar |
| **ISM-B** | A + method, uncertainty, measuredAt, software | say how far to trust it |
| **ISM-C** | B + objectBox and object dimensions | show and check the object's size |
| **ISM-D** | regions that carry ISM fields by §14, on an image with the reference grid | measure each part of the picture by the scale that holds there |

ISM-D stands beside the other three: a file can be ISM-C and ISM-D. It stands alone when only the
regions have a scale (§14.4). A region with a scale of its own SHOULD also say how it was obtained
and how certain it is, as ISM-B asks of the image.

A model reaches the same levels with its own core in place of the image's (§13.1): ISM-A is
`version`, `scale`, `referenceExtent` and `geometryHash`; ISM-C adds the object's dimensions,
since a model has no object box.

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

## 13. Three-dimensional models

A model of an object — from a scanner, from photogrammetry, from CT — carries ISM much as an
image does: a scale, how it was obtained and how certain it is. What changes is the reference.
An image's scale belongs to a pixel grid. A model's scale belongs to its geometry: the size of
the box around it, and the vertices themselves.

### 13.1 The fields

A model uses the fields of §4, with two of its own in place of the reference grid.

| Field | Type | Meaning |
|---|---|---|
| `ism:version` | Text | `0.2`. Required. |
| `ism:scale` | Real | **Millimetres per model unit**, in the reference geometry. Greater than 0. Required. A glTF model whose metres are true has `1000`. |
| `ism:referenceExtent` | Seq of 3 Real | The width, height and depth of the model, in model units, when the scale was set: the box around every vertex along the file's x, y and z axes (§13.3). Each greater than 0. Required. |
| `ism:geometryHash` | Text | SHA-256 of the model's vertices when the scale was set (§13.3), as 64 lower-case hexadecimal digits. Required. |

`ism:method`, `ism:methodNote`, `ism:uncertainty`, `ism:measuredBy`, `ism:measuredAt` and
`ism:software` mean what they mean for an image (§4.2); §13.6 says how a model's uncertainty is
arrived at. `ism:objectWidthMm`, `ism:objectHeightMm` and `ism:objectThicknessMm` are the
object's dimensions along the model's x, y and z axes. `ism:objectBox` and `ism:plane` are
for images only.

A packet holds either an image's fields or a model's, never both: `ism:referenceExtent` or
`ism:geometryHash` makes it a model's, and a reader that finds them beside
`ism:referenceWidth` MUST NOT use either.

### 13.2 Where the fields live

**glTF and GLB.** The fields go in the `KHR_xmp_json_ld` extension, which Khronos ratified for
carrying XMP in glTF. They are written in the packet the `asset` object points at, which
speaks for the whole model:

- The packet is a JSON-LD object in `extensions.KHR_xmp_json_ld.packets`. Its `@context`
  binds a prefix to the ISM namespace, and the asset points at it with
  `asset.extensions.KHR_xmp_json_ld.packet`.
- `KHR_xmp_json_ld` is listed in `extensionsUsed`, not in `extensionsRequired`: a viewer that
  does not know it still shows the model.
- Numbers are JSON numbers, text is a JSON string, and `ism:referenceExtent` is an ordered
  list, `{"@list": [x, y, z]}`, as the extension writes an XMP Seq.
- A reader takes the prefix from the `@context`, as it does from an XMP packet, and does not
  assume `ism`.
- A writer that adds ISM to an asset whose packet already holds other metadata MUST add the
  fields to that packet, as §4.0 asks of an image, and MUST reuse the prefix the packet
  already binds to the namespace, since the extension forbids two prefixes for one namespace.
- In 0.2 a reader reads only the asset's packet. Packets on single nodes are left for a later
  version (§12).

**USD and USDZ.** USD has no XMP. The fields go in the
root layer's `customLayerData`, as a dictionary named `ism`, which speaks for the whole model:

```
#usda 1.0
(
    customLayerData = {
        dictionary ism = {
            string version = "0.2"
            double scale = 1000
            double[] referenceExtent = [0.20685434341430664, 0.3197622298785294, 0.037160121484830055]
            string geometryHash = "e4ddd7bdc5256a92a183b279cf8a42fd8c2d0cbc09e87f870d0a5688cebe1b2b"
            double metersPerUnit = 1
            string method = "calipers"
            string methodNote = "Calipers, 319.76 mm between two points picked on the model"
            string measuredAt = "2026-10-30"
        }
    }
    metersPerUnit = 1
)
```

- Each field keeps its name, without the prefix. Text is a `string`, a number a `double`, and
  `ism:referenceExtent` a `double[]` of three.
- `metersPerUnit` in the dictionary records the layer's `metersPerUnit` when the fields were
  written, so that the unit the extent is in can be read without the stage. It is unset when the
  layer does not state one. USD itself then falls back on 0.01, the centimetre, not on the
  metre; a reader MUST NOT take an unset `metersPerUnit` for 1.
- In a USDZ the root layer is the package's first file, as the format has it. A reader MUST take
  the dictionary from the root layer, not from a layer it sublayers or references.
- A writer that adds ISM to a layer whose `customLayerData` holds other entries MUST keep them. A
  writer MAY keep other XMP properties beside `ism` in dictionaries named for their usual prefix
  (`dc`, `xmpRights`).
- Text and crate layers carry it alike. A writer that has to convert a crate layer to text to
  edit it SHOULD convert it back, so the file does not grow.
- §13.5 applies unchanged. `metersPerUnit` is a format's own unit and not a measurement: a USD
  file scaled by nothing gets no `dictionary ism`, however its unit is declared (§13.5.4).

**Other formats.** OBJ, PLY, STL and other formats without a place for metadata carry ISM in a
sidecar (§4.0), in the XMP form of §8, with `ism:referenceExtent` as an `rdf:Seq`.

### 13.3 The extent and the hash

Both are worked out from the file, by the writer when it writes them and by the reader when it
reads them, so that the two can be compared.

**The hash, in glTF.**
1. Every mesh is taken in the order of `meshes`, and every primitive of it in the order of
   `primitives`.
2. Each primitive with a `POSITION` attribute gives that accessor's values, in element order.
3. Each value is decoded as glTF decodes it: normalized integers become fractions, and sparse
   values are put in. Geometry compressed by an extension is taken as decoded.
4. Each component is written as an IEEE 754 32-bit float, little-endian, and the values are
   joined end to end.
5. The SHA-256 of those bytes is the hash. A primitive that shares an accessor with another
   gives its values again.

Node transforms are **not** in the hash. It says whether the vertices are the ones measured.
Whether the size still holds is the extent's question.

**The extent, in glTF.**
- **The scene:** the scene `scene` names, or the first scene. A file without scenes takes every
  node that is no other node's child.
- **The vertices:** every vertex of every mesh those nodes reach, carried through its node's
  transform and every parent's, into the scene's coordinates.
- **The extent:** the width, height and depth of the box around all of them, along x, y and z,
  in the file's units.
- Skins and morph targets are not applied: the model is read in its rest pose.

**The hash, in USD.** On the stage composed from the root layer:
1. Every prim of type `Mesh` defined on the stage is taken in the order of a depth-first walk,
   children in their authored order. Abstract prims (`class`) are left out.
2. Each gives the default value of its `points` attribute, in element order. Time samples are
   not read, and a mesh whose `points` has no default value gives nothing.
3. Each component is written as an IEEE 754 32-bit float, little-endian, and the values are
   joined end to end.
4. The SHA-256 of those bytes is the hash.

Transforms are not in the hash, as in glTF. It is worked out from the `points` as authored:
a library that hands vertices back in an order of its own, or duplicates them per face, does
not give this hash.

**The extent, in USD.** Every vertex of every `Mesh` of the composed stage at the default
time, carried through its transforms, into the stage's coordinates; the width, height and depth
of the box around them, along x, y and z, in the units the layer's `metersPerUnit` declares (the
fields' own `metersPerUnit` records which). `upAxis` is not applied: a Z-up file's extent is its
x, y and z as they stand. Skinning is not applied. `extent` attributes in the file are not used.
Comparison is by §13.4, unchanged, so a file rewritten in another unit or with another up axis
follows rules 1 to 3.

**In a sidecar's model.** The hash is of the vertex positions in the order the file stores
them, written the same way: an OBJ's `v` lines, a PLY's vertex x, y and z, each of an STL's
facets' three corners. The extent is the box around them.

### 13.4 Rules for readers

The reader first checks that all four core fields are present and valid (§6.1). It then works
out the model's extent and hash as the file is now (§13.3) and compares them with the fields.

1. The extents are compared **sorted**, smallest to largest. A model turned by quarter turns
   is the same size: many programs turn a model from Y up to Z up when they open it.
2. If each sorted extent equals the reference within 0.5 %, the scale is `ism:scale`.
3. If all three differ from the reference by the same factor *k*, within 0.5 %, the reader
   MUST assume that the unit was changed, or the model scaled as a whole, and use
   `scale_now = ism:scale / k`. A model exported in millimetres instead of metres keeps its
   true size this way. The rule is the counterpart of §6.3.
4. Otherwise the model has been cut, stretched or turned at an angle since the scale was set.
   The reader MUST NOT show a scale, and SHOULD say why.
5. A model without ISM has no measured scale. A reader MAY show a size in the format's own
   unit, the metre for glTF, but MUST say that it was not measured.
6. When the scale holds (rule 2 or 3), the hash says how much of the model is the one
   measured:
   - **The hash agrees:** the vertices are exactly the ones the scale was set on.
   - **It differs:** the model has been simplified, remeshed or written again since. The
     scale still holds, because the size does, but the reader SHOULD say that the geometry
     has changed since it was measured.
7. A reader SHOULD show the method and uncertainty with any measurement, as for an image
   (§6.6, §6.7).

| What happened to the model | Sorted extent | Hash | The reader |
|---|---|---|---|
| Nothing | the same | agrees | shows `ism:scale` |
| Simplified, or written again by another program | the same | differs | shows `ism:scale`, and says the geometry has changed |
| Turned from Y up to Z up | the same | agrees or differs | shows `ism:scale` |
| Exported in millimetres | all × 1000 | differs | shows `ism:scale / 1000` |
| Scaled by a node's transform | all × *k* | agrees | shows `ism:scale / k` |
| Cut in half | in other proportions | differs | shows no scale |

### 13.5 Rules for writers

1. A writer MUST write the four core fields together, or none of them (§5.1).
2. `ism:referenceExtent` and `ism:geometryHash` MUST be those of the file the fields are
   written into, worked out by §13.3 when they are written. They are never copied from
   another file.
3. A writer that changes the model's geometry or transforms MUST work out both again and
   rewrite `ism:scale` to match, or remove the fields. That a reader can follow a change of
   unit (§13.4.3) does not lift this duty, any more than §6.3 lifts §5.3.
4. A writer MUST NOT write ISM for a model whose scale it has not measured. A format's own
   unit is not a measurement: a photogrammetric model scaled by nothing gets no ISM, however
   many metres its file declares.
5. A writer MAY leave an original as it is and write ISM only into the copies it makes, as
   for an image (§5.7).

### 13.6 The uncertainty of a model's scale

`ism:uncertainty` is a relative standard uncertainty, as for an image (§4.2). Each way of
obtaining a model's scale gives it differently:

- **`scanner`:** a scanner's accuracy is usually stated as a maximum permissible error, often
  as *A* + *B* per metre (for instance under VDI/VDE 2634 part 3, or ISO 10360). An error
  limit is not a standard uncertainty. The GUM takes a limit as the edge of a rectangular
  distribution, so the standard uncertainty is the limit divided by √3, at the object's
  length. For a scanner of 0.020 mm + 0.040 mm/m and an object 60 mm long: the limit is
  0.0224 mm, the standard uncertainty 0.0129 mm, and `ism:uncertainty` = 0.00022.
- **`ruler` or `target`** (scale bars or coded targets in photogrammetry): taken from bars
  that were **not** used to scale the model, from their residuals relative to their lengths.
  The residuals of the bars that set the scale understate it, because the solution was fitted
  to them.
- **`calipers`:** a model scaled or checked against a length measured on the object. The
  uncertainty of the calipers and of picking the two points on the model are combined.
- **`ct`:** after the voxel size has been corrected against a reference of calibrated length,
  the uncertainty of the reference and of the correction.

### 13.7 Mappings to what already exists

- **glTF's metre.** For a model whose ISM holds, the true size is extent × `ism:scale`. The
  metre glTF declares is used only when there is no ISM, and then as a size that was not
  measured (§13.4.5).
- **IIIF** (Presentation 4.0, in draft): the `spatialScale` of a Scene that holds the model is
  `ism:scale / 1000` metres per unit. IIIF has no place for method or uncertainty, which ISM
  supplies.
- **Smithsonian Voyager, Sketchfab, Dynamic Collections:** the unit or world scale these keep
  in their scene files or databases can be filled from `ism:scale`.
- **Linked Art and CIDOC CRM:** as for an image (§7.3). A dimension given with its uncertainty
  can also carry lower and upper values (P90a and P90b) at ± twice the standard uncertainty.

### 13.8 Example

The packet of test file `20-model-measured.glb`: an ellipsoid made to be exactly 60 × 20 ×
40 mm, with a little XMP of its own that the writer kept.

```json
{
  "asset": {
    "version": "2.0",
    "extensions": { "KHR_xmp_json_ld": { "packet": 0 } }
  },
  "extensionsUsed": ["KHR_xmp_json_ld"],
  "extensions": {
    "KHR_xmp_json_ld": {
      "packets": [{
        "@context": {
          "xmp": "http://ns.adobe.com/xap/1.0/",
          "ism": "https://w3id.org/ism/0.1/"
        },
        "@id": "",
        "xmp:CreatorTool": "ISM reference tools",
        "ism:version": "0.2",
        "ism:scale": 1000,
        "ism:referenceExtent": { "@list": [0.05999999865889549, 0.019999999552965164, 0.03999999910593033] },
        "ism:geometryHash": "7e9afcdc34bd89dd6ea36121fc32be4c3c12d946664554cd44d6e3de497ee304",
        "ism:method": "other",
        "ism:methodNote": "Made file: an ellipsoid drawn to 60 × 20 × 40 mm, exact by construction",
        "ism:measuredBy": "ISM reference tools",
        "ism:software": "ISM reference tools 0.2"
      }]
    }
  }
}
```

The extent is in metres, glTF's unit, as 32-bit floats store 0.06, 0.02 and 0.04. A reader
works out the same extent and hash from the file, and shows 1000 mm per unit: 60 × 20 × 40 mm.

## 14. Image regions

Version 0.3 lets a part of a picture carry ISM of its own: a surface that lies at another depth
than the one the image's scale holds for, a surface seen at an angle, each of several objects
with its own size, or the ruler the scale was measured against. The parts are IPTC Image Regions (IPTC Photo Metadata
2025.1, §11.20 and §12.6–12.8), which may already carry "any metadata property related to the
region" (§12.6.6). ISM adds no structure of its own. It says which of its fields may stand in a
region, and what they mean there.

The image's own fields stay where they are. A reader that knows nothing of regions reads the
image's core as before, and gets the answer it would get from a file of 0.2 (§14.12).

### 14.1 Where the fields go

- The regions are the image's `Iptc4xmpExt:ImageRegion`, a Bag of region structures, on an
  `rdf:Description` directly under `rdf:RDF`: where the image's own ISM fields stand (§4.0).
  The namespace is `http://iptc.org/std/Iptc4xmpExt/2008-02-29/`.
- A region's ISM fields are written in the region structure itself, beside its
  `Iptc4xmpExt:RegionBoundary`, `rId`, `Name`, `rRole` and `rCtype`, in the ISM namespace. A field
  nested deeper, inside the region's `ArtworkOrObject` for instance, belongs to that structure
  and is not the region's.
- A field in a region never counts for the image. §6 is read from the image's own fields alone.

### 14.2 The fields a region may carry

| Field | In a region |
|---|---|
| `ism:scale` | Millimetres per pixel of the reference grid, for the part of the picture inside the region. It is the region's own, whatever the image's scale is and whatever scales other regions have, even on the same surface: two areas of one surface at different depths, along a diagonal, have a scale each. |
| `ism:homography` | **New in 0.3.** For a surface at an angle, the homography that carries the region onto its plane (§14.7). |
| `ism:plane` | The plane the region's scale holds for (§4.4). |
| `ism:method`, `ism:methodNote`, `ism:uncertainty`, `ism:measuredBy`, `ism:measuredAt` | How, how certainly, by whom and when the region's scale was obtained (§4.2). |
| `ism:objectWidthMm`, `ism:objectHeightMm`, `ism:objectThicknessMm` | The size of the object the region shows, as §4.3 gives the image's object. |
| `ism:lengthMm` | **New in 0.3.** A length known on the object, along a line (§14.3). |

- `ism:homography`, `ism:plane`, `ism:method`, `ism:methodNote`, `ism:uncertainty`,
  `ism:measuredBy` and `ism:measuredAt` describe the region's own scale. A writer MUST NOT write them in a region that
  has no `ism:scale`, and a reader ignores them there. A region with a scale of its own does not
  take them from the image: what the image says about its scale is about another measurement.
- `ism:version`, `ism:referenceWidth`, `ism:referenceHeight`, `ism:objectBox`, `ism:software`
  and a model's fields (§13.1) belong to the image. A writer MUST NOT write them in a region,
  and a reader ignores them there.
- A region's object dimensions are the size of the object in it; they leave the image's own
  object dimensions as they are. They SHOULD agree with the region's outer bounds and the scale
  that holds there, as §4.3 asks of the image's; a reader MAY check this.

### 14.3 A length along a line

| Field | Type | Meaning |
|---|---|---|
| `ism:lengthMm` | Real | The length in millimetres, on the object, between the first two vertices of a polygon: the two ends of a line, or the first edge of a polygon of more, such as a marker's side (§14.7). Greater than 0. |

The length is one known apart from the scale: between two graduations of a ruler in the picture,
along a scale bar, or between two points measured with calipers.

- A writer MUST NOT write a length it only worked out from the scale. That would check the scale
  against itself.
- A reader that finds one can work out the scale again: `ism:lengthMm` divided by the line's
  length in pixels of the reference grid. It compares the result with the scale that holds along
  the line (§14.5). A line along the ruler the scale was measured from, with the role *scale
  reference* (§14.8), lets a reader check `ism:method` = `ruler` or `target` for itself. The
  validator gives the difference, and whether it lies within twice the uncertainty (§6.7).
- On a rectangle, a circle or a point `ism:lengthMm` is ignored.

### 14.4 The grid stays with the image

- A region's scale is in millimetres per pixel of the image's reference grid, the
  `ism:referenceWidth` and `ism:referenceHeight` of the image (§4.1). A region has no grid of its own.
- A reader adjusts a region's scale for the current grid as §6 adjusts the image's: unchanged on
  the same grid, multiplied by referenceWidth / currentWidth on a uniform resize (§6.3). When the
  shape has changed (§6.4), neither the image's scale nor any region's applies.
- **The grid without a scale.** When the scale belongs only to parts of the picture, for instance
  two surfaces side by side with neither of them the image's, the image MAY carry `ism:version`,
  `ism:referenceWidth` and `ism:referenceHeight` without `ism:scale`, as long as at least one
  region carries `ism:scale`. It is the one exception to §5.1. The image then has **no scale of
  its own**: a reader shows none for the image as a whole, and uses each region's inside it. A
  reader of 0.2 finds the core incomplete (§6.1) and shows no scale either. It never shows a wrong
  one. (Test file 33.)
- Without the grid on the image, a region's ISM fields cannot be used. The region is still an
  IPTC region, but it holds nothing a reader of ISM can measure with. (Test file 16.)

### 14.5 Which scale holds where

1. Inside a region with an `ism:scale` of its own, that scale holds, and it goes before the
   image's. The boundary is part of the region, as IPTC has it (§11.20). Each region's scale is
   its own: regions do not share, average or inherit scales, and the image's scale is only what
   holds outside them.
2. Everywhere else the image's scale holds, or none when the image has no scale of its own (§14.4).
3. Where regions with scales of their own overlap and their scales differ, the **inner** one
   holds: the region that lies wholly inside each of the others, while none of them lies inside it.
   A raised detail on a larger surface is the case it is for. Where the regions only partly
   overlap, so that none is inside the others, **no** scale holds there, and a reader MUST NOT
   choose one. Where the scales agree, that scale holds. The order the regions are written in
   decides nothing: `Iptc4xmpExt:ImageRegion` is a Bag, which RDF keeps in no order, and programs
   that rewrite a packet do not keep it either.
4. A point or a line, a polygon of one or two vertices, has no inside: it lends no scale to the
   picture around it.
5. A region without a scale of its own, such as an object or a line, has the scale that holds at
   each of the points that define its boundary: a rectangle's corners, a circle's leftmost,
   rightmost, top and bottom points, a polygon's vertices. When those points lie under different
   scales, it has none.
6. A distance between two points is measured with the scale that holds at both ends. When the
   ends lie under different scales, a reader MUST NOT give a distance, and SHOULD say why: no
   single number is the length of a line that runs from one plane into another. Under a
   homography, both ends lie under the same scale only when they lie under the same homography
   (§14.7).

### 14.6 Boundaries: IPTC's coordinates and ISM's grid

IPTC and ISM count pixels in the same way, so a region needs no conversion.

- **Origin and axes.** IPTC's point zero is the first pixel of the top row as the pixels are
  stored, with x along the row and y downwards, and an orientation given in the metadata "MUST
  NOT be applied" (IPTC §12.7). That is ISM's reference grid, and the grid of `ism:objectBox`
  (§3, §4.3, §6.5). A region, like the box, is turned with the picture when the picture is
  shown turned by its EXIF orientation.
- **Shapes** (`rbShape`). A `rectangle` has `rbX` and `rbY` for its top-left corner and `rbW` and
  `rbH`. A `circle` has its centre at `rbX`, `rbY` and the radius `rbRx`, which IPTC measures
  along the x axis. A `polygon` has its `rbVertices`, a Seq of points, each with `rbX` and `rbY`.
  A polygon of one vertex is a point, and of two a line. A polygon is filled by the even–odd
  rule, and writers SHOULD NOT write one whose edges cross.
- **Units** (`rbUnit`). In `relative`, each x is a fraction of the image's width and each y a
  fraction of its height, from 0 to 1, and a radius is a fraction of the width. In `pixel`, they
  are pixels.
- **Writers write `relative`.** A writer MUST write a region that carries ISM fields in
  `relative` units. IPTC asks that pixel coordinates be rescaled with the picture, but ISM lets a
  resized copy keep its fields as they are (§5.3), and a program that resizes a picture without
  knowing about regions leaves pixel coordinates wrong. Relative coordinates hold through any
  uniform resize, so the two rules agree. Multiplied by `ism:referenceWidth` and
  `ism:referenceHeight` they give pixels of the reference grid; multiplied by the current width
  and height, pixels of the file at hand.
- **Readers read both.** A reader places a region in `pixel` units only while the picture is on
  the grid the region was set on. On a resized copy it MUST NOT place the region or use its
  fields, and SHOULD say why. (Test files 15 and 34.)
- **A quarter turn.** A copy whose pixels were turned by 90° keeps the image's scale (§6.5), but
  which way it was turned cannot be told from its size, so its regions cannot be placed. A reader
  MUST NOT use a region's scale in such a copy. It MAY still show the image's scale, and SHOULD
  say that parts of the picture have scales of their own that it cannot place. A writer that
  turns the pixels MUST turn the regions with them, as it rewrites `ism:objectBox` (§5.4).
  (Test file 35.)
- **A crop** moves the regions as it moves the grid. A writer MUST rewrite the regions or remove
  them, together with the image's fields (§5.4). A crop to the same shape is the same open
  question for regions as for the image (§12.1).
- **Regions in several parts.** IPTC Photo Metadata 2026.1 adds regions that are not contiguous,
  for an object in fragments. Its text had not been published when this draft was written, so
  0.3 follows 2025.1, and will be checked against 2026.1 before 1.0 (§12).

### 14.7 A plane at an angle

A surface that leans towards or away from the camera has no single scale: its near part covers
more pixels per millimetre than its far part, and a length along the slope is shortened more than
one across it. One `ism:scale` for the surface is then an approximation. A **homography** is not:
for a flat surface, it carries every point of the picture onto the surface exactly, in
millimetres. It is what a board with markers at its corners gives, and what four loose markers of
known size on the surface give too.

| Field | Type | Meaning |
|---|---|---|
| `ism:homography` | Seq of 9 Real | **New in 0.3.** The 3 × 3 matrix, row by row, that carries a point of the reference grid onto the plane, in millimetres. Optional, on a region or on the image. |

- **The coordinates.** A point of the reference grid is (x, y) in pixels, from the top-left corner
  of the stored picture, so that the first pixel's centre is (0.5, 0.5); a region's relative
  coordinates multiplied by `ism:referenceWidth` and `ism:referenceHeight` are such points. With
  the nine numbers h₁ … h₉, the point on the plane is X = (h₁x + h₂y + h₃) / w and
  Y = (h₄x + h₅y + h₆) / w, with w = h₇x + h₈y + h₉, in millimetres. The plane's own axes and
  origin are the writer's choice; only distances on the plane are read. A writer SHOULD scale the
  numbers so that h₉ is 1. The matrix MUST NOT be singular.
- **On a copy at another size**, a reader first carries the point back to the reference grid
  (§6.3), then onto the plane. On a copy whose pixels were turned by a quarter turn, the homography
  cannot be used (§14.6), and the stated scale stands in, with a word of warning.
- **The scale beside it.** A region or an image with `ism:homography` MUST also carry
  `ism:scale`: the scale at the middle of the region or of the picture, the square root of the area
  one pixel covers on the plane there. `ism:uncertainty` then says how far the scale strays across
  the region: half the difference between its largest and smallest value, divided by √3, relative
  to `ism:scale`, as for a limit (§13.6). A reader that knows no homography gets an honest
  approximation; a reader that knows one uses the homography and leaves the number aside.
- **A distance** between two points under the same homography is the distance between their
  points on the plane. Both ends MUST lie under the same homography (§14.5). Lengths along the
  slope and across it come out right alike.
- **Where it came from** is said as for any scale. `ism:method` is `target` for a board or markers,
  `calipers` for objects of measured size, and `ism:methodNote` says which. The things it was
  worked out from SHOULD be regions of their own: each marker a polygon of its four corners in the
  picture, with the role *scale reference*, the content type *target*, its identifier in its name,
  and its side as `ism:lengthMm` along the first edge (§14.3); each object of measured size a region
  with its `ism:objectWidthMm` and `ism:objectHeightMm`.
- **A check.** A marker or an object that did not go into the homography checks it. A reader
  carries the marker's first edge, or the object's outline, onto the plane and compares the
  lengths it finds with those the file gives. The residual is worked out by the reader each time,
  not stored, so it cannot go stale. Under a homography a length agrees when it is within one pixel
  of the line it is measured along.
- **What it cannot see.** A homography holds for the plane. An object's upper side lies above the
  plane by the object's thickness, nearer the camera, and so looks larger: an outline traced on
  top of an object 5 mm thick, 500 mm from the lens, is about 1 % too large. A writer that knows the
  thickness SHOULD write `ism:objectThicknessMm`, and a reader SHOULD say so beside a size taken
  through the plane. The picture's lens distortion MUST have been corrected first, or the homography
  holds only near the points it was made from. Neither the camera's tilt nor its distance is
  needed, and ISM records neither (§12).

(Test files 37 and 38.)

### 14.8 Roles and content types

IPTC's region roles and content types (`rRole`, `rCtype`) are Entity or Concept structures, whose
identifier SHOULD come from a controlled vocabulary. IPTC's own vocabularies have no term for
measuring yet. Until they do, ISM gives four terms an address under its namespace:

| Term | Address | For |
|---|---|---|
| Role: *scale reference* | [`https://w3id.org/ism/0.1/role/scaleReference`](https://w3id.org/ism/0.1/role/scaleReference) | What the scale was measured against: a ruler, a target, a scale bar, or a line along one of them (§14.3). |
| Role: *measured object* | [`https://w3id.org/ism/0.1/role/measuredObject`](https://w3id.org/ism/0.1/role/measuredObject) | An object whose size the region gives (§14.2). |
| Content type: *ruler* | [`https://w3id.org/ism/0.1/type/ruler`](https://w3id.org/ism/0.1/type/ruler) | A ruler or a scale bar. |
| Content type: *target* | [`https://w3id.org/ism/0.1/type/target`](https://w3id.org/ism/0.1/type/target) | A calibration target of known geometry. The same region MAY also carry the target fields of IPTC's Image Quality. |

- IPTC's own terms are used beside them where they fit: `mainSubjectArea` for the image's own
  object (§14.9), and `subjectArea` for each of several objects.
- The four terms will be proposed to IPTC for its NewsCodes. When IPTC has terms of its own, this
  section will name them, and writers SHOULD write both until readers have caught up.
- A reader MUST NOT need a role to read a region. The ISM fields say what a region carries; the
  roles tell software that knows no ISM what the region is for.

### 14.9 Rules for writers

1. A writer MUST write only the fields §14.2 allows in a region, and the region in `relative`
   units (§14.6).
2. A file whose regions carry ISM fields MUST have an `ism:version` of `0.3` or later. A file
   without them MAY keep `0.1` or `0.2`.
3. The image MUST carry the reference grid whenever a region carries ISM fields. It MAY leave out
   its own scale only as §14.4 allows.
4. `rId` MUST be unique among the image's regions, as IPTC requires, and `Name` SHOULD be.
5. **The image's object and `ism:objectBox`.** `ism:objectBox` stays, for readers that know one
   box. When the object it describes also has a region, that region SHOULD have IPTC's role
   `mainSubjectArea`, of which a picture normally has one, together with ISM's *measured object*,
   and `ism:objectBox` SHOULD be the region's outer bounds on the reference grid, rounded outwards
   to whole pixels. A polygon then follows the object's outline, and the box is the box around it.
   When the picture shows several objects and none of them is the image's own, a writer leaves
   out `ism:objectBox` and the image's object dimensions, and gives each object a region of its
   own. (Test file 32.)
6. When the pixels move, every region is rewritten or removed (§5.4, §14.6). A resize alone
   leaves `relative` regions as they are.
7. A writer that adds ISM to a packet that already has regions MUST keep them, merging as §4.0
   asks.

### 14.10 Rules for readers

1. A reader reads the image's fields from the image alone, as §6 says, and regions only from the
   image's `Iptc4xmpExt:ImageRegion` (§14.1).
2. It uses a region's ISM fields only when the image has a valid reference grid, and adjusts them
   by §6 (§14.4).
3. It places regions by §14.6, and gives each point the scale §14.5 says, through the homography
   where there is one (§14.7).
4. It ignores the fields a region may not carry, the fields that describe a scale in a region
   without one, and `ism:lengthMm` on anything but a line. A validator SHOULD say so.
5. A region it cannot read, with no boundary, an unknown shape or coordinates outside the
   picture, is ignored with a warning. It never makes the image's own scale invalid.
6. With any measurement, a reader SHOULD show the plane, method and uncertainty of the scale it
   used: the region's, when it used a region's (§4.4, §6.6, §6.7).

### 14.11 Example

The packet of test file 30, shortened to the image, the lower surface of a stepped object and a
bar of known length on that surface:

```xml
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:ism="https://w3id.org/ism/0.1/"
        xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"
        xmlns:xmp="http://ns.adobe.com/xap/1.0/"
        ism:version="0.3"
        ism:scale="0.1"
        ism:referenceWidth="600"
        ism:referenceHeight="400"
        ism:method="ruler"
        ism:uncertainty="0.002"
        ism:plane="Upper surface of the step">
      <Iptc4xmpExt:ImageRegion>
        <rdf:Bag>
          <rdf:li rdf:parseType="Resource">
            <Iptc4xmpExt:rId>lower</Iptc4xmpExt:rId>
            <Iptc4xmpExt:Name><rdf:Alt><rdf:li xml:lang="x-default">Lower surface of the step</rdf:li></rdf:Alt></Iptc4xmpExt:Name>
            <Iptc4xmpExt:RegionBoundary rdf:parseType="Resource">
              <Iptc4xmpExt:rbShape>polygon</Iptc4xmpExt:rbShape>
              <Iptc4xmpExt:rbUnit>relative</Iptc4xmpExt:rbUnit>
              <Iptc4xmpExt:rbVertices>
                <rdf:Seq>
                  <rdf:li rdf:parseType="Resource"><Iptc4xmpExt:rbX>0.6</Iptc4xmpExt:rbX><Iptc4xmpExt:rbY>0.15</Iptc4xmpExt:rbY></rdf:li>
                  <rdf:li rdf:parseType="Resource"><Iptc4xmpExt:rbX>0.96</Iptc4xmpExt:rbX><Iptc4xmpExt:rbY>0.15</Iptc4xmpExt:rbY></rdf:li>
                  <rdf:li rdf:parseType="Resource"><Iptc4xmpExt:rbX>0.96</Iptc4xmpExt:rbX><Iptc4xmpExt:rbY>0.85</Iptc4xmpExt:rbY></rdf:li>
                  <rdf:li rdf:parseType="Resource"><Iptc4xmpExt:rbX>0.61</Iptc4xmpExt:rbX><Iptc4xmpExt:rbY>0.85</Iptc4xmpExt:rbY></rdf:li>
                </rdf:Seq>
              </Iptc4xmpExt:rbVertices>
            </Iptc4xmpExt:RegionBoundary>
            <ism:scale>0.125</ism:scale>
            <ism:plane>Lower surface of the step</ism:plane>
            <ism:method>ruler</ism:method>
            <ism:uncertainty>0.002</ism:uncertainty>
          </rdf:li>
          <rdf:li rdf:parseType="Resource">
            <Iptc4xmpExt:rId>lower-bar</Iptc4xmpExt:rId>
            <Iptc4xmpExt:Name><rdf:Alt><rdf:li xml:lang="x-default">Bar on the lower surface, 24 mm</rdf:li></rdf:Alt></Iptc4xmpExt:Name>
            <Iptc4xmpExt:RegionBoundary rdf:parseType="Resource">
              <Iptc4xmpExt:rbShape>polygon</Iptc4xmpExt:rbShape>
              <Iptc4xmpExt:rbUnit>relative</Iptc4xmpExt:rbUnit>
              <Iptc4xmpExt:rbVertices>
                <rdf:Seq>
                  <rdf:li rdf:parseType="Resource"><Iptc4xmpExt:rbX>0.62</Iptc4xmpExt:rbX><Iptc4xmpExt:rbY>0.755</Iptc4xmpExt:rbY></rdf:li>
                  <rdf:li rdf:parseType="Resource"><Iptc4xmpExt:rbX>0.94</Iptc4xmpExt:rbX><Iptc4xmpExt:rbY>0.755</Iptc4xmpExt:rbY></rdf:li>
                </rdf:Seq>
              </Iptc4xmpExt:rbVertices>
            </Iptc4xmpExt:RegionBoundary>
            <Iptc4xmpExt:rRole>
              <rdf:Bag>
                <rdf:li rdf:parseType="Resource">
                  <xmp:Identifier><rdf:Bag><rdf:li>https://w3id.org/ism/0.1/role/scaleReference</rdf:li></rdf:Bag></xmp:Identifier>
                  <Iptc4xmpExt:Name><rdf:Alt><rdf:li xml:lang="x-default">scale reference</rdf:li></rdf:Alt></Iptc4xmpExt:Name>
                </rdf:li>
              </rdf:Bag>
            </Iptc4xmpExt:rRole>
            <Iptc4xmpExt:rCtype>
              <rdf:Bag>
                <rdf:li rdf:parseType="Resource">
                  <xmp:Identifier><rdf:Bag><rdf:li>https://w3id.org/ism/0.1/type/ruler</rdf:li></rdf:Bag></xmp:Identifier>
                  <Iptc4xmpExt:Name><rdf:Alt><rdf:li xml:lang="x-default">ruler</rdf:li></rdf:Alt></Iptc4xmpExt:Name>
                </rdf:li>
              </rdf:Bag>
            </Iptc4xmpExt:rCtype>
            <ism:lengthMm>24</ism:lengthMm>
          </rdf:li>
        </rdf:Bag>
      </Iptc4xmpExt:ImageRegion>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
```

A reader shows 0.1 mm/px for the image, and 0.125 mm/px inside the polygon. The bar runs from
0.62 to 0.94 of the width, 192 px on the reference grid, so its 24 mm give 0.125 mm/px again,
and the check agrees. In a copy at half the size, the two scales are 0.2 and 0.25 mm/px, and
the bar still measures 24 mm.

### 14.12 What a reader of 0.2 sees

| The file | A reader that knows no regions | A reader of 0.3 |
|---|---|---|
| The image's scale, and regions with scales of their own | The image's scale, everywhere | The image's scale, and each region's inside it |
| Several objects, each in a region with its size | The image's scale, and `ism:objectBox` for the image's object | Each object with its own size |
| Only the regions have a scale | No scale: the core is incomplete | No scale for the image, and each region's inside it |
| A region in pixels, in a resized copy | The image's scale | The image's scale; the region cannot be placed |
| A copy turned by a quarter turn | The image's scale | The image's scale, and a word that parts of it have scales it cannot place |
| A surface at an angle, with a homography | The image's scale, if it has one; nothing from the region | The plane's true lengths along and across the slope |

No file of 0.3 makes a reader of 0.2 show a wrong scale. What it cannot see is where the image's
scale does not hold.
