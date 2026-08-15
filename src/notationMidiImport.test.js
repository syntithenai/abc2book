import { isDeferredMidiNotationCandidate, importDeferredMidiCandidate } from './notationMidiImport';
import { fetchViaMediaProxy } from './mediaProxyClient';
import { openMidiImportWizard } from './midiImportWizard';

jest.mock('./mediaProxyClient', function() {
  return {
    fetchViaMediaProxy: jest.fn(),
  }
})

jest.mock('./midiImportWizard', function() {
  return {
    openMidiImportWizard: jest.fn(function() {
      return Promise.resolve({ result: { abc: 'X:1\nK:C\nC' } })
    }),
  }
})

const MIDI_HEADER = new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06])

describe('notationMidiImport', function() {
  beforeEach(function() {
    fetchViaMediaProxy.mockReset()
    openMidiImportWizard.mockClear()
  })

  test('isDeferredMidiNotationCandidate detects midi import format', function() {
    expect(isDeferredMidiNotationCandidate({ importFormat: 'midi', midiBytes: 'abc' })).toBe(true);
    expect(isDeferredMidiNotationCandidate({ abc: 'X:1\nK:C\nC' })).toBe(false);
  });

  test('importDeferredMidiCandidate fetches local library files via the media proxy', async function() {
    fetchViaMediaProxy.mockResolvedValue({
      ok: true,
      arrayBuffer: function() {
        return Promise.resolve(MIDI_HEADER.buffer)
      },
    })
    await importDeferredMidiCandidate({
      title: 'Moonlight Sonata',
      importFormat: 'midi',
      sourceUrl: '/midi-resources/Various Artists/Moonlight.mid',
    }, { accessToken: 'token' })
    expect(fetchViaMediaProxy).toHaveBeenCalledWith(
      '/midi-resources/Various%20Artists/Moonlight.mid',
      'token'
    )
    expect(openMidiImportWizard).toHaveBeenCalled()
  })

  test('importDeferredMidiCandidate rejects non-MIDI downloads', async function() {
    const html = new TextEncoder().encode('<!doctype html>')
    fetchViaMediaProxy.mockResolvedValue({
      ok: true,
      arrayBuffer: function() {
        return Promise.resolve(html.buffer)
      },
    })
    await expect(importDeferredMidiCandidate({
      title: 'Moonlight Sonata',
      importFormat: 'midi',
      sourceUrl: '/midi-resources/Various Artists/Moonlight.mid',
    }, { accessToken: 'token' })).rejects.toThrow('not a MIDI file')
    expect(openMidiImportWizard).not.toHaveBeenCalled()
  })
});
