import { buildAbcSnippet } from './abcSnippetPreview'
import { THEORY_LESSON_EXAMPLES } from './feedContent/theory/examples'

/** History and style overview lessons use web images, not ABC notation. */
const IMAGE_TRACKS = ['history', 'styles', 'celtic']

/** Mechanics lessons: notes, chords, harmony, Italian terms, transposition. */
const NOTATION_TRACKS = [
  'foundations',
  'italian',
  'chords',
  'transposition',
  'harmony',
]

export function isImageTheoryExample(moduleId, module) {
  const raw = THEORY_LESSON_EXAMPLES[moduleId]
  if (raw && (raw.kind === 'notation' || raw.kind === 'none')) return false
  if (raw && raw.kind === 'image') return true
  const track = module && module.track
  if (IMAGE_TRACKS.indexOf(track) >= 0) return true
  if (String(moduleId || '').indexOf('history-') === 0) return true
  if (String(moduleId || '').indexOf('styles-') === 0) return true
  if (String(moduleId || '').indexOf('celtic-') === 0) return true
  return false
}

export function isTheoryNotationLesson(moduleId, module) {
  if (!module || module.kind !== 'theory_lesson') return false
  if (isImageTheoryExample(moduleId, module)) return false
  const track = module.track
  if (NOTATION_TRACKS.indexOf(track) >= 0) return true
  const raw = THEORY_LESSON_EXAMPLES[moduleId]
  return !!(raw && raw.kind === 'notation')
}

export function isHistoryOrPortraitExample(moduleId, module) {
  return isImageTheoryExample(moduleId, module)
}

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

/**
 * Lookup a render-ready theory lesson example by module id.
 * Returns null when the lesson uses a portrait/image instead of ABC.
 */
export function getTheoryLessonExample(moduleId) {
  const raw = THEORY_LESSON_EXAMPLES[moduleId]
  if (!raw || !raw.abc || raw.kind === 'image' || raw.kind === 'none') return null
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
  const illustrationPlan = String(
    raw.illustrationPlan || raw.caption || ''
  ).trim()
  return {
    illustrationPlan: illustrationPlan,
    caption: illustrationPlan,
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
    if (meta.kind === 'none') return
    if (isImageTheoryExample(module.id, module)) {
      if (!meta.imageUrl) gaps.push(module.id)
      return
    }
    const rendered = getTheoryLessonExample(module.id)
    if (!rendered) gaps.push(module.id)
  })
  return gaps
}

export { THEORY_LESSON_EXAMPLES, IMAGE_TRACKS, NOTATION_TRACKS }
