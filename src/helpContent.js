import { Accordion, Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';

export const HELP_NAV = [
  { id: 'start-here', title: 'Start here' },
  { id: 'what-you-can-do', title: 'What you can do' },
  { id: 'organise', title: 'Add and organise' },
  { id: 'edit-music', title: 'Edit music' },
  { id: 'practise', title: 'Practise with media' },
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
        <li>Search the built-in ABC database from the editor toolbar search button (includes tunes from thesession.org and other scraped sources).</li>
        <li>Use <strong>Import from media</strong> (Add tune flow or editor Wizards) to derive lyrics/chords from audio when the resolver is available.</li>
      </ul>
      <h4>Edit and improve</h4>
      <ul>
        <li>Edit ABC with live notation and playback.</li>
        <li><strong>Wizards</strong>: Auto Fix, halve/double note lengths, bar layouts.</li>
        <li>Click tempo mark or key signature in the music view to change tempo or transpose.</li>
        <li>Set tablature in the editor <strong>Info</strong> tab.</li>
      </ul>
      <h4>Practise</h4>
      <ul>
        <li>Play generated MIDI or linked media.</li>
        <li>Adjust tempo, pitch, fine tune, and named loops (saved with the tune).</li>
        <li>Header menu: <strong>Tuner</strong>, <strong>Metronome</strong>, <strong>Keyboard</strong>, <strong>Chords</strong> (chord diagram lookup).</li>
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
      <p>Books, tags, genres, and artists are the main organisation tools. Each tune can belong to many books and have many tags, one genre, and one artist (ABC composer).</p>
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
        <li><strong>Music</strong> — per-voice note lines</li>
        <li><strong>Info</strong> — metadata, tablature, <strong>Background information</strong> (with <strong>Research Background</strong> when resolver available)</li>
        <li><strong>Lyrics</strong> — <strong>Search Lyrics</strong>, Clean, lyrics textarea</li>
        <li><strong>Chords</strong> — <strong>Search Chords</strong>, Clean Text, Reset, <strong>Save</strong></li>
        <li><strong>ABC</strong> — raw ABC and <strong>Errors</strong> sub-tab</li>
      </ul>
      <p>Click the tempo mark or key signature in the music view for quick changes without opening the full editor.</p>
      <p>Undo/redo arrows are in the editor toolbar.</p>
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
    </>
  );
}

export function HelpLyricsChords() {
  return (
    <>
      <p><strong>Lyrics tab:</strong> <strong>Search</strong> fills lyrics from bundled collections and lyrics.ovh (always available); the ↗ button opens Google. With a resolver, Genius and other sites are searched too.</p>
      <p>
        <strong>Chords tab:</strong> type a chord scaffold, use <strong>Search</strong>, then press <strong>Save</strong> to write chords into the ABC. Chords are not saved until you press <strong>Save</strong>.
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
        <li><strong>Metadata</strong> — confirm title, composer, time signature, key (pre-filled from detection when possible).</li>
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
      <p>Configure keys and scroll step size in <Link to="/settings">Settings</Link> → <strong>Foot pedal / page turn</strong>. Pair the pedal in your device Bluetooth settings first.</p>
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
        <li><strong>Tuner, metronome, keyboard, chord lookup</strong> — Header menu: <strong>Tuner</strong>, <strong>Metronome</strong>, <strong>Keyboard</strong>, <strong>Chords</strong>.</li>
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
      <h4>Chords tab (compact format)</h4>
      <pre className="help-code">{`C|F G|G F F C|C . G C`}</pre>
      <p>Press <strong>Save</strong> to generate ABC notation. Chords are not stored until you <strong>Save</strong>.</p>

      <h4>Chord stanza blocks (blank lines)</h4>
      <p>In the <strong>Chords</strong> tab textarea, a <strong>blank line</strong> starts a new chord block (stanza). This is the easiest way to group verses or sections:</p>
      <pre className="help-code">{`C F G G
Am D G C

C G G C
F C G C`}</pre>
      <p>The first block and second block stay separate in <strong>Lyrics with Chords</strong> and <strong>Lyrics and Chord Diagrams</strong> view modes.</p>

      <h4>Ultimate Guitar / chord-sheet paste</h4>
      <p>
        Prefer <strong>Add → Import → Chord sheet</strong> or <strong>Chord URL</strong> for ChordPro files and supported chord sites (Ultimate Guitar, e-chords, WorshipTogether). You can still paste chord+lyric text manually in the editor: from sites like{' '}
        <a href="https://tabs.ultimate-guitar.com/" target="_blank" rel="noreferrer">Ultimate Guitar</a>, delete lyric lines to keep chord lines for the scaffold, then paste lyrics separately in the <strong>Lyrics</strong> tab so words and chords align. One line of chords becomes one bar — rhythm may be approximate but is often enough for harmony practice.
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
      <p>Bulk-set confidence for selected tunes via the selection dropdown on the Tunes page. You can also edit <strong>Boost</strong> and <strong>Difficulty</strong> directly in the editor <strong>Info</strong> tab.</p>
    </>
  );
}

export const HELP_SECTIONS = [
  { id: 'start-here', title: 'Start here', Content: HelpStartHere },
  { id: 'what-you-can-do', title: 'What you can do', Content: HelpWhatYouCanDo },
  { id: 'organise', title: 'Add and organise tunes', Content: HelpOrganise },
  { id: 'edit-music', title: 'Edit music', Content: HelpEditMusic },
  { id: 'practise', title: 'Practise with media', Content: HelpPractise },
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
