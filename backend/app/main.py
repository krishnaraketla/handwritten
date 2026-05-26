"""FastAPI app exposing the glyph-extraction endpoint and static frontend."""

from __future__ import annotations

from dataclasses import asdict
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import glyphs

app = FastAPI(title="Handwriting Font Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    # Allow any *.github.io (project + user pages) and custom *.pages.dev.
    allow_origin_regex=r"https://([a-zA-Z0-9-]+\.)?(github\.io|pages\.dev)$",
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/extract-glyphs")
async def extract_glyphs(file: UploadFile = File(...)) -> dict:
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail=f"Expected an image upload, got content-type {file.content_type!r}",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload")

    try:
        extracted, warning = glyphs.extract_glyphs(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    payload: dict = {"glyphs": [asdict(g) for g in extracted]}
    if warning:
        payload["warning"] = warning
    return payload


# Only mount the static frontend when the directory exists. On Hugging Face
# Spaces (or any backend-only deploy) we skip this and serve the API alone.
if FRONTEND_DIR.is_dir():
    app.mount(
        "/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend"
    )
