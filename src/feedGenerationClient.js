import { fetchViaMediaProxy } from './mediaProxyClient'
import { extractFactsFromTune, factHash } from './feedFactExtractors'
import { upsertFeedItems } from './feedItemStore'
import { primaryArtist } from './tuneBibliographicUtils'
import { buildQuizBundle } from './feedQuizUtils'

const AI_SESSION_KEY = 'bookstorage_feed_ai_ran'

function makeId(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 9)
}

function factsPayload(facts) {
  return (facts || []).slice(0, 12).map(function(f) {
    return {
      predicate: f.predicate,
      subjectName: f.subjectName,
      objectText: f.objectText,
      objectYear: f.objectYear,
      source: f.source,
      sourceUrl: f.sourceUrl,
      rawSnippet: f.rawSnippet,
    }
  })
}

function looksLikeNameLine(line) {
  const s = String(line || '').trim().replace(/^[,;·|/]+|[,;·|/]+$/g, '')
  if (!s || s.length > 60) return false
  if (/\b(wrote|written|recorded|popular|known|composed|version|origin|history|folk|album|performed|credited)\b/i.test(s)) {
    return false
  }
  return /^[A-Z][A-Za-z.'\-]+(?:\s+[A-Z][A-Za-z.'\-]+){0,4}$/.test(s)
}

