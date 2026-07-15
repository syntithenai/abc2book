/**
 * @jest-environment node
 */
import {
  buildExternalSearchQuestion,
  buildExternalSearchUrl,
  formatSongForSearchQuestion,
} from './externalSearchLinks'

describe('externalSearchLinks', function() {
  test('formatSongForSearchQuestion quotes title and optional artist', function() {
    expect(formatSongForSearchQuestion('Wild Rover', '')).toBe('the song "Wild Rover"')
    expect(formatSongForSearchQuestion('Wild Rover', 'Dubliners'))
      .toBe('the song "Wild Rover" by Dubliners')
    expect(formatSongForSearchQuestion('', 'Dubliners')).toBe('')
  })

  test('buildExternalSearchQuestion seeks the field type in plain English', function() {
    expect(buildExternalSearchQuestion('aliases', 'Drowsy Maggie', ''))
      .toContain('other names, aliases, or alternative titles')
    expect(buildExternalSearchQuestion('genre', 'Wonderwall', 'Oasis'))
      .toContain('music genre or style')
    expect(buildExternalSearchQuestion('artists', 'Wonderwall', 'Oasis'))
      .toContain('artists have performed or recorded')
    expect(buildExternalSearchQuestion('background', 'Copper Kettle', 'Joan Baez'))
      .toContain('history and background')
    expect(buildExternalSearchQuestion('lyrics', 'Wild Rover', 'Dubliners'))
      .toContain('full lyrics')
    expect(buildExternalSearchQuestion('chords', 'Wild Rover', 'Dubliners'))
      .toContain('guitar chords')
    expect(buildExternalSearchQuestion('notation', 'Drowsy Maggie', ''))
      .toContain('ABC notation')
  })

  test('buildExternalSearchUrl encodes Google questions and YouTube separately', function() {
    const aliases = buildExternalSearchUrl('aliases', 'Drowsy Maggie', 'Traditional')
    expect(aliases).toContain('google.com/search?q=')
    expect(decodeURIComponent(aliases)).toContain('alternative titles')

    const youtube = buildExternalSearchUrl('youtube', 'Wonderwall', 'Oasis')
    expect(youtube).toContain('youtube.com/results')
    expect(decodeURIComponent(youtube)).toContain('Wonderwall')
  })
})
