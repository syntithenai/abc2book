# Tunebook Android app

## Prerequisites

- Node.js and npm (same as the web app)
- Android Studio with Android SDK (API 34+)
- Java 17

## Debug APK (sideload)

```bash
npm run build:android
cd android
./gradlew assembleDebug
```

Install the APK from `android/app/build/outputs/apk/debug/app-debug.apk`.

## Release APK

1. Create a signing keystore (once):

```bash
keytool -genkey -v -keystore tunebook-release.keystore -alias tunebook -keyalg RSA -keysize 2048 -validity 10000
```

2. Copy `android/keystore.properties.example` to `android/keystore.properties` and fill in paths/passwords.

3. Build:

```bash
npm run build:android
cd android
./gradlew assembleRelease
```

Release APK: `android/app/build/outputs/apk/release/app-release.apk`

## Architecture

- **Web UI**: React app in Capacitor WebView (`webDir: build`)
- **YouTube fetch**: `TunebookYoutubePlugin` (Innertube, no browser extension)
- **Background playback**: `TunebookMediaService` (ExoPlayer + foreground service + media notification)

## Play Store note

Downloading YouTube audio may violate YouTube Terms of Service. Sideload distribution avoids Play Store review initially. Evaluate policy before publishing to Google Play.
