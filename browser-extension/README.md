# Tunebook YouTube Helper (browser extension)

Fetches YouTube audio **in your browser** (your ISP IP + session) so Tunebook can pitch-shift, filter, and cache linked videos without a cloud YouTube proxy or Webshare account.

## Install (preferred)

1. In Tunebook, open **Settings → Media**
2. Click **Download YouTube Helper** (serves `tunebook-youtube-helper.zip`)
3. Unzip → folder `tunebook-youtube-helper`
4. Chrome → `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select that folder
5. **Reload the Tunebook tab**
6. Status should show **YouTube Helper: connected**

Use **How to install** on the same Settings panel for the full checklist (including the `data-tunebook-yt-helper` DevTools check).

Regenerate the zip after editing this folder: `npm run package:youtube-helper` (also runs automatically before `npm run build`).

## Install (from this repo — contributors)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this `browser-extension` folder (the folder that contains `manifest.json`)
4. Open Tunebook (`http://localhost:3000` or https://tunebook.net)
5. **Reload that Tunebook tab** (required after install/update)
6. Settings → Media → **YouTube Helper: connected**

If status stays “not connected”:

- Confirm the extension is enabled and has no errors (chrome://extensions → Details → Errors)
- Confirm you reloaded the Tunebook tab after loading the extension
- Click the extension’s **Reload** button on chrome://extensions, then reload Tunebook again
- Check the page has `data-tunebook-yt-helper` on `<html>` (DevTools → Elements)

## What it does

- Content script bridges the Tunebook page ↔ extension service worker
- Service worker calls YouTube Innertube (Android VR / iOS / Android clients) for a progressive audio URL
- Audio bytes are streamed back to the page in chunks and decoded with Tunebook’s existing pipeline

Audio and cookies stay in your browser; they are not uploaded to Tunebook servers.

## Limitations

- Chromium-first (Chrome / Edge / Brave). Firefox later.
- YouTube may change Innertube responses; if fetch fails, Tunebook falls back to the media resolver (yt-dlp). Use Webshare or non-YouTube audio when both paths fail.
- After updating the extension files, click **Reload** on `chrome://extensions`, then reload the Tunebook tab.
- Chrome Web Store listing is optional later; unpacked/sideload is the supported path for now.

## Permissions

- `youtube.com` / `googlevideo.com` — resolve and download audio streams
- Content scripts on tunebook.net and local dev origins only
