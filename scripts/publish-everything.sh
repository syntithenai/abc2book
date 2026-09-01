#!/usr/bin/env bash
# publish-everything.sh — rebuild Tune Book + YogApp (web + Android) and push
# so tunebook.net (and /yoga/) pick up the latest from GitHub Pages.
#
# Usage (from abc2book):
#   npm run publish:everything
#   bash scripts/publish-everything.sh
#   bash scripts/publish-everything.sh --dry-run
#   bash scripts/publish-everything.sh --no-android
#   bash scripts/publish-everything.sh --no-locale-audio
#   bash scripts/publish-everything.sh --no-resolver
#   bash scripts/publish-everything.sh --no-push
#   bash scripts/publish-everything.sh --install      # require adb device
#   bash scripts/publish-everything.sh --no-install   # skip even if phone plugged in
#   bash scripts/publish-everything.sh --force        # rebuild/redeploy everything
#
# Env:
#   YOGAPP_DIR   Sibling YogApp checkout (default: ../yogapp)
#   JAVA_HOME_TB   JDK for Tune Book Capacitor 6 (default: .tools/jdk-17 or JAVA_HOME)
#   JAVA_HOME_YOGA JDK for YogApp Capacitor 8 (default: ~/.local/opt/jdk-21 or JAVA_HOME)
#   ANDROID_HOME   Android SDK (default: .tools/android-sdk or ~/Android/Sdk)
#   AUDIO_RELEASE_TAG  YogApp locale-audio release tag (default: audio-v1)
#   CLOUD_RUN_ENV_FILE  Override Cloud Run env yaml for light resolver deploy
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
YOGAPP="${YOGAPP_DIR:-$ROOT/../yogapp}"
RESOLVER="$ROOT/local-resolver"

DRY_RUN=0
DO_ANDROID=1
DO_LOCALE_AUDIO=1
DO_RESOLVER=1
DO_PUSH=1
DO_COMMIT=1
# auto = install when an adb device is connected; always = require device; never = skip
DO_INSTALL=auto
WAIT_PAGES=0
FORCE_ALL=0

usage() {
  cat <<'EOF'
publish-everything — rebuild Tune Book + YogApp (web + Android), deploy hosted
resolver, and push for tunebook.net

Skips expensive steps when sources are unchanged vs upstream (and working tree
is clean for those paths). Locale audio packs/uploads only changed zips.
Use --force to rebuild and republish everything.

Usage (from abc2book):
  npm run publish:everything
  bash scripts/publish-everything.sh [options]

Options:
  --dry-run            Print commands only
  --force              Rebuild/redeploy all targets (ignore change detection)
  --no-android         Skip both Android APK builds
  --no-locale-audio    Skip packing/uploading YogApp locale audio release zips
  --no-resolver        Skip Cloud Run light resolver deploy
  --no-commit          Build only (implies --no-push; also skips locale-audio + resolver)
  --no-push            Commit locally but do not git push (also skips locale-audio + resolver)
  --install            Require a plugged-in phone; fail if none (default: install when present)
  --no-install         Never adb-install, even if a phone is plugged in
  --wait-pages         After push, poll GitHub Pages until built
  -h, --help           Show this help

Env:
  YOGAPP_DIR           Sibling YogApp checkout (default: ../yogapp)
  JAVA_HOME_TB         JDK 17 for Tune Book (default: .tools/jdk-17)
  JAVA_HOME_YOGA       JDK 21 for YogApp (default: ~/.local/opt/jdk-21)
  ANDROID_HOME         Android SDK
  AUDIO_RELEASE_TAG    Locale audio GitHub Release tag (default: audio-v1)
  CLOUD_RUN_ENV_FILE   Cloud Run env yaml (default: local-resolver/deploy/cloud-run-env.yaml)
EOF
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage 0 ;;
    --dry-run) DRY_RUN=1 ;;
    --force) FORCE_ALL=1 ;;
    --no-android) DO_ANDROID=0 ;;
    --no-locale-audio) DO_LOCALE_AUDIO=0 ;;
    --no-resolver) DO_RESOLVER=0 ;;
    --no-push) DO_PUSH=0 ;;
    --no-commit) DO_COMMIT=0; DO_PUSH=0 ;;
    --install) DO_INSTALL=always ;;
    --no-install) DO_INSTALL=never ;;
    --wait-pages) WAIT_PAGES=1 ;;
    *)
      echo "Unknown option: $1" >&2
      usage 1
      ;;
  esac
  shift
