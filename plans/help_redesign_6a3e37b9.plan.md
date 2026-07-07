---
name: Help Redesign
overview: Redesign Help into a scannable guide with UI-accurate copy, add missing feature coverage (Docker resolver, media import wizard, automatic detection), and add reusable field-help dialogs for non-obvious form labels. Privacy policy stays untouched.
todos:
  - id: rewrite-help-page
    content: Rewrite `src/pages/HelpPage.js` with new sections (Docker resolver, media import wizard, automatic detection, saved filters, etc.) while preserving `PrivacyContent` and PayPal footer. Exclude recordings, file/image uploads, and review mode.
    status: completed
  - id: add-help-styles
    content: Add scoped Help page styles to `src/App.css` including sticky nav, cards, and advanced-sync accordion.
    status: completed
  - id: form-field-help
    content: Add reusable `FormFieldHelp` component (question-mark → dialog) and wire it to non-obvious form labels across editor, add-tune, links, settings, and media-import flows.
    status: completed
  - id: clean-youtube-copy
    content: Replace old YouTube tab markup with semantic workflow sections using accurate button names and optional screenshots.
    status: completed
  - id: verify-help
    content: Run lint/tests where available; manually review `/help`, `/privacy`, and field-help dialogs for accuracy.
    status: completed
isProject: false
---

# Help Section Redesign Plan

## Scope

- Replace the tabbed Help UI in [`src/pages/HelpPage.js`](src/pages/HelpPage.js) with a single scrollable guide.
- Keep [`src/components/PrivacyContent.js`](src/components/PrivacyContent.js) unchanged.
- Preserve the footer exactly: copyright/email, PayPal **Buy me a beer** donate button, GitHub link, and **Problems or suggestions?** issues button.
- Add scoped styles in [`src/App.css`](src/App.css) (`.help-page`, sticky section nav, cards, `help-advanced` collapsible using Bootstrap `Accordion` or `Collapse`).
- Add inline field help across the app (separate from Help page): reusable question-mark control next to non-obvious labels, reusing the pattern in [`MelodyProcessingPanel.js`](src/components/MelodyProcessingPanel.js).

## Features missing from current help draft (to add)

**User-requested (high priority)**
- **Host your own resolver with Docker** — [`local-resolver/README.md`](local-resolver/README.md): `docker compose up --build`, set `REACT_APP_MEDIA_PROXY_BASE=http://localhost:8787`, optional GPU/dev overlays, YouTube cookies, `/health` check.
- **Automatic lyrics, chords, and melody detection** — resolver `/analyze-media`, `/transcribe`, `/detect-chords`, `/search-lyrics`, `/search-chords`; UI via **Search Lyrics**, **Search Chords**, **Analyze media** in Import from media wizard; stem-aware processing (Demucs, Whisper, autochord).
- **Import from media wizard** — [`MediaImportWizard.js`](src/components/MediaImportWizard.js): steps **Analyze → Metadata → Lyrics → Chords → Notation**; entry via **Import from media** when adding a tune or editor **Wizards** button; stages results before save on Add flow.

**Also worth documenting** (include in help draft)
- **Saved filters** — Books page Filters section; save/load search combinations.
- **Stem separation & audio filters** — media playback **Audio Filters** tab; separate vocals/drums/bass for practice.
- **Import shared books** — curated collections, import link/doc routes.
- **Undo/redo** — editor toolbar history.
- **Timed lyrics alignment** — media import can produce timed lyrics merged with existing lines.
- **Capo chord view** — Capo toggle on chord layout views.
- **Download MIDI** — per-tune export where available.
- **Export YouTube Playlist** — Book Tools → **Export YouTube Playlist** when logged in; up to **20** tunes with YouTube links per book (`MAX_EXPORT_SONGS` in `TuneBookOptionsModal.js`).

**Explicitly exclude from help** (no longer relevant)
- Practice recordings / Recordings Manager
- File uploads (`/files`) and tune **Image** fields
- Review mode (`/review`) and Home page Review links

