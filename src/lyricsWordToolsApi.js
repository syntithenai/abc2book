import { fetchViaMediaProxy } from './mediaProxyClient'

const DATAMUSE_BASE_URL = 'https://api.datamuse.com/words'
const DICTIONARY_BASE_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en'
const PHRASE_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'how',
  'i', 'if', 'in', 'is', 'it', 'of', 'on', 'or', 'so', 'than', 'that', 'the',
  'their', 'them', 'there', 'these', 'they', 'this', 'to', 'was', 'we', 'were',
  'what', 'when', 'where', 'which', 'who', 'why', 'with', 'you', 'your',
])

function normalizeDatamuseResults(results) {
  return Array.isArray(results) ? results.map(function(item) {
    return {
      word: item.word || '',
      score: item.score || 0,
      numSyllables: item.numSyllables || null,
      tags: Array.isArray(item.tags) ? item.tags : [],
    }
  }) : []
}

function getPhraseContextSeeds(term) {
  const words = String(term || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) {
    return { leading: '', trailing: '' }
  }
  return {
    leading: words[0],
    trailing: words[words.length - 1],
  }
}

function getPhraseSearchSeeds(term) {
  const words = String(term || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
  const significantWords = words.filter(function(word) {
    return !PHRASE_STOP_WORDS.has(word)
  })
  const sourceWords = significantWords.length ? significantWords : words
  const leading = significantWords[0] || words[0] || ''
  const trailing = significantWords[significantWords.length - 1] || words[words.length - 1] || ''
  return {
    fullPhrase: String(term || '').trim(),
    leading: leading,
    trailing: trailing,
    leadingPair: sourceWords.slice(0, 2).join(' '),
    trailingPair: sourceWords.slice(-2).join(' '),
    keywords: sourceWords.slice(0, 4),
    topic: significantWords.slice(0, 3).join(' ') || String(term || '').trim(),
    pattern: significantWords.length > 1
      ? significantWords.join('*') + '*'
      : String(term || '').trim().replace(/\s+/g, '*') + '*',
  }
}

function mergeDatamuseResults(groups, limit) {
  const seen = new Set()
  const merged = []
  ;(groups || []).forEach(function(group) {
    normalizeDatamuseResults(group).forEach(function(item) {
      const key = String(item.word || '').toLowerCase()
      if (!key || seen.has(key)) return
      seen.add(key)
      merged.push(item)
    })
  })
  return merged.slice(0, limit || merged.length)
}

function backfillPhraseContext(primary, fallback, limit) {
  const max = limit || 16
  if (primary && primary.length > 0) return primary.slice(0, max)
  return (fallback || []).slice(0, Math.min(8, max))
}

function getInitialLetter(term) {
  const match = String(term || '').trim().toLowerCase().match(/[a-z]/)
  return match ? match[0] : ''
}

function getAlliterationSoundKey(term) {
  let word = String(term || '').trim().toLowerCase().replace(/[^a-z]/g, '')
  if (!word) return ''

  word = word
    .replace(/^(kn|gn|pn)/, 'n')
    .replace(/^wr/, 'r')
    .replace(/^ps/, 's')
    .replace(/^wh/, 'w')
    .replace(/^ph/, 'f')
    .replace(/^qu/, 'kw')
    .replace(/^x/, 'z')

  if (/^[aeiou]/.test(word)) return word[0]
  if (/^sch/.test(word)) return 'sk'
  if (/^sh/.test(word)) return 'sh'
  if (/^ch/.test(word)) return 'ch'
  if (/^th/.test(word)) return 'th'

  const first = word[0]
  const second = word[1] || ''

  if (first === 'c') {
    return /[eiy]/.test(second) ? 's' : 'k'
  }
  if (first === 'g') {
    return /[eiy]/.test(second) ? 'j' : 'g'
  }
  if (first === 'q') return 'k'

  const vowelIndex = word.search(/[aeiou]/)
  if (vowelIndex <= 0) return first

  const onset = word.slice(0, vowelIndex)
  return onset
    .replace(/c/g, 'k')
    .replace(/q/g, 'k')
}

function filterAlliterativeWords(items, term) {
  const soundKey = getAlliterationSoundKey(term)
  if (!soundKey) return items.slice()
  return items.filter(function(item) {
    return getAlliterationSoundKey(item.word) === soundKey
  })
}

async function fetchJson(url, signal) {
  const response = await fetch(url, { signal: signal })
  const text = await response.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch (error) {
    payload = null
  }
  if (!response.ok) {
    const message = payload && payload.title
      ? payload.title
      : payload && payload.message
        ? payload.message
        : 'Request failed'
    throw new Error(message)
  }
  return payload
}

async function fetchDatamuse(params, signal) {
  const url = new URL(DATAMUSE_BASE_URL)
  Object.keys(params).forEach(function(key) {
    const value = params[key]
    if (value === undefined || value === null || value === '') return
    url.searchParams.set(key, String(value))
  })
  if (!url.searchParams.has('max')) {
    url.searchParams.set('max', '12')
  }
  return fetchJson(url.toString(), signal)
}

async function fetchDatamuseSuggestions(term, signal) {
  const word = String(term || '').trim()
  if (!word) return []
  const url = 'https://api.datamuse.com/sug?s=' + encodeURIComponent(word) + '&max=10'
  const payload = await fetchJson(url, signal)
  return Array.isArray(payload) ? payload : []
}

async function tryDictionaryEntries(word, signal) {
  const lookup = String(word || '').trim().toLowerCase()
  if (!lookup) return []
  try {
    const payload = await fetchJson(DICTIONARY_BASE_URL + '/' + encodeURIComponent(lookup), signal)
    return Array.isArray(payload) ? payload : []
  } catch (error) {
    return []
  }
}

function dictionaryPrimaryWord(term) {
  const seeds = getPhraseSearchSeeds(term)
  return seeds.leading || String(term || '').trim()
}

async function resolveDictionaryWordDirect(query, primaryWord) {
  const word = String(primaryWord || query || '').trim().toLowerCase()
  if (!word) {
    return {
      query: String(query || '').trim(),
      resolvedWord: '',
      dictionary: [],
      matchType: 'none',
      lookupWord: '',
    }
  }

  let entries = await tryDictionaryEntries(word)
  if (entries.length) {
    return {
      query: String(query || '').trim(),
      resolvedWord: entries[0].word || word,
      dictionary: entries,
      matchType: 'exact',
      lookupWord: word,
    }
  }

  const suggestions = await fetchDatamuseSuggestions(word)
  for (let i = 0; i < suggestions.length; i += 1) {
    const suggestion = suggestions[i]
    if (!suggestion || !suggestion.word) continue
    entries = await tryDictionaryEntries(suggestion.word)
    if (entries.length) {
      return {
        query: String(query || '').trim(),
        resolvedWord: entries[0].word || suggestion.word,
        dictionary: entries,
        matchType: 'fuzzy',
        lookupWord: word,
        matchedSuggestion: suggestion.word,
      }
    }
  }

  const spelledLike = normalizeDatamuseResults(await fetchDatamuse({ sp: word + '*', max: 12 }))
  for (let j = 0; j < spelledLike.length; j += 1) {
    const candidate = spelledLike[j]
    if (!candidate || !candidate.word) continue
    entries = await tryDictionaryEntries(candidate.word)
    if (entries.length) {
      return {
        query: String(query || '').trim(),
        resolvedWord: entries[0].word || candidate.word,
        dictionary: entries,
        matchType: 'fuzzy',
        lookupWord: word,
        matchedSuggestion: candidate.word,
      }
    }
  }

  return {
    query: String(query || '').trim(),
    resolvedWord: word,
    dictionary: [],
    matchType: 'none',
    lookupWord: word,
  }
}

function phraseWordCount(term) {
  return String(term || '').trim().split(/\s+/).filter(Boolean).length
}

export function isMultiWordPhrase(term) {
  return phraseWordCount(term) > 1
}

function pickFirstReverseDictionaryWord(result) {
  const candidates = collectReverseDictionaryCandidates(result)
  return candidates.length ? candidates[0].word : ''
}

export function collectReverseDictionaryCandidates(reverseResult) {
  if (!reverseResult) return []
  return mergeDatamuseResults([
    reverseResult.meaning,
    reverseResult.topic,
    reverseResult.examples,
  ], 24)
}

export async function resolveDictionaryWord(term, accessToken, primaryWordOverride) {
  const query = String(term || '').trim()
  if (!query) throw new Error('Enter a word to look up')
  const override = primaryWordOverride != null ? String(primaryWordOverride || '').trim().toLowerCase() : ''
  const lookupWord = override || dictionaryPrimaryWord(query)

  try {
    const payload = await fetchResolverJson('/lyrics-dictionary', { term: lookupWord }, accessToken)
    if (Array.isArray(payload) && payload.length) {
      const resolvedWord = payload[0].word || lookupWord
      const matchType = resolvedWord.toLowerCase() === lookupWord.toLowerCase() ? 'exact' : 'fuzzy'
      return {
        query: query,
        resolvedWord: resolvedWord,
        dictionary: payload,
        matchType: matchType,
        lookupWord: lookupWord,
      }
    }
  } catch (error) {
    // Fall back to direct dictionary + Datamuse fuzzy resolution.
  }

  return resolveDictionaryWordDirect(query, lookupWord)
}

export async function lookupLookupHub(term, accessToken, options) {
  const query = String(term || '').trim()
  if (!query) throw new Error('Enter a word or phrase to search')
  const opts = options || {}
  const selectedWordOverride = String(opts.selectedWord || '').trim()

  let dictionaryLookupWord = dictionaryPrimaryWord(query)
  let reverseMatchWord = null
  let reverseCandidates = []
  let reverseResult = null

  if (phraseWordCount(query) > 1) {
    reverseResult = opts.reverseResult || await lookupReverseDictionary(query, accessToken)
    reverseCandidates = collectReverseDictionaryCandidates(reverseResult)
    const word = selectedWordOverride || pickFirstReverseDictionaryWord(reverseResult)
    if (word) {
      reverseMatchWord = word
      dictionaryLookupWord = word
    }
  }

  const resolved = await resolveDictionaryWord(query, accessToken, dictionaryLookupWord)
  const thesaurusWord = resolved.resolvedWord || dictionaryLookupWord || query
  const rhymeWord = reverseMatchWord || resolved.lookupWord || query

  const [thesaurus, alliteration, rhyme] = await Promise.all([
    lookupThesaurus(thesaurusWord, accessToken),
    lookupAlliteration(query, accessToken),
    lookupRhymes(rhymeWord, accessToken),
  ])

  return {
    query: query,
    resolvedWord: resolved.resolvedWord,
    lookupWord: resolved.lookupWord,
    dictionaryMatch: resolved.matchType,
    matchedSuggestion: resolved.matchedSuggestion || null,
    reverseMatchWord: reverseMatchWord,
    selectedReverseWord: reverseMatchWord,
    reverseCandidates: reverseCandidates,
    dictionary: resolved.dictionary,
    thesaurus: thesaurus,
    alliteration: alliteration,
    rhyme: rhyme,
  }
}

async function fetchResolverJson(path, payload, accessToken) {
  const response = await fetchViaMediaProxy(path, accessToken, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload || {}),
  })
  return response.json()
}

