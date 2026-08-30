/**
 * Source-only MIDI/OMR convert for oldtime / Documents review (no library search).
 * Prefer MIDI when present; otherwise OMR the PDF.
 * Supports remote http(s) URLs and Documents review-root paths.
 */
import { candidateId, chordCount } from './bookImportAbcLookup'
import { fetchViaMediaProxy } from './mediaProxyClient'
import { fetchReviewProjectsBlob } from './reviewProjectsClient'
import { importMidiWithWizardDefaults } from './midiImportAuto'
import { transcribeSheetImageFile } from './sheetImageTranscriptionClient'
import { safeAutofixMidiAbc } from './midiImportFinalize'

function mergeCandidates(existing, extras) {
  const list = (Array.isArray(existing) ? existing.slice() : [])
  const seen = {}
  list.forEach(function(c) { if (c && c.id) seen[c.id] = true })
  ;(extras || []).forEach(function(c) {
    if (!c || !c.id || seen[c.id]) return
    seen[c.id] = true
    list.push(c)
  })
  return list
}

export async function fetchRemoteBytes(url, accessToken, filenameHint) {
  const path = '/fetch-score-attachment?url=' + encodeURIComponent(url)
  const response = await fetchViaMediaProxy(path, accessToken, { method: 'GET' })
  const contentType = String(
    (response.headers && response.headers.get && response.headers.get('content-type')) || ''
  ).toLowerCase()
  const buf = await response.arrayBuffer()
  if (!buf || !buf.byteLength) {
    throw new Error('Empty download from score attachment proxy')
  }
  const bytes = new Uint8Array(buf)
  const head = String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, 0, 64))
  const looksHtml = contentType.indexOf('text/html') >= 0
    || /^\s*<(!DOCTYPE|html|head|body)\b/i.test(head)
  if (looksHtml) {
    throw new Error(
      'Score attachment proxy returned HTML instead of a file. '
      + 'Restart the React dev server so /fetch-score-attachment is proxied to the resolver.'
    )
  }
  const name = filenameHint || (String(url).split('/').pop() || 'download').split('?')[0]
  const lowerName = String(name).toLowerCase()
  const expectMidi = /\.(mid|midi)$/i.test(lowerName) || /midi/i.test(String(url))
  if (expectMidi) {
    const isSmf = bytes.length >= 4
      && bytes[0] === 0x4d && bytes[1] === 0x54 && bytes[2] === 0x68 && bytes[3] === 0x64
    if (!isSmf) {
      throw new Error('Downloaded file is not a valid MIDI (missing MThd header)')
    }
  }
  return { bytes: bytes, name: name, contentType: contentType }
}

async function loadMidiBytes(tune, accessToken) {
  const remote = String(tune && tune.midiRemotePath || '').trim()
  if (remote) {
    const blob = await fetchReviewProjectsBlob(remote, accessToken)
    const buf = await blob.arrayBuffer()
    return {
      bytes: new Uint8Array(buf),
      name: (tune.slug || 'tune') + '.mid',
      contentType: 'audio/midi',
      sourceLabel: remote,
    }
  }
  const url = String(tune && tune.midiUrl || '').trim()
  if (!url) throw new Error('No MIDI source for this tune')
  const fetched = await fetchRemoteBytes(url, accessToken, (tune.slug || 'tune') + '.mid')
  return Object.assign({}, fetched, { sourceLabel: url })
}

async function loadPdfFile(tune, accessToken) {
  const remote = String(tune && tune.pdfRemotePath || '').trim()
  if (remote) {
    const blob = await fetchReviewProjectsBlob(remote, accessToken)
    const name = (tune.slug || 'tune') + '.pdf'
    return {
      file: new File([blob], name, { type: 'application/pdf' }),
      sourceLabel: remote,
    }
  }
  const url = String(tune && tune.pdfUrl || '').trim()
  if (!url) throw new Error('No PDF source for this tune')
  const fetched = await fetchRemoteBytes(url, accessToken, (tune.slug || 'tune') + '.pdf')
  return {
    file: new File([fetched.bytes], fetched.name, { type: 'application/pdf' }),
    sourceLabel: url,
  }
}

function applyTuneTitle(abc, title) {
  let next = String(abc || '')
  const t = String(title || '').trim()
  if (!t || !next) return next
  if (/^T:/m.test(next)) {
    next = next.replace(/^T:[^\n]*/m, 'T:' + t)
  } else {
    next = next.replace(/^(X:[^\n]*\n)/m, '$1T:' + t + '\n')
  }
  return next
}

