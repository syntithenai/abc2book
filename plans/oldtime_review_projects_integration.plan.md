---
name: Oldtime Review Projects integration
overview: Admin-only Review Projects UI (tabs for Milliner–Koken + oldtimefiddletunes.net), local-resolver-gated access to Documents-backed OMR work, without committing large temps.
todos:
  - id: relocate-sources
    content: Move milliner-koken + oldtime working files to ~/Documents/oldtime sources review/; keep scrape/*.abc; gitignore + README inventory
    status: completed
  - id: review-projects-shell
    content: Replace Add→Old time fiddle source review with single admin Review Projects entry; tabbed shell (Milliner–Koken | Old Time Fiddle); hide entirely for non-admins
    status: completed
  - id: unify-ui-on-book-import
    content: Make oldtime review UX match BookImportReviewPanel (3-col crop|staff|ABC tools, filters, export/import package); reuse OMR/MIDI convert already in oldtimeEnrichActions
    status: completed
  - id: milliner-tab-wire
    content: Load Milliner–Koken review from Documents via resolver (merged import JSON + crops); preserve OMR candidates already generated; open into same panel pattern as Import scans review
    status: completed
  - id: resolver-documents-gate
    content: Mount/serve Documents review root from local-resolver; disable Review Projects when resolver unreachable or root missing; enable only when connected + admin
    status: completed
  - id: notation-cleanup-pass
    content: Long-running chip-away — clean imported notation (structure, meters, chords, dubious OMR) for both collections
    status: pending
  - id: recreate-resolver-mount
    content: Recreate local-resolver container so REVIEW_PROJECTS_DIR mount is live; confirm /health.reviewProjects and /review-projects
    status: pending
isProject: false
---

# Review Projects — Milliner–Koken + oldtimefiddletunes

## Goal

One admin surface to continue cleaning two large source-edition imports without
shipping multi‑GB temps in git.

## Done already (preserve)

- **OMR / MIDI convert path** for oldtime (`oldtimeEnrichActions`, local-resolver
  MIDI→ABC + sheet OMR).
- **Milliner–Koken full pipeline** under Documents
  (`milliner-koken-full/merged/` — import JSON, ABC, `review_abc.html`, crops).
- **Book import review UI** (`BookImportReviewPanel`) — target look for both tabs.
- **Working files relocated** to
  `/home/stever/Documents/oldtime sources review/` (see README there).

## Product shape

```
[Admin only]
  Review Projects  →  disabled unless local resolver reachable
                      AND Documents review root is available

  ┌─────────────────────────────────────────────┐
  │  [ Milliner–Koken ]  [ Old Time Fiddle ]    │  tabs
  │                                             │
  │  same layout as Import scans / PDF review:  │
  │  list | crop/PDF | staff | ABC tools        │
  └─────────────────────────────────────────────┘
```

- Remove / retire the separate **Add → Old time fiddle source review** menu item
  once the shell exists (or keep as deep-link that opens the Old Time tab).
- Do **not** show the button for non-admin users (`isMusicGenerationAdmin`).

## Access rules

| Condition | UI |
|-----------|-----|
| Not admin | No Review Projects control |
| Admin, resolver down / no Documents mount | Control visible, **disabled** (tooltip: needs local resolver) |
| Admin + resolver + review root OK | Enabled |

Resolver should expose a small health/capability flag, e.g. review root present
at a configured path (default
`/home/stever/Documents/oldtime sources review` on the host, bind-mounted into
the container).

## Data locations (canonical)

| Collection | Package / work |
|------------|----------------|
| Old Time | `…/oldtimefiddletunes/data/enrich_package*.json`, media under `data/media/` |
| Milliner–Koken | `…/milliner-koken/milliner-koken-full/merged/milliner-koken-import.json` (+ tunes/pages) |

Repo `scrape/oldtimefiddletunes.abc` and `scrape/millinerkoken.abc` remain the
curated import products (small); rebuild from reviewed packages when ready.

## Implementation notes (when chipping away)

1. **Shell modal/page** — thin wrapper with tabs; Milliner tab can start by
   importing the merged JSON into `bookImportReviewStore` (same as Import Book);
   Old Time tab can keep `oldtimeEnrichReviewStore` until UI parity, then merge.
2. **UI parity** — prefer adapting oldtime tunes into the BookImport review
   model over forking a second full panel; convert MIDI/OMR stays source-only.
3. **Resolver** — add read-only file serving (or package list + blob fetch) for
   the Documents root; SPA never assumes `file://` or hard-coded host paths
   except via resolver config.
4. **gitignore** — already ignores `scripts/oldtimefiddletunes/data/` and
   `public/oldtimefiddletunes/`; keep large work out of commits. Symlinks under
   those paths are fine locally.

## Out of scope for this plan

- EuroSession phone-book pipeline (`~/Downloads/eurosession-*`) — separate
  project; leave in Downloads unless you later fold it in.
- Finishing all notation cleanup — tracked as ongoing `notation-cleanup-pass`.
