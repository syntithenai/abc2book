function normalizeWord(word) {
  return String(word || '').trim().replace(/[\u2019']/g, "'")
}

function splitPhraseIntoWords(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .map(function(word) {
      return word.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, '')
    })
    .filter(Boolean)
}

export function estimateSyllableCount(word) {
  const normalized = normalizeWord(word).toLowerCase().replace(/[^a-z']/g, '')
  if (!normalized) return 1
  if (normalized.length <= 3) return 1

  const groups = normalized.match(/[aeiouy]+/g)
  if (!groups) return 1

  let count = groups.length
  if (normalized.endsWith('e') && count > 1 && !normalized.endsWith('le') && normalized.length > 3) {
    count -= 1
  }

  return Math.max(1, count)
}

export function splitWordIntoSyllables(word, count) {
  const target = Math.max(1, parseInt(count, 10) || 1)
  const text = normalizeWord(word)
  if (!text) return ['']
  if (target === 1) return [text]

  const lower = text.toLowerCase()
  const splitPoints = []
  const vowelEnds = []
  let match
  const vowelPattern = /[aeiouy]+/gi
  while ((match = vowelPattern.exec(lower)) !== null) {
    vowelEnds.push(match.index + match[0].length)
  }

  for (let index = 0; index < vowelEnds.length - 1 && splitPoints.length < target - 1; index += 1) {
    let point = vowelEnds[index]
    while (point < lower.length && !/[aeiouy]/i.test(lower[point])) point += 1
    if (point > 0 && point < text.length) splitPoints.push(point)
  }

  while (splitPoints.length < target - 1) {
    const index = Math.round((text.length * (splitPoints.length + 1)) / target)
    if (index <= 0 || index >= text.length) break
    if (splitPoints.indexOf(index) === -1) splitPoints.push(index)
    else break
  }

  splitPoints.sort(function(a, b) { return a - b })
  const parts = []
  let start = 0
  splitPoints.slice(0, target - 1).forEach(function(point) {
    parts.push(text.slice(start, point))
    start = point
  })
  parts.push(text.slice(start))
  return parts.filter(function(part) { return part.length > 0 })
}

function guessStressIndex(word, syllableCount) {
  const count = Math.max(1, syllableCount || estimateSyllableCount(word))
  if (count === 1) return 0

  const lower = normalizeWord(word).toLowerCase()

  if (/(tion|sion|cian|tian|ity|ety|ography|ology|graphy|phony|meter|tive)$/.test(lower)) {
    return Math.max(0, count - 3)
  }

  if (/(ic|ics|ive|al|ous|eous|ious|ary|ory|ery|ian|ial|ily)$/.test(lower)) {
    return Math.max(0, count - 2)
  }

  return 0
}

function accentSyllables(syllables, stressIndex) {
  return syllables.map(function(syllable, index) {
    return (index === stressIndex ? 'ˈ' : '') + syllable
  }).join('-')
}

export function analyzeWord(word) {
  const normalized = normalizeWord(word)
  const syllableCount = estimateSyllableCount(normalized)
  const syllables = splitWordIntoSyllables(normalized, syllableCount)
  const stressIndex = guessStressIndex(normalized, syllableCount)
  return {
    word: normalized,
    syllableCount: syllableCount,
    syllables: syllables,
    stressIndex: stressIndex,
    stressPattern: accentSyllables(syllables, stressIndex),
  }
}

export function analyzePhrase(phrase) {
  const words = splitPhraseIntoWords(phrase)
  const wordAnalyses = words.map(function(word) {
    return analyzeWord(word)
  })
  const syllableCount = wordAnalyses.reduce(function(total, item) {
    return total + item.syllableCount
  }, 0)
  return {
    phrase: String(phrase || '').trim(),
    words: words,
    wordAnalyses: wordAnalyses,
    syllableCount: syllableCount,
    stressPattern: wordAnalyses.map(function(item) {
      return item.stressPattern
    }).join(' '),
  }
}

export function buildSyllableSummary(phrase) {
  const analysis = analyzePhrase(phrase)
  return analysis.words.length === 0
    ? 'Enter a word or line to estimate syllables and stress.'
    : analysis.wordAnalyses.map(function(item) {
        return item.word + ' · ' + item.syllableCount + ' syllable' + (item.syllableCount === 1 ? '' : 's') + ' · ' + item.stressPattern
      }).join(' | ')
}

export function buildCompactMeterSummary(phrase) {
  const analysis = analyzePhrase(phrase)
  if (!analysis.words.length) return ''
  const syllableLabel = analysis.syllableCount === 1
    ? '1 syllable'
    : analysis.syllableCount + ' syllables'
  return syllableLabel + ' · stress shape ' + analysis.stressPattern
}
