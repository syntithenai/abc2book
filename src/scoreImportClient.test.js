import { normalizeMidiBytes } from './scoreImportClient'

describe('scoreImportClient', function() {
  test('normalizeMidiBytes unwraps abcjs binary MIDI array', function() {
    const midi = new Uint8Array([77, 84, 104, 100, 0, 0, 0, 6])
    const normalized = normalizeMidiBytes([midi])
    expect(normalized).toBe(midi)
    expect(normalized.byteLength).toBe(8)
  })

  test('normalizeMidiBytes keeps Uint8Array unchanged', function() {
    const midi = new Uint8Array([1, 2, 3])
    expect(normalizeMidiBytes(midi)).toBe(midi)
  })
})
