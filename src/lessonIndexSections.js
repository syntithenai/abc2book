/**
 * Section list for lesson index navigation (mirrors LessonContent filters).
 */
export function getLessonIndexSections(lesson) {
  if (!lesson) return []
  const out = []
  ;(lesson.sections || []).forEach(function(section) {
    if (!section || !section.id) return
    if (section.level === 1) return
    if (/^quiz questions$/i.test(section.title || '')) return
    if (/^Q\d+\./i.test(section.title || '')) return
  // Index shows one heading level only (h2 / level 2), not nested h3+.
    if (section.level != null && section.level > 2) return
    out.push({
      id: section.id,
      title: section.title || section.id,
      level: 2,
    })
  })
  if (lesson.key_points && lesson.key_points.length) {
    out.push({ id: 'key-points', title: 'Key points', level: 2 })
  }
  if (lesson.quiz || lesson.quiz_questions || lesson.quiz_markdown) {
    out.push({ id: 'quiz', title: 'Quiz', level: 2 })
  }
  return out
}

export function findLessonManifestLocation(manifest, lessonId) {
  const id = String(lessonId || '').trim()
  if (!id || !manifest) return null
  let found = null
  ;(manifest.tracks || []).forEach(function(track) {
    ;(track.units || []).forEach(function(unit) {
      ;(unit.lessons || []).forEach(function(lesson) {
        if (lesson && lesson.id === id) {
          found = {
            trackId: track.id,
            trackLabel: track.label,
            unitId: unit.id,
            unitLabel: unit.label,
            lesson: lesson,
          }
        }
      })
    })
  })
  return found
}
