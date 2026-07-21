import {
  FEED_FEEDBACK_STORAGE_KEY,
  clearAllFeedFeedback,
  getAllFeedFeedback,
  getFeedFeedbackEntry,
  upsertFeedFeedback,
} from './feedFeedbackStore'
import { compressIllustrationPlan } from './feedFeedbackUtils'

describe('feedFeedbackUtils', function() {
  it('compresses illustration plans', function() {
    const plan = 'Display a treble clef with a short sequence of notes that lands on every line (E, G, B, D, F) and every space (F, A, C, E) of the five-line staff, using only notes that stay within the staff bounds.'
    const out = compressIllustrationPlan(plan)
    expect(out.length).toBeLessThan(plan.length)
    expect(out).toMatch(/treble clef/i)
    expect(out).not.toMatch(/^display/i)
  })

  it('compresses portrait-style illustration plans', function() {
    const plan = 'Portrait of Louis Armstrong playing trumpet — representative image for his swing phrasing and improvisation legacy.'
    const out = compressIllustrationPlan(plan)
    expect(out).toBe('Portrait of Louis Armstrong playing trumpet')
    expect(out).not.toMatch(/representative image/i)
  })

  it('drops representational tails from portrait prompts', function() {
    expect(compressIllustrationPlan(
      'Create a stylized portrait of J.S. Bach with surrounding icons representing a two-part invention, a gigue rhythm, and a keyboard manuscript.'
    )).toBe('stylized portrait of J.S. Bach')
    expect(compressIllustrationPlan(
      'Show a portrait of Mozart beside a four-measure staff excerpt illustrating an antecedent-consequent phrase with I–V–I harmony.'
    )).toBe('portrait of Mozart')
    expect(compressIllustrationPlan(
      'Jean Ritchie, Appalachian folk singer — representative image for women composers and tradition bearers.'
    )).toBe('Jean Ritchie')
  })
})

describe('feedFeedbackStore', function() {
  const item = {
    id: 'theory-lesson-1',
    lessonId: 'pitch-staff',
    type: 'theory_lesson',
    headline: 'Lines and spaces',
    body: 'The staff has five lines.',
    exampleAbc: 'X:1\nK:C\nC D E',
    exampleIllustrationPlan: 'Display a treble clef with notes on every line and space of the staff.',
  }

  beforeEach(function() {
    localStorage.removeItem(FEED_FEEDBACK_STORAGE_KEY)
  })

  it('autosaves feedback keyed by item id', function() {
    upsertFeedFeedback(item, 'Clear example')
    const entry = getFeedFeedbackEntry('theory-lesson-1')
    expect(entry.feedback).toBe('Clear example')
    expect(entry.title).toBe('Lines and spaces')
    expect(entry.notationExample).toBe('X:1\nK:C\nC D E')
    expect(entry.imageComment).toBeTruthy()
  })

  it('collates all feedback entries', function() {
    upsertFeedFeedback(item, 'One')
    upsertFeedFeedback({
      id: 'theory-lesson-2',
      headline: 'Rhythm',
      exampleImageUrl: 'https://example.com/img.jpg',
      exampleIllustrationPlan: 'Show a portrait of Mozart beside a phrase excerpt.',
    }, 'Two')
    const all = getAllFeedFeedback()
    expect(all).toHaveLength(2)
    const imageRow = all.find(function(row) { return row.itemId === 'theory-lesson-2' })
    expect(imageRow.imageLink).toBe('https://example.com/img.jpg')
    expect(imageRow.notationExample).toBeNull()
  })

  it('clears all feedback entries', function() {
    upsertFeedFeedback(item, 'One')
    expect(getAllFeedFeedback()).toHaveLength(1)
    clearAllFeedFeedback()
    expect(getAllFeedFeedback()).toHaveLength(0)
  })
})
