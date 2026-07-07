---
name: Notation test hardening
overview: Replace weak "something changed" assertions with exact-state assertions across unit and E2E tests, add coverage for untested notation features (slurs, tuplets, voices, undo, piano roll), and encode MuseScore-style behavior contracts so regressions like the Delete off-by-one cannot pass.
todos:
  - id: phase0-assertions
    content: Add assertEvents/assertVoiceAbc helpers, extend dev test hook getters, add K:G fixture
    status: completed
  - id: phase1-unit-session-serializer
    content: "New unit test files: notationSession.test.js, abcVoiceSerializer.test.js roundtrips"
    status: completed
  - id: phase1-unit-actions
    content: Extend notationActions/clipboard/marks unit tests with exact-value assertions; fix quantize+align weak tests
    status: completed
  - id: phase2-e2e-core
    content: Rewrite weak P0 assertions in notation-staff-core.js to exact events/ABC
    status: completed
  - id: phase2-e2e-full-roll-adv
    content: Rewrite weak P1/P2/P3 assertions (durations, piano, barline tokens, clipboard, draw, nudge, undo, view cycle)
    status: completed
  - id: phase3-p0-new
    content: "New P0 scenarios: Backspace vs Delete exact, boundary deletes, view switching"
    status: completed
  - id: phase3-marks-voices
    content: "New E2E files: notation-staff-marks.js (slur/tuplet/decorations/grace/dot) and notation-voices.js; wire into notation-e2e.js"
    status: completed
  - id: phase3-workflow-multiline
    content: Extend workflow test (durations, clipboard, undo); add multiline + K:G scenarios
    status: completed
  - id: phase4-docs
    content: "Rewrite NOTATION.md: behavior contracts, updated tier tables, honest coverage notes"
    status: completed
  - id: verify-all
    content: Run full Jest notation suite + NOTATION_E2E_TIER=full E2E; apply failure policy to any reds
    status: completed
isProject: false
---

# Notation Editor Test Hardening Plan

## Why the current tests let bugs through

The Delete off-by-one passed because the test asserted a **note count decreased**, not **which note** changed. An audit found the same pattern everywhere: 16 E2E scenarios assert "ABC changed" / "count >= N" / nothing at all, and several unit tests assert `length > 0`. The fix is a single discipline applied mechanically:

**Golden rule for every test in this plan: assert the complete expected state (full event list or exact ABC string). Never assert "changed", "count increased", or a loose regex. If a strengthened test fails, the product behavior is wrong — fix the product code when the expected behavior is documented in [src/components/NotationEditorHelp.js](src/components/NotationEditorHelp.js); otherwise add the failure to the Gaps section of [e2e/NOTATION.md](e2e/NOTATION.md) and mark the scenario with a `SKIP:` prefix and comment.**

## Phase 0 — Assertion infrastructure (do first; everything depends on it)

### 0.1 Full-event assertion helper in [e2e/notation-assertions.js](e2e/notation-assertions.js)

Add `eventSummaries(state)` that maps **every** event (not just notes) to a compact string:

- note: `note:C4` (step + octave), append `#1`/`#-1` for accidental, `:2` suffix for duration in beats when not 1 (e.g. `note:F4#1:0.5`)
- chord: `chord:C4+E4+G4` (all pitches, sorted low-to-high)
- rest: `rest:1` (duration in beats)
- barline: `bar:|` (the token)
- break: `break`

Add `assertEvents(page, expectedArray, label)` — exact array equality with a diff-style error message. Keep `assertNoteSteps` for existing tests but new tests use `assertEvents`.

Add `assertVoiceAbc(page, expectedAbc, label)` — compares `getVoiceAbc()` after collapsing runs of whitespace to single spaces and trimming, **case-preserved** (the existing `normalizeAbcBody` uppercases, which hides octave errors — do not use it for new tests).

### 0.2 Extend the dev test hook in [src/components/NotationEditor.js](src/components/NotationEditor.js) (lines ~1072–1127)

Add read-only getters to `window.__abc2bookNotationTest`: `getDurationKey()`, `getDotted()`, `getAccidentalCarry()`, `getTupletMode()`, `getSlurMode()`, `getSnapEnabled()`, `getPianoRollTool()`. Each is one line reading `sessionRef.current`.

### 0.3 New fixture in [src/devSeed/notationE2eFixtures.js](src/devSeed/notationE2eFixtures.js) + [e2e/notation-fixtures.js](e2e/notation-fixtures.js)

Add `e2e00000000000000000005` "Notation E2E Rich": `K:G`, `M:6/8`, `L:1/8`, body `G A B | c3 |` — used for key-signature and non-4/4 tests. Keep both files in sync (there is a comment requiring this).

## Phase 1 — Unit test expansion (Jest, `src/notation/`)

These are pure functions; every test states its exact expected output. Add to existing test files unless a new file is named.

### 1.1 New file `src/notation/notationSession.test.js`

