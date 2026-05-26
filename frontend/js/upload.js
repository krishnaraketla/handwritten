import { extractGlyphs, rawGlyphToDataUrl } from "./api.js";
import { savePending } from "./pending.js";

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const errorEl = document.getElementById("upload-error");
const dropzoneLabel = document.getElementById("dropzone-label");

let busy = false;

function showError(message) {
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}

function clearError() {
  errorEl.textContent = "";
  errorEl.classList.add("hidden");
}

function setBusy(value) {
  busy = value;
  dropzone.classList.toggle("dragging", false);
  if (value) {
    dropzoneLabel.textContent = "Extracting glyphs…";
  } else {
    dropzoneLabel.textContent = "Drop a photo here, or click to choose";
  }
}

async function handleFile(file) {
  clearError();
  setBusy(true);
  try {
    const resp = await extractGlyphs(file);
    const dataUrls = resp.glyphs.map(rawGlyphToDataUrl);
    savePending({ dataUrls, warning: resp.warning });
    window.location.href = "./verify.html";
  } catch (e) {
    showError(e instanceof Error ? e.message : String(e));
  } finally {
    setBusy(false);
  }
}

dropzone.addEventListener("click", () => {
  if (!busy) fileInput.click();
});

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (!busy) dropzone.classList.add("dragging");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragging");
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragging");
  if (busy) return;
  const file = e.dataTransfer.files?.[0];
  if (file) void handleFile(file);
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void handleFile(file);
  fileInput.value = "";
});
