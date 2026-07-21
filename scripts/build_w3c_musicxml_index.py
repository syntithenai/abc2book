#!/usr/bin/env python3
"""Build or refresh the curated W3C MusicXML example index."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "local-resolver" / "fixtures" / "archives" / "w3c_musicxml_index.json"

DEFAULT_INDEX = [
    {
        "title": "Ode to Joy",
        "composer": "Ludwig van Beethoven",
        "url": "https://www.musicxml.com/wp-content/uploads/2017/12/ode-to-joy.musicxml",
        "keywords": ["ode", "joy", "beethoven", "symphony", "9"],
    },
    {
        "title": "Minuet in G",
        "composer": "Johann Sebastian Bach",
        "url": "https://www.musicxml.com/wp-content/uploads/2017/12/minuet-in-g.musicxml",
        "keywords": ["minuet", "bach", "g major"],
    },
    {
        "title": "Twinkle Twinkle Little Star",
        "composer": "Traditional",
        "url": "https://www.musicxml.com/wp-content/uploads/2017/12/twinkle-twinkle-little-star.musicxml",
        "keywords": ["twinkle", "traditional", "nursery"],
    },
]


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(DEFAULT_INDEX, indent=2) + "\n", encoding="utf-8")
    print("Wrote", OUT)


if __name__ == "__main__":
    main()
