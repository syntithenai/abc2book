# Layout Rules — Target Design Plan

Plan for unifying view-mode controls, persistence, and panel layout across **single tune view**, **gig mode**, and **print**.

This document is the **target design**. Where current code differs, treat the sections below as the intended end state.

Primary touchpoints: `viewModeUtils.js`, `DisplayModeControls.js`, `ViewModeSelectorModal.js`, `MusicSingle.js`, `GigModeModal.js`, `TunePrintSheet.js`, `gigDisplaySettings.js` / ABC metadata, `App.css`.

---

## 1. Conceptual model (target)

### 1.1 Display flags

User-facing view settings are independent toggles. The old **chords inline vs block** layout modes are **retired**.

| Flag / control | Values | Meaning |
|----------------|--------|---------|
| **Structure** | on \| off | Chord **block column** (harmonic structure chart) |
| **Chords** | on \| off | Chord symbols on the staff / in lyric-aligned text (inline with music or lyrics content) |
| **Notation** | on \| off | Staff notation from ABC voices |
| **Lyrics** | on \| off | Lyric text panel |
| **Info** | on \| off | Background info (markdown) |
| **Fit** | `horizontal` \| `vertical` | Notation fit-to-width vs fit-to-height |

**Block panels** (participate in the unified spatial layout):

1. **Notation**
2. **Lyrics**
3. **Structure** (chord block)

**Chords** and **Info** are not layout blocks:

- **Chords** annotates notation and/or lyrics content when those panels are on.
- **Info** renders below the main layout (footer / continuation), not as a competing column.

### 1.2 Empty view allowed

All content toggles may be turned **off** (including Structure, Chords, Notation, Lyrics, and Info).

When **no** view modes are enabled, show a clear empty state:

> **No view modes enabled**

Do **not** force notation/lyrics/structure back on. Remove the previous “at least one content panel” enforcement for single view and gig mode.

### 1.3 Persistence (ABC + cloud)

View settings must be stored **on the tune** and round-trip through ABC so they sync to cloud with the rest of the record.

Persist at least:

| Setting | Suggested ABC / tune field |
|---------|----------------------------|
| Structure, Chords, Notation, Lyrics, Info | Composite `viewMode` / `% abcbook-view-mode …` (extend tokens; see §8) |
| Fit mode | Per-tune field + `% abcbook-notation-fit …` (or include in view-mode composite) |
| Lyrics zoom (A+/A−) | Existing `tune.zoom` / `% abcbook-zoom …` |

Changes in single view or gig mode should `saveTune` so cloud sync picks them up. Prefer tune-scoped settings over global `localStorage` for view toggles and fit (global may remain only as a fallback for brand-new tunes with no saved settings).

---

## 2. Control UI (target)

### 2.1 Shared button set (single + gig)

Same controls in both modes (inline toolbar when wide; dropdown when narrow):

| Button | Effect |
|--------|--------|
| **Structure** | Toggle structure (chord block) panel |
| **Chords** | Toggle chord annotations (on staff / with lyrics) |
| **Notation** | Toggle staff notation |
| **Lyrics** | Toggle lyrics panel |
| **Info** | Toggle background info |
| **Fit height** | Toggle notation fit `vertical` ↔ `horizontal` (when notation is on) |
| **A− / A+** | ButtonGroup; **lyrics font size only** (`tune.zoom`) |

Also shared where applicable: voice toggles (multi-voice + notation on), transpose, capo.

### 2.2 Retired / replaced

| Old concept | Replacement |
|-------------|-------------|
| `chords: 'inline' \| 'block'` layout modes | **Structure** (block column) + **Chords** (annotations) |
| Structure as single-view-only / localStorage-only | Structure is a first-class persisted view flag |
| Gig-only A+/A− affecting lyrics **and** chord block | A+/A− in **both** modes; **lyrics only** |
| Single-view chord zoom in/out icons for structure | Structure uses **auto-fit** (§5), not A+/A− |

### 2.3 Empty state UI

When every toggle is off, render the warning in the main content area (both single and gig):

```
No view modes enabled
```

