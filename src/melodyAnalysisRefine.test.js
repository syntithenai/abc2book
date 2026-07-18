import { applyMelodyNoteSettingsToDraft, refilterMelodyNotes } from './melodyRefilterUtils'
import { buildMediaAnalysisNotationAbc } from './mediaAnalysisSuggestions'

describe('melody analysis refine apply behavior', function() {
  test('refilter changes preview ABC then merge rematches chords', function() {
    const sourceNotes = [
      { midi: 60, start: 0, end: 0.5, confidence: 0.9 },
      { midi: 62, start: 0.5, end: 0.55, confidence: 0.2 },
      { midi: 64, start: 1, end: 1.5, confidence: 0.8 },
    ]
    const sparse = refilterMelodyNotes(sourceNotes, {
      confidenceThreshold: 0.7,
      minNoteSeconds: 0.12,
      quantizeStrength: 0,
    }, [])
    expect(sparse.length).toBe(2)

    const draft = {
      melodySourceNotes: sourceNotes,
      timedMelody: {
        beatTimes: [0, 0.5, 1, 1.5],
        beatsPerBar: 4,
        detectedKey: 'C',
      },
      metadata: { meter: '4/4', noteLength: '1/8', key: 'C' },
    }
    const patch = applyMelodyNoteSettingsToDraft(draft, {
      noiseMode: 'sparse',
      confidenceThreshold: 0.7,
      minNoteSeconds: 0.12,
      quantizeStrength: 0,
    }, {
      abcTools: {
        justNotes: function(abc) {
          return String(abc || '').split('\n').filter(function(line) {
            return line && !/^[A-Za-z]:/.test(line)
          }).join('\n')
        },
      },
    })
    expect(patch.melodyNotesText || patch.melodyAbcText).toBeTruthy()

    const preview = buildMediaAnalysisNotationAbc({
      melodyText: patch.melodyNotesText || patch.melodyAbcText,
      chordsText: 'C | G |',
      meter: '4/4',
      key: 'C',
    }, { name: 'Refine', meter: '4/4', key: 'C' }, {
      abcjsParser: {
        mergeMelody: function(melody, base) {
          return String(base || '') + String(melody || '')
        },
        mergeChords: function(chords, base) {
          return String(base || '') + '<<' + String(chords || '') + '>>'
        },
      },
    })
    expect(preview).toContain('<<C | G |>>')
  })
})
