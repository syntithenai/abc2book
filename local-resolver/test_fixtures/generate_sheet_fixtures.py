"""Generate synthetic sheet-image fixtures for tests."""

from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


FIXTURE_DIR = Path(__file__).resolve().parent / "sheet_images"


def _font(size: int = 18):
    try:
        return ImageFont.truetype("DejaVuSans.ttf", size=size)
    except OSError:
        return ImageFont.load_default()


def write_chord_chart(path: Path) -> None:
    image = Image.new("RGB", (720, 520), "white")
    draw = ImageDraw.Draw(image)
    font = _font(20)
    y = 30
    lines = [
        "Amazing Grace - Traditional",
        "",
        "Verse",
        "G        C      G",
        "Amazing grace how sweet the sound",
        "G        D      G",
        "That saved a wretch like me",
    ]
    for line in lines:
        draw.text((30, y), line, fill="black", font=font)
        y += 34
    image.save(path)


def write_staff_image(path: Path) -> None:
    image = Image.new("RGB", (720, 260), "white")
    draw = ImageDraw.Draw(image)
    top = 80
    for offset in range(5):
        y = top + offset * 12
        draw.line((40, y, 680, y), fill="black", width=2)
    draw.ellipse((120, top - 8, 136, top + 8), outline="black", width=2)
    draw.ellipse((220, top - 20, 236, top - 4), outline="black", width=2)
    draw.ellipse((320, top - 32, 336, top - 16), outline="black", width=2)
    image.save(path)


def write_mixed_lead_sheet(path: Path) -> None:
    image = Image.new("RGB", (720, 620), "white")
    draw = ImageDraw.Draw(image)
    font = _font(18)
    draw.text((30, 20), "Simple Song - Demo Artist", fill="black", font=font)
    draw.text((30, 58), "C        F      G", fill="black", font=font)
    top = 120
    for offset in range(5):
        y = top + offset * 12
        draw.line((40, y, 680, y), fill="black", width=2)
    draw.ellipse((120, top - 8, 136, top + 8), outline="black", width=2)
    draw.ellipse((220, top - 20, 236, top - 4), outline="black", width=2)
    draw.text((30, 220), "La la la this is a test", fill="black", font=font)
    draw.text((30, 260), "Chorus", fill="black", font=font)
    draw.text((30, 296), "F        C      G", fill="black", font=font)
    draw.text((30, 332), "Sing it loud and sing it clear", fill="black", font=font)
    image.save(path)


def main() -> None:
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    write_chord_chart(FIXTURE_DIR / "chord_chart.png")
    write_staff_image(FIXTURE_DIR / "staff_only.png")
    write_mixed_lead_sheet(FIXTURE_DIR / "mixed_lead_sheet.png")
    print(f"Wrote fixtures to {FIXTURE_DIR}")


if __name__ == "__main__":
    main()
