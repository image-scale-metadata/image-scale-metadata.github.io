# ISM for Python

The reference reader and writer, in one file, with nothing outside the standard
library. MIT licence — copy `ism.py` into your project, or keep the folder.

```python
import ism

data = open("object.jpg", "rb").read()
fields = ism.read(data)                       # None when the file carries none
ok, scale, why = ism.scale_for(fields, *ism.size_of(data))

if ok:
    print(ism.format_mm(scale * 1000), "across a thousand pixels")
    mm, px = ism.nice_length(scale, 600)      # a round scale bar
else:
    print("no scale:", why)
```

Writing the scale into a file that has none, keeping the metadata it already
carries:

```python
packet = ism.merge_into_xmp(ism.find_xmp(data), {
    "scale": 0.0428, "referenceWidth": 1509, "referenceHeight": 1509,
    "method": "ruler", "uncertainty": 0.004, "software": "my tool 1.0",
})
open("with-scale.jpg", "wb").write(ism.embed_xmp(data, packet))
```

`embed_xmp` writes into JPEG, PNG and TIFF, each in the place the format keeps
XMP (§4.0 of the specification). Reading also handles WebP and HEIF.

## Regions

Since 0.3 a part of the picture can carry ISM of its own, in an IPTC Image
Region (§14). The image's scale is read as before; the regions come apart:

```python
regions = ism.read_regions(data)
w, h = ism.size_of(data)
ok, scale, why = ism.scale_for(fields, w, h, regions)   # the image's own, or none
here = ism.scale_at(fields, regions, w, h, 450, 200)    # the scale at one point
line = ism.measure(fields, regions, w, h, (372, 302), (564, 302))
print(line["mm"] if line["ok"] else line["reason"])
```

The regions are read with ElementTree, not with the scanner the image's own
fields use, so that Python and JavaScript share no parsing code for them.
Writing regions is in the JavaScript library only, for now.

## Tests

```
python3 -m unittest discover -s python
```

Forty-two tests. Some are the library against itself; the rest are the library
against the other implementation — every file in `testfiles/` was written by the
JavaScript writer, or by ExifTool from one it wrote, and Python must give the answers the
[test files page](https://image-scale-metadata.github.io/testfiles/) publishes.
That is what keeps two implementations of one format from drifting apart.
