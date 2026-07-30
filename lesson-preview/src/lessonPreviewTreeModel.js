import {
  groupTheoryUnitLessons,
  lessonTierRank,
  sortLessonsByDifficulty,
  theorySubtopicFromTitle,
} from './lessonPreviewIndexUtils'

const TOP_SECTIONS = [
  { id: 'core-theory', label: 'Core theory' },
  { id: 'practice', label: 'Practice & skills' },
  { id: 'history', label: 'History & context' },
  { id: 'regions', label: 'Regional traditions' },
]

const TRACK_SECTION = {
  theory: 'core-theory',
  foundations: 'core-theory',
  chords: 'core-theory',
  transposition: 'core-theory',
  singing: 'practice',
  styles: 'practice',
  italian: 'practice',
  instruments: 'practice',
  history: 'history',
  regions: 'regions',
}

const TRACK_ORDER = [
  'theory',
  'foundations',
  'chords',
  'transposition',
  'singing',
  'styles',
  'italian',
  'instruments',
  'history',
  'regions',
]

const THEORY_UNIT_ORDER = [
  'theory-foundations',
  'theory-harmony',
  'legacy-form-analysis',
  'legacy-ear-training',
]

const REGION_BLOCK_ORDER = [
  'Celtic',
  'British Isles',
  'North American Roots',
  'French & Acadian',
  'Nordic',
  'Iberian',
  'Eastern Europe',
  'Latin America',
  'Middle East',
  'East Asia',
  'South Asia',
  'West Africa',
]

const LEGACY_LESSON_ORDER = {
  'legacy-foundations': [
    'legacy-foundations-staff-clefs-pitch',
    'legacy-foundations-rhythm-meter',
    'legacy-foundations-major-scales',
    'legacy-foundations-minor-scales',
    'legacy-foundations-intervals',
    'legacy-foundations-accidentals',
    'legacy-foundations-circle-of-fifths',
    'legacy-foundations-modes',
    'legacy-foundations-physics-of-sound',
  ],
  'legacy-chords-harmony': [
    'legacy-chords-harmony-triads',
    'legacy-chords-harmony-diatonic-major',
    'legacy-chords-harmony-diatonic-minor',
    'legacy-chords-harmony-inversions',
    'legacy-chords-harmony-seventh-chords',
    'legacy-chords-harmony-voice-leading',
    'legacy-chords-harmony-tendency-tones',
    'legacy-chords-harmony-secondary-dominants',
    'legacy-chords-harmony-cadences',
    'legacy-chords-harmony-phrase-structure',
    'legacy-chords-harmony-extensions',
    'legacy-chords-harmony-jazz-colour',
    'legacy-chords-harmony-modulation',
    'legacy-chords-harmony-counterpoint',
  ],
  'legacy-music-periods': [
    'legacy-music-periods-medieval',
    'legacy-music-periods-renaissance',
    'legacy-music-periods-baroque-era',
    'legacy-music-periods-classical-era',
    'legacy-music-periods-romantic-era',
    'legacy-music-periods-twentieth-century',
  ],
}

const HISTORY_UNIT_ORDER = ['legacy-music-periods', 'legacy-composers']

function nodeId(type, id) {
  return type + ':' + id
}

function folder(id, label, children) {
  return {
    id: nodeId('folder', id),
    kind: 'folder',
    label: label,
    children: children || [],
  }
}

function lessonNode(lesson) {
  return {
    id: nodeId('lesson', lesson.id),
    kind: 'lesson',
    label: lesson.title,
    lessonId: lesson.id,
    lesson: lesson,
    tier: lesson.tier,
  }
}

function sortByIdOrder(lessons, orderList) {
  const rank = {}
  ;(orderList || []).forEach(function(id, index) {
    rank[id] = index
  })
  return (lessons || []).slice().sort(function(a, b) {
    const ra = rank[a.id]
    const rb = rank[b.id]
    if (ra != null && rb != null) return ra - rb
    if (ra != null) return -1
    if (rb != null) return 1
    return String(a.title || '').localeCompare(String(b.title || ''))
  })
}

