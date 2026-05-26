import { clearGlyphMap, loadGlyphMap } from "./storage.js";
import { renderTextToCanvas } from "./render.js";
import { triggerDownload } from "./download.js";

if (!loadGlyphMap()) {
  window.location.replace("./");
}

const LINE_HEIGHT = 32;
const LINE_GAP = 0;
const SPACE_WIDTH = Math.round(LINE_HEIGHT * 0.22);

const canvas = document.getElementById("editor-canvas");
const contentEl = document.getElementById("editor-content");
const inputEl = document.getElementById("editor-input");
const stageEl = document.getElementById("editor-stage");
const caretEl = document.getElementById("editor-caret");
const renderErrorEl = document.getElementById("render-error");
const clearBtn = document.getElementById("clear-btn");
const pngBtn = document.getElementById("png-btn");
const reuploadGlyphsBtn = document.getElementById("reupload-glyphs-btn");

const PLACEHOLDER_TEXT = "start typing...";

/** @type {{ char: string, scratched: boolean }[]} */
let doc = [];
let maxWidth = 760;
let caret = null;
let focused = false;
let renderGeneration = 0;

function setRenderError(message) {
  if (message) {
    renderErrorEl.textContent = message;
    renderErrorEl.classList.remove("hidden");
  } else {
    renderErrorEl.textContent = "";
    renderErrorEl.classList.add("hidden");
  }
}

function updateToolbar() {
  const isEmpty = doc.length === 0;
  clearBtn.disabled = isEmpty;
  pngBtn.disabled = isEmpty;
}

function syncInput() {
  inputEl.value = doc.map((entry) => entry.char).join("");
}

function appendChar(char) {
  doc.push({ char, scratched: false });
  syncInput();
  updateToolbar();
  void renderCanvas();
}

function scratchPrevious() {
  for (let i = doc.length - 1; i >= 0; i--) {
    if (doc[i].scratched) continue;

    if (doc[i].char === " ") {
      doc.splice(i, 1);
    } else {
      doc[i].scratched = true;
    }

    syncInput();
    updateToolbar();
    void renderCanvas();
    return;
  }
}

function updateCaret() {
  if (focused && caret) {
    caretEl.classList.remove("hidden");
    caretEl.style.left = `${caret.x}px`;
    caretEl.style.top = `${caret.y}px`;
    caretEl.style.height = `${caret.h}px`;
  } else {
    caretEl.classList.add("hidden");
  }
}

async function renderCanvas() {
  const map = loadGlyphMap();
  if (!map) return;

  const generation = ++renderGeneration;
  try {
    const result = await renderTextToCanvas(canvas, doc, map, {
      lineHeight: LINE_HEIGHT,
      lineGap: LINE_GAP,
      spaceWidth: SPACE_WIDTH,
      maxWidth,
      minWidth: Math.min(maxWidth, 320),
      minHeight: 200,
      padding: 0,
      placeholderText: PLACEHOLDER_TEXT,
      placeholderOpacity: 0.45,
    });
    if (generation !== renderGeneration) return;
    caret = result.caret;
    setRenderError(null);
    updateCaret();
  } catch (e) {
    if (generation !== renderGeneration) return;
    setRenderError(e instanceof Error ? e.message : String(e));
  }
}

function updateMaxWidth() {
  const w = contentEl.getBoundingClientRect().width;
  if (w > 0) {
    maxWidth = Math.floor(w);
    void renderCanvas();
  }
}

const resizeObserver = new ResizeObserver(updateMaxWidth);
resizeObserver.observe(contentEl);
updateMaxWidth();

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Backspace") {
    e.preventDefault();
    scratchPrevious();
    return;
  }

  if (e.key === "Enter") {
    e.preventDefault();
    appendChar("\n");
    return;
  }

  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    appendChar(e.key);
    return;
  }

  const blocked = [
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End",
    "PageUp",
    "PageDown",
  ];
  if (blocked.includes(e.key)) e.preventDefault();
});

inputEl.addEventListener("focus", () => {
  focused = true;
  updateCaret();
});

inputEl.addEventListener("blur", () => {
  focused = false;
  updateCaret();
});

inputEl.addEventListener("select", () => {
  const end = inputEl.value.length;
  if (inputEl.selectionStart !== end || inputEl.selectionEnd !== end) {
    inputEl.setSelectionRange(end, end);
  }
});

stageEl.addEventListener("mousedown", (e) => {
  e.preventDefault();
  inputEl.focus();
});

clearBtn.addEventListener("click", () => {
  doc = [];
  syncInput();
  updateToolbar();
  void renderCanvas();
});

pngBtn.addEventListener("click", () => {
  canvas.toBlob((blob) => {
    if (blob) triggerDownload(blob, "handwriting.png");
  }, "image/png");
});

reuploadGlyphsBtn.addEventListener("click", () => {
  clearGlyphMap();
  window.location.href = "./";
});

inputEl.focus();
updateToolbar();
