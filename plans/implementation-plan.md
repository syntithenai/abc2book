# abc2book Implementation Plan

## Overview

Three parallel workstreams:
- **A** — Single-view toolbar & layout regressions (8 bugs)
- **B** — Lyrics tools integration in main lyrics editor
- **C** — Capo synchronization across music, inline chords, and chord block

---

## Workstream A — Single-view toolbar & layout regressions

The restored curated toolbar (commit `707df96536`) is the right base. The newer "wip" commit
`b9e1694a69` had view-rendering improvements that were lost when it regressed the toolbar. These
fixes apply the rendering improvements without reverting the toolbar.

### A0 — What was discarded (git diff reference)
Run when terminal is available:
```bash
git diff 707df96536 b9e1694a69 -- src/components/MusicSingle.js
git diff --stat 707df96536 b9e1694a69
```

### A1 — Decouple lyrics visibility from chord block (fixes #1, #3)

**File:** `src/components/MusicSingle.js`

**Problem:** The lyrics title/text JSX is wrapped in `{chordsBlockVisible && <>…</>}`. When chords
are off, lyrics never render even if `viewFlags.lyrics` is true.

**Fix:**
1. Add `const lyricsVisible = !!viewFlags.lyrics` after the existing `chordsBlockVisible` derivation.
2. Split the rendering block: lyrics title/text render when `lyricsVisible`; chord diagram panel
   renders when `chordsBlockVisible`. When both are true, keep the 55% width constraint on lyrics
   to leave room for the chord panel.

**Behaviour rules:**
- `lyricsVisible && !chordsBlockVisible` → lyrics at full width, no chord panel.
- `lyricsVisible && chordsBlockVisible` → lyrics at 55% + chord panel fixed right.
- `!lyricsVisible && chordsBlockVisible` → chord panel only, no title/lyrics block.

### A2 — Fix notation hide-hack (fixes #2)

**File:** `src/components/MusicSingle.js`, `src/components/Abc.js`

**Problem:** The notation container uses `style={!notationVisible ? {position:'relative', top:2000} : {}}`.
The `top:2000` still occupies layout space and can cause the ABC SVG to appear at an unexpected
size in some view combinations.

**Fix:** Replace with `style={!notationVisible ? {display:'none'} : {}}`. The `<Abc>` component
must stay mounted (for playback cursor and autoscroll), so `display:none` is the correct approach.

### A3 — Chord panel overlaps toolbar (fixes #5)

**File:** `src/components/MusicSingle.js`, `src/App.css`

**Problem:** The chord diagram panel uses inline `top: '7.4em'` which may overlap the fixed
toolbar on certain screen sizes.

**Fix:**
- Update the inline `top` value to `calc(8.5em + env(safe-area-inset-top, 0px))` which safely
  clears the fixed toolbar (`.music-buttons-fixed` sits at `4.2em`, content min-height `3em`).
- Add a corresponding `top` rule to `.chord-diagram-panel` in App.css so future CSS-only refactors
  pick it up automatically.

### A4 — Allow all content off in single view (fixes #4)

**File:** `src/viewModeUtils.js`, `src/components/MusicSingle.js`

**Problem:** `ensureContentDisplayFlags` forces at least one content flag on whenever any content is
available. In single view this causes the chord toggle to snap back to showing everything when you
click off.

**Fix:**
1. Add an `options.allowEmpty` parameter to `ensureContentDisplayFlags`. When true, skip the
   force-one-on rule. Default is false so editor paths are unaffected.
2. Thread `options` through `resolveDisplayFlagsForTune` to `ensureContentDisplayFlags`.
3. In MusicSingle.js, add `allowEmpty: true` to the `resolveDisplayFlagsForTune` options.

**Blast radius check:** Editor callers pass `options` without `allowEmpty`, so they continue to
force at least one content flag on.

### A5 — Share button triggers login but doesn't open dialog (fixes #7)

**File:** `src/components/ShareTunebookModal.js`

**Problem:** When `!token` the button calls `login()`, but after login there is no mechanism to
re-open the share dialog.

**Fix:**
1. Add `const [pendingOpen, setPendingOpen] = useState(false)`.
2. In the no-token branch, set `setPendingOpen(true)` before `login()`.
3. Add `useEffect` that watches `token` and `pendingOpen`: when `token` becomes truthy and
   `pendingOpen` is true, call `prepareShare()` and `setPendingOpen(false)`.
4. Import `useEffect` (already available in `react`).

**Note:** `prepareShare()` already guards with `if (!googleDocumentId || !token || busy) return`, so
calling it speculatively is safe.

### A6 — Download submenu left padding (fixes #6)

**File:** `src/App.css`

**Problem:** The nested download dropdown inside the left toolbar dropdown appears flush against
the left edge.

