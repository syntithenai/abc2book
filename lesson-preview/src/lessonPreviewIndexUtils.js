import { findLessonManifestLocation } from '@app/lessonIndexSections'
import { buildPreviewTreeModel, findTreePathToLesson } from './lessonPreviewTreeModel'

const TIER_RANK = {
  intro: 1,
  applied: 2,
  advanced: 3,
}

export function lessonTierRank(lesson) {
  const tier = lesson && lesson.tier
  if (typeof tier === 'string') return TIER_RANK[tier.toLowerCase()] || 99
  if (typeof tier === 'number') return tier
  return 50
}

export function theorySubtopicFromTitle(title) {
  const parts = String(title || '').split(' — ')
  if (parts.length >= 2) return parts[0].trim()
  return 'Other'
}

export function sortLessonsByDifficulty(lessons) {
  return (lessons || []).slice().sort(function(a, b) {
    const rankDiff = lessonTierRank(a) - lessonTierRank(b)
    if (rankDiff !== 0) return rankDiff
    return String(a.title || '').localeCompare(String(b.title || ''))
  })
}

/** Group theory unit lessons into subtopics, each ordered intro → applied → advanced. */
export function groupTheoryUnitLessons(lessons) {
  const groups = {}
  ;(lessons || []).forEach(function(lesson) {
    const label = theorySubtopicFromTitle(lesson.title)
    if (!groups[label]) groups[label] = []
    groups[label].push(lesson)
  })
  return Object.keys(groups).sort(function(a, b) {
    const minA = Math.min.apply(null, groups[a].map(lessonTierRank))
    const minB = Math.min.apply(null, groups[b].map(lessonTierRank))
    if (minA !== minB) return minA - minB
    return a.localeCompare(b)
  }).map(function(label) {
    return {
      id: label,
      label: label,
      lessons: sortLessonsByDifficulty(groups[label]),
    }
  })
}

export function subtopicKey(unitId, subtopicLabel) {
  return String(unitId || '') + '::' + String(subtopicLabel || '')
}

export function findPreviewIndexLocation(manifest, lessonId) {
  const tree = buildPreviewTreeModel(manifest)
  const path = findTreePathToLesson(tree, lessonId)
  if (!path) return null
  const base = findLessonManifestLocation(manifest, lessonId)
  return Object.assign({}, base || {}, {
    treePath: path,
  })
}

export function lessonMatchesFilter(lesson, track, unit, filter) {
  const q = String(filter || '').trim().toLowerCase()
  if (!q) return true
  const hay = [
    lesson.title,
    lesson.id,
    track && track.label,
    unit && unit.label,
    theorySubtopicFromTitle(lesson.title),
  ].join(' ').toLowerCase()
  return hay.indexOf(q) !== -1
}
