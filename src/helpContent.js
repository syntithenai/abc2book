import { Accordion, Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import NotationEditorHelp from './components/NotationEditorHelp';

export const HELP_NAV = [
  { id: 'start-here', title: 'Start here' },
  { id: 'what-you-can-do', title: 'What you can do' },
  { id: 'organise', title: 'Add and organise' },
  { id: 'edit-music', title: 'Edit music' },
  { id: 'notation-editor', title: 'Notation editor' },
  { id: 'practise', title: 'Practise with media' },
  { id: 'tuner', title: 'Tuner' },
  { id: 'lyrics-chords', title: 'Lyrics and chords' },
  { id: 'offline-sync', title: 'Offline and sync' },
  { id: 'media-resolver', title: 'Media resolver' },
  { id: 'automatic-detection', title: 'Automatic detection' },
  { id: 'import-from-media', title: 'Import from media' },
  { id: 'chord-sheet-import', title: 'Chord sheet import and export' },
  { id: 'foot-pedal', title: 'Foot pedal / page turn' },
  { id: 'performance-sets', title: 'Performance sets and Gig Mode' },
  { id: 'more-features', title: 'More features' },
  { id: 'youtube', title: 'YouTube and linked media' },
  { id: 'abc-notation', title: 'ABC notation' },
  { id: 'chords-detail', title: 'Chords in detail' },
  { id: 'confidence', title: 'Confidence tracking' },
  { id: 'privacy', title: 'Privacy' },
];

export function HelpStartHere() {
  return (
    <>
      <ol className="help-steps">
        <li>
          <strong>Add a tune</strong> — Open the header menu (dropdown next to the Tunes icon) and tap the green <strong>Add</strong> button.
          Use the <strong>Add</strong> tab to create a tune, or the <strong>Import</strong> tab for <strong>Select A File</strong> (ABC, MusicXML, chord sheets), <strong>Sheet Image</strong> (photo or scan of a lead sheet), <strong>YouTube</strong> playlists (login required), or curated collections. Use <strong>Search</strong> on the Add tab to look up notation, chords, and lyrics online.
        </li>
        <li>
          <strong>Open and edit</strong> — From the tune list, open a tune. Use the tune menu → <strong>Edit</strong> to open the editor (Music, Info, Lyrics, Chords, ABC tabs).
          The yellow <strong>Wizards</strong> button in the editor toolbar opens notation fixes and <strong>Import from media</strong> when the resolver is available.
        </li>
        <li>
          <strong>Link media</strong> — On the tune page, tap the yellow <strong>Links</strong> button (link icon with count). Use <strong>Search YouTube</strong> or <strong>New Link</strong> to attach videos or audio files.
        </li>
        <li>
          <strong>Practise</strong> — Use generated playback or linked media. Open the media controls dropdown for <strong>Playback</strong>, <strong>Audio Filters</strong>, and <strong>Loop</strong> settings.
        </li>
        <li>
          <strong>Optional: log in</strong> — Use the green login button in the header to sync your tune book to Google Drive.
        </li>
      </ol>
      <p className="help-tip">
        Many form fields have a <strong>(?)</strong> button next to the label — tap it for a short explanation without leaving the page.
      </p>
    </>
  );
}

export function HelpWhatYouCanDo() {
  return (
    <>
      <h4>Collect tunes</h4>
      <ul>
        <li>Import <strong>ABC</strong> files or pasted ABC text.</li>
        <li>Import <strong>Score</strong> files: MusicXML/MXL offline; MIDI when logged in and the media resolver is available.</li>
        <li>Import <strong>YouTube</strong> playlists when logged in (Add → Import → <strong>YouTube</strong>).</li>
        <li>Import curated tune collections from the Import tab.</li>
        <li>Search the built-in ABC database from the editor toolbar search button (includes tunes from thesession.org and other scraped sources). With a media resolver, notation search also queries ABC sites, public MuseScore.com scores, and known MIDI sites in parallel, then lists up to 20 suggestions ranked by title match (MuseScore preferred, MIDI demoted). MIDI conversion is experimental.</li>
        <li>Use <strong>Import from media</strong> (Add tune flow or editor Wizards) to derive lyrics/chords from audio when the resolver is available.</li>
      </ul>
      <h4>Edit and improve</h4>
      <ul>
        <li>Edit ABC with live notation and playback. See <a href="#notation-editor">Notation editor</a> for staff editing, bar lines, and shortcuts.</li>
        <li><strong>Wizards</strong>: Auto Fix, halve/double note lengths, bar layouts.</li>
        <li>Click tempo mark or key signature in the music view to change tempo or transpose.</li>
        <li>Set tablature in the editor <strong>Info</strong> tab.</li>
      </ul>
      <h4>Practise</h4>
      <ul>
        <li>Play generated MIDI or linked media.</li>
        <li>Adjust tempo, pitch, fine tune, and named loops (saved with the tune).</li>
        <li>Header menu: <strong>Tuner</strong>, <strong>Metronome</strong>, <strong>Keyboard</strong>, <strong>Chords</strong> (chord diagram lookup). See <a href="#tuner">Tuner</a> for full tuner help.</li>
      </ul>
      <h4>Lyrics, chords, background</h4>
      <ul>
        <li><strong>Search</strong> (lyrics/chords) in editor tabs — lyrics always searches in-app (local collection + lyrics.ovh). Chords search bundled ABC for embedded chord symbols without a resolver; with a resolver, Ultimate Guitar and similar sites are searched too. ↗ opens web search when you need a site the app cannot reach.</li>
        <li><strong>Research Background</strong> in the Info tab (resolver) or web/Wikipedia search fallback.</li>
        <li>View background text in <strong>Info</strong> view mode (eye dropdown on tune page).</li>
      </ul>
      <h4>Organise, print, share</h4>
      <ul>
        <li>Books and tags; filter on the Tunes page; <strong>save filters</strong> on the Books page for one-tap recall.</li>
        <li>Book Tools (dropdown arrow on Books page): Download, Play Media, Play Midi, Cheat Sheet, Print, Share.</li>
        <li>Share tunes, books, or performance sets when logged in — scan the QR code, copy the link, or email it. Recipients choose what to import (one tune, a book, a set, or the whole tunebook).</li>
        <li>Import <strong>shared tune books</strong> from curated collections (Add → <strong>Bulk</strong> tab) or shared Google import links.</li>
      </ul>
      <h4>Offline and sync</h4>
      <ul>
        <li>Works as a PWA after first visit; imported tunes available offline.</li>
        <li>Optional Google login syncs to Google Drive.</li>
      </ul>
    </>
  );
}

export function HelpOrganise() {
  return (
    <>
      <p>Books, tags, genres, and artists are the main organisation tools. Each tune can belong to many books and have many tags, one genre, a primary composer (<code>C:</code> first line), and optional additional artists (<code>C:</code> extra lines).</p>
      <p>Alternate titles are stored as aliases and round-trip as extra <code>T:</code> lines (legacy <code>N: AKA:</code> lines still import correctly).</p>
      <p>On the <strong>Tunes</strong> page, filter by book, tag, genre, artist, and title.</p>
      <p>
        Select multiple tunes in the list, then use the grey <strong>dropdown</strong> button that appears (<strong>With N selected tunes..</strong>) to add/remove books or tags, bulk-edit fields, or set confidence.
      </p>
      <p>
        On the <strong>Books</strong> page, use <strong>Collection nav</strong> to jump between filters, recent, books, tags, genres, and artists. Saved filters store your favourite book/tag/genre/artist/search combinations.
      </p>
      <p>
        <strong>Capo in chord views:</strong> on the tune page, chord layout modes offer a <strong>Capo</strong> toggle to show chords as played with a capo vs fully transposed.
      </p>
    </>
  );
}

export function HelpEditMusic() {
  return (
    <>
      <p>From a tune page: tune menu → <strong>Edit</strong>.</p>
      <p>Editor tabs:</p>
      <ul>
        <li><strong>Music</strong> — staff notation editor (notes, bar lines, marks). Full guide: <a href="#notation-editor">Notation editor</a>. Use <strong>Search</strong> to find notation from The Session, ABC sites, public MuseScore.com scores, and (ranked lower) MIDI from known sites — up to 20 suggestions. Paste a musescore.com score URL or a direct <code>.mid</code> URL into the search query to import when available.</li>
        <li><strong>Info</strong> — metadata, tablature, <strong>Background information</strong> (with <strong>Research Background</strong> when resolver available)</li>
        <li><strong>Lyrics</strong> — <strong>Search Lyrics</strong>, lyrics textarea</li>
        <li><strong>Chords</strong> — <strong>Search Chords</strong>, Reset, <strong>Save</strong></li>
        <li><strong>ABC</strong> — raw ABC and <strong>Errors</strong> sub-tab</li>
      </ul>
      <p>In the Music tab, open the notation <strong>Help</strong> button for the same guide inside the editor (plus an interactive walkthrough).</p>
      <p>Click the tempo mark or key signature in the music view for quick changes without opening the full editor.</p>
      <p>Undo/redo arrows are in the editor toolbar.</p>
    </>
  );
}

export function HelpNotationEditor() {
  return (
    <>
      <p>
        Open a tune → <strong>Edit</strong> → <strong>Music</strong> to use the staff notation editor.
        The same content is available from the editor <strong>Help</strong> button (with a guided walkthrough).
      </p>
      <NotationEditorHelp />
    </>
  );
}

export function HelpPractise() {
  return (
    <>
      <p>A tune can use generated playback, linked media, or both.</p>
      <p><strong>Links</strong> (yellow button on tune page): attach YouTube or audio files.</p>
      <p>When media is linked, playback controls appear. Open the media dropdown for:</p>
      <ul>
        <li><strong>Playback</strong> — speed and related settings</li>
        <li><strong>Audio Filters</strong> — pitch/tempo processing and stem mix (vocals, drums, bass, other) when stems have been analysed</li>
        <li><strong>Loop</strong> — named practice loops saved with the tune</li>
      </ul>
      <p><strong>Book Tools</strong> on the Books page: <strong>Play Media</strong> or <strong>Play Midi</strong> for a whole book playlist.</p>
      <p><strong>Practice sessions</strong> — open from the header menu <strong>Practice</strong> button or go to <Link to="/practice">Practice</Link>. Configure instrument, duration, and skill level, then run a guided session with warmups and tempo ramps. Use <code>?start=1</code> on the practice URL to begin immediately with saved settings.</p>
      <p><strong>Tuner</strong> — header menu → <strong>Tuner</strong>. See <a href="#tuner">Tuner</a> for instrument presets, string tuning, intonation checks, and advanced controls.</p>
    </>
  );
}

export function HelpTuner() {
  return (
    <>
      <p>Open from the header menu → <strong>Tuner</strong>, or from a tune editor link when tuning is suggested for that tune. The tuner uses your device microphone — tap anywhere on the page the first time to enable it.</p>

      <h4>Instrument and tuning presets</h4>
      <ul>
        <li><strong>Instrument</strong> — choose your instrument (guitar, mandolin, bouzouki, ukulele, etc.) or <strong>Chromatic</strong> to tune to any note without string targets.</li>
        <li><strong>Tuning preset</strong> — when an instrument is selected, pick the tuning (e.g. standard, DADGAD, GDAD). String targets and reference tones use this preset.</li>
        <li>Your last instrument, preset, and advanced settings are remembered on this device.</li>
        <li>When opened from a tune (<code>/tuner?tuneId=…</code>), the app may suggest instrument and tuning from the tune metadata and offer to save the chosen tuning back to the tune.</li>
      </ul>

      <h4>String tuning mode</h4>
      <p>With an instrument selected (not Chromatic):</p>
      <ul>
        <li><strong>String buttons</strong> — one per string, showing the target note. The active string is highlighted; colour shows how close you are (green in tune, amber close, red further off).</li>
        <li><strong>Next string</strong> — move to the next string in the preset.</li>
        <li><strong>Play button</strong> — play or stop a reference tone for the selected string (useful for tuning by ear).</li>
        <li><strong>Wrong-string warning</strong> — if the pitch clearly matches a different string, a dismissible alert suggests which string you may be on.</li>
        <li><strong>Auto next</strong> — when enabled, advances to the next string automatically after you hold the note in tune for about 400&nbsp;ms (plays a short chime).</li>
      </ul>

      <h4>Chromatic mode</h4>
      <p>Select <strong>Chromatic</strong> as the instrument to tune any pitch. The meter shows deviation from the nearest semitone (within ±50¢). String buttons, reference tone, auto-advance, and intonation checks are hidden.</p>

      <h4>Display: needle and graph</h4>
      <ul>
        <li><strong>Needle</strong> — semicircular VU meter with a needle. The scale zooms in as you get closer (±50¢ down to ±3¢). Labels <strong>Flat</strong>, <strong>0</strong>, and <strong>Sharp</strong> mark the scale ends.</li>
        <li><strong>Graph</strong> — scrolling pitch-over-time chart (about 10 seconds), with a green in-tune band at ±5¢.</li>
        <li><strong>Readout</strong> below the meter shows <strong>Target:</strong> note, cents deviation (e.g. <strong>+3 ¢ sharp</strong>, <strong>0 ¢ in tune</strong>), detected frequency in Hz, and <strong>far from target</strong> when more than 50¢ off.</li>
        <li><strong>Stability</strong> — small readout of pitch steadiness (lower is steadier).</li>
        <li><strong>Volume bar</strong> — input level at the bottom of the display panel.</li>
        <li>When the signal drops briefly, the last reading is held and labelled <strong>Last reading</strong>.</li>
      </ul>

      <h4>Check Harmonics (intonation)</h4>
      <p>Enable <strong>Check Harmonics</strong> to verify intonation: tune the open string first, then tap <strong>Next string</strong> to check the 12th-fret harmonic against the open string. The meter compares your harmonic to the expected pitch. Green within ±5¢, amber within ±15¢.</p>

      <h4>Advanced controls</h4>
      <p>Turn on <strong>Advanced</strong> to reveal:</p>
      <ul>
        <li>
          <strong>A<sub>4</sub> reference</strong> — concert pitch (default 440&nbsp;Hz). Change this if your ensemble tunes to A=442 or similar; all target frequencies and cents are recalculated.
        </li>
        <li>
          <strong>Fine</strong> — display zoom only. When you are within about ±8¢ of the target, the needle scale zooms to ±3¢ so you can see small adjustments more clearly. Does not change pitch detection.
        </li>
        <li>
          <strong>Gate</strong> — noise gate / input sensitivity. The tuner only listens when the mic volume is above this threshold.
          <ul>
            <li><strong>Lower gate</strong> — more sensitive; picks up quieter playing but may react to room noise.</li>
            <li><strong>Higher gate</strong> — ignores quiet sounds; raise it if background noise causes false readings.</li>
          </ul>
        </li>
        <li><strong>Microphone</strong> — when several inputs are available, choose which mic to use (shown after the microphone is enabled).</li>
      </ul>
      <div className="help-callout">
        <p><strong>Gate vs Fine:</strong> <strong>Gate</strong> controls <em>whether</em> the tuner listens (input volume threshold). <strong>Fine</strong> controls <em>how</em> the meter is drawn when you are already close to pitch (narrower scale for the last few cents). They solve different problems — use Gate for noisy environments, Fine for precise final tuning.</p>
      </div>

      <p className="help-tip">For best results, tune in a reasonably quiet room, hold the instrument close to the mic, and pluck one string at a time. If readings jump wildly, try raising the gate or switching to the graph view to see pitch over time.</p>
    </>
  );
}

export function HelpLyricsChords() {
  return (
    <>
      <p><strong>Lyrics tab:</strong> <strong>Search</strong> fills lyrics from bundled collections and lyrics.ovh (always available); the ↗ button opens Google. With a resolver, Genius and other sites are searched too.</p>
      <p>
        <strong>Chords tab:</strong> sections come from melody strains in the ABC (titles from lyrics when present).
        Chord grids autosave as you edit (incomplete lines wait until they end with <code>|</code>).
        Use <strong>Record</strong> for a full-screen tapping session. Repeated sections (same type) show only a reuse label — edit the first occurrence.
        Each editable section has its own time signature (first section sets the ABC <code>M:</code> header; later changes become inline <code>[M:]</code>).
        <strong>Hide sections</strong> shows one chord grid (blank lines = breaks) with the same autosave and Record.
        <strong>Paste</strong> (lyrics or chords tab) replaces all existing notation with a scaffold from the paste. On the Chords tab you can optionally tick <strong>Update lyrics too</strong>; from the Lyrics tab, lyrics are always updated.
      </p>
      <p>
        Chord search has two tiers. <strong>Without a resolver</strong>, <strong>Search</strong> looks in bundled ABC collections for tunes whose notation already includes chord symbols (quoted names in the notes, e.g. <code>&quot;Am&quot;</code> <code>&quot;G&quot;</code>) and builds a chord scaffold from those matches. That works offline and needs no extra setup, but only helps when a matching tune in the collection already has chords. <strong>With a resolver</strong>, <strong>Search</strong> can also fetch chord sheets from Ultimate Guitar, e-chords, and similar sites. Use ↗ for manual web search when automatic lookup cannot reach a site or finds nothing.
      </p>
      <p>
        <strong>Background:</strong> edit <strong>Background information</strong> in the <strong>Info</strong> tab, or use <strong>Research Background</strong> when the resolver is available. Read it on the tune page via the view dropdown → <strong>Info</strong>.
      </p>
      <p>
        <strong>Import from media</strong> (Wizards or Add tune): analyse linked/uploaded audio for lyrics and chord suggestions when the resolver is available.
      </p>
    </>
  );
}

export function HelpOfflineSync(props) {
  return (
    <>
      <h4>The basics</h4>
      <p>ABC Tune Book is a progressive web app.</p>
      <ul>
        <li>After one visit, you can reopen it without Internet.</li>
        <li>Your tune book is stored on your device.</li>
        <li>Imported tunes stay available offline. YouTube playback and online search/import need Internet.</li>
        <li>Mobile browsers may offer <strong>Install app</strong>.</li>
      </ul>
      <p>
        <strong>Google login (optional):</strong> tap the green login button in the header{' '}
        {props.loginButton ? props.loginButton : null}. When logged in, changes sync to a Google Drive document named <strong>ABC Tune Book</strong>.
      </p>
      <p>
        <strong>Using more than one device:</strong> if this device and Google Drive disagree, an <strong>Update Warning</strong> dialog appears.
      </p>
      <div className="help-callout">
        <strong>Important:</strong> Read the dialog before choosing. If you know you (or another device) made real changes elsewhere, <strong>Merge</strong> is usually the right choice — it tries to keep changes on all devices. Only use <strong>Discard Local Differences</strong> if you intentionally want this device to match Google Drive and drop local-only edits. Use <strong>Logout</strong> if you want to ignore the online copy for now.
      </div>

      <Accordion className="help-advanced-accordion">
        <Accordion.Item eventKey="0">
          <Accordion.Header>Advanced sync details</Accordion.Header>
          <Accordion.Body>
            <h5>What Merge does</h5>
            <ul>
              <li>Uploads local changes and new tunes.</li>
              <li>Downloads changes from Google Drive.</li>
              <li>Removes tunes deleted on another device.</li>
            </ul>
            <h5>Update Warning tabs</h5>
            <ul>
              <li><strong>Inserted</strong>, <strong>Updated</strong>, <strong>Deleted</strong>, <strong>New tunes</strong>, <strong>Local Updates</strong> — review what will happen.</li>
              <li><strong>Deleted</strong> lists tunes removed elsewhere; this is normal delete sync.</li>
              <li><strong>Discard Local Differences</strong> keeps you aligned with Google Drive but drops local-only differences.</li>
            </ul>
            <h5>Other notes</h5>
            <ul>
              <li>The tune book loads from <strong>ABC Tune Book</strong> in Google Drive, even if that file is in Trash. Rename it in Drive to force creation of a new book.</li>
              <li>Deletes made while logged out only affect this device. Log in before deleting if you want deletes synced.</li>
              <li>While logged in on two devices, changes on one may appear on the other within seconds as an import/update warning.</li>
              <li><strong>Performance sets</strong> (Sets page) sync automatically when logged in. A toast summarizes added, updated, or deleted sets; errors are shown if sync fails.</li>
              <li>Sharing requires login. Shared Google files require recipients to use their own Google account.</li>
            </ul>
            <h5>Dialog buttons</h5>
            <ul>
              <li><strong>Merge</strong> — sync both ways (usual choice when you trust both copies).</li>
              <li><strong>Discard Local Differences</strong> — replace local data with Google Drive.</li>
              <li><strong>Logout</strong> — leave without merging.</li>
              <li><strong>Download Tune Book</strong> — backup before deciding.</li>
            </ul>
          </Accordion.Body>
        </Accordion.Item>
      </Accordion>
    </>
  );
}

export function HelpMediaResolver() {
  return (
    <>
      <p>Some optional features need a <strong>media resolver</strong> because browsers cannot process every audio/video/MIDI source directly.</p>
      <div className="help-callout">
        <p><strong>Optional, not required.</strong> You can use ABC Tune Book without a resolver. Collecting tunes, editing ABC, books and tags, printing, generated playback, and most imports (ABC, MusicXML) work fine on their own.</p>
        <p>When no resolver is available, resolver-only controls are hidden or reduced — <strong>Search</strong> for chords still checks bundled ABC collections for embedded chord symbols; ↗ opens web search for Ultimate Guitar-style sites. <strong>Search</strong> for lyrics still works in-app. Other resolver-only features include <strong>Research Background</strong>, <strong>Import from media</strong>, MIDI import, and advanced pitch/tempo or stem controls on linked media.</p>
      </div>
      <h4>Used for</h4>
      <ul>
        <li>MIDI import (convert to ABC)</li>
        <li>Pitch/tempo adjustment and stem separation on linked media</li>
        <li><strong>Search Lyrics</strong> (extra lyric sites via resolver) and <strong>Search Chords</strong> (Ultimate Guitar, e-chords, and similar — local bundled ABC with embedded chords works without a resolver)</li>
        <li><strong>Research Background</strong> (web + LLM summary when configured)</li>
        <li><strong>Import from media</strong> / <strong>Analyze media</strong> — transcribe lyrics, detect chords, extract melody from audio</li>
      </ul>
      <h4>Configure in the app</h4>
      <ul>
        <li><strong>Settings</strong> → <strong>Media resolver / proxy</strong> → <strong>Resolver URL</strong></li>
        <li>Leave blank to try <code>http://localhost:8787</code> first, then shared public resolvers</li>
        <li><strong>Refresh status</strong> shows which candidates are reachable</li>
        <li>HTTPS app pages cannot call HTTP resolvers (mixed content) — use an <code>https://</code> resolver or run both locally</li>
      </ul>

      <Accordion className="help-advanced-accordion">
        <Accordion.Item eventKey="0">
          <Accordion.Header>Host your own resolver</Accordion.Header>
          <Accordion.Body>
            <HelpDockerResolver />
          </Accordion.Body>
        </Accordion.Item>
      </Accordion>
    </>
  );
}

export function HelpDockerResolver() {
  return (
    <>
      <p>
        You can run the media resolver on your own machine or server. Full setup instructions (Docker, GPU, YouTube cookies, and environment tuning) are in the{' '}
        <a href="https://github.com/syntithenai/abc2book/blob/main/local-resolver/README.md" target="_blank" rel="noreferrer">local-resolver README on GitHub</a>.
      </p>
      <p>
        Once your resolver is running, open <Link to="/settings">Settings</Link> and set the <strong>Resolver URL</strong> to your resolver&apos;s base address (for example <code>http://localhost:8787</code>). Tap <strong>Save resolver</strong> to use it as your preferred resolver.
      </p>
      <p>
        <strong>Settings</strong> also shows which resolvers are reachable, which one is <strong>in use</strong>, and the status of each candidate. Use <strong>Refresh status</strong> after starting or changing a resolver.
      </p>
      <p className="help-tip">
        If you do not set a resolver URL and no local resolver is running, the app falls back to a shared public resolver on the developer&apos;s home computer (via dynamic DNS, currently <code>https://peppertrees.syntithenai.com</code>). That service is offered as a convenience only — its reliability and longevity cannot be guaranteed, and it may be unavailable or withdrawn at any time. If you rely on resolver features, run your own or point Settings at a resolver you control.
      </p>
    </>
  );
}

export function HelpAutomaticDetection() {
  return (
    <>
      <p>When a media resolver is available, the app can analyse audio instead of typing everything by hand. These tools are optional — if no resolver is reachable, they are not shown in the UI.</p>
      <h4>Quick actions on existing tunes</h4>
      <ul>
        <li><strong>Lyrics</strong> tab → <strong>Search</strong> — local collection + lyrics.ovh always; full site scrape when resolver is up; ↗ opens Google</li>
        <li><strong>Chords</strong> tab → <strong>Search</strong> — bundled ABC with embedded chord symbols (always, no resolver); chord-site scrape when resolver is up; ↗ for web search; optional <strong>Update lyrics</strong> checkbox</li>
        <li><strong>Info</strong> tab → <strong>Research Background</strong> — auto-generate markdown background notes</li>
      </ul>
      <h4>Deep analysis from linked media</h4>
      <ul>
        <li>Editor <strong>Wizards</strong> → <strong>Import from media</strong>, or <strong>Import from media</strong> when adding a tune</li>
        <li>Opens the media import wizard (see next section)</li>
        <li>Resolver runs beat detection, Whisper transcription, chord detection, and melody extraction (with vocal/instrumental stem handling)</li>
      </ul>
      <h4>Playback analysis</h4>
      <p>Media controls → <strong>Audio Filters</strong> — stem separation (vocals, drums, bass, other) for practice mixes when stems have been analysed.</p>
      <p className="help-tip">Treat all automatic results as drafts — review before saving.</p>
    </>
  );
}

export function HelpImportFromMedia() {
  return (
    <>
      <p><strong>Import from media</strong> builds a tune from audio or linked YouTube/files using the resolver. This option is only shown when a resolver is available; it is not required for normal tune editing.</p>
      <h4>How to open</h4>
      <ul>
        <li><strong>Adding a tune:</strong> Add modal → attach media link or file → <strong>Import from media</strong></li>
        <li><strong>Existing tune:</strong> Editor toolbar → yellow <strong>Wizards</strong> → <strong>Import from media</strong></li>
      </ul>
      <h4>Wizard steps</h4>
      <ol>
        <li><strong>Analyze</strong> — choose <strong>Music type</strong> (vocal vs instrumental), tap <strong>Analyze media</strong>, pick source if several links exist. Runs combined lyrics/chords/melody detection.</li>
        <li><strong>Metadata</strong> — confirm title, artist, time signature, key (pre-filled from detection when possible).</li>
        <li><strong>Lyrics</strong> — review transcribed vs existing lines; merge choices per line/section (supports <strong>timed lyrics alignment</strong> when timing data is available).</li>
        <li><strong>Chords</strong> — edit detected chord scaffold before applying.</li>
        <li><strong>Notation</strong> — review transcribed melody ABC; adjust <strong>Note detection settings</strong> (confidence, min note length, quantize, snap to scale) then apply to notation.</li>
      </ol>
      <p>
        <strong>Finish</strong> writes selected fields into the tune. When opened from Add tune, results are <strong>staged</strong> until you press <strong>Add</strong>; from the editor, saving applies immediately.
      </p>
      <p>Analysis can continue in the background if you navigate away — check progress on return.</p>
    </>
  );
}

export function HelpChordSheetImport() {
  return (
    <>
      <p>Import chord charts as first-class tunes — lyrics and chords appear in <strong>Lyrics with Chords</strong> view without manual editor paste.</p>
      <h4>ChordPro / OnSong files</h4>
      <ul>
        <li>Add → <strong>Import</strong> → <strong>Chord sheet</strong></li>
        <li>Paste ChordPro/OnSong text or upload <code>.cho</code>, <code>.pro</code>, <code>.crd</code>, <code>.onsong</code>, or <code>.txt</code></li>
      </ul>
      <h4>Chord sites by URL or search</h4>
      <ul>
        <li>Add → <strong>Import</strong> → <strong>Chord URL</strong></li>
        <li>Paste a direct link from Ultimate Guitar, e-chords, WorshipTogether, or similar supported sites</li>
        <li>Search by title/artist, or paste multiple URLs/lines for bulk import (requires a media resolver)</li>
      </ul>
      <h4>Export</h4>
      <p>On a tune page or from bulk Download on the tune list, choose <strong>ChordPro</strong> (<code>.cho</code>) or <strong>OnSong</strong> (<code>.onsong</code>) to download a chart you can re-import later.</p>
      <p className="help-tip">Automatic imports are drafts — review title, sections, and chords before relying on them on stage.</p>
    </>
  );
}

export function HelpFootPedal() {
  return (
    <>
      <p>Bluetooth foot pedals (AirTurn, PageFlip, etc.) act as keyboard keys. Tune Book uses <strong>scroll-then-song</strong> behaviour:</p>
      <ul>
        <li><strong>Scroll down</strong> (default <strong>Page Down</strong>) — scrolls the chart down. At the bottom of the chart, the next press goes to the <strong>next tune</strong> (or next tune in an active performance set).</li>
        <li><strong>Scroll up</strong> (default <strong>Page Up</strong>) — scrolls up. At the top, the next press goes to the <strong>previous tune</strong>.</li>
      </ul>
      <p>Configure keys and scroll step size in <Link to="/settings">Settings</Link> → <strong>Pedal</strong>. Pair the pedal in your device Bluetooth settings first.</p>
      <p>Arrow keys on the tune page still skip directly to the previous/next tune in the list (when not typing in a field).</p>
    </>
  );
}

export function HelpPerformanceSets() {
  return (
    <>
      <p><Link to="/sets">Performance sets</Link> are ordered setlists for gigs — separate from practice sessions or ephemeral media playlists. Open <Link to="/gig">Gig mode</Link> to pick a set for fullscreen playback.</p>
      <ol>
        <li>Open <strong>Sets</strong> from the header menu or footer.</li>
        <li>Create a set, add tunes (and optional notes such as “Tuning break”), drag order with ↑/↓, and save.</li>
        <li>Tap <strong>Play set</strong> for fullscreen <strong>Gig Mode</strong> — large charts, set progress, lyrics-only toggle, quick transpose/capo, and foot-pedal scrolling.</li>
      </ol>
      <p>While a set is active, prev/next navigation (including foot pedals at scroll limits) follows set order and stops at the ends instead of wrapping through your whole tune book.</p>
      <p>When logged in with Google, performance sets sync to your <strong>ABC Tune Book</strong> document in Google Drive (a comment section at the end of the file). Deletes sync via tombstones, like tunes.</p>
    </>
  );
}

export function HelpMoreFeatures() {
  return (
    <>
      <ul>
        <li><strong>Performance sets</strong> — Header menu or footer → <strong>Sets</strong> — build gig setlists and play them in fullscreen Gig Mode (<Link to="/gig">/gig</Link>).</li>
        <li><strong>Foot pedal scrolling</strong> — Settings → <strong>Foot pedal / page turn</strong> — scroll through charts hands-free; see Help → Foot pedal.</li>
        <li><strong>Import shared books</strong> — Add → <strong>Bulk</strong> tab → curated collections. Open a shared import link from another user to merge a tune book into yours.</li>
        <li><strong>File / Drive / Capture / Paste</strong> on the Add tab stage imports through a review queue (identity, match, optional enrich, field merge) instead of blocking the app.</li>
        <li><strong>Bulk import</strong> — paste or load a line list (<code>Title</code>, <code>Title by Artist</code>, or <code>Title | url</code>), then import each tune through the same review queue.</li>
        <li>Google Drive tunebook updates and tunes with a <strong>Source URL</strong> show a non-blocking toast with <strong>Accept</strong> or <strong>Merge</strong> (field-level choices).</li>
        <li><strong>Undo and redo</strong> — Editor toolbar arrow buttons undo/redo recent edits.</li>
        <li><strong>Download MIDI</strong> — Where available, export generated playback as a MIDI file.</li>
        <li><strong>Stem separation</strong> — After media analysis, <strong>Audio Filters</strong> on playback lets you mix vocals, drums, bass, and other stems for practice.</li>
        <li><strong>Tuner, metronome, keyboard, chord lookup</strong> — Header menu: <strong>Tuner</strong>, <strong>Metronome</strong>, <strong>Keyboard</strong>, <strong>Chords</strong>. See <a href="#tuner">Tuner</a> for string tuning, intonation, and advanced controls.</li>
        <li><strong>Clear caches</strong> — Settings: <strong>Clear Audio Cache</strong> (downloaded linked media), <strong>Clear Midi Cache</strong> (ABC/MIDI synth playback), or <strong>Clear Stems</strong> (stem separation for audio filters).</li>
      </ul>
    </>
  );
}

export function HelpYouTube() {
  return (
    <>
      <h4>Attach a YouTube video to a tune</h4>
      <ol>
        <li>Open the tune from the list.</li>
        <li>Tap the yellow <strong>Links</strong> button.</li>
        <li>Tap <strong>Search YouTube</strong>.</li>
        <li>In results, choose a video (green <strong>Select</strong>).</li>
      </ol>
      <figure className="help-figure">
        <img alt="Tune list with a tune title link" src="helpimages/image3.png" />
      </figure>
      <figure className="help-figure">
        <img alt="Tune page with Links button" src="helpimages/image9.png" />
      </figure>
      <figure className="help-figure">
        <img alt="Search YouTube dialog" src="helpimages/image10.png" />
      </figure>
      <figure className="help-figure">
        <img alt="YouTube search results with Select button" src="helpimages/image7.png" />
      </figure>

      <h4>Import a YouTube playlist</h4>
      <ol>
        <li>Log in with Google.</li>
        <li>Header menu → green <strong>Add</strong> → <strong>Import</strong> tab.</li>
        <li>Tap <strong>YouTube</strong>.</li>
        <li>Paste a playlist ID or pick one of your playlists.</li>
        <li>Tap <strong>Import</strong>. New items become tunes with title + YouTube link.</li>
      </ol>
      <figure className="help-figure">
        <img alt="Header menu with Add button" src="helpimages/image5.png" />
      </figure>
      <figure className="help-figure">
        <img alt="Import dialog with options" src="helpimages/image11.png" />
      </figure>
      <figure className="help-figure">
        <img alt="YouTube import button" src="helpimages/image12.png" />
      </figure>
      <figure className="help-figure">
        <img alt="YouTube playlist import dialog" src="helpimages/image8.png" />
      </figure>

      <h4>Book Tools for listening</h4>
      <p>On the Books page, open Book Tools for <strong>Play Media</strong>, <strong>Play Midi</strong>, <strong>Cheat Sheet</strong>, and <strong>Print</strong>.</p>

      <h4>Phone screen-off playback tips</h4>
      <p>If you are playing a YouTube link, screen-off playback is often blocked in mobile browsers by YouTube policy.</p>
      <p>If you are playing a normal audio URL/file, playback should usually continue, but Android/iOS battery management can still suspend the tab.</p>
      <p><strong>Quick things to try on the phone:</strong></p>
      <ul>
        <li>Set battery mode to unrestricted for your browser (Chrome/Safari/Firefox) and disable battery saver/low power mode.</li>
        <li>Keep only one tab with the player open; some phones aggressively freeze background tabs.</li>
        <li>Add the app to home screen and run it as a PWA (often survives better than a normal tab).</li>
      </ul>
    </>
  );
}

export function HelpAbcNotation() {
  return (
    <>
      <p>ABC uses letters and symbols for music.</p>
      <p>Example: <code>a2bc a/4bc&apos; | c,d,e, cde ||</code></p>
      <ul>
        <li><a href="http://www.lesession.co.uk/abc/abc_notation.htm" target="_blank" rel="noreferrer">ABC tutorial</a></li>
        <li><a href="http://abc.sourceforge.net/standard/abc2-draft.html" target="_blank" rel="noreferrer">ABC reference</a></li>
      </ul>
    </>
  );
}

export function HelpChordsDetail() {
  return (
    <>
      <p>When chords are in the ABC, playback can include a simple piano accompaniment.</p>
      <h4>In ABC directly</h4>
      <p>Quote chord names in the notes:</p>
      <pre className="help-code">aaaa&quot;C&quot;abcd| &quot;F#m&quot;dcba &quot;Gbdim&quot; ddd||</pre>
      <p>
        Bundled ABC collections often include tunes notated this way. <strong>Search Chords</strong> can find them by title/artist and turn those embedded symbols into a chord-scaffold draft — no resolver required. If your tune is not in a local collection, or the source ABC has no chord symbols, use a resolver for chord-site lookup or paste from ↗ web search.
      </p>
      <h4>Chords tab (sections)</h4>
      <p>
        The Chords editor lists sections from melody strains (titles from lyrics when present). Chord grids autosave as you edit; incomplete lines wait until they end with <code>|</code>.
        <strong>Record</strong> opens a full-screen dialog. Repeated sections reuse an earlier chart and are not editable here.
        Compact grid format still looks like:
      </p>
      <pre className="help-code">{`C|F G|G F F C|C . G C`}</pre>
      <p>Chords are not stored until you press <strong>Save</strong>.</p>

      <h4>Chord stanza blocks (blank lines)</h4>
      <p>With <strong>Hide sections</strong>, a <strong>blank line</strong> starts a new chord block (stanza). Section time signatures may appear as <code>[M:3/4]</code> at block starts when meters change:</p>
      <pre className="help-code">{`C F G G
Am D G C

[M:3/4] C G G
F C G`}</pre>
      <p>The first block and second block stay separate in <strong>Lyrics with Chords</strong> and <strong>Lyrics and Chord Diagrams</strong> view modes.</p>

      <h4>Ultimate Guitar / chord-sheet paste</h4>
      <p>
        Prefer <strong>Add → Import → Chord sheet</strong> or <strong>Chord URL</strong> for ChordPro files and supported chord sites (Ultimate Guitar, e-chords, WorshipTogether).
        In the editor Lyrics or Chords tab, <strong>Paste</strong> opens a review modal that replaces existing notation with a scaffold from the paste. The Chords tab can optionally update lyrics; the Lyrics tab always updates lyrics.
      </p>

      <h4>Double bar lines in ABC (display spacing)</h4>
      <p>To add a visible gap in chord/lyrics views after generation, put <code>||</code> at the end of a line in the ABC notes:</p>
      <pre className="help-code">{`"C"zzz"F"zzz"G"zzz"G"zzz||
"C"zzz"G"zzz"G"zzz"C"zzz|`}</pre>
      <p>Chord block view then shows a blank line between sections.</p>

      <h4>From linked media</h4>
      <p>With the resolver available, <strong>Search Chords</strong> can fetch chord sheets from supported websites, and <strong>Import from media</strong> can suggest a scaffold from audio — always review before <strong>Save</strong>.</p>
    </>
  );
}

export function HelpConfidence() {
  return (
    <>
      <p>Set <strong>confidence</strong> (0–20) and optional <strong>difficulty</strong> using the confidence button on the tune page (icon with number badge).</p>
      <p>Benefits:</p>
      <ul>
        <li>Group or sort by confidence or difficulty in the tune list.</li>
        <li>Playlists can prioritise less confident tunes.</li>
      </ul>
      <p>Bulk-set confidence for selected tunes via the selection dropdown on the Tunes page. You can also edit <strong>Confidence</strong> and <strong>Difficulty</strong> directly in the editor <strong>Info</strong> tab.</p>
    </>
  );
}

export const HELP_SECTIONS = [
  { id: 'start-here', title: 'Start here', Content: HelpStartHere },
  { id: 'what-you-can-do', title: 'What you can do', Content: HelpWhatYouCanDo },
  { id: 'organise', title: 'Add and organise tunes', Content: HelpOrganise },
  { id: 'edit-music', title: 'Edit music', Content: HelpEditMusic },
  { id: 'notation-editor', title: 'Notation editor', Content: HelpNotationEditor },
  { id: 'practise', title: 'Practise with media', Content: HelpPractise },
  { id: 'tuner', title: 'Tuner', Content: HelpTuner },
  { id: 'lyrics-chords', title: 'Lyrics, chords, and background', Content: HelpLyricsChords },
  { id: 'offline-sync', title: 'Offline use, login, and sync', Content: HelpOfflineSync },
  { id: 'media-resolver', title: 'Media resolver', Content: HelpMediaResolver },
  { id: 'automatic-detection', title: 'Automatic lyrics, chords, and melody detection', Content: HelpAutomaticDetection },
  { id: 'import-from-media', title: 'Import from media wizard', Content: HelpImportFromMedia },
  { id: 'chord-sheet-import', title: 'Chord sheet import and export', Content: HelpChordSheetImport },
  { id: 'foot-pedal', title: 'Foot pedal / page turn', Content: HelpFootPedal },
  { id: 'performance-sets', title: 'Performance sets and Gig Mode', Content: HelpPerformanceSets },
  { id: 'more-features', title: 'More useful features', Content: HelpMoreFeatures },
  { id: 'youtube', title: 'YouTube and linked media', Content: HelpYouTube },
  { id: 'abc-notation', title: 'ABC notation', Content: HelpAbcNotation },
  { id: 'chords-detail', title: 'Chords in detail', Content: HelpChordsDetail },
  { id: 'confidence', title: 'Confidence tracking', Content: HelpConfidence },
];