done

log() { printf '\n==> %s\n' "$*"; }
die() { echo "publish-everything: $*" >&2; exit 1; }

[[ -d "$YOGAPP" ]] || die "missing YogApp at $YOGAPP (set YOGAPP_DIR)"

# --- toolchains -------------------------------------------------------------

resolve_android_home() {
  if [[ -n "${ANDROID_HOME:-}" && -d "$ANDROID_HOME" ]]; then
    echo "$ANDROID_HOME"
  elif [[ -d "$ROOT/.tools/android-sdk" ]]; then
    echo "$ROOT/.tools/android-sdk"
  elif [[ -d "$HOME/Android/Sdk" ]]; then
    echo "$HOME/Android/Sdk"
  else
    echo ""
  fi
}

resolve_java() {
  # $1 = preferred path
  local pref="$1"
  if [[ -n "$pref" && -x "$pref/bin/java" ]]; then
    echo "$pref"
  elif [[ -n "${JAVA_HOME:-}" && -x "${JAVA_HOME}/bin/java" ]]; then
    echo "$JAVA_HOME"
  else
    echo ""
  fi
}

ANDROID_HOME_RESOLVED="$(resolve_android_home)"
JAVA_TB="$(resolve_java "${JAVA_HOME_TB:-$ROOT/.tools/jdk-17}")"
JAVA_YOGA="$(resolve_java "${JAVA_HOME_YOGA:-$HOME/.local/opt/jdk-21}")"

export ANDROID_HOME="$ANDROID_HOME_RESOLVED"
export PATH="${ANDROID_HOME:+$ANDROID_HOME/platform-tools:}$PATH"

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[dry-run]'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

