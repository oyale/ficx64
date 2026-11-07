"""Versionado reproducible de las actualizaciones PWA, sin tocar las fuentes reales."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[1]


class UpdateBuildTest(unittest.TestCase):
    def test_version_tracks_every_published_input(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copyfile(ROOT / 'build.py', root / 'build.py')
            for name in ('src', 'data', 'icons'):
                shutil.copytree(ROOT / name, root / name)
            shutil.copyfile(ROOT / 'manifest.webmanifest', root / 'manifest.webmanifest')

            def build():
                subprocess.run([sys.executable, str(root / 'build.py')], check=True,
                               capture_output=True)
                return (root / 'dist/sw.js').read_bytes()

            previous = build()
            initial_icons = json.loads((root / 'dist/manifest.webmanifest').read_text())['icons']
            self.assertNotIn(b'__BUILD_VERSION__', previous)
            self.assertEqual(previous, build())
            for filename in ('src/app.js', 'src/styles.css', 'src/index.html',
                             'manifest.webmanifest', 'src/sw.js', 'src/pdf-itinerary.js',
                             'src/pdf-assets/Barlow-Regular.ttf', 'src/pdf-assets/ficx-mark.png',
                             'icons/icon-192.png'):
                with self.subTest(filename=filename):
                    path = root / filename
                    if filename == 'manifest.webmanifest':
                        manifest = json.loads(path.read_text())
                        manifest['description'] += ' (actualizada)'
                        path.write_text(json.dumps(manifest))
                    else:
                        path.write_bytes(path.read_bytes() + b'\n')
                    current = build()
                    self.assertNotEqual(previous, current)
                    self.assertEqual(current, build())
                    published_icons = json.loads((root / 'dist/manifest.webmanifest').read_text())['icons']
                    if filename == 'icons/icon-192.png':
                        self.assertNotEqual(initial_icons[0]['src'], published_icons[0]['src'])
                        self.assertEqual(initial_icons[1:], published_icons[1:])
                    else:
                        self.assertEqual(initial_icons, published_icons)
                    previous = current
            path = root / 'data/films.json'
            data = json.loads(path.read_text())
            data['films'][0]['title'] += ' (actualizada)'
            path.write_text(json.dumps(data))
            self.assertNotEqual(previous, build())
            html = (root / 'dist/index.html').read_text()
            legacy = (root / 'dist/ficx64.html').read_text()
            self.assertGreater(len(html), 100_000)
            self.assertLess(len(legacy), 1024)
            self.assertIn('location.search + location.hash', legacy)
            self.assertIn('href="./ficx64-portable.html" download="ficx64.html"', html)
            self.assertIn('window.FICX_PDF_BUNDLE_URL', html)
            self.assertNotIn('jspdf', html.lower())
            portable_default = (root / 'dist/ficx64-portable.html').read_text()
            self.assertIn('id="ficx-pdf-bundle"', portable_default)
            self.assertIn('jspdf', portable_default.lower())
            self.assertNotIn('/* __PDF_FONTS__ */', html)
            self.assertNotIn('/* __PDF_LOGO__ */', html)
            self.assertNotIn('sourceMappingURL=jspdf', html)
            # Una salida personalizada contiene la app completa, no la redirección.
            output = root / 'portable' / 'ficx64.html'
            subprocess.run([sys.executable, str(root / 'build.py'), '--output', str(output)],
                           check=True, capture_output=True)
            self.assertIn('id="ficx-pdf-bundle"', output.read_text())
            self.assertIn('jspdf', output.read_text().lower())
            self.assertFalse((output.parent / 'index.html').exists())
            pages_output = root / 'pages' / 'index.html'
            subprocess.run([sys.executable, str(root / 'build.py'), '--output', str(pages_output),
                            '--site-url', 'https://oyale.github.io/ficx64/'], check=True, capture_output=True)
            pages_manifest = json.loads((pages_output.parent / 'manifest.webmanifest').read_text())
            self.assertEqual(pages_manifest['id'], 'https://oyale.github.io/ficx64/')
            self.assertEqual(pages_manifest['related_applications'][0]['url'],
                             'https://oyale.github.io/ficx64/manifest.webmanifest')
            source_manifest = json.loads((root / 'manifest.webmanifest').read_text())
            production_manifest = json.loads((root / 'dist/manifest.webmanifest').read_text())
            for original, published in zip(source_manifest['icons'], production_manifest['icons']):
                parsed = urlsplit(published['src'])
                self.assertEqual(parsed.path, original['src'])
                expected_hash = hashlib.sha256((root / parsed.path).read_bytes()).hexdigest()[:16]
                self.assertEqual(parse_qs(parsed.query), {'v': [expected_hash]})
                self.assertIn(published['src'], (root / 'dist/sw.js').read_text())
            self.assertEqual(production_manifest['id'], source_manifest['id'])
            self.assertEqual(production_manifest['related_applications'], source_manifest['related_applications'])
            for icon in ('apple-touch-icon.png', 'favicon-32.png'):
                expected_hash = hashlib.sha256((root / 'icons' / icon).read_bytes()).hexdigest()[:16]
                url = f'icons/{icon}?v={expected_hash}'
                self.assertIn(url, html)
                self.assertIn(url, (root / 'dist/sw.js').read_text())
            self.assertNotEqual((pages_output.parent / 'sw.js').read_bytes(), build())
            screening_path = root / 'data/screenings.json'
            invalid = json.loads(screening_path.read_text())
            invalid['screenings'][0]['mainFilmId'] = 'not-linked'
            screening_path.write_text(json.dumps(invalid))
            rejected = subprocess.run([sys.executable, str(root / 'build.py')], capture_output=True, text=True)
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn('mainFilmId no enlazado', rejected.stderr)


if __name__ == '__main__':
    unittest.main()