- `SET_CARET` clamps to `[0, events.length]` (test index -1 and 99 on a 4-event session)
- `SET_EVENTS` preserves caret when `action.caretIndex` absent; applies it when present
- `LOAD_VOICE` resets events/caret/selection but preserves `view`, `mode`, `pianoRollZoom`, `snapEnabled`, `midiEnabled`
- `SET_SELECTION` / `SET_DURATION_KEY` / `TOGGLE_DOT` store exact values

### 1.2 New file `src/notation/abcVoiceSerializer.test.js` — roundtrip contracts

For each input, `serializeVoiceEvents(parseVoiceEvents(abc, meta), meta)` must equal the input (whitespace-normalized). Cases: `C D E F |` · `C2 D2 |` (durations) · `C3/2 D/2 |` (dotted) · `c d' C, |` (octaves) · `^C _D =E |` (accidentals) · `[CEG] |` (chord) · `z z2 |` (rests) · each barline token `|`, `||`, `|:`, `:|`, `|]` · `(3CDE |` (tuplet) · `C-C |` (tie) · `.C !trill!D |` (decorations)

### 1.3 Extend [src/notation/notationActions.test.js](src/notation/notationActions.test.js)

- `transposeSelection` +1 on C → `^C` (exact midi 61); +1 on B4 crosses to c5; ±12 octave; diatonic +2 on E → F (in K:C) and on F → G
- `durationFromSession` for every `durationKey` 1–9 and dotted variants → exact `{num,den}` (table from `DURATION_KEY_MULTIPLIERS` in [src/notation/notationConstants.js](src/notation/notationConstants.js))
- `pitchFromLetter` with `accidentalCarry: 1` → sharp pitch, and `insertPitchAtCaret` clears the carry (assert session field is null after)
- `insertRestAtCaret` at caret 2 in `C D E F |` → events exactly `[note C, note D, rest, note E, note F, bar]`, caret 3
- `changeSelectedDuration` on selected D with key 7 (half) → exact duration; `scaleDuration` 0.5 then 2 restores exact original durations
- `moveCaret` at 0 going -1 stays 0; at end going +1 stays at end
- `removeSelection` clamps caret when deleting events before it
- `addToneToEvent` on note C with E → chord `[C,E]` exact pitches

### 1.4 Extend [src/notation/notationClipboard.test.js](src/notation/notationClipboard.test.js) (currently 1 weak test)

- Paste result equals copied content: compare `step/octave/accidental/duration` field-by-field, not just count
- `cutToClipboard` removes the events and clipboard holds them
- `swapWithClipboard` exact before/after event lists
- `repeatSelectionAtCaret` duplicates exact pitches at caret

### 1.5 Extend `src/notation/notationMarks.test.js`

- `toggleTie` twice removes the tie (both flags cleared)
- `applySlurToRange` on notes 0–2 sets `slurStart` on 0 and `slurEnd` on 2 only; `clearSlurOnSelection` removes both
- Tuplet entry: with `tupletMode {num:3,den:2,size:3}`, insert 3 notes → all carry `tuplet.num === 3`, and `advanceTupletMode` returns null after the 3rd (mode auto-ends)
- `insertGraceBeforeSelection` acciaccatura vs appoggiatura produce distinguishable output (assert the serialized ABC contains `{...}` grace group)

### 1.6 Fix the two weakest existing unit tests

- `quantizeVoiceEvents snaps startBeat toward grid`: assert the exact snapped value (e.g. 1.12 → 1.0 at grid 4), not `!== 1.12`
- `matchToTimedMelody snaps note start`: assert exact target beat

## Phase 2 — Rewrite weak E2E assertions (same files, same scenario names)

Fixture `e2e00000000000000000001` is `C D E F |` in K:C, L:1/4. Rewrite each listed scenario to end with `assertEvents` / `assertVoiceAbc`:

