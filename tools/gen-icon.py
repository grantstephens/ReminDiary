#!/usr/bin/env python3
"""Generate ReminDiary's icon: SVG sources + every PNG rendered from them.

Design: a tapered counter-clockwise "history" spiral (tail at 7 o'clock, head
at 8 o'clock, one 330 degree turn) wrapped round a tilted pen nib. Today at the
centre, the past spiralling outward.

Regenerate with `python3 tools/gen-icon.py` (needs `rsvg-convert` on PATH).
Exits non-zero if any artwork point leaves Android's adaptive-icon safe zone.
"""
import math
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OLIVE, CREAM, INK, AMBER = "#6B7B4E", "#F4EFE6", "#221F1B", "#F2A33A"

MAX_SCALE = 0.92        # never scale up past this
SAFE_RADIUS = 313       # adaptive-icon safe zone: 66dp circle of 108dp, on the 1024 canvas
FULL_RADIUS = 420       # full-bleed renders (icon, splash, favicon, store icon)
HEAD_STROKE = 5         # half of the arrowhead's 10-unit round-join stroke
END_ANGLE = 150         # arrowhead at 8 o'clock (screen degrees, y down)
SWEEP = 330             # tail ends up at 7 o'clock
R0, R1 = 215, 345
W0, W1 = 12, 56
HEAD_L, HEAD_W = 100, 92
NIB_PATH = "M512 190 C610 320 668 430 650 590 L512 740 L374 590 C356 430 414 320 512 190 Z"
NIB_TRANSFORM = "translate(520 500) rotate(35) scale(0.66) translate(-512 -465)"


def polar(angle_deg, r):
    a = math.radians(angle_deg)
    return 512 + r * math.cos(a), 512 + r * math.sin(a)


def spiral_geometry(n=200):
    """Return (stroke polygon points, head triangle points, all artwork points)."""
    centre, left, right = [], [], []
    for k in range(n + 1):
        f = k / n
        x, y = polar(END_ANGLE + SWEEP * (1 - f), R0 + (R1 - R0) * f)
        centre.append((x, y, (W0 + (W1 - W0) * f) / 2))
    for k, (x, y, hw) in enumerate(centre):
        x2, y2, _ = centre[min(k + 1, n)]
        x1, y1, _ = centre[max(k - 1, 0)]
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy)
        nx, ny = -dy / length, dx / length
        left.append((x + nx * hw, y + ny * hw))
        right.append((x - nx * hw, y - ny * hw))
    stroke = left + right[::-1]
    # Arrowhead at the final point, along the final tangent.
    (xa, ya, _), (xb, yb, hw) = centre[-2], centre[-1]
    length = math.hypot(xb - xa, yb - ya)
    tx, ty = (xb - xa) / length, (yb - ya) / length
    nx, ny = -ty, tx
    head = [
        (xb + tx * HEAD_L, yb + ty * HEAD_L),
        (xb + nx * HEAD_W, yb + ny * HEAD_W),
        (xb - nx * HEAD_W, yb - ny * HEAD_W),
    ]
    cap = (xb, yb, hw)
    return stroke, head, cap


def nib_points():
    """Nib outline corner/extreme points in canvas space (pre-scale)."""
    pts = []
    a = math.radians(35)
    for lx, ly in [(512, 190), (650, 590), (512, 740), (374, 590), (364, 400), (660, 400)]:
        dx, dy = (lx - 512) * 0.66, (ly - 465) * 0.66
        pts.append((520 + dx * math.cos(a) - dy * math.sin(a), 500 + dx * math.sin(a) + dy * math.cos(a)))
    return pts


def fit(stroke, head, limit):
    """Scale + centre so the artwork's bounding box is centred on the canvas and
    every point (plus the arrowhead stroke) lies within `limit` of the centre."""
    pts = stroke + head + nib_points()
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    far = max(math.hypot(x - cx, y - cy) for x, y in pts) + HEAD_STROKE
    return min(MAX_SCALE, limit / far), cx, cy, far


def poly(points):
    return " ".join(f"{x:.1f},{y:.1f}" for x, y in points)


