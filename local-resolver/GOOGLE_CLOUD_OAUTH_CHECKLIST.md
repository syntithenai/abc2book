# Google Cloud Console checklist — Seamless Google login (OAuth BFF)

Do this once for the shared OAuth Web client used by the SPA (`REACT_APP_GOOGLE_CLIENT_ID`)
and by resolvers that advertise `oauthBff`.

## Authorized JavaScript origins

Register SPA origins only (not resolver API hosts, unless the SPA is served from them):

- `https://tunebook.net`
- `http://localhost:3000`
- `http://127.0.0.1:3000`
- `https://localhost` (if you open the static site via local HTTPS)
- Resolver static-site origin only if users load the app from there

## Authorized redirect URIs

GIS Code Client popup mode uses the **page origin** as `redirect_uri`. Register the same SPA origins:

- `https://tunebook.net`
- `http://localhost:3000`
- `http://127.0.0.1:3000`
- `https://localhost` (Capacitor WebView origin only — **do not** use as Android OAuth redirect)
- `https://tunebook-resolver-light-ytrp5enyda-ts.a.run.app/oauth/android-callback` (**required for Android APK**)

Do **not** add resolver paths like `https://peppertrees.syntithenai.com/auth/callback` unless you switch to redirect UX.

## Resolver `.env` (trusted oauthBff hosts only)

```bash
GOOGLE_CLIENT_ID=<same as SPA>
GOOGLE_CLIENT_SECRET=<web client secret — never in the SPA>
AUTH_SESSION_SECRET=<random 32+ bytes>
# optional:
# AUTH_SESSION_DB_PATH=./data/oauth_sessions.sqlite
# AUTH_REFRESH_TOKEN_FERNET_KEY=<fernet key>
```

Public resolvers may omit `GOOGLE_CLIENT_SECRET` / `AUTH_SESSION_SECRET`. Then `oauthBff` stays false and the SPA keeps today’s Token Client login (including the hourly popup).

## First login after enabling BFF

Users may need one consent (`prompt=consent`, `access_type=offline`) so Google returns a `refresh_token`. Login requests **openid / email / profile / drive.file** in one screen (`include_granted_scopes` is **off** so old sensitive grants are not pulled in). Later renewals are silent via `POST /auth/google/refresh`.

If you see **“Google hasn’t verified this app”**:

Google tracks **two different things**:

| Status | What it means |
|--------|----------------|
| **Branding verified** | App name, logo, domain, privacy links — shown correctly on the consent screen. **You have this.** |
| **App / scope verification** | Google approved your app to request **sensitive** or **restricted** scopes in **Production** without the danger interstitial. Separate review. |
| **Publishing status** | **Testing** = warning UI for most users, 100-user cap. **In production** = any Google user may sign in (subject to scope rules). |

`drive.file` is **non-sensitive**. Login should **not** require scope verification or test users **if all** of the following are true:

1. **Publishing status** is **In production** (not Testing).
2. Login only requests scopes you listed — our code requests: `openid`, `email`, `profile`, `drive.file` (no `drive.readonly` at login).
3. No **sensitive** scope is being requested at login (check OAuth consent screen → **Data access** — remove unused sensitive scopes like `drive.readonly` if you do not want them on the app at all, or accept that picker import triggers a separate consent later).

**If branding is verified but you still see the danger screen**, check Console → **Google Auth Platform** (or APIs & Services → **OAuth consent screen**):

1. **Audience** — is it **In production** or still **Testing**? Testing alone can show a scary screen even with verified branding.
2. **Verification centre** — is there a separate **App verification** or **Scopes** item still **Pending**?
3. **Data access (Scopes)** — see explanation below; look for any **Sensitive** or **Restricted** row that might be requested before approval.

