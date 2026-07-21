import { assertModuleQuality, assertUniqueModuleIds } from './feedContentQuality'
import { PRACTICE_SETTINGS_STORAGE_KEY, loadPracticeSettings, clampSkillLevel } from './practiceSessionSettings'
import { buildQuizBundle } from './feedQuizUtils'
import { getTheoryLessonExample, getTheoryLessonExampleMeta } from './feedTheoryExamples'

let contentCache = null

/** How far above the preferred skill band infinite-scroll may open when hungry. */
export const FEED_SKILL_EXPAND_STEP = 2
export const FEED_SKILL_EXPAND_MAX = 10

export async function loadFeedContentModules() {
  if (contentCache) return contentCache
  const mod = await import('./feedContent/index')
  contentCache = {
    theory: mod.theoryModules || [],
    singing: mod.singingModules || [],
  }
  return contentCache
}

export function clearFeedContentCache() {
  contentCache = null
}

export function getAllTheoryModules(bundle) {
  return (bundle && bundle.theory) || (contentCache && contentCache.theory) || []
}

export function getAllSingingModules(bundle) {
  return (bundle && bundle.singing) || (contentCache && contentCache.singing) || []
}

/**
 * Preferred difficulty window for a skill, plus optional upward expansion.
 * options.expand: extra levels above the preferred max (for “need more cards”).
 * options.allowMin / options.allowMax: hard override of the window.
 */
export function skillDifficultyWindow(effectiveSkill, options) {
  const opts = options || {}
  const skill = Number(effectiveSkill)
  const s = Number.isFinite(skill) ? skill : 0
  const expand = Math.max(0, Number(opts.expand) || 0)
  const preferMin = Math.max(0, s - 2)
  const preferMax = s + 1
  const min = opts.allowMin != null ? Number(opts.allowMin) : preferMin
  const max = opts.allowMax != null
    ? Number(opts.allowMax)
    : Math.min(FEED_SKILL_EXPAND_MAX, preferMax + expand)
  return {
    min: Math.max(0, Number.isFinite(min) ? min : preferMin),
    max: Math.max(0, Number.isFinite(max) ? max : preferMax),
    preferMin: preferMin,
    preferMax: preferMax,
  }
}

export function modulesForSkill(modules, effectiveSkill, options) {
  const win = skillDifficultyWindow(effectiveSkill, options)
  return (modules || []).filter(function(m) {
    const d = Number(m.difficulty)
    return Number.isFinite(d) && d >= win.min && d <= win.max
  })
}

/**
 * Feed skill: start at 0 when practice settings are unset so beginners see
 * easy content first. When settings exist, use the clamped practice skill.
 */
export function getEffectiveTheorySkill() {
  try {
    const raw = localStorage.getItem(PRACTICE_SETTINGS_STORAGE_KEY)
    if (!raw) return 0
    return clampSkillLevel(loadPracticeSettings().skillLevel)
  } catch (e) {
    return 0
  }
}

function makeId(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 9)
}

export function applyTuneContext(item, tune) {
  if (!item || !tune) return item
  const name = String(tune.name || '').trim()
  const key = String(tune.key || '').trim()
  if (!name && !key) return item
  const line = 'Try this with “' + (name || 'your tune') + '”'
    + (key ? (' (key ' + key + ').') : '.')
  const next = Object.assign({}, item)
  next.teaser = (next.teaser ? next.teaser + ' ' : '') + line
  return next
}

/**
 * Lesson/tip card for one content module. Content cards carry no tune or
 * practice context — they stand alone. Quizzes are bundled separately via
 * bundleContentQuizzes so each quiz card gets up to 5 questions.
 */
