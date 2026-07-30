#!/usr/bin/env python3
"""Sync tunebook icon assets from twonotes.svg with computed padding."""

from __future__ import annotations

import io
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "twonotes.svg"
DEST = ROOT / "public" / "tunebook-icon.svg"
DEST_HEADER = ROOT / "public" / "tunebook-icon-header.svg"
DEST_LAUNCHER = ROOT / "public" / "tunebook-icon-launcher.svg"
ICONS = ROOT / "src" / "Icons.js"

# Inkscape guide strokes — not part of the published icon.
GUIDE_IDS = ("path6", "path7")

WHITE_RASTER_FILTER = """    <filter id="tunebook-white-raster" color-interpolation-filters="sRGB">
      <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0"/>
    </filter>"""


def _require_cairosvg():
    try:
        import cairosvg  # noqa: F401
        from PIL import Image  # noqa: F401
    except ImportError:
        print("Install cairosvg and Pillow: pip install cairosvg Pillow", file=sys.stderr)
        raise SystemExit(1)


def source_viewbox(text: str) -> str:
    match = re.search(r'<svg[^>]*viewBox="([^"]+)"', text)
    if not match:
        raise SystemExit("twonotes.svg: missing viewBox")
    return match.group(1)


def clean_fragment(fragment: str) -> str:
    fragment = re.sub(r'\s+id="[^"]*"', "", fragment)
    fragment = re.sub(r'\s+sodipodi:[^\s=]+="[^"]*"', "", fragment)
    fragment = re.sub(r'\s+inkscape:[^\s=]+="[^"]*"', "", fragment)
    return fragment


def extract_icon_layer(text: str) -> tuple[str, str, str]:
    """Return layer content, transform, and document viewBox for the full icon."""
    layer = re.search(
        r'<g[^>]*id="layer1"[^>]*transform="([^"]+)"[^>]*>([\s\S]*?)</g>\s*</svg>',
        text,
    )
    if not layer:
        raise SystemExit("twonotes.svg: missing layer1 group")

    inner = layer.group(2)
    for guide_id in GUIDE_IDS:
        inner = re.sub(
            rf'<path[^>]*\bid="{re.escape(guide_id)}"[^>]*/>\s*',
            "",
            inner,
        )

    return clean_fragment(inner), layer.group(1), source_viewbox(text)


def provisional_svg(layer_block: str, transform: str, viewbox: str) -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" '
        'xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'viewBox="{viewbox}">'
        f'<g transform="{transform}">{layer_block}</g></svg>'
    )


def content_bbox(layer_block: str, transform: str, viewbox: str) -> tuple[float, float, float, float]:
    import cairosvg
    from PIL import Image

    svg = provisional_svg(layer_block, transform, viewbox)
    png = cairosvg.svg2png(bytestring=svg.encode("utf-8"), output_width=1024, output_height=1024)
    img = Image.open(io.BytesIO(png)).convert("RGBA")
    pixels = img.load()
    width, height = img.size
    xs: list[int] = []
    ys: list[int] = []
    for y in range(height):
        for x in range(width):
            if pixels[x, y][3] > 10:
                xs.append(x)
                ys.append(y)
    if not xs:
        raise SystemExit("twonotes.svg: icon rendered empty")

    _, _, vb_w, vb_h = map(float, viewbox.split())
    scale_x = vb_w / width
    scale_y = vb_h / height
    x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
    return (
        x0 * scale_x,
        y0 * scale_y,
        x1 * scale_x,
        y1 * scale_y,
    )


def padded_viewbox(
    bbox: tuple[float, float, float, float],
    *,
    padding_ratio: float,
    extra_bottom: float = 0.0,
) -> str:
    x0, y0, x1, y1 = bbox
    content_w = max(x1 - x0, 1e-6)
    content_h = max(y1 - y0, 1e-6)
    view_w = content_w / max(1e-6, 1 - (2 * padding_ratio))
    view_h = content_h / max(1e-6, 1 - (2 * padding_ratio) - extra_bottom)
    center_x = (x0 + x1) / 2
    center_y = (y0 + y1) / 2
    view_x = center_x - view_w / 2
    view_y = center_y - view_h / 2 - (extra_bottom * view_h / 2)
    return f"{view_x:.6f} {view_y:.6f} {view_w:.6f} {view_h:.6f}"


def recolor_black(layer_block: str, color: str) -> str:
    layer_block = re.sub(r"fill:#000000", f"fill:{color}", layer_block)
    layer_block = re.sub(r"stroke:#000000", f"stroke:{color}", layer_block)
    return layer_block