def artwork(fitted, spiral_fill, nib_fill, cut_fill, hole_fill, mono=False):
    scale, cx0, cy0, _ = fitted
    stroke, head, (cx, cy, cr) = spiral_geometry()
    body = (
        f'<polygon points="{poly(stroke)}" fill="{spiral_fill}"/>'
        f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{cr:.1f}" fill="{spiral_fill}"/>'
        f'<polygon points="{poly(head)}" fill="{spiral_fill}" stroke="{spiral_fill}" '
        f'stroke-width="10" stroke-linejoin="round"/>'
    )
    if mono:
        nib = (
            f'<g transform="{NIB_TRANSFORM}">'
            f'<mask id="nibCut" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">'
            f'<rect width="1024" height="1024" fill="#fff"/>'
            f'<path d="M512 500 L512 740" stroke="#000" stroke-width="20" stroke-linecap="round"/>'
            f'<circle cx="512" cy="480" r="40" fill="#000"/></mask>'
            f'<path d="{NIB_PATH}" fill="{nib_fill}" mask="url(#nibCut)"/></g>'
        )
    else:
        nib = (
            f'<g transform="{NIB_TRANSFORM}">'
            f'<path d="{NIB_PATH}" fill="{nib_fill}"/>'
            f'<path d="M512 500 L512 740" stroke="{cut_fill}" stroke-width="20" stroke-linecap="round"/>'
            f'<circle cx="512" cy="480" r="40" fill="{hole_fill}"/></g>'
        )
    return f'<g transform="translate(512 512) scale({scale:.4f}) translate({-cx0:.1f} {-cy0:.1f})">{body}{nib}</g>'


def svg(comment, background, art):
    bg = f'<rect width="1024" height="1024" fill="{background}"/>' if background else ""
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">\n'
        f"  <!--\n    {comment}\n    Generated by tools/gen-icon.py - regenerate with `python3 tools/gen-icon.py`.\n  -->\n"
        f"  {bg}{art}\n</svg>\n"
    )


def render(src, dest, size):
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size), str(src), "-o", str(dest)], check=True)


def main():
    stroke, head, _ = spiral_geometry()
    safe = fit(stroke, head, SAFE_RADIUS - 1)  # 1px for antialiasing
    full_fit = fit(stroke, head, FULL_RADIUS)
    print(f"adaptive: scale {safe[0]:.3f}, reach {safe[3] * safe[0]:.1f} (limit {SAFE_RADIUS}); "
          f"full-bleed: scale {full_fit[0]:.3f}, reach {full_fit[3] * full_fit[0]:.1f} (limit {FULL_RADIUS})")

    assets = ROOT / "assets"
    full = artwork(full_fit, CREAM, INK, OLIVE, AMBER)
    adaptive = artwork(safe, CREAM, INK, OLIVE, AMBER)
    (assets / "icon.svg").write_text(svg(
        "ReminDiary launcher icon: tapered history spiral round a tilted nib on olive. Full-bleed background.",
        OLIVE, full))
    (assets / "icon-foreground.svg").write_text(svg(
        "Adaptive-icon foreground: artwork fitted to the 66dp safe zone with no background, so app.json's adaptiveIcon.backgroundColor (#6B7B4E) shows through.",
        None, adaptive))
    (assets / "icon-monochrome.svg").write_text(svg(
        "Themed-icon (monochrome) layer: single fill, slit and ink hole cut out as negative space. Only the alpha channel matters.",
        None, artwork(safe, "#000", "#000", "#000", "#000", mono=True)))

    render(assets / "icon.svg", assets / "icon.png", 1024)
    render(assets / "icon-foreground.svg", assets / "android-icon-foreground.png", 1024)
    render(assets / "icon-monochrome.svg", assets / "android-icon-monochrome.png", 1024)
    render(assets / "icon.svg", assets / "splash-icon.png", 1024)
    render(assets / "icon.svg", assets / "favicon.png", 48)
    render(assets / "icon.svg", ROOT / "site" / "favicon.png", 48)
    render(assets / "icon.svg", ROOT / "fastlane/metadata/android/en-US/images/icon.png", 512)


if __name__ == "__main__":
    main()
