"""OpenCV glyph segmentation pipeline.

Takes a photo of a handwritten alphabet and returns cropped glyph PNGs in
reading order (top-to-bottom, left-to-right). For an MVP we assume the user
wrote the full character set in order (a–z, A–Z, 0–9, punctuation), so the
Nth glyph corresponds to the Nth character. The frontend Verify step lets
the user fix mistakes.

Quality pipeline (per glyph):
  1. Crop the binary mask (not the noisy grayscale photo) for crisp ink.
  2. Re-tight-crop after mask cleaning.
  3. Normalize stroke width across all glyphs so they look like one pen.
  4. Detect the baseline of each row (median of box bottoms) and split
     each glyph into ascent / descent in photo pixels.
  5. Compose every glyph into a shared per-photo canvas with a SHARED
     baseline: max_ascent of empty space above the baseline, max_descent
     below. Letters with descenders (g, j, p, q, y, sometimes f) actually
     drop below the baseline; the rest sit on it.
"""

from __future__ import annotations

import base64
import io
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image


@dataclass
class GlyphOut:
    index: int
    png_base64: str
    width: int
    height: int


@dataclass
class _Box:
    x: int
    y: int
    w: int
    h: int

    @property
    def x2(self) -> int:
        return self.x + self.w

    @property
    def y2(self) -> int:
        return self.y + self.h

    @property
    def cx(self) -> float:
        return self.x + self.w / 2

    @property
    def cy(self) -> float:
        return self.y + self.h / 2

    @property
    def area(self) -> int:
        return self.w * self.h


# Drop contours smaller than this fraction of the image area as noise.
_NOISE_AREA_FRACTION = 5e-4

# When clustering boxes into rows, two boxes are in the same row if their
# vertical centers are within this fraction of the mean row height.
_ROW_TOLERANCE_FRACTION = 0.6

# Padding (in pixels of the original photo's resolution) added around each
# glyph in the output canvas.
_GLYPH_PAD_PX = 6

# Must match frontend/js/storage.js ALPHABET order and length.
_EXPECTED_GLYPH_COUNT = 70


def extract_glyphs(image_bytes: bytes) -> tuple[list[GlyphOut], str | None]:
    """Segment letters out of a photo, return cropped glyph PNGs and an
    optional warning message if the count is not _EXPECTED_GLYPH_COUNT."""

    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)

    # Ink-on-paper photos are typically dark ink on light paper. Adaptive
    # threshold + INV gives us white ink on a black background, which is what
    # findContours / morphological ops expect.
    binary = cv2.adaptiveThreshold(
        blurred,
        maxValue=255,
        adaptiveMethod=cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        thresholdType=cv2.THRESH_BINARY_INV,
        blockSize=35,
        C=10,
    )

    # Light close to bridge small gaps inside a stroke; keep kernel small so
    # we do not accidentally merge adjacent letters.
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)

    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    img_area = img.shape[0] * img.shape[1]
    noise_floor = int(img_area * _NOISE_AREA_FRACTION)

    all_boxes: list[_Box] = []
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        all_boxes.append(_Box(x=x, y=y, w=w, h=h))

    median_h = float(np.median([b.h for b in all_boxes])) if all_boxes else 30.0
    boxes = [b for b in all_boxes if not _is_noise(b, noise_floor, median_h)]

    boxes = _merge_dotted_letters(boxes)
    rows = _group_into_rows(boxes)

    ordered: list[_Box] = []
    baselines: list[int] = []
    for row in rows:
        # Baseline = the y at which most letters in the row end. Using the
        # median means a couple of descenders (g, j, p, q, y) don't shift it.
        baseline = int(np.median([b.y2 for b in row]))
        ordered.extend(row)
        baselines.extend([baseline] * len(row))

    if not ordered:
        return [], "No letters detected — try a clearer, higher-contrast photo."

    # Pull tight binary masks per glyph from the cleaned binary image, and
    # record each glyph's ascent / descent in photo-pixel coordinates so we
    # can preserve the baseline through normalization.
    raw_masks: list[np.ndarray] = []
    raw_ascents: list[int] = []
    raw_descents: list[int] = []
    for box, baseline in zip(ordered, baselines):
        crop = _tight_crop_mask(closed[box.y : box.y2, box.x : box.x2])
        raw_masks.append(crop)
        # Defensive: a tight-crop may have shaved a couple of pixels off the
        # bottom, so re-derive descent from the actual mask height instead of
        # box.h.
        mh = crop.shape[0] if crop.size > 0 else box.h
        descent = max(0, box.y2 - baseline)
        descent = min(descent, mh)
        raw_descents.append(descent)
        raw_ascents.append(mh - descent)

    normalized_masks = _normalize_stroke_widths(raw_masks)

    # Stroke-width normalization (a symmetric dilate/erode) inflates/deflates
    # the mask around its center. Apply half the growth to ascent and half to
    # descent so the baseline stays put within each mask.
    ascents: list[int] = []
    descents: list[int] = []
    for mask_pre, mask_post, asc_pre, dsc_pre in zip(
        raw_masks, normalized_masks, raw_ascents, raw_descents
    ):
        growth = mask_post.shape[0] - mask_pre.shape[0]
        half = growth // 2
        other = growth - half
        # Only add to descent if there was a descent to begin with; for
        # non-descender letters we keep descent at 0 so they sit flat on the
        # baseline.
        if dsc_pre > 0:
            new_dsc = max(0, dsc_pre + half)
        else:
            new_dsc = 0
        new_asc = mask_post.shape[0] - new_dsc
        if new_asc < 0:
            new_asc = mask_post.shape[0]
            new_dsc = 0
        ascents.append(new_asc)
        descents.append(new_dsc)
        # `other` is unused — accounted for in mask_post.shape[0] already.
        del other

    # Shared baseline canvas: every glyph PNG has the same height, with the
    # baseline at the same y offset. Frontend can stamp PNGs naively and they
    # will visually share a baseline (descenders dropping below).
    max_ascent = max(ascents)
    max_descent = max(descents)
    canvas_h = max_ascent + max_descent + _GLYPH_PAD_PX * 2

    glyphs: list[GlyphOut] = []
    for i, (mask, asc, dsc) in enumerate(zip(normalized_masks, ascents, descents)):
        png_bytes = _mask_to_glyph_png(mask, asc, canvas_h, max_ascent)
        b64 = base64.b64encode(png_bytes).decode("ascii")
        glyphs.append(
            GlyphOut(
                index=i,
                png_base64=b64,
                width=mask.shape[1] + _GLYPH_PAD_PX * 2,
                height=canvas_h,
            )
        )
        del dsc

    warning: str | None = None
    if len(glyphs) != _EXPECTED_GLYPH_COUNT:
        warning = (
            f"Found {len(glyphs)} shapes, expected {_EXPECTED_GLYPH_COUNT}. "
            "Re-order, drop extras, or re-take the photo on the next screen."
        )

    return glyphs, warning


