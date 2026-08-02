jest.mock('./scratchpadStore', function() {
  const actual = jest.requireActual('./scratchpadStore')
  return Object.assign({}, actual, {
    createScratchpadItem: jest.fn(),
  })
})

jest.mock('./scratchpadBlobs', function() {
  return {
    getScratchpadBlob: jest.fn(),
    putScratchpadBlob: jest.fn(),
    scratchpadBlobKey: jest.fn(function(id, kind) { return 'scratchpad:' + id + ':' + kind }),
  }
})

jest.mock('./sheetImageTranscriptionClient', function() {
  return {
    transcribeSheetImageFile: jest.fn(),
  }
})

jest.mock('./scratchpadAudioInsert', function() {
  return {
    resolveScratchpadItemAudioBlob: jest.fn(),
  }
})

jest.mock('./chordDiscoveryClient', function() {
  return {
    discoverChordsFromSource: jest.fn(),
  }
})

jest.mock('./mediaAnalysisClient', function() {
  return {
    analyzeMediaFromSource: jest.fn(),
    formatMediaAnalysisForTune: jest.fn(),
  }
})

jest.mock('./mediaAnalysisSuggestions', function() {
  return {
    buildMediaAnalysisNotationAbc: jest.fn(),
  }
})

jest.mock('./lyricsTranscriptionClient', function() {
  return {
    transcribeLyricsSource: jest.fn(),
  }
})

jest.mock('./longRunningJobRegistry', function() {
  return {
    registerLongRunningJob: jest.fn(function() { return function() {} }),
  }
})

jest.mock('./scratchpadExportToast', function() {
  return {
    showScratchpadExportToast: jest.fn(),
  }
})

import { getScratchpadBlob } from './scratchpadBlobs'
import { transcribeSheetImageFile } from './sheetImageTranscriptionClient'
import { resolveScratchpadItemAudioBlob } from './scratchpadAudioInsert'
import { discoverChordsFromSource } from './chordDiscoveryClient'
import { analyzeMediaFromSource, formatMediaAnalysisForTune } from './mediaAnalysisClient'
import { buildMediaAnalysisNotationAbc } from './mediaAnalysisSuggestions'
import { transcribeLyricsSource } from './lyricsTranscriptionClient'
import { registerLongRunningJob } from './longRunningJobRegistry'
import { showScratchpadExportToast } from './scratchpadExportToast'
import {
  runScratchpadAnalyse,
  runScratchpadImageAnalyse,
  runScratchpadAudioChordsAnalyse,
  runScratchpadAudioMelodyAnalyse,
  runScratchpadAudioLyricsAnalyse,
  runScratchpadAudioTranscribe,
} from './scratchpadAnalyse'
import { createScratchpadItem } from './scratchpadStore'

