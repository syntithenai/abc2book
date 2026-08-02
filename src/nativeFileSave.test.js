import { beginBlobSave, completeBlobSave, canUseSaveFilePicker } from './nativeFileSave'

describe('nativeFileSave', function() {
  test('completeBlobSave returns manual fallback when no file handle', async function() {
    const session = { mode: 'manual', filename: 'test.m4a' }
    const blob = new Blob(['audio'], { type: 'audio/mp4' })
    const result = await completeBlobSave(session, blob)
    expect(result.saved).toBe(false)
    expect(result.needsManualSave).toBe(true)
    expect(result.blob).toBe(blob)
    expect(result.filename).toBe('test.m4a')
  })

  test('completeBlobSave honours cancelled session', async function() {
    const result = await completeBlobSave({ mode: 'cancelled' }, new Blob(['x']))
    expect(result.saved).toBe(false)
    expect(result.cancelled).toBe(true)
  })

  test('completeBlobSave rejects empty blobs for file handles', async function() {
    const handle = {
      createWritable: jest.fn(),
      getFile: jest.fn(),
    }
    await expect(completeBlobSave({
      mode: 'fileHandle',
      handle: handle,
      filename: 'song.m4a',
    }, new Blob([]))).rejects.toThrow('Export produced an empty file')
    expect(handle.createWritable).not.toHaveBeenCalled()
  })

  test('canUseSaveFilePicker reflects API availability', function() {
    const original = window.showSaveFilePicker
    window.showSaveFilePicker = function() {}
    expect(canUseSaveFilePicker()).toBe(true)
    delete window.showSaveFilePicker
    expect(canUseSaveFilePicker()).toBe(false)
    window.showSaveFilePicker = original
  })

  test('beginBlobSave uses file picker when available', async function() {
    const writable = {
      write: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      abort: jest.fn().mockResolvedValue(undefined),
    }
    const handle = {
      createWritable: jest.fn().mockResolvedValue(writable),
      getFile: jest.fn().mockResolvedValue({ size: 5 }),
    }
    window.showSaveFilePicker = jest.fn().mockResolvedValue(handle)
    const session = await beginBlobSave('song.m4a')
    expect(session.mode).toBe('fileHandle')
    const blob = new Blob(['audio'], { type: 'audio/mp4' })
    const result = await completeBlobSave(session, blob)
    expect(result.saved).toBe(true)
    expect(handle.createWritable).toHaveBeenCalled()
    expect(writable.write).toHaveBeenCalledWith(expect.any(Uint8Array))
    expect(writable.close).toHaveBeenCalled()
    delete window.showSaveFilePicker
  })
})