function regionBlockFromUnitId(unitId) {
  const id = String(unitId || '')
  if (id.startsWith('celtic-')) return 'Celtic'
  if (id.startsWith('british-')) return 'British Isles'
  if (id.startsWith('roots-')) return 'North American Roots'
  if (id.startsWith('french-')) return 'French & Acadian'
  if (id.startsWith('nordic-')) return 'Nordic'
  if (id.startsWith('iberian-')) return 'Iberian'
  if (id.startsWith('east-')) return 'Eastern Europe'
  if (id.startsWith('latin-')) return 'Latin America'
  if (id.startsWith('me-')) return 'Middle East'
  if (id.startsWith('asia-')) return 'East Asia'
  if (id.startsWith('south-')) return 'South Asia'
  if (id.startsWith('africa-')) return 'West Africa'
  return 'Other'
}

function regionNationSortKey(unitId) {
  const id = String(unitId || '')
  const order = [
    'ireland', 'scotland', 'wales', 'brittany',
    'england', 'northumbria', 'song', 'morris',
    'appalachia', 'bluegrass', 'quebec', 'cajun', 'contra',
    'acadian', 'louisiana-cajun', 'occitan', 'basque',
    'norway', 'sweden', 'denmark', 'finland', 'islands', 'sami',
    'galicia', 'asturias', 'portugal', 'flamenco', 'castile-catalan',
    'hungary', 'balkans', 'klezmer', 'poland', 'baltic',
    'mexico', 'andes', 'brazil', 'caribbean', 'southern-cone',
    'greece', 'levant', 'maghreb', 'persia', 'turkey',
    'china', 'japan', 'korea', 'mainland-se', 'mongolia',
    'hindustani', 'carnatic', 'bengal', 'india-folk', 'northwest',
    'mali', 'guinea', 'ghana', 'nigeria',
    'diaspora', 'comparative', 'diaspora-music',
  ]
  for (let i = 0; i < order.length; i += 1) {
    if (id.indexOf(order[i]) !== -1) return i
  }
  return 999
}

function buildTheoryTrackNode(track) {
  const units = (track.units || []).slice().sort(function(a, b) {
    const ia = THEORY_UNIT_ORDER.indexOf(a.id)
    const ib = THEORY_UNIT_ORDER.indexOf(b.id)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return String(a.label || '').localeCompare(String(b.label || ''))
  })
  const unitNodes = units.map(function(unit) {
    const lessons = unit.lessons || []
    if (unit.id === 'theory-foundations' || unit.id === 'theory-harmony') {
      const subtopics = groupTheoryUnitLessons(lessons)
      const children = subtopics.map(function(subtopic) {
        return folder(
          unit.id + '::' + subtopic.label,
          subtopic.label,
          subtopic.lessons.map(lessonNode)
        )
      })
      return folder(unit.id, unit.label, children)
    }
    const sorted = LEGACY_LESSON_ORDER[unit.id]
      ? sortByIdOrder(lessons, LEGACY_LESSON_ORDER[unit.id])
      : sortLessonsByDifficulty(lessons)
    return folder(unit.id, unit.label, sorted.map(lessonNode))
  })
  return folder(track.id, track.label, unitNodes)
}

function buildGenericTrackNode(track) {
  let units = (track.units || []).slice()
  if (track.id === 'history') {
    units.sort(function(a, b) {
      const ia = HISTORY_UNIT_ORDER.indexOf(a.id)
      const ib = HISTORY_UNIT_ORDER.indexOf(b.id)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })
  }
  const unitNodes = units.map(function(unit) {
    let lessons = unit.lessons || []
    if (unit.id === 'legacy-music-periods') {
      lessons = sortByIdOrder(lessons, LEGACY_LESSON_ORDER['legacy-music-periods'])
    } else if (unit.id === 'legacy-foundations' || unit.id === 'legacy-chords-harmony') {
      lessons = sortByIdOrder(lessons, LEGACY_LESSON_ORDER[unit.id])
    } else if (
      track.id === 'instruments'
      || track.id === 'styles'
      || track.id === 'singing'
      || unit.id === 'legacy-composers'
    ) {
      lessons = lessons.slice().sort(function(a, b) {
        return String(a.title || '').localeCompare(String(b.title || ''))
      })
    } else {
      lessons = sortLessonsByDifficulty(lessons)
    }
    return folder(unit.id, unit.label, lessons.map(lessonNode))
  })
  const trackLessons = sortLessonsByDifficulty(track.lessons || []).map(lessonNode)
  const children = unitNodes.concat(
    trackLessons.length ? [folder(track.id + '-root', 'Lessons', trackLessons)] : []
  )
  return folder(track.id, track.label, children)
}

