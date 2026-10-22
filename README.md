# Image Scale Metadata (ISM)

**Draft 0.2 — comments welcome.** 0.2 adds three-dimensional models; nothing
about images has changed since 0.1, which is kept in `0.1/`.

A small, open format for carrying the true scale of an image inside the image
file itself: how many millimetres one pixel covers on the object, which pixel
grid that holds for, and how it was measured. Any program can then draw a
correct scale bar or measure the object — after the file has been copied,
resized or turned — without a ruler in the frame and without the software that
made it.

The idea is the one medical imaging settled long ago: every X-ray says how big
a pixel is, so every viewer shows true size.

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
| `js/ism.js` | Reference reader and writer, no dependencies, browser and Node 18+ |
| `viewer/` | A web page that opens an image, reads its ISM and draws the scale — and, for a JPEG with a ruler in the picture, writes the scale into the file: drag along the ruler, give its length, download. Other metadata in the file is kept. Nothing is uploaded |
| `tools/make-testfiles.mjs` | Makes test files (measured, resized, turned, cropped, none) from one measured JPEG (macOS) |
| `tools/make-model-testfiles.mjs` | Makes the model test files (measured, simplified, turned, in millimetres, cut, none) from nothing |
| `testfiles/` | Test files made from a published find, made images and made models, with the expected result for each |
| `test/` | Tests: `npm test` |

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
