# App icons

`mark.svg` is the approved master artwork, with a transparent background.
Keep its exact circular geometry and complete lightning tips when editing it.

Regenerate the derived files with:

```sh
python3 scripts/generate_icons.py
python3 build.py
```

The generator requires `rsvg-convert` (librsvg).

- `favicon.svg` follows the system color scheme. The HTML build embeds it so it
  also works in a downloaded standalone HTML file.
- PNG favicons are provided at 16 and 32 pixels in both themes.
- PWA icons are provided at 192 and 512 pixels. The manifest uses the light
  versions; the dark versions are available as separate assets.
- Apple touch icons are opaque 180-pixel squares. The linked icon is light.
- Maskable icons use a smaller mark centered inside the Android safe circle.
- Installation assets have square backgrounds; the operating system applies
  its own shape. Dark assets use a lighter blue for contrast.

The HTML build versions published icon URLs using a hash of each file's content.
Manifest entries, HTML links and service worker precaching share those URLs, so
installed apps can detect artwork changes even when the filenames stay the same.
The app ID and manifest URL stay stable. System confirmation may still be needed.
