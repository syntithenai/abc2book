/** Small words left lowercase in song titles unless first (or last) word. */
const SMALL_WORDS = {
  a: true,
  an: true,
  the: true,
  and: true,
  but: true,
  or: true,
  for: true,
  nor: true,
  on: true,
  at: true,
  to: true,
  from: true,
  by: true,
  in: true,
  of: true,
  de: true,
  if: true,
  as: true,
}

const APOSTROPHE_FIXES = {
  DONT: "Don't",
  CANT: "Can't",
  IVE: "I've",
  YOURE: "You're",
  ILL: "I'll",
  IM: "I'm",
  WONT: "Won't",
  ISNT: "Isn't",
  THATS: "That's",
  WHOS: "Who's",
  ITS: "It's",
}

function stripWordPunctuation(word) {
  return String(word || '').replace(/^["'(]+|["'),.?!:;]+$/g, '')
}

function titleCaseWord(word) {
  if (!word) return word
  const core = stripWordPunctuation(word)
  const upper = core.toUpperCase()
  if (Object.prototype.hasOwnProperty.call(APOSTROPHE_FIXES, upper)) {
    const fixed = APOSTROPHE_FIXES[upper]
    return word.replace(core, fixed)
  }
  const parts = word.split(/([-'])/)
  return parts.map(function(part) {
    if (part === '-' || part === "'") return part
    if (!part) return part
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
  }).join('')
}

/**
 * Title-case a song name: capitalize major words; keep articles/prepositions/
 * conjunctions lowercase unless first or last word.
 * Examples: "ROOTS DOWN" → "Roots Down", "WHERE DOES THE WATER GO" → "Where Does the Water Go"
 */
export function capitalizeSongTitle(raw) {
  const text = String(raw == null ? '' : raw).trim()
  if (!text) return ''

  const tokens = text.split(/(\s+)/)
  const wordIndexes = []
  tokens.forEach(function(token, index) {
    if (token && !/^\s+$/.test(token)) wordIndexes.push(index)
  })

  wordIndexes.forEach(function(tokenIndex, wordIndex) {
    const word = tokens[tokenIndex]
    const core = stripWordPunctuation(word).toLowerCase()
    const isEdge = wordIndex === 0 || wordIndex === wordIndexes.length - 1
    if (!isEdge && Object.prototype.hasOwnProperty.call(SMALL_WORDS, core)) {
      tokens[tokenIndex] = word.replace(stripWordPunctuation(word), core)
      return
    }
    tokens[tokenIndex] = titleCaseWord(word)
  })

  return tokens.join('')
}

/** True when title is empty or already matches capitalizeSongTitle. */
export function isSongTitleCapitalized(raw) {
  const text = String(raw == null ? '' : raw).trim()
  if (!text) return true
  return text === capitalizeSongTitle(text)
}
