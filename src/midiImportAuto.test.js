jest.mock('./midiAnalyzeClient', function() {
  return {
    analyzeMidiBytes: jest.fn(),
  }
})
jest.mock('./midiToAbcClient', function() {
  return {
    importMidiToAbc: jest.fn(),
  }
})

import { analyzeMidiBytes } from './midiAnalyzeClient'
import { importMidiToAbc } from './midiToAbcClient'
import { importMidiWithWizardDefaults } from './midiImportAuto'

describe('importMidiWithWizardDefaults', function() {
  beforeEach(function() {
    analyzeMidiBytes.mockReset()
    importMidiToAbc.mockReset()
  })

  it('analyzes, picks melody track, and imports with wizard cleanup options', async function() {
    analyzeMidiBytes.mockResolvedValue({
      tempo_bpm: 120,
      time_signature: '2/2',
      estimated_key: 'D',
      recommended_mode: 'melody',
      recommended_track_ids: [0],
      tracks: [
        { index: 0, name: 'Fiddle', is_drum: false, note_count: 80, role_hint: 'melody', program: 40 },
        { index: 1, name: 'Bass', is_drum: false, note_count: 40, role_hint: 'bass', program: 32 },
      ],
    })
    importMidiToAbc.mockResolvedValue({
      abc: 'X:1\nT:Tune\nM:2/2\nL:1/8\nK:D\nA2 B2 |',
      strategy: 'note_events',
      mode: 'melody',
      musicXml: '',
    })

    const out = await importMidiWithWizardDefaults(
      new Uint8Array([0, 1, 2]),
      'tune.mid',
      'token',
      { melodyOnly: true }
    )

    expect(analyzeMidiBytes).toHaveBeenCalled()
    expect(importMidiToAbc).toHaveBeenCalled()
    const opts = importMidiToAbc.mock.calls[0][3]
    expect(opts.mode).toBe('melody')
    expect(opts.strategy).toBe('note_events')
    expect(opts.trackIds).toEqual([0])
    expect(opts.cleanupOptions).toBeTruthy()
    expect(opts.tempoBpm).toBe(120)
    expect(opts.timeSignature).toBe('2/2')
    expect(opts.estimatedKey).toBe('D')
    expect(out.abc).toContain('K:D')
    expect(out.draft.selectedTrackIds).toEqual([0])
  })

  it('falls back to bare note_events when wizard options return empty abc', async function() {
    analyzeMidiBytes.mockResolvedValue({
      tempo_bpm: 100,
      time_signature: '4/4',
      estimated_key: 'C',
      recommended_mode: 'melody',
      tracks: [
        { index: 0, name: 'Grand Piano', is_drum: false, note_count: 10, role_hint: 'harmony', program: 0 },
      ],
    })
    importMidiToAbc
      .mockResolvedValueOnce({
        abc: '',
        strategy: 'note_events',
        mode: 'melody',
        musicXml: '',
      })
      .mockResolvedValueOnce({
        abc: '',
        strategy: 'musicxml',
        mode: 'melody',
        musicXml: '<score-partwise/>',
      })
      .mockResolvedValueOnce({
        abc: 'X:1\nT:Tune\nM:4/4\nL:1/8\nK:C\nC2 D2 |',
        strategy: 'note_events',
        mode: 'melody',
        musicXml: '',
      })

    const out = await importMidiWithWizardDefaults(
      new Uint8Array([0, 1]),
      'tune.mid',
      'token'
    )
    expect(importMidiToAbc).toHaveBeenCalledTimes(3)
    expect(importMidiToAbc.mock.calls[2][3]).toEqual({
      strategy: 'note_events',
      mode: 'melody',
    })
    expect(out.abc).toContain('C2 D2')
    expect(out.draft.selectedTrackIds).toEqual([0])
  })
})
