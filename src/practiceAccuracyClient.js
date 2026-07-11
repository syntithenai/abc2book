import { fetchViaMediaProxy } from './mediaProxyClient'
import { mergeResolverScore } from './practiceAccuracyScorer'

function normalizePracticeAnalysis(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Resolver returned an invalid practice analysis response')
  }
  if (body.error) throw new Error(body.error)
  return {
    pitchPct: typeof body.pitchPct === 'number' ? body.pitchPct : 0,
    timingPct: typeof body.timingPct === 'number' ? body.timingPct : null,
    hits: typeof body.hits === 'number' ? body.hits : 0,
    totalNotes: typeof body.totalNotes === 'number' ? body.totalNotes : 0,
    missed: typeof body.missed === 'number' ? body.missed : 0,
    perNote: Array.isArray(body.perNote) ? body.perNote : [],
    backend: typeof body.backend === 'string' ? body.backend : '',
    source: 'resolver',
  }
}

export async function analyzePracticeRecording(blob, metadata, options) {
  const opts = options || {}
  const form = new FormData()
  form.append('file', blob, 'practice.webm')
  form.append('expected', JSON.stringify(metadata || {}))

  const response = await fetchViaMediaProxy('/analyze-practice', {
    method: 'POST',
    body: form,
    signal: opts.signal,
  })

  let body = null
  try {
    body = await response.json()
  } catch (e) {
    throw new Error('Resolver returned an unreadable practice analysis response')
  }

  if (!response.ok) {
    throw new Error(body && body.error ? body.error : 'Practice analysis failed')
  }

  return normalizePracticeAnalysis(body)
}

export function applyAuthoritativeResolverScore(browserSummary, resolverSummary) {
  return mergeResolverScore(browserSummary, resolverSummary)
}
