import * as tuneFieldLookupQueue from './tuneFieldLookupQueue'
import { acceptAllFieldSuggestionsForTune } from './fieldLookupAcceptAll'

describe('fieldLookupAcceptAll', function() {
  beforeEach(function() {
    tuneFieldLookupQueue.__resetForTests()
    const tune = { id: 't1', name: 'Song', tempo: 120, voices: { '1': { notes: ['z4 |'] } } }
    tuneFieldLookupQueue.setTuneFieldLookupQueueContext({
      getTune: function() { return tune },
      saveTune: jest.fn(),
      forceRefresh: jest.fn(),
      abcTools: {
        abc2json: function() { return tune },
      },
    })
  })

  test('applies first suggestion per awaiting field on a tune', function() {
    const tune = { id: 't1', name: 'Song', tempo: 120, voices: { '1': { notes: ['z4 |'] } } }
    tuneFieldLookupQueue.setTuneFieldLookupQueueContext({
      getTune: function() { return tune },
      saveTune: jest.fn(),
      forceRefresh: jest.fn(),
      abcTools: {
        abc2json: function() { return tune },
      },
    })
    tuneFieldLookupQueue.seedAwaitingLookup({
      tuneId: 't1',
      kind: 'tempo',
      label: 'Test',
      title: 'Song',
      candidates: [
        { id: 'current', isCurrent: true, value: '120' },
        { tempo: 96, preview: '96', source: 'media-analysis' },
      ],
    })
    const count = acceptAllFieldSuggestionsForTune('t1', {
      tunebook: {
        abcTools: { abc2json: function() { return tune } },
        saveTune: jest.fn(),
      },
      tunes: { t1: tune },
    })
    expect(count).toBe(1)
    expect(tune.tempo).toBe(96)
  })
})
