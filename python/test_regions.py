"""ISM in IPTC Image Regions (§14). Run: python3 -m unittest discover -s python

The region files in testfiles/ were written by the JavaScript writer, and file
36 was rewritten by ExifTool. Python reads their regions with ElementTree, not
with the scanner the JavaScript reader uses, so these answers are the two
implementations checked against each other.
"""

import math
import unittest
from pathlib import Path

import ism

FILES = Path(__file__).resolve().parent.parent / "testfiles"


def open_file(name):
    data = (FILES / name).read_bytes()
    return ism.read(data), ism.read_regions(data), ism.size_of(data)


def by_id(items, rid):
    return next(r for r in items if (r.get("region") or r)["id"] == rid)


class TheRegionFiles(unittest.TestCase):
    def test_30_and_36_two_planes(self):
        for name in ("30-png-two-planes.png", "36-png-two-planes-rewritten-by-exiftool.png"):
            with self.subTest(name):
                fields, regions, (w, h) = open_file(name)
                self.assertEqual(ism.scale_for(fields, w, h, regions)[1], 0.1)
                self.assertEqual(ism.scale_at(fields, regions, w, h, 450, 200)["scale"], 0.125)
                self.assertEqual(ism.scale_at(fields, regions, w, h, 100, 100)["scale"], 0.1)
                self.assertAlmostEqual(ism.measure(fields, regions, w, h, (372, 302), (564, 302))["mm"], 24, places=9)
                self.assertAlmostEqual(ism.measure(fields, regions, w, h, (30, 322), (330, 322))["mm"], 30, places=9)
                self.assertFalse(ism.measure(fields, regions, w, h, (100, 100), (450, 200))["ok"])
                self.assertEqual(by_id(ism.region_scales(fields, regions, w, h), "lower-bar")["scale"], 0.125)
                for rid in ("upper-bar", "lower-bar"):
                    check = ism.length_check(fields, regions, by_id(regions, rid))
                    self.assertTrue(check["ok"] and check["agrees"])
                    self.assertAlmostEqual(check["difference"], 0, places=12)

    def test_31_two_planes_at_half_size(self):
        fields, regions, (w, h) = open_file("31-png-two-planes-resized-half.png")
        self.assertEqual((w, h), (300, 200))
        self.assertEqual(ism.scale_for(fields, w, h, regions)[1], 0.2)
        self.assertEqual(ism.scale_at(fields, regions, w, h, 225, 100)["scale"], 0.25)
        self.assertAlmostEqual(ism.measure(fields, regions, w, h, (186, 151), (282, 151))["mm"], 24, places=9)

    def test_32_several_objects(self):
        fields, regions, (w, h) = open_file("32-png-several-objects.png")
        self.assertEqual(ism.scale_for(fields, w, h, regions)[1], 0.1)
        coin = ism.main_object_region(regions)
        self.assertEqual(coin["id"], "coin")
        self.assertEqual(ism.region_box(fields, coin), fields["objectBox"])
        readings = ism.region_scales(fields, regions, w, h)
        for rid, wmm, hmm in (("coin", 18, 18), ("block", 12, 8), ("shard", 12, 15)):
            r = by_id(readings, rid)
            self.assertTrue(ism.has_role(r["region"], ism.ISM_ROLES["measuredObject"]))
            self.assertAlmostEqual(r["bounds"]["w"] * r["scale"], wmm, places=9)
            self.assertAlmostEqual(r["bounds"]["h"] * r["scale"], hmm, places=9)
            self.assertEqual((r["region"]["ism"]["objectWidthMm"], r["region"]["ism"]["objectHeightMm"]), (wmm, hmm))
        self.assertTrue(ism.has_type(by_id(regions, "ruler"), ism.ISM_TYPES["ruler"]))
        self.assertTrue(ism.length_check(fields, regions, by_id(regions, "ruler-48"))["agrees"])

    def test_33_only_the_regions_have_a_scale(self):
        fields, regions, (w, h) = open_file("33-png-regions-only-scale.png")
        ok, scale, why = ism.scale_for(fields, w, h, regions)
        self.assertFalse(ok)
        self.assertIn("only its regions", why)
        self.assertIn("Missing required field: scale", ism.scale_for(fields, w, h)[2])
        self.assertEqual(ism.scale_at(fields, regions, w, h, 100, 200)["scale"], 0.1)
        self.assertEqual(ism.scale_at(fields, regions, w, h, 450, 200)["scale"], 0.2)
        self.assertFalse(ism.scale_at(fields, regions, w, h, 300, 200)["ok"])
        self.assertAlmostEqual(ism.measure(fields, regions, w, h, (48, 202), (248, 202))["mm"], 20, places=9)
        self.assertAlmostEqual(ism.measure(fields, regions, w, h, (402, 202), (502, 202))["mm"], 20, places=9)

    def test_34_a_region_in_pixels_in_a_resized_copy(self):
        fields, regions, (w, h) = open_file("34-png-region-in-pixels-resized-half.png")
        self.assertEqual(ism.scale_for(fields, w, h, regions)[1], 0.2)
        (r,) = ism.region_scales(fields, regions, w, h)
        self.assertFalse(r["placed"])
        self.assertIn("in pixels", r["reason"])

    def test_35_two_planes_turned(self):
        fields, regions, (w, h) = open_file("35-png-two-planes-turned.png")
        self.assertEqual((w, h), (400, 600))
        self.assertEqual(ism.scale_for(fields, w, h, regions)[1], 0.1)
        self.assertTrue(all(not r["placed"] for r in ism.region_scales(fields, regions, w, h)))
        here = ism.scale_at(fields, regions, w, h, 200, 300)
        self.assertEqual(here["scale"], 0.1)
        self.assertIn("cannot be placed", here["caveat"])

    def test_15_and_16_the_files_of_0_2(self):
        fields, regions, (w, h) = open_file("15-png-region-with-scale.png")
        self.assertEqual(ism.scale_for(fields, w, h, regions)[1], 0.1)
        self.assertEqual(ism.scale_at(fields, regions, w, h, 300, 370)["scale"], 0.15)
        fields, regions, (w, h) = open_file("16-png-region-only.png")
        self.assertFalse(ism.scale_for(fields, w, h, regions)[0])
        self.assertFalse(ism.scale_at(fields, regions, w, h, 300, 370)["ok"])

    def test_both_readers_read_every_region_field_alike(self):
        """What JavaScript wrote, Python reads back field for field: shapes, roles and ISM."""
        _, regions, _ = open_file("32-png-several-objects.png")
        coin = by_id(regions, "coin")
        self.assertEqual((coin["shape"], coin["unit"], coin["x"], coin["y"], coin["rx"]), ("circle", "relative", 0.5, 0.375, 0.15))
        self.assertEqual(coin["ism"], {"objectWidthMm": 18, "objectHeightMm": 18, "objectThicknessMm": 1.2})
        self.assertEqual(coin["roles"][0], {"ids": [ism.IPTC_ROLES["mainSubjectArea"]], "name": "main subject area"})
        shard = by_id(regions, "shard")
        self.assertEqual([(p["x"], p["y"]) for p in shard["vertices"]], [(0.7, 0.15), (0.9, 0.225), (0.85, 0.525), (0.72, 0.45)])
        for r in regions:
            self.assertEqual(ism.check_region(r), {"boundary": [], "ism": [], "warnings": []}, r["id"])


