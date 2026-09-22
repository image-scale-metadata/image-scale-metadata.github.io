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

## Tests

```
python3 -m unittest discover -s python
```

Sixteen tests. Half are the library against itself; half are the library against
the other implementation — every file in `testfiles/` was written by the
JavaScript writer, and Python must give the answers the
[test files page](https://image-scale-metadata.github.io/testfiles/) publishes.
That is what keeps two implementations of one format from drifting apart.
