/**
 * Smoke-test ABC parsing via abcjs.parseOnly.
 * Usage: node scripts/validateTheoryExampleAbc.cjs <full-abc-text>
 */
const abc = process.argv.slice(2).join('\n').trim()
if (!abc) {
  console.error('No ABC provided')
  process.exit(1)
}

global.document = {
  createElementNS: function() {
    return {
      setAttribute: function() {},
      appendChild: function() {},
      style: {},
    }
  },
  createElement: function() {
    return {
      setAttribute: function() {},
      appendChild: function() {},
      style: {},
    }
  },
}

const abcjs = require('abcjs')

try {
  const parsed = abcjs.parseOnly(abc)
  const tunes = Array.isArray(parsed) ? parsed : [parsed]
  if (!tunes.length) {
    console.error('abcjs parseOnly produced no tunes')
    process.exit(1)
  }
  const hasNotes = String(abc).split(/\n/).some(function(line) {
    const t = String(line || '').trim()
    if (!t || /^[A-Za-z]:/.test(t) || t.startsWith('%%')) return false
    return /[A-Ga-g]/.test(t)
  })
  if (!hasNotes) {
    console.error('ABC has no note letters')
    process.exit(1)
  }
  if (/"[A-Ga-g][^"]*maj|"Am"|"Dm7"/.test(abc)) {
    console.error('ABC uses chord symbols without notes')
    process.exit(1)
  }
  process.exit(0)
} catch (err) {
  console.error(String(err && err.message ? err.message : err))
  process.exit(1)
}