async function lookupDictionaryDirect(term) {
  const word = String(term || '').trim()
  const payload = await fetchJson(DICTIONARY_BASE_URL + '/' + encodeURIComponent(word.toLowerCase()))
  return Array.isArray(payload) ? payload : []
}

async function lookupThesaurusDirect(term) {
  const word = String(term || '').trim()
  const [synonyms, antonyms, related] = await Promise.all([
    fetchDatamuse({ rel_syn: word, max: 16 }),
    fetchDatamuse({ rel_ant: word, max: 12 }),
    fetchDatamuse({ rel_trg: word, max: 12 }),
  ])
  return {
    synonyms: normalizeDatamuseResults(synonyms),
    antonyms: normalizeDatamuseResults(antonyms),
    related: normalizeDatamuseResults(related),
  }
}

async function lookupRhymesDirect(term) {
  const word = String(term || '').trim()
  const [perfect, near, soundsLike] = await Promise.all([
    fetchDatamuse({ rel_rhy: word, max: 24 }),
    fetchDatamuse({ rel_nry: word, max: 24 }),
    fetchDatamuse({ sl: word, max: 24 }),
  ])
  const perfectResults = normalizeDatamuseResults(perfect)
  const nearResults = normalizeDatamuseResults(near)
  const soundsLikeResults = normalizeDatamuseResults(soundsLike)
  return {
    perfect: perfectResults.length ? perfectResults : soundsLikeResults.slice(0, 24),
    near: nearResults,
    soundsLike: soundsLikeResults,
  }
}

