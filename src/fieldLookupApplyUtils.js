import { toast } from 'react-toastify'
import { setPlainLyricLines, lyricLinesToText, ensurePlainWordsFromNoteAlignedLyrics } from './wLinesUtils'
import { isUsableLyricContent } from './lyricsQualityUtils'
import { needsComposerDiscovery } from './composerDiscoveryUtils'
import { isGenericArtist } from './genericArtistUtils'
import { applyNotationTuneMeta } from './notationImportUtils'
import { normalizeAbcForImport } from './abcImportNormalize'
import { applyNotationPdfCandidateToTune, isNotationPdfCandidate } from './notationPdfApply'

export function fieldLookupKindToFormKey(kind) {
  if (kind === 'composer') return 'artist'
  if (kind === 'lyrics') return 'lyrics'
  if (kind === 'chords') return 'chords'
  if (kind === 'notation') return 'notes'
  if (kind === 'links') return 'links'
  if (kind === 'genre') return 'genre'
  if (kind === 'title') return 'title'
  if (kind === 'artists') return 'artists'
  if (kind === 'aliases') return 'aliases'
  if (kind === 'key') return 'keyName'
  if (kind === 'tempo') return 'tempo'
  if (kind === 'meter') return 'meter'
  return kind
}

export function candidateDisplayValue(kind, candidate) {
  if (!candidate) return ''
  if (kind === 'composer') return String(candidate.artist || '').trim()
  if (kind === 'lyrics') {
    if (typeof candidate.text === 'string' && candidate.text.trim()) return candidate.text.trim()
    if (Array.isArray(candidate.lines)) return candidate.lines.join('\n').trim()
    return ''
  }
  if (kind === 'chords') {
    return String(candidate.chordText || candidate.preview || candidate.abc || '').trim()
  }
  if (kind === 'notation') {
    if (isNotationPdfCandidate(candidate)) {
      return String(candidate.preview || 'Sheet PDF').trim()
    }
    return String(candidate.abc || candidate.preview || '').trim()
  }
  if (kind === 'links') {
    const title = String(candidate.title || '').trim()
    const link = String(candidate.link || '').trim()
    if (title && link) return title + ' — ' + link
    return title || link
  }
  if (kind === 'genre') return String(candidate.genre || candidate.preview || '').trim()
  if (kind === 'title') return String(candidate.title || candidate.text || candidate.preview || '').trim()
  if (kind === 'artists') return String(candidate.artist || candidate.preview || '').trim()
  if (kind === 'aliases') return String(candidate.alias || candidate.preview || '').trim()
  if (kind === 'tempo') {
    const tempo = candidate.tempo != null ? candidate.tempo : candidate.preview
    return tempo != null && String(tempo).trim() !== '' ? String(tempo).trim() : ''
  }
  if (kind === 'meter') return String(candidate.meter || candidate.preview || '').trim()
  if (kind === 'key') return String(candidate.key || candidate.preview || '').trim()
  return String(candidate.preview || candidate.title || '').trim()
}

export function isTuneFieldEmptyForKind(tune, kind) {
  if (!tune) return true
  if (kind === 'composer') {
    return needsComposerDiscovery(tune.composer)
  }
  if (kind === 'title') {
    return !String(tune.name || '').trim()
  }
  if (kind === 'lyrics') {
    const text = lyricLinesToText(tune)
    return !String(text || '').trim()
  }
  if (kind === 'chords') {
    // Chord sheets live in the chords editor; treat missing chord-bearing notes as empty.
    const voices = tune.voices
    if (!voices || typeof voices !== 'object') return true
    return !Object.keys(voices).some(function(key) {
      const notes = voices[key] && Array.isArray(voices[key].notes) ? voices[key].notes : []
      return notes.some(function(line) {
        return /"[^"]+"/.test(String(line || ''))
      })
    })
  }
  if (kind === 'notation') {
    const voices = tune.voices
    if (!voices || typeof voices !== 'object') {
      return !String(tune.notes || '').trim()
    }
    return !Object.keys(voices).some(function(key) {
      const notes = voices[key] && Array.isArray(voices[key].notes) ? voices[key].notes : []
      return notes.some(function(line) { return String(line || '').trim() })
    })
  }
  if (kind === 'links') {
    if (!Array.isArray(tune.links) || tune.links.length === 0) return true
    return !tune.links.some(function(link) {
      return !!(link && link.link && String(link.link).trim())
    })
  }
  if (kind === 'genre') {
    return !String(tune.genre || '').trim()
  }
  if (kind === 'artists') {
    return !Array.isArray(tune.artists) || tune.artists.length === 0
      || !tune.artists.some(function(a) { return String(a || '').trim() })
  }
  if (kind === 'aliases') {
    return !Array.isArray(tune.aliases) || tune.aliases.length === 0
      || !tune.aliases.some(function(a) { return String(a || '').trim() })
  }
  if (kind === 'tempo') {
    if (tune.tempo == null || tune.tempo === '') return true
    const parsed = parseInt(String(tune.tempo).split('=').pop(), 10)
    return isNaN(parsed) || parsed <= 0
  }
  if (kind === 'meter') {
    return !String(tune.meter || '').trim()
  }
  if (kind === 'key') {
    return !String(tune.key || '').trim()
  }
  return true
}

