import React from 'react'
import { ChromeExtensionsAddress } from './components/FormFieldHelp'

export const EDITOR_INFO_FIELD_HELP = {
  tuning: {
    title: 'Tuning',
    body: 'Tuning that is typically used for this song (for example DADGAD). See the tuner tool for a range of tuning systems.',
  },
  transpose: {
    title: 'Transpose',
    body: 'Semitones added to playback and display transposition. This is separate from capo.',
  },
  capo: {
    title: 'Capo',
    body: 'A form of transposition that can be switched in the UI. Chord views on the tune page can show Capo fingering vs fully transposed chords.',
  },
  rhythm: {
    title: 'Rhythm',
    body: 'Tune type such as reel or jig. Choosing a type may automatically set the time signature.',
  },
  genre: {
    title: 'Genres',
    body: 'One or more musical genres or styles (for example Folk, Jazz, Bluegrass). Each genre is stored as an ABC G: header line. Choose from suggestions or type your own.',
  },
  repeats: {
    title: 'Repeats',
    body: 'How many times generated midi playback repeats the tune.',
  },
  boost: {
    title: 'Confidence',
    body: 'Confidence score from 0 to 20. Used for sorting and grouping tunes in lists and playlists.',
  },
  difficulty: {
    title: 'Difficulty',
    body: 'Subjective difficulty from 0 to 20. Useful for sorting and filtering.',
  },
  noteLength: {
    title: 'ABC Note Length',
    body: 'Default note length in ABC (the L: header). Affects how imported or exported notation is interpreted.',
  },
  tablature: {
    title: 'Tablature',
    body: 'Show tablature for violin, guitar, uke, 4- or 5-string banjo, or bouzouki. Choose which voices get tab and set instrument and tuning per voice. Optionally show tab only instead of notation and tab together. Turn tablature off to show notation alone.',
  },
  soundFonts: {
    title: 'Sound Fonts',
    body: 'Auto uses the full MusyngKite bank from the local resolver when it is ready; otherwise MIDI programs are remapped onto the embedded instrument set. Prefer resolver forces waiting for the full bank when available.',
  },
  srcUrl: {
    title: 'Source URL',
    body: 'Optional link to where this tune or setting came from, for your own reference.',
  },
  backgroundInfo: {
    title: 'Background information',
    body: 'Free-text notes about performers, history, recordings, or sources. Supports Markdown. Shown in Info view mode on the tune page.',
  },
};

export const LINKS_FIELD_HELP = {
  startAt: {
    title: 'Start At',
    body: 'Start time of the song in seconds. Playback automatically jumps to this time when first starting (unless loops are being used). Edit Start and End in the Play Range dialog, or use Scan Range to auto-detect intro/outro speech when the media resolver and Whisper are available. Scan works best for spoken YouTube introductions before the tune; it is less reliable when singing starts immediately or when speech runs under music.',
  },
  endAt: {
    title: 'End At',
    body: 'End time of the song in seconds. Playback automatically stops when the progress goes past this time. Edit in the Play Range dialog.',
  },
};

