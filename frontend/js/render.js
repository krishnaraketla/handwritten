export const DEFAULT_RENDER_OPTIONS = {
  lineHeight: 36,
  lineGap: 0,
  spaceWidth: 11,
  padding: 24,
  maxWidth: 1200,
  minWidth: 600,
  minHeight: 220,
  background: "#f1ead6",
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

export async function preloadGlyphs(map, lineHeight) {
  const entries = await Promise.all(
    Object.entries(map).map(async ([letter, dataUrl]) => {
      const img = await loadImage(dataUrl);
      const scale = lineHeight / img.height;
      const advance = img.width * scale;
      return [letter, { img, advance }];
    })
  );
  return Object.fromEntries(entries);
}

function splitParagraphs(doc) {
  const paragraphs = [[]];
  for (let i = 0; i < doc.length; i++) {
    const entry = doc[i];
    if (entry.char === "\n") {
      paragraphs.push([]);
    } else {
      paragraphs[paragraphs.length - 1].push({ ...entry, docIndex: i });
    }
  }
  return paragraphs;
}

function tokenizeParagraph(entries) {
  const items = [];
  let word = [];

  for (const entry of entries) {
    if (entry.char === " ") {
      if (word.length > 0) {
        items.push({ type: "word", entries: word });
        word = [];
      }
      items.push({ type: "space", entry });
    } else {
      word.push(entry);
    }
  }

  if (word.length > 0) {
    items.push({ type: "word", entries: word });
  }

  return items;
}

function layoutEntry(entry, loaded, opts) {
  const glyph = loaded[entry.char];
  if (glyph) {
    return {
      type: "glyph",
      letter: entry.char,
      width: glyph.advance,
      scratched: entry.scratched,
      docIndex: entry.docIndex,
    };
  }

  return {
    type: "missing",
    width: opts.spaceWidth * 0.6,
    scratched: entry.scratched,
    docIndex: entry.docIndex,
  };
}

function layoutSpace(entry, opts) {
  return {
    type: "space",
    width: opts.spaceWidth,
    scratched: entry.scratched,
    docIndex: entry.docIndex,
  };
}

function layoutDocument(doc, loaded, opts) {
  const maxLineWidth = opts.maxWidth - opts.padding * 2;
  const lines = [];

  for (const entries of splitParagraphs(doc)) {
    const items = tokenizeParagraph(entries);
    let currentLine = [];
    let currentWidth = 0;

    const pushLine = () => {
      lines.push({ chars: currentLine, width: currentWidth });
      currentLine = [];
      currentWidth = 0;
    };

    for (const item of items) {
      if (item.type === "space") {
        if (currentLine.length === 0) continue;

        const spaceChar = layoutSpace(item.entry, opts);
        if (
          currentWidth + spaceChar.width > maxLineWidth &&
          currentWidth > 0
        ) {
          pushLine();
          continue;
        }

        currentLine.push(spaceChar);
        currentWidth += spaceChar.width;
        continue;
      }

      const wordChars = item.entries.map((entry) =>
        layoutEntry(entry, loaded, opts)
      );
      const wordWidth = wordChars.reduce((sum, ch) => sum + ch.width, 0);

      if (
        currentWidth > 0 &&
        currentWidth + wordWidth > maxLineWidth &&
        wordChars.length > 0
      ) {
        pushLine();
      }

      currentLine.push(...wordChars);
      currentWidth += wordWidth;
    }

    pushLine();
  }

  return lines;
}

function layoutText(text, loaded, opts) {
  const doc = [...text].map((char) => ({ char, scratched: false }));
  return layoutDocument(doc, loaded, opts);
}

function scratchSeed(docIndex, y, x) {
  return docIndex * 17 + y * 3 + x;
}

function scratchJitter(seed, n) {
  return (((seed * 9301 + n * 49297) % 233280) / 233280 - 0.5) * 4;
}

function drawScratchMark(ctx, x, y, width, height, docIndex) {
  const pad = Math.max(2, width * 0.08);
  const x1 = x + pad;
  const x2 = x + width - pad;
  const seed = scratchSeed(docIndex, y, x);
  const midY = y + height * 0.52 + scratchJitter(seed, 0) * 0.5;

  ctx.save();
  ctx.strokeStyle = "#1c1a15";
  ctx.lineWidth = 1.35;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Diagonal scratch: /
  ctx.beginPath();
  ctx.moveTo(x1, y + height * 0.78 + scratchJitter(seed, 1));
  ctx.lineTo(x2, y + height * 0.22 + scratchJitter(seed, 2));
  ctx.stroke();

  // Horizontal scratch: --
  ctx.beginPath();
  ctx.moveTo(x1, midY + scratchJitter(seed, 3));
  ctx.lineTo(x2, midY + scratchJitter(seed, 4));
  ctx.stroke();

  ctx.restore();
}

export async function renderTextToCanvas(canvas, doc, map, options = {}) {
  const opts = { ...DEFAULT_RENDER_OPTIONS, ...options };
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  const loaded = await preloadGlyphs(map, opts.lineHeight);
  const isPlaceholder = doc.length === 0 && opts.placeholderText;
  const renderDoc = isPlaceholder
    ? [...opts.placeholderText].map((char) => ({ char, scratched: false }))
    : doc;
  const lines = layoutDocument(renderDoc, loaded, opts);
  const caretLines = layoutDocument(doc, loaded, opts);

  const contentWidth = lines.reduce((m, l) => Math.max(m, l.width), 0);
  const canvasWidth = Math.max(
    opts.minWidth,
    Math.min(opts.maxWidth, contentWidth + opts.padding * 2)
  );
  const linesCount = Math.max(1, lines.length);
  const contentHeight =
    opts.padding * 2 +
    linesCount * opts.lineHeight +
    Math.max(0, linesCount - 1) * opts.lineGap;
  const canvasHeight = Math.max(opts.minHeight, contentHeight);

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(canvasWidth * dpr);
  canvas.height = Math.round(canvasHeight * dpr);
  canvas.style.width = `${canvasWidth}px`;
  canvas.style.height = `${canvasHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.fillStyle = opts.background;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  if (isPlaceholder) {
    ctx.globalAlpha = opts.placeholderOpacity ?? 0.45;
  }

  let y = opts.padding;
  for (const line of lines) {
    let x = opts.padding;
    for (const char of line.chars) {
      if (char.type === "glyph" && char.letter) {
        const glyph = loaded[char.letter];
        if (glyph) {
          if (char.scratched) {
            ctx.save();
            ctx.globalAlpha = 0.72;
            ctx.drawImage(glyph.img, x, y, char.width, opts.lineHeight);
            ctx.restore();
          } else {
            ctx.drawImage(glyph.img, x, y, char.width, opts.lineHeight);
          }
        }
      }

      if (char.scratched && char.docIndex >= 0) {
        drawScratchMark(ctx, x, y, char.width, opts.lineHeight, char.docIndex);
      }

      x += char.width;
    }
    y += opts.lineHeight + opts.lineGap;
  }

  if (isPlaceholder) {
    ctx.globalAlpha = 1;
  }

  const lastLine = caretLines[caretLines.length - 1];
  const lastIdx = Math.max(0, caretLines.length - 1);
  const caret = {
    x: opts.padding + (lastLine ? lastLine.width : 0),
    y: opts.padding + lastIdx * (opts.lineHeight + opts.lineGap),
    h: opts.lineHeight,
  };

  return { cssWidth: canvasWidth, cssHeight: canvasHeight, caret };
}
