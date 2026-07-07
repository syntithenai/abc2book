# Notation editor E2E test matrix

Scope is driven by [NotationEditorHelp.js](../src/components/NotationEditorHelp.js) and the 35-step [NotationEditorWalkthrough.js](../src/components/NotationEditorWalkthrough.js).

## Golden rule (assertion discipline)

Every test asserts **complete expected state** — exact pitch sequences (`assertNoteSteps`), full event lists (`assertEvents`), or exact voice ABC (`assertVoiceAbc`). Tests must **not** pass on “something changed”, count-only checks, or loose regex (except where ABC spelling varies by octave case).

If a strengthened test fails: fix product code when behavior is documented in help; otherwise document the gap below and prefix the scenario with `SKIP:`.

## Test pyramid

| Layer | Script | When |
|-------|--------|------|
| **Jest** | `src/notation/*.test.js` | Every PR (`npm test`) |
| **P0 Puppeteer** | `notation-staff-workflow.js` + `notation-staff-core.js` | PR / local (`npm run test:notation:e2e`) |
| **P1 Puppeteer** | `notation-staff-full.js`, `notation-staff-marks.js`, `notation-voices.js` | Nightly (`NOTATION_E2E_TIER=1`) |
| **P2 Puppeteer** | `notation-piano-roll.js` | Nightly (`NOTATION_E2E_TIER=full`) |
| **P3 Puppeteer** | `notation-advanced.js` | Nightly (`NOTATION_E2E_TIER=full`) |

## Assertion helpers (`e2e/notation-assertions.js`)

| Helper | Checks |
|--------|--------|
| `assertNoteSteps` | Exact pitch steps (letters + `#accidental` suffix); ignores rests/barlines |
| `assertEvents` | Full event list: `note:C4`, `rest:1`, `bar:\|`, `chord:C4+E4`, duration suffix `:beats` when ≠ 1 |
| `assertVoiceAbc` | Exact serialized voice body (case-preserved, whitespace-normalized) |

Dev hook `window.__abc2bookNotationTest` also exposes: `getDurationKey`, `getDotted`, `getAccidentalCarry`, `getTupletMode`, `getSlurMode`, `getSnapEnabled`, `getPianoRollTool`.

## Fixtures (`?seed=notation-basic`)

| Tune ID | Body | Use |
|---------|------|-----|
| `e2e…001` | `C D E F \|` | P0 core, most P1 |
| `e2e…002` | V:1 `C E G \|`; V:2 `G, B, D \|` | Voice tests |
| `e2e…003` | Two-line `C D E F \| G A B c \|` / `d e f g \|` | Multiline caret |
| `e2e…004` | Empty | Workflow build-from-scratch |
| `e2e…005` | `G A B \| c3 \|` in K:G, M:6/8 | Key signature |

## Running

```bash
npm start   # in another terminal
npm run test:notation:e2e
NOTATION_E2E_TIER=1 npm run test:notation:e2e    # P0 + P1
NOTATION_E2E_TIER=full npm run test:notation:e2e # all tiers
npm run test:notation:all                        # Jest notation + P0 E2E
```

## Behavior contracts (MuseScore parity)

Semantics pinned by tests (see help for full list):

| Action | Expected behavior |
|--------|-------------------|
| **Duration keys 1–9** | Multipliers of `L:` (key 4 = unit length, 5 = 2× unit, 7 = 8× unit = half note in L:1/4) |
| **N** | Toggle note input; **Esc** exits |
| **A–G** | Insert pitch at caret (note input); caret advances |
| **Shift+letter** | Add chord tone to note at caret |
| **+ / = / -** | Sharp / natural / flat carry for next letter |
| **.** | Toggle dotted duration |
| **0** | Insert rest at caret |
| **Delete** | Selection → rest; else rest event **at** caret (forward) |
| **Backspace** | Selection → rest; else rest event **before** caret |
| **Ctrl+Delete** | Remove selected events from timeline |
| **Arrow ↑/↓** | Chromatic transpose ±1 on selection |
| **Ctrl+↑/↓** | Octave ±12 |
| **Alt+Shift+↑/↓** | Diatonic ±1 step (implemented as ±2 semitone steps) |
| **R** | Repeat selection at caret (or repeat last) |
| **T** | Toggle tie to next note |
| **Q / W** | Halve / double duration |
| **Ctrl+C/X/V** | Copy / cut / paste |
| **Ctrl+Alt+P** | Cycle Staff → Piano roll → Split |
| **Staff drag** | Vertical drag = diatonic steps (`transposeSelectionByStaffSteps`) |
| **(3** | Start triplet input; auto-ends after 3 notes |

## Walkthrough step → test tier

| # | Step id | Tier | Test file |
|---|---------|------|-----------|
| 1 | `modes` | P0 | notation-staff-core |
| 2 | `enter-notes` | P0 | notation-staff-core |
| 2b | full workflow | P0 | notation-staff-workflow |
| 3 | `enter-notes` (rest) | P0 | notation-staff-core |
| 4 | caret / modes | P0 | notation-staff-core |
| 5 | `selection` | P0 | notation-staff-core |
| 6 | `clipboard` | P0/P1 | workflow + notation-staff-full |
| 7 | `transpose` (drag) | P0 | notation-staff-core |
| 8 | `transpose` (↑) | P0 | notation-staff-core |
| 9 | `barlines` | P0 | notation-staff-core |
| 10 | `views` | P0/P3 | notation-staff-core + notation-advanced |
| 11 | `durations` | P1 | notation-staff-full |
| 12 | `accidentals` | P1 | notation-staff-full |
| 13 | `chords` | P1 | notation-staff-full |
| 14 | `virtual-piano` | P1 | notation-staff-full |
| 15 | `barlines` (menu) | P1 | notation-staff-full |
| 16 | `layout-breaks` | P1 | notation-staff-full |
| 17 | `marks` (tie) | P1 | notation-staff-full |
| 18 | `marks` (slur) | P1 | notation-staff-marks |
| 19 | `tuplets` | P1 | notation-staff-marks |
| 20 | `duration-edits` | P1 | notation-staff-full |
| 21 | `clipboard` | P1 | notation-staff-full |
| 22 | `voices` | P1 | notation-voices |
| 23 | toolbar smoke | P1 | notation-staff-full |
| 24–29 | piano-roll | P2 | notation-piano-roll |
| 30–34 | advanced | P3 | notation-advanced |

## P0 scenarios (regression-critical)

- Full workflow on empty tune (add → drag → barline → delete → append → duration → clipboard → undo)
- Note input sequential entry with per-step pitch asserts
- Delete vs Backspace exact pitch targets (middle-note regression)
- View switching (Ctrl+Alt+P + dropdown)
- Staff drag exact diatonic pitch results

## Out of Puppeteer scope (manual or unit-only)

- Web MIDI hardware / record
- Staff click → playback seek (autoplay policy)
- Align to recording / match melody / downbeat / region (needs linked media)
- Clef/key transpose modal (tune-level)
- Waveform / playhead sync
- Clear slur on full span (only selected note cleared — see unit test)

## Adding a feature

1. Update help + walkthrough if user-facing.
2. Logic → `src/notation/*.test.js` with exact expected output.
3. UI wiring → Puppeteer case in the appropriate tier file using `assertEvents` / `assertNoteSteps` / `assertVoiceAbc`.
4. Bug fix → P0 if staff core regression, else matching tier.

## CI

- **Every PR:** `npm test -- --watchAll=false` (includes notation unit tests).
- **Nightly (optional):** start dev server + `npm run test:notation:e2e` with `NOTATION_E2E_TIER=1` or `full`.
