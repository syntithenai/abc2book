import { titleArtistFromFilename } from './audioFileMetadata'
import { isGenericArtist, normalizeArtistKey } from './genericArtistUtils'

export function parseTitleComposerHints(title, composer, titleHint) {
  const composerText = String(composer || '').trim()
  const titleText = String(title || '').trim()
  const hintText = String(titleHint || titleText || '').trim()

  if (composerText && !isGenericArtist(composerText)) {
    return {
      title: titleText || hintText,
      artistHint: composerText,
      titleHint: hintText,
    }
  }

  for (let i = 0; i < 2; i += 1) {
    const candidate = i === 0 ? hintText : titleText
    if (!candidate) continue
    const parsed = titleArtistFromFilename(candidate + '.mp3')
    if (parsed.artist && parsed.title) {
      return {
        title: parsed.title,
        artistHint: parsed.artist,
        titleHint: candidate,
      }
    }
  }

  return {
    title: titleText || hintText,
    artistHint: '',
    titleHint: hintText,
  }
}

export function needsComposerDiscovery(composer) {
  return !String(composer || '').trim() || isGenericArtist(composer)
}

export function buildGoogleComposerSearchQuestion(title, artist) {
  const songName = String(title || '').trim()
  if (!songName) return ''
  let question = 'Tell me who is the composer of this song or fiddle tune or melody named '
    + songName
  const artistName = String(artist || '').trim()
  if (artistName) {
    question += ' associated with the artist ' + artistName
  }
  return question
}

export function buildGoogleComposerSearchUrl(title, artist) {
  const question = buildGoogleComposerSearchQuestion(title, artist)
  if (!question) return ''
  return 'https://www.google.com/search?q=' + encodeURIComponent(question)
}

export function getEffectiveComposerSearchHints(title, composer, titleHint) {
  return parseTitleComposerHints(title, composer, titleHint)
}

export function buildComposerPickerCandidates(result, currentComposer) {
  const candidates = []
  const seen = new Set()

  function add(artist, source, preview) {
    const name = String(artist || '').trim()
    const key = normalizeArtistKey(name)
    if (!name || !key || seen.has(key)) return
    seen.add(key)
    candidates.push({
      artist: name,
      source: source || '',
      preview: preview || name,
    })
  }

  const current = String(currentComposer || '').trim()
  if (current) {
    add(current, 'Current value', 'Keep the current composer field value')
  }

  if (result && result.multiple && Array.isArray(result.candidates)) {
    result.candidates.forEach(function(candidate) {
      add(candidate.artist, candidate.source, candidate.preview)
    })
  } else if (result && result.artist) {
    add(result.artist, result.source, result.preview)
  }

  return candidates
}