class TheRules(unittest.TestCase):
    PACKET = """<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
      <rdf:Description rdf:about="" xmlns:s="%(ism)s" s:version="0.3" s:scale="0.1" s:referenceWidth="600" s:referenceHeight="400"/>
      <rdf:Description rdf:about="" xmlns:ie="%(iptc)s" xmlns:s="%(ism)s"><ie:ImageRegion><rdf:Bag>%(li)s</rdf:Bag></ie:ImageRegion></rdf:Description>
    </rdf:RDF></x:xmpmeta>"""
    FORMS = (
        '<rdf:li rdf:parseType="Resource"><ie:RegionBoundary rdf:parseType="Resource"><ie:rbShape>rectangle</ie:rbShape>'
        "<ie:rbUnit>relative</ie:rbUnit><ie:rbX>0.5</ie:rbX><ie:rbY>0</ie:rbY><ie:rbW>0.5</ie:rbW><ie:rbH>1</ie:rbH>"
        "</ie:RegionBoundary><ie:rId>right</ie:rId><s:scale>0.2</s:scale><s:plane>Right</s:plane></rdf:li>",
        '<rdf:li><rdf:Description ie:rId="right" s:scale="0.2" s:plane="Right"><ie:RegionBoundary><rdf:Description '
        'ie:rbShape="rectangle" ie:rbUnit="relative" ie:rbX="0.5" ie:rbY="0" ie:rbW="0.5" ie:rbH="1"/></ie:RegionBoundary>'
        "</rdf:Description></rdf:li>",
        "<rdf:li ie:rId='right' s:scale='0.2' s:plane='Right'><ie:RegionBoundary ie:rbShape='rectangle' "
        "ie:rbUnit='relative' ie:rbX='0.5' ie:rbY='0' ie:rbW='0.5' ie:rbH='1'/></rdf:li>",
    )

    def test_a_region_is_read_the_same_in_every_rdf_form(self):
        for li in self.FORMS:
            packet = self.PACKET % {"ism": ism.ISM_NS, "iptc": ism.IPTC_EXT_NS, "li": li}
            (r,) = ism.parse_regions(packet)
            self.assertEqual((r["id"], r["shape"], r["unit"], r["x"], r["y"], r["w"], r["h"], r["ism"]),
                             ("right", "rectangle", "relative", 0.5, 0, 0.5, 1, {"scale": 0.2, "plane": "Right"}))
            self.assertEqual(ism.parse(packet)["scale"], 0.1)
            self.assertEqual(ism.scale_at(ism.parse(packet), [r], 600, 400, 450, 10)["scale"], 0.2)

    def test_the_grid_may_stand_alone_only_when_a_region_carries_a_scale(self):
        grid = {"version": "0.3", "referenceWidth": 600, "referenceHeight": 400}
        self.assertIn("Missing required field: scale", " ".join(ism.validate(grid)))
        _, regions, _ = open_file("33-png-regions-only-scale.png")
        self.assertEqual(ism.validate(grid, regions), [])
        no_scale = [dict(r, ism=None) for r in regions]
        self.assertIn("scale", " ".join(ism.validate(grid, no_scale)))

    def test_merging_keeps_the_regions_and_the_file_says_0_3(self):
        packet = ism.find_xmp((FILES / "30-png-two-planes.png").read_bytes())
        merged = ism.merge_into_xmp(packet, {"scale": 0.11, "referenceWidth": 600, "referenceHeight": 400})
        self.assertEqual(ism.parse(merged)["scale"], 0.11)
        self.assertEqual(ism.parse(merged)["version"], "0.3")
        self.assertEqual([r["ism"] for r in ism.parse_regions(merged)], [r["ism"] for r in ism.parse_regions(packet)])

    def test_overlapping_regions_with_different_scales_leave_no_scale(self):
        def rect(rid, x, w, scale):
            return {"id": rid, "shape": "rectangle", "unit": "relative", "x": x, "y": 0, "w": w, "h": 1,
                    "ism": {"scale": scale}, "roles": [], "types": [], "not_allowed": [], "vertices": None, "rx": None}
        fields = {"version": "0.3", "scale": 0.1, "referenceWidth": 600, "referenceHeight": 400}
        regions = [rect("a", 0, 0.6, 0.2), rect("b", 0.5, 0.5, 0.3)]
        self.assertFalse(ism.scale_at(fields, regions, 600, 400, 330, 10)["ok"])
        self.assertEqual(ism.scale_at(fields, regions, 600, 400, 100, 10)["scale"], 0.2)

    def test_a_polygon_by_the_even_odd_rule(self):
        notch = {"shape": "polygon", "points": [(0, 0), (10, 0), (10, 10), (5, 4), (0, 10)]}
        self.assertTrue(ism.shape_contains(notch, 5, 2))
        self.assertFalse(ism.shape_contains(notch, 5, 8))
        self.assertTrue(ism.shape_contains(notch, 10, 5))
        self.assertFalse(ism.shape_contains({"shape": "polygon", "points": [(0, 0), (10, 0)]}, 5, 0))


