"""Versionado reproducible de las actualizaciones PWA, sin tocar las fuentes reales."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

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
            self.assertNotIn(b'__BUILD_VERSION__', previous)
            self.assertEqual(previous, build())
            for filename in ('src/app.js', 'src/styles.css', 'src/index.html',
                             'manifest.webmanifest', 'src/sw.js', 'icons/icon-192.png'):
                with self.subTest(filename=filename):
                    path = root / filename
                    path.write_bytes(path.read_bytes() + b'\n')
                    current = build()
                    self.assertNotEqual(previous, current)
                    self.assertEqual(current, build())
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
            self.assertIn('href="./index.html" download="ficx64.html"', html)
            # Una salida personalizada contiene la app completa, no la redirección.
            output = root / 'portable' / 'ficx64.html'
            subprocess.run([sys.executable, str(root / 'build.py'), '--output', str(output)],
                           check=True, capture_output=True)
            self.assertEqual(output.read_text(), html)
            self.assertFalse((output.parent / 'index.html').exists())
            pages_output = root / 'pages' / 'index.html'
            subprocess.run([sys.executable, str(root / 'build.py'), '--output', str(pages_output),
                            '--site-url', 'https://oyale.github.io/ficx64/'], check=True, capture_output=True)
            pages_manifest = json.loads((pages_output.parent / 'manifest.webmanifest').read_text())
            self.assertEqual(pages_manifest['id'], 'https://oyale.github.io/ficx64/')
            self.assertEqual(pages_manifest['related_applications'][0]['url'],
                             'https://oyale.github.io/ficx64/manifest.webmanifest')
            self.assertEqual((root / 'manifest.webmanifest').read_bytes(),
                             (root / 'dist/manifest.webmanifest').read_bytes())
            self.assertNotEqual((pages_output.parent / 'sw.js').read_bytes(), build())


if __name__ == '__main__':
    unittest.main()
