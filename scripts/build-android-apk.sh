#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

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
