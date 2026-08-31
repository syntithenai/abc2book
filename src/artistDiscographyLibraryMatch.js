import { discographyTitlesMatch } from './artistDiscographyClient'
import { artistNamesMatch } from './artistDiscographyPlaybackResolver'
import { mediaArtistTitleIdentityKey } from './importTitleMatch'
import { primaryArtist } from './tuneBibliographicUtils'

/**
 * Build a cheap lookup list of title/artist pairs from the tunebook.
 */
export function buildLibraryTitleArtistEntries(tunes) {
  const entries = []
  const seen = {}
  Object.values(tunes || {}).forEach(function(tune) {
    if (!tune) return
    const title = String(tune.name || '').trim()
    if (!title) return
    const artist = primaryArtist(tune) || String(tune.composer || '').trim()
    const key = mediaArtistTitleIdentityKey(title, artist) || (title.toLowerCase() + '\0' + artist.toLowerCase())
    if (seen[key]) return
    seen[key] = true
    entries.push({ title: title, artist: artist })
  })
  return entries
}

/**
 * True when title+artist matches a tune already in the library.
 */
export function isTrackInLibrary(title, artist, libraryEntries) {
  const trackTitle = String(title || '').trim()
  if (!trackTitle || !Array.isArray(libraryEntries) || !libraryEntries.length) return false
  const trackArtist = String(artist || '').trim()
  const trackKey = mediaArtistTitleIdentityKey(trackTitle, trackArtist)
  for (let i = 0; i < libraryEntries.length; i += 1) {
    const entry = libraryEntries[i]
    if (!entry) continue
    if (trackKey) {
      const entryKey = mediaArtistTitleIdentityKey(entry.title, entry.artist)
      if (entryKey && entryKey === trackKey) return true
    }
    if (!discographyTitlesMatch(trackTitle, entry.title)) continue
    if (!trackArtist || !entry.artist) return true
    if (artistNamesMatch(trackArtist, entry.artist)) return true
  }
  return false
}
