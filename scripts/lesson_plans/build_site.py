#!/usr/bin/env python3
"""Build a static HTML site from lesson plan markdown files."""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LESSON_ROOT = ROOT / "lesson plans"
SITE_ROOT = LESSON_ROOT / "site"
SKIP_DIRS = {".reports", "wiki_index", "site"}
SKIP_FILES = {"README.md"}


@dataclass
class LessonEntry:
    rel_path: str
    html_path: str
    title: str
    section: str
    subsection: str
    region_family: str = ""
    region_name: str = ""
    meta: dict = field(default_factory=dict)


def ensure_markdown() -> None:
    try:
        import markdown  # noqa: F401
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "markdown", "-q"])


def parse_frontmatter(raw: str) -> tuple[dict, str]:
    if not raw.startswith("---\n"):
        return {}, raw
    end = raw.find("\n---\n", 4)
    if end == -1:
        return {}, raw
    meta: dict = {}
    for line in raw[4:end].splitlines():
        if ":" not in line:
            continue
        key, val = line.split(":", 1)
        key, val = key.strip(), val.strip()
        if val.startswith("[") or val.startswith("{"):
            try:
                meta[key] = json.loads(val)
            except json.JSONDecodeError:
                meta[key] = val
        else:
            meta[key] = val
    return meta, raw[end + 5 :]


def title_from_markdown(meta: dict, body: str, path: Path) -> str:
    if meta.get("title"):
        return str(meta["title"])
    m = re.search(r"^#\s+(.+)$", body, re.MULTILINE)
    if m:
        return m.group(1).strip()
    return path.stem.replace("-", " ").title()


def section_labels(rel: Path) -> tuple[str, str, str, str]:
    parts = rel.parts
    section = parts[0] if parts else "lessons"
    subsection = parts[1] if len(parts) > 2 else ""
    region_family = ""
    region_name = ""
    if section == "10-regions" and len(parts) >= 3:
        region_family = parts[1]
        region_name = parts[2]
    return section, subsection, region_family, region_name


def humanize_section(name: str) -> str:
    if re.match(r"^\d{2}-", name):
        name = name[3:]
    return name.replace("-", " ").title()


def collect_lessons() -> list[LessonEntry]:
    entries: list[LessonEntry] = []
    for path in sorted(LESSON_ROOT.rglob("*.md")):
        rel = path.relative_to(LESSON_ROOT)
        if rel.parts and rel.parts[0] in SKIP_DIRS:
            continue
        if rel.name in SKIP_FILES:
            continue
        raw = path.read_text(encoding="utf-8")
        meta, body = parse_frontmatter(raw)
        section, subsection, region_family, region_name = section_labels(rel)
        html_rel = rel.with_suffix(".html")
        entries.append(
            LessonEntry(
                rel_path=rel.as_posix(),
                html_path=html_rel.as_posix(),
                title=title_from_markdown(meta, body, path),
                section=section,
                subsection=subsection,
                region_family=region_family,
                region_name=region_name,
                meta=meta,
            )
        )
    return entries


def render_markdown(body: str) -> str:
    import markdown

    return markdown.markdown(
        body,
        extensions=["tables", "fenced_code", "sane_lists", "smarty"],
        output_format="html5",
    )


def meta_badges(meta: dict) -> str:
    if not meta:
        return ""
    bits: list[str] = []
    for key in ("track", "tier", "region", "difficulty", "status"):
        if key in meta and meta[key] not in ("", None):
            bits.append(f'<span class="badge">{html.escape(str(key))}: {html.escape(str(meta[key]))}</span>')
    if meta.get("prerequisites"):
        prereqs = meta["prerequisites"]
        if isinstance(prereqs, list):
            bits.append(
                '<span class="badge">prerequisites: '
                + html.escape(", ".join(str(p) for p in prereqs))
                + "</span>"
            )
    return " ".join(bits)


def page_shell(
    title: str,
    content: str,
    *,
    nav: str,
    breadcrumbs: str = "",
    depth: int = 0,
) -> str:
    root = "../" * depth
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)} — Lesson Plans</title>
  <link rel="stylesheet" href="{root}assets/site.css">
