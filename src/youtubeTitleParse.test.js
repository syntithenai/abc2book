import { parseTitleArtistFromYouTubeLabel } from './youtubeTitleParse'

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

  test('parseTitleArtistFromYouTubeLabel handles Clifftop festival lines', function() {
    expect(parseTitleArtistFromYouTubeLabel(
      'Clifftop 2025 - Rattlesnake - Judy Hyman &  Frank Evans',
      ''
    )).toEqual({ title: 'Rattlesnake', artist: 'Judy Hyman & Frank Evans' })
  })

  test('parseTitleArtistFromYouTubeLabel handles dated performer lines', function() {
    expect(parseTitleArtistFromYouTubeLabel('07 Tatiana Hargreaves 2013-01-18 Sally Ann', ''))
      .toEqual({ title: 'Sally Ann', artist: 'Tatiana Hargreaves' })
  })

  test('parseTitleArtistFromYouTubeLabel handles quoted title by artist', function() {
    expect(parseTitleArtistFromYouTubeLabel('"Wink the Other Eye" by Clyde Davenport', ''))
      .toEqual({ title: 'Wink the Other Eye', artist: 'Clyde Davenport' })
  })

  test('parseTitleArtistFromYouTubeLabel handles artist quoted title', function() {
    expect(parseTitleArtistFromYouTubeLabel('Tara Nevins "Train 45"', ''))
      .toEqual({ title: 'Train 45', artist: 'Tara Nevins' })
  })

  test('parseTitleArtistFromYouTubeLabel handles played by', function() {
    expect(parseTitleArtistFromYouTubeLabel('Waterloo played by Greg Canote', ''))
      .toEqual({ title: 'Waterloo', artist: 'Greg Canote' })
  })

  test('parseTitleArtistFromYouTubeLabel handles plays pattern', function() {
    expect(parseTitleArtistFromYouTubeLabel(
      'Ellie Hakanson plays Garfield\'s Blackberry Blossom for Get Up in the Cool',
      ''
    )).toEqual({ title: 'Garfield\'s Blackberry Blossom', artist: 'Ellie Hakanson' })
  })

  test('parseTitleArtistFromYouTubeLabel handles TOTW parenthetical artist', function() {
    expect(parseTitleArtistFromYouTubeLabel(
      'Old-Time TOTW #293: Railroad Runs Through Georgia (Walter Baker) 2/4/24',
      ''
    )).toEqual({ title: 'Railroad Runs Through Georgia', artist: 'Walter Baker' })
  })

  test('parseTitleArtistFromYouTubeLabel handles feat suffix', function() {
    expect(parseTitleArtistFromYouTubeLabel(
      'Eeph Caught a Rabbit (feat. Brendan Doyle & John Schwab)',
      ''
    )).toEqual({ title: 'Eeph Caught a Rabbit', artist: 'Brendan Doyle & John Schwab' })
  })

  test('parseTitleArtistFromYouTubeLabel handles pipe separator', function() {
    expect(parseTitleArtistFromYouTubeLabel(
      'Joel Savoy & Kelli Jones | Attakapas Trail/Reel des nez Piques',
      ''
    )).toEqual({ title: 'Attakapas Trail/Reel des nez Piques', artist: 'Joel Savoy & Kelli Jones' })
  })

  test('parseTitleArtistFromYouTubeLabel strips Clifftop event suffix', function() {
    expect(parseTitleArtistFromYouTubeLabel('Apple Blossom, Clifftop 2015', ''))
      .toEqual({ title: 'Apple Blossom', artist: '' })
  })
})

describe('youtube oembed helpers', function() {
  test('fetchYouTubeOembedMetadata returns title and author', async function() {
    const {
      fetchYouTubeOembedMetadata,
      checkYouTubeLinkOembed,
    } = await import('./youtubeSearchClient')
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
