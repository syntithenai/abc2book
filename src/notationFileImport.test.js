import {
  applyImportedNotationToTune,
  importedTuneFromCandidate,
  planNotationFileImport,
  runNotationFileImport,
  tagCandidatesForCurrentTune,
  tuneHasNotation,
} from './notationFileImport'

jest.mock('./addImportDispatch', function() {
  return {
    buildImportContext: jest.fn(function(opts) { return opts || {} }),
    dispatchAddImport: jest.fn(),
  }
})

jest.mock('./midiImportWizard', function() {
  return {
    openMidiImportWizard: jest.fn(),
  }
})

const { dispatchAddImport } = require('./addImportDispatch')
const { openMidiImportWizard } = require('./midiImportWizard')

function midiFile() {
  return new File([new Uint8Array([0x4d, 0x54, 0x68, 0x64])], 'tune.mid', { type: 'audio/midi' })
}

describe('notationFileImport', function() {
  beforeEach(function() {
    dispatchAddImport.mockReset()
    openMidiImportWizard.mockReset()
  })

  test('tuneHasNotation is true when voices have notes', function() {
    expect(tuneHasNotation({
      voices: { '1': { meta: '', notes: ['C D E'] } },
    })).toBe(true)
    expect(tuneHasNotation({ voices: { '1': { meta: '', notes: [''] } } })).toBe(false)
    expect(tuneHasNotation({ notes: ['G A B'] })).toBe(true)
    expect(tuneHasNotation({})).toBe(false)
  })

  test('applyImportedNotationToTune keeps id, lyrics, and title', function() {
    const current = {
      id: 'tune-1',
      name: 'Mine',
      composer: 'Me',
      words: ['hello'],
      links: [{ url: 'https://example.com' }],
      voices: { '1': { meta: '', notes: ['C'] } },
      key: 'C',
    }
    const imported = {
      name: 'Other',
      voices: { '1': { meta: '', notes: ['G A B'] }, '2': { meta: '', notes: ['E'] } },
      key: 'G',
      meter: '3/4',
      srcUrl: 'https://files.example/score.mid',
    }
    const next = applyImportedNotationToTune(current, imported)
    expect(next.id).toBe('tune-1')
    expect(next.name).toBe('Mine')
    expect(next.composer).toBe('Me')
    expect(next.words).toEqual(['hello'])
    expect(next.links).toEqual([{ url: 'https://example.com' }])
    expect(next.voices).toEqual(imported.voices)
    expect(next.key).toBe('G')
    expect(next.meter).toBe('3/4')
    expect(next.srcUrl).toBe('https://files.example/score.mid')
  })

  test('importedTuneFromCandidate prefers tune with notation, else abc', function() {
    expect(importedTuneFromCandidate({ tune: { name: 'A' } })).toEqual({ name: 'A' })
    const tunebook = {
      abcTools: {
        abc2json: function(abc) { return { abc: abc, name: 'FromAbc', voices: { '1': { notes: ['C'] } } } },
        abc2Tunebook: function(abc) { return [{ abc: abc, name: 'FromAbc', voices: { '1': { notes: ['C'] } } }] },
      },
    }
    expect(importedTuneFromCandidate({ abc: 'X:1\nK:C\nC' }, tunebook).name).toBe('FromAbc')
    expect(importedTuneFromCandidate({
      tune: { name: 'Shell', voices: { '1': { notes: [] } } },
      abc: 'X:1\nK:C\nC D E',
    }, tunebook).voices['1'].notes).toEqual(['C'])
  })

  test('planNotationFileImport applies a single candidate when current has no notation', function() {
    const planned = planNotationFileImport({
      action: 'review',
      candidates: [{ tune: { voices: { '1': { notes: ['C'] } } } }],
    }, { currentTune: { id: 't1', name: 'Empty' }, currentTuneId: 't1' })
    expect(planned.action).toBe('apply')
  })

  test('planNotationFileImport opens review when current already has notation', function() {
    const planned = planNotationFileImport({
      action: 'review',
      candidates: [{ id: 'c1', tune: { voices: { '1': { notes: ['G'] } } } }],
    }, {
      currentTune: { id: 't1', voices: { '1': { notes: ['C'] } } },
      currentTuneId: 't1',
    })
    expect(planned.action).toBe('review')
    expect(planned.candidates[0].mergeTargetId).toBe('t1')
  })

  test('planNotationFileImport opens review for multi-tune files', function() {
    const planned = planNotationFileImport({
      action: 'review',
      candidates: [{ tune: { name: 'A' } }, { tune: { name: 'B' } }],
    }, { currentTune: { id: 't1' }, currentTuneId: 't1' })
    expect(planned.action).toBe('review')
    expect(planned.candidates).toHaveLength(2)
    expect(tagCandidatesForCurrentTune(planned.candidates, 't1')[1].mergeTargetId).toBe('t1')
  })

  test('planNotationFileImport rejects audio/video', function() {
    const planned = planNotationFileImport({ action: 'audio', files: [] })
    expect(planned.action).toBe('error')
    expect(planned.message).toMatch(/notation file/)
  })

  test('runNotationFileImport opens the MIDI wizard then applies', async function() {
    dispatchAddImport.mockResolvedValue({
      action: 'midiWizard',
      pendingMidi: { file: midiFile(), fileName: 'tune.mid', sourceUrl: '' },
    })
    openMidiImportWizard.mockResolvedValue({
      candidates: [{ sourceKind: 'midi', tune: { voices: { '1': { notes: ['C'] } } } }],
    })
    const planned = await runNotationFileImport(midiFile(), {
      currentTune: { id: 't1', name: 'Empty' },
      currentTuneId: 't1',
      resolverAvailable: true,
    })
    expect(openMidiImportWizard).toHaveBeenCalled()
    expect(planned.action).toBe('apply')
    expect(planned.candidate.sourceKind).toBe('midi')
  })

  test('runNotationFileImport treats MIDI wizard cancel as cancelled', async function() {
    dispatchAddImport.mockResolvedValue({
      action: 'midiWizard',
      pendingMidi: { file: midiFile(), fileName: 'tune.mid' },
    })
    openMidiImportWizard.mockRejectedValue(new Error('MIDI import cancelled'))
    const planned = await runNotationFileImport(midiFile(), {
      currentTune: { id: 't1' },
      currentTuneId: 't1',
    })
    expect(planned.action).toBe('cancelled')
  })
})
