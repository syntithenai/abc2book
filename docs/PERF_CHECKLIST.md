# Performance manual checklist

Use this checklist on a mid-range laptop after performance-related changes.

## Tune index (2,000 tune library)

1. Seed or import ~2,000 tunes.
2. Open `/tunes` with no filters — list should render without a multi-second freeze.
3. Scroll the virtualized list — scrolling should stay smooth.
4. Apply a text filter returning ~1,200 results — spinner/overlay appears briefly; list updates without locking the tab.
5. Switch between compact and detailed display modes on a 500+ result set.

## Bulk check (150 tunes)

1. Select 150 tunes and open Check.
2. Static analysis progress bar should advance while the UI remains responsive.
3. Results list should scroll smoothly in the modal.

## Duplicate manager (3,000 tune library)

1. Open Settings → Duplicate manager.
2. Initial scan may take a few seconds but should not freeze the tab for more than ~3s at a time.
3. Click Rescan — scan should restart immediately.

## Large library — book filter (10,000 tunes)

1. Dev seed: `await window.seedTunebook({ preset: '10k', replace: true })` or load with `?seed=10k`.
2. Open Settings → Library — rebuild indexes; confirm tune count ~10k.
3. Open `/tunes` with book filter **Perf Test** — list should update in under ~1s (candidate IDs, not full scan).
4. Scroll compact list — virtualized scrolling stays smooth; pagination shows 200 tunes per page.
5. Text filter with 3+ characters should narrow via search index without scanning all titles.

## Large library — catalog mode (50,000 tunes, manual)

1. Seed with `?seed=50k` (dev only); migrate via Settings → Library → Migrate to catalog storage.
2. Enable catalog storage; reload — startup should not load all bodies into React state.
3. Open a book — memory should stay bounded (check DevTools heap after scrolling several pages).

## Duplicate manager (large library)

1. With 1k+ tunes, Settings → Duplicates defaults to **current book only**.
2. Toggle off to scan full library — UI should remain responsive (chunked scan).

## Single tune edit

1. Edit and save one tune in a large library.
2. Save should feel instant; persistence may flush within ~750ms.
3. Tune list metadata should refresh when tune content changes (not only when tune count changes).

## Import (500 tunes)

1. Import ~500 tunes.
2. Progress overlay should appear; UI should not remain unresponsive for more than ~5s continuously.
