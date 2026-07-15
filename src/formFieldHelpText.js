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
    title: 'Boost',
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
    body: 'Show guitar or violin tablature under the music notation.',
  },
  soundFonts: {
    title: 'Sound Fonts',
    body: 'Online soundfonts use richer instruments but need Internet. Local mode uses piano-only MIDI playback.',
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
    body: 'Start time of the song in seconds. Playback automatically jumps to this time when first starting (unless loops are being used). When the media resolver and Whisper are available, use Scan beside this field to auto-detect intro/outro speech and set Start At and End At without confirmation. Scan works best for spoken YouTube introductions before the tune; it is less reliable when singing starts immediately or when speech runs under music.',
  },
  endAt: {
    title: 'End At',
    body: 'End time of the song in seconds. Playback automatically stops when the progress goes past this time.',
  },
};

export const SETTINGS_FIELD_HELP = {
  compressAudio: {
    title: 'Compress Audio',
    body: 'Controls how linked media, MIDI playback, and stems are stored in the browser cache and how audio downloads are packaged. Uncompressed WAV uses more space with no quality loss. MP3 and AAC use much less space. Formats that this browser cannot encode are disabled in Settings. New cache writes and downloads use this setting immediately; clear Audio, MIDI, or stems caches to recompress existing entries.',
  },
  resolverUrl: {
    title: 'Resolver URL',
    body: 'Base URL for the media resolver used for pitch/tempo playback, lyrics and chord search, and Import from media. Leave blank to try localhost first, then shared public resolvers.',
  },
  youtubeHelper: {
    title: 'YouTube Helper extension',
    body: 'A Chromium extension that fetches YouTube audio in your browser (your network, your session). When connected, Tunebook can pitch-shift, filter, and cache YouTube links without sending that media through a cloud resolver.',
  },
  youtubeHelperInstall: {
    title: 'How to install YouTube Helper',
    fields: [
      {
        title: '1. Download',
        body: 'Use Download YouTube Helper on Settings → Media to get tunebook-youtube-helper.zip.',
      },
      {
        title: '2. Unzip',
        body: 'Extract the zip. You should get a folder named tunebook-youtube-helper (it contains manifest.json).',
      },
      {
        title: '3. Load unpacked in Chrome',
        body: 'Open chrome://extensions, turn on Developer mode, click Load unpacked, and select that folder.',
      },
      {
        title: '4. Reload Tunebook',
        body: 'Reload this Tunebook tab after install or update so the page bridge can inject.',
      },
      {
        title: '5. Confirm connected',
        body: 'Status on Settings → Media should show connected. In DevTools → Elements, <html> should have data-tunebook-yt-helper. If it stays disconnected, reload the extension on chrome://extensions, then hard-reload Tunebook again.',
      },
    ],
  },
  offlineMedia: {
    title: 'Audio Cache',
    body: 'Caches the full linked recording using the Compress Audio setting. When enabled, the current track is cached after playback starts and the next playlist track is prefetched. Playback still applies your saved tempo, pitch, trim, and filters at play time. YouTube caching needs the YouTube Helper extension or a working media resolver.',
  },
  colorScheme: {
    title: 'Color scheme',
    body: 'Choose the app accent color and background. Night uses a dark background with light text to reduce glare in low light.',
  },
  backgroundJobs: {
    title: 'Background jobs',
    body: 'View and manage background work from Settings. Red tab badges show incomplete jobs. Automatic jobs (research, media cache, stems, playback scans, bulk check) apply results and keep running while you browse unless you cancel them. Review jobs (media analysis, import enrichment, field searches) fetch data you still choose how to use — field searches keep running in the background and show Choose buttons on the form when results are ready. Use Cancel for individual jobs, Cancel all for a category, and Clear finished to remove completed entries.',
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
