import {
  splitLessonTrackMarkers,
  lessonTextHasTrackMarkers,
} from './lessonTrackMarkers'

describe('lessonTrackMarkers', function() {
  test('splitLessonTrackMarkers preserves surrounding text', function() {
    const parts = splitLessonTrackMarkers('**Brendan Bowyer** and [[track:hucklebuck|The Hucklebuck]] — showband')
    expect(parts).toHaveLength(3)
    expect(parts[0]).toEqual({ type: 'text', value: '**Brendan Bowyer** and ' })
    expect(parts[1]).toEqual({ type: 'track', id: 'hucklebuck', label: 'The Hucklebuck' })
    expect(parts[2]).toEqual({ type: 'text', value: ' — showband' })
  })

  test('lessonTextHasTrackMarkers detects markers', function() {
    expect(lessonTextHasTrackMarkers('foo [[track:x|Y]] bar')).toBe(true)
    expect(lessonTextHasTrackMarkers('plain text')).toBe(false)
  })
})