def _is_noise(box: _Box, noise_floor: int, median_h: float) -> bool:
    """Drop tiny specks while keeping thin letters (i, l) and punctuation."""

    area = box.area
    if area >= noise_floor:
        return False
    # Thin vertical strokes: l, i, 1, !, ;
    if box.h >= median_h * 0.45 and box.w <= median_h * 0.35:
        return False
    # Small punctuation marks and letter tittles.
    if area >= 25 and box.h >= median_h * 0.12 and box.w >= median_h * 0.1:
        return False
    if area >= 80:
        return False
    return True


def _union_boxes(a: _Box, b: _Box) -> _Box:
    x1 = min(a.x, b.x)
    y1 = min(a.y, b.y)
    x2 = max(a.x2, b.x2)
    y2 = max(a.y2, b.y2)
    return _Box(x=x1, y=y1, w=x2 - x1, h=y2 - y1)


def _horizontally_aligned(a: _Box, b: _Box, slack: float) -> bool:
    return a.x - slack <= b.cx <= a.x2 + slack


def _merge_dotted_letters(boxes: list[_Box]) -> list[_Box]:
    """Merge fragmented strokes: i/j tittles, ? dots, colon pairs, etc."""

    if not boxes:
        return boxes

    current = sorted(boxes, key=lambda b: (b.cy, b.x))
    while True:
        merged = _merge_fragment_pass(current)
        if len(merged) == len(current):
            return merged
        current = merged


def _merge_fragment_pass(boxes: list[_Box]) -> list[_Box]:
    median_h = float(np.median([b.h for b in boxes]))
    dot_h_threshold = median_h * 0.45
    x_slack = median_h * 0.35
    v_gap = median_h * 1.25

    merged: list[_Box] = []
    used = [False] * len(boxes)

    for i, seed in enumerate(boxes):
        if used[i]:
            continue
        merged_box = seed
        used[i] = True
        changed = True
        while changed:
            changed = False
            for j, other in enumerate(boxes):
                if used[j]:
                    continue
                if not (
                    _horizontally_aligned(merged_box, other, x_slack)
                    or _horizontally_aligned(other, merged_box, x_slack)
                ):
                    continue

                gap_above = merged_box.y - other.y2
                gap_below = other.y - merged_box.y2
                vertically_close = (
                    -median_h * 0.25 <= gap_above <= v_gap
                    or -median_h * 0.25 <= gap_below <= v_gap
                )
                if not vertically_close:
                    continue

                smaller = other if other.area <= merged_box.area else merged_box
                larger = merged_box if other.area <= merged_box.area else other
                tiny_pair = (
                    merged_box.h <= dot_h_threshold and other.h <= dot_h_threshold
                )
                tiny_with_body = smaller.h <= dot_h_threshold and smaller.area <= max(
                    larger.area * 0.45, 40
                )
                if tiny_pair or tiny_with_body:
                    merged_box = _union_boxes(merged_box, other)
                    used[j] = True
                    changed = True

        merged.append(merged_box)

    return sorted(merged, key=lambda b: (b.cy, b.x))


