import { validateContentBundle, clearFeedContentCache, loadFeedContentModules, modulesForSkill } from './feedContentLoader'
import { assertModuleQuality } from './feedContentQuality'
import { FEED_CONTENT_GOLDENS } from './feedContent/goldens'

describe('feedContent quality', function() {
  beforeEach(function() {
    clearFeedContentCache()
  })

  it('loads modules and passes quality gate', async function() {
    const bundle = await loadFeedContentModules()
    const errors = validateContentBundle(bundle)
    expect(errors).toEqual([])
    expect((bundle.theory || []).length).toBeGreaterThan(30)
    expect((bundle.singing || []).length).toBeGreaterThan(15)
  })

  it('goldens match module correct answers', async function() {
    const bundle = await loadFeedContentModules()
    const all = (bundle.theory || []).concat(bundle.singing || [])
    const byQuiz = {}
    all.forEach(function(m) {
      (m.quizzes || []).forEach(function(q) {
        byQuiz[q.id] = q
      })
    })
    Object.keys(FEED_CONTENT_GOLDENS).forEach(function(quizId) {
      const q = byQuiz[quizId]
      expect(q).toBeTruthy()
      const want = FEED_CONTENT_GOLDENS[quizId]
      const correct = (q.choices || []).find(function(c) { return c.correct })
      expect(correct).toBeTruthy()
      expect(correct.id).toBe(want)
    })
  })

  it('modulesForSkill filters difficulty band', async function() {
    const bundle = await loadFeedContentModules()
    const at0 = modulesForSkill(bundle.theory, 0)
    expect(at0.every(function(m) { return m.difficulty <= 1 })).toBe(true)
    const at8 = modulesForSkill(bundle.theory, 8)
    expect(at8.some(function(m) { return m.difficulty >= 6 })).toBe(true)
  })

  it('assertModuleQuality rejects thin theory', function() {
    const errors = assertModuleQuality({
      id: 'x',
      title: 'X',
      track: 't',
      kind: 'theory_lesson',
      difficulty: 1,
      body: 'Too short',
      quizzes: [],
    })
    expect(errors.length).toBeGreaterThan(0)
  })
})
