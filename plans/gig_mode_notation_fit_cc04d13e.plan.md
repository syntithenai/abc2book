---
name: Gig Mode Notation Fit
overview: Redefine the two Gig Mode notation fit modes so vertical fit scales the whole tune to fill the vertical space (no scroll) and horizontal fit renders full-box-width staff lines at a capped larger note size that scrolls vertically when the tune is tall.
todos:
  - id: compute-fit
    content: Rewrite horizontal branch of computeNotationFit in src/gigNotationFit.js to fill width and set overflowY (no height cap)
    status: completed
  - id: staff-search
    content: Rewrite findStaffWidthForHorizontalFit to render full-box-width lines and grow note size to fill height, capped by a min staffwidth fraction
    status: completed
  - id: apply-fit
    content: Update applyNotationFit to set inline overflow-x/overflow-y and scroll-alignment classes
    status: completed
  - id: css-scroll
    content: Remove overflow:hidden from .gig-mode-notation-render and add scroll-y/wide alignment rules in GigModeModal.css
    status: completed
  - id: tests
    content: Update gigNotationFit.test.js horizontal cases to assert fill-width + vertical overflow behavior
    status: completed
isProject: false
---

## Confirmed behavior

- **Vertical fit**: the entire tune is visible and scaled to fill the full available height (no vertical scroll). Horizontal scroll only if content is still wider than the box after filling height.
- **Horizontal fit**: every staff line is wrapped to the full box width (no horizontal scroll). Note size is grown toward filling the height but **capped** so a short tune's notes don't become absurd. When the tune is taller than the box, it **overflows and scrolls vertically**.

## Why previous attempts failed

- `computeNotationFit` (horizontal branch) in [src/gigNotationFit.js](src/gigNotationFit.js) *caps* height and shrinks width, so it never scrolls and leaves horizontal gaps.
- `findStaffWidthForHorizontalFit` searches toward a *wider* staff (fewer lines) to make it shorter — the opposite of "full-width lines, scroll down".
- Both `.gig-mode-notation-paper` and `.gig-mode-notation-render` set `overflow: hidden` in [src/components/GigModeModal.css](src/components/GigModeModal.css), so scrolling is impossible regardless of the math.

## Changes

### 1. `computeNotationFit` — fix the horizontal branch ([src/gigNotationFit.js](src/gigNotationFit.js))

Horizontal fit should always fill width and allow vertical overflow (no more height cap):

```javascript
if (mode === GIG_NOTATION_FIT_HORIZONTAL) {
  const width = horizontalFitTargetWidth(availW);      // always fill width
  const height = dims.height * (width / dims.width);   // proportional; may exceed availH
  return {
    mode: mode,
    width: width,
    height: height,
    overflowX: false,
    overflowY: height > verticalFitTargetHeight(availH) + 1,
  };
}
```

The vertical branch (fill height, `overflowX = width > availW + 1`, `overflowY: false`) stays as-is.

### 2. Rewrite `findStaffWidthForHorizontalFit` ([src/gigNotationFit.js](src/gigNotationFit.js))

New goal: pick the render `staffwidth` so that lines display at the full box width, with note size grown to fill the height but capped:
- Start at `staffwidth = availW`. Compute displayed height = `nativeHeight * (availW / nativeWidth)`.
- If displayed height `>= availH` (tune already fills/overflows): use `availW` (comfortable full-width lines) and let it scroll vertically. Do NOT shrink notes.
- If displayed height `< availH` (short tune, empty space): binary-search a *smaller* staffwidth (bigger notes / more lines) until displayed height ≈ `availH`, clamped to a minimum `staffwidth` (the note-size cap). Add a constant e.g. `GIG_NOTATION_HFILL_MIN_STAFF_FRACTION = 0.6` so `minStaff = Math.max(GIG_NOTATION_MIN_STAFF_WIDTH, availW * 0.6)`.

Return `{ staffWidth, dims }` consistent with the current call site in `renderNotation`.

### 3. `applyNotationFit` — apply overflow + scroll alignment ([src/gigNotationFit.js](src/gigNotationFit.js))

Set overflow inline based on `fitResult`, and top/left-align when scrolling (centered content clips when it overflows a flex container):

```javascript
if (fitResult.mode === GIG_NOTATION_FIT_HORIZONTAL) {
  renderEl.classList.add('gig-mode-notation-render--fit-horizontal');
  renderEl.style.overflowX = 'hidden';
  renderEl.style.overflowY = fitResult.overflowY ? 'auto' : 'hidden';
  renderEl.classList.toggle('gig-mode-notation-render--scroll-y', !!fitResult.overflowY);
} else {
  renderEl.classList.add('gig-mode-notation-render--fit-vertical');
  renderEl.style.overflowY = 'hidden';
  renderEl.style.overflowX = fitResult.overflowX ? 'auto' : 'hidden';
  renderEl.classList.toggle('gig-mode-notation-render--wide', !!fitResult.overflowX);
}
```

### 4. CSS — allow scrolling and correct alignment ([src/components/GigModeModal.css](src/components/GigModeModal.css))

- Remove `overflow: hidden;` from `.gig-mode-notation-render` (JS now controls overflow). Keep `.gig-mode-notation-paper { overflow: hidden; }` as the clip boundary.
- When vertically scrolling, top-align so the first system isn't clipped:

```css
.gig-mode-notation-render--fit-horizontal.gig-mode-notation-render--scroll-y {
  align-items: flex-start;
}
.gig-mode-notation-render--wide {
  justify-content: flex-start;
}
```

### 5. Tests ([src/gigNotationFit.test.js](src/gigNotationFit.test.js))

- Replace "horizontal fit caps height when tune is tall" with: for a tall tune, `fit.width === horizontalFitTargetWidth(availW)` and `fit.overflowY === true`.
- Keep "horizontal fit uses full available width when content is short" and add `fit.overflowY === false` for a short/wide tune.
- Vertical tests stay (fills height, `overflowX` reflects wide content).

## Verification

- Vertical: open a long tune — whole piece visible, filling the full paper height, no scroll. A short tune scales up and centers.
- Horizontal: staff lines span the full paper width; a long tune scrolls vertically (first system not clipped); a short tune's notes grow to fill height but stop at the cap rather than becoming huge.
- Meta text (title/composer/rhythm) remains fully visible in both modes (existing envelope guard in `getSvgContentBBox` is unchanged).
