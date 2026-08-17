import axios from 'axios'
import { normalizeMatchText, scoreNotationCandidate, scoreTitleArtistMatch, buildThesessionSearchQueries } from './notationMatchUtils'
import { normalizeAbcForImport } from './abcImportNormalize'

const THESESSION_BASE = 'https://thesession.org'
const MAX_SESSION_TUNES = 5

function meterForThesessionType(tuneType) {
  const text = String(tuneType || '').toLowerCase().trim()
  if (text === 'waltz' || text === 'slide') return '3/4'
  if (text === 'polka') return '2/4'
  if (text === 'slip jig') return '9/8'
  if (text === 'jig') return '6/8'
  if (text === 'hornpipe') return '4/4'
  return '4/4'
}

export function buildThesessionSettingAbc(tuneDetail, setting) {
  const abcBody = normalizeAbcForImport(String((setting && setting.abc) || '').trim())
  if (!abcBody) return ''

  if (/^K:/m.test(abcBody) || abcBody.startsWith('X:')) {
    return abcBody
  }

  const detail = tuneDetail && typeof tuneDetail === 'object' ? tuneDetail : {}
  const tuneName = String(detail.name || '').trim()
  const tuneType = String(detail.type || '').trim()
  const composer = String(detail.composer || '').trim()
  const key = String((setting && setting.key) || 'C').trim() || 'C'

  const header = ['X:1', 'T:' + (tuneName || 'Tune')]
  if (composer) header.push('C:' + composer)
  if (tuneType) header.push('R:' + tuneType)
  header.push('M:' + meterForThesessionType(tuneType))
  header.push('L:1/8')
  header.push('K:' + key)
  return header.join('\n') + '\n' + abcBody
}

function thesessionMemberName(member) {
  if (!member || typeof member !== 'object') return ''
  return String(member.name || '').trim()
}

function formatThesessionComments(comments, limit) {
  if (!Array.isArray(comments)) return ''
  const max = limit || 5
  const parts = []
  comments.slice(0, max).forEach(function(comment) {
    if (!comment || typeof comment !== 'object') return
    const content = String(comment.content || '').trim()
    if (!content) return
    const memberName = thesessionMemberName(comment.member)
    const date = String(comment.date || '').trim()
    let label = memberName
    if (date) label = (label + ' (' + date.slice(0, 10) + ')').trim()
    parts.push(label ? '**' + label + ':** ' + content : content)
  })
  return parts.join('\n\n')
}

export function extractThesessionTuneMeta(tuneDetail, setting) {
  const detail = tuneDetail && typeof tuneDetail === 'object' ? tuneDetail : {}
  const settingObj = setting && typeof setting === 'object' ? setting : {}

  const tuneName = String(detail.name || '').trim()
  const tuneType = String(detail.type || '').trim()
  const composer = String(detail.composer || '').trim()
  let tuneUrl = String(detail.url || '').trim()
  if (!tuneUrl && detail.id) tuneUrl = THESESSION_BASE + '/tunes/' + detail.id

  const settingUrl = String(settingObj.url || '').trim()
  const settingKey = String(settingObj.key || '').trim()
  const settingMember = thesessionMemberName(settingObj.member)
  const settingDate = String(settingObj.date || '').trim()

  const aliases = Array.isArray(detail.aliases)
    ? detail.aliases.map(function(alias) { return String(alias).trim() }).filter(Boolean)
    : []

  const backgroundParts = []
  const commentsText = formatThesessionComments(detail.comments)
  if (commentsText) backgroundParts.push(commentsText)

  const stats = []
  if (detail.recordings) {
    stats.push(detail.recordings + ' recording(s) listed on The Session')
  }
  if (detail.tunebooks) {
    stats.push('In ' + detail.tunebooks + ' tunebook(s) on The Session')
  }
  if (stats.length) backgroundParts.push(stats.join(' '))

  if (settingMember) {
    let settingNote = 'Setting contributed by ' + settingMember
    if (settingDate) settingNote += ' (' + settingDate.slice(0, 10) + ')'
    backgroundParts.push(settingNote)
  }

  const links = []
  if (tuneUrl) links.push({ link: tuneUrl, name: 'The Session' })
  if (settingUrl && settingUrl !== tuneUrl) {
    links.push({ link: settingUrl, name: 'The Session setting' })
  }

  const meta = {}
  if (detail.id) meta.thesession_tune_id = [String(detail.id)]
  if (settingObj.id) meta.thesession_setting_id = [String(settingObj.id)]

  const tuneMeta = {
    name: tuneName,
    composer: composer,
    rhythm: tuneType,
    meter: meterForThesessionType(tuneType),
    noteLength: '1/8',
    srcUrl: tuneUrl || settingUrl,
    aliases: aliases,
    backgroundInfo: backgroundParts.filter(Boolean).join('\n\n').trim(),
    links: links,
    meta: meta,
  }
  if (settingKey) tuneMeta.key = settingKey
  return tuneMeta
}

function abcPreview(abcText, maxLines) {
  const lines = String(abcText || '').split('\n').filter(function(line) { return line.trim() })
  return lines.slice(0, maxLines || 6).join('\n')
}

