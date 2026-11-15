# Image Scale Metadata (ISM)

**Draft 0.3 — comments welcome.** 0.3 adds ISM in IPTC Image Regions, so that
one picture can carry a scale per plane and a size per object; 0.2 added
three-dimensional models. Nothing in either changes what a file of 0.1 means.
The published texts of 0.1 and 0.2 are kept in `0.1/` and `0.2/`.

A small, open format for carrying the true scale of an image inside the image
file itself: how many millimetres one pixel covers on the object, which pixel
grid that holds for, and how it was measured. Any program can then draw a
correct scale bar or measure the object — after the file has been copied,
resized or turned, as long as the software on the way kept the file's XMP —
without a ruler in the frame and without the software that made it.

The idea is the one medical imaging has in DICOM: an X-ray says how big a
pixel is, so a viewer can show true size.

## The fields

Four required fields, in the file's XMP, namespace `https://w3id.org/ism/0.1/`
(registered at w3id.org; https://w3id.org/ism/ leads here):

| Field | Meaning |
|---|---|
| `ism:version` | `0.1` |
| `ism:scale` | millimetres per pixel on the measured plane |
| `ism:referenceWidth` | width in pixels of the image the scale was set on |
| `ism:referenceHeight` | height in pixels of the same |

Recommended: `method` (ruler, calipers, target, optics, scanner, ct, other), `methodNote`,
`uncertainty`, `measuredBy`, `measuredAt`, `software`, `plane`. Optional:
`objectBox`, `objectWidthMm`, `objectHeightMm`, `objectThicknessMm`.

A reader uses the scale as written when the image has the reference size;
scales it when the image has the same shape at another size; keeps it when
the image is turned by 90°; and refuses it otherwise, because the image has
been cropped or changed.

## Regions

Since 0.3 a part of the picture can carry ISM of its own, in an IPTC Image
Region (`Iptc4xmpExt:ImageRegion`): a rectangle, a circle or a polygon, with a
point and a line as polygons. The image's own fields stay where they are, so a
reader that knows no regions gets the answer it always got.

| In a region | Meaning |
|---|---|
| `ism:scale`, `plane`, `method`, `methodNote`, `uncertainty`, `measuredBy`, `measuredAt` | A scale of the region's own, for another plane, and how it was obtained. It holds inside the region and goes before the image's there |
| `ism:objectWidthMm`, `objectHeightMm`, `objectThicknessMm` | The size of the object in the region |
| `ism:homography` | For a surface seen at an angle: the 3 × 3 matrix that carries the picture onto its plane in mm, so that lengths along and across the slope both come out right. Written beside `ism:scale`, the scale at its centre |
| `ism:lengthMm` | On a line, or a marker's first edge: its length on the object, known apart from the scale, so a reader can check the scale |

Each region's scale is its own. Where regions with different scales overlap,
the inner one holds, and where they only partly overlap none does. Regions are
written in `relative` units. The grid stays on the image; when only the regions
have a scale, the image carries the grid alone and has no scale of its own.

## Models

A three-dimensional model carries the same fields in glTF's `KHR_xmp_json_ld`
extension, with two of its own in place of the pixel grid:

| Field | Meaning |
|---|---|
| `ism:scale` | millimetres per model unit (1000 for a glTF whose metres are true) |
| `ism:referenceExtent` | the model's width, height and depth in model units when the scale was set |
| `ism:geometryHash` | SHA-256 of its vertices when the scale was set |

A reader works both out again from the file. The same size keeps the scale; the
same proportions at another size (a unit changed) rescale it; other proportions
refuse it. The hash says whether the vertices are still the ones measured.

## What is here

| Path | What |
|---|---|
| `js/ism.js` | Reference reader and writer, no dependencies, browser and Node 18+. Reads and writes regions |
| `python/ism.py` | The same reader and writer for Python, standard library only. Reads regions |
| `viewer/` | A web page that opens an image, reads its ISM and draws the scale and the regions, measuring by the scale that holds where the line is drawn — and, for a JPEG with a ruler in the picture, writes the scale into the file: drag along the ruler, give its length, download. Other metadata in the file is kept. Nothing is uploaded |
| `validator/` | A web page that checks a file's ISM and its regions, and gives the level it reaches: A, B, C, and D for regions |
| `tools/make-testfiles.mjs` | Makes test files (measured, resized, turned, cropped, none) from one measured JPEG (macOS) |
| `tools/make-model-testfiles.mjs` | Makes the model test files (measured, simplified, turned, in millimetres, cut, none) from nothing |
| `tools/make-raster-testfiles.mjs` | Makes the PNG and TIFF test files, and the region files, from nothing |
| `tools/make-fingerprint-testfiles.mjs` | Makes the fingerprint test files and `testfiles/fingerprints.json` |
| `testfiles/` | Test files made from a published find, made images and made models, with the expected result for each |
| `test/` | Tests: `npm test`, and for Python `python3 -m unittest discover -s python` |

## Running the viewer

Serve the folder and open `/viewer/`:

```
python3 -m http.server 8765
```

Then open http://localhost:8765/viewer/ and drop an image on it.

## Test files

| File | Size | Expected |
|---|---|---|
| `01-measured.jpg` | 964 × 627 | 0.07490 mm/px, as written |
| `02-resized-half.jpg` | 482 × 314 | 0.1498 mm/px (resized) |
| `03-turned.jpg` | 627 × 964 | 0.07490 mm/px (turned 90°) |
| `04-cropped-square.jpg` | 627 × 627 | refused: cropped |
| `05-cropped-same-shape.jpg` | 482 × 314 | **known limit**: a crop that keeps the shape is read as a resize, so the scale shown is wrong. Open question 1 for 0.2 |
| `06-no-ism.jpg` | 964 × 627 | no ISM |

Made from `testfiles/desktop/ism-a123-calipers.jpg` with
`node tools/make-testfiles.mjs testfiles/desktop/ism-a123-calipers.jpg 0.07490277 testfiles`.

### From the PHOTARCH app

`testfiles/desktop/` holds four exports from the first implementation (copied from the
PHOTARCH vault). All four read without problems; `objectBox` × `scale` matches the
object sizes within 0.02 mm, and the file resolution matches the scale (inch unit).
In `ism-dl-56-with-scale-bar.jpg` the burned-in 5 mm bar is 135 px; the viewer draws 134.5 px.

## Licence

Code: MIT. The specification will be published under CC BY 4.0.