async function lookupReverseDictionaryDirect(term) {
  const phrase = String(term || '').trim()
  const [meaning, topic, examples] = await Promise.all([
    fetchDatamuse({ ml: phrase, max: 18 }),
    fetchDatamuse({ topics: phrase, max: 12 }),
    fetchDatamuse({ sp: phrase.replace(/\s+/g, '*') + '*', max: 8 }),
  ])
  return {
    meaning: normalizeDatamuseResults(meaning),
    topic: normalizeDatamuseResults(topic),
    examples: normalizeDatamuseResults(examples),
  }
}

async function lookupPhraseIdeasDirect(term) {
  const phrase = String(term || '').trim()
  const seeds = getPhraseSearchSeeds(phrase)
  const keywordFollowPromises = seeds.keywords.map(function(keyword) {
    return fetchDatamuse({ rel_bga: keyword, max: 6 })
  })
  const keywordPrecedePromises = seeds.keywords.map(function(keyword) {
    return fetchDatamuse({ rel_bgb: keyword, max: 6 })
  })
  const [followByPhrase, followByTrailing, followByTrailingPair, precedeByPhrase, precedeByLeading, precedeByLeadingPair, relatedByTopic, relatedByMeaning, spellingByPattern, spellingByMeaning, keywordFollowResults, keywordPrecedeResults] = await Promise.all([
    fetchDatamuse({ rc: seeds.fullPhrase, max: 8 }),
    fetchDatamuse({ rel_bga: seeds.trailing || phrase, max: 8 }),
    fetchDatamuse({ rc: seeds.trailingPair || seeds.trailing || phrase, max: 8 }),
    fetchDatamuse({ lc: seeds.fullPhrase, max: 8 }),
    fetchDatamuse({ rel_bgb: seeds.leading || phrase, max: 8 }),
    fetchDatamuse({ lc: seeds.leadingPair || seeds.leading || phrase, max: 8 }),
    fetchDatamuse({ rel_trg: seeds.topic, max: 12 }),
    fetchDatamuse({ ml: seeds.topic, max: 12 }),
    fetchDatamuse({ sp: seeds.pattern, max: 12 }),
    fetchDatamuse({ ml: seeds.fullPhrase, max: 12 }),
    Promise.all(keywordFollowPromises),
    Promise.all(keywordPrecedePromises),
  ])
  const followContext = mergeDatamuseResults([
    followByPhrase,
    followByTrailing,
    followByTrailingPair,
  ].concat(keywordFollowResults || []), 16)
  const precedeContext = mergeDatamuseResults([
    precedeByPhrase,
    precedeByLeading,
    precedeByLeadingPair,
  ].concat(keywordPrecedeResults || []), 16)
  const relatedContext = mergeDatamuseResults([relatedByTopic, relatedByMeaning], 16)
  const spellingContext = mergeDatamuseResults([spellingByPattern, spellingByMeaning], 16)
  return {
    followContext: backfillPhraseContext(followContext, relatedContext, 16),
    precedeContext: backfillPhraseContext(precedeContext, spellingContext, 16),
    related: relatedContext,
    spelling: spellingContext,
  }
}

