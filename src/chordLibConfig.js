export const CHORD_LETTERS = ['Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#']

export const CHORD_LETTER_MAP = { 'C#': 'Db', 'G#': 'Ab', 'D#': 'Eb', 'A#': 'Bb', 'Gb': 'F#' }

export const CHORD_LETTER_MAP_COMPLETE = {
  'F#': 'Gb', 'C#': 'Db', 'G#': 'Ab', 'D#': 'Eb', 'A#': 'Bb',
  'Bb': 'A#', 'Eb': 'D#', 'Ab': 'G#', 'Db': 'C#', 'Gb': 'F#'
}

export const INSTRUMENTS = ['guitar', 'mandolin', 'uke', 'banjo4', 'banjo5']

export const INSTRUMENT_LABELS = {
  guitar: 'Guitar',
  mandolin: 'Mandolin',
  uke: 'Uke',
  banjo4: '4-string banjo',
  banjo5: '5-string banjo'
}

/** Tuning notes low string first (string 4/5 → string 1). */
export const INSTRUMENT_TUNINGS = {
  guitar: ['E', 'A', 'D', 'G', 'B', 'E'],
  mandolin: ['G', 'D', 'A', 'E'],
  uke: ['G', 'C', 'E', 'A'],
  banjo4: ['C', 'G', 'D', 'A'],
  banjo5: ['g', 'D', 'G', 'B', 'D']
}

export const BANJO5_DRONE_STRING_INDEX = 0
export const BANJO5_DRONE_MIN_FRET = 7

export const INSTRUMENT_STRINGS = {
  guitar: 6,
  mandolin: 4,
  uke: 4,
  banjo4: 4,
  banjo5: 5
}

export const UKE_QUALITIES = [
  'major', 'minor', 'diminished', 'augmented', 'dominant7', 'minor7',
  'major7', 'minorMajor7', 'diminished7', 'major6', 'minor6', 'suspended2', 'suspended4'
]

export const BANJO_CHART_QUALITIES = [
  'major', 'minor', 'augmented', 'diminished', 'major6', 'dominant7', 'major7', 'minor7'
]

/** react-chords / chart suffix → chord-symbol suffix fragment */
export const SUFFIX_TO_CHORD_NAME = {
  major: '',
  minor: 'm',
  dim: 'dim',
  aug: 'aug',
  '6': '6',
  '7': '7',
  maj7: 'maj7',
  m7: 'm7',
  dim7: 'dim7',
  m6: 'm6',
  mmaj7: 'm(maj7)',
  sus2: 'sus2',
  sus4: 'sus4'
}