**Removed from earlier drafts**
- "What this project is for"
- Export YouTube Playlist developer-only gate (now enabled for all logged-in users)

## Form field help (in-app, not Help page)

### Pattern to reuse

[`MelodyProcessingPanel.js`](src/components/MelodyProcessingPanel.js) already uses `icons.question` → Bootstrap `Modal` with titled help paragraphs. Extract to a shared component:

```jsx
// src/components/FormFieldHelp.js (new)
<FormFieldHelp title="Boost" body="Confidence score 0–20. Used for sorting and grouping tunes in lists and playlists." />
// renders: Label text + (?) button opening modal
```

Optional helper: `FormLabelWithHelp({ label, helpTitle, helpBody })` wrapping `Form.Label`.

### Obvious — no (?) needed

Title, Book, Tags, Artist, Lyrics textarea, ABC Notes, Tempo, Key (basic), Time signature (basic), Title/Link in Links editor, Import paste areas, Add tune **Title**/**Book**.

### Non-obvious — add (?) with dialog text

| Location | Field | Help summary |
|---|---|---|
| Editor Info | **Tuning** | Instrument tuning override for ABC playback (e.g. DADGAD); empty uses default. |
| Editor Info | **Transpose** | Semitones added to playback and display transposition (separate from capo). |
| Editor Info | **Capo** | Capo fret number; chord views can show Capo vs transposed chords. |
| Editor Info | **Rhythm** | Tune type (reel, jig, etc.); may auto-set time signature. |
| Editor Info | **Repeats** | How many times generated playback repeats. |
| Editor Info | **Boost** | Confidence 0–20; lower values useful for sorting practice lists. |
| Editor Info | **Difficulty** | Subjective difficulty 0–20 for sorting/filtering. |
| Editor Info | **ABC Note Length** | Default note length in ABC (L: field); affects import/export rhythm. |
| Editor Info | **Tablature** | Show guitar/violin tab under notation. |
| Editor Info | **Sound Fonts** | Online soundfonts vs local piano-only MIDI. |
| Editor Info | **Source URL** | Provenance link for where the tune came from. |
| Editor Info | **Background information** | Markdown notes; shown in Info view mode. |
| Links editor | **Start At / End At** | Practice segment in seconds; saved with link. |
| Chords tab | **Time Signature** | Required before chord scaffold generates bars correctly. |
| Settings | **Resolver URL** | Base URL for local/public resolver; blank = try localhost then public default. |
| Media import Analyze | **Music type** | Vocal vs instrumental stem mix (already has panel-level ? — extend per-field if split). |
| Media import Notation | **Note detection settings** | Already documented in `MelodyProcessingPanel` — ensure notation step reuses same component/help. |
| Bulk edit | **Field to change** | Which tune metadata field bulk-updates apply to. |
| Group/search | **Show preview?** | Show cheatsheet snippet in tune list. |
| Add tune | **ABC Notes** | Optional starter notation; can stay empty and fill later. |
| Playback | **Audio Filters / stems** | Separate mix for practice; requires resolver stem analysis. |

Implementation order: shared component → Editor Info tab (densest) → Settings resolver → Links → Add tune → bulk/group modals.

## UI accuracy audit (fixes applied in proposed copy)

| Old / draft help text | Actual UI in code |
|---|---|
| "Generate Music" for chords | Chords tab button is **Save** (`ChordsWizard.js`) |
| "Listen" in chord wizard | Chords tab uses **Search Chords**; media analysis uses **Import from media** (Wizards modal / Add tune flow) when resolver available |
| "brain icon" for confidence | Tune page confidence button (`BoostSettingsModal`, `icons.reviewsmall`); modal title **Confidence** |
| "red media selection button" | Tune page **Links** button — yellow/warning, link icon + count badge (`LinksEditorModal`) |
| "green Import button on books page" | Header menu **Add** → **Import** tab; buttons **ABC**, **Score**, **YouTube** (login required), plus curated collections |
| "Search and import from thesession.org" | Direct TheSession modal is commented out; editor **search** button imports from bundled ABC index (includes thesession data); external **TheSession.org** link in that modal |
| "Export YouTube Playlist" | Book Tools when logged in; **Export YouTube Playlist**; max **20** links (`MAX_EXPORT_SONGS` in `TuneBookOptionsModal.js`) |
| Merge dialog | Modal title **Update Warning**; buttons **Merge**, **Discard Local Differences**, **Logout**, **Download Tune Book** |
| View background info | View dropdown (**eye** icon): choose **Info** |
| Edit tune | Tune page dropdown → **Edit** (pencil) → `/editor/:id` |
| Playback loops / pitch | Media controls dropdown → **Playback**, **Audio Filters**, **Loop** tabs |
| Chord lookup | Header menu **Chords** → `/chords` |
| Tuner / Metronome | Header menu **Tuner**, **Metronome** |

## Proposed layout

Sticky section nav + hero + quick-start cards, then sections (no tabs):

1. Start here
2. What you can do
3. Add and organise tunes
4. Edit music
5. Practise with media
6. Lyrics, chords, and background
7. Offline use, login, and sync (**basic** + **Advanced sync details** collapsible)
8. Media resolver and self-hosting (Docker)
9. Automatic detection (lyrics, chords, melody)
10. Import from media wizard
11. YouTube and linked media (attach, import playlist, **export playlist**)
12. More useful features (saved filters, shared imports, undo/redo, capo view, MIDI, timed lyrics)
13. ABC notation
14. Chords in detail
15. Confidence tracking
16. Privacy and terms (`<PrivacyContent/>` unchanged)
17. Footer (PayPal + contact)

**Removed from help:** "What this project is for"; recordings; file/image uploads; review mode.

**In-app field help:** non-obvious form labels get a (?) dialog in the UI (see Form field help section); Help page mentions this briefly rather than duplicating every field definition.

## Implementation notes

- Use Bootstrap `Accordion` for **Advanced sync details** under section 7.
- Render login icon inline: `<Button variant="success">{props.tunebook.icons.login}</Button>` where login is mentioned.
- Keep help images for YouTube attach flow where they still match the UI (`helpimages/image3.png` etc.), with alt text.
- Chord stanza blocks: document **blank lines in the Chords tab textarea** (primary) and **double bar lines in ABC** (secondary display tweak).
- Refactor `MelodyProcessingPanel` help modal into shared `FormFieldHelp` / `FormLabelWithHelp`; wire Editor Info tab fields per audit table.
- Link Help section "Host your own resolver" to `local-resolver/README.md` for full Docker/GPU/cookie docs (don't duplicate entire README in Help).

---

## Final proposed help text

### Hero

**ABC Tune Book — Help**

Collect tunes, organise them into books, practise with notation and linked media, and optionally sync your collection through Google Drive.

**Quick links:** Start here · Add tunes · Organise · Practise · Login & sync · Media resolver · Privacy

---

### Start here

**1. Add a tune**
Open the header menu (dropdown next to the Tunes icon) and tap the green **Add** button. Use the **Add** tab to create a tune, or the **Import** tab for **ABC**, **Score** (MusicXML/MXL/MIDI), **YouTube** playlists (login required), or curated collections.

**2. Open and edit**
From the tune list, open a tune. Use the tune menu → **Edit** to open the editor (Music, Info, Lyrics, Chords, ABC tabs). The yellow **Wizards** button in the editor toolbar opens notation fixes and **Import from media** when the resolver is available.

**3. Link media**
On the tune page, tap the yellow **Links** button (link icon with count). Use **Search YouTube** or **New Link** to attach videos or audio files.

**4. Practise**
Use generated playback or linked media. Open the media controls dropdown for **Playback**, **Audio Filters**, and **Loop** settings.

**5. Optional: log in**
Use the green login button in the header to sync your tune book to Google Drive.

---

### What you can do

**Collect tunes**
- Import **ABC** files or pasted ABC text.
- Import **Score** files: MusicXML/MXL offline; MIDI when logged in and the media resolver is available.
- Import **YouTube** playlists when logged in (Add → Import → **YouTube**).
- Import curated tune collections from the Import tab.
- Search the built-in ABC database from the editor toolbar search button (includes tunes from thesession.org and other scraped sources).
- Use **Import from media** (Add tune flow or editor Wizards) to derive lyrics/chords from audio when the resolver is available.

**Edit and improve**
- Edit ABC with live notation and playback.
- **Wizards**: Auto Fix, halve/double note lengths, bar layouts.
- Click tempo mark or key signature in the music view to change tempo or transpose.
- Set tablature in the editor **Info** tab.

**Practise**
- Play generated MIDI or linked media.
- Adjust tempo, pitch, fine tune, and named loops (saved with the tune).
- Header menu: **Tuner**, **Metronome**, **Keyboard**, **Chords** (chord diagram lookup).

**Lyrics, chords, background**
- **Search Lyrics** / **Search Chords** in editor tabs (resolver) with web-search fallback.
- **Research Background** in the Info tab (resolver) or web/Wikipedia search fallback.
- View background text in **Info** view mode (eye dropdown on tune page).

**Organise, print, share**
- Books and tags; filter on the Tunes page; **save filters** on the Books page for one-tap recall.
- Book Tools (dropdown arrow on Books page): Download, Play Media, Play Midi, Cheat Sheet, Print, Share, **Export YouTube Playlist** (logged in, up to 20 linked videos).
- Share tunes/books via **Share on Facebook** or **Share by Email** when logged in.
- Import **shared tune books** from curated collections (Add → Import) or shared import links.

**Offline and sync**
- Works as a PWA after first visit; imported tunes available offline.
- Optional Google login syncs to Google Drive.

---

### Add and organise tunes

Books and tags are the main organisation tools. Each tune can belong to many books and have many tags.

On the **Tunes** page, filter by book, tag, and title.

Select multiple tunes in the list, then use the grey **dropdown** button that appears (**With N selected tunes..**) to add/remove books or tags, bulk-edit fields, or set confidence.

On the **Books** page, use **Collection nav** to jump between **Filters**, Recent, Books, and Tags. Saved filters store your favourite book/tag/search combinations.

**Capo in chord views:** on the tune page, chord layout modes offer a **Capo** toggle to show chords as played with a capo vs fully transposed.

---

### Edit music

From a tune page: tune menu → **Edit**.

Editor tabs:
- **Music** — per-voice note lines
- **Info** — metadata, tablature, **Background information** (with **Research Background** when resolver available)
- **Lyrics** — **Search Lyrics**, Clean, lyrics textarea
- **Chords** — **Search Chords**, Clean Text, Reset, **Save**
- **ABC** — raw ABC and **Errors** sub-tab

Click the tempo mark or key signature in the music view for quick changes without opening the full editor.

Undo/redo arrows are in the editor toolbar.

---

### Practise with media

A tune can use generated playback, linked media, or both.

**Links** (yellow button on tune page): attach YouTube or audio files.

When media is linked, playback controls appear. Open the media dropdown for:
- **Playback** — speed and related settings
- **Audio Filters** — pitch/tempo processing and stem mix (vocals, drums, bass, other) when stems have been analysed
- **Loop** — named practice loops saved with the tune

**Book Tools** on the Books page: **Play Media** or **Play Midi** for a whole book playlist.

---

### Lyrics, chords, and background

**Lyrics tab:** **Search Lyrics** fills the lyrics area when the resolver is available; otherwise use the external search link.

**Chords tab:** type a chord scaffold, use **Search Chords** to fetch chords (and optionally update lyrics), then press **Save** to write chords into the ABC. Chords are not saved until you press **Save**.

**Background:** edit **Background information** in the **Info** tab, or use **Research Background** when the resolver is available. Read it on the tune page via the view dropdown → **Info**.

**Import from media** (Wizards or Add tune): analyse linked/uploaded audio for lyrics and chord suggestions when the resolver is available.

---

### Offline use, login, and sync

#### The basics

ABC Tune Book is a progressive web app.

- After one visit, you can reopen it without Internet.
- Your tune book is stored on your device.
- Imported tunes stay available offline. YouTube playback and online search/import need Internet.
- Mobile browsers may offer **Install app**.

**Google login (optional):** tap the green login button in the header. When logged in, changes sync to a Google Drive document named **ABC Tune Book**.

**Using more than one device:** if this device and Google Drive disagree, an **Update Warning** dialog appears.

> **Important:** Read the dialog before choosing. If you know you (or another device) made real changes elsewhere, **Merge** is usually the right choice — it tries to keep changes on all devices. Only use **Discard Local Differences** if you intentionally want this device to match Google Drive and drop local-only edits. Use **Logout** if you want to ignore the online copy for now.

#### Advanced sync details

<details>
<summary>Advanced sync details (click to expand)</summary>

**What Merge does**
- Uploads local changes and new tunes.
- Downloads changes from Google Drive.
- Removes tunes deleted on another device.

**Update Warning tabs**
- **Inserted**, **Updated**, **Deleted**, **New tunes**, **Local Updates** — review what will happen.
- **Deleted** lists tunes removed elsewhere; this is normal delete sync.
- **Discard Local Differences** keeps you aligned with Google Drive but drops local-only differences.

**Other notes**
- The tune book loads from **ABC Tune Book** in Google Drive, even if that file is in Trash. Rename it in Drive to force creation of a new book.
- Deletes made while logged out only affect this device. Log in before deleting if you want deletes synced.
- While logged in on two devices, changes on one may appear on the other within seconds as an import/update warning.
- Sharing requires login. Shared Google files require recipients to use their own Google account.

**Dialog buttons**
- **Merge** — sync both ways (usual choice when you trust both copies).
- **Discard Local Differences** — replace local data with Google Drive.
- **Logout** — leave without merging.
- **Download Tune Book** — backup before deciding.

</details>

*(Implementation: render the advanced block as a Bootstrap `Accordion` item titled "Advanced sync details".)*

---

### Media resolver

Some features need a **media resolver** because browsers cannot process every audio/video/MIDI source directly.

**Used for**
- MIDI import (convert to ABC)
- Pitch/tempo adjustment and stem separation on linked media
- **Search Lyrics** and **Search Chords** (fetch from supported sites via resolver)
- **Research Background** (web + LLM summary when configured)
- **Import from media** / **Analyze media** — transcribe lyrics, detect chords, extract melody from audio

**Configure in the app**
- **Settings** → **Media resolver / proxy** → **Resolver URL**
- Leave blank to try `http://localhost:8787` first, then shared public resolvers
- **Refresh status** shows which candidates are reachable
- HTTPS app pages cannot call HTTP resolvers (mixed content) — use an `https://` resolver or run both locally

---

### Host your own resolver (Docker)

You can run the resolver on your own machine or server so detection and playback features work without relying on a public proxy.

**Quick start** (from [`local-resolver/README.md`](local-resolver/README.md)):

```bash
cd local-resolver
cp .env.example .env
docker compose up --build
```

Then point the tune book at it — in project `.env`:

```bash
REACT_APP_MEDIA_PROXY_BASE=http://localhost:8787
```

Restart the React app. Verify: `curl -s http://localhost:8787/health`

**What the resolver provides**
- YouTube and HTTPS audio proxying for practice playback
- Lyrics search/transcription (Whisper)
- Chord search from supported tab sites and chord detection from audio (autochord)
- Combined **analyze-media** pass: timing, lyrics, chords, and melody in one job
- Optional tune background research (Wikipedia, MusicBrainz, web search + LLM)

**Tips**
- Export YouTube cookies to `local-resolver/secrets/youtube-cookies.txt` for reliable YouTube access
- GPU overlay available via `docker-compose.gpu.yml` for faster stem separation
- Dev reload: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up`
- Whisper model path and env tuning documented in `local-resolver/README.md`

When the resolver is running and reachable, resolver-backed buttons (**Search Lyrics**, **Import from media**, etc.) appear automatically.

---

### Automatic lyrics, chords, and melody detection

When a media resolver is available, the app can analyse audio instead of typing everything by hand.

**Quick actions on existing tunes**
- **Lyrics** tab → **Search Lyrics** — fetch lyrics from supported sites (resolver); falls back to Google search without resolver
- **Chords** tab → **Search Chords** — fetch chord+lyric sheets from supported sites; optional **Update lyrics** checkbox
- **Info** tab → **Research Background** — auto-generate markdown background notes

**Deep analysis from linked media**
- Editor **Wizards** → **Import from media**, or **Import from media** when adding a tune
- Opens the media import wizard (see next section)
- Resolver runs beat detection, Whisper transcription, chord detection, and melody extraction (with vocal/instrumental stem handling)

**Playback analysis**
- Media controls → **Audio Filters** — stem separation (vocals, drums, bass, other) for practice mixes when stems have been analysed

Treat all automatic results as drafts — review before saving.

---

### Import from media wizard

**Import from media** builds a tune from audio or linked YouTube/files using the resolver.

**How to open**
- **Adding a tune:** Add modal → attach media link or file → **Import from media**
- **Existing tune:** Editor toolbar → yellow **Wizards** → **Import from media**

**Wizard steps** (tabs unlock after analysis completes)

1. **Analyze** — choose **Music type** (vocal vs instrumental), tap **Analyze media**, pick source if several links exist. Runs combined lyrics/chords/melody detection.
2. **Metadata** — confirm title, composer, time signature, key (pre-filled from detection when possible).
3. **Lyrics** — review transcribed vs existing lines; merge choices per line/section (supports **timed lyrics alignment** when timing data is available).
4. **Chords** — edit detected chord scaffold before applying.
5. **Notation** — review transcribed melody ABC; adjust **Note detection settings** (confidence, min note length, quantize, snap to scale) then apply to notation.

**Finish** writes selected fields into the tune. When opened from Add tune, results are **staged** until you press **Add**; from the editor, saving applies immediately.

Analysis can continue in the background if you navigate away — check progress on return.

---

### More useful features

**Saved filters**
- Books page → **Filters** — save common search/book/tag combinations and reopen them from the collection nav.

**Import shared books**
- Add → **Import** tab → curated collections (grouped accordions).
- Open a shared import link from another user to merge a tune book into yours (with the usual import/merge warnings).

**Undo and redo**
- Editor toolbar arrow buttons undo/redo recent edits (keyboard shortcuts supported).

**Download MIDI**
- Where available, export generated playback as a MIDI file for use in other tools.

**Stem separation**
- After media analysis, **Audio Filters** on playback lets you mix vocals, drums, bass, and other stems for practice.

**Tuner, metronome, keyboard, chord lookup**
- Header menu: **Tuner**, **Metronome**, **Keyboard**, **Chords** (diagram reference by instrument and key).

**Clear audio cache**
- Settings → **Clear Audio Cache** if generated playback sounds wrong or stale.

---

### YouTube and linked media

**Attach a YouTube video to a tune**
1. Open the tune from the list.
2. Tap the yellow **Links** button.
3. Tap **Search YouTube**.
4. In results, choose a video (green **Select**).

**Import a YouTube playlist**
1. Log in with Google.
2. Header menu → green **Add** → **Import** tab.
3. Tap **YouTube**.
4. Paste a playlist ID or pick one of your playlists.
5. Tap **Import**. New items become tunes with title + YouTube link.

*(Screenshots from `helpimages/` can illustrate the Links and Import flows.)*

**Export a book to a YouTube playlist**
1. Log in with Google.
2. Go to the **Books** page.
3. Open **Book Tools** (dropdown arrow next to the book).
4. Tap **Export YouTube Playlist**.
5. Creates or updates a YouTube playlist with up to **20** tunes from that book that have YouTube links (first 20 in book order).

Useful for listening in the official YouTube app or on voice-controlled devices. Browser playback still has limits (e.g. screen lock).

**Book Tools for listening**
On the Books page, open Book Tools for **Play Media**, **Play Midi**, **Cheat Sheet**, and **Print**.

---

### ABC notation

ABC uses letters and symbols for music.

Example: `a2bc a/4bc' | c,d,e, cde ||`

- [ABC tutorial](http://www.lesession.co.uk/abc/abc_notation.htm)
- [ABC reference](http://abc.sourceforge.net/standard/abc2-draft.html)

---

### Chords in detail

When chords are in the ABC, playback can include a simple piano accompaniment.

**In ABC directly** — quote chord names in the notes:

`aaaa"C"abcd| "F#m"dcba "Gbdim" ddd||`

**Chords tab (compact format)**

Example:

```
C|F G|G F F C|C . G C
```

Press **Save** to generate ABC notation. Chords are not stored until you **Save**.

**Chord stanza blocks (blank lines)**

In the **Chords** tab textarea, a **blank line** starts a new chord block (stanza). This is the easiest way to group verses or sections:

```
C F G G
Am D G C

C G G C
F C G C
```

The first block and second block stay separate in **Lyrics with Chords** and **Lyrics and Chord Diagrams** view modes.

**Ultimate Guitar / chord-sheet paste**

Paste chord+lyric text from sites like [Ultimate Guitar](https://tabs.ultimate-guitar.com/), delete lyric lines to keep chord lines for the scaffold, then paste lyrics separately in the **Lyrics** tab so words and chords align. One line of chords becomes one bar — rhythm may be approximate but is often enough for harmony practice.

**Double bar lines in ABC (display spacing)**

To add a visible gap in chord/lyrics views after generation, put `||` at the end of a line in the ABC notes:

```
"C"zzz"F"zzz"G"zzz"G"zzz||
"C"zzz"G"zzz"G"zzz"C"zzz|
```

Chord block view then shows a blank line between sections.

**From linked media**

With the resolver available, **Search Chords** or **Import from media** can suggest a scaffold — always review before **Save**.

---

### Confidence tracking

Set **confidence** (0–20) and optional **difficulty** using the confidence button on the tune page (icon with number badge).

Benefits:
- Group or sort by confidence or difficulty in the tune list.
- Playlists can prioritise less confident tunes.

Bulk-set confidence for selected tunes via the selection dropdown on the Tunes page. You can also edit **Boost** and **Difficulty** directly in the editor **Info** tab.

---

### Privacy and terms

`<PrivacyContent/>` — unchanged.

---

### Footer (preserve as-is)

```
(CopyLeft 2022) Steve Ryan syntithenai@gmail.com

[PayPal donate button — "Buy me a beer!"]

Source code on GitHub

[Problems or suggestions ?] → GitHub issues
```

PayPal form from current `HelpPage.js`:

- `action="https://www.paypal.com/donate"`
- `hosted_button_id="RPP5VCZCWSZL4"`
- Rotated donate image, `title="Buy me a beer!"`

---

## Verification

- Walk through help copy against: `AddSongModal`, `LinksEditorModal`, `MergeWarningDialog`, `ChordsWizard`, `BoostSettingsModal`, `ViewModeSelectorModal`, `SettingsPage`, `TuneBookOptionsModal` (export limit 20).
- Confirm help does **not** mention recordings, `/files`, tune images, or review mode.
- Confirm PayPal footer renders and submits.
- Confirm `/privacy` unchanged.
- Mobile: sticky nav wraps; advanced sync accordion expands cleanly.
