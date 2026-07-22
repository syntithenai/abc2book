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

## Single tune edit

1. Edit and save one tune in a large library.
2. Save should feel instant; persistence may flush within ~750ms.
3. Tune list metadata should refresh when tune content changes (not only when tune count changes).

## Import (500 tunes)

1. Import ~500 tunes.
2. Progress overlay should appear; UI should not remain unresponsive for more than ~5s continuously.