def _group_into_rows(boxes: list[_Box]) -> list[list[_Box]]:
    """Cluster boxes into rows by vertical center, then sort each row
    left-to-right. Returns rows in top-to-bottom order so callers can
    compute per-row baselines."""

    if not boxes:
        return []

    median_h = float(np.median([b.h for b in boxes]))
    row_tolerance = median_h * _ROW_TOLERANCE_FRACTION

    sorted_by_y = sorted(boxes, key=lambda b: b.cy)
    rows: list[list[_Box]] = []
    for b in sorted_by_y:
        if rows and abs(b.cy - np.mean([rb.cy for rb in rows[-1]])) <= row_tolerance:
            rows[-1].append(b)
        else:
            rows.append([b])

    return [sorted(row, key=lambda b: b.x) for row in rows]


def _tight_crop_mask(mask: np.ndarray) -> np.ndarray:
    """Crop a binary mask to its non-zero bounding box. Returns the input
    unchanged if it is all-zero (shouldn't happen given upstream filtering)."""

    if mask.size == 0 or not mask.any():
        return mask
    rows = np.any(mask > 0, axis=1)
    cols = np.any(mask > 0, axis=0)
    rmin, rmax = np.where(rows)[0][[0, -1]]
    cmin, cmax = np.where(cols)[0][[0, -1]]
    return mask[rmin : rmax + 1, cmin : cmax + 1]


def _estimate_stroke_half_width(mask: np.ndarray) -> float:
    """Approximate the stroke half-width in pixels using the max of the
    distance transform. For a uniform pen the max distance from any ink
    pixel to the background equals (stroke_width / 2)."""

    if mask.size == 0 or not mask.any():
        return 1.0
    dist = cv2.distanceTransform(mask, cv2.DIST_L2, 3)
    return float(dist.max())


def _normalize_stroke_widths(masks: list[np.ndarray]) -> list[np.ndarray]:
    """Dilate or erode each glyph mask so all glyphs share roughly the same
    stroke width, then re-tight-crop. Without this, letters drawn with
    different pen pressure end up looking like they're from different fonts."""

    if not masks:
        return masks

    half_widths = [_estimate_stroke_half_width(m) for m in masks]
    target = float(np.median(half_widths))

    out: list[np.ndarray] = []
    for mask, swh in zip(masks, half_widths):
        delta = int(round(target - swh))
        if delta == 0 or mask.size == 0:
            out.append(mask)
            continue
        ksize = 2 * abs(delta) + 1
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ksize, ksize))
        if delta > 0:
            # Pad first so dilation has room to grow without being clipped.
            padded = cv2.copyMakeBorder(
                mask, delta, delta, delta, delta, cv2.BORDER_CONSTANT, value=0
            )
            grown = cv2.dilate(padded, kernel)
            out.append(_tight_crop_mask(grown))
        else:
            shrunk = cv2.erode(mask, kernel)
            tight = _tight_crop_mask(shrunk)
            # If erosion deleted the glyph entirely, fall back to original.
            out.append(tight if tight.size > 0 and tight.any() else mask)
    return out


def _mask_to_glyph_png(
    mask: np.ndarray, ascent: int, canvas_h: int, baseline_above_floor: int
) -> bytes:
    """Place a (white-ink-on-black) mask in a canvas with a SHARED baseline,
    and emit a transparent-background RGBA PNG with solid black ink. The
    transparency is what lets the page's paper colour show through between
    glyphs and around each letter.

    The baseline is at y = pad + baseline_above_floor from the top of the
    canvas. The mask's top is placed at baseline - ascent, so its
    `ascent` pixels of ink sit at or above baseline and the rest hang below.
    Letters without descenders sit exactly on the baseline; descender letters
    drop into the lower region.
    """

    mh, mw = mask.shape[:2]
    pad = _GLYPH_PAD_PX
    canvas_w = mw + pad * 2

    alpha = np.zeros((canvas_h, canvas_w), dtype=np.uint8)
    baseline_y = pad + baseline_above_floor
    top = baseline_y - ascent
    # Defensive clamp in case of off-by-one from earlier rounding.
    top = max(0, min(canvas_h - mh, top))
    alpha[top : top + mh, pad : pad + mw] = mask

    # Compose RGBA: solid black ink, alpha = ink mask. Anywhere the mask is
    # 0 (background), alpha is 0 (transparent), so the page colour shows.
    rgba = np.zeros((canvas_h, canvas_w, 4), dtype=np.uint8)
    rgba[..., 3] = alpha

    img = Image.fromarray(rgba, mode="RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
