import { parseTitleArtistFromYouTubeLabel } from './youtubeTitleParse'
import {
  fetchYouTubeOembedMetadata,
  checkYouTubeLinkOembed,
} from './youtubeSearchClient'

describe('youtube title/metadata helpers', function() {
  test('parseTitleArtistFromYouTubeLabel handles Artist - Title', function() {
    expect(parseTitleArtistFromYouTubeLabel('The Dubliners - Whiskey in the Jar', 'Channel'))
      .toEqual({ title: 'Whiskey in the Jar', artist: 'The Dubliners' })
  })

  test('parseTitleArtistFromYouTubeLabel handles Title by Artist', function() {
    expect(parseTitleArtistFromYouTubeLabel('Whiskey in the Jar by The Dubliners', ''))
      .toEqual({ title: 'Whiskey in the Jar', artist: 'The Dubliners' })
  })

  test('parseTitleArtistFromYouTubeLabel falls back to channel as artist', function() {
    expect(parseTitleArtistFromYouTubeLabel('Amazing Grace (Official Video)', 'Faith Channel'))
      .toEqual({ title: 'Amazing Grace', artist: 'Faith Channel' })
  })

  test('fetchYouTubeOembedMetadata returns title and author', async function() {
    global.fetch = jest.fn(function() {
      return Promise.resolve({
        ok: true,
        json: function() {
          return Promise.resolve({
            title: 'Artist - Song',
            author_name: 'Uploader',
          })
        },
      })
    })
    const meta = await fetchYouTubeOembedMetadata('https://www.youtube.com/watch?v=abc')
    expect(meta.ok).toBe(true)
    expect(meta.title).toBe('Artist - Song')
    expect(meta.authorName).toBe('Uploader')
    const check = await checkYouTubeLinkOembed('https://www.youtube.com/watch?v=abc')
    expect(check.ok).toBe(true)
  })
})
