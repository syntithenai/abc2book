# Notation editor — click & caret manual smoke checklist

Run on `http://localhost:3000/#/editor/<tuneId>/music` after changes to staff click/caret code.

## Fixtures

| Tune ID | Use |
|---------|-----|
| `e2e00000000000000000001` | Single-line `C D E F \|` |
| `e2e00000000000000000003` | Multiline two systems |
| `e2e00000000000000000004` | Empty staff |

## Checklist

### Single-line selection (`…001`)

- [ ] Click D — one blue overlay box; D selected; ghost label shows D
- [ ] Click E — selection moves to E; no stuck highlight on D
- [ ] Drag F up one staff step — F transposes (not E or adjacent note)
- [ ] Shift+click range from C to F — range selected

### Note input (`…001`)

- [ ] Press N — note input mode; caret visible
- [ ] Click between D and E — type `a` — A appears between D and E
- [ ] Right-click between notes — exactly one rest inserted (not two)
- [ ] Barline toolbar at caret — bar appears at caret position
- [ ] Esc exits note input; N re-enters without stuck caret

### Multiline (`…003`)

- [ ] Click G on line 1 — G selected (not line-2 note)
- [ ] Click d on line 2 — d selected (not C/D/E/F from line 1)
- [ ] Note input: click line 2, type note — note appears on line 2

### Empty staff (`…004`)

- [ ] Note input: click staff — caret at start; type `c` — C appears

## Rollback

If clicks mis-resolve after resolver changes:

```javascript
localStorage.setItem('notationClickResolverV2', '0')
```

Reload the editor page.
