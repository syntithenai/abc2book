import {
  analyzePlaylistPublishedShare,
  analyzePlaylistShareMediaPlayability,
  buildPlaylistPublicShareLink,
  buildPlaylistPublicSharePayload,
  buildPlaylistPublishedShareWarning,
  buildPlaylistShareMediaWarning,
  classifyPlaylistMediaLinkSource,
  decodePlaylistPublicSharePayload,
  encodePlaylistPublicSharePayload,
  groupPlaylistPublicRefsByScrapeFile,
  isQrEncodableShareLink,
  playlistShareOffersVariantChoice,
  defaultPlaylistShareVariant,
  qrSafeShareLink,
  resolveTunePublishedScrapeRef,
  scrapeFilenameFromUrl,
} from './playlistPublicShare'

describe('playlistPublicShare', function() {
  test('scrapeFilenameFromUrl reads /scrape paths', function() {
    expect(scrapeFilenameFromUrl('/scrape/celtic.abc')).toBe('celtic.abc')
    expect(scrapeFilenameFromUrl('https://tunebook.net/scrape/songs.abc')).toBe('songs.abc')
    expect(scrapeFilenameFromUrl('https://example.com/other.abc')).toBe(null)
  })

  test('resolveTunePublishedScrapeRef prefers scrape srcUrl', function() {
    expect(resolveTunePublishedScrapeRef({
      id: '17',
      books: ['celtic'],
      srcUrl: 'https://tunebook.net/scrape/tunes.abc',
    })).toEqual({
      scrapeFile: 'tunes.abc',
      tuneId: '17',
      via: 'srcUrl',
    })
  })

  test('resolveTunePublishedScrapeRef falls back to publishable book', function() {
    expect(resolveTunePublishedScrapeRef({
      id: '42',
      books: ['celtic', 'mymedia'],
    })).toEqual({
      scrapeFile: 'celtic.abc',
      tuneId: '42',
      via: 'book',
      book: 'celtic',
    })
  })

  test('resolveTunePublishedScrapeRef returns null for private-only tunes', function() {
    expect(resolveTunePublishedScrapeRef({
      id: '9',
      books: ['mymedia'],
      srcUrl: 'https://docs.google.com/document/d/abc',
    })).toBe(null)
  })

  test('analyzePlaylistPublishedShare reports missing unpublished tunes', function() {
    const tunes = {
      a: { id: 'a', name: 'Public', books: ['celtic'] },
      b: { id: 'b', name: 'Private', books: ['mymedia'] },
    }
    const analysis = analyzePlaylistPublishedShare({
      items: [{ tuneId: 'a' }, { tuneId: 'b' }],
    }, tunes)
    expect(analysis.ok).toBe(false)
    expect(analysis.refs).toHaveLength(1)
    expect(analysis.missing).toHaveLength(1)
    expect(analysis.missing[0].name).toBe('Private')
    expect(analysis.warning).toMatch(/Needs Google share/i)
  })

  test('analyzePlaylistPublishedShare succeeds when all published', function() {
    const tunes = {
      a: { id: 'a', name: 'A', books: ['celtic'] },
      b: { id: 'b', name: 'B', srcUrl: '/scrape/songs.abc' },
    }
    const analysis = analyzePlaylistPublishedShare({
      name: 'Session',
      items: [{ tuneId: 'a' }, { tuneId: 'b' }],
    }, tunes)
    expect(analysis.ok).toBe(true)
    expect(analysis.refs).toEqual([
      { scrapeFile: 'celtic.abc', tuneId: 'a', via: 'book', book: 'celtic' },
      { scrapeFile: 'songs.abc', tuneId: 'b', via: 'srcUrl' },
    ])
  })

  test('encode/decode round-trip', function() {
    const payload = buildPlaylistPublicSharePayload('My Playlist', [
      { scrapeFile: 'celtic.abc', tuneId: '17' },
      { scrapeFile: 'celtic.abc', tuneId: '18' },
      { scrapeFile: 'songs.abc', tuneId: '99' },
    ])
    expect(payload).toEqual({
      v: 2,
      n: 'My Playlist',
      f: ['celtic', 'songs'],
      i: [[0, '17'], [0, '18'], [1, '99']],
    })
    const encoded = encodePlaylistPublicSharePayload(payload)
    expect(encoded).toMatch(/^(z\.|[A-Za-z0-9_-]+)/)
    expect(decodePlaylistPublicSharePayload(encoded)).toEqual({
      v: 2,
      name: 'My Playlist',
      refs: [
        { scrapeFile: 'celtic.abc', tuneId: '17' },
        { scrapeFile: 'celtic.abc', tuneId: '18' },
        { scrapeFile: 'songs.abc', tuneId: '99' },
      ],
    })
  })

  test('decodePlaylistPublicSharePayload still accepts legacy v1', function() {
    const legacy = {
      v: 1,
      n: 'Old',
      i: [['celtic.abc', '17'], ['songs.abc', '99']],
    }
    const json = JSON.stringify(legacy)
    const encoded = Buffer.from(json, 'utf8').toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
    expect(decodePlaylistPublicSharePayload(encoded)).toEqual({
      v: 1,
      name: 'Old',
      refs: [
        { scrapeFile: 'celtic.abc', tuneId: '17' },
        { scrapeFile: 'songs.abc', tuneId: '99' },
      ],
    })
  })

  test('compressed payload preferred when shorter', function() {
    const refs = []
    for (let i = 0; i < 40; i += 1) {
      refs.push({ scrapeFile: 'australian bush dance.abc', tuneId: String(1000 + i) })
    }
    const encoded = encodePlaylistPublicSharePayload(
      buildPlaylistPublicSharePayload('Bush', refs)
    )
    expect(encoded.indexOf('z.')).toBe(0)
    const decoded = decodePlaylistPublicSharePayload(encoded)
    expect(decoded.refs).toHaveLength(40)
    expect(decoded.refs[0].scrapeFile).toBe('australian bush dance.abc')
  })

  test('qrSafeShareLink falls back when over capacity', function() {
    const long = 'https://tunebook.net/#/importplaylist/' + 'a'.repeat(4000)
    expect(isQrEncodableShareLink(long)).toBe(false)
    expect(qrSafeShareLink(long)).toBe('')
    const ok = 'https://tunebook.net/#/importplaylist/abc?fresh=1'
    expect(qrSafeShareLink(ok)).toBe(ok)
  })

  test('buildPlaylistPublicShareLink encodes published playlist', function() {
    const link = buildPlaylistPublicShareLink({
      origin: 'https://tunebook.net',
      name: 'Set Break',
      playlist: { items: [{ tuneId: '17' }] },
      tunes: { 17: { id: '17', books: ['celtic'] } },
      includeFreshParam: false,
    })
    expect(link.indexOf('https://tunebook.net/#/importplaylist/')).toBe(0)
    const encoded = link.slice('https://tunebook.net/#/importplaylist/'.length)
    expect(decodePlaylistPublicSharePayload(encoded).name).toBe('Set Break')
  })

  test('groupPlaylistPublicRefsByScrapeFile groups ids', function() {
    expect(groupPlaylistPublicRefsByScrapeFile([
      { scrapeFile: 'celtic.abc', tuneId: '1' },
      { scrapeFile: 'celtic.abc', tuneId: '2' },
      { scrapeFile: 'songs.abc', tuneId: '9' },
    ])).toEqual({
      'celtic.abc': ['1', '2'],
      'songs.abc': ['9'],
    })
  })

  test('buildPlaylistPublishedShareWarning lists names', function() {
    expect(buildPlaylistPublishedShareWarning([
      { name: 'Alpha' },
      { name: 'Beta' },
    ])).toMatch(/Needs Google share/)
    expect(buildPlaylistPublishedShareWarning([
      { name: 'Alpha' },
      { name: 'Beta' },
    ])).toMatch(/Alpha, Beta/)
  })

  test('classifyPlaylistMediaLinkSource flags library, recordings, and Drive', function() {
    expect(classifyPlaylistMediaLinkSource({
      link: 'https://www.youtube.com/watch?v=abc',
    })).toBe(null)
    expect(classifyPlaylistMediaLinkSource({
      link: 'https://example.com/song.mp3',
    })).toBe(null)
    expect(classifyPlaylistMediaLinkSource({
      link: 'http://localhost:8787/music-collection/foo.mp3',
    })).toEqual({ kind: 'library', label: 'library' })
    expect(classifyPlaylistMediaLinkSource({
      link: 'abcbook-recording:rec1',
      recordingId: 'rec1',
    })).toEqual({ kind: 'owned-recording', label: 'recordings' })
    expect(classifyPlaylistMediaLinkSource({
      link: 'https://drive.google.com/file/d/xyz/view',
    })).toEqual({ kind: 'google-drive', label: 'Google Drive' })
    expect(classifyPlaylistMediaLinkSource({
      link: 'https://cdn.example.com/a.mp3',
      googleId: 'drive123',
    })).toEqual({ kind: 'google-drive', label: 'Google Drive' })
  })

  test('analyzePlaylistShareMediaPlayability reports private media sources', function() {
    const tunes = {
      a: {
        id: 'a',
        name: 'Library Tune',
        links: [{ link: 'http://127.0.0.1:8787/music-collection/a.mp3', title: 'Lib' }],
      },
      b: {
        id: 'b',
        name: 'YouTube Tune',
        links: [{ link: 'https://www.youtube.com/watch?v=zz' }],
      },
      c: {
        id: 'c',
        name: 'Drive Tune',
        links: [
          { link: 'https://cdn.example.com/x.mp3' },
          { link: 'https://drive.google.com/u/0/uc?id=1&export=download', title: 'Drive' },
        ],
      },
    }
    const analysis = analyzePlaylistShareMediaPlayability({
      items: [
        { tuneId: 'a' },
        { tuneId: 'b' },
        { tuneId: 'c', linkIndex: 1 },
      ],
    }, tunes)
    expect(analysis.ok).toBe(false)
    expect(analysis.issues).toHaveLength(2)
    expect(analysis.issues.map(function(i) { return i.kind }).sort()).toEqual([
      'google-drive',
      'library',
    ])
    expect(buildPlaylistShareMediaWarning(analysis.issues))
      .toMatch(/won’t play for others/i)
    expect(buildPlaylistShareMediaWarning(analysis.issues))
      .toMatch(/Library Tune/)
  })

  test('analyzePlaylistShareMediaPlayability ignores public-only media', function() {
    const analysis = analyzePlaylistShareMediaPlayability({
      items: [{ tuneId: 'yt' }],
    }, {
      yt: {
        id: 'yt',
        name: 'Public',
        links: [{ link: 'https://youtu.be/abc123' }],
      },
    })
    expect(analysis.ok).toBe(true)
    expect(analysis.warning).toBe('')
  })

  test('playlistShareOffersVariantChoice whenever public scrapes are available', function() {
    const playlist = { items: [{ tuneId: 'a' }] }
    const withPrivateMedia = {
      a: {
        id: 'a',
        name: 'Mixed',
        books: ['celtic'],
        links: [{ link: 'http://localhost:8787/music-collection/a.mp3' }],
      },
    }
    const publicOnly = {
      a: {
        id: 'a',
        books: ['celtic'],
        links: [{ link: 'https://www.youtube.com/watch?v=zz' }],
      },
    }
    expect(playlistShareOffersVariantChoice(
      analyzePlaylistPublishedShare(playlist, withPrivateMedia)
    )).toBe(true)
    expect(playlistShareOffersVariantChoice(
      analyzePlaylistPublishedShare(playlist, publicOnly)
    )).toBe(true)
    expect(defaultPlaylistShareVariant(
      analyzePlaylistShareMediaPlayability(playlist, withPrivateMedia)
    )).toBe('google')
    expect(defaultPlaylistShareVariant(
      analyzePlaylistShareMediaPlayability(playlist, publicOnly)
    )).toBe('public')
  })

  test('playlistShareOffersVariantChoice false when unpublished tunes block public share', function() {
    const playlist = { items: [{ tuneId: 'b' }] }
    const tunes = {
      b: { id: 'b', name: 'Private', books: ['mymedia'] },
    }
    expect(playlistShareOffersVariantChoice(
      analyzePlaylistPublishedShare(playlist, tunes)
    )).toBe(false)
  })
})
