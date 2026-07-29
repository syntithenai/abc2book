# Tunebook Android app

## Prerequisites

- Node.js and npm (same as the web app)
- Android SDK (API 34+) — Android Studio, or the portable SDK under `.tools/android-sdk`
- Java 17 — system install, or the portable JDK under `.tools/jdk-17`

`npm run android:apk` auto-uses `.tools/jdk-17` and `.tools/android-sdk` when `JAVA_HOME` / `ANDROID_HOME` are unset.

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

## Google login (stay signed in)

The Android app uses the same **OAuth BFF** flow as the website when a media resolver
with `oauthBff` is reachable. The resolver stores a Google refresh token server-side;
the app keeps a session id and renews silently.

### Resolver requirements

On the host running `local-resolver`, set in `.env`:

```bash
GOOGLE_CLIENT_ID=<same as REACT_APP_GOOGLE_CLIENT_ID in the app build>
GOOGLE_CLIENT_SECRET=<web client secret from Google Cloud Console>
AUTH_SESSION_SECRET=<random 32+ byte secret>
```

Expose the resolver on **HTTPS** that the tablet can reach (not `localhost` on your PC).

### On the tablet

1. By default the app tries **`https://peppertrees.syntithenai.com`**, then the hosted
   Cloud Run resolver — no Settings change required.
2. Optional: **Settings → Providers** → set a custom **Resolver URL** to override.
3. Log in once — consent may ask for offline access the first time

### Google Cloud Console

Add to your OAuth Web client:

- **Authorized redirect URIs:** `https://tunebook-resolver-light-ytrp5enyda-ts.a.run.app/oauth/android-callback`
- **Authorized JavaScript origins:** `https://localhost` (Capacitor WebView)

The cloud resolver must be redeployed so `/oauth/android-callback` exists (serves a page that opens the app via `net.tunebook.app://oauth/callback` — no Chrome/Tunebook picker).

See `local-resolver/GOOGLE_CLOUD_OAUTH_CHECKLIST.md` for the full list.

## Architecture

- **Web UI**: React app in Capacitor WebView (`webDir: build`)
- **YouTube fetch**: `TunebookYoutubePlugin` (Innertube, no browser extension)
- **Background playback**: `TunebookMediaService` (ExoPlayer + foreground service + media notification)

## Play Store note

Downloading YouTube audio may violate YouTube Terms of Service. Sideload distribution avoids Play Store review initially. Evaluate policy before publishing to Google Play.
