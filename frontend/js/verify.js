import { ALPHABET, EXPECTED_GLYPH_COUNT, saveGlyphMap } from "./storage.js";
import { clearPending, loadPending } from "./pending.js";

const pending = loadPending();
if (!pending) {
  window.location.replace("./");
}

const glyphGrid = document.getElementById("glyph-grid");
const extrasSection = document.getElementById("extras-section");
const extrasGrid = document.getElementById("extras-grid");
const extrasCount = document.getElementById("extras-count");
const verifyWarning = document.getElementById("verify-warning");
const verifyMissing = document.getElementById("verify-missing");
const confirmBtn = document.getElementById("confirm-btn");
const reuploadBtn = document.getElementById("reupload-btn");

const slots = Array(EXPECTED_GLYPH_COUNT).fill(null);
pending.dataUrls.slice(0, EXPECTED_GLYPH_COUNT).forEach((url, i) => {
  slots[i] = url;
});
let extras = pending.dataUrls.slice(EXPECTED_GLYPH_COUNT);

let dragIdx = null;
let dragFromExtras = null;
let overIdx = null;

if (pending.warning) {
  verifyWarning.textContent = pending.warning;
  verifyWarning.classList.remove("hidden");
}

function updateMissingWarning() {
  const missing = slots
    .map((url, i) => (url ? null : ALPHABET[i]))
    .filter(Boolean);
  if (missing.length > 0) {
    verifyMissing.textContent = `Missing: ${missing.join(", ")}. You can still continue — missing letters will render as blank spaces when you type.`;
    verifyMissing.classList.remove("hidden");
  } else {
    verifyMissing.classList.add("hidden");
  }
}

function renderGrid() {
  glyphGrid.innerHTML = "";
  slots.forEach((url, i) => {
    glyphGrid.appendChild(createSlotCell(url, i));
  });

  if (extras.length > 0) {
    extrasSection.classList.remove("hidden");
    extrasCount.textContent = String(extras.length);
    extrasGrid.innerHTML = "";
    extras.forEach((url, i) => {
      extrasGrid.appendChild(createExtraCell(url, i));
    });
  } else {
    extrasSection.classList.add("hidden");
  }

  updateMissingWarning();
}

function createSlotCell(url, index) {
  const cell = document.createElement("div");
  cell.className = `glyph-cell${overIdx === index ? " drag-over" : ""}`;
  cell.draggable = Boolean(url);
  cell.title = url ? `Click to remove "${ALPHABET[index]}"` : "Empty slot";

  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = `glyph for ${ALPHABET[index]}`;
    cell.appendChild(img);
  } else {
    const placeholder = document.createElement("div");
    placeholder.style.width = "80px";
    placeholder.style.height = "80px";
    placeholder.style.opacity = "0.25";
    placeholder.textContent = "—";
    cell.appendChild(placeholder);
  }

  const label = document.createElement("div");
  label.className = "glyph-label";
  label.textContent = ALPHABET[index];
  cell.appendChild(label);

  cell.addEventListener("dragstart", () => {
    if (url) startDrag(index);
  });
  cell.addEventListener("dragover", (e) => {
    e.preventDefault();
    overIdx = index;
    renderGrid();
  });
  cell.addEventListener("dragleave", () => {
    if (overIdx === index) {
      overIdx = null;
      renderGrid();
    }
  });
  cell.addEventListener("drop", (e) => {
    e.preventDefault();
    dropOnSlot(index);
  });
  cell.addEventListener("click", () => {
    if (url) clearSlot(index);
  });

  return cell;
}

function createExtraCell(url, index) {
  const cell = document.createElement("div");
  cell.className = "glyph-cell";
  cell.draggable = true;

  const img = document.createElement("img");
  img.src = url;
  img.alt = `extra glyph ${index + 1}`;
  cell.appendChild(img);

  const label = document.createElement("div");
  label.className = "glyph-label";
  label.textContent = "extra";
  cell.appendChild(label);

  cell.addEventListener("dragstart", () => startDrag(index, true));

  return cell;
}

function startDrag(idx, fromExtras = false) {
  if (fromExtras) {
    dragFromExtras = idx;
    dragIdx = null;
  } else {
    dragIdx = idx;
    dragFromExtras = null;
  }
}

function dropOnSlot(target) {
  overIdx = null;

  if (dragFromExtras !== null) {
    const moved = extras[dragFromExtras];
    const displaced = slots[target];
    slots[target] = moved;
    extras = extras.filter((_, i) => i !== dragFromExtras);
    if (displaced) extras.push(displaced);
  } else if (dragIdx !== null && dragIdx !== target) {
    const tmp = slots[target];
    slots[target] = slots[dragIdx];
    slots[dragIdx] = tmp;
  }

  dragIdx = null;
  dragFromExtras = null;
  renderGrid();
}

function clearSlot(target) {
  const removed = slots[target];
  slots[target] = null;
  if (removed) extras.push(removed);
  renderGrid();
}

confirmBtn.addEventListener("click", () => {
  const filled = {};
  slots.forEach((url, i) => {
    if (url) filled[ALPHABET[i]] = url;
  });
  if (Object.keys(filled).length === 0) return;
  saveGlyphMap(filled);
  clearPending();
  window.location.href = "./type.html";
});

reuploadBtn.addEventListener("click", () => {
  window.location.href = "./";
});

renderGrid();
