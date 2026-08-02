import { offerBlobDownload } from './offerBlobDownload'

jest.mock('react-toastify', function() {
  return {
    toast: {
      info: jest.fn(function() { return 'toast-id' }),
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

  test('shows click-to-save toast when alwaysPrompt is true', async function() {
    const blob = new Blob(['audio'], { type: 'audio/mp4' })
    const result = await offerBlobDownload(blob, 'song.m4a', { alwaysPrompt: true })
    const { toast } = require('react-toastify')
    expect(result.method).toBe('toast')
    expect(toast.info).toHaveBeenCalled()
    if (result.dismiss) result.dismiss()
  })
})