describe('scratchpadAnalyse', function() {
  const tunebook = {
    abcTools: {
      abc2Tunebook: function(abc) {
        return [{
          id: 't1',
          name: 'Imported',
          meter: '4/4',
          noteLength: '1/8',
          key: 'C',
          voices: { V: { notes: ['C D E |'] } },
        }]
      },
    },
  }

  beforeEach(function() {
    jest.clearAllMocks()
    registerLongRunningJob.mockReturnValue(function() {})
    createScratchpadItem.mockImplementation(async function(options) {
      return {
        id: 'new-item',
        type: options.type,
        title: options.title,
        workspaceId: options.workspaceId,
      }
    })
  })

  test('runScratchpadImageAnalyse creates text item from OCR', async function() {
    getScratchpadBlob.mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    transcribeSheetImageFile.mockResolvedValue({
      title: 'Song',
      chordSheet: { text: 'Am G C' },
      melody: null,
    })

    const item = await runScratchpadImageAnalyse({
      id: 'img-1',
      type: 'image',
      title: 'Chart',
      image: { blobKey: 'blob' },
    }, {
      workspaceId: 'ws-1',
      mode: 'ocr',
      tunebook: tunebook,
    })

    expect(createScratchpadItem).toHaveBeenCalledWith(expect.objectContaining({
      type: 'text',
      workspaceId: 'ws-1',
      textBody: 'Am G C',
      title: 'Song',
    }))
    expect(item.id).toBe('new-item')
  })

  test('runScratchpadImageAnalyse creates notation item from OMR', async function() {
    getScratchpadBlob.mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    transcribeSheetImageFile.mockResolvedValue({
      title: 'Tune',
      chordSheet: { text: '' },
      melody: { abc: 'X:1\nT:Tune\nM:4/4\nL:1/8\nK:C\nC D E |' },
    })

    await runScratchpadImageAnalyse({
      id: 'img-2',
      type: 'image',
      title: 'Score',
      image: { blobKey: 'blob' },
    }, {
      workspaceId: 'ws-1',
      mode: 'omr',
      tunebook: tunebook,
    })

    expect(createScratchpadItem).toHaveBeenCalledWith(expect.objectContaining({
      type: 'notation',
      workspaceId: 'ws-1',
      tuneSnapshot: expect.objectContaining({ name: 'Imported' }),
    }))
  })

  test('runScratchpadAudioChordsAnalyse creates text item with chord grid', async function() {
    resolveScratchpadItemAudioBlob.mockResolvedValue(new Blob(['wav'], { type: 'audio/wav' }))
    discoverChordsFromSource.mockResolvedValue({
      segments: [{ start: 0, end: 1, label: 'C:maj' }],
      beatTimes: [0, 0.5, 1, 1.5],
    })

    await runScratchpadAudioChordsAnalyse({
      id: 'aud-1',
      type: 'audio',
      title: 'Recording',
      audio: { tracks: [] },
    }, {
      workspaceId: 'ws-1',
      tunebook: tunebook,
    })

    expect(createScratchpadItem).toHaveBeenCalledWith(expect.objectContaining({
      type: 'text',
      workspaceId: 'ws-1',
      title: 'Recording — chords',
    }))
    const args = createScratchpadItem.mock.calls[0][0]
    expect(String(args.textBody || '')).toMatch(/C/)
  })

  test('runScratchpadAudioMelodyAnalyse creates notation item', async function() {
    resolveScratchpadItemAudioBlob.mockResolvedValue(new Blob(['wav'], { type: 'audio/wav' }))
    analyzeMediaFromSource.mockResolvedValue({ melody: { notes: [] }, chords: {}, lyrics: {} })
    formatMediaAnalysisForTune.mockReturnValue({
      melodyText: 'C D E |',
      chordsText: '',
      meter: '4/4',
      key: 'C',
      tempo: 120,
    })
    buildMediaAnalysisNotationAbc.mockReturnValue('X:1\nT:Recording — melody\nM:4/4\nL:1/8\nK:C\nC D E |')

    await runScratchpadAudioMelodyAnalyse({
      id: 'aud-2',
      type: 'audio',
      title: 'Recording',
      audio: { tracks: [] },
    }, {
      workspaceId: 'ws-1',
      tunebook: tunebook,
      abcjsParser: {},
    })

    expect(createScratchpadItem).toHaveBeenCalledWith(expect.objectContaining({
      type: 'notation',
      workspaceId: 'ws-1',
      title: 'Imported',
    }))
  })

  test('runScratchpadAudioLyricsAnalyse creates text item with lyrics', async function() {
    resolveScratchpadItemAudioBlob.mockResolvedValue(new Blob(['wav'], { type: 'audio/wav' }))
    transcribeLyricsSource.mockResolvedValue({
      text: 'First line\nSecond line',
      segments: [],
      language: 'en',
      backend: 'whisper',
    })

    await runScratchpadAudioLyricsAnalyse({
      id: 'aud-3',
      type: 'audio',
      title: 'Vocal take',
      audio: { tracks: [] },
    }, {
      workspaceId: 'ws-1',
      tunebook: tunebook,
    })

    expect(createScratchpadItem).toHaveBeenCalledWith(expect.objectContaining({
      type: 'text',
      workspaceId: 'ws-1',
      title: 'Vocal take — lyrics',
      textBody: 'First line\nSecond line',
    }))
  })

  test('runScratchpadAudioTranscribe creates text item with transcription', async function() {
    resolveScratchpadItemAudioBlob.mockResolvedValue(new Blob(['wav'], { type: 'audio/wav' }))
    transcribeLyricsSource.mockResolvedValue({
      text: 'Hello world',
      segments: [],
      language: 'en',
      backend: 'whisper',
    })

    await runScratchpadAudioTranscribe({
      id: 'aud-4',
      type: 'audio',
      title: 'Voice memo',
      audio: { tracks: [] },
    }, {
      workspaceId: 'ws-1',
    })

    expect(createScratchpadItem).toHaveBeenCalledWith(expect.objectContaining({
      type: 'text',
      workspaceId: 'ws-1',
      title: 'Voice memo — transcription',
      textBody: 'Hello world',
    }))
  })

  test('runScratchpadAnalyse registers background job and shows open toast', async function() {
    getScratchpadBlob.mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    transcribeSheetImageFile.mockResolvedValue({
      title: 'Song',
      chordSheet: { text: 'Am G C' },
      melody: null,
    })
    const onOpen = jest.fn()

    await runScratchpadAnalyse({
      id: 'img-1',
      type: 'image',
      title: 'Chart',
      image: { blobKey: 'blob' },
    }, {
      workspaceId: 'ws-1',
      mode: 'ocr',
      tunebook: tunebook,
      onOpenItem: onOpen,
    })

    expect(registerLongRunningJob).toHaveBeenCalledWith(expect.objectContaining({
      label: 'Scratchpad image OCR',
      onCancel: expect.any(Function),
    }))
    expect(showScratchpadExportToast).toHaveBeenCalledWith(expect.objectContaining({
      message: 'OCR text saved to scratchpad',
      itemId: 'new-item',
      onOpen: onOpen,
    }))
  })
})