/**
 * Apply a lookup candidate onto a tune object (mutates). Returns true if applied.
 */
export function applyCandidateToTune(tune, kind, candidate, abcTools) {
  if (!tune || !candidate) return false
  if (kind === 'composer') {
    const artist = String(candidate.artist || '').trim()
    if (!artist || isGenericArtist(artist)) return false
    tune.composer = artist
    return true
  }
  if (kind === 'lyrics') {
    const lines = Array.isArray(candidate.lines)
      ? candidate.lines
      : String(candidate.text || '').split(/\r?\n/)
    const quality = isUsableLyricContent(lines)
    if (!quality.ok || !quality.lines.some(function(line) { return String(line || '').trim() })) {
      return false
    }
    setPlainLyricLines(tune, quality.lines)
    return true
  }
  if (kind === 'notation' && abcTools && typeof abcTools.abc2json === 'function') {
    if (isNotationPdfCandidate(candidate)) {
      return false
    }
    const abc = normalizeAbcForImport(String(candidate.abc || '').trim())
    if (!abc) return false
    const imported = abcTools.abc2json(abc)
    if (!imported) return false
    if (imported.voices) tune.voices = imported.voices
    if (imported.notes) tune.notes = imported.notes
    if (imported.key && !tune.key) tune.key = imported.key
    if (imported.meter && !tune.meter) tune.meter = imported.meter
    if (Array.isArray(imported.wLines) && imported.wLines.length) {
      tune.wLines = imported.wLines.slice()
    }
    ensurePlainWordsFromNoteAlignedLyrics(tune)
    return true
  }
  if (kind === 'chords') {
    // Chords search results are applied in the chords editor UI; no silent tune write here.
    return false
  }
  if (kind === 'links') {
    const url = String(candidate.link || '').trim()
    if (!url) return false
    const linkObj = {
      link: url,
      title: String(candidate.title || '').trim(),
    }
    if (candidate.image) linkObj.image = candidate.image
    if (!Array.isArray(tune.links)) tune.links = []
    const emptyIdx = tune.links.findIndex(function(link) {
      return !link || !link.link || !String(link.link).trim()
    })
    if (emptyIdx >= 0) {
      tune.links[emptyIdx] = Object.assign({}, tune.links[emptyIdx] || {}, linkObj)
    } else if (isTuneFieldEmptyForKind(tune, 'links')) {
      tune.links = [linkObj]
    } else {
      tune.links[0] = Object.assign({}, tune.links[0] || {}, linkObj)
    }
    return true
  }
  if (kind === 'genre') {
    const genre = String(candidate.genre || '').trim()
    if (!genre) return false
    tune.genre = genre
    return true
  }
  if (kind === 'title') {
    const title = String(candidate.title || candidate.text || '').trim()
    if (!title) return false
    tune.name = title
    return true
  }
  if (kind === 'artists') {
    const artist = String(candidate.artist || '').trim()
    if (!artist || isGenericArtist(artist)) return false
    if (!Array.isArray(tune.artists)) tune.artists = []
    const key = artist.toLowerCase()
    if (tune.artists.some(function(item) { return String(item || '').trim().toLowerCase() === key })) {
      return true
    }
    tune.artists = tune.artists.concat([artist])
    return true
  }
  if (kind === 'aliases') {
    const alias = String(candidate.alias || '').trim()
    if (!alias) return false
    if (!Array.isArray(tune.aliases)) tune.aliases = []
    const key = alias.toLowerCase()
    if (tune.aliases.some(function(item) { return String(item || '').trim().toLowerCase() === key })) {
      return true
    }
    tune.aliases = tune.aliases.concat([alias])
    return true
  }
  if (kind === 'tempo') {
    const raw = candidate.tempo != null ? candidate.tempo : candidate.preview
    const parsed = parseInt(String(raw == null ? '' : raw).split('=').pop(), 10)
    if (isNaN(parsed) || parsed <= 0) return false
    tune.tempo = parsed
    return true
  }
  if (kind === 'meter') {
    const meter = String(candidate.meter || candidate.preview || '').trim()
    if (!meter) return false
    tune.meter = meter
    return true
  }
  if (kind === 'key') {
    const key = String(candidate.key || candidate.preview || '').trim()
    if (!key) return false
    tune.key = key
    return true
  }
  return false
}