export const SETTINGS_FIELD_HELP = {
  compressAudio: {
    title: 'Compress Audio',
    body: 'Controls how linked media, MIDI playback, and stems are stored in the browser cache and how audio downloads are packaged. Uncompressed WAV uses more space with no quality loss. MP3 and AAC use much less space. Formats that this browser cannot encode are disabled in Settings.',
  },
  resolverUrl: {
    title: 'Resolver URL',
    body: 'Optional override of resolver base URL for pitch/tempo playback, lyrics transcription, chord discovery and more. When set, this URL is tried first (including OAuth login). Leave blank to try the dev proxy / localhost, then shared public resolvers.',
  },
  resolverInstall: {
    title: 'How to install a resolver',
    fields: [
      {
        title: 'What a resolver does',
        body: 'A resolver is an optional backend for pitch/tempo playback, lyrics transcription, chord discovery, media analysis, MIDI import, and similar tools that browsers cannot do alone. Tunebook works without one for collecting and editing ABC.',
      },
      {
        title: 'Skills required',
        body: 'Self-hosting typically needs comfort with the command line, Docker Compose, editing environment files, and basic networking (localhost vs HTTPS). Optional extras: GPU setup for stem separation, Whisper model downloads, and API keys for LLM providers. Expect a few hours the first time if you are new to Docker.',
      },
      {
        title: 'Install your own',
        body: 'Clone the abc2book repo, run npm run build, then follow local-resolver/README.md (copy .env.example to .env and docker compose up --build). Point Settings → Providers → Resolver URL at your instance (for example http://localhost:8787). Changes to the URL save automatically.',
      },
      {
        title: 'Bring your own keys',
        body: 'On a full home or self-hosted resolver you can configure your own provider keys (LLM, Whisper-related services, and similar) in the resolver environment or Providers settings so usage is billed to you.',
      },
      {
        title: 'Free access for now',
        body: 'If you leave Resolver URL blank, Tunebook tries localhost first, then a shared public resolver on the developer’s home PC. That free access is a convenience only — it may be slow, unavailable, or withdrawn at any time. For reliable use, run your own resolver or bring your own keys on a host you control.',
      },
    ],
  },
  youtubeHelper: {
    title: 'TuneBook Helper extension',
    body: 'Optional Chromium extension that loads audio in your browser so pitch, filters, and caching work without a resolver. Turn off Use TuneBook Helper for media to test without the extension installed — in-flight downloads stop immediately.',
  },
  youtubeHelperInstall: {
    title: 'How to install TuneBook Helper',
    fields: [
      {
        title: '1. Download',
        body: 'Use Download TuneBook Helper on Settings → Media to get tunebook-helper.zip.',
      },
      {
        title: '2. Unzip',
        body: 'Extract the zip. You should get a folder named tunebook-helper (it contains manifest.json).',
      },
      {
        title: '3. Load unpacked in Chrome',
        body: [
          'Open ',
          React.createElement(ChromeExtensionsAddress, { key: 'chrome-extensions' }),
          ', turn on Developer mode, click Load unpacked, and select that folder.',
        ],
      },
      {
        title: '4. Reload Tunebook',
        body: 'Reload this Tunebook tab after install or update so the page bridge can inject.',
      },
      {
        title: '5. Confirm connected',
        body: [
          'Status on Settings → Media should show connected. If it stays disconnected, reload the extension on ',
          React.createElement(ChromeExtensionsAddress, { key: 'chrome-extensions-reload', showHint: false }),
          ', then hard-reload Tunebook again.',
        ],
      },
    ],
  },
  providers: {
    title: 'Providers',
    body: 'Configure LLM, Whisper, OCR, and Stems with your own API keys (including Groq vision for OCR). Keys stay in the browser and are sent only to the active media resolver. Without a key, the resolver from Settings → Providers → Resolver (localhost or peppertrees) is used. Host credentials mean the resolver pays with operator keys for allowlisted accounts.',
  },
  offlineMedia: {
    title: 'Cache',
    body: 'Shows local media cache size and lets you clear audio, MIDI, or stem caches. Cached recordings use the Compress Audio setting. Playback still applies your saved tempo, pitch, trim, and filters at play time.',
  },
  colorScheme: {
    title: 'Color scheme',
    body: 'Choose the app accent color and background. Night uses a dark background with light text to reduce glare in low light.',
  },
  voiceInputMode: {
    title: 'Voice input mode',
    body: 'Tap to speak starts recording on tap and stops when you tap again or after a short pause in speech. Hold to speak records only while you keep the mic button pressed — the original behaviour.',
  },
  speakSongTitles: {
    title: 'Speak song titles',
    body: 'While a playlist is playing, announce each new track title when the queue auto-advances or you press next or previous. The first track when you start a playlist is not announced. Requires a resolver with text-to-speech enabled.',
  },
  speakArtistNames: {
    title: 'Speak artist names',
    body: 'When song titles are spoken, also say the tune composer or artist (for example, "Blue Moon by Rodgers and Hart").',
  },
  undoHistoryDepth: {
    title: 'Undo history depth',
    body: 'How many undo steps to keep per tune on this device. Each step stores full before/after tune snapshots in browser storage, so higher values use more space. Changes apply after you reload the page. Undo history is not synced to Google Drive.',
  },
  backgroundJobs: {
    title: 'Background jobs',
    body: 'View and manage background work from Settings. Red tab badges show incomplete jobs. Automatic jobs (research, media cache, stems, audio generation, playback scans, bulk check) apply results and keep running while you browse unless you cancel them. Review jobs (media analysis, file OCR, import enrichment, field searches) fetch data you still choose how to use — field searches keep running in the background and show Choose buttons on the form when results are ready. Use Cancel for individual jobs, Cancel all for a category, and Clear finished to remove completed and awaiting-review field searches.',
  },
  sources: {
    title: 'Sources',
    body: 'Lists your Google Drive tunebook, shared tunebooks via Google, and static collections from tunebook.net that you subscribe to for ongoing updates. Filters limit which tunes are synced from each source. Pause stops polling; Remove stops sync but keeps imported tunes.',
  },
  duplicateManager: {
    title: 'Duplicate manager',
    body: 'Scans your library for tune records with identical ABC content (exact duplicates) or very similar titles (possible duplicates). Use Compare & merge to pick which fields to keep, or Quick merge for exact duplicates to combine books, tags, links, and sheet snapshots. Use Keep separate when tunes are different versions of the same song — they will stay out of the list until their content changes. Merges save through your normal tunebook sync.',
  },
};

export const CHORDS_FIELD_HELP = {
  meter: {
    title: 'Time Signature',
    body: 'Required before the chord scaffold can generate bars of ABC notation correctly.',
  },
};

export const ADD_TUNE_FIELD_HELP = {
  abcNotes: {
    title: 'ABC Notes',
    body: 'Optional starter notation. You can leave this empty and add music later in the editor.',
  },
};

export const BULK_FIELD_HELP = {
  fieldToChange: {
    title: 'Field to change',
    body: 'Which tune metadata field will be updated for all selected tunes.',
  },
  changesToApply: {
    title: 'Changes to apply',
    body: 'Add one or more field changes. Each selected tune is updated once, with every change applied together. If the same field appears more than once, the last value wins.',
  },
};

export const SEARCH_FIELD_HELP = {
  showPreview: {
    title: 'Show preview',
    body: 'When enabled, the tune list shows a small cheatsheet snippet (first few bars) for each tune.',
  },
};

export const MIDI_CLEANUP_FIELD_HELP = {
  velocityGate: {
    title: 'Velocity gate',
    body: 'Drops notes below this MIDI velocity. Useful for filtering pedal noise, bleed, and weak double-strikes before quantization.',
  },
  minDurationMs: {
    title: 'Min duration (ms)',
    body: 'Removes notes shorter than this length. Trims flams and ghost notes but can remove fast ornaments if set too high.',
  },
  retriggerMergeMs: {
    title: 'Retrigger merge (ms)',
    body: 'Merges same-pitch notes when the gap between the end of one and the start of the next is within this tolerance. Reduces machine-gun retrigger artifacts.',
  },
  swingAmount: {
    title: 'Swing amount',
    body: 'Shifts off-beat eighth notes later (0–50%). Adjusts timing before quantization; this is not the same as swing playback in the editor.',
  },
};