Toolbar buttons remain available so the user can turn panels back on.

---

## 3. Defaults from tune data

Priority when opening a tune:

1. Saved tune view settings (ABC / `tune.viewMode` + fit + zoom)
2. Set-item override in gig (`setItem.viewMode`) if present
3. Content heuristics for **new** tunes with no saved settings, e.g.:
   - Notes, no lyrics → Notation on
   - Lyrics, no notes → Lyrics (+ Structure if chords exist)
   - Notes + lyrics → Notation + Lyrics (Structure on if chord content exists)
4. Global fallback only if nothing else applies

Availability still gates which buttons appear:

- Notation: `hasNotes`
- Lyrics: `hasLyrics`
- Structure / Chords: `tuneHasExplicitChords` (or equivalent)
- Info: non-empty `backgroundInfo`

---

## 4. Unified layout (single, gig, print)

One layout engine for the three **block** elements: **Notation**, **Lyrics**, **Structure**.

Placement priority when choosing the primary (top-left) block:

1. **Notation** (highest)
2. **Lyrics**
3. **Structure** (lowest)

### 4.1 One block visible

That block is **full width**.

### 4.2 Two blocks visible

- Primary (by priority above) occupies the **left / main** area (~⅔).
- Secondary occupies a **⅓-width column on the right**.

Examples:

| Visible | Left (~⅔) | Right (~⅓) |
|---------|-----------|------------|
| Notation + Lyrics | Notation | Lyrics |
| Notation + Structure | Notation | Structure |
| Lyrics + Structure | Lyrics | Structure |

### 4.3 Three blocks visible

- **Notation** top-left (main)
- **Structure** fixed **top right** (~⅓)
- **Lyrics** **underneath** the notation (full width of the left/main column, or spanning under notation while structure stays top-right)

### 4.4 Small screens (two blocks including notation + lyrics)

When Notation + Lyrics are both on (with or without Structure):

- **Structure** (if on) stays **fixed top right**
- **Lyrics** fold under the notation: flow to the **left**, then **down and around** the chord (structure) block

Structure does not stack below; it remains pinned top-right while lyrics wrap around it.

### 4.5 Info

Info is **not** part of the 1/2/3 block grid. It appears below the unified layout (and in print as continuation pages as today).

### 4.6 Chords (annotation flag)

When **Chords** is on:

- With **Notation**: show chord symbols on the staff
- With **Lyrics** (and no conflicting structure-only presentation): show chords aligned with lyric content as appropriate
- When **Chords** is off: hide staff chord annotations and lyric-inline chord symbols; **Structure** column may still show the block chart independently

---

## 5. Structure (chord block) text fitting

The structure panel **auto-resizes** chord text to the available column width:

1. Measure the **longest chord line**
2. Scale font so that line uses the **full width** of the available space
3. **Prevent wrapping**: every chord line stays on **one row** (`white-space: nowrap` / equivalent)
4. Shorter lines share the same font size (uniform scale)

Empty bars use a slash for readability:

| Current | Target |
|---------|--------|
| `C \| \| G` | `C \| / \| G` |

Apply this formatting wherever structure chord lines are rendered (single, gig, print).

**A+/A− does not change structure font size** — structure always auto-fits.

---

## 6. Lyrics zoom (A+/A−)

- Same **ButtonGroup** UI as current gig mode (`A−` / `A+`)
- Present in **both** single view and gig mode whenever lyrics can be shown (or always in the shared toolbar when lyrics content exists)
- Adjusts **lyrics only** via `tune.zoom` (persisted with ABC)
- Does **not** scale notation SVG or structure auto-fit text

---

## 7. Notation fit

- **Fit** toggle remains part of the shared view settings and is **persisted per tune** to ABC/cloud
- **Horizontal**: fit to width; tall scores may scroll vertically
- **Vertical**: fit to height within the notation region of the unified layout; re-measure when column size changes
- Gig and single view should use the **same** fit semantics once layout is unified (print may keep page-width horizontal fit)

---

## 8. View-mode encoding (migration)

### 8.1 Target tokens

Prefer an explicit composite that matches the new buttons, for example:

