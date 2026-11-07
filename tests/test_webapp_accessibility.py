"""Static accessibility contract for the generated FICX64 document."""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import unittest
import re


ROOT = Path(__file__).resolve().parents[1]


class DocumentInventory(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = Counter()
        self.tags = Counter()
        self.images_without_alt = []
        self.forms = []
        self.labels_for = set()
        self.label_depth = 0
        self.controls = []
        self.nav_names = []
        self.nav_depth = 0
        self.main_count = 0
        self.html_lang = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags[tag] += 1
        if tag == "html":
            self.html_lang = attrs.get("lang")
        if "id" in attrs:
            self.ids[attrs["id"]] += 1
        if tag == "img" and "alt" not in attrs:
            self.images_without_alt.append(attrs)
        if tag == "main":
            self.main_count += 1
        if tag == "nav":
            name = attrs.get("aria-label") or attrs.get("aria-labelledby")
            self.nav_names.append(name)
            self.nav_depth += 1
        if tag == "label":
            self.label_depth += 1
            if attrs.get("for"):
                self.labels_for.add(attrs["for"])
        if tag in {"input", "select", "textarea"} and attrs.get("type") not in {"hidden", "submit", "button", "reset"} and "hidden" not in attrs:
            self.controls.append((attrs.get("id"), self.label_depth > 0, attrs.get("aria-labelledby"), attrs.get("aria-label")))

    def handle_endtag(self, tag):
        if tag == "label" and self.label_depth:
            self.label_depth -= 1
        if tag == "nav" and self.nav_depth:
            self.nav_depth -= 1


class WebappAccessibilityContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (ROOT / "dist" / "index.html").read_text(encoding="utf-8")
        cls.doc = DocumentInventory()
        cls.doc.feed(cls.html)

    def test_document_has_language_and_single_main_landmark(self):
        self.assertEqual(self.doc.html_lang, "es")
        self.assertEqual(self.doc.main_count, 1)

    def test_ids_are_unique(self):
        duplicates = sorted(identifier for identifier, count in self.doc.ids.items() if count > 1)
        self.assertEqual(duplicates, [])

    def test_images_have_alt_attributes(self):
        self.assertEqual(self.doc.images_without_alt, [])

    def test_navigation_landmarks_are_named(self):
        self.assertGreaterEqual(len(self.doc.nav_names), 2)
        self.assertTrue(all(self.doc.nav_names), self.doc.nav_names)

    def test_icon_only_settings_button_has_an_accessible_name(self):
        match = re.search(r'<button\b(?=[^>]*\bid="extras-toggle")[^>]*>', self.html)
        self.assertIsNotNone(match)
        self.assertRegex(match.group(), r'aria-label="Ajustes"')

    def test_form_controls_have_programmatic_labels(self):
        unlabeled = [identifier for identifier, nested, labelledby, aria_label in self.doc.controls
                     if not nested and identifier not in self.doc.labels_for and not labelledby and not aria_label]
        self.assertEqual(unlabeled, [])

    def test_each_app_screen_has_a_heading_relationship(self):
        for screen in ("screen-explore", "screen-sessions", "screen-program", "screen-shared", "screen-help"):
            with self.subTest(screen=screen):
                match = re.search(rf'<section\b(?=[^>]*\bid="{screen}")[^>]*>', self.html)
                self.assertIsNotNone(match)
                labelled = re.search(r'aria-labelledby="([^"]+)"', match.group())
                self.assertIsNotNone(labelled)
                self.assertRegex(self.html, rf'<h[1-6]\b[^>]*\bid="{re.escape(labelled.group(1))}"')

    def test_initial_saved_state_renders_sections_before_the_film_catalogue(self):
        source = (ROOT / "src" / "app.js").read_text(encoding="utf-8")
        startup = source[source.index("  function renderSaved()"):source.index("  function switchScreen", source.index("  function renderSaved()"))]
        self.assertLess(startup.index("renderSectionPicker();"), startup.index("renderFilms();"))


if __name__ == "__main__":
    unittest.main()
