import { createLessonQueue, playlistIndexForEntity, playlistIndexForTrack, startLessonPlaylist } from './lessonPlaylist'
import { extractYoutubeVideoId } from './lessonYoutube'
import * as lessonYoutubePlayer from './lessonYoutubePlayer'

describe('lessonPlaylist', function() {
  test('createLessonQueue builds external items', function() {
    const queue = createLessonQueue({
      lessonId: 'test-lesson',
      name: 'Test',
      tracks: [
        { youtube: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', label: 'Track A', entity_id: 'a' },
      ],
    })
    expect(queue.source).toBe('lesson')
    expect(queue.items).toHaveLength(1)
    expect(queue.items[0].externalMedia.youtubeId).toBe('dQw4w9WgXcQ')
    expect(queue.followTune).toBe(false)
  })

  test('playlistIndexForEntity resolves entity playlist index', function() {
    const lesson = {
      playlist: [
        { entity_id: 'coleman', label: 'A' },
        { entity_id: 'hayes', label: 'B' },
      ],
      entities: [{ id: 'coleman', playlist_index: 0 }],
    }
    expect(playlistIndexForEntity(lesson, 'hayes')).toBe(1)
    expect(playlistIndexForEntity(lesson, 'coleman')).toBe(0)
  })

  test('playlistIndexForTrack resolves track id', function() {
    const lesson = {
      playlist: [
        { id: 'coleman-boys-lough', label: 'The Boys of the Lough' },
        { id: 'coleman-tarbolton', label: 'Tarbolton' },
      ],
    }
    expect(playlistIndexForTrack(lesson, 'coleman-tarbolton')).toBe(1)
  })

  test('startLessonPlaylist calls tunebook.startNowPlayingQueue', function() {
    const started = []
    const playSpy = jest.spyOn(lessonYoutubePlayer, 'playLessonYoutube')
    const lesson = {
      id: 'regions-celtic-ireland-01-overview',
      title: 'Overview',
      playlist: [{ youtube: 'https://youtu.be/dQw4w9WgXcQ', label: 'Demo' }],
    }
    const ok = startLessonPlaylist(lesson, 0, {
      tunebook: {
        startNowPlayingQueue: function(queue) {
          started.push(queue)
        },
      },
    })
    expect(ok).toBe(true)
    expect(started).toHaveLength(1)
    expect(started[0].source).toBe('lesson')
    expect(playSpy).toHaveBeenCalledWith({ fromUserGesture: true })
    playSpy.mockRestore()
  })

  test('extractYoutubeVideoId handles common URL forms', function() {
    expect(extractYoutubeVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extractYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extractYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })
})
