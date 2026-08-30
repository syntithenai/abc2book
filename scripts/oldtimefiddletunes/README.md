# Old Time Fiddle Tunes (`oldtimefiddletunes.net`) → ABC

Source editions of each setting: convert from the site’s **MIDI** when present,
otherwise **OMR** the PDF. No library/internet search; duplicate titles are kept
(e.g. multiple Dusty Miller settings). Book **`old time`**, tag **`oldtimefiddletunes.net`**.

Milliner–Koken is a sibling pipeline. Working files for both live outside the
repo:

`/home/stever/Documents/oldtime sources review/`

(see README there + `plans/oldtime_review_projects_integration.plan.md`).

Local convenience symlinks (gitignored targets):

- `scripts/oldtimefiddletunes/data` → Documents `…/oldtimefiddletunes/data`
- `public/oldtimefiddletunes` → Documents `…/oldtimefiddletunes/public-packages`

## Proof of concept (10 tunes)

```bash
# Already written by the review workflow:
#   public/oldtimefiddletunes/enrich_package_proof.json  (symlink → Documents)
#   5 MIDI-prefer + 5 PDF-only OMR tunes, candidates cleared
```

In the app (admin, today): **Add → Old time fiddle source review** → loads the
proof package by default. Planned: single **Review Projects** entry with tabs
for Milliner–Koken + Old Time (resolver-gated). Use **Convert source** /
**Convert all missing**, tidy ABC in the 3-column PDF | Notation | ABC tools
layout.

## Full corpus pipeline

```bash
# 1. Index
python3 scripts/oldtimefiddletunes/scrape_index.py

# 2. Build a source-only package (no search). Prefer a small script / filter for now;
#    enrich_search.py still exists for legacy offline experiments but is NOT the
#    primary path for this book.

# 3. Review in the app → Export package JSON → build ABC:

python3 scripts/oldtimefiddletunes/build_scrape_abc.py \
  --package ~/Downloads/oldtimefiddletunes-enrich_package.json
```

Curated import of `oldtimefiddletunes.abc` sets `allowDuplicateTitles` so same-title
settings are not collapsed into the duplicates bucket.

## Later: merge into `tunes.abc`

```bash
python3 scripts/oldtimefiddletunes/merge_into_tunes_abc.py --dry-run
python3 scripts/oldtimefiddletunes/merge_into_tunes_abc.py --write
```
