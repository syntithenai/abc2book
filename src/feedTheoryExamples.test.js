import { loadFeedContentModules, moduleToFeedItems } from './feedContentLoader'
import {
  getTheoryLessonExample,
  getTheoryLessonExampleMeta,
  isHistoryOrPortraitExample,
  theoryLessonExampleGaps,
  THEORY_LESSON_EXAMPLES,
} from './feedTheoryExamples'

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

  it('renders abc for notation lessons but uses images for history', async function() {
    const bundle = await loadFeedContentModules()
    const lessons = (bundle.theory || []).filter(function(m) {
      return m && m.kind === 'theory_lesson'
    })
    lessons.forEach(function(module) {
      if (isHistoryOrPortraitExample(module.id, module)) {
        const meta = getTheoryLessonExampleMeta(module.id)
        expect(meta.imageUrl).toBeTruthy()
        expect(getTheoryLessonExample(module.id)).toBeNull()
        return
      }
      const abc = getTheoryLessonExample(module.id)
      expect(abc).toBeTruthy()
      expect(abc.indexOf('K:')).toBeGreaterThanOrEqual(0)
      expect(abc).not.toMatch(/"[A-Ga-g][^"]*maj|"Am"|"Dm7"/)
    })
  })

  it('attaches exampleAbc to notation theory lesson feed items', async function() {
    const bundle = await loadFeedContentModules()
    const module = (bundle.theory || []).find(function(m) {
      return m && m.id === 'foundations-pitch-01'
    })
    const items = moduleToFeedItems(module)
    expect(items.length).toBe(1)
    expect(items[0].exampleAbc).toBeTruthy()
    expect(items[0].exampleAbc.indexOf('V:1')).toBeGreaterThanOrEqual(0)
    expect(items[0].exampleCaption).toMatch(/scale/i)
  })

  it('attaches portrait image to history lesson feed items', async function() {
    const bundle = await loadFeedContentModules()
    const module = (bundle.theory || []).find(function(m) {
      return m && m.id === 'history-bach-01'
    })
    const items = moduleToFeedItems(module)
    expect(items.length).toBe(1)
    expect(items[0].exampleImageUrl).toMatch(/wikimedia/i)
    expect(items[0].exampleAbc).toBeFalsy()
    expect(items[0].imageUrl).toBeFalsy()
  })
})
