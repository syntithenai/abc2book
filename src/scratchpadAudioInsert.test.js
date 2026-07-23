import {
  listScratchpadItemAudioSources,
  linkCanInsertAsAudio,
  insertAudioBlobAtPlayhead,
} from './scratchpadAudioInsert'

jest.mock('./mediaExportUtils', function() {
  return { buildTuneMediaExportBlob: jest.fn() }
})

jest.mock('./scratchpadBlobs', function() {
  return {
    getScratchpadBlob: jest.fn(async function(key) {
      if (key === 'mix-key') return { size: 100, type: 'audio/wav' }
      if (key === 'take-key') return { size: 50, type: 'audio/wav' }
      return null
    }),
  }
})

describe('scratchpadAudioInsert', function() {
  test('listScratchpadItemAudioSources includes mixdown and takes', function() {
    const item = {
      type: 'audio',
      id: 'item-1',
      audio: {
        version: 2,
        mixdownBlobKey: 'mix-key',
        tracks: [{
          id: 'trk-1',
          type: 'audio',
          name: 'Main',
          activeTakeId: 'take-1',
          takes: [{ id: 'take-1', blobKey: 'take-key' }],
        }],
      },
    }
    const sources = listScratchpadItemAudioSources(item)
    expect(sources.some(function(s) { return s.source === 'mixdown' })).toBe(true)
    expect(sources.some(function(s) { return s.takeId === 'take-1' })).toBe(true)
  })

  test('linkCanInsertAsAudio allows audio recording and youtube', function() {
    expect(linkCanInsertAsAudio({ link: 'https://example.com/a.mp3' }, function() { return false })).toBe(true)
    expect(linkCanInsertAsAudio({ link: 'abcbook-recording:rec1' }, function() { return false })).toBe(true)
    expect(linkCanInsertAsAudio({ link: 'https://youtube.com/watch?v=abc' }, function() { return true })).toBe(true)
    expect(linkCanInsertAsAudio({ link: '' }, function() { return false })).toBe(false)
  })

  test('insertAudioBlobAtPlayhead delegates to pasteIntoBlob', async function() {
    const { pasteIntoBlob } = require('./scratchpadAudioEditOps')
    const spy = jest.spyOn(require('./scratchpadAudioEditOps'), 'pasteIntoBlob').mockResolvedValue({ size: 1 })
    await insertAudioBlobAtPlayhead({ size: 1 }, { size: 2 }, 1.5, null)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
