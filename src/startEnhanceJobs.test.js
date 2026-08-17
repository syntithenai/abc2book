jest.mock('./useTuneMediaAnalysis', function() {
  return {
    requestTuneMediaAnalysis: jest.fn(),
  }
})

import { startEnhanceJobs, enhanceStartToastMessage } from './startEnhanceJobs'
import { createEmptyEnhanceSelection } from './enhanceOptions'
import { isTuneFieldEmptyForKind } from './fieldLookupApplyUtils'
import { requestTuneMediaAnalysis } from './useTuneMediaAnalysis'

function selectionWith(ids) {
  const selection = createEmptyEnhanceSelection()
  ids.forEach(function(id) { selection[id] = true })
  return selection
}

describe('startEnhanceJobs', function() {
  beforeEach(function() {
    requestTuneMediaAnalysis.mockReset()
  })

  test('does nothing when no options are ticked', function() {
    const enqueueLookup = jest.fn()
    const result = startEnhanceJobs(
      [{ id: 't1', name: 'Song' }],
      createEmptyEnhanceSelection(),
      { fieldLookupQueue: { enqueueLookup: enqueueLookup } }
    )
    expect(result.started).toBe(0)
    expect(enqueueLookup).not.toHaveBeenCalled()
  })

  test('queues lookup field searches', function() {
    const enqueueLookup = jest.fn().mockReturnValue('job-1')
    const result = startEnhanceJobs(
      [{ id: 't1', name: 'Song' }],
      selectionWith(['artist', 'genre']),
      { fieldLookupQueue: { enqueueLookup: enqueueLookup } }
    )
    expect(result.fieldLookups).toBe(2)
    expect(result.started).toBe(2)
    expect(enqueueLookup.mock.calls.map(function(call) { return call[0].kind })).toEqual([
      'artists',
      'genre',
    ])
  })

  test('skips YouTube search when links are already present', function() {
    const enqueueLookup = jest.fn()
    const tune = { id: 't1', name: 'Song', links: [{ link: 'https://youtu.be/abc' }] }
    expect(isTuneFieldEmptyForKind(tune, 'links')).toBe(false)
    const result = startEnhanceJobs(
      [tune],
      selectionWith(['youtube']),
      {
        resolverAvailable: true,
        fieldLookupQueue: { enqueueLookup: enqueueLookup },
      }
    )
    expect(result.youtube).toBe(0)
    expect(result.skippedHasLinks).toBe(1)
    expect(enqueueLookup).not.toHaveBeenCalled()
  })

  test('queues YouTube search when links are empty', function() {
    const enqueueLookup = jest.fn().mockReturnValue('job-yt')
    const result = startEnhanceJobs(
      [{ id: 't1', name: 'Song', links: [] }],
      selectionWith(['youtube']),
      {
        resolverAvailable: true,
        fieldLookupQueue: { enqueueLookup: enqueueLookup },
      }
    )
    expect(result.youtube).toBe(1)
    expect(enqueueLookup).toHaveBeenCalledWith(expect.objectContaining({ kind: 'links' }))
  })

  test('starts composer discovery and background research', function() {
    const composerQueue = {
      previewEnqueueTunes: function() { return { willDiscover: 1 } },
      enqueueTunes: jest.fn(),
      start: jest.fn(),
    }
    const backgroundQueue = {
      previewEnqueueTunes: function() { return { willResearch: 1 } },
      enqueueTunes: jest.fn(),
      start: jest.fn(),
    }
    const result = startEnhanceJobs(
      [{ id: 't1', name: 'Song' }],
      selectionWith(['composer', 'background']),
      {
        canResearchBackground: true,
        composerQueue: composerQueue,
        backgroundQueue: backgroundQueue,
      }
    )
    expect(result.composer).toBe(1)
    expect(result.background).toBe(1)
    expect(composerQueue.enqueueTunes).toHaveBeenCalled()
    expect(backgroundQueue.enqueueTunes).toHaveBeenCalled()
    expect(composerQueue.start).toHaveBeenCalled()
    expect(backgroundQueue.start).toHaveBeenCalled()
  })

  test('starts play range scans and filtered audio analysis', function() {
    const maybeAutoScan = jest.fn()
    const tunebook = {
      utils: {
        isYoutubeLink: function() { return true },
      },
    }
    const tune = {
      id: 't1',
      name: 'Song',
      links: [{ link: 'https://youtu.be/dQw4w9WgXcQ' }],
    }
    const result = startEnhanceJobs(
      [tune],
      selectionWith(['playRange', 'key', 'lyrics']),
      {
        resolverAvailable: true,
        features: { whisper: true, practiceAnalysis: true, stems: true },
        maybeAutoScan: maybeAutoScan,
        analysisDeps: { tunebook: tunebook },
        tunebook: tunebook,
      }
    )
    expect(result.playRange).toBe(1)
    expect(result.analysis).toBe(1)
    expect(maybeAutoScan).toHaveBeenCalled()
    expect(requestTuneMediaAnalysis).toHaveBeenCalledWith(
      expect.anything(),
      't1',
      expect.objectContaining({
        suggestionKinds: ['key', 'lyrics'],
      })
    )
  })

  test('starts audio analysis for notation and chords when selected', function() {
    const tunebook = {
      utils: {
        isYoutubeLink: function() { return true },
      },
    }
    const result = startEnhanceJobs(
      [{ id: 't1', name: 'Song', links: [{ link: 'https://youtu.be/dQw4w9WgXcQ' }] }],
      selectionWith(['notation', 'chords']),
      {
        analysisDeps: { tunebook: tunebook },
        tunebook: tunebook,
      }
    )
    expect(result.analysis).toBe(1)
    expect(requestTuneMediaAnalysis).toHaveBeenCalledWith(
      expect.anything(),
      't1',
      expect.objectContaining({
        suggestionKinds: ['notation', 'chords'],
      })
    )
  })

  test('toast message lists started work', function() {
    expect(enhanceStartToastMessage({ started: 0 })).toMatch(/No new enhancements/)
    expect(enhanceStartToastMessage({
      started: 2,
      fieldLookups: 2,
      composer: 0,
      background: 0,
      youtube: 0,
      playRange: 0,
      analysis: 0,
    })).toBe('Started 2 lookups.')
  })
})