```
structure,chords,notation,lyrics,info
```

with `noinfo` / omission for off flags, plus a fit token or separate metadata line:

```
% abcbook-view-mode notation,lyrics,structure,chords
% abcbook-notation-fit vertical
% abcbook-zoom 1.2
```

Exact token names should stay compatible with existing parsers where possible.

### 8.2 Legacy mapping

| Legacy | Target interpretation |
|--------|------------------------|
| `music` | Notation on |
| `musicAndLyrics` | Notation + Lyrics (+ Structure if old `chordsBlock` semantics were implied — prefer Structure on when chord content exists) |
| `chordsInline` | Lyrics + Chords on; Structure off |
| `chordsBlock` | Lyrics + Structure on; Chords off (or on if product prefers both) |
| `lyricsOnly` | Lyrics on |
| `info` | Info on |
| `chordsInline` / `chordsBlock` tokens in composites | Map to **Chords** and/or **Structure** booleans; stop treating inline/block as layout modes |

Document the chosen `chordsBlock` → Structure/Chords mapping in code comments and tests so print/gig/single stay aligned.

---

## 9. Unification recommendation

Implement a shared layout module used by single view, gig, and print:

```
(displayFlags, viewport) → { layoutClass, slots: { main, side, below }, empty }
```

| Profile | Same rules? | Notes |
|---------|-------------|-------|
| Single | Yes | Shared toolbar + A+/A− + fit |
| Gig | Yes | Same blocks; fullscreen chrome only differs |
| Print | Yes for block placement | Page metrics / lyric pagination may still be print-specific |

Shared pieces:

1. Flag model (Structure, Chords, Notation, Lyrics, Info, Fit)
2. Empty-state warning
3. Block placement (§4)
4. Structure auto-fit + `/` empty bars (§5)
5. Lyrics zoom only (§6)
6. ABC persistence (§1.3, §8)

---

## 10. Implementation checklist

- [x] Replace inline/block chord modes with **Structure** + **Chords** booleans in `viewModeUtils` and UI
- [x] Allow all toggles off; show **No view modes enabled**
- [x] Persist Structure, Chords, Notation, Lyrics, Info, Fit (and lyrics zoom) on tune / ABC / cloud
- [x] Unify panel layout for single, gig, and print per §4 (including small-screen wrap around structure)
- [x] Add A+/A− ButtonGroup to single view; lyrics-only in both modes
- [x] Structure auto-fit longest line to full width; no wrap; empty bars as `/`
- [x] Wire Fit into gig as well as single; persist per tune
- [x] Migrate legacy view-mode strings and tests
- [x] Remove Structure-only localStorage and divergent gig vs single placement code paths

---

## 11. Current vs target (brief)

| Topic | Current (as of review) | Target |
|-------|------------------------|--------|
| Chord layout modes | `inline` / `block` flags | Structure + Chords buttons |
| Structure | Single-view localStorage | Persisted view flag everywhere |
| Empty panels | Forced back on (except single `allowEmpty`) | Allowed + warning |
| Layout | Divergent single / gig / print | One ruleset (§4) |
| A+/A− | Gig only; lyrics + chords zoom | Both modes; lyrics only |
| Structure text | Partial auto-size; `C \| \| G` | Full-width longest line; `C \| / \| G` |
| Fit | Global localStorage; weak in gig | Per-tune ABC; both modes |

---

## 12. File map (expected)

| Concern | Files |
|---------|-------|
| Flag model & toggles | `src/viewModeUtils.js`, `src/components/DisplayModeControls.js` |
| UI shell | `src/components/ViewModeSelectorModal.js` |
| Shared layout | New shared module + `MusicSingle.js` / `GigModeModal.js` / `TunePrintSheet.js` |
| Structure rendering | Chord block components; empty-bar `/` formatting |
| Lyrics zoom | Shared A+/A− control; `tune.zoom` / `gigDisplaySettings.js` |
| Persistence | ABC encode/decode (`% abcbook-view-mode`, fit, zoom); `saveTune` |
| CSS | Unified layout classes replacing divergent `.music-layout-*` vs gig split |