/**
 * Async apply for notation PDF archive candidates (downloads via resolver proxy).
 */
export async function applyCandidateToTuneAsync(tune, kind, candidate, abcTools, options) {
  if (!tune || !candidate) return false
  if (kind === 'notation' && isNotationPdfCandidate(candidate)) {
    try {
      const applied = await applyNotationPdfCandidateToTune(tune, candidate, options || {})
      if (applied) {
        toast.info('Attached archive PDF to tune')
      }
      return applied
    } catch (e) {
      toast.error((e && e.message) || 'Could not attach archive PDF')
      return false
    }
  }
  if (kind === 'notation' && candidate.tuneMeta) {
    applyNotationTuneMeta(tune, candidate.tuneMeta)
  }
  return applyCandidateToTune(tune, kind, candidate, abcTools)
}

export function historyLabelForKind(kind) {
  if (kind === 'composer') return 'Search artist'
  if (kind === 'lyrics') return 'Search lyrics'
  if (kind === 'notation') return 'Search notation'
  if (kind === 'chords') return 'Search chords'
  if (kind === 'links') return 'Search links'
  if (kind === 'genre') return 'Search genre'
  if (kind === 'title') return 'Update title'
  if (kind === 'artists') return 'Search artists'
  if (kind === 'aliases') return 'Search aliases'
  if (kind === 'tempo') return 'Apply tempo'
  if (kind === 'meter') return 'Apply time signature'
  if (kind === 'key') return 'Apply key'
  return 'Field search'
}

export function toastAppliedFieldLookup(kind, tuneName) {
  const label = kind === 'composer'
    ? 'artist'
    : kind === 'lyrics'
      ? 'lyrics'
      : kind === 'notation'
        ? 'notation'
        : kind === 'links'
          ? 'link'
          : kind === 'genre'
            ? 'genre'
            : kind === 'title'
              ? 'title'
              : kind === 'artists'
                ? 'artists'
                : kind === 'aliases'
                  ? 'aliases'
                  : kind === 'tempo'
                    ? 'tempo'
                    : kind === 'meter'
                      ? 'time signature'
                      : kind === 'key'
                        ? 'key'
                        : 'search result'
  toast.info('Updated ' + label + (tuneName ? (': ' + tuneName) : ''), {
    hideProgressBar: true,
    autoClose: 1500,
  })
}

export function toastFieldSearchFinished(kind, options) {
  const opts = options || {}
  const count = Number(opts.count) || 0
  const applied = !!opts.applied
  const label = kind === 'composer' ? 'artist' : String(kind || 'field')
  let message
  if (count <= 0) {
    message = 'No ' + label + ' results'
  } else if (applied) {
    message = 'Applied ' + label + ' · ' + count + ' suggestion' + (count === 1 ? '' : 's')
  } else {
    message = count + ' ' + label + ' suggestion' + (count === 1 ? '' : 's')
  }
  toast.info(message, {
    hideProgressBar: true,
    autoClose: 2000,
  })
}
