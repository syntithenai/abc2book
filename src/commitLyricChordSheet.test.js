import { commitLyricChordSheetToTune } from './commitLyricChordSheet'
import { commitPasteChordSheetToTune } from './commitPasteChordSheetToTune'
import { getPlainLyricLines } from './wLinesUtils'

function makeTunebook() {
  const saves = []
  return {
    saves: saves,
    abcTools: {
      json2abc: function(tune) {
        return 'X:1\nT:' + (tune.name || '') + '\nM:4/4\nK:C\n|: z8 :|\n'
      },
      abc2json: function() {
        return {
          id: 't1',
          name: 'Test',
          voices: { '1': { notes: ['|: "C"z8 :|'] } },
          words: [],
          meta: {},
        }
      },
    },
    saveTune: function(tune, _flag, opts) {
      saves.push({ tune: tune, opts: opts })
    },
  }
}

describe('commitLyricChordSheetToTune', function() {
  test('saves ChordPro inline lyrics without wiping ABC voices', function() {
    const tunebook = makeTunebook()
    const notes = [':| "Am"z4 "G"z4 |']
    const tune = {
      id: 't1',
      name: 'Girl',
      voices: { '1': { notes: notes.slice() } },
      words: ['old lyric'],
      meta: {},
    }
    const sheet = `{title: Girl}
[Chorus]
[Am]Who's that [G]girl
`
    const result = commitLyricChordSheetToTune({
      tune: tune,
      tunebook: tunebook,
      text: sheet,
    })
    expect(result.ok).toBe(true)
    expect(tune.voices['1'].notes).toEqual(notes)
    expect(getPlainLyricLines(tune).join('\n')).toContain("[Am]Who's that [G]girl")
    expect(tune.meta.chordProSource).toContain('[Am]Who')
    expect(tunebook.saves.length).toBe(1)
  })
})

describe('commitPasteChordSheetToTune skipAbcMerge', function() {
  test('updates lyric sheet only when skipAbcMerge is set', function() {
    const tunebook = makeTunebook()
    const notes = [':| "C"z8 |']
    const tune = {
      id: 't1',
      name: 'Test',
      voices: { '1': { notes: notes.slice() } },
      words: [],
      meta: {},
    }
    const result = commitPasteChordSheetToTune({
      tune: tune,
      tunebook: tunebook,
      skipAbcMerge: true,
      result: {
        lyricLines: ['[G]Hello [C]world'],
        chordProSource: '[G]Hello [C]world\n',
        meta: { chordProSource: '[G]Hello [C]world\n' },
        updateLyrics: true,
      },
    })
    expect(result.ok).toBe(true)
    expect(tune.voices['1'].notes).toEqual(notes)
    expect(getPlainLyricLines(tune)).toEqual(['[G]Hello [C]world'])
  })
})
