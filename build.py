#!/usr/bin/env python3
"""Build VibeScope into one self-contained HTML file (index.html).

The app is plain HTML, CSS and JavaScript split over a few files in src/. This script joins them with a
site file (site/default.js: branding defaults, profile library, fixture drawn in 3D) and the guide images.
Plotly, SheetJS and three.js load from cdnjs.

    python3 build.py                     # writes index.html
    python3 build.py --site site/my.js   # use your own site file
"""
import argparse, os, re
HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser(); ap.add_argument('--site', default=os.path.join(HERE, 'site', 'default.js')); ap.add_argument('--out', default=os.path.join(HERE, 'index.html'))
a = ap.parse_args()
SRC = os.path.join(HERE, 'src')
parts = [open(os.path.join(SRC, f), encoding='utf-8').read() for f in sorted(os.listdir(SRC))]
head, body, core = parts[0], parts[1], '\n'.join(parts[2:])
site = open(a.site, encoding='utf-8').read()
gi = os.path.join(HERE, 'docs', 'guide_images.js')
guide = open(gi, encoding='utf-8').read() if os.path.exists(gi) else 'const GUIDE_IMAGES = {};\n'
libs = '''<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/plotly.js/2.27.0/plotly.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
'''
html = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + head + '</head>\n<body>\n' + body + libs + '<script>\n' + site + '\n' + guide + '\n' + core + '\n</script>\n</body>\n</html>\n')
open(a.out, 'w', encoding='utf-8').write(html)
ver = re.search(r"version: '([^']+)'", core).group(1)
print('VibeScope v%s -> %s (%.2f MB)' % (ver, os.path.relpath(a.out), len(html) / 1e6))
