#!/usr/bin/env python3
"""Generate Android launcher mipmaps from public/tunebook-icon-launcher.svg."""

from __future__ import annotations

import io
import sys
from pathlib import Path

try:
    import cairosvg
except ImportError:
    print("Install cairosvg: pip install cairosvg", file=sys.stderr)
    sys.exit(1)

try:
    from PIL import Image
except ImportError:
    print("Install Pillow: pip install Pillow", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"
LAUNCHER_SVG = PUBLIC / "tunebook-icon-launcher.svg"
# Match website header nav button (--app-header-nav-btn-bg in theme.css).
BACKGROUND = "#4A90E8"

LAUNCHER_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

FOREGROUND_SIZES = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}


def render_rgba(svg_text: str, size: int) -> Image.Image:
    png_bytes = cairosvg.svg2png(
        bytestring=svg_text.encode("utf-8"),
        output_width=size,
        output_height=size,
    )
    return Image.open(io.BytesIO(png_bytes)).convert("RGBA")


def composite_launcher(foreground: Image.Image, size: int) -> Image.Image:
    background = Image.new("RGBA", (size, size), BACKGROUND)
    background.alpha_composite(foreground)
    return background


def write_png(path: Path, image: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)
    print(f"  {path.relative_to(ROOT)} ({image.width}x{image.height})")


def main() -> None:
    if not LAUNCHER_SVG.exists():
        raise SystemExit(f"Missing {LAUNCHER_SVG} — run scripts/sync-tunebook-icon.py first")

    svg_text = LAUNCHER_SVG.read_text(encoding="utf-8")

    print("Generating Android launcher icons …")
    for folder, size in LAUNCHER_SIZES.items():
        foreground = render_rgba(svg_text, size)
        launcher = composite_launcher(foreground, size)
        base = ANDROID_RES / folder
        write_png(base / "ic_launcher.png", launcher)
        write_png(base / "ic_launcher_round.png", launcher)

    print("Generating Android adaptive-icon foregrounds …")
    for folder, size in FOREGROUND_SIZES.items():
        foreground = render_rgba(svg_text, size)
        write_png(ANDROID_RES / folder / "ic_launcher_foreground.png", foreground)


if __name__ == "__main__":
    main()
