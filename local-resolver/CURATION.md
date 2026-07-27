# Music collection curation

Organise ~101k tracks into a flat per-artist library (`library/{genre}/{Artist}/{Title}.ext`), one copy of each song per artist. Preserved collections (e.g. `slipperyhill`) stay intact.

## Registry

[`music_collection_registry.json`](music_collection_registry.json) defines:

- `preserve` — folders never auto-moved
- `phases` — `folk-world`, `pop-rock`, `remainder` source paths
- `genreMap` — tag → library folder mapping

## CLI (run on host with writable `/home/stever/Music`)

```bash
cd local-resolver
export MUSIC_COLLECTION_DIR=/home/stever/Music
export MUSIC_COLLECTION_INDEX_DIR=/home/stever/Music/.abc2book-index  # or container path when copied

# Phase 1: folk & world
python scripts/curation/run_phase.py --phase=folk-world

# Phase 2: pop & rock
python scripts/curation/run_phase.py --phase=pop-rock

# Phase 3: remainder
python scripts/curation/run_phase.py --phase=remainder

# Optional: include MusicBrainz tag suggestions + BPM detect sample
python scripts/curation/run_phase.py --phase=folk-world --with-enrichment
```

Reports land in `Music/_reports/`. The curation database is stored at `Music/.abc2book-curation/curation.db` when the index directory is not writable.

### Individual scripts

| Script | Purpose |
|--------|---------|
| `report_inventory.py` | Tag coverage, genres, duplicate counts |
| `report_duplicates.py` | songKey + exact duplicate groups with keeper |
| `report_tag_gaps.py` | Missing title/artist/genre/BPM |
| `report_unplayed.py` | Cull candidates |
| `plan_moves.py` | Dry-run move plan JSON |
| `apply_moves.py` | Apply plan (`--apply`, optional `--staging`) |
| `batch_tag.py` | MusicBrainz tag suggestions |
| `detect_bpm.py` | Write TBPM (optional librosa) |
| `export_playlist.py` | M3U exploration playlist from unplayed tracks |

## Tunebook UI

Open **Collection curator** at `/collection-curator`:

- Browse by phase, search, triage keep/maybe/cull
- Review duplicate groups (artist+title)
- Generate move plans (saved on resolver; apply via CLI on host)

## After moves

Rebuild or resume the music collection index:

```bash
python scripts/build_music_collection_index.py /home/stever/Music --resume
```

Or use Settings → Music collection → Rebuild index.
