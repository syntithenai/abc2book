# Theme rollout tracker

Soft blue-slate tokens live in [`theme.css`](theme.css). Tune the palette there, then verify on `#/style-preview`.

## Completed

- [x] **Foundation** — `--app-*` tokens, Bootstrap overrides, reusable `.app-callout` / `.app-surface-panel`
- [x] **Style preview** — `#/style-preview` (linked from Settings)
- [x] **Chrome** — header, footer, music toolbar, tune search panels
- [x] **Help page** — nav, sections, quick links use tokens
- [x] **Settings** — `App-settings` layout and form patterns
- [x] **Modals** — default modal header/footer/content surfaces
- [x] **Practice modal** — instruction callout uses tokens
- [x] **Form controls** — `FileInputButton` replaces gradient file pseudo-buttons; normal checkbox sizing

## Remaining (incremental)

- [ ] **Legacy inline pages** — Files, Recordings, Import modals (partial), manager panels with float layouts
- [ ] **Notation / piano roll** — intentionally dark DAW workspace; optional edge softening only
- [ ] **abcjs / waveform-playlist** — third-party widget colors (low priority)
- [ ] **Print stylesheet** — inherit token neutrals when touched
- [ ] **Tuner lib** — `tunerlib/style.css` still uses standalone grays

## Adoption pattern

When updating a surface:

1. Replace hardcoded hex with `var(--app-*)` or Bootstrap semantic variants
2. Prefer CSS classes over inline `style={{}}`
3. Use `.app-callout` for hints/instructions, `.app-surface-panel` for grouped blocks
4. Check `#/style-preview` after token changes
