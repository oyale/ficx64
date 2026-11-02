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
            self.assertEqual((root / 'dist/index.html').read_bytes(),
                             (root / 'dist/ficx64.html').read_bytes())


if __name__ == '__main__':
    unittest.main()