async function lookupAlliterationDirect(term) {
  const phrase = String(term || '').trim()
  const soundKey = getAlliterationSoundKey(phrase)
  const relatedByMeaning = normalizeDatamuseResults(
    await fetchDatamuse({ rel_jja: phrase, max: 24 })
  )
  const spelledLike = soundKey
    ? normalizeDatamuseResults(await fetchDatamuse({ sp: soundKey + '*', max: 24 }))
    : []
  const soundsLike = normalizeDatamuseResults(
    await fetchDatamuse({ sl: phrase, max: 16 })
  )
  const related = mergeDatamuseResults([relatedByMeaning, spelledLike, soundsLike], 48)
  const alliterative = filterAlliterativeWords(related, phrase)
  return {
    alliterative: alliterative,
    related: related,
  }
}

export async function lookupDictionary(term, accessToken) {
  const word = String(term || '').trim()
  if (!word) throw new Error('Enter a word to look up')
  try {
    const payload = await fetchResolverJson('/lyrics-dictionary', { term: word }, accessToken)
    return Array.isArray(payload) ? payload : []
  } catch (error) {
    return lookupDictionaryDirect(word)
  }
}

export async function lookupThesaurus(term, accessToken) {
  const word = String(term || '').trim()
  if (!word) throw new Error('Enter a word to look up')
  try {
    const payload = await fetchResolverJson('/lyrics-thesaurus', { term: word }, accessToken)
    return {
      synonyms: normalizeDatamuseResults(payload && payload.synonyms),
      antonyms: normalizeDatamuseResults(payload && payload.antonyms),
      related: normalizeDatamuseResults(payload && payload.related),
    }
  } catch (error) {
    return lookupThesaurusDirect(word)
  }
}

