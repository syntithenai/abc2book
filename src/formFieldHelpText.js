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
  resolverUrl: {
    title: 'Resolver URL',
    body: 'Base URL for the media resolver used for pitch/tempo playback, lyrics and chord search, and Import from media. Leave blank to try localhost first, then shared public resolvers.',
  },
  offlineMedia: {
    title: 'Audio Cache',
    body: 'Caches the full linked recording as MP3 in local storage. When enabled, the current track is cached after playback starts and the next playlist track is prefetched. Playback still applies your saved tempo, pitch, trim, and filters at play time. YouTube caching requires a working media resolver.',
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
