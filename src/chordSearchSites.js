export const ALLOWED_CHORD_SITES = 'site:https://tabs.ultimate-guitar.com OR site:https://www.azchords.com/ OR site:https://www.chordsbase.com/ OR site:https://www.chords-and-tabs.net/ OR site:https://akordy.kytary.cz/ OR site:https://www.guitaretab.com/'

export function buildGoogleChordsSearchUrl(title, artist, extraQuery) {
  const query = 'chords '
    + '"' + (title || '') + '" '
    + (artist || '')
    + (extraQuery ? ' ' + extraQuery : '')
    + ' '
    + ALLOWED_CHORD_SITES
  return 'https://www.google.com/search?q=' + encodeURIComponent(query.trim())
}
