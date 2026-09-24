# Tunebook media cache ContentProvider

Authority: `net.tunebook.app.media_cache`

Exposes Tunebook’s offline audio cache to SynthYoga (`app.yogapp.practice`) and SynthFit (`online.synthfit.app`). Callers are enforced by package allowlist (not shared signing).

## URIs

| Path | Query | Looks up |
|------|-------|----------|
| `/item` | `key=` | Exact cache key (e.g. `extmedia:{tuneId}:{linkIndex}:{src}`) |
| `/by_src` | `src=` | Standalone key `extmedia:src:{src}` (also registered as alias when writing full keys) |
| `/by_recording` | `id=` | `recording:{id}` / `abcbook-recording:{id}` |

Example:

```
content://net.tunebook.app.media_cache/item?key=extmedia%3Atune1%3A0%3Ahttps%3A%2F%2Fcdn.example%2Fa.mp3
content://net.tunebook.app.media_cache/by_src?src=https%3A%2F%2Fcdn.example%2Fa.mp3
content://net.tunebook.app.media_cache/by_recording?id=rec-1
```

## Operations

- **query** — returns one row with `cache_key`, `mime`, `size`, `uri` when present; empty cursor when missing.
- **openFile** — read-only `ParcelFileDescriptor` for the cached file.
- **insert / update / delete** — not supported.

## Storage model

### Android (disk-primary)

1. Bytes live once under `files/shared_media_cache/<sha256(key)>`.
2. localforage `externalmediacache` stores **metadata only** (`duration`, `audioFormat`, `cachedAt`, `fileName`, `size`) — no blob.
3. Tunebook WebView hydrates a Blob from disk when playback needs it.
4. `MediaCacheProvider` serves the same files to yoga/synthfit.
5. One-shot migration (`migrateExternalMediaCacheToDiskPrimaryIfNeeded`) drops legacy IndexedDB blobs after ensuring disk copies exist.

### Web / desktop

Unchanged: full `{ blob, duration, audioFormat }` in IndexedDB. No ContentProvider.

## Consumer notes

WebViews cannot play `content://` URIs directly. Yoga/SynthFit should open the URI via `ContentResolver`, copy into their own cache, then play with `Capacitor.convertFileSrc` / HTMLAudio.
