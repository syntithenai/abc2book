# EuroSession snapshot → ABC

Offline pipeline for the phone snapshots in `~/Downloads/eurosession book`.

## Prerequisites

- Python 3 with `Pillow` and `opencv-python` (host)
- Tesseract via Docker wrapper at `~/tools/bin/tesseract` (uses `local-resolver-with-tesseract:latest`)
- Running abc2book local-resolver on `http://127.0.0.1:8787` (for OMR + `/search-notation`)

Install / refresh the Tesseract image (once):

```bash
docker exec abc2book-local-resolver bash -c \
  'apt-get update -qq && apt-get install -y -qq tesseract-ocr tesseract-ocr-eng tesseract-ocr-fra tesseract-ocr-dan tesseract-ocr-nor tesseract-ocr-ell'
docker commit abc2book-local-resolver local-resolver-with-tesseract:latest
# Overlay Compose labels so OCR `docker run --rm` jobs are not treated as
# the local-resolver service (`No such container: <id>` on compose up).
cid=$(docker create \
  --label com.docker.compose.project=tesseract-ocr \
  --label com.docker.compose.service=tesseract \
  --label com.docker.compose.oneoff=True \
  --label com.docker.compose.replace= \
  local-resolver-with-tesseract:latest)
docker commit "$cid" local-resolver-with-tesseract:latest
docker rm "$cid"
```

Ensure `~/tools/bin` is on `PATH`, or set `TESSERACT_BIN`.

## 1) Split pages into per-tune crops (title-first)

Splits are driven by **clear centered titles** (especially lines with a key hint
like `(Gm)`). Staff geometry only snaps crop bounds so staves are not clipped.
Harmony continuations (`… - Harmony`) merge into the previous crop.

When full-page OCR misses titles, a strip-scan / large-gap fallback recovers
boundaries. Failed title OCR still emits a crop (`untitled-pNN-TT`).

Deskew uses staff-line Hough skew with an **expanded canvas** so rotation does not
clip the bottom of the music.

```bash
export PATH="$HOME/tools/bin:$PATH"
python3 scripts/eurosession/split_by_titles.py \
  --input "/home/stever/Downloads/eurosession book" \
  --output "/home/stever/Downloads/eurosession-work"
```

Useful flags:

- `--pages 1,13,19` — selected 1-based pages
- `--limit 5` — first N pages only

Output:

- `pages/pNN.jpg` — deskewed pages (expanded canvas)
- `tunes/pNN_TT_slug.jpg` — one crop per title region
- `manifest.json`

## 2) Review to 100%

Automatic title detection can still miss a weak header or pick a composer credit.
Open the contact sheet and fix residuals:

```bash
python3 scripts/eurosession/make_review_html.py \
  --work "/home/stever/Downloads/eurosession-work"
# open eurosession-work/review.html in a browser
```

Copy `review_edits.example.json` → `review_edits.json` and edit:

```json
{
  "renames": [{"page": 19, "tuneIndex": 1, "title": "Smidje"}],
  "merges": [{"page": 19, "tuneIndexes": [2, 3], "title": "Zelda"}],
  "splits": [{"page": 4, "atY": 1200, "titles": ["Tune A", "Tune B"]}],
  "deletes": [{"page": 46, "tuneIndex": 1}]
}
```

Apply:

```bash
python3 scripts/eurosession/apply_review.py \
  --work "/home/stever/Downloads/eurosession-work" \
  --edits "/home/stever/Downloads/eurosession-work/review_edits.json"
```

## 3) OMR + online ABC lookup → single file

```bash
python3 scripts/eurosession/omr_and_lookup.py \
  --work "/home/stever/Downloads/eurosession-work" \
  --resolver http://127.0.0.1:8787
```

Flags:

- `--skip-omr` — title lookup only (fast)
- `--omr-only-first 5` — OMR the first 5 crops, lookup the rest
- `--limit 10` — process first 10 manifest tunes

Prefers a strong The Session title match over weak OMR.

HTTP `/transcribe-sheet-image` requires auth (`REQUIRE_AUTH=true`). Without
`RESOLVER_BEARER_TOKEN`, the script runs OMR via `docker exec` on
`abc2book-local-resolver` (copies crops into `.eurosession-tmp/`).

After editing resolver Python modules, sync them into the running container:

```bash
for f in sheet_image_preprocess.py sheet_image_segment.py sheet_image_staff_detect.py \
         sheet_image_transcribe.py sheet_image_metadata.py; do
  docker exec -i abc2book-local-resolver tee /app/$f > /dev/null < local-resolver/$f
done
```

Output:

- `eurosession.abc` — all tunes in page/tune order
- updated `manifest.json` with `abcSource`, scores, and per-tune ABC

Side-by-side crop + rendered ABC review:

```bash
python3 scripts/eurosession/make_abc_review_html.py \
  --work "/home/stever/Downloads/eurosession-work"
# open eurosession-work/review_abc.html in a browser
```