/** Bodies that are only a list of artist names with no context. */
export function isThinNameListBody(text) {
  const t = String(text || '').trim()
  if (t.length < 80) return true
  const lines = t.split(/[\n/;|]+/).map(function(ln) { return ln.trim() }).filter(Boolean)
  if (lines.length >= 2) {
    var nameLike = 0
    lines.forEach(function(ln) { if (looksLikeNameLine(ln)) nameLike++ })
    if (nameLike >= Math.max(2, Math.floor(0.6 * lines.length))
        && !/\b(wrote|written|recorded|popular|known|composed|version|origin|history)\b/i.test(t)) {
      return true
    }
  }
  const sentenceEnds = (t.match(/[.!?]/g) || []).length
  if (sentenceEnds < 2 && !/\b(wrote|written|recorded|popular|known|composed|version|origin|history)\b/i.test(t)) {
    const words = t.match(/[A-Za-z']+/g) || []
    if (words.length) {
      var caps = 0
      words.forEach(function(w) { if (w.charAt(0) === w.charAt(0).toUpperCase()) caps++ })
      if (caps / words.length >= 0.65) return true
    }
  }
  return false
}

function normalizeArticleItems(body, tune) {
  const list = body && Array.isArray(body.items) ? body.items : []
  const now = Date.now()
  const tuneId = tune && tune.id != null ? String(tune.id) : null
  const NEW_RELEASE_RE = /\b(releases?\s+(a\s+)?new(\s+song|\s+single|\s+track)?|new\s+(song|single|track|album|release)\b|just\s+(released|dropped|out)|out\s+now\b|brand[- ]?new\b)/i
const LOW_VALUE_AI_RE = /\b(musescore|uploaded to (the )?musescore|has been uploaded|digital score provides|readily available for download)\b/i
const FILLER_ONLINE_RE = /\b(a modern transcription|is available online|available online, allowing musicians to access the score)\b/i

function isLowValueAiArticle(headline, body) {
  const blob = (headline + '\n' + body).toLowerCase()
  if (LOW_VALUE_AI_RE.test(blob)) return true
  if (FILLER_ONLINE_RE.test(blob)) return true
  if (/\bavailable online\b/i.test(body) && body.length < 240) return true
  if (/\bmusescore\b/i.test(headline)) return true
  return false
}
  return list.map(function(raw) {
    const headline = String(raw.headline || '').trim()
    const teaser = String(raw.teaser || raw.body || '').trim()
    const articleBody = String(raw.body || teaser).trim()
    if (!headline || !articleBody) return null
    // Reject invented contemporary release framing for old repertoire.
    if (NEW_RELEASE_RE.test(headline) || NEW_RELEASE_RE.test(articleBody.slice(0, 200))) {
      return null
    }
    if (isThinNameListBody(articleBody)) return null
    if (isLowValueAiArticle(headline, articleBody)) return null
    if (/^Notes on\b/i.test(headline) && articleBody.length < 120) return null
    return {
      id: makeId('ai'),
      type: 'news',
      tuneId: tuneId,
      artist: primaryArtist(tune),
      headline: headline,
      teaser: teaser.slice(0, 160),
      body: articleBody,
      imageUrl: String(raw.imageUrl || ''),
      source: 'ai',
      sourceUrl: String(raw.sourceUrl || ''),
      factHash: factHash({
        predicate: 'ai_news',
        subjectName: headline,
        objectText: articleBody.slice(0, 120),
        tuneId: tuneId,
      }),
      generation: 'ai',
      quiz: null,
      lessonId: null,
      createdAt: now,
      status: 'queued',
      lastShownAt: null,
      dismissedAt: null,
      expandedAt: null,
      answeredAt: null,
      reuseEligible: false,
      srsDueAt: null,
      isNew: true,
      attemptCount: 0,
    }
  }).filter(Boolean)
}

function normalizeQuizItems(body, tune) {
  const list = body && Array.isArray(body.items) ? body.items : []
  const now = Date.now()
  const tuneId = tune && tune.id != null ? String(tune.id) : null
  const title = String(tune && tune.name || 'your tune')
  const questions = list.map(function(raw, idx) {
    const prompt = String(raw.prompt || '').trim()
    const choices = Array.isArray(raw.choices) ? raw.choices : []
    if (!prompt || choices.length < 2) return null
    return {
      id: 'aiq_' + idx + '_' + prompt.slice(0, 16),
      prompt: prompt,
      choices: choices,
      explain: String(raw.explain || 'Based on available source facts.'),
      difficulty: Number(raw.difficulty) || 2,
    }
  }).filter(Boolean)

  const quiz = buildQuizBundle({
    id: 'aiq_' + (tuneId || title),
    title: title,
    questions: questions,
  }, { targetCount: 5 })
  if (!quiz) return []

  var difficulty = 5
  quiz.questions.forEach(function(q) {
    const d = Number(q && q.difficulty)
    if (Number.isFinite(d) && d < difficulty) difficulty = d
  })

  return [{
    id: makeId('aiq'),
    type: 'quiz',
    tuneId: tuneId,
    artist: primaryArtist(tune),
    headline: 'Quiz: ' + title,
    teaser: quiz.questions[0].prompt,
    body: '',
    imageUrl: '',
    source: 'ai',
    sourceUrl: '',
    factHash: factHash({
      predicate: 'tune_quiz',
      subjectName: title,
      objectText: 'ai_mcq',
      tuneId: tuneId,
    }),
    generation: 'ai',
    quiz: quiz,
    lessonId: null,
    createdAt: now,
    status: 'queued',
    lastShownAt: null,
    dismissedAt: null,
    expandedAt: null,
    answeredAt: null,
    reuseEligible: false,
    srsDueAt: null,
    isNew: true,
    attemptCount: 0,
    difficulty: difficulty,
  }]
}

/**
 * Background AI generation. Never blocks; soft-fails if resolver/llm unavailable.
 */
export async function runFeedAiGeneration(options) {
  const opts = options || {}
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(AI_SESSION_KEY) === '1') {
      return
    }
  } catch (e) {
    // ignore
  }

  const tunes = opts.tunes || {}
  const viewIds = Array.isArray(opts.viewIds) ? opts.viewIds : []
  const onItems = typeof opts.onItems === 'function' ? opts.onItems : function() {}
  const accessToken = opts.token || null

  if (accessToken && !opts.skipAffordCheck) {
    try {
      const { checkCanAfford } = await import('./creditAffordabilityClient')
      const afford = await checkCanAfford(accessToken, [
        { id: 'feed_article' },
        { id: 'feed_quiz' },
      ])
      if (!afford.creditUnlimited && !afford.affordable) {
        return
      }
    } catch (e) {
      // soft-fail — server will reject if still insufficient
    }
  }

  for (var i = 0; i < Math.min(viewIds.length, 3); i++) {
    const tune = tunes[viewIds[i]]
    if (!tune || !tune.name) continue
    const facts = extractFactsFromTune(tune)
    const payload = {
      title: tune.name,
      artist: primaryArtist(tune),
      backgroundInfo: tune.backgroundInfo || '',
      facts: factsPayload(facts),
    }
    try {
      const articleRes = await fetchViaMediaProxy('/generate-feed-articles', accessToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        timeoutMs: 45000,
      })
      if (articleRes && articleRes.ok) {
        const body = await articleRes.json()
        const items = normalizeArticleItems(body, tune)
        if (items.length) {
          upsertFeedItems(items)
          onItems(items)
        }
      }
    } catch (e) {
      // soft-fail
    }
    try {
      const quizRes = await fetchViaMediaProxy('/generate-feed-quizzes', accessToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        timeoutMs: 45000,
      })
      if (quizRes && quizRes.ok) {
        const body = await quizRes.json()
        const items = normalizeQuizItems(body, tune)
        if (items.length) {
          upsertFeedItems(items)
          onItems(items)
        }
      }
    } catch (e) {
      // soft-fail
    }
  }

  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(AI_SESSION_KEY, '1')
  } catch (e) {
    // ignore
  }
}
