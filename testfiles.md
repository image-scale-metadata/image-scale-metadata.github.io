---
layout: default
permalink: /testfiles/
title: Image Scale Metadata — test files
description: Files with known scale, and the answer a reader must give for each.
---

# Test files

Each file below carries Image Scale Metadata, or deliberately does not. Beside it is the answer a
correct reader gives. A reader conforms when it gives these answers; a writer conforms when the
files it makes are read correctly by a reader that does.

Download them from the
[repository](https://github.com/image-scale-metadata/image-scale-metadata.github.io/tree/main/testfiles),
or open one in the [viewer](viewer/).

## Photographs (JPEG)

Made from one measured photograph of an object: **0.07490277 mm per pixel** on a 964 × 627 grid.
A 50 mm bar is 668 px in the file it was measured in.

| File | What was done to it | The answer |
|---|---|---|
| `01-measured.jpg` | Nothing: the measured file, 964 × 627 | 0.074903 mm/px |
| `02-resized-half.jpg` | Resized to 482 × 314 | 0.149806 mm/px — the reader rescales (§6.3) |
| `03-turned.jpg` | Turned a quarter turn, 627 × 964 | 0.074903 mm/px — turning does not change the scale (§6.5) |
| `04-cropped-square.jpg` | Cropped to 627 × 627 | **No scale.** The shape changed, so the fields no longer apply (§6.4) |
| `05-cropped-same-shape.jpg` | Cropped to 482 × 314, the same shape as a half-size copy | The reader **cannot tell** this from a resize: it answers 0.149806 mm/px, which is wrong. See below |
| `06-no-ism.jpg` | The photograph without ISM | **No scale.** Nothing to read |

**What file 05 proves.** A crop to the same aspect ratio is indistinguishable from a resize by the
dimensions alone, so a reader that follows §6 gives a wrong answer in good faith. The format cannot
fix this from the reading end; it is why §5.4 puts the duty on the writer — a program that crops
MUST rewrite the fields or remove them. The file is in the set so that implementers meet the limit
on purpose rather than by accident.

## The fingerprint (PNG), since 0.3

One made picture of 600 × 400 px at 0.1 mm/px, given `ism:fingerprint` (§4.5), and five copies made
from its pixels by a program that knows nothing of ISM: the packet is the same in all six. Each
has two answers: the one a reader gives when it has the pixels and compares, and the one it gives
from the dimensions alone. The second is in the table to show what the fingerprint is for.

| File | What it is | With the pixels | From the dimensions alone |
|---|---|---|---|
| `40-png-fingerprint.png` | As measured, 600 × 400 | 0.1 mm/px | 0.1 mm/px |
| `41-png-fingerprint-resized-half.png` | Resized to 300 × 200 | 0.2 mm/px, checked | 0.2 mm/px |
| `42-png-fingerprint-turned-resized-half.png` | Resized, then turned a quarter turn clockwise: 200 × 300 | 0.2 mm/px, checked; turned 90° clockwise | 0.2 mm/px |
| `43-png-fingerprint-cropped-same-shape.png` | The middle 300 × 200 cut out | **No scale.** Cropped | 0.2 mm/px, which is wrong: the pixels are still 0.1 mm |
| `44-png-fingerprint-cropped-upright.png` | An upright 266 × 400 cut out | **No scale.** Cropped | 0.15 mm/px, which is wrong |
| `45-png-fingerprint-cropped-by-a-twentieth.png` | 570 × 380, a twentieth cut from the edges | **No scale.** Cropped | 0.105263 mm/px, which is wrong |

`fingerprints.json` holds the fingerprint each of the six pictures has now, and the fingerprints
of one run of made bytes read as grey, grey with alpha, RGB and RGBA. An implementation's
arithmetic is right when it gives the same characters.

## Objects, as they leave PHOTARCH

Four files written by an implementation, for reading against: `ism-a123-calipers.jpg`
(0.074903 mm/px), `ism-brons-13-full-size.jpg` (0.054570), `ism-dl-56-with-scale-bar.jpg`
(0.037167) and `ism-guld-tiff-adobe-rgb.tiff` (0.041713, a TIFF in Adobe RGB). All four were
measured with calipers, and all four say so in `ism:method`.

## Made files (PNG and TIFF)

Drawn rather than photographed, so that every number in them is known exactly: a grey ground, an
object block 30 × 20 mm, and a bar exactly 50 mm long. The scale is 0.1 mm per pixel on a
600 × 400 grid, so the bar is 500 px in the full-size files.

| File | What it is | The answer |
|---|---|---|
| `10-png-measured.png` | PNG, iTXt packet, 600 × 400 | 0.1 mm/px. The drawn bar is 500 px and measures 50.0 mm |
| `11-png-resized-half.png` | The same picture at 300 × 200 | 0.2 mm/px. The bar is 250 px, still 50.0 mm |
| `12-tiff-measured.tif` | TIFF, tag 700, 600 × 400 | 0.1 mm/px |
| `13-tiff-resized-half.tif` | TIFF at 300 × 200 | 0.2 mm/px |
| `14-png-no-ism.png` | The same PNG without ISM | **No scale** |
| `15-png-region-with-scale.png` | The measured PNG, plus an IPTC Image Region around the bar that carries ISM of its own: 0.15 mm/px for the surface the bar lies on | 0.1 mm/px. The region's scale holds inside the region only; it is not the image's. Since 0.3, a reader that knows regions uses 0.15 inside it. The region is in pixels, which 0.3 asks writers not to do (§14.6), and holds only because the file is on the grid it was set on |
| `16-png-region-only.png` | The same PNG with only that region: the image itself has no ISM | **No scale.** A region's fields do not stand in for the image's, and without the image's grid they cannot be used at all (§14.4) |

The bar is the check that needs no software: measure it with the reader's own measuring tool, and
it must come out at 50 mm in every file that has a scale.

## Regions (PNG), since 0.3

ISM in IPTC Image Regions (§14). Drawn like the PNG and TIFF set, on a 600 × 400 grid, with every
length a whole number of pixels and every region corner a round fraction of the picture, so that
each answer can be worked by hand. Points are given in pixels of the file as stored; on the tilted board, as points of the board in millimetres. Every region
is in `relative` units except where the file says otherwise.

| File | What it is | The answer |
|---|---|---|
| `30-png-two-planes.png` | A stepped object. The image's scale, 0.1 mm/px, is for the upper surface, where a 30 mm bar is 300 px. A polygon around the lower surface, further from the camera, carries its own scale, 0.125 mm/px, and a 24 mm bar lies on it, 192 px. Each bar has a line region with `ism:lengthMm` | 0.1 mm/px for the image. Inside the polygon, 0.125 mm/px: at (450, 200), say. The bar on the lower surface measures 24 mm and the one on the upper 30 mm, and both lines check out against the scale that holds there (§14.3). A line from (100, 100) to (450, 200) has **no length**: its ends lie under different scales (§14.5) |
| `31-png-two-planes-resized-half.png` | The same picture at 300 × 200, with the same packet | 0.2 mm/px for the image, 0.25 inside the polygon. The lower bar is 96 px and still 24 mm |
| `32-png-several-objects.png` | Three objects on one board, each a region of its own with its size: a coin (a circle, 18 mm across, the image's own object), a block (a rectangle, 12 × 8 mm) and a shard (a polygon, 12 × 15 mm across its bounds). A rectangle around the 48 mm ruler, and a line along it with its length | 0.1 mm/px. Each object's bounds by the scale come out at its stated size. The coin is marked IPTC *main subject area*, and `ism:objectBox` is its bounds, 210, 60, 180, 180 (§14.9). The ruler's line checks out |
| `33-png-regions-only-scale.png` | Two surfaces side by side, neither of them the image's: the left at 0.1 mm/px, the right at 0.2. The image has the grid and no scale of its own (§14.4). A 20 mm bar on each, 200 and 100 px | **No scale for the image.** Inside the left region 0.1 mm/px, inside the right 0.2; between them, at x = 300, none. Both bars measure 20 mm. A reader of 0.2 also shows no scale: it finds the core incomplete |
| `34-png-region-in-pixels-resized-half.png` | File 15 at half size, its region still in pixels | 0.2 mm/px for the image. The region **cannot be placed**: its pixels no longer fit a resized copy (§14.6) |
| `35-png-two-planes-turned.png` | File 30 turned a quarter turn, 400 × 600, its regions as they were | 0.1 mm/px for the image. The regions **cannot be placed**, since which way the picture was turned cannot be told (§14.6); a reader says that parts of the picture have scales it cannot place |
| `37-png-tilted-board.png` | A board 80 × 60 mm, tilted away from the camera: its far edge is 300 px wide, its near edge 520 px. Four markers 18 mm square at its corners, ids 12 to 15, each a region with its side as `ism:lengthMm`, and a block 20 × 10 mm measured with calipers. The board's region carries the plane's homography, and `ism:scale` 0.212766 mm/px for its centre, with `ism:uncertainty` 0.232 for how far the scale strays across it. The image has the grid and no scale | **No scale for the image.** On the board, every distance through the homography: 60 mm along it, 50 mm across it, 72.11 mm on the slant (60 by 40), wherever the line is drawn. The stated scale alone would make the 60 mm of the far edge too short and of the near edge too long. Each marker's side checks out at 18 mm, within a pixel, and the block at 20 × 10 mm (§14.7) |
| `38-png-tilted-board-resized-half.png` | File 37 at 300 × 200, with the same packet | The same lengths. The scale at the board's centre is 0.425532 mm/px |
| `36-png-two-planes-rewritten-by-exiftool.png` | File 30 after ExifTool 13.55 added a title to it (`exiftool -XMP-dc:Title=Rewritten`): the same packet in ExifTool's own form, with single quotes, its own order, and the image's ISM in a description of its own | The answers of file 30. ExifTool keeps the ISM fields inside the regions when it edits a file |

A reader that knows no regions gives each of these files the image's answer, and never a region's.

## Models (GLB)

Made from nothing, like the PNG and TIFF set: an ellipsoid exactly **60 × 20 × 40 mm** (x × y × z,
with y up, as glTF stands a model), written in metres and given ISM by the reference writer
(§13). Every other file is the measured one changed the way models are changed between programs,
and keeps the measured file's packet, as a program that kept the metadata would. The measured
file also has a little XMP of its own, which the writer kept beside ISM.

| File | What was done to it | The answer |
|---|---|---|
| `20-model-measured.glb` | Nothing | 1000 mm per unit: 60 × 20 × 40 mm. The vertices are the ones measured |
| `21-model-decimated.glb` | Simplified, from 2112 vertices to 144 | 1000 mm per unit, 60 × 20 × 40 mm. The hash differs, so the reader says the geometry has changed (§13.4.6) |
| `22-model-turned.glb` | Stood on end by its node, Y up to Z up | 1000 mm per unit: 60 × 40 × 20 mm along the file's axes. Turning does not change the size (§13.4.1) |
| `23-model-in-millimetres.glb` | Exported in millimetres: every coordinate × 1000 | 1 mm per unit, still 60 × 20 × 40 mm (§13.4.3) |
| `24-model-cut.glb` | Cut in half along its length | **No scale.** The proportions changed (§13.4.4) |
| `25-model-no-ism.glb` | The model without ISM | **No measured scale.** The file's own metres say 60 × 20 × 40 mm, but nothing says that was measured (§13.4.5) |

All six are valid glTF 2.0 by the Khronos glTF Validator (2.0.0-dev.3.10), with no errors or
warnings, and the packet is read by glTF-Transform's `KHR_xmp_json_ld` support.

## How they are made

`node tools/make-testfiles.mjs <photograph.jpg> <mm-per-px>` makes the JPEG set from a photograph
of your own; `node tools/make-raster-testfiles.mjs` makes the PNG and TIFF set, and the region set
but file 36, from nothing at all, `node tools/make-fingerprint-testfiles.mjs` the fingerprint set, and
`node tools/make-model-testfiles.mjs` the models. File 36 is
made from file 30 by ExifTool, as its row says.
Both use the reference writer, so the files and the library cannot drift apart.

The answers above are also the test suites of both libraries
(`python3 -m unittest discover -s python`): the files are written by the JavaScript implementation
and read by the Python one, which is how two implementations of one format are kept honest. Anyone
implementing ISM is welcome to do the same with theirs.
