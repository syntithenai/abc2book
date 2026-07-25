import {
  playLessonYoutube,
  pauseLessonYoutube,
  setLessonYoutubePlayer,
  clearLessonYoutubePlayer,
  handleLessonYoutubeStateChange,
  lessonYoutubeWantsPlay,
  isLessonYoutubePlaying,
  YT_PLAYER_STATE,
} from './lessonYoutubePlayer'

describe('lessonYoutubePlayer', function() {
  test('plays when player is registered after user gesture', function() {
    const player = { playVideo: jest.fn() }
    playLessonYoutube({ fromUserGesture: true })
    expect(lessonYoutubeWantsPlay()).toBe(true)
    setLessonYoutubePlayer(player)
    expect(player.playVideo).toHaveBeenCalled()
    expect(lessonYoutubeWantsPlay()).toBe(true)
    handleLessonYoutubeStateChange(YT_PLAYER_STATE.PLAYING)
    expect(lessonYoutubeWantsPlay()).toBe(false)
  })

  test('retries play when video is cued while wantsPlay is set', function() {
    const player = { playVideo: jest.fn() }
    setLessonYoutubePlayer(player)
    playLessonYoutube({ fromUserGesture: true })
    player.playVideo.mockClear()
    handleLessonYoutubeStateChange(YT_PLAYER_STATE.CUED)
    expect(player.playVideo).toHaveBeenCalled()
  })

  test('tracks playing state from youtube events', function() {
    handleLessonYoutubeStateChange(YT_PLAYER_STATE.PLAYING)
    expect(isLessonYoutubePlaying()).toBe(true)
    handleLessonYoutubeStateChange(YT_PLAYER_STATE.PAUSED)
    expect(isLessonYoutubePlaying()).toBe(false)
  })

  test('clears player reference on cleanup', function() {
    const player = { playVideo: jest.fn(), pauseVideo: jest.fn() }
    setLessonYoutubePlayer(player)
    clearLessonYoutubePlayer(player)
    playLessonYoutube({ fromUserGesture: true })
    expect(player.playVideo).not.toHaveBeenCalled()
    pauseLessonYoutube()
  })
})