**Fix:** Add `padding-left: 0.5rem` to `.music-actions-nested-dropdown-wrap` and increase the
`min-width` of `.tune-download-dropdown-menu` to ensure inner items have breathing room.

### A7 — Small-screen toolbar dropdown clipped (fixes #8)

**File:** `src/components/MusicSingle.js`, `src/App.css`

**Problem:** On small screens, `@media (max-width: 768px)` sets `.music-buttons-inner` to
`overflow-x: auto`, which creates a new formatting context and clips the dropdown menu that
extends outside the toolbar row.

**Fix (JS):** Add `popperConfig={{ strategy: 'fixed' }}` to the `<Dropdown.Menu>` in
MusicSingle.js. This instructs Popper.js to use `position:fixed` for the menu, rendering it
relative to the viewport and free from ancestor overflow clipping.

**Fix (CSS):** Ensure `.music-actions-dropdown-menu` z-index (already `10020`) remains above the
toolbar z-index (`9999`). No CSS z-index change needed.

### A — Verification

| # | Action | Expected |
|---|--------|----------|
| 1 | Toggle Lyrics on/off independently of chords | Lyrics show/hide; chords unaffected |
| 2 | `musicAndLyrics` view | Notation full-size above lyrics area |
| 3 | Turn all content off | Blank/info only; no snap-back |
| 4 | Chord block visible | Panel starts below toolbar, no overlap |
| 5 | Left dropdown → Download | Submenu has left breathing room |
| 6 | Logged-out Share → login | Share dialog opens after login |
| 7 | Narrow viewport | Actions dropdown shows full height |

---

## Workstream B — Lyrics tools integration in main lyrics editor

### B1 — Add Tools button to AbcEditor lyrics toolbar

**File:** `src/components/AbcEditor.js`

**Problem:** The main lyrics editor tab in AbcEditor is missing the Tools button that exists in
TitleAndLyricsEditorModal. Users cannot open lyrics tools with selected text pre-filled from the
main editor.

**Fix:**
1. Add `const [showLyricsTools, setShowLyricsTools] = useState(false)`.
2. Add `const [lyricsToolsQuery, setLyricsToolsQuery] = useState('')`.
3. Add `const wLyricsTextareaRef = useRef(null)`.
4. Add helper `getFirstSelectedLine(textValue, selectionStart, selectionEnd)` (same logic as
   TitleAndLyricsEditorModal).
5. Attach ref to the textarea in `renderLyricsTextarea()`.
6. Add click handler `openLyricsToolsFromSelection()`:
   - No ref / no selection → `toast.warning('Select lyrics text first to open tools.')`
   - Empty first line → `toast.warning('Select at least one line in the lyrics editor to open tools.')`
   - Resolver unavailable → `toast.warning('Lyrics tools are unavailable because the local resolver is not running.')`
   - Otherwise: `setLyricsToolsQuery(firstLine)` + `setShowLyricsTools(true)`.
7. Add Tools button in the lyrics toolbar between Clean and Note-aligned buttons.
8. Add Lyrics Tools Modal at the bottom of the lyrics view return:
   ```jsx
   <Modal show={showLyricsTools} onHide={() => setShowLyricsTools(false)} size="xl" {...responsiveModalProps}>
     <Modal.Header closeButton><Modal.Title>Lyrics Tools</Modal.Title></Modal.Header>
     <Modal.Body style={{padding: 0}}>
       <iframe title="Lyrics tools"
         src={'/lyrics?tab=lookup&q=' + encodeURIComponent(lyricsToolsQuery) + '&toolQ=' + encodeURIComponent(lyricsToolsQuery)}
         style={{width:'100%', minHeight:'70vh', border:'none'}} />
     </Modal.Body>
   </Modal>
   ```

**Additional imports needed:**
- `Modal` from `react-bootstrap` (add to existing import)
- `{ toast }` from `'react-toastify'`
- `useResponsiveModalProps` from `'../useResponsiveModalProps'`

**Prefill contract (LyricsPage.js):**
- `q` param → `lookupQuery` (lookup tab search) at line 249
- `toolQ` param → `toolQuery` (all tools tabs) at line 250
- useEffect resync on `searchParams` change at line 256

### B — Verification

| # | Action | Expected |
|---|--------|----------|
| 1 | Select lyrics, click Tools | Modal opens |
| 2 | First non-empty line prefilled | Lookup query and all tools tabs prefilled |
| 3 | No selection, click Tools | Warning toast |
| 4 | Whitespace-only selection | Warning toast |
| 5 | Resolver unavailable | Resolver warning toast |
| 6 | Existing Search/Clean/Note-aligned | Unchanged |
| 7 | Lyrics autosave | Unaffected by tool modal interactions |

---

## Workstream C — Capo synchronization (single view + gig mode)

### Goal

