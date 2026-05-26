# Handwriting Font — Backend

FastAPI + OpenCV service that takes a photo of a handwritten character set
(a–z, A–Z, 0–9, ! ? , . $ # ; :) and returns 70 cropped glyph PNGs ready to
be stamped onto a canvas.

## Install

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

Serves the static frontend at `/` and the API on the same port:

```bash
uvicorn app.main:app --reload --port 8000
```

Open <http://localhost:8000> in your browser. Use this URL for upload — the API
and frontend run on the same port. If you open the frontend from another dev
server (e.g. port 5173), the backend on :8000 must still be running.

## Endpoint

`POST /extract-glyphs` — multipart form upload with a single field `file`
containing the image. Returns:

```json
{
  "glyphs": [
    { "index": 0, "png_base64": "...", "width": 120, "height": 180 },
    ...
  ],
  "warning": "Found 69 shapes, expected 70" // optional
}
```