</head>
<body>
  <header class="site-header">
    <div class="wrap">
      <a class="brand" href="{root}index.html">Music Theory Lesson Plans</a>
      <nav class="top-nav">{nav}</nav>
    </div>
  </header>
  <main class="wrap">
    {breadcrumbs}
    {content}
  </main>
  <footer class="site-footer">
    <div class="wrap">Static preview generated from <code>lesson plans/</code> markdown.</div>
  </footer>
</body>
</html>
"""


def rel_href(from_html: str, to_html: str) -> str:
    from_dir = (SITE_ROOT / from_html).parent
    to_path = SITE_ROOT / to_html
    return os.path.relpath(to_path, from_dir).replace(os.sep, "/")


def _region_display_name(family: str, name: str) -> str:
    fam = humanize_section(family) if family else ""
    reg = name.replace("-", " ").title() if name else ""
    if fam and reg:
        return f"{reg} ({fam})"
    return reg or fam or "Regions"


def build_index(entries: list[LessonEntry]) -> None:
    curriculum: dict[str, list[LessonEntry]] = {}
    regions: dict[tuple[str, str], list[LessonEntry]] = {}

    for entry in entries:
        if entry.section == "10-regions" and entry.region_name:
            regions.setdefault((entry.region_family, entry.region_name), []).append(entry)
        else:
            curriculum.setdefault(entry.section, []).append(entry)

    section_blocks: list[str] = []
    toc_links: list[str] = []

    for section in sorted(curriculum):
        items = sorted(curriculum[section], key=lambda e: e.rel_path)
        rows = []
        for e in items:
            rows.append(
                f'<li><a href="{html.escape(e.html_path)}">{html.escape(e.title)}</a>'
                f'<span class="path">{html.escape(e.rel_path)}</span></li>'
            )
        sid = html.escape(section)
        section_blocks.append(
            f'<section class="index-section" id="{sid}">'
            f"<h2>{html.escape(humanize_section(section))}</h2>"
            f'<p class="section-meta">{len(items)} lesson{"s" if len(items) != 1 else ""}</p>'
            f'<ul class="lesson-list">{"".join(rows)}</ul></section>'
        )
        toc_links.append(f'<a href="#{sid}">{html.escape(humanize_section(section))}</a>')

    if regions:
        region_rows: list[str] = []
        for key in sorted(regions):
            family, name = key
            items = sorted(regions[key], key=lambda e: e.rel_path)
            rid = html.escape(f"region-{family}-{name}")
            label = _region_display_name(family, name)
            sub = "".join(
                f'<li><a href="{html.escape(e.html_path)}">{html.escape(e.title)}</a>'
                f'<span class="path">{html.escape(e.rel_path)}</span></li>'
                for e in items
            )
            region_rows.append(
                f'<div class="region-unit" id="{rid}">'
                f"<h3>{html.escape(label)}</h3>"
                f'<p class="section-meta">{len(items)} lessons</p>'
                f'<ul class="lesson-list">{sub}</ul></div>'
            )
        section_blocks.append(
            '<section class="index-section" id="10-regions">'
            "<h2>Regions</h2>"
            f'<p class="section-meta">{len(regions)} regional unit{"s" if len(regions) != 1 else ""}, '
            f'{sum(len(v) for v in regions.values())} lessons</p>'
            f'{"".join(region_rows)}</section>'
        )
        toc_links.append('<a href="#10-regions">Regions</a>')

    toc = "".join(toc_links)
    content = f"""
    <div class="index-hero">
      <h1>Lesson Plan Index</h1>
      <p>{len(entries)} lessons. Theory and skills tracks below; regional traditions grouped under <strong>Regions</strong>.</p>
      <p class="index-actions"><a class="button" href="README.html">Curriculum README</a></p>
    </div>
    <nav class="index-toc">{toc}</nav>
    {''.join(section_blocks)}
    """
    (SITE_ROOT / "index.html").write_text(
        page_shell("Index", content, nav='<a href="index.html">Index</a> <a href="README.html">README</a>'),
        encoding="utf-8",
    )


def build_readme() -> None:
    readme = LESSON_ROOT / "README.md"
    if not readme.exists():
        return
    raw = readme.read_text(encoding="utf-8")
    _, body = parse_frontmatter(raw)
    content = f'<article class="lesson-body readme-body">{render_markdown(body)}</article>'
    breadcrumbs = '<nav class="breadcrumbs"><a href="index.html">Index</a> / README</nav>'
    (SITE_ROOT / "README.html").write_text(
        page_shell("README", content, nav='<a href="index.html">Index</a> <a href="README.html">README</a>', breadcrumbs=breadcrumbs),
        encoding="utf-8",
    )


def build_lesson_pages(entries: list[LessonEntry]) -> None:
    for entry in entries:
        src = LESSON_ROOT / entry.rel_path
        raw = src.read_text(encoding="utf-8")
        meta, body = parse_frontmatter(raw)
        rendered = render_markdown(body)
        badges = meta_badges(meta)
        if entry.region_name:
            rid = f"region-{entry.region_family}-{entry.region_name}"
            crumbs = (
                f'<nav class="breadcrumbs">'
                f'<a href="{rel_href(entry.html_path, "index.html")}">Index</a> / '
                f'<a href="{rel_href(entry.html_path, "index.html")}#10-regions">Regions</a> / '
                f'<a href="{rel_href(entry.html_path, "index.html")}#{html.escape(rid)}">'
                f'{html.escape(_region_display_name(entry.region_family, entry.region_name))}</a> / '
                f'{html.escape(entry.title)}</nav>'
            )
        else:
            crumbs = (
                f'<nav class="breadcrumbs">'
                f'<a href="{rel_href(entry.html_path, "index.html")}">Index</a> / '
                f'<a href="{rel_href(entry.html_path, "index.html")}#{html.escape(entry.section)}">'
                f'{html.escape(humanize_section(entry.section))}</a> / '
                f'{html.escape(entry.title)}</nav>'
            )
        content = f"""
        <article class="lesson">
          <header class="lesson-header">
            <h1>{html.escape(entry.title)}</h1>
            {f'<div class="lesson-meta">{badges}</div>' if badges else ''}
            <p class="source-file"><code>{html.escape(entry.rel_path)}</code></p>
          </header>
          <div class="lesson-body">{rendered}</div>
        </article>
        """
        out = SITE_ROOT / entry.html_path
        out.parent.mkdir(parents=True, exist_ok=True)
        depth = len(Path(entry.html_path).parts) - 1
        nav = (
            f'<a href="{"../" * depth}index.html">Index</a> '
            f'<a href="{"../" * depth}README.html">README</a>'
        )
        out.write_text(page_shell(entry.title, content, nav=nav, breadcrumbs=crumbs, depth=depth), encoding="utf-8")


def write_css() -> None:
    css = """
