# abc2book vs MuseScore Studio — notation parity gap

Inventory of the staff notation editor relative to [MuseScore Studio 4 handbook](https://handbook.musescore.org/). Handbook mirror: [`musescore-handbook/`](musescore-handbook/).

abc2book stays on ABC + session events + abcjs rendering. Full MuseScore layout, page view, parts, and plugins are out of scope.

## Already strong or partially present

| MuseScore area | abc2book |
|----------------|----------|
| Step-time note input (duration + letters/MIDI) | Yes — note-input mode, duration keys, MIDI panel |
| Selection (click, range, multi) | Yes — Ctrl/Cmd click, Shift range, marquee, measure double-click |
| Pitch drag / transpose | Staff pitch drag; ↑↓ chromatic / diatonic / octave |
| Ties, decorations, grace, chord symbols on events | Session marks + ABC serialize |
| Slur create from selection / click mode | `applySlurFromSelection` |
| Tuplets (insert mode) | Toolbar tuplet presets + `tupletMode` |
| Piano roll timing edit + quantize | Present (single voice) |
| Clipboard | Copy / paste voice events |
| Barline insert | Toolbar + `|` |

## Gaps (ranked)

### P0–P2 — implementation scope (this plan)

| Priority | Item | Notes |
|----------|------|--------|
| P0 | Note audition on select / drag commit / transpose keys | Reuse `useNoteAudition` (piano roll already) |
| P0 | Tuplet serialize `(p:q:r)` + beat scaling `den/num` | Correctness |
| P1 | Apply tuplet to existing selection | MuseScore post-hoc |
| P1 | Slur endpoint drag + red snap targets | Overlay edit, not abcjs surgery |
| P2 | Clear whole slur group | Help expects group clear |
| P2 | Beam-break UI (`beamBreakBefore` + ABC spaces) | Serializer currently always spaces |
| P2 | Measure insert (`Ins` / `Ctrl+B`) | Empty bar of rests + barline |
| P2 | Enharmonic respell (`J`) | Flip sharp↔flat, MIDI preserved |

### P3+ — deferred

| Item | Why deferred |
|------|----------------|
| Lead-sheet chord symbols as staff harmonic layer | Product track separate from event `chordSymbols` |
| Multi-voice piano-roll mixer | Larger UX |
| MIDI velocity / real-time Flexi-time | Pipeline rewrite |
| Cross-staff beaming, angled beam editor | Engraver |
| Properties / inspector panel | Large UI |
| Page view, parts extraction | Out of engraver scope |

## Behavioral caveats (document in Help)

- Tie chains may re-spell on serialize.
- Pickup/anacrusis from `M:` + barlines via `beatGrid.js`.
- Implicit rests are display-only unless the user inserts `z`.
- Piano roll shows one voice at a time.
