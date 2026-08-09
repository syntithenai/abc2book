/**
 * Real-world lyric/chord sheet samples for import regression tests.
 */

export const DOUBLE_SPACED_VERSE_WITH_SECTIONS = [
  'There were rooms of forgiveness',
  '',
  'In the house that we share',
  '',
  'But the space has been emptied',
  '',
  'Of whatever was there',
  '',
  '[Chorus]',
  '',
  'After today, consider me gone',
  '',
  '[Verse 2]',
  '',
  'Roses have thorns, and shining waters mud',
  '',
  'Clouds and eclipses stain the moon and the sun',
]

export const HYMN_SINGLE_LINE_VERSES = [
  'Amazing grace how sweet the sound',
  '',
  'Twas grace that taught my heart to fear',
  '',
  'Through many dangers toils and snares',
]

export const LEGACY_MULTILINE_STANZAS = [
  'line one',
  'line two',
  '',
  'chorus hook',
  '',
  'line three',
  'line four',
]

export const ASHOKAN_MULTI_CHART_SINGLE_VERSE = {
  lyrics: ['Long lyric block line one', 'line two', 'line three', 'line four'],
  charts: [
    'A | B | C | D |',
    'E | F | G | A |',
    'B | C | D | E |',
  ],
}

export const CHORDPRO_INLINE_SAMPLE = [
  '[Verse]',
  'The sad , [ Am]little [C]bird.',
  'Has [G]flown [Am]away.',
]

export const COW_ALTERNATING_SAMPLE = [
  '[Verse 1]',
  'Am              F',
  'The language of love',
  'Dm                    G',
  "Slips from my lover's tongue",
]

export const HEADER_BLANK_LYRICS = [
  '# Verse 1',
  '',
  'first verse line',
  '',
  '# Chorus 1',
  '',
  'chorus line',
]

/** Double-spaced lyrics with a plain section label (from scrape/songs.abc). */
export const SONGS_DOUBLE_SPACED_CHORUS_LABEL = [
  'Storm clouds may gather',
  '',
  'And stars may collide',
  '',
  'Chorus',
  '',
  'Oh, come what may, come what may',
  '',
  'I will love you, I will love you',
]

/** Title lyric that opens the first stanza (Thula Mama pattern). */
export const SONGS_TITLE_AS_FIRST_LINE = [
  'Thula Mama',
  'Thula thula mama',
  'Thula thula mama',
  '',
  'Samthatha',
  'Samthatha sambekalekhaya',
]

/** Tab-aligned W: lines (Rose of Aranmore pattern). */
export const SONGS_TAB_ALIGNED_VERSE = [
  'My thoughts today,\t though I\'m\t far away,',
  'Dwell\t on Tyrconnell\'s\t shore,',
  'The\t salt sea air\t and the\t colleens fair,',
  'Of\t lovely\t green Gwee\tdore.',
]

/** Chord-only rows interleaved with lyrics (Come What May pattern). */
export const SONGS_CHORD_ONLY_W_LINES = [
  '[C]\t[D]\t[F]',
  '',
  'Never knew I could feel like this,',
  '',
  '[F]\t\t\t[C] [Em]',
  '',
  'Like i\'ve ne-ver seen the sky be-fore,',
]

/** Title-artist metadata preface copied from a web page. */
export const SONGS_TITLE_ARTIST_PREFACE = [
  'Acid Charlotte Lyngbye',
  '',
  'first real lyric line',
  '',
  'second lyric line',
]
