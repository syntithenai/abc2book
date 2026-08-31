#!/usr/bin/env bash
# publish-everything.sh — rebuild Tune Book + YogApp (web + Android) and push
# so tunebook.net (and /yoga/) pick up the latest from GitHub Pages.
#
# Usage (from abc2book):
#   npm run publish:everything
#   bash scripts/publish-everything.sh
#   bash scripts/publish-everything.sh --dry-run
#   bash scripts/publish-everything.sh --no-android
#   bash scripts/publish-everything.sh --no-push
#   bash scripts/publish-everything.sh --install   # also adb-install debug APKs
#
# Env:
#   YOGAPP_DIR   Sibling YogApp checkout (default: ../yogapp)
#   JAVA_HOME_TB   JDK for Tune Book Capacitor 6 (default: .tools/jdk-17 or JAVA_HOME)
#   JAVA_HOME_YOGA JDK for YogApp Capacitor 8 (default: ~/.local/opt/jdk-21 or JAVA_HOME)
#   ANDROID_HOME   Android SDK (default: .tools/android-sdk or ~/Android/Sdk)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
YOGAPP="${YOGAPP_DIR:-$ROOT/../yogapp}"

DRY_RUN=0
DO_ANDROID=1
DO_PUSH=1
DO_COMMIT=1
DO_INSTALL=0
WAIT_PAGES=0

usage() {
  cat <<'EOF'
publish-everything — rebuild Tune Book + YogApp (web + Android) and push for tunebook.net

Usage (from abc2book):
  npm run publish:everything
  bash scripts/publish-everything.sh [options]

Options:
  --dry-run       Print commands only
  --no-android    Skip both Android APK builds
  --no-commit     Build only (implies --no-push)
  --no-push       Commit locally but do not git push
  --install       adb install -r both debug/release APKs
  --wait-pages    After push, poll GitHub Pages until built
  -h, --help      Show this help

Env:
  YOGAPP_DIR       Sibling YogApp checkout (default: ../yogapp)
  JAVA_HOME_TB     JDK 17 for Tune Book (default: .tools/jdk-17)
  JAVA_HOME_YOGA   JDK 21 for YogApp (default: ~/.local/opt/jdk-21)
  ANDROID_HOME     Android SDK
EOF
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage 0 ;;
    --dry-run) DRY_RUN=1 ;;
    --no-android) DO_ANDROID=0 ;;
    --no-push) DO_PUSH=0 ;;
    --no-commit) DO_COMMIT=0; DO_PUSH=0 ;;
    --install) DO_INSTALL=1 ;;
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

if [[ "$DO_ANDROID" -eq 1 ]]; then
  [[ -n "$ANDROID_HOME_RESOLVED" ]] || die "ANDROID_HOME not found"
  [[ -n "$JAVA_TB" ]] || die "Tune Book JDK not found (need 17; set JAVA_HOME_TB)"
  [[ -n "$JAVA_YOGA" ]] || die "YogApp JDK not found (need 21; set JAVA_HOME_YOGA)"
fi

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
      android/keystore.properties \
      2>/dev/null || true
    # Locale audio zips are published via `npm run pack:locale-audio` + gh release,
    # not as part of this commit helper’s required path.
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

# --- builds -----------------------------------------------------------------

log "1/4 YogApp Android (Capacitor base ./)"
if [[ "$DO_ANDROID" -eq 1 ]]; then
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
else
  log "skip YogApp Android (--no-android)"
fi

log "2/4 Tune Book Android (latest web → Capacitor)"
if [[ "$DO_ANDROID" -eq 1 ]]; then
  (
    export JAVA_HOME="$JAVA_TB"
    export PATH="$JAVA_HOME/bin:$PATH"
    cd "$ROOT"
    run npm run android:apk
  )
else
  log "skip Tune Book Android (--no-android)"
fi

log "3/4 Web builds — YogApp /yoga/ embed + Tune Book GitHub Pages tree"
# Full abc2book build runs embed-yogapp.sh (build:web) then copies to repo root.
(
  cd "$ROOT"
  run npm run build
)
[[ "$DRY_RUN" -eq 1 || -f "$ROOT/yoga/index.html" ]] || die "missing $ROOT/yoga/index.html after build"
[[ "$DRY_RUN" -eq 1 || -f "$ROOT/index.html" ]] || die "missing $ROOT/index.html after build"

if [[ "$DO_INSTALL" -eq 1 && "$DO_ANDROID" -eq 1 ]]; then
  log "Installing debug APKs on connected device(s)"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] adb install -r yogapp + tunebook debug APKs"
  else
    command -v adb >/dev/null || die "adb not on PATH"
    adb devices | grep -q $'\tdevice$' || die "no adb device connected"
    adb install -r "$YOGAPP/android/app/build/outputs/apk/debug/app-debug.apk"
    TB_APK_DEBUG="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
    TB_APK_RELEASE="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
    if [[ -f "$TB_APK_RELEASE" ]]; then
      adb install -r "$TB_APK_RELEASE"
    else
      adb install -r "$TB_APK_DEBUG"
    fi
  fi
fi

# --- git / Pages ------------------------------------------------------------

log "4/4 Commit + push (tunebook.net via GitHub Pages)"
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
  push_repo "$YOGAPP"
  push_repo "$ROOT"
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
echo "  Locale audio:   npm run pack:locale-audio && gh release upload audio-v1 … (from yogapp)"
if [[ "$DO_ANDROID" -eq 1 && "$DRY_RUN" -eq 0 ]]; then
  echo "  YogApp APK:     $YOGAPP/android/app/build/outputs/apk/debug/app-debug.apk"
  if [[ -f "$ROOT/android/app/build/outputs/apk/release/app-release.apk" ]]; then
    echo "  Tune Book APK:  $ROOT/android/app/build/outputs/apk/release/app-release.apk"
  else
    echo "  Tune Book APK:  $ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
  fi
fi
