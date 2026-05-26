const SESSION_KEY = "handwriting.pendingExtract.v1";

export function savePending(pending) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(pending));
}

export function loadPending() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearPending() {
  sessionStorage.removeItem(SESSION_KEY);
}
