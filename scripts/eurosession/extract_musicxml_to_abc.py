#!/usr/bin/env python3
"""Convert MusicXML (.mxl / .xml) to ABC with all parts via xml2abc.

  python3 scripts/eurosession/extract_musicxml_to_abc.py tune.mxl
  python3 scripts/eurosession/extract_musicxml_to_abc.py tune.mxl -o tune.abc
  python3 scripts/eurosession/extract_musicxml_to_abc.py tune.mxl --split outdir/
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
XML2ABC_CLI = SCRIPT_DIR / "xml2abc-cli.js"


def read_musicxml(path: Path) -> str:
    path = path.expanduser().resolve()
    if not path.is_file():
        raise SystemExit(f"missing {path}")
    if path.suffix.lower() == ".mxl":
        with zipfile.ZipFile(path) as zf:
            names = [n for n in zf.namelist() if not n.endswith("/")]
            root = None
            if "META-INF/container.xml" in names:
                import xml.etree.ElementTree as ET

                container = zf.read("META-INF/container.xml")
                rootfile = ET.fromstring(container).find(".//{*}rootfile")
                if rootfile is not None:
                    root = rootfile.get("full-path")
            if not root:
                xml_names = [n for n in names if n.lower().endswith((".xml", ".musicxml"))]
                if not xml_names:
                    raise SystemExit(f"no MusicXML in {path}")
                root = xml_names[0]
            text = zf.read(root).decode("utf-8", errors="replace")
    else:
        text = path.read_text(encoding="utf-8", errors="replace")
    if "<score-partwise" not in text and "<score-timewise" not in text:
        raise SystemExit(f"not MusicXML: {path}")
    return text


def convert_all_parts(xml_text: str, title: str = "") -> str:
    with tempfile.NamedTemporaryFile("w", suffix=".xml", delete=False, encoding="utf-8") as tmp:
        tmp.write(xml_text)
        tmp_path = tmp.name
    try:
        cmd = ["node", str(XML2ABC_CLI)]
        if title:
            cmd.extend(["--title", title])
        cmd.append(tmp_path)
        proc = subprocess.run(cmd, capture_output=True, text=True, cwd=str(SCRIPT_DIR))
        if proc.returncode != 0:
            raise RuntimeError((proc.stderr or proc.stdout or "xml2abc failed").strip())
        abc = (proc.stdout or "").strip()
        if not abc:
            raise RuntimeError("xml2abc produced empty ABC")
        return abc
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def split_by_voice(abc: str) -> list[tuple[str, str]]:
    """Return [(voice_label, abc_fragment), ...] for each V: music block."""
    lines = abc.splitlines()
    voice_names: dict[int, str] = {}
    for line in lines:
        m = re.match(r"^V:(\d+)\s+.*\bnm=\"([^\"]+)\"", line)
        if m:
            voice_names[int(m.group(1))] = m.group(2)

    header: list[str] = []
    blocks: list[tuple[int, list[str]]] = []
    cur_num = 0
    cur_body: list[str] = []
    seen_music = False

    def flush() -> None:
        nonlocal cur_num, cur_body
        if cur_num and cur_body:
            blocks.append((cur_num, cur_body))
        cur_num = 0
        cur_body = []

    for line in lines:
        m = re.match(r"^V:(\d+)\s*$", line)
        if m:
            flush()
            cur_num = int(m.group(1))
            seen_music = True
            continue
        if not seen_music:
            if not line.startswith("%%score"):
                header.append(line)
            continue
        cur_body.append(line)
    flush()

    out: list[tuple[str, str]] = []
    for num, body in blocks:
        name = voice_names.get(num, f"part {num}")
        label = f"V:{num} nm=\"{name}\""
        text = "\n".join(header + ["%%score", label, ""] + body).strip() + "\n"
        out.append((name, text))
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="MusicXML → ABC (all parts)")
    parser.add_argument("musicxml", type=Path)
    parser.add_argument("-o", "--out", type=Path, default="", help="Write combined ABC here")
    parser.add_argument(
        "--split",
        type=Path,
        default="",
        help="Also write one .abc per part into this directory",
    )
    parser.add_argument("--title", default="", help="Override T: title")
    args = parser.parse_args()

    src = args.musicxml
    title = args.title or src.stem.replace("-", " ")
    xml_text = read_musicxml(src)
    abc = convert_all_parts(xml_text, title=title)

    out = Path(args.out) if args.out else src.with_suffix(".abc")
    out.write_text(abc + "\n", encoding="utf-8")
    print(f"wrote {out} ({len(abc.splitlines())} lines)")

    if args.split:
        split_dir = args.split.expanduser().resolve()
        split_dir.mkdir(parents=True, exist_ok=True)
        parts = split_by_voice(abc)
        for i, (name, part_abc) in enumerate(parts, start=1):
            slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or f"part{i}"
            part_path = split_dir / f"{src.stem}-{i:02d}-{slug}.abc"
            part_path.write_text(part_abc, encoding="utf-8")
            print(f"  part {i}: {part_path.name} ({name})")
        if not parts:
            print("  (no V: blocks to split)", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
