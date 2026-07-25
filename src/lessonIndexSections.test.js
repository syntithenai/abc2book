import { describe, expect, it } from '@jest/globals'
import { getLessonIndexSections, findLessonManifestLocation } from './lessonIndexSections'
import { pickActiveLessonSectionId } from './lessonScrollSpy'

describe('getLessonIndexSections', function() {
  it('skips level-1 and quiz question sections', function() {
    const sections = getLessonIndexSections({
      sections: [
        { id: 'title', title: 'Title', level: 1 },
        { id: 'overview', title: 'Overview', level: 2 },
        { id: 'detail', title: 'Detail', level: 3 },
        { id: 'quiz questions', title: 'Quiz questions', level: 2 },
      ],
      key_points: ['One'],
      quiz: { questions: [] },
    })
    expect(sections.map(function(s) { return s.id })).toEqual(['overview', 'key-points', 'quiz'])
  })
})

describe('findLessonManifestLocation', function() {
  it('finds unit for lesson id', function() {
    const manifest = {
      tracks: [{
        id: 'regions',
        label: 'Regional traditions',
        units: [{
          id: 'celtic-ireland',
          label: 'Celtic — Ireland',
          lessons: [{ id: 'lesson-a', title: 'Lesson A' }],
        }],
      }],
    }
    const loc = findLessonManifestLocation(manifest, 'lesson-a')
    expect(loc.unitId).toBe('celtic-ireland')
    expect(loc.trackId).toBe('regions')
  })
})

describe('pickActiveLessonSectionId', function() {
  it('picks last section above anchor', function() {
    const a = { id: 'a', getBoundingClientRect: function() { return { top: 40 } } }
    const b = { id: 'b', getBoundingClientRect: function() { return { top: 120 } } }
    expect(pickActiveLessonSectionId([a, b], { getBoundingClientRect: function() { return { top: 0 } } })).toBe('a')
    expect(pickActiveLessonSectionId([a, b], { getBoundingClientRect: function() { return { top: 0 } } })).toBe('a')
  })
})
