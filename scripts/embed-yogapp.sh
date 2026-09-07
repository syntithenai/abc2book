#!/usr/bin/env bash
# Embed a hash-preserving redirect at ./yoga/ for GitHub Pages (tunebook.net/yoga/).
# SynthYoga SPA now lives at https://yoga.synthfit.online — do not ship the full
# Vite dist here. Keep audio-packs/v1 for Android / locale zip fallbacks.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
YOGAPP="${YOGAPP_DIR:-$ROOT/../yogapp}"

DEST_BUILD="$ROOT/build/yoga"
DEST_ROOT="$ROOT/yoga"

write_redirect() {
  local dest="$1"
  mkdir -p "$dest"
  cat >"$dest/index.html" <<'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SynthYoga has moved</title>
    <link rel="canonical" href="https://yoga.synthfit.online/" />
    <meta http-equiv="refresh" content="0;url=https://yoga.synthfit.online/" />
    <script>
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          regs.forEach(function (r) {
            r.unregister()
          })
        })
        if (window.caches && caches.keys) {
          caches.keys().then(function (keys) {
            keys.forEach(function (k) {
              caches.delete(k)
            })
          })
        }
      }
      ;(function () {
        var dest = 'https://yoga.synthfit.online/' + (location.hash || '')
        location.replace(dest)
      })()
    </script>
    <style>
      body {
        font-family: system-ui, sans-serif;
        max-width: 36rem;
        margin: 3rem auto;
        padding: 0 1rem;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <p>
      SynthYoga now lives at
      <a id="dest" href="https://yoga.synthfit.online/">yoga.synthfit.online</a>.
    </p>
    <script>
      document.getElementById('dest').href =
        'https://yoga.synthfit.online/' + (location.hash || '')
    </script>
  </body>
</html>
EOF
  cp "$dest/index.html" "$dest/404.html"
  cat >"$dest/sw.js" <<'EOF'
/* Legacy SynthYoga embed removed — unregister and drop caches. */
self.addEventListener('install', (e) => {
  self.skipWaiting()
})
self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
      await self.registration.unregister()
      const clientsList = await self.clients.matchAll({ type: 'window' })
      for (const c of clientsList) {
        const u = new URL(c.url)
        c.navigate('https://yoga.synthfit.online/' + (u.hash || ''))
      }
    })(),
  )
})
EOF
  cat >"$dest/registerSW.js" <<'EOF'
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister())
  })
}
EOF
  cat >"$dest/README.md" <<'EOF'
# SynthYoga redirect (former Tune Book embed)

Redirects to https://yoga.synthfit.online/ (hash preserved).
Locale audio zips may still live under `audio-packs/v1/`.
EOF
}

echo "embed-yogapp: writing redirect stub (not full SPA) → $DEST_ROOT"

# Preserve existing audio-packs if present, then replace SPA with redirect.
AUDIO_TMP=""
if [[ -d "$DEST_ROOT/audio-packs" ]]; then
  AUDIO_TMP="$(mktemp -d)"
  cp -a "$DEST_ROOT/audio-packs" "$AUDIO_TMP/"
fi

rm -rf "$DEST_BUILD" "$DEST_ROOT"
mkdir -p "$DEST_BUILD" "$DEST_ROOT"
write_redirect "$DEST_BUILD"
write_redirect "$DEST_ROOT"

if [[ -n "$AUDIO_TMP" && -d "$AUDIO_TMP/audio-packs" ]]; then
  cp -a "$AUDIO_TMP/audio-packs" "$DEST_ROOT/"
  cp -a "$AUDIO_TMP/audio-packs" "$DEST_BUILD/"
  rm -rf "$AUDIO_TMP"
  echo "embed-yogapp: restored audio-packs under $DEST_ROOT"
elif [[ -x "$YOGAPP/scripts/copy-audio-packs-embed.sh" ]]; then
  bash "$YOGAPP/scripts/copy-audio-packs-embed.sh" "$DEST_BUILD" "$DEST_ROOT" || true
fi

echo "embed-yogapp: wrote redirect at $DEST_BUILD and $DEST_ROOT → https://yoga.synthfit.online/"
