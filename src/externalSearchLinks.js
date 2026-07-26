export function formatSongForSearchQuestion(title, artist) {
  const songName = String(title || '').trim()
  if (!songName) return ''
  const artistName = String(artist || '').trim()
  if (artistName) return 'the song "' + songName + '" by ' + artistName
  return 'the song "' + songName + '"'
}

export function buildGoogleSearchQuestionUrl(question) {
  const q = String(question || '').trim()
  if (!q) return ''
  return 'https://www.google.com/search?q=' + encodeURIComponent(q)
}

const EXTERNAL_SEARCH_QUESTIONS = {
  lyrics: function(song) {
    return 'What are the full lyrics to ' + song + '?'
  },
  chords: function(song) {
    return 'Where can I find guitar chords and tabs for ' + song + '?'
  },
  notation: function(song) {
    return 'Where can I find ABC notation or sheet music for ' + song + '?'
  },
  youtube: function(song) {
    return song
  },
  background: function(song) {
    return 'What is the history and background of ' + song
      + '? Include its origin, early recordings, and notable performers.'
  },
  aliases: function(song) {
    return 'What other names, aliases, or alternative titles does ' + song + ' have?'
  },
  genre: function(song) {
    return 'What music genre or style is ' + song + '?'
  },
  artists: function(song) {
    return 'Which artists have performed or recorded ' + song + '?'
  },
  composer: function(song) {
    return 'Who composed ' + song + ', and which artists have performed it?'
  },
  albums: function(song) {
    return 'On which albums does ' + song + ' appear?'
  },
}

export function buildExternalSearchQuestion(kind, title, artist) {
  const song = formatSongForSearchQuestion(title, artist)
  if (!song) return ''
  const builder = EXTERNAL_SEARCH_QUESTIONS[kind]
  if (typeof builder !== 'function') return song
  return builder(song)
}

export function buildExternalSearchUrl(kind, title, artist) {
  if (kind === 'youtube') {
    const songName = String(title || '').trim()
    if (!songName) return ''
    const artistName = String(artist || '').trim()
    const q = encodeURIComponent(artistName ? (songName + ' ' + artistName) : songName)
    return 'https://www.youtube.com/results?search_query=' + q
  }
  const question = buildExternalSearchQuestion(kind, title, artist)
  return buildGoogleSearchQuestionUrl(question)
}

export function openExternalSearch(kind, title, artist) {
  const url = buildExternalSearchUrl(kind, title, artist);
  window.open(url, '_blank', 'noopener,noreferrer');
}

export const EXTERNAL_SEARCH_KINDS = [
  { key: 'lyrics', label: 'Search lyrics' },
  { key: 'chords', label: 'Search chords' },
  { key: 'notation', label: 'Search notation' },
  { key: 'youtube', label: 'Search YouTube' },
  { key: 'background', label: 'Search background' },
];
