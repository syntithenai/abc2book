import { offerBlobDownload, showReadyDownloadToast } from './offerBlobDownload'

jest.mock('react-toastify', function() {
  return {
    toast: {
      info: jest.fn(function() { return 'toast-id' }),
      success: jest.fn(function() { return 'toast-id' }),
      dismiss: jest.fn(),
    },
  }
})

jest.mock('./tuneDownloadActions', function() {
  return {
    downloadBlob: jest.fn(function() { return Promise.resolve() }),
  }
})

describe('offerBlobDownload', function() {
  beforeEach(function() {
    jest.clearAllMocks()
    global.URL.createObjectURL = jest.fn(function() { return 'blob:mock' })
    global.URL.revokeObjectURL = jest.fn()
  })

  test('delivers immediately when anchor download succeeds', async function() {
    const blob = new Blob(['audio'], { type: 'audio/mp4' })
    const result = await offerBlobDownload(blob, 'song.m4a')
    expect(result.method).toBe('immediate')
    expect(result.delivered).toBe(true)
    const { toast } = require('react-toastify')
    expect(toast.success).not.toHaveBeenCalled()
  })

  test('shows ready toast with buttons when immediate download fails', async function() {
    const { downloadBlob } = require('./tuneDownloadActions')
    downloadBlob.mockRejectedValueOnce(new Error('blocked'))
    const blob = new Blob(['audio'], { type: 'audio/mp4' })
    const result = await offerBlobDownload(blob, 'song.m4a')
    const { toast } = require('react-toastify')
    expect(result.method).toBe('toast')
    expect(toast.success).toHaveBeenCalled()
    if (result.dismiss) result.dismiss()
  })

  test('showReadyDownloadToast registers a persistent toast', function() {
    const ready = {
      blob: new Blob(['audio'], { type: 'audio/mp4' }),
      filename: 'song.m4a',
      url: 'blob:mock',
    }
    const result = showReadyDownloadToast(ready)
    const { toast } = require('react-toastify')
    expect(result.method).toBe('toast')
    expect(toast.success).toHaveBeenCalled()
    if (result.dismiss) result.dismiss()
  })
})
