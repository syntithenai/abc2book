import { discoverComposerIfNeeded } from './composerLookupUtils'
import { searchArtists } from './artistsSearchClient'
import { searchAlbumsForSong } from './albumsSearchClient'
import { searchGenreLight } from './genreSearchClient'
import { isTuneFieldEmptyForKind, applyCandidateToTune } from './fieldLookupApplyUtils'
import { mergeBibliographicList } from './tuneBibliographicUtils'
import { isGenericArtist } from './genericArtistUtils'
import { isAbortError } from './abortUtils'

const DEFAULT_FIELDS = ['composer', 'artists', 'albums', 'genre']

/**
 * Fill empty bibliographic metadata from MusicBrainz (and related lightweight sources).
 */
export async function enrichTuneMetadataFromMusicBrainz(tune, options) {
  const opts = options || {}
  const fields = Array.isArray(opts.fields) ? opts.fields : DEFAULT_FIELDS
  const title = String(opts.title || (tune && tune.name) || '').trim()
  const artist = String(opts.artist || (tune && tune.composer) || '').trim()
  if (!title || !tune) return { applied: {} }

  const applied = {}
  const signal = opts.signal

  function report(step, message) {
    if (typeof opts.onProgress === 'function') {
      opts.onProgress(step, message || step)
    }
  }

  if (fields.indexOf('composer') >= 0 && isTuneFieldEmptyForKind(tune, 'composer')) {
    report('composer', 'Discovering artist…')
    try {
      const discovered = await discoverComposerIfNeeded({
        title: title,
        composer: tune.composer || '',
        accessToken: opts.accessToken || '',
        signal: signal,
        resolverAvailable: opts.resolverAvailable,
        onProgress: function(message) { report('composer', message) },
      })
      if (discovered && !isGenericArtist(discovered)) {
        tune.composer = discovered
        applied.composer = discovered
      }
    } catch (e) {
      if (isAbortError(e)) return { applied: applied }
    }
  }

  const searchArtist = String(applied.composer || artist || tune.composer || '').trim()

  if (fields.indexOf('artists') >= 0 && isTuneFieldEmptyForKind(tune, 'artists')) {
    report('artists', 'Searching performers…')
    try {
      const result = await searchArtists({
        title: title,
        artist: searchArtist,
        signal: signal,
        onProgress: function(message) { report('artists', message) },
      })
      const names = []
      const autoCandidates = Array.isArray(result.autoApply) && result.autoApply.length
        ? result.autoApply
        : []
      if (autoCandidates.length) {
        autoCandidates.forEach(function(candidate) {
          if (candidate && candidate.artist) names.push(candidate.artist)
        })
      } else if (Array.isArray(result.candidates)) {
        result.candidates.forEach(function(candidate) {
          if (candidate && candidate.artist) names.push(candidate.artist)
        })
      } else if (result.artist) {
        names.push(result.artist)
      }
      if (names.length) {
        if (!Array.isArray(tune.artists)) tune.artists = []
        tune.artists = mergeBibliographicList(tune.artists, names)
        applied.artists = names
      }
    } catch (e) {
      if (isAbortError(e)) return { applied: applied }
    }
  }

  if (fields.indexOf('albums') >= 0 && isTuneFieldEmptyForKind(tune, 'albums')) {
    report('albums', 'Searching albums…')
    try {
      const performerList = Array.isArray(tune.artists) ? tune.artists.slice() : []
      const result = await searchAlbumsForSong(title, searchArtist, {
        signal: signal,
        onProgress: function(message) { report('albums', message) },
        performers: performerList,
      })
      const autoCandidates = Array.isArray(result.autoApply) && result.autoApply.length
        ? result.autoApply
        : (Array.isArray(result.albums) && result.albums.length
          ? result.albums.map(function(album) { return { album: album } })
          : [])
      const albums = autoCandidates.map(function(c) { return c && c.album }).filter(Boolean)
      if (albums.length) {
        if (!Array.isArray(tune.albums)) tune.albums = []
        tune.albums = mergeBibliographicList(tune.albums, albums)
        applied.albums = albums
      }
    } catch (e) {
      if (isAbortError(e)) return { applied: applied }
    }
  }

  if (fields.indexOf('genre') >= 0 && isTuneFieldEmptyForKind(tune, 'genre')) {
    report('genre', 'Suggesting genre…')
    try {
      const result = await searchGenreLight({
        title: title,
        artist: searchArtist,
        rhythm: tune.rhythm || '',
        backgroundInfo: tune.backgroundInfo || '',
        currentGenre: '',
        signal: signal,
        onProgress: function(message) { report('genre', message) },
      })
      let genre = ''
      const autoCandidates = Array.isArray(result.autoApply) && result.autoApply.length
        ? result.autoApply
        : []
      if (autoCandidates.length === 1) {
        genre = String(autoCandidates[0].genre || '').trim()
      } else if (result && result.genre && result.confidence === 'high') {
        genre = String(result.genre).trim()
      } else if (result && Array.isArray(result.candidates) && result.candidates.length === 1) {
        const only = result.candidates[0]
        if (only && only.confidence === 'high') {
          genre = String(only.genre || '').trim()
        }
      }
      if (genre) {
        applyCandidateToTune(tune, 'genre', { genre: genre, source: 'MusicBrainz' })
        applied.genre = genre
      }
    } catch (e) {
      if (isAbortError(e)) return { applied: applied }
    }
  }

  return { applied: applied }
}