def _invert(m):
    a, b, c, d, e, f, g, h, i = m
    A, B, C = e * i - f * h, -(d * i - f * g), d * h - e * g
    det = a * A + b * B + c * C
    return [n / det for n in (A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d)]


class PlanesAtAnAngle(unittest.TestCase):
    def test_37_and_38_a_board_measured_through_its_homography(self):
        for name, k in (("37-png-tilted-board.png", 1), ("38-png-tilted-board-resized-half.png", 0.5)):
            with self.subTest(name):
                fields, regions, (w, h) = open_file(name)
                self.assertFalse(ism.scale_for(fields, w, h, regions)[0])
                board = by_id(regions, "board")
                to_image = _invert(board["ism"]["homography"])

                def at(X, Y):
                    x, y = ism.apply_homography(to_image, X, Y)
                    return x * k, y * k

                for p, q, mm in (((10, 30), (70, 30), 60), ((40, 5), (40, 55), 50), ((10, 10), (70, 50), math.hypot(60, 40))):
                    m = ism.measure(fields, regions, w, h, at(*p), at(*q))
                    self.assertTrue(m["ok"])
                    self.assertAlmostEqual(m["mm"], mm, places=9)
                centre = ism.scale_at(fields, regions, w, h, *at(40, 30))
                self.assertAlmostEqual(centre["local"] * k, board["ism"]["scale"], places=6)
                for rid in ("marker-12", "marker-13", "marker-14", "marker-15"):
                    c = ism.length_check(fields, regions, by_id(regions, rid))
                    self.assertTrue(c["ok"] and c["agrees"] and c["within"] == "pixel")
                    self.assertLess(abs(c["difference"]), 1e-5)
                block = ism.object_check(fields, regions, by_id(regions, "block"))
                self.assertAlmostEqual(block["widthMm"], 20, places=3)
                self.assertAlmostEqual(block["heightMm"], 10, places=3)

    def test_both_readers_read_the_homography_alike(self):
        _, regions, _ = open_file("37-png-tilted-board.png")
        h = by_id(regions, "board")["ism"]["homography"]
        self.assertEqual(len(h), 9)
        self.assertEqual(h[8], 1)

    def test_the_inner_region_holds_where_regions_overlap(self):
        def region(rid, shape, scale, **geometry):
            r = {"id": rid, "shape": shape, "unit": "relative", "x": None, "y": None, "w": None, "h": None, "rx": None,
                 "vertices": None, "ism": {"scale": scale}, "roles": [], "types": [], "not_allowed": []}
            r.update(geometry)
            return r
        fields = {"version": "0.3", "scale": 0.1, "referenceWidth": 600, "referenceHeight": 400}
        outer = region("surface", "rectangle", 0.2, x=0, y=0, w=0.8, h=1)
        inner = region("detail", "circle", 0.18, x=0.4, y=0.5, rx=0.1)
        across = region("across", "rectangle", 0.25, x=0.7, y=0.2, w=0.3, h=0.2)
        for order in ([outer, inner, across], [across, inner, outer]):
            self.assertEqual(ism.scale_at(fields, order, 600, 400, 240, 200)["scale"], 0.18)
            self.assertFalse(ism.scale_at(fields, order, 600, 400, 450, 120)["ok"])
        twin = dict(outer, id="twin", ism={"scale": 0.3})
        self.assertFalse(ism.scale_at(fields, [outer, twin], 600, 400, 60, 200)["ok"])

    def test_the_images_own_homography(self):
        hmg = [0.1, 0, 0, 0, 0.1, 0, 0, 0.001, 1]
        fields = {"version": "0.3", "scale": 0.1, "referenceWidth": 600, "referenceHeight": 400, "homography": hmg}
        self.assertEqual(ism.parse(ism.write_xmp(fields))["homography"], hmg)
        a, b = ism.apply_homography(hmg, 100, 0), ism.apply_homography(hmg, 100, 300)
        m = ism.measure(fields, [], 600, 400, (100, 0), (100, 300))
        self.assertAlmostEqual(m["mm"], math.hypot(b[0] - a[0], b[1] - a[1]), places=12)
        self.assertAlmostEqual(ism.measure(fields, [], 300, 200, (50, 0), (50, 150))["mm"], m["mm"], places=12)
        turned = ism.scale_at(fields, [], 400, 600, 10, 10)
        self.assertIsNone(turned["homography"])
        self.assertIn("turned", turned["caveat"])
        self.assertIn("scale beside it", " ".join(ism.validate(dict(fields, scale=None) and {k: v for k, v in fields.items() if k != "scale"})))


if __name__ == "__main__":
    unittest.main()
