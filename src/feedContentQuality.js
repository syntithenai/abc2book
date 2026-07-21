/**
 * Structural quality gate for feed content modules.
 */

import { getTheoryLessonExample, getTheoryLessonExampleMeta } from './feedTheoryExamples'

var ACTION_RE = /\b(hum|breathe|sing|mark|glide|try|feel|notice|hold|sip|stop|practice|speak|listen|count|map|open|release|slide)\b/i

export function assertModuleQuality(module) {
  const errors = []
  if (!module || typeof module !== 'object') {
    return ['module missing']
  }
  if (!module.id) errors.push('id required')
  if (!module.title) errors.push('title required')
  if (!module.track) errors.push('track required')
  if (!module.kind) errors.push('kind required')
  const diff = Number(module.difficulty)
  if (!Number.isFinite(diff) || diff < 0 || diff > 10) errors.push('difficulty 0..10 required')

  const body = String(module.body || '')
  const kind = module.kind
  if (kind === 'theory_lesson') {
    if (body.length < 400) errors.push('theory body too short')
    if (body.split(/\n\n+/).filter(Boolean).length < 2) errors.push('theory needs >=2 paragraphs')
    const exMeta = getTheoryLessonExampleMeta(module.id)
    if (!exMeta || (!exMeta.abc && !exMeta.imageUrl)) {
      errors.push('theory example (abc or image) required')
    } else if (exMeta.kind !== 'image' && !getTheoryLessonExample(module.id) && !exMeta.imageUrl) {
      errors.push('theory example abc must render')
    }
    const quizzes = Array.isArray(module.quizzes) ? module.quizzes : []
    if (quizzes.length < 2) errors.push('theory needs >=2 quizzes')
    quizzes.forEach(function(q) {
      const qErr = assertQuizQuality(q)
      qErr.forEach(function(e) { errors.push((q && q.id) + ': ' + e) })
    })
  } else if (kind === 'singing_tip' || kind === 'warmup_idea') {
    if (body.length < 120 || body.length > 600) errors.push('singing body length out of range')
    const tryThis = String(module.tryThis || '')
    if (!tryThis) errors.push('tryThis required')
    else if (!ACTION_RE.test(tryThis)) errors.push('tryThis needs action verb')
    if (Array.isArray(module.quizzes)) {
      module.quizzes.forEach(function(q) {
        assertQuizQuality(q).forEach(function(e) { errors.push((q && q.id) + ': ' + e) })
      })
    }
  }

  const blob = body + ' ' + String(module.tryThis || '')
  if (/\b(TODO|TBD|lorem ipsum)\b/i.test(blob)) errors.push('placeholder text forbidden')

  return errors
}

export function assertQuizQuality(quiz) {
  const errors = []
  if (!quiz || typeof quiz !== 'object') return ['quiz missing']
  if (!quiz.id) errors.push('quiz id required')
  if (!quiz.prompt) errors.push('prompt required')
  if (!quiz.explain || String(quiz.explain).length < 20) errors.push('explain too short')
  if (quiz.type === 'mcq') {
    const choices = Array.isArray(quiz.choices) ? quiz.choices : []
    if (choices.length < 2) errors.push('mcq needs choices')
    const corrects = choices.filter(function(c) { return c && c.correct })
    if (corrects.length !== 1) errors.push('mcq needs exactly one correct')
    const texts = {}
    choices.forEach(function(c) {
      const t = String(c && c.text || '').toLowerCase()
      if (texts[t]) errors.push('duplicate choice text')
      texts[t] = true
    })
  } else if (quiz.type === 'truefalse') {
    const choices = Array.isArray(quiz.choices) ? quiz.choices : []
    const corrects = choices.filter(function(c) { return c && c.correct })
    if (corrects.length !== 1) errors.push('truefalse needs exactly one correct')
  }
  return errors
}

export function assertUniqueModuleIds(modules) {
  const seen = {}
  const dupes = []
  ;(modules || []).forEach(function(m) {
    if (!m || !m.id) return
    if (seen[m.id]) dupes.push(m.id)
    seen[m.id] = true
  })
  return dupes
}
