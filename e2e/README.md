# Playback E2E smoke tests

Browser checks using **Puppeteer** (already in project dependencies).

## Quick start

```bash
# Terminal 1
npm start

# Optional one-time setup for a reusable Chrome debug profile
npm run browser:seed-profile

# Optional: launch Chrome/Chromium with remote debugging and the seeded profile
npm run browser:debug

# Terminal 2 — unit tests (always works, no browser data needed)
npm run test:playback

# Terminal 2 — browser smoke (needs tune data in browser — see below)
npm run test:playback:e2e

# Terminal 2 — watch the browser instead of headless mode
npm run test:playback:e2e:headed

# Both
npm run test:playback:all
```

## Important: tune data

The app stores tunes in **IndexedDB**. A fresh headless Chrome has **no tunes**, so the E2E script will **skip gracefully** (exit 0) unless you provide a browser that already has your tunebook loaded.

### Google Drive sync dialog

If you are **logged in** (especially in the debug profile after copying IndexedDB from your main
Chrome), the app may show a blocking **Update Warning** modal while it compares local data with
Google Drive. The E2E script dismisses this automatically by clicking **Merge** (default) before
playback tests run.

To use **Discard Local Differences** instead (keeps Drive as source of truth; does not upload local
changes):

```bash
PLAYBACK_TEST_SYNC_ACTION=discard npm run test:playback:e2e
```

To avoid the dialog entirely: do not log into Google in the debug profile — tune data in IndexedDB
works offline without login.

### Option A — Connect to Chrome with remote debugging (recommended)

**Chrome 120+ will not open the debugging port on your normal profile.** If you use
`--user-data-dir="$HOME/.config/google-chrome"` you will see:

`DevTools remote debugging requires a non-default data directory`

…and `curl http://127.0.0.1:9222/json/version` will fail even though Chrome is running.

Use a **separate** profile directory instead.

#### One-time setup (copy localhost tune data from your main profile)

1. **Quit all Chrome windows** (normal Chrome must not be running).

2. Seed a debug profile with your existing `localhost:3000` IndexedDB **and blob files**:

   ```bash
   ./e2e/setup-debug-profile.sh
   ```

   Chrome splits IndexedDB into `*.leveldb` (metadata) and `*.blob` (audio/recording bytes).
   Copying only leveldb causes `Data lost due to missing file … irrecoverable`.

   Or manually (with Chrome fully quit):

   ```bash
   PROFILE="$HOME/.chrome-abc2book-debug"
   SRC="$HOME/.config/google-chrome/Default/IndexedDB"
   mkdir -p "$PROFILE/Default/IndexedDB"
   cp -a "$SRC/http_localhost_3000.indexeddb.leveldb" "$PROFILE/Default/IndexedDB/"
   cp -a "$SRC/http_localhost_3000.indexeddb.blob"    "$PROFILE/Default/IndexedDB/"
   ```

3. Start Chrome with debugging on that profile:

   ```bash
   npm run browser:debug
   ```

   Equivalent manual command:

   ```bash
   google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-abc2book-debug"
   ```

4. Confirm the port is open:

   ```bash
   curl http://127.0.0.1:9222/json/version
   ```

   You should get JSON with `"Browser": "Chrome/..."`. If this fails, debugging is not active.

5. Open your tune and confirm playback works manually:

   `http://localhost:3000/#/tunes/62828a3a7e0d5d8ba323b83c/playMedia/0`

6. Run the test (in another terminal, with `npm start` running):

   ```bash
   PLAYBACK_TEST_CDP_URL=http://127.0.0.1:9222 npm run test:playback:e2e
   ```

### Option B — Let Puppeteer launch Chrome (no CDP)

```bash
HEADLESS=0 PLAYBACK_TEST_USER_DATA_DIR="$HOME/.chrome-abc2book-debug" npm run test:playback:e2e
```

First run: watch the browser, open your tune if needed, then re-run. After `./e2e/setup-debug-profile.sh`,
tune data is already in the profile.

### Option C — Force failure when no tune data

Useful in CI once you have a seeded profile:

```bash
PLAYBACK_TEST_REQUIRE_TUNE=1 npm run test:playback:e2e
```

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PLAYBACK_TEST_BASE` | `http://localhost:3000` | Dev server origin |
| `PLAYBACK_TEST_URL` | `…/62828a3a7e0d5d8ba323b83c/playMedia/0` | Full hash URL |
| `PLAYBACK_TEST_CDP_URL` | — | Connect to existing Chrome (e.g. `http://127.0.0.1:9222`) |
| `PLAYBACK_TEST_USER_DATA_DIR` | — | Chrome profile with tune data |
| `PLAYBACK_TEST_REQUIRE_TUNE` | `0` | Exit 1 if tune never loads |
| `PLAYBACK_TEST_SYNC_ACTION` | `merge` | `merge` or `discard` for Google Drive sync dialog |
| `HEADLESS` | `1` | Set `0` to watch the browser |
| `PLAYBACK_TEST_TIMEOUT` | `120000` | Page timeout (ms) |

## What is checked

1. Tune route loads (media UI or page content)
2. Play starts (or already playing on `playMedia` route)
3. Progress bar shows duration
4. Time advances while playing
5. **Slider drag seek while playing** — playhead moves and time keeps advancing
6. **Programmatic seek while playing** — position updates and playback continues
7. **Pause** — no spurious tap-to-play modal within 5s
8. **Resume** — time advances again after pause/play
9. **Seek after resume** — playhead moves and time keeps advancing
10. **Second pause/play/seek cycle** — progress bar still works (regression guard)
11. **MIDI rhythm diagnostics** — after count-in, `getRhythmDiagnostics()` reports playing phase and varied slot indices (catches metronome stuck on one beat; useful for **4/4 L:1/8** tunes where abcjs eighth beats differ from the quarter rhythm grid)

Dev-only hook `window.__abc2bookPlaybackTest.seek(ratio)` is used when slider
automation cannot drive the React range input reliably.

In development builds, `window.__abc2bookPlaybackTest.getRhythmDiagnostics()` returns phase,
tempo, `rhythmGridQpm` vs `playbackQpm`, count-in slot count, and a ring buffer of recent
scheduled slots — inspect in DevTools during headed runs (`HEADLESS=0`).

## Selectors

Stable hooks (with CSS fallbacks for older dev builds):

- `data-testid="media-play-button"` / `media-pause-button`
- `data-testid="media-seek-slider"` / `media-seek-time`
- `data-testid="tap-to-play-modal"`

Debug screenshots on failure: `e2e/output/`

## Limitations

- Does not verify **audible** output — only UI/time progression
- YouTube / external pitch-tempo depend on network and resolver
- Not wired into CI by default (needs server + seeded browser profile)

## Notation editor E2E

See **[NOTATION.md](./NOTATION.md)** for the walkthrough-aligned test matrix.

```bash
npm start   # terminal 1
npm run test:notation:e2e
npm run test:notation:e2e:headed
NOTATION_E2E_TIER=1 npm run test:notation:e2e   # P0 + P1
NOTATION_E2E_TIER=full npm run test:notation:e2e
```

Fixtures: `?seed=notation-basic` loads tunes from [notationE2eFixtures.js](../src/devSeed/notationE2eFixtures.js).
Dev hook: `window.__abc2bookNotationTest` (ABC, selection, mode, caret).

| Variable | Default | Purpose |
|----------|---------|---------|
| `NOTATION_TEST_BASE` | `http://localhost:3000` | Dev server |
| `NOTATION_TEST_URL` | basic editor music URL | Override start URL |
| `NOTATION_E2E_TIER` | `0` | `0`, `1`, `full`, `p1`, `p2`, `p3` |
| `NOTATION_TEST_CDP_URL` | — | Same as playback CDP |

**CI:** Jest notation tests run on every PR (`npm test`). Puppeteer tiers are optional nightly jobs.

## Test pyramid (playback)

| Layer | Command | Covers |
|-------|---------|--------|
| Unit | `npm run test:playback` | Intent, seek guards, pause/tap-to-play logic (26 tests) |
| E2E | `npm run test:playback:e2e` | Real browser play/seek/pause flow |