When the capo button is enabled in single view or gig mode, **all three surfaces** must update
together: staff notation (music), inline chords in the notation, and the chord block panel. This
must also remain in sync as transpose controls change.

When capo is enabled, displayed chords must be the shapes you would **finger with a capo on the
indicated fret** to produce sounds that match the actual (transposed) key.

### C1 — Capo sign fix

**Real-world capo math:**
- Sounding key = original key + `tune.transpose` (+ setItem.transpose in gig mode).
- A capo on fret N **raises** pitch by N semitones.
- To sound in key C with capo on fret 2, you finger as if in B♭ (B♭ + 2 = C).
- Therefore: `fingeredChords = soundingChords − capo`.
- Capo-mode chordTranspose = `baseTranspose − effectiveCapo`.

**Current code (WRONG sign):**
- MusicSingle.js: `chordTranspose = tune.transpose + capo` in capo mode.
- GigModeModal.js: `chordTranspose = baseTranspose + itemTranspose + capoOffset`.

**Fix:** Change `+` to `-` for the capo component in both files.

**Impact:** This flips the current capo-mode chord display. Any tune currently using capo mode will
show different (correct) chords after this fix.

### C2 — Single-view notation does not update with capo (GAP fix)

**File:** `src/components/MusicSingle.js`, `src/components/Abc.js`

**Problem:** `Abc.js` derives `renderOptions.visualTranspose = tune.transpose` directly from the
ABC string (line ~219). This ignores `chordViewMode` and `effectiveCapo`. Enabling capo updates
the chord block but the staff notation and inline chords remain at `tune.transpose` only.

**Fix:**
1. In MusicSingle.js, after computing `chordTranspose`, add:
   `const notationVisualTranspose = chordTranspose`
2. Pass `visualTranspose={notationVisualTranspose}` to both `<Abc>` components.
3. In Abc.js `renderTune()`, replace:
   ```js
   if (tune && (tune.transpose > 0 || tune.transpose < 0)) {
     renderOptions.visualTranspose = tune.transpose
   }
   ```
   with:
   ```js
   const effectiveVisualTranspose = props.visualTranspose != null ? props.visualTranspose : (tune ? tune.transpose : 0)
   if (effectiveVisualTranspose > 0 || effectiveVisualTranspose < 0) {
     renderOptions.visualTranspose = effectiveVisualTranspose
   }
   ```

**Backward compat:** When `props.visualTranspose` is undefined (all existing callers), behavior is
unchanged (falls back to `tune.transpose`).

### C3 — Gig mode: confirm and correct

**File:** `src/components/GigModeModal.js`

Gig mode already feeds `chordTranspose` into notation via `notationVisualTranspose` (line 162)
and through `buildGigNotationRenderOptions()`. The only change needed is the sign fix from C1.

### C4 — Reactivity verification

Both `chordTranspose` in MusicSingle.js and the `useMemo` in GigModeModal.js depend on
`chordViewMode`, `effectiveCapo`, and transpose. Verify that toggling transpose +/- while capo is
enabled re-renders all three surfaces (notation, inline chords, chord block). No extra `useEffect`
or dep changes are expected since React state changes trigger re-renders.

### C — Verification

| # | Action | Expected |
|---|--------|----------|
| 1 | Single view: capo > 0, toggle capo ON | Staff notes, inline chords, chord block all shift equally |
| 2 | Single view: capo ON + transpose +/− | All three surfaces update consistently |
| 3 | Gig mode: same as 1−2, incl. per-item overrides | All three surfaces consistent |
| 4 | Sign check: key C, capo 2 | Displayed fingered chords 2 semitones below sounding |
| 5 | Playback with capo ON | Audio pitch unchanged (capo is display-only) |
| 6 | Capo OFF | Reverts to transpose-only behavior |

### C — Decisions

- Capo is a **display/fingering** view; playback pitch stays at sounding key.
- Abc.js MIDI cache key does not include capo — correct, since audio plays the sounding key.
- All three surfaces share one computed `notationVisualTranspose = chordTranspose` value.

---

## Files modified

| File | Workstream | Changes |
|------|-----------|---------|
| `src/viewModeUtils.js` | A4 | `allowEmpty` option for `ensureContentDisplayFlags` + `resolveDisplayFlagsForTune` |
| `src/components/MusicSingle.js` | A1–A3, A7, C1–C2 | Lyrics decouple, notation hide, chord panel top, dropdown popper, capo sign, notationVisualTranspose |
| `src/components/Abc.js` | A2, C2 | `props.visualTranspose` override |
| `src/components/GigModeModal.js` | C1 | Capo sign fix |
| `src/components/ShareTunebookModal.js` | A5 | Pending open after login |
| `src/App.css` | A3, A6 | Chord panel top, download menu padding |
| `src/components/AbcEditor.js` | B1 | Lyrics tools button + modal |