Repair ABC without re-running OMR (fix OMR `L:` half-length, set `K:` from
title hints, transpose Session matches toward image key, wider Session /
abcnotation lookup for OMR-only titles):

```bash
python3 scripts/eurosession/repair_abc.py \
  --work "/home/stever/Downloads/eurosession-work"
```

Broad candidate search (The Session settings + local FolktuneFinder/Norbeck/JC
via resolver `search_notation`, continental web sites, optional OMR contour
match), prefer inline quote chords (`"Am"`), store selectable options, refresh
review HTML:

```bash
python3 scripts/eurosession/fetch_abc_candidates.py \
  --work "/home/stever/Downloads/eurosession-work"
# open eurosession-work/review_abc.html — pick a source per tune; Copy for Copilot
# includes the selected candidate id/source/chords flag
```

OCR chord symbols above staves and align them into an `omr-chords` candidate
(quote chords on the melody). Confidence-gated (≥3 placements, ≥60% mapped):

```bash
export PATH="$HOME/tools/bin:$PATH"
python3 scripts/eurosession/extract_chords_to_abc.py \
  --work "/home/stever/Downloads/eurosession-work"
```

Normalize legacy transpose markers to `% abcbook-transpose N` (no blank line
before the music body — blank lines break abcjs rendering):

```bash
python3 scripts/eurosession/repair_abc.py \
  --work "/home/stever/Downloads/eurosession-work" \
  --normalize-transpose-only
```

Safe, non-destructive ABC autofix (Session `!` line-breaks → newlines, strip
blank gaps before music, add a missing final barline). Does **not** rewrite
pitches or rhythms:

```bash
python3 scripts/eurosession/repair_abc.py \
  --work "/home/stever/Downloads/eurosession-work" \
  --safe-autofix-only
```

Precompute the app notation-check suite onto each candidate
(`notationIssues[]` in `manifest.json`):

```bash
node scripts/eurosession/run_notation_checks.cjs \
  --work "/home/stever/Downloads/eurosession-work"
```

Apply the same **safe** structure autofixes as the notation-check Fix buttons
(session `!` breaks, empty bars, orphan repeats, pad underfull bars with rests,
final barline, etc.). Skips any fix that would change existing note pitches:

```bash
node scripts/eurosession/apply_notation_fixes.cjs \
  --work "/home/stever/Downloads/eurosession-work"
# then refresh issues + review HTML:
node scripts/eurosession/run_notation_checks.cjs \
  --work "/home/stever/Downloads/eurosession-work"
python3 scripts/eurosession/make_abc_review_html.py \
  --work "/home/stever/Downloads/eurosession-work"
```

Regenerate the ABC review UI (visual transpose, key/meter overrides, bad-section
rects on the crop, issues list, enriched Copilot copy):

```bash
python3 scripts/eurosession/make_abc_review_html.py \
  --work "/home/stever/Downloads/eurosession-work"
# open eurosession-work/review_abc.html
```

## 4) Import into the abc2book tunebook

The review page assigns each tune a **stable tunebook id** (shown under the title)
and stores it in browser `localStorage`. Re-importing updates those tunes instead
of creating duplicates. Do not use **Clear saved data** if you plan to re-import
into an existing book — that wipes the ids.

1. Open `review_abc.html` in the browser that has your review progress.
2. Click **Export tunebook import** → saves `eurosession-import.json` (baked ABC,
   complete flags, crop basenames, and stable ids).
3. In abc2book: **Add** → **Import Reviewed Images**.
4. Choose the JSON file, then choose the `eurosession-work/tunes` folder.
5. Click **Import Reviewed Images**.

Result:

- All tunes land in the `eurosession` book.
- Incomplete tunes open on the crop snapshot by default.
- Complete tunes open as ABC notation (crop still attached).
- Running the import again updates the same ids (ABC + crop refreshed).

Build the local ABC contour index once (for OMR melody matching against FTF /
Norbeck / JC dumps):

```bash
python3 local-resolver/scripts/build_abc_contour_index.py
# or inside the resolver container (writes under /app/data):
docker exec -w /app abc2book-local-resolver \
  python3 /app/www/local-resolver/scripts/build_abc_contour_index.py
```

## Resolver improvements used by this job

Shipped in `local-resolver/`:

- Deskew / expanded-canvas rotate + mild page flatten (`sheet_image_preprocess.py`)
- Staff-region crop before homr (`write_staff_crop`)
- Strong title filters + multi-tune `segments` / `tunes` (`sheet_image_segment.py`,
  `/transcribe-sheet-image`, `/extract-sheet-metadata`)
- Local `abcresources` title search + optional contour match (`local_abc_resources.py`)
- Continental collectors (Norbeck / JC) + region-aware web ABC queries (`notation_fetch.py`)
