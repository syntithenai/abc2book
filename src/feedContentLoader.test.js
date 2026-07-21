import {
  validateContentBundle,
  clearFeedContentCache,
  loadFeedContentModules,
  modulesForSkill,
  getEffectiveTheorySkill,
  skillDifficultyWindow,
} from './feedContentLoader'
import { assertModuleQuality } from './feedContentQuality'
import { FEED_CONTENT_GOLDENS } from './feedContent/goldens'
import { PRACTICE_SETTINGS_STORAGE_KEY } from './practiceSessionSettings'

describe('feedContent quality', function() {
  beforeEach(function() {
    clearFeedContentCache()
    localStorage.removeItem(PRACTICE_SETTINGS_STORAGE_KEY)
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

  it('modulesForSkill expand opens higher difficulties', async function() {
    const bundle = await loadFeedContentModules()
    const base = modulesForSkill(bundle.theory, 0)
    const expanded = modulesForSkill(bundle.theory, 0, { expand: 4 })
    expect(expanded.length).toBeGreaterThan(base.length)
    expect(expanded.some(function(m) { return m.difficulty >= 3 })).toBe(true)
    const win = skillDifficultyWindow(0, { expand: 4 })
    expect(win.max).toBe(5)
  })

  it('getEffectiveTheorySkill starts at 0 when practice settings unset', function() {
    expect(getEffectiveTheorySkill()).toBe(0)
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
