---
layout: default
title: Image Scale Metadata (ISM) 0.1
---

# Image Scale Metadata (ISM) — version 0.1, draft

**Status:** draft for comment, 21 September 2026. **Comments welcome** — open an
[issue](https://github.com/image-scale-metadata/image-scale-metadata.github.io/issues).
"Image Scale Metadata" is a working name.

**Editor:** Daniel Lindskog (PHOTARCH).
**Licence:** this specification, CC BY 4.0; the code in this repository, MIT.

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

ISM does not describe how to photograph an object, nor how to measure one. It only
describes how the result is carried in the file, so that it survives copying, export and
import into another system.

## 2. Scope

- **Still images of objects** photographed or scanned so that the object plane is
  roughly parallel to the image plane: finds on a copy stand, flat objects, documents,
  one face of a three-dimensional object.
- The scale is valid **in one plane**: the plane in which it was measured (§4.4). ISM makes
  no claim for depth.
- Out of scope in 0.1: 3D models, perspective-corrected images with a non-uniform scale,
  video, and images of scenes rather than objects.

## 3. Terms

| Term | Meaning |
|---|---|
| **Scale** | The length on the object, in millimetres, covered by one pixel of the reference grid, in the measured plane. Written `mm/px`. |
| **Reference grid** | The pixel width and height of the image the scale was measured on, as stored in the file (before any EXIF orientation is applied). |
| **Current grid** | The pixel width and height of the file being read. |
| **Writer** | Software that puts ISM fields into a file. |
| **Reader** | Software that reads them and shows or uses the scale. |

"MUST", "SHOULD" and "MAY" are used as in RFC 2119.

## 4. The fields

ISM fields live in an XMP namespace of their own, so they travel with JPEG, TIFF, PNG,
WebP, HEIF, DNG and PDF, and are kept by the tools that keep XMP.

- **Namespace URI:** `https://w3id.org/ism/0.1/` — registered at w3id.org; it resolves to this specification.
- **Preferred prefix:** `ism`

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

A file MUST carry **one** XMP packet in force. A writer that adds ISM to a file that already has
XMP MUST merge into that packet rather than add a second (§5). A reader MUST take the packet from
where the format says it is, not from the first thing in the bytes that looks like one: a file can
keep an old packet that nothing points at any more.

**A sidecar** — For a format that cannot hold XMP, or a file that must not be rewritten, the
packet MAY be written beside it as `<name>.xmp`, with the same base name. The sidecar holds the
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
| `ism:method` | Closed choice | `ruler` (a ruler or scale in the picture), `calipers` (a length measured on the object and entered), `target` (a calibration target of known geometry in the picture), `optics` (known distance and focal length), `other`. |
| `ism:methodNote` | Text | Free description, e.g. "calipers, length of the blade, 42.80 mm". |
| `ism:uncertainty` | Real | Relative standard uncertainty of `ism:scale`, as a fraction: `0.005` is ±0.5 %. |
| `ism:measuredBy` | Text | Person or organisation that measured. |
| `ism:measuredAt` | Date | ISO 8601 date the scale was set. |
| `ism:software` | Text | Software and version that wrote the scale, e.g. "PHOTARCH Desktop 1.0". |

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

`ism:objectWidthMm` and `ism:objectHeightMm` map to Linked Art `dimension` entries with a
unit of millimetres and a method that names "measured from a scaled photograph". ISM does
not replace a museum's own recorded dimensions; it says how large the object is **in this
picture**.

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
        ism:software="PHOTARCH Desktop 1.0"
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

The reference implementation and test files (§10) decide what "correct" means in practice:
a writer or reader conforms when it passes them.

## 10. What will be published with 1.0

- This specification, versioned, under **CC BY 4.0**, with a DOI (Zenodo).
- A **reference library** that reads and writes ISM — under **MIT**.
  *(Done in 0.1: [JavaScript](https://github.com/image-scale-metadata/image-scale-metadata.github.io/blob/main/js/ism.js)
  and [Python](https://github.com/image-scale-metadata/image-scale-metadata.github.io/blob/main/python/ism.py),
  both reading and writing JPEG, PNG and TIFF, and checked against each other by the test files.
  Swift to come.)*
- **Test files** with the answer a reader must give for each. *(Done in 0.1:
  [the set](testfiles/) covers JPEG, PNG and TIFF, resized, turned and cropped.)*
- A **validator**: a web page where a file can be dropped and checked.
  *(Done in 0.1: [the validator](validator/).)*
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

## 12. Open questions for 0.2

1. **Crop to the same aspect ratio** cannot be detected from the dimensions (§5.4). Add a
   content fingerprint of the reference grid, or accept the rule that writers must update?
2. **Units**: millimetres only, or allow micrometres for very small objects? (A real field:
   `ism:scale` = 0.001 is already 1 µm/px.)
3. **Several planes**: an object photographed with two scales (top and base)?
4. **Relation to 3D**: should a model's units (GLB in millimetres) be described in the
   same namespace?
5. **Name**: "Image Scale Metadata" is a working name. Decide with the partner.
6. **Where the namespace lives**: settled at w3id.org, which can be pointed at a university
   address later without changing any file.