**Tunebook not on [myaccount.google.com/permissions](https://myaccount.google.com/permissions):**

That usually means **login never finished** — you closed the popup at the warning, or did not click **Advanced → Continue**. Until consent completes, Google does not list the app. Search for **“ABC Tune Book”** (OAuth display name), not “Tunebook”. Use the same Google account as in the browser.

Also check you are using the same OAuth client as production (`REACT_APP_GOOGLE_CLIENT_ID` in the build matches Console → **Clients**).

**Revoke + retry after code fix:**

1. Hard refresh the dev server (`npm start`).
2. Log in again; use **Advanced → Go to ABC Tune Book** if any banner remains.
3. After success, the app should appear on the permissions page.

## Console → Data access (Scopes)

This is the list of OAuth scopes your **project is allowed to request**. It is not the same as “what login asks for today” — the SPA chooses scopes in code; Console must include them or Google blocks the request.

| Column / concept | Meaning |
|------------------|---------|
| **Scope** | API permission string (e.g. `…/auth/drive.file`). |
| **User-facing description** | Text users see on the consent screen. |
| **Non-sensitive** | `openid`, `email`, `profile`, `drive.file` — can use in Production without scope verification (brand + publishing rules still apply). |
| **Sensitive** | e.g. `drive.readonly` — triggers **App verification** in Production; until approved, users see “Google hasn’t verified this app”. |
| **Restricted** | e.g. full `drive` — verification + often a security audit. |

**What Tunebook uses:**

| Scope | When | Console sensitivity |
|-------|------|---------------------|
| `openid`, `email`, `profile` | Login | Non-sensitive |
| `drive.file` | Login (sync app-created files) | Non-sensitive |
| `drive.readonly` | Only when you open **Import from Drive** picker | Sensitive — not at login |
| Photos picker scope | Only when you use Google Photos import | See Console classification |
| `drive.file` | YogApp (`/yoga/`) sync JSON in a Drive **YogApp** folder | Non-sensitive — same as Tunebook login |

**If Yoga still shows “Google hasn’t verified this app” after switching to
`drive.file`:** GIS defaults to `include_granted_scopes=true`, which re-attaches
old grants such as `drive.appdata` / `drive.readonly`. YogApp now sets
`include_granted_scopes: false`. Also:

1. Google Auth Platform → **Data access**: remove unused sensitive scopes
   (`drive.appdata`, and `drive.readonly` if you do not need Import-from-Drive
   verification pending).
2. Revoke the app at [Google Account → Third-party access](https://myaccount.google.com/permissions),
   then sign in again (hard refresh `/yoga/`).

## YogApp at tunebook.net/yoga (shared login)

YogApp is embedded under `https://tunebook.net/yoga/` and shares the **same Web
client** + `localStorage` key `tunebook_google_auth_v1` with Tune Book.

Do this once in **this** Cloud project (the one owning Web client
`927667106833-…`):

1. **Data access**: ensure `https://www.googleapis.com/auth/drive.file` is
   listed (YogApp no longer needs `drive.appdata`).
2. **Origins**: `https://tunebook.net` is enough for the embedded SPA (path is
   irrelevant). Also keep `http://localhost:5173` for YogApp Vite if you develop
   there.
3. **Privacy policy** (optional): `https://tunebook.net/yoga/#/privacy`.
4. **Android OAuth client** (same project — Capgo requires Web + Android together):
   - Type: Android
   - Package: `app.yogapp.practice`
   - SHA-1 (YogApp debug keystore): `90:9A:B1:B9:0E:66:33:43:7A:B1:A4:A8:BB:7E:70:4F:5D:80:C3:F5`
   - Client ID (Console only — do **not** put in `.env`):
     `927667106833-08id74ih0vk81vr8cmrbic6bokliklm7.apps.googleusercontent.com`
   - App code keeps using the **Web** client as `VITE_GOOGLE_CLIENT_ID` /
     Capgo `webClientId`.
5. Retire or ignore the old YogApp-only Web client `905561…`.

YogApp uses the same `drive.file` scope as Tune Book, so a Tunebook session on
tunebook.net can usually satisfy YogApp without an extra Drive consent.

**Practical rule:** Keep on the consent screen only scopes you actually use. If `drive.readonly` is listed as **Sensitive** and something requests it at login, Google shows the unverified screen even when `drive.file` is approved.

**Add/remove scopes:** Google Auth Platform → **Data access** → Add or remove scopes → Save. Adding sensitive scopes may require **Submit for verification** before Production users see a clean consent screen.

Also check **Authorized JavaScript origins / redirect URIs** — include both `https://tunebook.net` and `https://www.tunebook.net` if users may open either host.
