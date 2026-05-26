---
title: Handwritten Glyph Extractor
emoji: 🖋
colorFrom: gray
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# Handwritten Glyph Extractor (backend)

FastAPI + OpenCV service that takes a photo of a handwritten character set
(a–z, A–Z, 0–9, ! ? , . $ # ; :) and returns 70 cropped glyph PNGs.

Paired frontend: hosted separately on GitHub Pages. See the main repo README
for setup.

## Endpoint

`POST /extract-glyphs` — multipart upload with field `file`. Returns:

```json
{
  "glyphs": [
    { "index": 0, "png_base64": "...", "width": 120, "height": 180 }
  ],
  "warning": "Found 69 shapes, expected 70"
}
```
