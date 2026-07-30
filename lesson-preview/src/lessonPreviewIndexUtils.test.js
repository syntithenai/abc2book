import {
  groupTheoryUnitLessons,
  lessonTierRank,
  theorySubtopicFromTitle,
} from './lessonPreviewIndexUtils'

describe('lessonPreviewIndexUtils', function() {
  it('parses theory subtopic from title', function() {
    expect(theorySubtopicFromTitle('Major Scales — Introduction')).toBe('Major Scales')
    expect(theorySubtopicFromTitle('Cadences')).toBe('Other')
  })

  it('ranks theory tiers intro < applied < advanced', function() {
    expect(lessonTierRank({ tier: 'intro' })).toBeLessThan(lessonTierRank({ tier: 'applied' }))
    expect(lessonTierRank({ tier: 'applied' })).toBeLessThan(lessonTierRank({ tier: 'advanced' }))
  })

  it('groups theory lessons by subtopic and sorts by difficulty', function() {
    const groups = groupTheoryUnitLessons([
      { id: 'a', title: 'Intervals — Advanced', tier: 'advanced' },
      { id: 'b', title: 'Intervals — Introduction', tier: 'intro' },
      { id: 'c', title: 'Major Scales — Applied', tier: 'applied' },
      { id: 'd', title: 'Major Scales — Introduction', tier: 'intro' },
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0].label).toBe('Intervals')
    expect(groups[0].lessons.map(function(l) { return l.id })).toEqual(['b', 'a'])
    expect(groups[1].lessons[0].id).toBe('d')
    expect(groups[1].lessons[1].id).toBe('c')
  })
})
