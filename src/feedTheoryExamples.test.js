import { loadFeedContentModules, moduleToFeedItems } from './feedContentLoader'
import {
  getTheoryLessonExample,
  getTheoryLessonExampleMeta,
  isImageTheoryExample,
  isTheoryNotationLesson,
  theoryLessonExampleGaps,
  THEORY_LESSON_EXAMPLES,
} from './feedTheoryExamples'

function planOverlapsLesson(plan, module) {
  const tokens = function(text) {
    return String(text || '').toLowerCase().match(/[a-z0-9]{3,}/g) || []
  }
  const planSet = {}
  tokens(plan).forEach(function(t) { planSet[t] = true })
  const lessonText = [
    module.title,
    (module.tags || []).join(' '),
    String(module.body || '').slice(0, 400),
  ].join(' ')
  return tokens(lessonText).some(function(t) { return planSet[t] })
}

function notationHasLedgerLines(abc) {
  return /[A-Ga-g][,']/.test(String(abc || ''))
}

function notationHasBarlines(abc) {
  return String(abc || '').indexOf('|') >= 0
}

describe('feedTheoryExamples', function() {
  it('covers every theory lesson module', async function() {
    const bundle = await loadFeedContentModules()
    const lessons = (bundle.theory || []).filter(function(m) {
      return m && m.kind === 'theory_lesson'
    })
    expect(lessons.length).toBeGreaterThan(30)
    expect(Object.keys(THEORY_LESSON_EXAMPLES).length).toBe(lessons.length)
    expect(theoryLessonExampleGaps(lessons)).toEqual([])
  })

  it('requires illustrationPlan on every example', async function() {
    const bundle = await loadFeedContentModules()
    const lessons = (bundle.theory || []).filter(function(m) {
      return m && m.kind === 'theory_lesson'
    })
    lessons.forEach(function(module) {
      const meta = getTheoryLessonExampleMeta(module.id)
      expect(meta).toBeTruthy()
      if (meta.kind === 'none') return
      expect(meta.illustrationPlan).toBeTruthy()
      expect(meta.illustrationPlan.length).toBeGreaterThanOrEqual(40)
      expect(planOverlapsLesson(meta.illustrationPlan, module)).toBe(true)
    })
  })

  it('uses images for history/styles and notation for theory mechanics', async function() {
    const bundle = await loadFeedContentModules()
    const lessons = (bundle.theory || []).filter(function(m) {
      return m && m.kind === 'theory_lesson'
    })
    lessons.forEach(function(module) {
      const meta = getTheoryLessonExampleMeta(module.id)
      if (meta && meta.kind === 'none') return
      if (isImageTheoryExample(module.id, module)) {
        const meta = getTheoryLessonExampleMeta(module.id)
        expect(meta.imageUrl).toBeTruthy()
        if (module.track === 'history' || module.track === 'styles') {
          expect(meta.imageUrl).toMatch(/wikimedia|wikipedia/i)
        }
        expect(getTheoryLessonExample(module.id)).toBeNull()
        return
      }
      expect(isTheoryNotationLesson(module.id, module)).toBe(true)
      const abc = getTheoryLessonExample(module.id)
      expect(abc).toBeTruthy()
      expect(abc.indexOf('K:')).toBeGreaterThanOrEqual(0)
      expect(abc.indexOf('M:')).toBeGreaterThanOrEqual(0)
      expect(notationHasBarlines(abc)).toBe(true)
      expect(notationHasLedgerLines(abc)).toBe(false)
    })
  })

  it('attaches only exampleAbc to mechanics lessons and only image to culture lessons', async function() {
    const bundle = await loadFeedContentModules()
    const pitch = (bundle.theory || []).find(function(m) {
      return m && m.id === 'foundations-pitch-01'
    })
    const baroque = (bundle.theory || []).find(function(m) {
      return m && m.id === 'styles-baroque-01'
    })
    const pitchItems = moduleToFeedItems(pitch)
    const baroqueItems = moduleToFeedItems(baroque)
    expect(pitchItems[0].exampleAbc).toBeTruthy()
    expect(pitchItems[0].exampleImageUrl).toBeFalsy()
    expect(baroqueItems[0].exampleImageUrl).toMatch(/wikimedia/i)
    expect(baroqueItems[0].exampleAbc).toBeFalsy()
  })

  it('uses circle-of-fifths diagram image for keys-circle lesson', async function() {
    const bundle = await loadFeedContentModules()
    const module = (bundle.theory || []).find(function(m) {
      return m && m.id === 'keys-circle-01'
    })
    const items = moduleToFeedItems(module)
    expect(items[0].exampleImageUrl).toMatch(/circle-of-fifths/)
    expect(items[0].exampleAbc).toBeFalsy()
  })

  it('uses twelve-bar blues notation for styles-blues lesson', async function() {
    const bundle = await loadFeedContentModules()
    const module = (bundle.theory || []).find(function(m) {
      return m && m.id === 'styles-blues-01'
    })
    const items = moduleToFeedItems(module)
    expect(items[0].exampleAbc).toMatch(/I\(C\)/)
    expect(items[0].exampleImageUrl).toBeFalsy()
  })

  it('omits illustration for capo lesson', async function() {
    const bundle = await loadFeedContentModules()
    const module = (bundle.theory || []).find(function(m) {
      return m && m.id === 'transpose-capo-01'
    })
    const items = moduleToFeedItems(module)
    expect(items[0].exampleAbc).toBeFalsy()
    expect(items[0].exampleImageUrl).toBeFalsy()
  })

  it('attaches exampleIllustrationPlan to notation theory lesson feed items', async function() {
    const bundle = await loadFeedContentModules()
    const module = (bundle.theory || []).find(function(m) {
      return m && m.id === 'foundations-pitch-01'
    })
    const items = moduleToFeedItems(module)
    expect(items.length).toBe(1)
    expect(items[0].exampleAbc).toBeTruthy()
    expect(items[0].exampleAbc.indexOf('V:1')).toBeGreaterThanOrEqual(0)
    expect(items[0].exampleIllustrationPlan).toMatch(/scale|staff|pitch|clef/i)
    expect(items[0].exampleCaption).toBeTruthy()
    expect(items[0].exampleCaption.length).toBeLessThan(items[0].exampleIllustrationPlan.length)
  })
})
