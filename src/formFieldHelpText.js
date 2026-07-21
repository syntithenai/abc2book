import React from 'react'

function chromeExtensionsLink() {
  return React.createElement(
    'a',
    { href: 'chrome://extensions', target: '_blank', rel: 'noreferrer' },
    'chrome://extensions'
  )
}

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
    title: 'Genre',
    body: 'Musical genre or style (for example Folk, Jazz, Bluegrass). Stored in the ABC G: header. Choose from suggestions or type your own.',
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
  suitableFor: {
    title: 'Suitable for',
    body: 'Instruments this tune is appropriate for when choosing practice sessions. Leave blank to include the tune for any instrument.',
  },
  suitableForPractice: {
    title: 'Suitable for practice',
    body: 'When unchecked, this tune is excluded from practice sessions. Use Block tune in practice mode to turn this off for the current tune.',
  },
  noteLength: {
    title: 'ABC Note Length',
    body: 'Default note length in ABC (the L: header). Affects how imported or exported notation is interpreted.',
  },
  tablature: {
    title: 'Tablature',
    body: 'Show tablature under the music notation for violin/fiddle, mandolin, guitar, uke, 4- or 5-string banjo, or bouzouki. Uses the tune Tuning field when it matches a preset; otherwise the instrument default tuning applies. Re-entrant tunings (uke high G, 5-string banjo drone) may map notes to unexpected strings.',
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
    body: 'Optional override of resolver base URL for pitch/tempo playback, lyrics transcription, chord discovery and more. Leave blank to try localhost first, then shared public resolvers.',
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
    body: 'Optional Chromium extension that loads audio in your browser so pitch, filters, and caching work without a resolver.',
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
          chromeExtensionsLink(),
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
          chromeExtensionsLink(),
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
  backgroundJobs: {
    title: 'Background jobs',
    body: 'View and manage background work from Settings. Red tab badges show incomplete jobs. Automatic jobs (research, media cache, stems, playback scans, bulk check) apply results and keep running while you browse unless you cancel them. Review jobs (media analysis, file OCR, import enrichment, field searches) fetch data you still choose how to use — field searches keep running in the background and show Choose buttons on the form when results are ready. Use Cancel for individual jobs, Cancel all for a category, and Clear finished to remove completed and awaiting-review field searches.',
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
