import { normalizeChordsSearch, handleChordsSearchStreamEvent } from './chordsSearchClient'
import { sheetLinesToLyricLines, sheetLinesToWizardChords } from './chordSheetImportUtils'

describe('chordSheetImportUtils', function() {
  test('sheetLinesToWizardChords preserves section breaks and strips lyrics', function() {
    expect(sheetLinesToWizardChords([
      '[Verse 1]',
      'G C G',
      'Amazing Grace, how sweet the sound,',
      'G D G',
      'That saved a wretch like me:',
      '',
      '[Verse 2]',
      'G C G',
      'I once was lost but now am found,',
    ])).toBe('G C G|\nG D G|\n\nG C G|')
  })

  test('sheetLinesToLyricLines preserves headers and blanks', function() {
    expect(sheetLinesToLyricLines([
      '[Verse 1]',
      'G C G',
      'Amazing Grace, how sweet the sound,',
      '',
      '[Verse 2]',
      'G D G',
      'That saved a wretch like me:',
    ])).toEqual([
      '[Verse 1]',
      'Amazing Grace, how sweet the sound,',
      '',
      '[Verse 2]',
      'That saved a wretch like me:',
    ])
  })
})

describe('chordsSearchClient', function() {
  test('normalizeChordsSearch builds chord and lyric imports', function() {
    const result = normalizeChordsSearch({
      sheetLines: [
        '[Verse 1]',
        'G C G',
        'Amazing Grace, how sweet the sound,',
        'G D G',
        'That saved a wretch like me:',
      ],
      source: 'azchords.com',
      sourceUrl: 'https://www.azchords.com/j/johnnewton-tabs-47762/amazinggrace-tabs-895397.html',
      title: 'Amazing Grace',
      artist: 'John Newton',
    })

    expect(result.chordText).toBe('G C G|\nG D G|')
    expect(result.lyricLines).toEqual([
      '[Verse 1]',
      'Amazing Grace, how sweet the sound,',
      'That saved a wretch like me:',
    ])
    expect(result.source).toBe('azchords.com')
  })

  test('normalizeChordsSearch rejects empty sheetLines', function() {
    expect(function() {
      normalizeChordsSearch({ sheetLines: [] })
    }).toThrow('Chords search returned no chord sheet')
  })

  test('handleChordsSearchStreamEvent forwards progress', function() {
    const updates = []
    handleChordsSearchStreamEvent({
      type: 'progress',
      message: 'Trying azchords.com...',
      progress: 0.45,
      stage: 'extract',
    }, function(message, progress, stage) {
      updates.push({ message: message, progress: progress, stage: stage })
    })
    expect(updates).toEqual([{
      message: 'Trying azchords.com...',
      progress: 0.45,
      stage: 'extract',
    }])
  })

  test('handleChordsSearchStreamEvent returns result events', function() {
    const result = handleChordsSearchStreamEvent({
      type: 'result',
      body: {
        sheetLines: ['G C G', 'Amazing Grace'],
        source: 'azchords.com',
      },
    }, function() {})
    expect(result.chordText).toBe('G C G|')
    expect(result.source).toBe('azchords.com')
  })
})
