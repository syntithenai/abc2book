# Notation editor — click & caret manual smoke checklist

Run on `http://localhost:3000/#/editor/<tuneId>/music` after changes to staff click/caret code.

## Fixtures

| Tune ID | Use |
|---------|-----|
| `e2e00000000000000000001` | Single-line `C D E F \|` |
| `e2e00000000000000000003` | Multiline two systems |
| `e2e00000000000000000004` | Empty staff |
| `e2e00000000000000000006` | Copper: `A2A2^F2BE\| GGFE` (mid-bar `abcjs-n` reset, no trailing `\|`) |

## Checklist

### Single-line selection (`…001`)

- [ ] Click D — one blue overlay box; D selected; ghost label shows D
- [ ] Click E — selection moves to E; no stuck highlight on D
- [ ] Drag F up one staff step — F transposes (not E or adjacent note)
- [ ] Shift+click range from C to F — range selected

### Note input (`…001`)

- [ ] Press N — note input mode; caret visible
- [ ] Click between D and E — type `a` — A appears between D and E
- [ ] Click at start (left of C) — type `g` — G appears before C
- [ ] Click between every adjacent pair (C–D, D–E, E–F) — typed note lands at clicked slot
- [ ] Edit at end, then click between C–D — new note lands between C–D (not at end)
- [ ] Select E in normal mode — barline toolbar — `|` appears before E (not after F)
- [ ] Right-click between notes — exactly one rest inserted (not two)
- [ ] Barline toolbar at caret — bar appears at caret position
- [ ] Esc exits note input; N re-enters without stuck caret

### Multiline (`…003`)

- [ ] Click G on line 1 — G selected (not line-2 note)
- [ ] Click d on line 2 — d selected (not C/D/E/F from line 1)
- [ ] Note input: click line 2, type note — note appears on line 2

### Empty staff (`…004`)

- [ ] Note input: click staff — caret at start; type `c` — C appears

### Copper mid-bar (`…006`) — `A2A2^F2BE| GGFE`

- [ ] Note input: click past last E — caret appends; type `c` — C appears after FE (not mid-measure)
- [ ] Select mode: drag the ^F (3rd note) up one step — only that note moves (measure-2 F stays)
- [ ] Select measure-2 F once — press `+` — sharp sticks on that F (not carry-only)

## Rollback

If clicks mis-resolve after resolver changes:

```javascript
localStorage.setItem('notationClickResolverV2', '0')
```

Reload the editor page.
