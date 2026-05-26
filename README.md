# Handwritten

Type messages in your own handwriting.

Write the alphabet on paper, take a photo, and this site turns it into something you can type with. When you're done, download your note as a PNG.

## How to use it

1. **Upload** — Take a photo of your handwritten **a–z, A–Z, 0–9, and punctuation** and upload it.
2. **Verify** — Make sure each letter is in the right spot. Drag anything that's wrong.
3. **Type** — Write your message. It appears in your handwriting.
4. **Download** — Save it as a PNG and share it however you like.

## Tips for a good photo

- Dark pen on light paper works best
- Write the letters in rows, left to right
- Hold the camera straight-on, with good lighting

## Notes

- Supported characters: a–z, A–Z, 0–9, and ! ? , . $ # ; :
- Your handwriting stays saved in your browser, so you can come back and keep typing

## Hosting it yourself

The app is split in two: a static frontend (HTML/CSS/JS) and a FastAPI backend
that runs OpenCV. Frontend goes on GitHub Pages, backend on Hugging Face
Spaces (or any Python host).

### 1. Backend → Hugging Face Spaces

1. Create a new Space at <https://huggingface.co/new-space>. Pick **Docker** as
   the SDK.
2. Clone the empty Space repo locally and copy these files into it:
   - `backend/Dockerfile`
   - `backend/requirements.txt`
   - `backend/app/` (the whole folder)
   - `backend/README_HF.md` → rename to `README.md` in the Space repo (this
     supplies the Space's YAML frontmatter).
3. Commit and push. The Space will build and expose a URL like
   `https://<your-user>-<space-name>.hf.space`.
4. Verify by hitting `https://<your-user>-<space-name>.hf.space/health` —
   should return `{"status": "ok"}`.

### 2. Point the frontend at your backend

In `frontend/js/api.js`, replace the `PROD_API_BASE` placeholder with your
Space URL:

```js
const PROD_API_BASE = "https://your-user-your-space.hf.space";
```

### 3. Frontend → GitHub Pages

1. `git init && git add . && git commit -m "initial"` and push to a new GitHub
   repo.
2. In repo Settings → **Pages**, set the **Source** to **GitHub Actions**.
3. Push to `main`. The workflow in `.github/workflows/pages.yml` will build
   and publish the `frontend/` folder. Your site will appear at
   `https://<you>.github.io/<repo>/`.

### 4. CORS

`backend/app/main.py` already allows requests from any `*.github.io` and
`*.pages.dev` origin via `allow_origin_regex`. If you use a custom domain,
add it to the `allow_origins` list.

## Local development

```bash
# Backend (API + serves the frontend on the same port)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Open <http://localhost:8000>.