def recolor_raster_white(layer_block: str) -> str:
    return re.sub(
        r"(<image)(\s)",
        r'\1 filter="url(#tunebook-white-raster)"\2',
        layer_block,
        count=1,
    )


def build_defs(*, shadow: bool, white_raster: bool) -> str:
    if not shadow and not white_raster:
        return ""
    lines = ["  <defs>"]
    if shadow:
        lines.append(
            '    <filter id="tunebook-icon-shadow" x="-120%" y="-120%" width="340%" height="340%" color-interpolation-filters="sRGB">'
        )
        lines.append(
            '      <feDropShadow dx="0" dy="0.35" stdDeviation="0.18" flood-color="#000000" flood-opacity="0.92"/>'
        )
        lines.append(
            '      <feDropShadow dx="0" dy="0.75" stdDeviation="0.42" flood-color="#000000" flood-opacity="0.78"/>'
        )
        lines.append(
            '      <feDropShadow dx="0" dy="1.35" stdDeviation="0.9" flood-color="#000000" flood-opacity="0.45"/>'
        )
        lines.append("    </filter>")
    if white_raster:
        lines.append(WHITE_RASTER_FILTER)
    lines.append("  </defs>\n")
    return "\n".join(lines)


def build_svg(
    viewbox: str,
    layer_block: str,
    transform: str,
    *,
    shadow: bool,
    fill_color: str | None = None,
) -> str:
    layer = layer_block
    white_raster = fill_color is not None and "<image" in layer
    if fill_color:
        layer = recolor_black(layer, fill_color)
        if white_raster:
            layer = recolor_raster_white(layer)
    wrapped = f'<g transform="{transform}">{layer}</g>'
    if shadow:
        wrapped = re.sub(
            r"(<g)(\s+transform=)",
            r'\1 filter="url(#tunebook-icon-shadow)"\2',
            wrapped,
            count=1,
        )
    defs = build_defs(shadow=shadow, white_raster=white_raster)
    return (
        "<!-- Synced from twonotes.svg — run: python3 scripts/sync-tunebook-icon.py -->\n"
        '<svg xmlns="http://www.w3.org/2000/svg" '
        'xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'viewBox="{viewbox}" aria-hidden="true" shape-rendering="geometricPrecision">\n'
        f"{defs}"
        f"  {wrapped}\n"
        "</svg>\n"
    )


def update_icons_js() -> None:
    react_icon = (
        "'musicheader': <img src=\"/tunebook-icon.svg\" alt=\"\" "
        'aria-hidden="true" className="header-tunebook-icon" />,'
    )
    text = ICONS.read_text(encoding="utf-8")
    updated, count = re.subn(
        r"    'musicheader': <(?:svg|img)[\s\S]*?>,",
        f"    {react_icon}",
        text,
        count=1,
    )
    if count != 1:
        raise SystemExit("Icons.js: could not update musicheader entry")
    ICONS.write_text(updated, encoding="utf-8")


def main() -> None:
    _require_cairosvg()
    if not SOURCE.exists():
        raise SystemExit(f"Missing {SOURCE}")

    text = SOURCE.read_text(encoding="utf-8")
    layer_block, transform, doc_viewbox = extract_icon_layer(text)
    bbox = content_bbox(layer_block, transform, doc_viewbox)

    standard_vb = padded_viewbox(bbox, padding_ratio=0.01)
    header_vb = padded_viewbox(bbox, padding_ratio=0.10, extra_bottom=0.08)
    launcher_vb = padded_viewbox(bbox, padding_ratio=0.24)

    DEST.write_text(
        build_svg(standard_vb, layer_block, transform, shadow=False),
        encoding="utf-8",
    )
    print(f"Wrote {DEST.relative_to(ROOT)} (viewBox {standard_vb})")

    DEST_HEADER.write_text(
        build_svg(header_vb, layer_block, transform, shadow=True, fill_color="#ffffff"),
        encoding="utf-8",
    )
    print(f"Wrote {DEST_HEADER.relative_to(ROOT)} (viewBox {header_vb})")

    DEST_LAUNCHER.write_text(
        build_svg(launcher_vb, layer_block, transform, shadow=False),
        encoding="utf-8",
    )
    print(f"Wrote {DEST_LAUNCHER.relative_to(ROOT)} (viewBox {launcher_vb})")

    update_icons_js()
    print(f"Updated {ICONS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
