const STORAGE_KEY = "handwriting.glyphMap.v1";

/** Characters the user writes on paper, in reading order. */
export const ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?,.$#;:".split(
    ""
  );

export const EXPECTED_GLYPH_COUNT = ALPHABET.length;

export function saveGlyphMap(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function loadGlyphMap() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearGlyphMap() {
  localStorage.removeItem(STORAGE_KEY);
}
