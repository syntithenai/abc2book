#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Portable JDK/SDK under .tools/ when JAVA_HOME/ANDROID_HOME are unset.
if [[ -z "${JAVA_HOME:-}" && -x "$ROOT/.tools/jdk-17/bin/java" ]]; then
  export JAVA_HOME="$ROOT/.tools/jdk-17"
  export PATH="$JAVA_HOME/bin:$PATH"
fi
if [[ -z "${ANDROID_HOME:-}" && -d "$ROOT/.tools/android-sdk" ]]; then
  export ANDROID_HOME="$ROOT/.tools/android-sdk"
  export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
fi

ROOT_OWNED_PATHS=(
  "$ROOT/android/app/build"
  "$ROOT/android/capacitor-cordova-android-plugins/build"
  "$ROOT/node_modules/@capacitor/android/capacitor/build"
  "$ROOT/node_modules/@capacitor/app/android/build"
  "$ROOT/node_modules/@capacitor/browser/android/build"
  "$ROOT/node_modules/@capacitor/camera/android/build"
  "$ROOT/node_modules/@capacitor/filesystem/android/build"
  "$ROOT/node_modules/@capacitor/share/android/build"
)

for path in "${ROOT_OWNED_PATHS[@]}"; do
  if find "$path" -user root -print -quit 2>/dev/null | grep -q .; then
    echo "ERROR: Build output is owned by root (likely from an earlier sudo/docker build):" >&2
    echo "  $path" >&2
    echo "Fix with:" >&2
    echo "  sudo chown -R \"\$(whoami)\" android/app/build android/capacitor-cordova-android-plugins/build node_modules/@capacitor" >&2
    echo "Or remove them:" >&2
    echo "  sudo rm -rf android/app/build android/capacitor-cordova-android-plugins/build node_modules/@capacitor/*/android/build node_modules/@capacitor/android/capacitor/build" >&2
    exit 1
  fi
done

npm run build:android

cd android

if [[ -f keystore.properties ]]; then
  echo "Building signed release APK..."
  ./gradlew assembleRelease
  echo "Release APK: android/app/build/outputs/apk/release/app-release.apk"
else
  echo "No keystore.properties found — building debug APK"
  ./gradlew assembleDebug
  echo "Debug APK: android/app/build/outputs/apk/debug/app-debug.apk"
fi
