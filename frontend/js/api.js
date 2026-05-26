// Deployed backend URL. Replace this with your Hugging Face Space (or other
// host) once it's live, e.g. "https://your-user-your-space.hf.space".
const PROD_API_BASE = "https://krishna-raketla-handwritten.hf.space";


function resolveApiBase() {
  // Same-origin: FastAPI serves the frontend on :8000.
  if (window.location.port === "8000") {
    return window.location.origin;
  }

  // Local dev: UI opened from another port (Vite, Live Server, etc.).
  if (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  ) {
    return "http://127.0.0.1:8000";
  }

  // Production (GitHub Pages, custom domain, etc.) — hit the deployed backend.
  return PROD_API_BASE;
}

const API_BASE = resolveApiBase();

export async function extractGlyphs(file) {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_BASE}/extract-glyphs`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // Body was not JSON, fall back to statusText.
    }
    throw new Error(`Upload failed: ${detail}`);
  }

  return res.json();
}

export function rawGlyphToDataUrl(glyph) {
  return `data:image/png;base64,${glyph.png_base64}`;
}
