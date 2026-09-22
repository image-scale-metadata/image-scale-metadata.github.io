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

The bar is the check that needs no software: measure it with the reader's own measuring tool, and
it must come out at 50 mm in every file that has a scale.

## How they are made

`node tools/make-testfiles.mjs <photograph.jpg> <mm-per-px>` makes the JPEG set from a photograph
of your own; `node tools/make-raster-testfiles.mjs` makes the PNG and TIFF set from nothing at all.
Both use the reference writer, so the files and the library cannot drift apart.

The answers above are also the Python library's test suite
(`python3 -m unittest discover -s python`): the files are written by the JavaScript implementation
and read by the Python one, which is how two implementations of one format are kept honest. Anyone
implementing ISM is welcome to do the same with theirs.
