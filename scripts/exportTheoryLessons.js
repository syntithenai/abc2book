/**
 * Export theory lesson modules as JSON for generate_theory_examples.py.
 * Usage: node scripts/exportTheoryLessons.js [--id lesson-id]
 */
import foundations from '../src/feedContent/theory/foundations.js'
import italian from '../src/feedContent/theory/italian.js'
import chords from '../src/feedContent/theory/chords.js'
import transposition from '../src/feedContent/theory/transposition.js'
import harmony from '../src/feedContent/theory/harmony.js'
import history from '../src/feedContent/theory/history.js'
import styles from '../src/feedContent/theory/styles.js'

const args = process.argv.slice(2)
const filterId = args.indexOf('--id') >= 0 ? args[args.indexOf('--id') + 1] : null

const lessons = []
  .concat(foundations, italian, chords, transposition, harmony, history, styles)
  .filter(function(m) { return m && m.kind === 'theory_lesson' })
  .filter(function(m) { return !filterId || m.id === filterId })

const out = lessons.map(function(m) {
  return {
    id: m.id,
    title: m.title,
    track: m.track,
    body: m.body,
    tags: m.tags || [],
    difficulty: m.difficulty,
    quizzes: (m.quizzes || []).map(function(q) {
      return { prompt: q.prompt, explain: q.explain }
    }),
  }
})
process.stdout.write(JSON.stringify(out, null, 2))
