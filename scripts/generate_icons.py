#!/usr/bin/env python3
"""Generate icon variants from icons/mark.svg. Requires rsvg-convert (librsvg)."""
from pathlib import Path
import subprocess
import tempfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / 'icons'
ET.register_namespace('', 'http://www.w3.org/2000/svg')
master = ET.fromstring((ICONS / 'mark.svg').read_text())
mark = ''.join(ET.tostring(child, encoding='unicode') for child in master)


def svg(dark=False, maskable=False, adaptive=False):
    style = '<style>.bg{fill:#fff}.blue{fill:#0047DE}@media(prefers-color-scheme:dark){.bg{fill:#07111E}.blue{fill:#5285FF}}</style>' if adaptive else ''
    body = mark.replace('fill="#0047DE"', 'class="blue" fill="' + ('#5285FF' if dark else '#0047DE') + '"')
    # Center the mark within the circular safe area (radius 204.8 / 512).
    transform = 'translate(256 256) scale(.78) translate(-256 -256)' if maskable else ''
    bg = '#07111E' if dark else '#fff'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{style}<rect class="bg" width="512" height="512" fill="{bg}"/><g transform="{transform}">{body}</g></svg>\n'


def render(name, size, dark=False, maskable=False):
    with tempfile.TemporaryDirectory() as directory:
        source = Path(directory) / 'icon.svg'
        source.write_text(svg(dark, maskable))
        subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), str(source), '-o', str(ICONS / name)], check=True)


(ICONS / 'favicon.svg').write_text(svg(adaptive=True))
for theme in ('light', 'dark'):
    dark = theme == 'dark'
    suffix = '-dark' if dark else ''
    (ICONS / f'icon{suffix}.svg').write_text(svg(dark))
    for size in (192, 512):
        render(f'icon-{size}{suffix}.png', size, dark)
    render(f'apple-touch-icon{suffix}.png', 180, dark)
    render(f'icon-maskable{suffix}.png', 512, dark, True)
    for size in (16, 32):
        render(f'favicon-{size}{suffix}.png', size, dark)
pdf_mark = ROOT / 'src' / 'pdf-assets' / 'ficx-mark.png'
pdf_mark.parent.mkdir(parents=True, exist_ok=True)
subprocess.run(['rsvg-convert', '-w', '256', '-h', '256', str(ICONS / 'mark.svg'), '-o', str(pdf_mark)], check=True)
print('Generated light/dark icons and adaptive SVG favicon from icons/mark.svg')
