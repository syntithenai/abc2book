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
};

export const SEARCH_FIELD_HELP = {
  showPreview: {
    title: 'Show preview',
    body: 'When enabled, the tune list shows a small cheatsheet snippet (first few bars) for each tune.',
  },
};
