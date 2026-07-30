---
name: Notation Check — Complete Implementation
overview: Finish all remaining notation check integration work — Tier 1/2 fixes, extended checks, paste safety, shared bar-operation UI, editor polish, and tests.
todos:
  - id: plan-doc
    content: Write this complete plan document
    status: completed
  - id: p1-tier1-fixes
    content: "Tier 1 fixes: wrapEndingInRepeat, removeEmptyVoice, declarePickupLength, convertScaffoldToRests, resolveHeaderConflict"
    status: completed
  - id: p1-paste-strain
    content: Paste strain-boundary warnings in notationBarPaste + NotationPasteModeModal
    status: completed
  - id: p1-header-sync
    content: Extend syncHeadersFromAbc / resolveHeaderConflict for conflicting fields
    status: completed
  - id: p2-tier2-fixes
    content: "Tier 2 fixes: quantizeOverfullBars, balanceEndings, closeRepeatAtEnd, fillSparseBars"
    status: completed
  - id: p2-lyrics-extra
    content: lyric_line_bar_ratio_suspect and hymn_single_chart_unmarked checks
    status: completed
  - id: p3-extended-checks
    content: tuneAbcExtendedCheck module (orphan chord, tie, duplicate voice, tempo, etc.)
    status: completed
  - id: p4-bar-operation-panel
    content: Extract NotationBarOperationPanel shared component
    status: completed
  - id: p5-polish
    content: Editor badge, bulk-check deep link, refresh on close, active-voice fast path
    status: completed
  - id: tests
    content: useNotationCheck.test.js, notationBarPaste.test.js, extended check/fix tests
    status: completed
isProject: false
---

# Notation Check — Complete Implementation Plan

## Status summary

### Already shipped (prior work)

- `useNotationCheck` — debounced live validation in notation editor
- `NotationIssuesPanel` — severity groups, bar navigation, fix buttons
- `Abc.js` `onWarnings` wired through editor
- Inline fixes via `previewStructureFix` + `BulkCheckFixPreviewModal`
- Paste Insert/Replace/Merge modal + `notationBarPaste.js`
- Tier 1 bar fixes: `closeOpenRepeat`, `padBarWithRests`, `removeEmptyBars`, `padVoicesToMatch`
- Bar highlighting in staff + piano roll
- `tuneLyricsAlignmentCheck` + `rebuildWLines` / `relayoutNoteLines`
- Bulk check includes lyrics alignment

### This plan — remaining work

## P1 — Tier 1 fixes + paste safety

| Action | Issue codes | Approach |
|--------|-------------|----------|
| `wrapEndingInRepeat` | `ending_without_repeat` | Insert `\|:` before first `[n` ending block |
| `removeEmptyVoice` | `secondary_voice_empty` | Delete voice with no note content (preview when multi-voice) |
| `declarePickupLength` | `anacrusis_inconsistent` | Re-normalize ABC when pickup detected but not parsed |
| `convertScaffoldToRests` | `chord_scaffold_in_melody` | Replace chord-scaffold bars with full-bar rests |
| `resolveHeaderConflict` | `header_field_mismatch` | Prefer ABC header values (preview) |

**Paste strain warnings:** detect when paste range crosses `||`, `::`, `|:` boundaries; show warning in modal.

**Header sync:** `resolveHeaderConflict` supersedes empty-only `syncHeadersFromAbc` for conflicts.

## P2 — Tier 2 preview fixes + lyrics extras

| Action | Issue codes | Approach |
|--------|-------------|----------|
| `quantizeOverfullBars` | `overfull_bar` | `quantizeVoiceEvents` on overfull bar events |
| `balanceEndings` | `ending_bar_mismatch` | Pad shorter endings with rests |
| `closeRepeatAtEnd` | `unmatched_repeat_start`, `truncated_repeat` | Append `:\|` at tune end |
| `removeOrphanRepeatEnd` | `unmatched_repeat_end` | Remove orphan `:\|` token |
| `fillSparseBars` | `sparse_melody` | Insert rests in empty/scaffold bars |

**Lyrics checks:**
- `lyric_line_bar_ratio_suspect` — `detectBarsPerLyricLine` score below threshold
- `hymn_single_chart_unmarked` — one lyric block, multiple strains, no `||`

## P3 — Extended checks (`tuneAbcExtendedCheck.js`)

| Code | Severity | Detection |
|------|----------|-----------|
| `orphan_chord_symbol` | warning | Chord annotation on rest-only event |
| `tie_across_barline` | warning | Tie spanning barline incorrectly |
| `inconsistent_note_length` | info | L: header vs predominant note values |
| `duplicate_voice_content` | info | Two voices with identical note lines |
| `missing_repeat_second_time` | info | AABA-like without repeat marks |
| `tempo_mismatch` | info | Q: in ABC vs tune.tempo |
| `stale_chord_in_melody` | info | Chord symbols inconsistent with key |

Wire into `runNotationChecks` and `buildTuneCheckReport`.

## P4 — Shared UI

Extract `NotationBarOperationPanel` from paste modal patterns:
- Props: mode, fromBar, toBar, preview ABC, strain warnings, onConfirm
- Used by `NotationPasteModeModal`

## P5 — Polish

- AbcEditor Music tab issues badge (error/warning counts from notation check)
- Bulk check "Edit tune" sets `focusNotationChecks` flag for editor
- `useNotationCheck` refresh on editor unmount / tab blur
- Optional fast path: structure check on active voice only while typing

## P6 — Tests

- `useNotationCheck.test.js` — debounce, refresh, issueBarIndices
- `notationBarPaste.test.js` — bar range, strain boundary detection
- `tuneAbcExtendedCheck.test.js`
- Fix action tests in `tuneAbcStructureFix.test.js`

## Key files

| File | Change |
|------|--------|
| `src/tuneAbcStructureFix.js` | New fix actions |
| `src/tuneAbcExtendedCheck.js` | New extended checks |
| `src/tuneLyricsAlignmentCheck.js` | Extra lyrics checks |
| `src/notation/notationStrainBoundary.js` | Strain boundary helpers |
| `src/notation/notationBarPaste.js` | Strain warnings |
| `src/components/NotationBarOperationPanel.js` | Shared bar op UI |
| `src/components/NotationPasteModeModal.js` | Use shared panel |
| `src/bulkCheckIssueGroups.js` | Issue → action mappings |
| `src/useNotationCheck.js` | Extended checks + fast path |
| `src/tuneBulkCheckReport.js` | Include extended checks |
| `src/bulkCheckReturnContext.js` | `focusNotationChecks` flag |

## Implementation order

1. P1 fixes + strain helpers
2. P2 fixes + lyrics extras
3. P3 extended checks
4. Wire bulkCheckIssueGroups + fixAll preview set
5. P4 shared panel + paste modal refactor
6. P5 polish
7. P6 tests
