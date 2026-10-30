---
layout: default
title: Image Scale Metadata (ISM) 0.2
toc: true
---

<div class="hero">
<p class="hero__eyebrow">Specification · version 0.2 · draft for comment</p>
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
<dd>Draft 0.2 for comment, 22 October 2026, with USD and USDZ added on 30 October 2026. Adds three-dimensional models (§13) and two ways of obtaining a scale, <code>scanner</code> and <code>ct</code> (§4.2). Nothing about images has changed; <a href="0.1/">version 0.1</a> is kept as it was published.</dd>
<dt>Comments</dt>
<dd>Welcome — open an <a href="https://github.com/image-scale-metadata/image-scale-metadata.github.io/issues">issue</a>.</dd>
<dt>Editor</dt>
<dd>Daniel Lindskog (PHOTARCH)</dd>
<dt>Licence</dt>
<dd>This specification, CC BY 4.0; the code in this repository, MIT.</dd>
<dt>Namespace</dt>
<dd><code>https://w3id.org/ism/0.1/</code>, unchanged in 0.2 (§4)</dd>
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
describes how the result is carried in the file, so that it survives copying, export and
import into another system.

## 2. Scope

- **Still images of objects** photographed or scanned so that the object plane is
  roughly parallel to the image plane: finds on a copy stand, flat objects, documents,
  one face of a three-dimensional object.
- The scale is valid **in one plane**: the plane in which it was measured (§4.4). ISM makes
  no claim for depth.
- **Three-dimensional models of objects**, in glTF and GLB, and in other formats through a
  sidecar: §13.
- Out of scope in 0.2: perspective-corrected images with a non-uniform scale, video, and
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
WebP, HEIF, DNG and PDF, and are kept by the tools that keep XMP.

- **Namespace URI:** `https://w3id.org/ism/0.1/` — registered at w3id.org; it resolves to this specification.
- **Preferred prefix:** `ism`

The namespace keeps its address through the 0.x versions. Version 0.2 only adds fields and
values, so a file written to 0.1 is a valid 0.2 file and a reader of 0.1 still reads an image
written to 0.2. `ism:version` says which text the writer followed.

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
measurement they display.

## 5. Rules for writers

1. A writer MUST write the four core fields together, or none of them.
2. `ism:referenceWidth` and `ism:referenceHeight` MUST be the pixel dimensions of the file
   the fields are written into, at the moment they are written.
3. When a writer **resizes** an image it keeps ISM in, it MUST either leave the fields
   unchanged (readers rescale, §6) or rewrite `ism:scale` and both reference dimensions to
   the new grid. It MUST NOT change one without the other.
4. When a writer **crops, rotates by other than 90°, corrects perspective or otherwise
   moves pixels**, it MUST recompute the fields for the new grid or remove all of them. A
   crop keeps the size of a pixel but changes the grid, and a reader cannot tell a crop
   from a resize by the dimensions alone.
5. A writer SHOULD also set the file's resolution to match (§7.1), so that software that
   does not know ISM still gets the right answer where it can.
6. A writer MUST NOT write ISM for an image whose scale it has not measured. An estimate
   is written with `ism:method` = `other` and an honest `ism:uncertainty`.
7. A writer MAY leave a file it passes on unchanged — an original kept byte for byte —
   without ISM, and write the fields only into the copies it makes. `ism:uncertainty` is
   left out when there is no real figure for it; a guessed one is worse than none.

## 6. Rules for readers

1. A reader MUST check that all four core fields are present and valid before using the
   scale.
2. If the current grid equals the reference grid, the scale is `ism:scale`.
3. If the current grid differs but has the same aspect ratio (within 0.5 %), the reader
   MUST assume a uniform resize and use
   `scale_current = ism:scale × referenceWidth / currentWidth`.
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
that physical dimensions are often missing or unreliable; ISM's method and uncertainty are
what make the number trustworthy.

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

- **DICOM**: the medical model, where every viewer shows a true scale because the file
  says how large a pixel is. ISM is that idea for heritage images, and the parallel runs
  deeper than the one field usually cited:
  - `ImagerPixelSpacing` (0018,1164) is the distance between pixel centres **on the
    detector**; `PixelSpacing` (0028,0030) is the distance **in the patient**. The
    standard states that the first "shall never be adjusted to account for calibration
    against an object of known size" — that is what the second exists for. This is §5.2
    of this specification, arrived at independently: a scale describes one pixel grid,
    and writing it onto another grid gives a confident wrong answer.
  - `EstimatedRadiographicMagnificationFactor` (0018,1114) relates the two planes, the
    way §6.3 relates a resized copy to the grid the scale was measured on.
  - `PixelSpacingCalibrationType` (0028,0A02) and `CalibrationDescription` record *how*
    the calibration was obtained — a controlled value beside free text, which is what
    `method` and `methodNote` are here.

  Projection radiography had to make these distinctions explicit because getting them
  wrong is clinically consequential (NEMA CP-586). Nothing about them is medical: they
  follow from measuring anything at all from an image.
- **Metamorfoze, FADGI, ISO 19264-1**: image quality, not scale. They say how well a
  picture is taken; ISM says how large what it shows is. The two are complementary.

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
  geometry of other model formats is not read yet. Swift to come.)*
- **Test files** with the answer a reader must give for each. *(Done in 0.1:
  [the set](testfiles/) covers JPEG, PNG and TIFF, resized, turned and cropped; in 0.2 also
  models, simplified, turned, rewritten in millimetres and cut.)*
- A **validator**: a web page where a file can be dropped and checked.
  *(Done in 0.1: [the validator](validator/), which reads models too since 0.2.)*
- A **viewer demo**: a plain web page, not PHOTARCH, that opens a file and draws its scale.
  *(Done in 0.1: [the viewer](viewer/), which also writes the scale into a file that has none.)*
- The namespace at a neutral address that does not depend on any company: done in 0.1,
  `https://w3id.org/ism/`.

## 11. Governance (to be agreed with an academic partner)

- The specification is edited in a public repository; changes by pull request and a short
  public comment period.
- Version 1.0 is intended to be published jointly with an academic partner. Later
  versions are decided by a small working group; the first change made by someone other
  than the original editor is the sign that it is a standard.

## 12. Open questions for 0.3

1. **Crop to the same aspect ratio** cannot be detected from the dimensions (§5.4). Add a
   content fingerprint of the reference grid, or accept the rule that writers must update?
2. **Units**: millimetres only, or allow micrometres for very small objects? (A real field:
   `ism:scale` = 0.001 is already 1 µm/px.)
3. **Several planes**: an object photographed with two scales (top and base)?
4. **Relation to 3D**: answered in 0.2 — models are described in the same namespace (§13).
   ISM in USD and USDZ was added on 30 October 2026 (§13.2, §13.3). Still open: instanced prims
   in USD; packets on single nodes, for a model whose parts were measured apart; and skinned or
   morphing meshes, which 0.2 reads in their rest pose.
5. **Name**: "Image Scale Metadata" is a working name. Decide with the partner.
6. **Where the namespace lives**: settled at w3id.org, which can be pointed at a university
   address later without changing any file.

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
  layer does not state one.
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