export function tuneHasMidiSource(tune) {
  return !!(tune && (tune.midiRemotePath || tune.midiUrl))
}

export function tuneHasPdfSource(tune) {
  return !!(tune && (tune.pdfRemotePath || tune.pdfUrl))
}

export async function convertMidiForTune(tune, accessToken) {
  const fetched = await loadMidiBytes(tune, accessToken)
  const imported = await importMidiWithWizardDefaults(
    fetched.bytes,
    fetched.name,
    accessToken,
    { melodyOnly: true }
  )
  let abc = String(imported && imported.abc || '').trim()
  if (!abc) {
    const result = imported && imported.result
    const hasXml = !!(result && result.musicXml)
    const strategy = result && result.strategy ? String(result.strategy) : 'unknown'
    throw new Error(
      hasXml
        ? 'MIDI conversion returned MusicXML but no ABC (strategy=' + strategy + ')'
        : 'MIDI conversion returned no ABC (strategy=' + strategy + ')'
    )
  }
  abc = applyTuneTitle(abc, tune.title)
  abc = safeAutofixMidiAbc(abc)
  const cand = {
    id: candidateId('midi', abc),
    source: 'midi',
    abc: abc,
    score: 0.9,
    title: tune.title || '',
    url: fetched.sourceLabel || '',
    hasChords: chordCount(abc) >= 3,
  }
  return {
    candidates: mergeCandidates(tune.candidates, [cand]),
    selectedCandidateId: cand.id,
    abc: cand.abc,
    abcSource: 'midi',
    status: 'has_candidates',
  }
}

/**
 * @param {object} tune
 * @param {string} accessToken
 * @param {{ forceSelect?: boolean }} [options] forceSelect selects OMR even if MIDI ABC exists
 */
export async function omrPdfForTune(tune, accessToken, options) {
  const opts = options || {}
  const loaded = await loadPdfFile(tune, accessToken)
  const result = await transcribeSheetImageFile({
    file: loaded.file,
    accessToken: accessToken,
    titleHints: tune.title ? [tune.title] : [],
  })
  let abc = String(
    (result && result.melody && result.melody.abc)
    || (result && result.abc)
    || ''
  ).trim()
  if (!abc) throw new Error('OMR returned no melody ABC')
  abc = applyTuneTitle(abc, tune.title)
  abc = safeAutofixMidiAbc(abc)
  const cand = {
    id: candidateId('omr', abc),
    source: 'omr',
    abc: abc,
    score: 0.85,
    title: tune.title || '',
    url: loaded.sourceLabel || '',
    hasChords: chordCount(abc) >= 3,
  }
  const candidates = mergeCandidates(tune.candidates, [cand])
  if (opts.forceSelect !== false) {
    return {
      candidates: candidates,
      selectedCandidateId: cand.id,
      abc: cand.abc,
      abcSource: 'omr',
      status: 'has_candidates',
    }
  }
  const existingSel = tune.selectedCandidateId
    ? (candidates.find(function(c) { return c.id === tune.selectedCandidateId }) || null)
    : null
  const keepExisting = existingSel && !String(existingSel.source || '').toLowerCase().startsWith('omr')
  return {
    candidates: candidates,
    selectedCandidateId: keepExisting ? existingSel.id : cand.id,
    abc: keepExisting ? existingSel.abc : cand.abc,
    abcSource: keepExisting ? existingSel.source : 'omr',
    status: 'has_candidates',
  }
}

/**
 * Convert from the source version: MIDI if available, else PDF OMR.
 * Respects tune.convertPrefer === 'omr' to force OMR even when MIDI exists (proof cohort).
 */
export async function convertSourceForTune(tune, accessToken) {
  const preferOmr = String(tune && tune.convertPrefer || '').toLowerCase() === 'omr'
  if (!preferOmr && tuneHasMidiSource(tune)) {
    return convertMidiForTune(tune, accessToken)
  }
  if (tuneHasPdfSource(tune)) {
    return omrPdfForTune(tune, accessToken, { forceSelect: true })
  }
  if (tuneHasMidiSource(tune)) {
    return convertMidiForTune(tune, accessToken)
  }
  throw new Error('No MIDI or PDF source for this tune')
}