# True if paths are dirty or differ from upstream...HEAD (no upstream ⇒ true).
paths_need_publish() {
  local repo="$1"
  shift
  [[ $# -gt 0 ]] || return 0
  if git -C "$repo" status --porcelain -- "$@" 2>/dev/null | grep -q .; then
    return 0
  fi
  local upstream
  if ! upstream="$(git -C "$repo" rev-parse --abbrev-ref '@{upstream}' 2>/dev/null)"; then
    return 0
  fi
  git -C "$repo" diff --name-only "$upstream"...HEAD -- "$@" 2>/dev/null | grep -q .
}

list_adb_devices() {
  command -v adb >/dev/null 2>&1 || return 0
  adb devices 2>/dev/null | awk '/\tdevice$/ { print $1 }'
}

adb_has_device() {
  local devices
  devices="$(list_adb_devices)"
  [[ -n "$devices" ]]
}

install_apk_on_devices() {
  local apk="$1"
  local serial
  local any=0
  [[ -f "$apk" || "$DRY_RUN" -eq 1 ]] || die "missing APK: $apk"
  while IFS= read -r serial; do
    [[ -n "$serial" ]] || continue
    any=1
    log "adb install -r on $serial ← $(basename "$apk")"
    run adb -s "$serial" install -r "$apk"
  done < <(list_adb_devices)
  if [[ "$any" -eq 0 ]]; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "[dry-run] adb install -r $apk  # (no device connected right now)"
    else
      die "no adb device connected to install $(basename "$apk")"
    fi
  fi
}

refresh_app_webview_on_devices() {
  local serial pkg
  while IFS= read -r serial; do
    [[ -n "$serial" ]] || continue
    for pkg in net.tunebook.app app.yogapp.practice; do
      run adb -s "$serial" shell am force-stop "$pkg" || true
      # Debug builds: drop WebView/HTTP cache so the new Capacitor assets win.
      if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "[dry-run] adb -s $serial shell run-as $pkg clear webview cache"
      else
        adb -s "$serial" shell "run-as $pkg sh -c 'rm -rf cache/* code_cache/* app_webview/* 2>/dev/null; true'" >/dev/null 2>&1 || true
      fi
    done
  done < <(list_adb_devices)
}

# Re-bundle the web just built for Pages into both APKs, then adb install.
install_android_apps_on_phone() {
  log "Refreshing Capacitor web assets into APKs (phone must match this publish)"
  (
    export JAVA_HOME="$JAVA_YOGA"
    export PATH="$JAVA_HOME/bin:$PATH"
    cd "$YOGAPP"
    run npx cap sync android
    run bash -c 'cd android && ./gradlew assembleDebug'
  )
  (
    export JAVA_HOME="$JAVA_TB"
    export PATH="$JAVA_HOME/bin:$PATH"
    cd "$ROOT"
    # ./build is from the Pages build above; sync without another craco build.
    run npx cap sync android
    if [[ -f "$ROOT/android/keystore.properties" ]]; then
      run bash -c 'cd android && ./gradlew assembleRelease'
    else
      run bash -c 'cd android && ./gradlew assembleDebug'
    fi
  )

  local yoga_apk="$YOGAPP/android/app/build/outputs/apk/debug/app-debug.apk"
  local tb_apk_debug="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
  local tb_apk_release="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
  local tb_apk
  if [[ -f "$tb_apk_release" ]]; then
    tb_apk="$tb_apk_release"
  else
    tb_apk="$tb_apk_debug"
  fi

  install_apk_on_devices "$yoga_apk"
  install_apk_on_devices "$tb_apk"
  refresh_app_webview_on_devices
  log "Phone apps installed (Synthesized Yoga + Tune Book); WebView cache cleared when possible"
}

# Refuse absolute symlinks that break GitHub Pages (tar --dereference / Jekyll).
assert_no_absolute_symlinks() {
  local repo="$1"
  local bad=0
  while IFS= read -r -d '' link; do
    local target
    target="$(readlink "$link" || true)"
    if [[ "$target" == /* ]]; then
      echo "Absolute symlink in $repo: ${link#"$repo"/} -> $target" >&2
      bad=1
    fi
  done < <(find "$repo" -type l \
    -not -path '*/.git/*' \
    -not -path '*/node_modules/*' \
    -not -path '*/.venv/*' \
    -not -path '*/android/.gradle/*' \
    -not -path '*/.tools/*' \
    -print0 2>/dev/null)
  [[ "$bad" -eq 0 ]] || die "remove absolute symlinks before publishing (they break GitHub Pages)"
}

git_dirty() {
  local repo="$1"
  git -C "$repo" status --porcelain | grep -q .
}

commit_repo() {
  local repo="$1"
  local message="$2"
  if ! git_dirty "$repo"; then
    log "$(basename "$repo"): clean working tree — nothing to commit"
    return 0
  fi
  (
    cd "$repo"
    # Stage everything that belongs in the publish, then peel secrets.
    git add -A
    git reset HEAD -- \
      .env .env.local .env.*.local \
      .env.elevenlabs \
      android/keystore.properties \
      dist-audio \
      2>/dev/null || true
    # Locale audio zips ship via GitHub Release (publish:locale-audio), not git.
    if git diff --cached --quiet; then
      log "$(basename "$repo"): nothing staged after excluding secrets"
      return 0
    fi
    git commit -m "$message"
  )
}

push_repo() {
  local repo="$1"
  (
    cd "$repo"
    local branch
    branch="$(git rev-parse --abbrev-ref HEAD)"
    run git push -u origin "$branch"
  )
}

# --- change detection -------------------------------------------------------

# Decide phone install early — it forces Android + web rebuilds.
DO_PHONE_INSTALL=0
if [[ "$DO_ANDROID" -eq 1 ]]; then
  case "$DO_INSTALL" in
    always)
      DO_PHONE_INSTALL=1
      if [[ "$DRY_RUN" -eq 0 ]]; then
        command -v adb >/dev/null || die "adb not on PATH (needed for --install)"
        adb_has_device || die "no adb device connected (--install requires a phone)"
      fi
      ;;
    never)
      log "skip phone install (--no-install)"
      ;;
    auto)
      if adb_has_device; then
        DO_PHONE_INSTALL=1
        log "adb device detected — will install Yoga + Tune Book with latest web"
      else
        log "skip phone install (no adb device; use --install to require one)"
      fi
      ;;
    *)
      die "invalid DO_INSTALL=$DO_INSTALL"
      ;;
  esac
fi

NEED_YOGAPP_ANDROID=0
NEED_TB_ANDROID=0
NEED_WEB=0
NEED_RESOLVER=0

if [[ "$FORCE_ALL" -eq 1 ]]; then
  log "change detection off (--force)"
  NEED_YOGAPP_ANDROID=1
  NEED_TB_ANDROID=1
  NEED_WEB=1
  NEED_RESOLVER=1
else
  if paths_need_publish "$YOGAPP" \
    src public package.json package-lock.json capacitor.config.ts \
    android index.html vite.config.ts tsconfig.json tsconfig.app.json; then
    NEED_YOGAPP_ANDROID=1
    NEED_WEB=1
  fi
  if paths_need_publish "$ROOT" \
    src public package.json package-lock.json craco.config.js capacitor.config.ts \
    android scripts/embed-yogapp.sh scripts/build-android-apk.sh \
    scripts/copy-pdf-worker.js scripts/packageYoutubeHelperExtension.js \
    hackSw.js manifest.template.json; then
    NEED_TB_ANDROID=1
    NEED_WEB=1
  fi
  # Pages embed always rebuilds yogapp web when YogApp sources change.
  if paths_need_publish "$YOGAPP" \
    src public package.json package-lock.json index.html vite.config.ts \
    scripts/build-web.sh; then
    NEED_WEB=1
  fi
  if paths_need_publish "$ROOT" local-resolver \
    ':!local-resolver/.venv-light' \
    ':!local-resolver/data' \
    ':!local-resolver/.env' \
    ':!local-resolver/**/__pycache__' \
    ':!local-resolver/**/*.pyc'; then
    NEED_RESOLVER=1
  fi
fi

if [[ "$DO_PHONE_INSTALL" -eq 1 ]]; then
  NEED_YOGAPP_ANDROID=1
  NEED_TB_ANDROID=1
  NEED_WEB=1
fi

if [[ "$DO_ANDROID" -eq 0 ]]; then
  NEED_YOGAPP_ANDROID=0
  NEED_TB_ANDROID=0
fi
if [[ "$DO_RESOLVER" -eq 0 ]]; then
  NEED_RESOLVER=0
fi

log "Change plan: yogapp-android=$NEED_YOGAPP_ANDROID tb-android=$NEED_TB_ANDROID web=$NEED_WEB resolver=$NEED_RESOLVER phone=$DO_PHONE_INSTALL locale-audio=$DO_LOCALE_AUDIO (smart)"

# JDK only required when we actually build Android.
if [[ "$NEED_YOGAPP_ANDROID" -eq 1 || "$NEED_TB_ANDROID" -eq 1 || "$DO_PHONE_INSTALL" -eq 1 ]]; then
  [[ -n "$ANDROID_HOME_RESOLVED" ]] || die "ANDROID_HOME not found"
  if [[ "$NEED_TB_ANDROID" -eq 1 || "$DO_PHONE_INSTALL" -eq 1 ]]; then
    [[ -n "$JAVA_TB" ]] || die "Tune Book JDK not found (need 17; set JAVA_HOME_TB)"
  fi
  if [[ "$NEED_YOGAPP_ANDROID" -eq 1 || "$DO_PHONE_INSTALL" -eq 1 ]]; then
    [[ -n "$JAVA_YOGA" ]] || die "YogApp JDK not found (need 21; set JAVA_HOME_YOGA)"
  fi
fi

# --- builds -----------------------------------------------------------------

log "1/6 YogApp Android (Capacitor base ./)"
if [[ "$NEED_YOGAPP_ANDROID" -eq 1 ]]; then
  (
    export JAVA_HOME="$JAVA_YOGA"
    export PATH="$JAVA_HOME/bin:$PATH"
    cd "$YOGAPP"
    run npm run cap:sync
    run bash -c 'cd android && ./gradlew assembleDebug'
  )
  YOGA_APK="$YOGAPP/android/app/build/outputs/apk/debug/app-debug.apk"
  [[ "$DRY_RUN" -eq 1 || -f "$YOGA_APK" ]] || die "missing $YOGA_APK"
  log "YogApp APK: $YOGA_APK"
elif [[ "$DO_ANDROID" -eq 0 ]]; then
  log "skip YogApp Android (--no-android)"
else
  log "skip YogApp Android (unchanged)"
fi

log "2/6 Tune Book Android (latest web → Capacitor)"
if [[ "$NEED_TB_ANDROID" -eq 1 ]]; then
  (
    export JAVA_HOME="$JAVA_TB"
    export PATH="$JAVA_HOME/bin:$PATH"
    cd "$ROOT"
    run npm run android:apk
  )
elif [[ "$DO_ANDROID" -eq 0 ]]; then
  log "skip Tune Book Android (--no-android)"
else
  log "skip Tune Book Android (unchanged)"
fi

log "3/6 Web builds — YogApp /yoga/ embed + Tune Book GitHub Pages tree"
if [[ "$NEED_WEB" -eq 1 ]]; then
  (
    cd "$ROOT"
    run npm run build
  )
  [[ "$DRY_RUN" -eq 1 || -f "$ROOT/yoga/index.html" ]] || die "missing $ROOT/yoga/index.html after build"
  [[ "$DRY_RUN" -eq 1 || -f "$ROOT/index.html" ]] || die "missing $ROOT/index.html after build"
else
  log "skip web build (unchanged)"
  if [[ "$DO_PHONE_INSTALL" -eq 1 ]]; then
    die "internal: phone install requires web build"
  fi
fi

if [[ "$DO_PHONE_INSTALL" -eq 1 ]]; then
  install_android_apps_on_phone
fi

# --- hosted Cloud Run resolver ----------------------------------------------

log "4/6 Hosted Cloud Run resolver (tunebook-resolver-light)"
if [[ "$NEED_RESOLVER" -eq 1 && "$DO_PUSH" -eq 1 ]]; then
  [[ -d "$RESOLVER" ]] || die "missing $RESOLVER"
  [[ -f "$RESOLVER/deploy-cloud-light.sh" ]] || die "missing $RESOLVER/deploy-cloud-light.sh"
  ENV_FILE="${CLOUD_RUN_ENV_FILE:-$RESOLVER/deploy/cloud-run-env.yaml}"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] would require gcloud + $ENV_FILE"
    run bash "$RESOLVER/deploy-cloud-light.sh"
  else
    command -v gcloud >/dev/null || die "gcloud not on PATH (needed to deploy hosted resolver)"
    [[ -f "$ENV_FILE" ]] || die "missing $ENV_FILE (copy from cloud-run-env.example.yaml)"
    (
      cd "$RESOLVER"
      bash ./deploy-cloud-light.sh
    )
  fi
elif [[ "$DO_RESOLVER" -eq 0 ]]; then
  log "skip hosted resolver (--no-resolver)"
elif [[ "$DO_PUSH" -eq 0 ]]; then
  log "skip hosted resolver deploy (--no-push / --no-commit)"
else
  log "skip hosted resolver (local-resolver unchanged)"
fi

# --- locale audio release ---------------------------------------------------

log "5/6 YogApp locale audio packs → GitHub Release ${AUDIO_RELEASE_TAG:-audio-v1}"
if [[ "$DO_LOCALE_AUDIO" -eq 1 && "$DO_PUSH" -eq 1 ]]; then
  (
    cd "$YOGAPP"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      if [[ "$FORCE_ALL" -eq 1 ]]; then
        run bash scripts/publish-locale-audio.sh --dry-run --force
      else
        run bash scripts/publish-locale-audio.sh --dry-run
      fi
    else
      [[ -x scripts/publish-locale-audio.sh || -f scripts/publish-locale-audio.sh ]] \
        || die "missing $YOGAPP/scripts/publish-locale-audio.sh"
      if [[ "$FORCE_ALL" -eq 1 ]]; then
        run bash scripts/publish-locale-audio.sh --force
      else
        run bash scripts/publish-locale-audio.sh
      fi
    fi
  )
elif [[ "$DO_LOCALE_AUDIO" -eq 0 ]]; then
  log "skip locale audio (--no-locale-audio)"
else
  log "skip locale audio upload (--no-push / --no-commit)"
fi

# --- git / Pages ------------------------------------------------------------

log "6/6 Commit + push (tunebook.net via GitHub Pages)"
assert_no_absolute_symlinks "$ROOT"
assert_no_absolute_symlinks "$YOGAPP"

MSG_DATE="$(date -u +%Y-%m-%d)"
if [[ "$DO_COMMIT" -eq 1 ]]; then
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] would commit dirty trees in yogapp + abc2book"
  else
    commit_repo "$YOGAPP" "Publish YogApp build (${MSG_DATE})."
    commit_repo "$ROOT" "Publish Tune Book + /yoga/ embed (${MSG_DATE})."
  fi
fi

if [[ "$DO_PUSH" -eq 1 ]]; then
  # Skip push when already up to date with upstream and clean.
  push_if_needed() {
    local repo="$1"
    local branch upstream
    branch="$(git -C "$repo" rev-parse --abbrev-ref HEAD)"
    if upstream="$(git -C "$repo" rev-parse --abbrev-ref '@{upstream}' 2>/dev/null)"; then
      if ! git_dirty "$repo" \
        && [[ "$(git -C "$repo" rev-parse HEAD)" == "$(git -C "$repo" rev-parse "$upstream")" ]]; then
        log "$(basename "$repo"): already pushed ($upstream) — skip"
        return 0
      fi
    fi
    push_repo "$repo"
  }
  push_if_needed "$YOGAPP"
  push_if_needed "$ROOT"
else
  log "skip push (--no-push / --no-commit)"
fi

if [[ "$WAIT_PAGES" -eq 1 && "$DO_PUSH" -eq 1 && "$DRY_RUN" -eq 0 ]]; then
  log "Waiting for GitHub Pages (pages-build-deployment)"
  if command -v gh >/dev/null; then
    for _ in $(seq 1 36); do
      row="$(gh run list --repo syntithenai/abc2book --workflow pages-build-deployment --limit 1 \
        --json status,conclusion,headSha --jq '.[0] | "\(.status) \(.conclusion // "-")"' 2>/dev/null || true)"
      echo "  pages: $row"
      if [[ "$row" == completed\ success* ]]; then
        break
      fi
      if [[ "$row" == completed\ failure* ]] || [[ "$row" == completed\ cancelled* ]]; then
        die "GitHub Pages deploy failed: $row"
      fi
      sleep 15
    done
    curl -sI "https://tunebook.net/yoga/" | head -5 || true
  else
    echo "gh CLI not found — skip Pages wait"
  fi
fi

log "Done."
echo "  YogApp repo:    $YOGAPP"
echo "  Tune Book repo: $ROOT"
echo "  Site:           https://tunebook.net/"
echo "  Yoga:           https://tunebook.net/yoga/"
if [[ "$NEED_RESOLVER" -eq 1 && "$DO_PUSH" -eq 1 ]]; then
  echo "  Hosted resolver: Cloud Run tunebook-resolver-light (via local-resolver/deploy-cloud-light.sh)"
else
  echo "  Hosted resolver: skipped"
fi
if [[ "$DO_LOCALE_AUDIO" -eq 1 && "$DO_PUSH" -eq 1 ]]; then
  echo "  Locale audio:   https://tunebook.net/yoga/audio-packs/v1/ (+ GitHub Release ${AUDIO_RELEASE_TAG:-audio-v1} backup)"
else
  echo "  Locale audio:   skipped"
fi
if [[ "$DO_PHONE_INSTALL" -eq 1 ]]; then
  echo "  Phone install:  Yoga + Tune Book (web assets re-synced into APKs)"
else
  echo "  Phone install:  skipped"
fi
if [[ "$NEED_YOGAPP_ANDROID" -eq 1 && "$DRY_RUN" -eq 0 ]]; then
  echo "  YogApp APK:     $YOGAPP/android/app/build/outputs/apk/debug/app-debug.apk"
fi
if [[ "$NEED_TB_ANDROID" -eq 1 && "$DRY_RUN" -eq 0 ]]; then
  if [[ -f "$ROOT/android/app/build/outputs/apk/release/app-release.apk" ]]; then
    echo "  Tune Book APK:  $ROOT/android/app/build/outputs/apk/release/app-release.apk"
  else
    echo "  Tune Book APK:  $ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
  fi
fi
