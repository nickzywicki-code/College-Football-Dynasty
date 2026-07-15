"""Image post-processing for the asset agent.

This is the same auto-clean pipeline used to integrate the hand-drawn art into
the game: chroma-key the magenta background to transparent, trim, quantize,
assemble uniform strips, preview the runtime team-tint, and emit inlined TS
sheet modules.

The keying rule keys the *magenta family* (green is clearly the smallest
channel) and deliberately spares skin (blue is smallest), brown balls, greys
and whites. Verified against pure #FF00FF and the off-magenta backgrounds the
uploaded sheets actually used (~(190,0,165), (185,76,131)).
"""

from __future__ import annotations
import base64
import io
from typing import List, Optional, Tuple

from PIL import Image


# --- keying ----------------------------------------------------------------

def is_magenta_bg(r: int, g: int, b: int, margin: int = 40) -> bool:
    """True for the magenta/pink background family (green is smallest by margin)."""
    return (g + margin < r) and (g + margin < b)


def key_magenta(img: Image.Image, margin: int = 40, kill_grid: bool = False) -> Image.Image:
    """Return an RGBA copy with the magenta background made transparent.

    kill_grid also removes near-black cell borders (only needed for sheets that
    were drawn with a grid; clean single-subject generations don't need it).
    """
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_magenta_bg(r, g, b, margin) or (kill_grid and r < 45 and g < 45 and b < 45):
                px[x, y] = (0, 0, 0, 0)
    return img


def trim(img: Image.Image) -> Image.Image:
    """Crop to the non-transparent bounding box."""
    bb = img.getbbox()
    return img.crop(bb) if bb else img


# --- quantize (keep the blocky look + small data URIs) ---------------------

def quantize(img: Image.Image, colors: int = 48) -> Image.Image:
    img = img.convert("RGBA")
    q = img.quantize(colors=colors, method=Image.FASTOCTREE, dither=Image.NONE).convert("RGBA")
    src, dst = img.load(), q.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            if src[x, y][3] < 8:  # restore hard alpha the palette pass fuzzed
                dst[x, y] = (0, 0, 0, 0)
    return q


# --- assembling many single sprites into one uniform sheet -----------------

def assemble_grid(cells: List[Image.Image], cols: int, baseline: bool = True,
                  pad: int = 2) -> Tuple[Image.Image, int, int]:
    """Pack trimmed sprites into a uniform grid. Returns (sheet, cell_w, cell_h).

    baseline=True bottom-aligns each sprite (feet on a common line) — right for
    standing/running figures; False centers vertically — right for headshots.
    """
    cells = [trim(c) for c in cells]
    cw = max(c.width for c in cells) + pad
    ch = max(c.height for c in cells) + pad
    rows = (len(cells) + cols - 1) // cols
    sheet = Image.new("RGBA", (cw * cols, ch * rows), (0, 0, 0, 0))
    for i, c in enumerate(cells):
        gx = (i % cols) * cw + (cw - c.width) // 2
        gy = (i // cols) * ch + (ch - c.height - 1 if baseline else (ch - c.height) // 2)
        sheet.alpha_composite(c, (gx, gy))
    return sheet, cw, ch


# --- runtime team-tint preview (mirrors the in-game shader) -----------------

def _hex(c: str) -> Tuple[int, int, int]:
    c = c.lstrip("#")
    return int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)


def tint(img: Image.Image, primary: str, secondary: str, sat_thresh: int = 34) -> Image.Image:
    """Team-tint the greyscale (low-saturation) pixels, luminance-preserving.

    This is exactly what the game does at runtime. Run it as QA: if the jersey
    doesn't recolor here, Gemini painted a colored uniform and needs re-prompting.
    """
    img = img.convert("RGBA")
    px = img.load()
    pr, pg, pb = _hex(primary)
    sr, sg, sb = _hex(secondary)
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 8:
                continue
            sat = max(r, g, b) - min(r, g, b)
            if sat < sat_thresh:
                lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
                k = min(1.0, lum * 1.15)
                use2 = lum > 0.82
                px[x, y] = (
                    int((sr if use2 else pr) * k),
                    int((sg if use2 else pg) * k),
                    int((sb if use2 else pb) * k),
                    a,
                )
    return img


def checker(img: Image.Image, sq: int = 8) -> Image.Image:
    """Composite onto a checkerboard so transparency is visible in previews."""
    w, h = img.size
    bg = Image.new("RGBA", (w, h), (60, 60, 60, 255))
    p = bg.load()
    for y in range(h):
        for x in range(w):
            if (x // sq + y // sq) % 2 == 0:
                p[x, y] = (85, 85, 85, 255)
    bg.alpha_composite(img)
    return bg


# --- emit inlined TS sheet modules the game imports ------------------------

def to_data_uri(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def write_ts_sheet(path: str, consts: dict, sheet_var: str, img: Image.Image,
                   header: str) -> int:
    """Write a `export const NAME = value;` module + the base64 sheet. Returns bytes."""
    lines = [f"// {header}"]
    for k, v in consts.items():
        lines.append(f"export const {k} = {v};")
    lines.append(f'export const {sheet_var} = "{to_data_uri(img)}";')
    text = "\n".join(lines) + "\n"
    with open(path, "w") as f:
        f.write(text)
    return len(text)