export async function lookupRhymes(term, accessToken) {
  const word = String(term || '').trim()
  if (!word) throw new Error('Enter a word to rhyme')
  try {
    const payload = await fetchResolverJson('/lyrics-rhyme', { term: word }, accessToken)
    return {
      perfect: normalizeDatamuseResults(payload && payload.perfect),
      near: normalizeDatamuseResults(payload && payload.near),
      soundsLike: normalizeDatamuseResults(payload && payload.soundsLike),
    }
  } catch (error) {
    return lookupRhymesDirect(word)
  }
}

export async function lookupReverseDictionary(term, accessToken) {
  const phrase = String(term || '').trim()
  if (!phrase) throw new Error('Describe the word or idea you are searching for')
  try {
    const payload = await fetchResolverJson('/lyrics-reverse-dictionary', { term: phrase }, accessToken)
    return {
      meaning: normalizeDatamuseResults(payload && payload.meaning),
      topic: normalizeDatamuseResults(payload && payload.topic),
      examples: normalizeDatamuseResults(payload && payload.examples),
    }
  } catch (error) {
    return lookupReverseDictionaryDirect(phrase)
  }
}

export async function lookupPhraseIdeas(term, accessToken) {
  const phrase = String(term || '').trim()
  if (!phrase) throw new Error('Enter a phrase or a seed word')
  try {
    const payload = await fetchResolverJson('/lyrics-phrases', { term: phrase }, accessToken)
    return {
      followContext: normalizeDatamuseResults(payload && (payload.followContext || payload.rightContext)),
      precedeContext: normalizeDatamuseResults(payload && (payload.precedeContext || payload.leftContext)),
      related: normalizeDatamuseResults(payload && payload.related),
      spelling: normalizeDatamuseResults(payload && payload.spelling),
    }
  } catch (error) {
    return lookupPhraseIdeasDirect(phrase)
  }
}

export async function lookupAlliteration(term, accessToken) {
  const phrase = String(term || '').trim()
  if (!phrase) throw new Error('Enter a word or phrase to shape alliteration')
  try {
    const payload = await fetchResolverJson('/lyrics-alliteration', { term: phrase }, accessToken)
    return {
      alliterative: normalizeDatamuseResults(payload && payload.alliterative),
      related: normalizeDatamuseResults(payload && payload.related),
    }
  } catch (error) {
    return lookupAlliterationDirect(phrase)
  }
}