export function moduleToFeedItems(module) {
  if (!module) return []
  const now = Date.now()
  const type = module.kind === 'warmup_idea'
    ? 'warmup_idea'
    : (module.kind === 'singing_tip' ? 'singing_tip' : 'theory_lesson')
  const base = {
    id: makeId(module.id),
    type: type,
    tuneId: null,
    artist: '',
    headline: module.title,
    teaser: String(module.tryThis || module.body || '').slice(0, 140),
    body: module.body,
    imageUrl: '',
    source: 'content',
    sourceUrl: '',
    factHash: 'content_' + module.id,
    generation: 'content',
    quiz: null,
    lessonId: module.id,
    createdAt: now,
    status: 'queued',
    lastShownAt: null,
    dismissedAt: null,
    expandedAt: null,
    answeredAt: null,
    reuseEligible: false,
    srsDueAt: null,
    isNew: false,
    attemptCount: 0,
    tryThis: module.tryThis || '',
    difficulty: module.difficulty,
  }
  if (module.kind === 'theory_lesson') {
    const exMeta = getTheoryLessonExampleMeta(module.id)
    const exAbc = getTheoryLessonExample(module.id)
    if (exMeta && exMeta.caption) base.exampleCaption = exMeta.caption
    if (exAbc) base.exampleAbc = exAbc
    if (exMeta && exMeta.imageUrl) base.exampleImageUrl = exMeta.imageUrl
  }
  return [base]
}

/**
 * Group quizzes from all provided modules by track into 5-question quiz cards.
 */
export function bundleContentQuizzes(modules, options) {
  const opts = options || {}
  const byTrack = {}
  ;(modules || []).forEach(function(m) {
    if (!m) return
    const quizzes = Array.isArray(m.quizzes) ? m.quizzes : []
    if (!quizzes.length) return
    const track = String(m.track || 'general')
    if (!byTrack[track]) byTrack[track] = []
    quizzes.forEach(function(q) {
      byTrack[track].push({ module: m, quiz: q })
    })
  })

  const now = Date.now()
  const items = []
  Object.keys(byTrack).forEach(function(track) {
    const entries = byTrack[track]
    for (var i = 0; i < entries.length; i += 5) {
      const chunk = entries.slice(i, i + 5)
      if (chunk.length < 3) continue
      const quiz = buildQuizBundle({
        id: 'content_quiz_' + chunk[0].quiz.id,
        title: chunk[0].module.title,
        questions: chunk.map(function(e) { return e.quiz }),
      }, { targetCount: 5, rng: opts.rng })
      if (!quiz) continue
      var difficulty = 0
      chunk.forEach(function(e) {
        const d = Number(e.quiz.difficulty != null ? e.quiz.difficulty : e.module.difficulty)
        if (Number.isFinite(d) && d > difficulty) difficulty = d
      })
      items.push({
        id: makeId(track + '_quiz'),
        type: 'theory_quiz',
        tuneId: null,
        artist: '',
        headline: 'Quiz: ' + chunk[0].module.title,
        teaser: quiz.questions[0].prompt,
        body: '',
        imageUrl: '',
        source: 'content',
        sourceUrl: '',
        factHash: 'content_quiz_' + chunk[0].quiz.id + '_' + chunk.length,
        generation: 'content',
        quiz: quiz,
        lessonId: chunk[0].module.id,
        createdAt: now,
        status: 'queued',
        lastShownAt: null,
        dismissedAt: null,
        expandedAt: null,
        answeredAt: null,
        reuseEligible: false,
        srsDueAt: null,
        isNew: false,
        attemptCount: 0,
        difficulty: difficulty,
      })
    }
  })
  return items
}

export function validateContentBundle(bundle) {
  const theory = getAllTheoryModules(bundle)
  const singing = getAllSingingModules(bundle)
  const all = theory.concat(singing)
  const errors = []
  all.forEach(function(m) {
    assertModuleQuality(m).forEach(function(e) {
      errors.push((m && m.id) + ': ' + e)
    })
  })
  assertUniqueModuleIds(all).forEach(function(id) {
    errors.push('duplicate id ' + id)
  })
  return errors
}

export { assertModuleQuality, assertUniqueModuleIds }
