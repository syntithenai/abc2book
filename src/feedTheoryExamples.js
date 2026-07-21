import { buildAbcSnippet } from './abcSnippetPreview'
import { THEORY_LESSON_EXAMPLES } from './feedContent/theory/examples'

const HISTORY_TRACK = 'history'

function assembleFullAbc(raw) {
  const abc = String(raw.abc || '').trim()
  const metadata = raw.metadata || {}
  const lines = abc.split(/\r?\n/).filter(function(line) { return String(line).trim() })
  const out = ['X:1']
  if (metadata.meter) out.push('M:' + metadata.meter)
  if (metadata.noteLength) out.push('L:' + metadata.noteLength)
  if (metadata.tempo) out.push('Q:' + metadata.tempo)
  if (metadata.key) out.push('K:' + metadata.key)
  lines.forEach(function(line) { out.push(line) })
  return out.join('\n')
}

export function isHistoryOrPortraitExample(moduleId, module) {
  if (module && module.track === HISTORY_TRACK) return true
  if (String(moduleId || '').indexOf('history-') === 0) return true
  const raw = THEORY_LESSON_EXAMPLES[moduleId]
  return !!(raw && raw.kind === 'image')
}

/**
 * Lookup a render-ready theory lesson example by module id.
 * Returns null when the lesson uses a portrait/image instead of ABC.
 */
export function getTheoryLessonExample(moduleId) {
  const raw = THEORY_LESSON_EXAMPLES[moduleId]
  if (!raw || !raw.abc || raw.kind === 'image') return null
  const abc = String(raw.abc || '').trim()
  if (!abc) return null
  if (raw.full !== false || abc.indexOf('\n') >= 0 || /^V:/m.test(abc)) {
    return assembleFullAbc(raw)
  }
  if (raw.maxBars > 0) {
    const metadata = Object.assign({}, raw.metadata || {})
    const rendered = buildAbcSnippet(abc, {
      maxBars: raw.maxBars,
      metadata: metadata,
    })
    if (!rendered) return null
    if (metadata.tempo && rendered.indexOf('Q:') < 0) {
      return rendered.replace(/^X:1\n/, 'X:1\nQ:' + metadata.tempo + '\n')
    }
    return rendered
  }
  return assembleFullAbc(raw)
}

export function getTheoryLessonExampleMeta(moduleId) {
  const raw = THEORY_LESSON_EXAMPLES[moduleId]
  if (!raw) return null
  return {
    caption: raw.caption || '',
    abc: raw.abc,
    metadata: raw.metadata || {},
    maxBars: raw.maxBars,
    imageUrl: raw.imageUrl || '',
    kind: raw.kind || (raw.imageUrl ? 'image' : 'notation'),
  }
}

/**
 * Returns module ids missing an ABC or image example.
 */
export function theoryLessonExampleGaps(modules) {
  const gaps = []
  ;(modules || []).forEach(function(module) {
    if (!module || module.kind !== 'theory_lesson') return
    const meta = getTheoryLessonExampleMeta(module.id)
    if (!meta) {
      gaps.push(module.id)
      return
    }
    if (meta.kind === 'image' || meta.imageUrl) {
      if (!meta.imageUrl) gaps.push(module.id)
      return
    }
    const rendered = getTheoryLessonExample(module.id)
    if (!rendered) gaps.push(module.id)
  })
  return gaps
}

export { THEORY_LESSON_EXAMPLES }
