---
layout: default
title: ISM extension — image regions
permalink: /regions/
toc: true
---

> **An extension to Image Scale Metadata, experimental.** It lets a part of a picture carry ISM fields of its own, in an IPTC Image Region (§14). It is not part of the core: a reader or writer of
> the [core](../) need not know it, and it may change while the core stands still. The section numbers are
> the ones it had inside the specification, so that references to them still hold.

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
