# Chord rendering scope

## Views

| View | Source | Display |
|------|--------|---------|
| **Structure** | ABC notation only | Section block charts (`renderChords` display mode, full bars, no anacrusis) |
| **Lyrics + chords ON** | Embedded lyrics first, else ABC | Per-line chord rows (COW-style) from ABC merge |
| **Lyrics + chords OFF** | Plain lyrics | `stripChordsFromLyricLines` — no ABC charts |

## Lyrics chords ON — priority

1. **COW rows** in `words` → passthrough (never ABC merge)
2. **ChordPro** `[Am]word` in `words` → passthrough
3. **Plain lyrics** → `resolveChordRenderPlan` → `per_line_abc`
4. **No lyrics** → ABC block charts (chords-only mode)

Gate: `tuneHasLyricEmbeddedChords(tune)` skips ABC for display.

## Alignment tiers

### Tier 1 — Section → chart block

Used by structure and the first pass of lyrics ABC merge.

- Labeled headers (`#` or `[Section]`)
- Positional 1:1 (equal block counts)
- Hymn reuse (one chart, many verses)
- Multi-strain blocks: join strain charts when a stanza spans harmonic sections

### Tier 2 — Bar → lyric line (plain + ABC only)

- Notation staff line breaks (`assignLyricLinesToBarsFromNotation`)
- 2 bars / line when supported
- Even bar split fallback
- Lyric `/` beat markers (leading or mid-word, e.g. `a/mazing /grace`) place chord changes on the marked words, including mid-bar changes when a line has extra markers
- `mergeAlignedLyricBlockChords` → `ChordProLines`
- **Chord completeness:** `ensureChordCompleteness` inserts chord-only rows so no bar is dropped

### Tier 3 — Embedded passthrough

COW / ChordPro / explicit `chordSheetAlignment` anchors only.

## Anacrusis

Display charts omit pickup bars (`renderChords(false)`). Strain bar counts for slicing prefer display chart bar counts via `countFullBarsInMelodyStrain`.

## Strain boundaries

Canonical splitter: `splitMelodyStrainsWithBarlines` in [`src/melodyStrainSplit.js`](src/melodyStrainSplit.js).

Splits at `||`, `::`, `|:`, and `:|` … `|:` across line breaks. Does **not** split on pickup `||` after normalization.

## Data tidy-up checklist

Run batch audit, tagging, and safe fixes from **Settings → Cleanup** (`?tab=cleanup`).

- Embedded chord timing in `words` for tunes that need word-level placement
- `# Section` / `[Section]` headers aligned with ABC strain markers
- Fix `anacrusis_double_barline` (pickup `||` → single `|`)
- Tag `chords:inline-only` for tunes that must never ABC-merge in display
- Correct `||`, `::`, or `|:` / `:|` repeat pairs for multi-strain tunes

## Lyric line policy

- **Checks / audits:** `lyricLinesForChecks` → stored `words` / `wLines`
- **Display / alignment:** `lyricLinesForViews` → enriched (repeat expansion)
