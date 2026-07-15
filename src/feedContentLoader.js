import { assertModuleQuality, assertUniqueModuleIds } from './feedContentQuality'
import { PRACTICE_SETTINGS_STORAGE_KEY } from './practiceSessionSettings'
import { loadPracticeSettings, clampSkillLevel } from './practiceSessionSettings'

let contentCache = null

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

export function modulesForSkill(modules, effectiveSkill) {
  const skill = Number(effectiveSkill)
  const s = Number.isFinite(skill) ? skill : 0
  const min = Math.max(0, s - 2)
  const max = s + 1
  return (modules || []).filter(function(m) {
    const d = Number(m.difficulty)
    return Number.isFinite(d) && d >= min && d <= max
  })
}

export function getEffectiveTheorySkill() {
  try {
    const raw = localStorage.getItem(PRACTICE_SETTINGS_STORAGE_KEY)
    if (!raw) return 0
  } catch (e) {
    return 0
  }
  return clampSkillLevel(loadPracticeSettings().skillLevel)
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

export function moduleToFeedItems(module, context) {
  if (!module) return []
  const ctx = context || {}
  const now = Date.now()
  const items = []
  const type = module.kind === 'warmup_idea'
    ? 'warmup_idea'
    : (module.kind === 'singing_tip' ? 'singing_tip' : 'theory_lesson')
  let base = {
    id: makeId(module.id),
    type: type,
    tuneId: ctx.tune && ctx.tune.id != null ? String(ctx.tune.id) : null,
    artist: '',
    headline: module.title,
    teaser: String(module.body || '').slice(0, 140),
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
  if (module.tryThis) {
    base.teaser = String(module.tryThis).slice(0, 140)
  }
  base = applyTuneContext(base, ctx.tune)
  items.push(base)

  const quizzes = Array.isArray(module.quizzes) ? module.quizzes : []
  quizzes.forEach(function(q) {
    items.push({
      id: makeId(q.id || module.id),
      type: 'theory_quiz',
      tuneId: base.tuneId,
      artist: '',
      headline: 'Quiz: ' + module.title,
      teaser: q.prompt,
      body: '',
      imageUrl: '',
      source: 'content',
      sourceUrl: '',
      factHash: 'content_quiz_' + q.id,
      generation: 'content',
      quiz: q,
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
      difficulty: q.difficulty != null ? q.difficulty : module.difficulty,
    })
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
