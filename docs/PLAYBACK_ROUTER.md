# Playback router integration

Incremental wiring of `resolvePlaybackRoute()` into `useTuneBookMediaController.play()`.

## Debug logging

```js
localStorage.setItem('tunebook_playback_debug', '1')
// optional: always capture route ring buffer
window.__tunebookPlaybackRouteLogEnabled = true
```

Inspect: `window.__tunebookPlaybackRouteLog` (last 50 entries). The buffer is initialized empty when debug is enabled (page load or first log read).

Console lines use `[tunebook-playback-route]` (not duplicated through agent debug ingest).

## Tests

```bash
npm run test:playback:router          # unit fixtures + parity
npm run test:playback:router:e2e      # browser matrix (?seed=playback-router)
npm run test:playback:router:all      # unit + playback-smoke + router e2e
```

## Enforce flags (dev only)

Set in browser console to replace legacy branches with router decisions:

| Flag value | Effect |
|---|---|
| `resolver-precheck` | Block proxied library fetch when router says `resolverRequired` and auth/resolver unavailable |
| `snapcast-default` | Only attempt Snapcast default when router engine is `snapcast` |
| `midi-native` | Gate ABC-MIDI native prerender on router engine |
| `media-native` | Gate Android direct audio on router engine |
| `external-processing` | Prefer processor over native-filtered when router says `local-processor` |
| `all` | All of the above |

```js
localStorage.setItem('tunebook_playback_router_enforce', 'resolver-precheck')
// rollback:
localStorage.removeItem('tunebook_playback_router_enforce')
```

## Enforce coverage

| Path | Status |
|---|---|
| resolver-precheck | enforce-dev (localStorage flag) |
| snapcast-default | enforce-dev |
| midi-native | enforce-dev |
| media-native | enforce-dev |
| external-processing | enforce-dev |

**Definition of done:** each path moves to `legacy-removed` after soak (inline `if` chains deleted).

## Phase gates

- **Enforcement:** only after `npm run test:playback:router` fixture matrix is green.
- **Soak:** manual play flows with debug on; zero unexpected `severity: 'policy'` mismatches.
- **Rollback:** clear `tunebook_playback_router_enforce` — legacy behavior returns immediately.