:root {
  --bg: #f7f4ef;
  --paper: #fffdf9;
  --ink: #1f1a14;
  --muted: #5f574d;
  --accent: #8b3a2a;
  --accent-soft: #efe2dc;
  --line: #ddd4c8;
  --code-bg: #f1ebe3;
  --shadow: 0 10px 30px rgba(31, 26, 20, 0.08);
  --max: 920px;
  --font: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
  --sans: "Segoe UI", system-ui, sans-serif;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  color: var(--ink);
  background: linear-gradient(180deg, #efe7db 0%, var(--bg) 180px);
  font-family: var(--font);
  line-height: 1.65;
}
.wrap { max-width: var(--max); margin: 0 auto; padding: 0 1.25rem; }
.site-header {
  background: rgba(255, 253, 249, 0.92);
  border-bottom: 1px solid var(--line);
  backdrop-filter: blur(8px);
  position: sticky;
  top: 0;
  z-index: 10;
}
.site-header .wrap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 3.5rem;
  gap: 1rem;
}
.brand {
  color: var(--ink);
  text-decoration: none;
  font-weight: 700;
  letter-spacing: 0.01em;
}
.top-nav a, .index-toc a {
  color: var(--accent);
  text-decoration: none;
  margin-left: 1rem;
}
.top-nav a:hover, .index-toc a:hover { text-decoration: underline; }
.site-footer {
  margin-top: 4rem;
  padding: 2rem 0;
  color: var(--muted);
  font-size: 0.92rem;
  border-top: 1px solid var(--line);
}
.index-hero, .lesson-header { padding: 2rem 0 1rem; }
.index-hero h1, .lesson-header h1 { margin: 0 0 0.5rem; line-height: 1.15; }
.index-toc {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  padding: 1rem 0 2rem;
  border-bottom: 1px solid var(--line);
  margin-bottom: 2rem;
}
.index-toc a { margin: 0; }
.index-section { margin-bottom: 2.5rem; }
.region-unit {
  margin: 1.5rem 0 2rem;
  padding: 1rem 1.25rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--paper);
}
.region-unit h3 { margin-top: 0; }
.index-section h2 { margin-bottom: 0.25rem; }
.section-meta { color: var(--muted); margin-top: 0; }
.lesson-list { list-style: none; padding: 0; margin: 0; }
.lesson-list li {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  align-items: baseline;
  padding: 0.7rem 0;
  border-bottom: 1px solid var(--line);
}
.lesson-list a { color: var(--ink); font-weight: 600; text-decoration: none; }
.lesson-list a:hover { color: var(--accent); text-decoration: underline; }
.lesson-list .path {
  color: var(--muted);
  font-family: var(--sans);
  font-size: 0.85rem;
}
.breadcrumbs {
  padding: 1rem 0 0;
  color: var(--muted);
  font-family: var(--sans);
  font-size: 0.92rem;
}
.breadcrumbs a { color: var(--accent); text-decoration: none; }
.lesson {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: var(--shadow);
  padding: 0 1.5rem 2rem;
  margin: 1rem 0 3rem;
}
.lesson-meta { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0.75rem 0; }
.badge {
  display: inline-block;
  background: var(--accent-soft);
  color: var(--accent);
  border-radius: 999px;
  padding: 0.15rem 0.65rem;
  font-family: var(--sans);
  font-size: 0.78rem;
}
.source-file { color: var(--muted); font-family: var(--sans); font-size: 0.85rem; }
.lesson-body :is(h2, h3, h4) { margin-top: 1.75rem; }
.lesson-body p, .lesson-body li { max-width: 72ch; }
.lesson-body table {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
  font-size: 0.95rem;
}
.lesson-body th, .lesson-body td {
  border: 1px solid var(--line);
  padding: 0.55rem 0.7rem;
  text-align: left;
}
.lesson-body th { background: var(--accent-soft); }
.lesson-body code {
  background: var(--code-bg);
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  font-size: 0.92em;
}
.lesson-body pre {
  background: #201b16;
  color: #f7f0e7;
  padding: 1rem;
  border-radius: 10px;
  overflow-x: auto;
}
.lesson-body pre code { background: transparent; padding: 0; color: inherit; }
.lesson-body blockquote {
  margin: 1rem 0;
  padding: 0.5rem 1rem;
  border-left: 4px solid var(--accent);
  background: var(--accent-soft);
}
.lesson-body img {
  display: block;
  max-width: min(100%, 520px);
  height: auto;
  margin: 1.25rem auto;
  border-radius: 8px;
  border: 1px solid var(--line);
  box-shadow: 0 4px 16px rgba(31, 26, 20, 0.1);
}
.lesson-body p:has(+ img) {
  margin-bottom: 0.35rem;
}
.button {
  display: inline-block;
  background: var(--accent);
  color: #fff;
  padding: 0.55rem 1rem;
  border-radius: 999px;
  text-decoration: none;
  font-family: var(--sans);
}
.button:hover { filter: brightness(1.05); }
@media (max-width: 640px) {
  .lesson { padding: 0 1rem 1.5rem; }
  .lesson-list li { flex-direction: column; gap: 0.2rem; }
}
"""
    assets_dir = SITE_ROOT / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    (assets_dir / "site.css").write_text(css.strip() + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build static HTML site for lesson plans")
    parser.add_argument("--out", type=Path, default=SITE_ROOT)
    args = parser.parse_args()
    site_root = args.out.resolve()
    site_root.mkdir(parents=True, exist_ok=True)

    ensure_markdown()
    entries = collect_lessons()
    build_site(entries, site_root)
    print(f"Built {len(entries)} lesson pages + index at {site_root}")


def build_site(entries: list[LessonEntry], site_root: Path) -> None:
    global SITE_ROOT
    SITE_ROOT = site_root
    write_css()
    build_index(entries)
    build_readme()
    build_lesson_pages(entries)


if __name__ == "__main__":
    main()
