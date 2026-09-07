#!/usr/bin/env python3
"""grid-measure.py — measure a returned 3x3 grid instead of judging it by eye.

Ivan's instruction for this measurement: FIND the cell borders in the image and slice
on the borders you found, never on exact thirds. Thirds are the hypothesis; the borders
are the evidence, and the gap between them is the number the wave needs.

Two independent border finders, because they fail in different directions:

  seam   — a panel boundary is a full-height tonal discontinuity. Mean |d/dx| over the
           whole column height. Strong when the panels have different background tone;
           silent when the model blends them perfectly, which is a PASS, not a failure.
  valley — a panel boundary is a gap between subjects. Column-sums of a foreground mask
           should show three humps and two valleys. Works even when the seam is invisible.

The script prefers the seam when it stands clear of the noise floor (peak >= 3x the
median edge energy) and falls back to the valley otherwise, and it always reports both,
with the position each one found and its distance from the exact third.

Usage: grid-measure.py <image.png> [--rows 3] [--cols 3] [--cells-dir DIR] [--json OUT]
Stdlib + numpy + Pillow only — no new npm dependency, nothing added to the lockfile.
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image


def luminance(rgb):
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def texture_mask(gray, block):
    """Foreground = blocks with texture. A smooth gradient has none; a shoe has plenty."""
    h, w = gray.shape
    hh, ww = (h // block) * block, (w // block) * block
    sd = gray[:hh, :ww].reshape(hh // block, block, ww // block, block).std(axis=(1, 3))
    # The backdrop is the bulk of a packshot, so the low half of the block-std
    # distribution IS the backdrop; take a floor well above its own grain.
    thr = max(3.0, float(np.percentile(sd, 40)) * 3.0)
    m = np.repeat(np.repeat(sd > thr, block, axis=0), block, axis=1)
    full = np.zeros((h, w), dtype=bool)
    full[:hh, :ww] = m
    return full, sd, thr


def auto_peaks(gray, axis, min_snr=3.0, min_gap_frac=0.02, top=12):
    """Every strong full-length discontinuity, ranked — no assumption of 3 or of thirds.

    The suppression window is deliberately narrow. At 5% of a 4096 px side it swallowed
    the real border at y=1024 because a shadow line at y=843 scored fractionally higher,
    and a hidden border is how a 3x4 grid gets mistaken for a 3x3 one.
    """
    d = np.abs(np.diff(gray, axis=axis))
    prof = d.mean(axis=1 - axis)
    size = len(prof)
    floor = float(np.median(prof))
    if floor <= 1e-9:
        return []
    gap = max(3, int(min_gap_frac * size))
    order = np.argsort(prof)[::-1]
    picked = []
    for i in order:
        if prof[i] / floor < min_snr:
            break
        if any(abs(int(i) - p["px"]) < gap for p in picked):
            continue
        picked.append({"px": int(i) + 1, "snr": round(float(prof[i]) / floor, 2),
                       "fraction": round((int(i) + 1) / size, 4)})
        if len(picked) >= top:
            break
    return sorted(picked, key=lambda p: p["px"])


def find_seam(gray, axis, n, window=0.08):
    """Tonal discontinuities. axis=1 -> vertical borders (columns), axis=0 -> horizontal."""
    d = np.abs(np.diff(gray, axis=axis))
    prof = d.mean(axis=1 - axis)          # length size-1; index i = border between i and i+1
    size = gray.shape[1] if axis == 1 else gray.shape[0]
    floor = float(np.median(prof))
    out = []
    for k in range(1, n):
        exact = size * k / n
        lo = max(1, int(exact - window * size))
        hi = min(len(prof) - 1, int(exact + window * size))
        seg = prof[lo:hi]
        idx = lo + int(np.argmax(seg))
        peak = float(prof[idx])
        out.append({
            "foundPx": idx + 1,           # first pixel of the NEXT panel
            "exactPx": round(exact, 1),
            "deltaPx": round(idx + 1 - exact, 1),
            "peak": round(peak, 3),
            "noiseFloor": round(floor, 3),
            "snr": round(peak / floor, 2) if floor > 1e-9 else None,
        })
    return out, prof


def find_valley(mask, axis, n, window=0.12):
    """Gaps between subjects: minima of the foreground mask projection."""
    prof = mask.sum(axis=0 if axis == 1 else 1).astype(np.float64)
    size = len(prof)
    out = []
    for k in range(1, n):
        exact = size * k / n
        lo = max(1, int(exact - window * size))
        hi = min(size - 1, int(exact + window * size))
        seg = prof[lo:hi]
        idx = lo + int(np.argmin(seg))
        out.append({
            "foundPx": idx,
            "exactPx": round(exact, 1),
            "deltaPx": round(idx - exact, 1),
            "valleyCoverage": round(float(prof[idx]) / size, 4),
            "humpMedian": round(float(np.median(prof)) / size, 4),
        })
    return out, prof


def choose(seams, valleys, snr_min=3.0):
    picked, how = [], []
    for s, v in zip(seams, valleys):
        if s["snr"] is not None and s["snr"] >= snr_min:
            picked.append(s["foundPx"]); how.append("seam")
        else:
            picked.append(v["foundPx"]); how.append("valley")
    return picked, how


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--rows", type=int, default=3)
    ap.add_argument("--cols", type=int, default=3)
    ap.add_argument("--borders-x", default=None,
                    help="comma-separated column borders in px — overrides detection. "
                         "Ivan's rule: slice on the borders you FOUND, never on thirds.")
    ap.add_argument("--borders-y", default=None, help="comma-separated row borders in px")
    ap.add_argument("--cells-dir", default=None)
    ap.add_argument("--json", default=None)
    a = ap.parse_args()

    im = Image.open(a.image)
    report = {
        "file": os.path.abspath(a.image),
        "bytes": os.path.getsize(a.image),
        "pilMode": im.mode,
        "width": im.width,
        "height": im.height,
        "format": im.format,
    }

    # ---- alpha, measured on the channel and not on the mode name -------------
    if im.mode in ("RGBA", "LA", "PA") or "transparency" in im.info:
        al = np.array(im.convert("RGBA"))[..., 3]
        total = al.size
        report["alpha"] = {
            "channelPresent": True,
            "min": int(al.min()),
            "max": int(al.max()),
            "fullyTransparentPct": round(100.0 * float((al == 0).sum()) / total, 3),
            "partiallyTransparentPct": round(100.0 * float(((al > 0) & (al < 255)).sum()) / total, 3),
            "opaquePct": round(100.0 * float((al == 255).sum()) / total, 3),
            "verdict": "alpha used" if int(al.min()) < 250 else "alpha channel present but fully opaque",
        }
    else:
        report["alpha"] = {"channelPresent": False, "verdict": "no alpha channel at all"}

    rgb = np.array(im.convert("RGB")).astype(np.float64)
    gray = luminance(rgb)

    # ---- foreground mask by TEXTURE, not by colour ---------------------------
    # The brief asks for a cyclorama that is "one stop lighter at the top", i.e. the
    # background is a gradient. A colour-distance mask therefore calls the top of the
    # backdrop foreground: measured on g1 it returned a subject box of 100% x 100% in
    # all nine cells, which is a fact about the detector, not about the picture.
    # The subject has texture; a smooth gradient does not. Block std separates them.
    mask, sd, thr = texture_mask(gray, block=max(8, min(im.width, im.height) // 128))
    bg_px = rgb[~mask]
    bg = np.median(bg_px, axis=0) if len(bg_px) else np.zeros(3)
    report["maskMethod"] = {"kind": "block-std", "block": int(max(8, min(im.width, im.height) // 128)),
                            "threshold": round(float(thr), 3),
                            "blockStdPercentiles": {str(q): round(float(np.percentile(sd, q)), 2)
                                                    for q in (10, 50, 90, 99)}}
    report["globalBackgroundRgb"] = [round(float(c), 1) for c in bg]
    report["foregroundCoveragePct"] = round(100.0 * float(mask.mean()), 2)

    # ---- where ARE the borders, with no assumption about how many ------------
    report["autoBorders"] = {
        "vertical": auto_peaks(gray, 1),
        "horizontal": auto_peaks(gray, 0),
    }

    v_seam, _ = find_seam(gray, 1, a.cols)
    h_seam, _ = find_seam(gray, 0, a.rows)
    v_val, v_prof = find_valley(mask, 1, a.cols)
    h_val, h_prof = find_valley(mask, 0, a.rows)
    xs, x_how = choose(v_seam, v_val)
    ys, y_how = choose(h_seam, h_val)
    if a.borders_x:
        xs = [int(v) for v in a.borders_x.split(",")]; x_how = ["given"] * len(xs)
    if a.borders_y:
        ys = [int(v) for v in a.borders_y.split(",")]; y_how = ["given"] * len(ys)
    report["borders"] = {
        "verticalSeam": v_seam, "horizontalSeam": h_seam,
        "verticalValley": v_val, "horizontalValley": h_val,
        "chosenX": xs, "chosenXfrom": x_how,
        "chosenY": ys, "chosenYfrom": y_how,
        "exactThirdsX": [round(im.width * k / a.cols, 1) for k in range(1, a.cols)],
        "exactThirdsY": [round(im.height * k / a.rows, 1) for k in range(1, a.rows)],
    }

    # ---- slice on the borders FOUND, never on thirds -------------------------
    xb = [0] + xs + [im.width]
    yb = [0] + ys + [im.height]
    if a.cells_dir:
        os.makedirs(a.cells_dir, exist_ok=True)
    cells = []
    for r in range(a.rows):
        for c in range(a.cols):
            x0, x1, y0, y1 = xb[c], xb[c + 1], yb[r], yb[r + 1]
            crop_rgb = rgb[y0:y1, x0:x1]
            crop_mask = mask[y0:y1, x0:x1]
            h, w = crop_mask.shape
            # this cell's own background: median of its background pixels
            own_bg_px = crop_rgb[~crop_mask]
            own_bg = np.median(own_bg_px, axis=0) if len(own_bg_px) else np.array([0.0, 0, 0])
            # subject bounding box inside the cell
            # `.any()` would let a single grain block set the box to the whole panel —
            # measured on g1, six of twelve cells came back as 100% x 100%, which is a
            # fact about the detector. Require a row/column to be 2% covered.
            rows_hit = np.where(crop_mask.mean(axis=1) > 0.02)[0]
            cols_hit = np.where(crop_mask.mean(axis=0) > 0.02)[0]
            if len(rows_hit) and len(cols_hit):
                by0, by1, bx0, bx1 = int(rows_hit[0]), int(rows_hit[-1]), int(cols_hit[0]), int(cols_hit[-1])
                bbox = {
                    "widthPct": round(100.0 * (bx1 - bx0 + 1) / w, 1),
                    "heightPct": round(100.0 * (by1 - by0 + 1) / h, 1),
                    "centerXPct": round(100.0 * ((bx0 + bx1) / 2) / w, 1),
                    "centerYPct": round(100.0 * ((by0 + by1) / 2) / h, 1),
                }
            else:
                bbox = None
            # background brightness gradient = a measurable proxy for light direction
            ys_i, xs_i = np.nonzero(~crop_mask)
            if len(xs_i) > 1000:
                samp = np.random.default_rng(0).choice(len(xs_i), size=min(60000, len(xs_i)), replace=False)
                X = np.stack([np.ones(len(samp)),
                              xs_i[samp] / w, ys_i[samp] / h], axis=1)
                L = luminance(crop_rgb)[ys_i[samp], xs_i[samp]]
                coef, *_ = np.linalg.lstsq(X, L, rcond=None)
                grad = {"dL_dx": round(float(coef[1]), 2), "dL_dy": round(float(coef[2]), 2)}
            else:
                grad = None
            cells.append({
                "row": r, "col": c,
                "boxPx": [x0, y0, x1, y1],
                "sizePx": [w, h],
                "backgroundRgb": [round(float(v), 1) for v in own_bg],
                "backgroundLuma": round(float(luminance(own_bg)), 1),
                "coveragePct": round(100.0 * float(crop_mask.mean()), 2),
                "subjectBox": bbox,
                "bgGradient": grad,
            })
            if a.cells_dir:
                im.convert("RGB").crop((x0, y0, x1, y1)).save(
                    os.path.join(a.cells_dir, f"cell-r{r+1}c{c+1}.png"))
    report["cells"] = cells

    # ---- the spread across the nine cells IS the consistency answer ----------
    if len(cells) > 1:
        lum = np.array([c["backgroundLuma"] for c in cells])
        rgbs = np.array([c["backgroundRgb"] for c in cells])
        widths = np.array([c["sizePx"][0] for c in cells])
        heights = np.array([c["sizePx"][1] for c in cells])
        sw = [c["subjectBox"]["widthPct"] for c in cells if c["subjectBox"]]
        cx = [c["subjectBox"]["centerXPct"] for c in cells if c["subjectBox"]]
        cy = [c["subjectBox"]["centerYPct"] for c in cells if c["subjectBox"]]
        gx = [c["bgGradient"]["dL_dx"] for c in cells if c["bgGradient"]]
        gy = [c["bgGradient"]["dL_dy"] for c in cells if c["bgGradient"]]
        report["consistency"] = {
            "backgroundLuma": {"min": float(lum.min()), "max": float(lum.max()),
                               "spread": round(float(lum.max() - lum.min()), 1),
                               "std": round(float(lum.std()), 2)},
            "backgroundRgbPerChannelSpread": [round(float(np.ptp(rgbs[:, i])), 1) for i in range(3)],  # numpy 2 dropped ndarray.ptp
            "cellSizePx": {"widthMin": int(widths.min()), "widthMax": int(widths.max()),
                           "heightMin": int(heights.min()), "heightMax": int(heights.max())},
            "subjectWidthPct": {"min": min(sw), "max": max(sw),
                                "spread": round(max(sw) - min(sw), 1)} if sw else None,
            "subjectCenterXPct": {"min": min(cx), "max": max(cx),
                                  "spread": round(max(cx) - min(cx), 1)} if cx else None,
            "subjectCenterYPct": {"min": min(cy), "max": max(cy),
                                  "spread": round(max(cy) - min(cy), 1)} if cy else None,
            "bgGradientX": {"min": min(gx), "max": max(gx),
                            "spread": round(max(gx) - min(gx), 2)} if gx else None,
            "bgGradientY": {"min": min(gy), "max": max(gy),
                            "spread": round(max(gy) - min(gy), 2)} if gy else None,
        }

    out = json.dumps(report, indent=2)
    if a.json:
        with open(a.json, "w") as f:
            f.write(out + "\n")
    print(out)


if __name__ == "__main__":
    sys.exit(main())
