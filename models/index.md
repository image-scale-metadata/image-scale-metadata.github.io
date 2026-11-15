---
layout: default
title: ISM extension — three-dimensional models
permalink: /models/
toc: true
---

> **An extension to Image Scale Metadata, experimental.** It lets a three-dimensional model carry a measured scale (§13). It is not part of the core: a reader or writer of
> the [core](../) need not know it, and it may change while the core stands still. The section numbers are
> the ones it had inside the specification, so that references to them still hold.

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
