"""Run: python3 -m unittest discover -s python

Two kinds of check. The first is the library against itself — what it writes it
reads back, and the reading rules give the answers §6 requires. The second is
the library against the other implementation: every file in testfiles/ was
written by the JavaScript writer, and Python must read each one and give the
answer the set publishes. That is what keeps two implementations of one format
from drifting apart.
"""

import unittest
from pathlib import Path

import ism

FILES = Path(__file__).resolve().parent.parent / "testfiles"

FULL = {
    "scale": 0.0428, "referenceWidth": 1509, "referenceHeight": 1509,
    "method": "calipers", "methodNote": "Length of the blade, 42.80 mm",
    "uncertainty": 0.004, "measuredAt": "2026-09-21", "software": "PHOTARCH Desktop 1.0",
    "objectWidthMm": 42.8, "objectBox": [10, 20, 300, 400],
}


class WrittenAndReadBack(unittest.TestCase):
    def test_everything_written_comes_back(self):
        fields = ism.parse(ism.write_xmp(FULL))
        for key, value in FULL.items():
            self.assertEqual(fields[key], value, key)
        self.assertEqual(fields["version"], ism.ISM_VERSION)

    def test_the_same_fields_give_the_same_packet(self):
        self.assertEqual(ism.write_xmp(FULL), ism.write_xmp(dict(FULL)))

    def test_an_incomplete_core_is_refused(self):
        with self.assertRaises(ValueError):
            ism.write_xmp({"scale": 0.1})

    def test_another_prefix_and_the_element_form_are_read(self):
        packet = (
            '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF '
            'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
            '<rdf:Description rdf:about="" xmlns:scale="%s">'
            "<scale:version>0.1</scale:version><scale:scale>0.25</scale:scale>"
            "<scale:referenceWidth>800</scale:referenceWidth>"
            "<scale:referenceHeight>600</scale:referenceHeight>"
            "</rdf:Description></rdf:RDF></x:xmpmeta>" % ism.ISM_NS
        )
        fields = ism.parse(packet)
        self.assertEqual(fields["scale"], 0.25)
        self.assertEqual(fields["referenceWidth"], 800)

    def test_a_packet_without_the_namespace_has_no_ism(self):
        self.assertIsNone(ism.parse('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF/></x:xmpmeta>'))

    def test_merging_keeps_the_file_s_own_metadata(self):
        theirs = (
            '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF '
            'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
            '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" '
            'dc:rights="CC BY 4.0"/></rdf:RDF></x:xmpmeta>'
        )
        merged = ism.merge_into_xmp(theirs, {"scale": 0.1, "referenceWidth": 4, "referenceHeight": 2})
        self.assertIn('dc:rights="CC BY 4.0"', merged)
        self.assertEqual(ism.parse(merged)["scale"], 0.1)

    def test_merging_replaces_older_ism_rather_than_doubling_it(self):
        first = ism.write_xmp({"scale": 0.1, "referenceWidth": 4, "referenceHeight": 2})
        second = ism.merge_into_xmp(first, {"scale": 0.2, "referenceWidth": 4, "referenceHeight": 2})
        self.assertEqual(ism.parse(second)["scale"], 0.2)
        self.assertEqual(second.count("ism:scale"), 1)


class TheReadingRules(unittest.TestCase):
    def setUp(self):
        self.fields = {"scale": 0.1, "referenceWidth": 800, "referenceHeight": 400, "version": "0.1"}

    def test_same_grid(self):
        ok, scale, _ = ism.scale_for(self.fields, 800, 400)
        self.assertTrue(ok)
        self.assertEqual(scale, 0.1)

    def test_turned_a_quarter_turn(self):
        ok, scale, _ = ism.scale_for(self.fields, 400, 800)
        self.assertTrue(ok)
        self.assertEqual(scale, 0.1)

    def test_resized(self):
        ok, scale, _ = ism.scale_for(self.fields, 400, 200)
        self.assertTrue(ok)
        self.assertAlmostEqual(scale, 0.2)

    def test_cropped_is_refused(self):
        ok, scale, why = ism.scale_for(self.fields, 400, 400)
        self.assertFalse(ok)
        self.assertIsNone(scale)
        self.assertIn("cropped", why)

    def test_a_round_bar_is_the_same_bar_as_the_other_implementation(self):
        self.assertEqual(ism.nice_length(0.05, 500), (20, 400))
        self.assertEqual(ism.format_mm(0.42), "420 µm")
        self.assertEqual(ism.format_mm(42.8), "42.8 mm")
        self.assertEqual(ism.format_mm(4.28), "4.28 mm")


class WritingIntoFiles(unittest.TestCase):
    def test_jpeg_png_and_tiff_round_trip(self):
        fields = {"scale": 0.1, "referenceWidth": 4, "referenceHeight": 2}
        for name in ("01-measured.jpg", "10-png-measured.png", "12-tiff-measured.tif"):
            data = (FILES / name).read_bytes()
            out = ism.embed_xmp(data, ism.write_xmp(fields))
            self.assertEqual(ism.read(out)["scale"], 0.1, name)

    def test_an_unknown_format_is_refused(self):
        with self.assertRaises(ValueError):
            ism.embed_xmp(b"\x01\x02\x03\x04", ism.write_xmp({"scale": 0.1, "referenceWidth": 4, "referenceHeight": 2}))


class AgainstTheOtherImplementation(unittest.TestCase):
    """Every file in testfiles/ was written by the JavaScript writer."""

    #: name → (stored size, the scale a reader must show, or None for refused)
    ANSWERS = {
        "01-measured.jpg": ((964, 627), 0.07490277),
        "02-resized-half.jpg": ((482, 314), 0.14980554),
        "03-turned.jpg": ((627, 964), 0.07490277),
        "04-cropped-square.jpg": ((627, 627), None),
        "06-no-ism.jpg": ((964, 627), None),
        "10-png-measured.png": ((600, 400), 0.1),
        "11-png-resized-half.png": ((300, 200), 0.2),
        "12-tiff-measured.tif": ((600, 400), 0.1),
        "13-tiff-resized-half.tif": ((300, 200), 0.2),
        "14-png-no-ism.png": ((600, 400), None),
    }

    def test_the_published_answers(self):
        for name, (size, answer) in self.ANSWERS.items():
            with self.subTest(name):
                data = (FILES / name).read_bytes()
                self.assertEqual(ism.size_of(data), size, "stored size")
                fields = ism.read(data)
                ok, scale, _ = ism.scale_for(fields, *size)
                if answer is None:
                    self.assertFalse(ok)
                else:
                    self.assertTrue(ok)
                    self.assertAlmostEqual(scale, answer, places=7)

    def test_the_bar_drawn_in_the_made_files_measures_fifty_millimetres(self):
        for name, bar_px in (("10-png-measured.png", 500), ("11-png-resized-half.png", 250)):
            with self.subTest(name):
                data = (FILES / name).read_bytes()
                ok, scale, _ = ism.scale_for(ism.read(data), *ism.size_of(data))
                self.assertTrue(ok)
                self.assertAlmostEqual(scale * bar_px, 50.0, places=6)


if __name__ == "__main__":
    unittest.main()
