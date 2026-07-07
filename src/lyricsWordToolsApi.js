import { fetchViaMediaProxy } from './mediaProxyClient'

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

export async function lookupDictionary(term, accessToken) {
  const word = String(term || '').trim()
  if (!word) throw new Error('Enter a word to look up')
  const payload = await fetchResolverJson('/lyrics-dictionary', { term: word }, accessToken)
  return Array.isArray(payload) ? payload : []
}

export async function lookupThesaurus(term, accessToken) {
  const word = String(term || '').trim()
  if (!word) throw new Error('Enter a word to look up')
  const payload = await fetchResolverJson('/lyrics-thesaurus', { term: word }, accessToken)
  return {
    synonyms: normalizeDatamuseResults(payload && payload.synonyms),
    antonyms: normalizeDatamuseResults(payload && payload.antonyms),
    related: normalizeDatamuseResults(payload && payload.related),
  }
}

export async function lookupRhymes(term, accessToken) {
  const word = String(term || '').trim()
  if (!word) throw new Error('Enter a word to rhyme')
  const payload = await fetchResolverJson('/lyrics-rhyme', { term: word }, accessToken)
  return {
    perfect: normalizeDatamuseResults(payload && payload.perfect),
    near: normalizeDatamuseResults(payload && payload.near),
    soundsLike: normalizeDatamuseResults(payload && payload.soundsLike),
  }
}

export async function lookupReverseDictionary(term, accessToken) {
  const phrase = String(term || '').trim()
  if (!phrase) throw new Error('Describe the word or idea you are searching for')
  const payload = await fetchResolverJson('/lyrics-reverse-dictionary', { term: phrase }, accessToken)
  return {
    meaning: normalizeDatamuseResults(payload && payload.meaning),
    topic: normalizeDatamuseResults(payload && payload.topic),
    examples: normalizeDatamuseResults(payload && payload.examples),
  }
}

export async function lookupPhraseIdeas(term, accessToken) {
  const phrase = String(term || '').trim()
  if (!phrase) throw new Error('Enter a phrase or a seed word')
  const payload = await fetchResolverJson('/lyrics-phrases', { term: phrase }, accessToken)
  return {
    leftContext: normalizeDatamuseResults(payload && payload.leftContext),
    rightContext: normalizeDatamuseResults(payload && payload.rightContext),
    spelling: normalizeDatamuseResults(payload && payload.spelling),
  }
}
