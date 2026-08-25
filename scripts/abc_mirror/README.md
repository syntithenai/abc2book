# ABC archive mirrors

Maintainable local copies of high-value ABC sources for EuroSession / offline
search. Staging lives under `abcresources/_incoming/`; normalized tunes go into
collection folders consumed by `textsearch_index.json` and
`local-resolver/local_abc_resources.py`.

## Phase 1 sources

| Source | Script | Typical download | Disk after normalize | Wall time |
|--------|--------|------------------|----------------------|-----------|
| Norbeck (official zip + packs) | `mirror_norbeck.py` | ~0.5–2 MB | ~2–5 MB | &lt;10 min |
| JC regional (Sweden, Klezmer, Balkan, Scand, Intl, Italy) | `mirror_jc_regional.py` | ~50–150 MB | ~50–150 MB | 2–6 h |
| Richard Robinson tunebook | `mirror_robinson.py` | ~5–30 MB | ~5–30 MB | 0.5–1.5 h |
| FolkTuneFinder (new IDs only) | `mirror_folktunefinder_resume.py` | variable | +delta | hours–days (Cloudflare) |

Existing May 2023 dumps (`folktunefinder/`, `jc/`, `thesession/`, …) stay as
baseline. Norbeck is **replaced** from the official 2026 packs on normalize.
JC regional and Robinson are **new** collections (indexes 7 and 8).

## Quick start

```bash
cd /path/to/abc2book

# 1) Mirror (update checks via ETag / sha256 manifests)
python3 scripts/abc_mirror/mirror_norbeck.py
python3 scripts/abc_mirror/mirror_jc_regional.py          # long
# faster JC smoke: --regions Klezmer,Balkan --limit 100
python3 scripts/abc_mirror/mirror_robinson.py
python3 scripts/abc_mirror/mirror_folktunefinder_resume.py --limit 100   # optional

# 2) Normalize into abcresources/
python3 scripts/abc_mirror/normalize_to_abcresources.py

# 3) Rebuild indexes (prefer --only-new after Phase 1 to avoid re-scanning 200k JC files)
python3 scripts/abc_mirror/rebuild_indexes.py --only-new
# Full rebuild when needed:
# python3 scripts/abc_mirror/rebuild_indexes.py

# Contour index for OMR melody match
export ABC2BOOK_ROOT="$PWD"
python3 local-resolver/scripts/build_abc_contour_index.py --collections 0,4,6,7
```

Or: `bash scripts/abc_mirror/rebuild_indexes.sh`

## Layout

```
abcresources/
  _incoming/{norbeck,jc_regional,robinson,ftf}/   # raw + manifest.json
  norbeck/          # refreshed from official packs
  jc/                 # old dump kept
  jc_regional/        # NEW — Sweden/Klezmer/Balkan/…
  robinson/           # NEW
  folktunefinder/     # append-only new IDs from resume script
```

Manifests record `etag`, `last_modified`, `sha256`, `fetched_at` per URL so
re-runs skip unchanged files (`304` / hash match).

## Cadence

- **Monthly:** `mirror_norbeck.py` (seconds–minutes)
- **Quarterly:** `mirror_jc_regional.py` (incremental)
- **As needed:** Robinson; FTF resume
- Always normalize + `--only-new` index rebuild after a successful mirror

## Politeness

Scripts use ~0.5–1.0 s delay and User-Agent `abc2book-abc-mirror/1.0`.
FolkTuneFinder is Cloudflare-protected — expect blocks; use `--limit` and pause/resume.

## Collection index IDs

| ID | Collection |
|----|------------|
| 0 | FolkTuneFinder |
| 1 | The Session |
| 2 | Jim's Roots |
| 3 | Misc |
| 4 | Norbeck |
| 5 | Folkinfo |
| 6 | JC |
| 7 | JC Regional |
| 8 | Robinson |
