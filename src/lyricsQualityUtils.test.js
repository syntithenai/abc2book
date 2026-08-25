import {
  isUsableLyricContent,
  looksLikeNonLyricDump,
  looksLikeNoLyricsPlaceholder,
  looksLikeChordOnlyContent,
  hasSingableLyricText,
  isNoLyricsPlaceholderLine,
  isTabStaffLine,
} from './lyricsQualityUtils'
import { parsePlainLyricsText } from './lyricsParseUtils'
import { applyCandidateToTune } from './fieldLookupApplyUtils'

const MOONLIGHT_TAB_DUMP = [
  'From',
  '*',
  'Fri',
  'Nov',
  '18',
  'Article:',
  '27201',
  'Newsgroups:',
  'rec.music.makers.guitar.tablature',
  'Subject:',
  'TAB:',
  'moonlight',
  'sonata',
  'with',
  'fingering',
  'Message-ID:',
  '<abc@def>',
  'Organization:',
  'Universite Paris-Sud, France.',
  'Tabulated from the (much easier to play) piano score by David Atkinson.',
  'I have inlcuded left hand fingering underneath the tab.',
  'p = pull-off, h = hammer-on, s = slide',
  '===== = sustain.',
  'Adagio Sostenuto.',
  '3',
  '2',
  '1',
  '3',
  '4',
  'I...',
  'III..',
  'E|------------------3----|s4-----------------2----|',
  'E|3=============================------------------|',
  '3',
  '2',
  '1',
  'E|3-----------------3----|s4-----------------2----|',
  'The end',
].join('\n')

describe('lyricsQualityUtils', function() {
  test('detects guitar TAB staff lines', function() {
    expect(isTabStaffLine('E|------------------3----|s4-----------------2----|')).toBe(true)
    expect(isTabStaffLine('B|-------1-----1s--5-----5|-----')).toBe(true)
    expect(isTabStaffLine('Yesterday all my troubles')).toBe(false)
  })

  test('rejects Moonlight Sonata Usenet TAB dump as non-lyrics', function() {
    expect(looksLikeNonLyricDump(MOONLIGHT_TAB_DUMP)).toBe(true)
    expect(isUsableLyricContent(MOONLIGHT_TAB_DUMP).ok).toBe(false)
    expect(parsePlainLyricsText(MOONLIGHT_TAB_DUMP)[2]).toBe('')
  })

  test('rejects letras.mus.br instrumental placeholder as non-lyrics', function() {
    const twoLines = 'Música Instrumental\nEsta música não possui letra'
    expect(isNoLyricsPlaceholderLine('Música Instrumental')).toBe(true)
    expect(isNoLyricsPlaceholderLine('Esta música não possui letra')).toBe(true)
    expect(looksLikeNoLyricsPlaceholder(twoLines)).toBe(true)
    expect(isUsableLyricContent(twoLines).ok).toBe(false)
    expect(parsePlainLyricsText(twoLines)[2]).toBe('')

    const oneLine = 'Música InstrumentalEsta música não possui letra'
    expect(isNoLyricsPlaceholderLine(oneLine)).toBe(true)
    expect(isUsableLyricContent(oneLine).ok).toBe(false)
    expect(parsePlainLyricsText(oneLine)[2]).toBe('')
  })

  test('keeps ordinary song lyrics', function() {
    const lyrics = 'Yesterday\nAll my troubles seemed so far away\n\nNow it looks as though they\'re here to stay'
    expect(looksLikeNonLyricDump(lyrics)).toBe(false)
    expect(isUsableLyricContent(lyrics).ok).toBe(true)
    expect(parsePlainLyricsText(lyrics)[2]).toContain('Yesterday')
  })

  test('applyCandidateToTune refuses TAB dump lyrics', function() {
    const tune = { name: 'Moonlight Sonata', words: [] }
    const applied = applyCandidateToTune(tune, 'lyrics', {
      text: MOONLIGHT_TAB_DUMP,
      lines: MOONLIGHT_TAB_DUMP.split('\n'),
    })
    expect(applied).toBe(false)
    expect(tune.words || []).toEqual([])
  })

  test('rejects chord-only accompaniment grids as lyrics', function() {
    const chordOnly = [
      'D G Bm A D',
      'G D D A G',
      'D G Bm A',
      'A D',
    ]
    expect(looksLikeChordOnlyContent(chordOnly)).toBe(true)
    expect(hasSingableLyricText(chordOnly)).toBe(false)
    expect(isUsableLyricContent(chordOnly).ok).toBe(false)
    expect(isUsableLyricContent(chordOnly).reason).toBe('chord_only')
  })

  test('keeps chords-over-words sheets that include sung lines', function() {
    const sheet = [
      'D G',
      'I was having this discussion',
      'A D',
      'In a taxi heading downtown',
    ]
    expect(looksLikeChordOnlyContent(sheet)).toBe(false)
    expect(hasSingableLyricText(sheet)).toBe(true)
    expect(isUsableLyricContent(sheet).ok).toBe(true)
  })
})
