#!/usr/bin/env python3
"""Generate Tune Book favicon and PWA PNG/ICO assets from public/tunebook-icon.svg."""

from __future__ import annotations

import io
import re
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
MASTER_SVG = PUBLIC / "tunebook-icon.svg"
PNG_OUTPUTS = {
    "favicon.png": 48,
    "home-small.png": 48,
    "home-appicon.png": 144,
    "logo192.png": 192,
    "apple-touch-icon.png": 180,
    "logo512.png": 512,
}


def favicon_svg() -> str:
    return MASTER_SVG.read_text(encoding="utf-8")


def write_png(name: str, size: int, dest: Path) -> None:
    cairosvg.svg2png(
        bytestring=favicon_svg().encode("utf-8"),
        write_to=str(dest),
        output_width=size,
        output_height=size,
    )
    print(f"  {dest.relative_to(ROOT)} ({size}x{size})")


def write_ico(dest: Path, sizes: tuple[int, ...] = (16, 32, 48)) -> None:
    images = []
    svg = favicon_svg()
    for size in sizes:
        png_bytes = cairosvg.svg2png(
            bytestring=svg.encode("utf-8"),
            output_width=size,
            output_height=size,
        )
        images.append(Image.open(io.BytesIO(png_bytes)).convert("RGBA"))
    images[0].save(dest, format="ICO", sizes=[(s, s) for s in sizes], append_images=images[1:])
    print(f"  {dest.relative_to(ROOT)} ({', '.join(str(s) for s in sizes)})")


def main() -> None:
    if not MASTER_SVG.exists():
        raise SystemExit(f"Missing {MASTER_SVG}")

    PUBLIC.mkdir(parents=True, exist_ok=True)
    print("Generating PNG favicon/PWA icons into public/ …")
    for name, size in PNG_OUTPUTS.items():
        write_png(name, size, PUBLIC / name)

    print("Generating favicon.ico …")
    write_ico(PUBLIC / "favicon.ico")

    print("Copying icons to repo root …")
    for name in list(PNG_OUTPUTS) + ["favicon.ico"]:
        src = PUBLIC / name
        dst = ROOT / name
        dst.write_bytes(src.read_bytes())
        print(f"  {dst.relative_to(ROOT)}")

    (ROOT / "tunebook-icon.svg").write_text(MASTER_SVG.read_text(encoding="utf-8"), encoding="utf-8")
    print("  tunebook-icon.svg")


if __name__ == "__main__":
    main()
