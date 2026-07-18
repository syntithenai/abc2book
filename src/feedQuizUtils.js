/**
 * Shared quiz helpers: shuffle choices, normalize 5-question bundles.
 */

export function shuffleList(list, rng) {
  const arr = (list || []).slice()
  const rand = typeof rng === 'function' ? rng : Math.random
  for (var i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const t = arr[i]
    arr[i] = arr[j]
    arr[j] = t
  }
  return arr
}

/** Shuffle MCQ choices and re-letter ids a, b, c… without putting correct first by design. */
export function shuffleChoices(choices, rng) {
  const shuffled = shuffleList(choices || [], rng)
  return shuffled.map(function(c, idx) {
    return {
      id: String.fromCharCode(97 + idx),
      text: c && c.text != null ? String(c.text) : '',
      correct: !!(c && c.correct),
    }
  })
}

export function normalizeQuestion(raw, rng, shuffle) {
  if (!raw || typeof raw !== 'object') return null
  const prompt = String(raw.prompt || '').trim()
  const choices = Array.isArray(raw.choices) ? raw.choices : []
  if (!prompt || choices.length < 2) return null
  const nextChoices = shuffle === false
    ? choices.map(function(c, idx) {
      return {
        id: c && c.id != null ? String(c.id) : String.fromCharCode(97 + idx),
        text: c && c.text != null ? String(c.text) : '',
        correct: !!(c && c.correct),
      }
    })
    : shuffleChoices(choices, rng)
  return {
    id: String(raw.id || prompt.slice(0, 24)),
    prompt: prompt,
    choices: nextChoices,
    explain: String(raw.explain || '').trim(),
    difficulty: Number(raw.difficulty) || 0,
  }
}

/**
 * Build quiz payload with questions[]. Accepts legacy single-prompt quiz or questions array.
 * Trims/pads toward targetCount (default 5) — returns whatever we have if fewer.
 * Pass { shuffle: false } when choices were already shuffled at create time (e.g. card render).
 */
export function buildQuizBundle(raw, options) {
  const opts = options || {}
  const target = opts.targetCount > 0 ? opts.targetCount : 5
  const rng = opts.rng
  const doShuffle = opts.shuffle !== false
  const questions = []

  if (raw && Array.isArray(raw.questions)) {
    raw.questions.forEach(function(q) {
      const n = normalizeQuestion(q, rng, doShuffle)
      if (n) questions.push(n)
    })
  } else if (raw && raw.prompt) {
    const n = normalizeQuestion(raw, rng, doShuffle)
    if (n) questions.push(n)
  }

  const sliced = questions.slice(0, target)
  if (!sliced.length) return null
  return {
    id: String((raw && raw.id) || 'quiz_' + sliced[0].id),
    title: raw && raw.title ? String(raw.title) : '',
    questions: sliced,
  }
}

export function correctChoiceIndex(question) {
  if (!question || !Array.isArray(question.choices)) return -1
  for (var i = 0; i < question.choices.length; i++) {
    if (question.choices[i] && question.choices[i].correct) return i
  }
  return -1
}