function annotateThesessionCandidate(abcText, title, sourceUrl, artist, tuneMeta, settingIndex, settingCount, label) {
  let settingTitle = label
  if (settingCount > 1) {
    settingTitle = label + ' — setting ' + (settingIndex + 1)
  }
  return {
    abc: abcText,
    title: settingTitle,
    artist: (tuneMeta && tuneMeta.composer) || artist || '',
    source: 'thesession.org',
    sourceUrl: sourceUrl,
    preview: abcPreview(abcText),
    titleOnly: false,
    tuneMeta: tuneMeta,
  }
}

function candidateKey(candidate) {
  const sourceUrl = String(candidate.sourceUrl || '').trim().toLowerCase()
  if (sourceUrl) return sourceUrl
  return (candidate.title || '') + ':' + normalizeMatchText((candidate.abc || '').slice(0, 120))
}

function dedupeCandidates(candidates) {
  const seen = new Set()
  const ordered = []
  ;(candidates || []).forEach(function(candidate) {
    const key = candidateKey(candidate)
    if (!key || seen.has(key)) return
    seen.add(key)
    ordered.push(candidate)
  })
  return ordered
}

async function fetchThesessionJson(path, params, signal) {
  const response = await axios.get(THESESSION_BASE + path, {
    params: params,
    signal: signal,
  })
  return response.data
}

export async function searchThesessionNotation(options) {
  const opts = options || {}
  const title = String(opts.title || '').trim()
  const artist = String(opts.artist || '').trim()
  if (!title) return []

  if (typeof opts.onProgress === 'function') {
    opts.onProgress('Searching The Session...', 0.15, 'thesession')
  }

  const searchData = await fetchThesessionJson('/tunes/search', {
    format: 'json',
    perpage: 50,
    q: title,
  }, opts.signal)

  let tunes = searchData && Array.isArray(searchData.tunes) ? searchData.tunes : []
  if (!tunes.length) {
    const fallbackQueries = buildThesessionSearchQueries(title).filter(function(query) {
      return query.toLowerCase() !== title.toLowerCase()
    })
    for (let qi = 0; qi < fallbackQueries.length && !tunes.length; qi += 1) {
      const fallbackQuery = fallbackQueries[qi]
      if (typeof opts.onProgress === 'function') {
        opts.onProgress(
          'Retrying The Session search as "' + fallbackQuery + '"...',
          0.18 + (0.04 * (qi + 1) / Math.max(fallbackQueries.length, 1)),
          'thesession'
        )
      }
      const retryData = await fetchThesessionJson('/tunes/search', {
        format: 'json',
        perpage: 50,
        q: fallbackQuery,
      }, opts.signal)
      tunes = retryData && Array.isArray(retryData.tunes) ? retryData.tunes : []
    }
  }
  if (!tunes.length) return []

  const scored = tunes.map(function(tune) {
    const tuneName = String(tune.name || '')
    const tuneType = String(tune.type || '')
    let score = scoreTitleArtistMatch(tuneName, '', title, artist)
    if (tuneType) score += 5
    return { score: score, tune: tune }
  }).sort(function(a, b) { return b.score - a.score })

  const candidates = []
  const total = Math.min(scored.length, MAX_SESSION_TUNES)

  for (let index = 0; index < total; index += 1) {
    const tune = scored[index].tune
    const tuneId = tune.id
    if (!tuneId) continue

    const tuneName = String(tune.name || title)
    const tuneType = String(tune.type || '')
    const label = tuneName + (tuneType ? ' (' + tuneType + ')' : '')

    if (typeof opts.onProgress === 'function') {
      opts.onProgress(
        'Fetching settings for ' + label + '...',
        0.2 + (0.35 * (index + 1) / Math.max(total, 1)),
        'thesession'
      )
    }

    let detail
    try {
      detail = await fetchThesessionJson('/tunes/' + tuneId, {
        format: 'json',
        perpage: 50,
      }, opts.signal)
    } catch (e) {
      continue
    }

    const settings = detail && Array.isArray(detail.settings) ? detail.settings : []
    const sourceUrl = THESESSION_BASE + '/tunes/' + tuneId

    settings.forEach(function(setting, settingIndex) {
      if (!setting || typeof setting !== 'object') return
      const abcText = buildThesessionSettingAbc(detail, setting)
      if (!abcText || abcText.indexOf('K:') === -1) return
      const tuneMeta = extractThesessionTuneMeta(detail, setting)
      candidates.push(annotateThesessionCandidate(
        abcText,
        tuneName,
        sourceUrl + '#setting' + (setting.id || settingIndex),
        artist,
        tuneMeta,
        settingIndex,
        settings.length,
        label
      ))
    })
  }

  const filtered = filterThesessionCandidates(candidates, title, artist)
  return dedupeCandidates(filtered.length ? filtered : candidates.slice(0, 8))
}

function filterThesessionCandidates(candidates, title, artist) {
  if (!candidates.length) return []
  const artistKey = normalizeMatchText(artist)
  return candidates.filter(function(candidate) {
    const score = scoreNotationCandidate(candidate, title, artist)
    if (artistKey && score < 60) return false
    if (score < 30 && candidate.source === 'thesession.org') return false
    return true
  })
}

export function sortNotationCandidates(candidates, title, artist) {
  return (candidates || []).slice().sort(function(a, b) {
    const scoreA = scoreNotationCandidate(a, title, artist)
    const scoreB = scoreNotationCandidate(b, title, artist)
    return scoreB - scoreA
  })
}

export function hasStrongNotationMatch(candidates, title, artist) {
  return (candidates || []).some(function(candidate) {
    return scoreNotationCandidate(candidate, title, artist) >= 80
  })
}
