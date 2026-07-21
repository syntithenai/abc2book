import { getRecentTunes } from './recentTunes'
import { primaryArtist, allArtists, allTitles } from './tuneBibliographicUtils'
import { extractFactsFromTune, factsToNewsBody, factHash } from './feedFactExtractors'
import { buildQuizBundle, shuffleChoices } from './feedQuizUtils'
import { lyricLinesToText, countVoiceNoteLines } from './wLinesUtils'

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
    else if (field === 'title') values = [tune.name].concat(allTitles(tune) || [])
    else if (field === 'key') {
      const k = String(tune.key || '').trim()
      if (k) values = [k]
    }
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

const COMMON_KEYS = ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Am', 'Em', 'Dm', 'Bm', 'Amaj', 'Gmaj', 'Dmaj', 'Emaj']

/** Prefer keys from other recent tunes; pad with common signatures if needed. */
export function keyDistractors(tunes, viewIds, correctKey, rng) {
  const correct = String(correctKey || '').trim()
  if (!correct) return []
  const fromRecent = distractorsFromTunes(tunes, viewIds, correct, 'key')
  const seen = {}
  fromRecent.forEach(function(k) { seen[String(k).toLowerCase()] = true })
  const pool = fromRecent.slice()
  COMMON_KEYS.forEach(function(k) {
    const key = k.toLowerCase()
    if (key === correct.toLowerCase() || seen[key]) return
    seen[key] = true
    pool.push(k)
  })
  // Light shuffle so padding order is not always the same
  const rand = typeof rng === 'function' ? rng : Math.random
  for (var i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const t = pool[i]
    pool[i] = pool[j]
    pool[j] = t
  }
  return pool
}

