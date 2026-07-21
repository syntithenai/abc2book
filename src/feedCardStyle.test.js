import { feedCardTypeClass, feedCardTypeLabel } from './feedCardStyle'

describe('feedCardStyle', function() {
  it('maps quiz types to quiz styling', function() {
    expect(feedCardTypeClass({ type: 'quiz' })).toBe('feed-card--quiz')
    expect(feedCardTypeClass({ type: 'theory_quiz' })).toBe('feed-card--quiz')
    expect(feedCardTypeLabel({ type: 'quiz' })).toBe('Quiz')
  })

  it('labels wikipedia news as Wiki', function() {
    expect(feedCardTypeClass({ type: 'news', generation: 'wiki' })).toBe('feed-card--wiki')
    expect(feedCardTypeLabel({ type: 'news', source: 'wikipedia' })).toBe('Wiki')
  })

  it('maps instructional and story types', function() {
    expect(feedCardTypeClass({ type: 'theory_lesson' })).toBe('feed-card--theory')
    expect(feedCardTypeClass({ type: 'singing_tip' })).toBe('feed-card--singing')
    expect(feedCardTypeClass({ type: 'dyk' })).toBe('feed-card--dyk')
  })
})
