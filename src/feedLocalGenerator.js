import { getRecentTunes } from './recentTunes'
import { primaryArtist, allArtists } from './tuneBibliographicUtils'
import { extractFactsFromTune, factsToNewsBody } from './feedFactExtractors'

function makeId(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36)
}

function distractorsFromTunes(tunes, viewIds, exclude, field) {
  const excludeKey = String(exclude || '').trim().toLowerCase()
  const pool = []
  const seen = {}
  ;(viewIds || []).forEach(function(id) {
    const tune = tunes && tunes[id]
    if (!tune) return
    let values = []
    if (field === 'artist') values = allArtists(tune)
    else if (field === 'title') values = [tune.name]
    values.forEach(function(v) {
      const text = String(v || '').trim()
      const key = text.toLowerCase()
      if (!text || key === excludeKey || seen[key]) return
      seen[key] = true
      pool.push(text)
    })
  })
  return pool
}

function shuffle(list, rng) {
  const arr = list.slice()
  const rand = typeof rng === 'function' ? rng : Math.random
  for (var i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const t = arr[i]
    arr[i] = arr[j]
    arr[j] = t
  }
  return arr
}

function itemFromFact(fact, type, extra) {
  const now = Date.now()
  return Object.assign({
    id: makeId(type),
    type: type,
    tuneId: fact.tuneId,
    artist: fact.predicate === 'written_by' || fact.predicate === 'recorded_by' ? fact.objectText : '',
    headline: '',
    teaser: '',
    body: '',
    imageUrl: fact.objectImageUrl || '',
    source: fact.source || 'local_bg',
    sourceUrl: fact.sourceUrl || '',
    factHash: fact.factHash,
    generation: 'local',
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
    isNew: false,
    attemptCount: 0,
  }, extra || {})
}

export function generateLocalFeedItems(options) {
  const opts = options || {}
  const tunes = opts.tunes || {}
  let viewIds = Array.isArray(opts.viewIds) ? opts.viewIds.slice() : []
  if (!viewIds.length) {
    viewIds = getRecentTunes(tunes, 20).map(function(t) { return t.id })
  }
  const items = []
  const rng = opts.rng

  viewIds.forEach(function(tuneId) {
    const tune = tunes[tuneId]
    if (!tune) return
    const title = String(tune.name || 'Untitled').trim()
    const facts = extractFactsFromTune(tune)
    if (!facts.length) return

    const dykFact = facts.find(function(f) {
      return f.predicate === 'anecdote' || f.predicate === 'also_known_as' || f.predicate === 'written_by'
    }) || facts[0]
    items.push(itemFromFact(dykFact, 'dyk', {
      headline: 'From your recent: ' + title,
      teaser: dykFact.predicate === 'also_known_as'
        ? ('Also known as ' + dykFact.objectText)
        : (dykFact.predicate === 'written_by'
          ? ('Credited to ' + dykFact.objectText)
          : dykFact.objectText.slice(0, 140)),
      body: dykFact.objectText,
      artist: primaryArtist(tune),
    }))

    const artistFact = facts.find(function(f) { return f.predicate === 'written_by' })
    if (artistFact) {
      const wrong = distractorsFromTunes(tunes, viewIds, artistFact.objectText, 'artist')
      if (wrong.length >= 3) {
        const choices = shuffle([
          { id: 'a', text: artistFact.objectText, correct: true },
          { id: 'b', text: wrong[0] },
          { id: 'c', text: wrong[1] },
          { id: 'd', text: wrong[2] },
        ], rng).map(function(c, idx) {
          return Object.assign({}, c, { id: String.fromCharCode(97 + idx) })
        })
        // re-letter after shuffle
        const lettered = choices.map(function(c, idx) {
          return { id: String.fromCharCode(97 + idx), text: c.text, correct: !!c.correct }
        })
        items.push(itemFromFact(artistFact, 'quiz', {
          headline: 'Quick quiz: ' + title,
          teaser: 'Who is credited on this tune?',
          body: '',
          artist: primaryArtist(tune),
          quiz: {
            id: artistFact.factHash + '_q',
            type: 'mcq',
            prompt: 'Who is credited on “' + title + '”?',
            choices: lettered,
            explain: 'This tune lists ' + artistFact.objectText + ' as a credited artist/composer.',
            difficulty: 1,
          },
        }))
      }
    }

    const newsBody = factsToNewsBody(facts, 3)
    if (newsBody && newsBody.length > 80) {
      const newsFact = facts.find(function(f) {
        return f.predicate === 'anecdote' || f.predicate === 'bio_snippet'
      }) || facts[0]
      items.push(itemFromFact(newsFact, 'news', {
        factHash: newsFact.factHash + '_news',
        headline: 'A story behind ' + title,
        teaser: newsBody.slice(0, 120) + (newsBody.length > 120 ? '…' : ''),
        body: newsBody,
        artist: primaryArtist(tune),
      }))
    }
  })

  return items
}