function formatKeyLabel(key) {
  const k = String(key || '').trim()
  if (!k) return ''
  return k
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

function shortTeaser(text, maxLen) {
  const s = String(text || '').trim()
  const lim = maxLen > 0 ? maxLen : 140
  if (s.length <= lim) return s
  return s.slice(0, lim) + '…'
}

function tuneLyricsText(tune) {
  return String(lyricLinesToText(tune) || '').trim()
}

export function tuneHasNotation(tune) {
  if (!tune) return false
  if (typeof countVoiceNoteLines === 'function' && countVoiceNoteLines(tune) > 0) {
    // countVoiceNoteLines counts lines; empty lines still count — check for note letters.
    const voices = tune.voices || {}
    const keys = Object.keys(voices)
    for (var i = 0; i < keys.length; i++) {
      const notes = voices[keys[i]] && voices[keys[i]].notes
      const lines = Array.isArray(notes) ? notes : (notes ? [String(notes)] : [])
      for (var j = 0; j < lines.length; j++) {
        const line = String(lines[j] || '').trim()
        if (!line || line.charAt(0) === '%' || /^[A-Za-z]:/.test(line)) continue
        if (/[A-Ga-g]/.test(line)) return true
      }
    }
  }
  return false
}

/** Drop later questions that reuse an artist already asked about in this block. */
export function dedupeQuizQuestionsByArtist(questions) {
  const seen = {}
  const out = []
  ;(questions || []).forEach(function(q) {
    if (!q) return
    const artist = String(q.aboutArtist || '').trim().toLowerCase()
    if (artist) {
      if (seen[artist]) return
      seen[artist] = true
    }
    out.push(q)
  })
  return out
}

/** Background body plus a Lyrics section when the tune has words. */
export function buildRecentCardBody(background, lyrics) {
  const bg = String(background || '').trim()
  const ly = String(lyrics || '').trim()
  if (bg && ly) return bg + '\n\n## Lyrics\n' + ly
  if (ly) return '## Lyrics\n' + ly
  return bg
}

function mcq(id, prompt, correctText, wrongTexts, explain, difficulty, rng) {
  const choices = shuffleChoices(
    [{ text: correctText, correct: true }].concat(
      (wrongTexts || []).slice(0, 3).map(function(t) { return { text: t, correct: false } })
    ),
    rng
  )
  if (choices.length < 2) return null
  return {
    id: id,
    prompt: prompt,
    choices: choices,
    explain: explain,
    difficulty: difficulty || 1,
  }
}

function buildLocalQuizQuestions(tune, tunes, viewIds, facts, rng) {
  const title = String(tune.name || 'Untitled').trim()
  const questions = []
  const usedArtists = {}

  function addQuestion(q, aboutArtist) {
    if (!q) return
    const key = String(aboutArtist || '').trim().toLowerCase()
    if (key) {
      if (usedArtists[key]) return
      usedArtists[key] = true
      q.aboutArtist = String(aboutArtist).trim()
    }
    questions.push(q)
  }

  const artistFact = facts.find(function(f) { return f.predicate === 'written_by' })
  if (artistFact) {
    const wrong = distractorsFromTunes(tunes, viewIds, artistFact.objectText, 'artist')
    if (wrong.length >= 3) {
      addQuestion(mcq(
        'artist_' + (tune.id || title),
        'Who is credited on “' + title + '”?',
        artistFact.objectText,
        wrong,
        'This tune lists ' + artistFact.objectText + ' as a credited artist/composer.',
        1,
        rng
      ), artistFact.objectText)
    }
  }

  const aliasFact = facts.find(function(f) { return f.predicate === 'also_known_as' })
  if (aliasFact) {
    const wrong = distractorsFromTunes(tunes, viewIds, aliasFact.objectText, 'title')
      .filter(function(t) { return t.toLowerCase() !== title.toLowerCase() })
    if (wrong.length >= 3) {
      addQuestion(mcq(
        'alias_' + (tune.id || title),
        'Which is also a name for “' + title + '”?',
        aliasFact.objectText,
        wrong,
        '“' + title + '” is also known as ' + aliasFact.objectText + '.',
        1,
        rng
      ))
    }
  }

  const yearFact = facts.find(function(f) { return f.objectYear })
  if (yearFact && yearFact.objectYear) {
    const year = yearFact.objectYear
    const wrongYears = [year - 2, year + 3, year - 5]
      .filter(function(y) { return y !== year && y > 1800 })
      .map(function(y) { return String(y) })
    if (wrongYears.length >= 3) {
      addQuestion(mcq(
        'year_' + (tune.id || title),
        'Which year is mentioned in the background for “' + title + '”?',
        String(year),
        wrongYears,
        'Background notes mention ' + year + '.',
        2,
        rng
      ))
    }
  }

  const tuneKey = formatKeyLabel(tune.key)
  if (tuneKey) {
    const wrongKeys = keyDistractors(tunes, viewIds, tuneKey, rng)
    if (wrongKeys.length >= 3) {
      addQuestion(mcq(
        'key_' + (tune.id || title),
        'What key signature is “' + title + '” in?',
        tuneKey,
        wrongKeys,
        '“' + title + '” is notated in ' + tuneKey + '.',
        1,
        rng
      ))
    }
  }

  const recorded = facts.find(function(f) { return f.predicate === 'recorded_by' })
  if (recorded) {
    const wrong = distractorsFromTunes(tunes, viewIds, recorded.objectText, 'artist')
    if (wrong.length >= 3) {
      addQuestion(mcq(
        'recorded_' + (tune.id || title),
        'Which artist is linked to a recording of “' + title + '”?',
        recorded.objectText,
        wrong,
        recorded.objectText + ' appears in recording credits for this tune.',
        2,
        rng
      ), recorded.objectText)
    }
  }

  // Title recognition — skipped if we already asked about this artist above.
  const otherTitles = distractorsFromTunes(tunes, viewIds, title, 'title')
  if (otherTitles.length >= 3 && artistFact) {
    addQuestion(mcq(
      'title_' + (tune.id || title),
      'Which tune is credited to ' + artistFact.objectText + ' among these?',
      title,
      otherTitles,
      '“' + title + '” lists ' + artistFact.objectText + '.',
      1,
      rng
    ), artistFact.objectText)
  }

  return questions.slice(0, 5)
}

function quizCardFromQuestions(questions, meta, rng) {
  const unique = dedupeQuizQuestionsByArtist(questions)
  const quiz = buildQuizBundle({
    id: 'local_quiz_' + meta.key,
    title: meta.title,
    questions: unique,
  }, { rng: rng, targetCount: 5 })
  if (!quiz) return null
  var difficulty = 5
  quiz.questions.forEach(function(q) {
    const d = Number(q && q.difficulty)
    if (Number.isFinite(d) && d < difficulty) difficulty = d
  })
  const hashBase = {
    predicate: 'tune_quiz',
    subjectName: meta.title,
    objectText: quiz.questions.map(function(q) { return q.id }).join('|'),
    tuneId: meta.tuneId,
  }
  return itemFromFact({
    tuneId: meta.tuneId,
    factHash: factHash(hashBase),
    source: 'local_bg',
    objectImageUrl: '',
    sourceUrl: '',
  }, 'quiz', {
    headline: meta.headline,
    teaser: quiz.questions[0].prompt,
    body: '',
    artist: meta.artist || '',
    quiz: quiz,
    difficulty: difficulty,
  })
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
  // Tunes with few facts pool their questions into combined 5-question cards.
  const leftoverQuestions = []

  viewIds.forEach(function(tuneId) {
    const tune = tunes[tuneId]
    if (!tune) return
    const title = String(tune.name || 'Untitled').trim()
    const facts = extractFactsFromTune(tune)
    if (!facts.length) return
    const fullBg = String(tune.backgroundInfo || '').trim()
    const lyrics = tuneLyricsText(tune)

    const dykFact = facts.find(function(f) {
      return f.predicate === 'anecdote' || f.predicate === 'also_known_as' || f.predicate === 'written_by'
    }) || facts[0]
    const dykTeaser = dykFact.predicate === 'also_known_as'
      ? ('Also known as ' + dykFact.objectText)
      : (dykFact.predicate === 'written_by'
        ? ('Credited to ' + dykFact.objectText)
        : shortTeaser(dykFact.objectText, 140))
    items.push(itemFromFact(dykFact, 'dyk', {
      headline: 'From your recent: ' + title,
      teaser: dykTeaser,
      body: buildRecentCardBody(fullBg || dykFact.objectText, lyrics),
      lyrics: lyrics,
      showNotation: !lyrics && tuneHasNotation(tune),
      artist: primaryArtist(tune),
    }))

    const quizQuestions = buildLocalQuizQuestions(tune, tunes, viewIds, facts, rng)
    if (quizQuestions.length >= 3) {
      const card = quizCardFromQuestions(quizQuestions, {
        key: tune.id || title,
        title: title,
        tuneId: tune.id != null ? String(tune.id) : null,
        headline: 'Quick quiz: ' + title,
        artist: primaryArtist(tune),
      }, rng)
      if (card) items.push(card)
    } else {
      quizQuestions.forEach(function(q) { leftoverQuestions.push(q) })
    }

    const newsBody = factsToNewsBody(facts, 3)
    if (newsBody && newsBody.length > 80) {
      const newsFact = facts.find(function(f) {
        return f.predicate === 'anecdote' || f.predicate === 'bio_snippet'
      }) || facts[0]
      const newsHash = factHash({
        predicate: 'news_story',
        subjectName: newsFact.subjectName || title,
        objectText: newsFact.objectText,
        tuneId: newsFact.tuneId,
      })
      items.push(itemFromFact(newsFact, 'news', {
        factHash: newsHash,
        headline: 'A story behind ' + title,
        teaser: shortTeaser(newsBody, 120),
        body: buildRecentCardBody(fullBg || newsBody, lyrics),
        lyrics: lyrics,
        showNotation: !lyrics && tuneHasNotation(tune),
        artist: primaryArtist(tune),
      }))
    }
  })

  const uniqueLeftovers = dedupeQuizQuestionsByArtist(leftoverQuestions)
  for (var i = 0; i < uniqueLeftovers.length; i += 5) {
    const chunk = uniqueLeftovers.slice(i, i + 5)
    if (chunk.length < 3) continue
    const card = quizCardFromQuestions(chunk, {
      key: 'recent_' + i,
      title: 'Your recent tunes',
      tuneId: null,
      headline: 'Quick quiz: your recent tunes',
      artist: '',
    }, rng)
    if (card) items.push(card)
  }

  return items
}