In [e2e/notation-staff-core.js](e2e/notation-staff-core.js):
- `note input inserts c d e at caret` → assert full event list including the original 4 notes and where the new C D E landed relative to the caret position used
- `select then ArrowUp transposes` → click D, ArrowUp, assert exact steps `C ^D E F` (or the app's actual chromatic spelling — verify once, then pin)
- `0 and right-click insert rest` → assert full event list with rest at the exact caret index used
- `barline button inserts |` → assert exact ABC `C D | E F |` (barline at caret 2), not "contains |"
- `click note selects; ghost label updates` → also assert `getSelection().eventIds` contains exactly the clicked note's id and caret equals its index

In [e2e/notation-staff-full.js](e2e/notation-staff-full.js):
- `duration keys change inserted note length` → press `8` then `a`, assert the inserted note's event has duration 2 beats (half note in L:1/4) via `assertEvents`
- `sharp carry then g` → assert inserted event is `note:G4#1` exactly and carry is cleared (`getAccidentalCarry() === null`)
- `Shift+G adds chord tone` → assert the target event became `chord:` with exactly the original pitch + G
- `virtual piano click inserts note` → assert an actual note event with the expected midi pitch was inserted (currently only checks mode flipped)
- `barline menu tokens` → loop **every** token in the dropdown (`||`, `|:`, `:|`, `|]`), assert each appears at the caret position in ABC, reset fixture between
- `Ctrl+C/V clipboard round-trip` → select C, copy, move caret to end, paste, assert final events `C D E F C` exactly
- `Q/W halve/double` → keep the exact-restore check, add assertion of the halved duration value in between

In [e2e/notation-piano-roll.js](e2e/notation-piano-roll.js):
- `Draw tool inserts note` → assert the new event's pitch and `startBeat` match the click coordinates (compute expected from zoom/grid, or click a known cell)
- `Snap toggle changes snapEnabled` → use new `getSnapEnabled()` hook, assert it flips
- `arrow nudge` (currently zero assertions) → select a note, press ArrowUp, assert its midi pitch increased by exactly 1

In [e2e/notation-advanced.js](e2e/notation-advanced.js):
- `split view via Ctrl+Alt+P` → fail (don't return) when the resizer is missing
- `header undo restores ABC` → assert restored ABC **equals** the pre-edit string; fail if the undo button is missing
- `Ctrl+Alt+P cycles views` → assert `getView()` actually cycles staff → pianoRoll → split; fail if unchanged

## Phase 3 — New E2E scenarios for untested features

### 3.1 Add to P0 [e2e/notation-staff-core.js](e2e/notation-staff-core.js) (regression-critical)

- **Backspace vs Delete** (today's bug class): click E (3rd note), press Backspace → assert `C E F` + rest where D was; reset; press Delete → assert `C D F`. Both directions, exact events.
- **Delete on last note and at index 0 boundaries** — no crash, exact expected result
- **View switching**: dropdown/shortcut through staff → pianoRoll → split → abc, assert `getView()` each time (NOTATION.md claims this is P0 but no test exists)

### 3.2 New file `e2e/notation-staff-marks.js` (P1 tier, wire into [e2e/notation-e2e.js](e2e/notation-e2e.js))

- **Slur**: enable slur mode via Marks menu, click note 1 then note 3, assert `slurStart`/`slurEnd` on exactly those events; clear slur, assert removed
- **Tuplet**: enter note input, activate triplet, insert c d e, assert all 3 events carry `tuplet.num 3` and `getTupletMode()` is null after (auto-end); assert ABC contains `(3`
- **Decorations**: apply staccato + accent via Marks menu to a selected note, assert `decorations` array exactly; assert ABC roundtrip keeps them
- **Grace note**: insert grace before selected note, assert ABC contains `{g}` style group
- **Dotted entry**: press `.`, insert note, assert duration 1.5 beats and `getDotted()` state

### 3.3 New file `e2e/notation-voices.js` (P1 tier), using two-voice fixture `e2e00000000000000000002`

- Switch active voice via tab, assert `getVoiceKey()` changes and `getVoiceAbc()` matches that voice's body (`G, B, D`)
- Insert a note in voice 2, switch back to voice 1, assert voice 1 unchanged (cross-voice contamination check)
- Toggle voice visibility checkbox, assert rendered staff count changes
- Add voice → assert new tab appears; delete it → confirm dialog → assert removed and voice 1 body untouched

### 3.4 Extend workflow test [e2e/notation-staff-workflow.js](e2e/notation-staff-workflow.js)

Continue the existing session after step 7 with: set duration to half (`7`), append B → assert exact 2-beat event; toggle dot, append c → assert 3-beat event; select all appended notes via shift+click, Ctrl+C, caret to end, Ctrl+V → assert exact duplicated tail; undo via header button → assert exact pre-paste ABC.

### 3.5 Multiline + key-signature scenarios (P1, add to `notation-staff-full.js`)

- Load multiline fixture `...003` (currently seeded but never used): click a note on the **second system line**, assert correct selection index; insert note there, assert placement
- Load new K:G fixture `...005`: press `f` in note input → assert the event is F (natural per session model) and serialized ABC renders correctly against K:G; ArrowUp on F → assert exact chromatic result

## Phase 4 — MuseScore-parity contract + docs

Rewrite the coverage tables in [e2e/NOTATION.md](e2e/NOTATION.md):

- Add a "Behavior contracts (MuseScore parity)" section listing the semantics the suite now pins: duration keys 1–9 (4=eighth, 5=quarter, 6=half in MuseScore — note where this app's mapping differs), N toggles input, letters A–G enter pitch nearest the caret, arrows = chromatic transpose, Alt+Shift+arrows = diatonic, Ctrl+arrows = octave, Delete → rest (forward), Backspace → rest (backward), Ctrl+Delete removes time, R repeats, `.` dots, Shift+letter builds chords, `0` rest
- Update the walkthrough-step table rows that currently say "manual / future" (slur, tuplets, voices) to point at the new test files
- Update the "Coverage honesty" section: state the golden rule and remove claims that no longer hold

## Execution order and verification

Work phase by phase; after each phase run:

- Phase 1: `npm test -- --watchAll=false --testPathPattern=notation`
- Phases 2–3: `npm run test:notation:e2e` then `NOTATION_E2E_TIER=full npm run test:notation:e2e` (dev server already runs on port 3000)

Expect some strengthened tests to fail on first run — that is the point. Apply the golden-rule failure policy from the top of this plan. Reset the fixture (`resetNotationFixture`) at the start of every scenario; never let scenarios depend on each other except inside the workflow file.