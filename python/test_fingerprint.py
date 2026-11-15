"""The fingerprint (§4.5), against the same files and answers as test/fingerprint.test.mjs.

Run: python3 -m unittest discover -s python
"""

import json
import struct
import unittest
import zlib
from pathlib import Path

import ism

FILES = Path(__file__).resolve().parent.parent / "testfiles"
ANSWERS = json.loads((FILES / "fingerprints.json").read_text())


def open_file(name):
    """The pixels of one of the test PNGs: 8-bit RGB, no filter."""
    data = (FILES / name).read_bytes()
    at, idat, width, height = 8, b"", None, None
    while at < len(data):
        length, kind = struct.unpack(">I4s", data[at:at + 8])
        if kind == b"IHDR":
            width, height = struct.unpack(">II", data[at + 8:at + 16])
        if kind == b"IDAT":
            idat += data[at + 8:at + 8 + length]
        at += 12 + length
    raw, row = zlib.decompress(idat), width * 3 + 1
    rgb = b"".join(raw[y * row + 1:(y + 1) * row] for y in range(height))
    assert all(raw[y * row] == 0 for y in range(height)), "filter: none"
    return ism.read(data), width, height, ism.fingerprint_of(rgb, width, height, 3)


def synthetic(count):
    out, x = bytearray(count), 1
    for i in range(count):
        x = (1103515245 * x + 12345) % 2147483648
        out[i] = (x >> 16) & 255
    return bytes(out)


class Fingerprint(unittest.TestCase):
    def test_the_same_arithmetic_as_the_javascript_reader(self):
        for name, mark in ANSWERS["files"].items():
            self.assertEqual(open_file(name)[3], mark, name)
        for channels in (1, 2, 3, 4):
            self.assertEqual(ism.fingerprint_of(synthetic(64 * 48 * channels), 64, 48, channels),
                             ANSWERS["synthetic"][str(channels)], channels)
        self.assertIsNone(ism.fingerprint_of(bytes(31 * 100 * 3), 31, 100, 3))

    def test_the_file_carries_the_fingerprint_of_its_own_pixels(self):
        fields, _, _, mark = open_file("40-png-fingerprint.png")
        self.assertEqual(fields["fingerprint"], mark)
        self.assertEqual(ism.parse(ism.write_xmp(fields))["fingerprint"], mark)

    def test_resized_keeps_its_scale(self):
        fields, w, h, mark = open_file("40-png-fingerprint.png")
        self.assertEqual(ism.scale_for(fields, w, h, None, mark), (True, 0.1, None))
        for name, turn in (("41-png-fingerprint-resized-half.png", 0), ("42-png-fingerprint-turned-resized-half.png", 90)):
            fields, w, h, mark = open_file(name)
            ok, scale, _ = ism.scale_for(fields, w, h, None, mark)
            self.assertTrue(ok, name)
            self.assertAlmostEqual(scale, 0.2, places=12)
            grid = ism.grid_for(fields, w, h, mark)
            self.assertEqual((grid["checked"], grid["turn"], grid["mirrored"]), (True, turn, False), name)

    def test_cropped_loses_it(self):
        for name in ("43-png-fingerprint-cropped-same-shape.png", "44-png-fingerprint-cropped-upright.png",
                     "45-png-fingerprint-cropped-by-a-twentieth.png"):
            fields, w, h, mark = open_file(name)
            ok, scale, why = ism.scale_for(fields, w, h, None, mark)
            self.assertFalse(ok, name)
            self.assertIn("cropped", why)
            self.assertTrue(ism.grid_for(fields, w, h, mark)["cropped"])
            # What the dimensions alone say: a scale, and a wrong one.
            self.assertTrue(ism.scale_for(fields, w, h)[0], name)

    def test_what_cannot_be_checked_is_read_as_before(self):
        fields, w, h, mark = open_file("43-png-fingerprint-cropped-same-shape.png")
        even = "y16:" + "80" * 256
        self.assertFalse(ism.fingerprint_match(even, mark)["checkable"])
        self.assertFalse(ism.fingerprint_match("z9:abc", mark)["checkable"])
        self.assertTrue(ism.scale_for({**fields, "fingerprint": "z9:abc"}, w, h, None, mark)[0])
        self.assertTrue(ism.scale_for({**fields, "fingerprint": even}, w, h, None, mark)[0])


if __name__ == "__main__":
    unittest.main()