function buildRegionsTrackNode(track) {
  const byBlock = {}
  ;(track.units || []).forEach(function(unit) {
    const block = regionBlockFromUnitId(unit.id)
    if (!byBlock[block]) byBlock[block] = []
    byBlock[block].push(unit)
  })
  const blockNodes = REGION_BLOCK_ORDER.map(function(blockLabel) {
    const units = byBlock[blockLabel]
    if (!units || !units.length) return null
    units.sort(function(a, b) {
      return regionNationSortKey(a.id) - regionNationSortKey(b.id)
    })
    const nationNodes = units.map(function(unit) {
      const lessons = sortLessonsByDifficulty(unit.lessons || [])
      const parts = String(unit.label || '').split(' — ')
      const shortLabel = parts.length > 1 ? parts[parts.length - 1].trim() : unit.label
      return folder(unit.id, shortLabel, lessons.map(lessonNode))
    })
    return folder('region-block-' + blockLabel, blockLabel, nationNodes)
  }).filter(Boolean)
  Object.keys(byBlock).forEach(function(blockLabel) {
    if (REGION_BLOCK_ORDER.indexOf(blockLabel) !== -1) return
    const units = byBlock[blockLabel]
    const nationNodes = units.map(function(unit) {
      return folder(unit.id, unit.label, sortLessonsByDifficulty(unit.lessons || []).map(lessonNode))
    })
    blockNodes.push(folder('region-block-' + blockLabel, blockLabel, nationNodes))
  })
  return folder(track.id, track.label, blockNodes)
}

function buildTrackNode(track) {
  if (track.id === 'theory') return buildTheoryTrackNode(track)
  if (track.id === 'regions') return buildRegionsTrackNode(track)
  return buildGenericTrackNode(track)
}

export function buildPreviewTreeModel(manifest) {
  const tracksById = {}
  ;(manifest && manifest.tracks || []).forEach(function(track) {
    tracksById[track.id] = track
  })
  const sectionChildren = {}
  TOP_SECTIONS.forEach(function(section) {
    sectionChildren[section.id] = []
  })
  TRACK_ORDER.forEach(function(trackId) {
    const track = tracksById[trackId]
    if (!track) return
    const sectionId = TRACK_SECTION[trackId] || 'practice'
    sectionChildren[sectionId].push(buildTrackNode(track))
  })
  return TOP_SECTIONS.map(function(section) {
    return folder(section.id, section.label, sectionChildren[section.id] || [])
  }).filter(function(section) {
    return section.children && section.children.length
  })
}

export function collectLessonNodes(nodes, out) {
  ;(nodes || []).forEach(function(node) {
    if (node.kind === 'lesson') out.push(node)
    else collectLessonNodes(node.children, out)
  })
  return out
}

export function findTreePathToLesson(nodes, lessonId, path) {
  const trail = path || []
  for (let i = 0; i < (nodes || []).length; i += 1) {
    const node = nodes[i]
    const next = trail.concat(node.id)
    if (node.kind === 'lesson' && node.lessonId === lessonId) return next
    const found = findTreePathToLesson(node.children, lessonId, next)
    if (found) return found
  }
  return null
}

export function pruneTree(nodes, predicate) {
  return (nodes || []).map(function(node) {
    if (node.kind === 'lesson') {
      return predicate(node) ? node : null
    }
    const children = pruneTree(node.children, predicate)
    if (!children.length) return null
    return Object.assign({}, node, { children: children })
  }).filter(Boolean)
}

export function lessonMatchesTreeFilter(node, filter, ancestors) {
  const q = String(filter || '').trim().toLowerCase()
  if (!q) return true
  if (node.kind === 'lesson') {
    const hay = [
      node.label,
      node.lessonId,
      (ancestors || []).map(function(a) { return a.label }).join(' '),
    ].join(' ').toLowerCase()
    return hay.indexOf(q) !== -1
  }
  return (node.children || []).some(function(child) {
    return lessonMatchesTreeFilter(child, filter, (ancestors || []).concat(node))
  })
}

export function theorySubtopicFromTreeNode(node) {
  if (!node || node.kind !== 'folder') return ''
  const raw = node.id.replace('folder:', '')
  if (raw.indexOf('::') !== -1) return raw.split('::').slice(1).join('::')
  return ''
}
