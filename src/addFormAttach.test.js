/**
 * @jest-environment node
 */

jest.mock('./tuneFiles', function() {
  return {
    __esModule: true,
    createTuneFileFromBlob: jest.fn(function(options) {
      const tune = options.tune || {}
      const meta = {
        id: 'file-1',
        name: options.name || 'File',
        type: options.type || 'image/png',
        googleId: null,
        source: 'import',
        uploadPending: !!options.uploadToDrive,
      }
      return Promise.resolve({
        tune: Object.assign({}, tune, {
          tuneFiles: (Array.isArray(tune.tuneFiles) ? tune.tuneFiles : []).concat([meta]),
          activeFile: meta.id,
        }),
        meta: meta,
      })
    }),
    removeTuneFileMeta: function(tune, fileId) {
      return Object.assign({}, tune, {
        tuneFiles: (tune.tuneFiles || []).filter(function(f) { return f.id !== fileId }),
        activeFile: tune.activeFile === fileId ? '' : tune.activeFile,
      })
    },
    deleteStoredTuneFile: jest.fn(function() { return Promise.resolve() }),
    isPdfTuneFileType: function(type) {
      return String(type || '').toLowerCase() === 'application/pdf'
    },
  }
})

jest.mock('./pdfSnapshotIndex', function() {
  return {
    __esModule: true,
    indexPdfTuneFile: jest.fn(function(tune) { return Promise.resolve(tune) }),
  }
})

jest.mock('./linkRecording', function() {
  return {
    __esModule: true,
    isOwnedMediaLink: function(link) {
      return !!(link && (link.recordingId || (link.link && String(link.link).indexOf('abcbook-recording:') === 0)))
    },
    createAttachedAudioLink: jest.fn(function(options) {
      return Promise.resolve({
        link: {
          title: options.title || 'audio',
          link: 'abcbook-recording:rec-1',
          recordingId: 'rec-1',
          source: 'file',
          mediaKind: 'audio',
          uploadPending: !!options.uploadToDrive,
        },
      })
    }),
    createAttachedVideoLink: jest.fn(function(options) {
      return Promise.resolve({
        link: {
          title: options.title || 'video',
          link: 'abcbook-recording:rec-2',
          recordingId: 'rec-2',
          source: 'video-file',
          mediaKind: 'video',
          uploadPending: !!options.uploadToDrive,
        },
      })
    }),
  }
})

jest.mock('./audioFileMetadata', function() {
  return {
    __esModule: true,
    isAudioImportFile: function(file) {
      return !!(file && /audio|\.mp3/i.test(String(file.type || '') + String(file.name || '')))
    },
    isVideoImportFile: function(file) {
      return !!(file && /video|\.mp4/i.test(String(file.type || '') + String(file.name || '')))
    },
    readAudioFileMetadata: jest.fn(function() {
      return Promise.resolve({ title: 'Song Title', artist: 'Artist' })
    }),
  }
})

jest.mock('./importSourceParse', function() {
  return {
    __esModule: true,
    isSheetImageImportFile: function(file) {
      if (!file) return false
      const type = String(file.type || '').toLowerCase()
      const name = String(file.name || '').toLowerCase()
      if (type === 'application/pdf' || name.endsWith('.pdf')) return true
      if (type.indexOf('image/') === 0 && type !== 'image/svg+xml') return true
      return false
    },
  }
})

describe('addFormAttach', function() {
  let addFormAttach
  let tuneFiles
  let linkRecording

  beforeEach(function() {
    jest.resetModules()
    addFormAttach = require('./addFormAttach')
    tuneFiles = require('./tuneFiles')
    linkRecording = require('./linkRecording')
  })

  test('ensureAddDraftTuneId assigns id when missing', function() {
    const withId = addFormAttach.ensureAddDraftTuneId({ name: 'X' })
    expect(withId.id).toMatch(/^tune-/)
    expect(addFormAttach.ensureAddDraftTuneId({ id: 'keep' }).id).toBe('keep')
  })

  test('addDraftHasLocalAttachments detects files and owned media', function() {
    expect(addFormAttach.addDraftHasLocalAttachments({})).toBe(false)
    expect(addFormAttach.addDraftHasLocalAttachments({ tuneFiles: [{ id: 'f1' }] })).toBe(true)
    expect(addFormAttach.addDraftHasLocalAttachments({
      links: [{ recordingId: 'r1', link: 'abcbook-recording:r1' }],
    })).toBe(true)
  })

  test('classifyAddFormFile recognizes sheet and media', function() {
    expect(addFormAttach.classifyAddFormFile({ name: 'a.png', type: 'image/png' })).toBe('sheetImage')
    expect(addFormAttach.classifyAddFormFile({ name: 'a.pdf', type: 'application/pdf' })).toBe('sheetImage')
    expect(addFormAttach.classifyAddFormFile({ name: 'a.mp3', type: 'audio/mpeg' })).toBe('audio')
    expect(addFormAttach.classifyAddFormFile({ name: 'a.mp4', type: 'video/mp4' })).toBe('video')
    expect(addFormAttach.classifyAddFormFile({ name: 'a.abc', type: 'text/plain' })).toBe(null)
  })

  test('attachSheetImageToAddDraft stores local file without Drive upload', async function() {
    const file = { name: 'chart.png', type: 'image/png' }
    const next = await addFormAttach.attachSheetImageToAddDraft({ name: '' }, file)
    expect(tuneFiles.createTuneFileFromBlob).toHaveBeenCalledWith(expect.objectContaining({
      uploadToDrive: false,
      name: 'chart.png',
    }))
    expect(next.tuneFiles).toHaveLength(1)
    expect(next.tuneFiles[0].uploadPending).toBe(false)
    expect(next.id).toBeTruthy()
  })

  test('attachMediaFilesToAddDraft adds local audio link', async function() {
    const file = { name: 'take.mp3', type: 'audio/mpeg' }
    const next = await addFormAttach.attachMediaFilesToAddDraft({ name: '' }, [file], 'audio')
    expect(linkRecording.createAttachedAudioLink).toHaveBeenCalledWith(expect.objectContaining({
      uploadToDrive: false,
    }))
    expect(next.links).toHaveLength(1)
    expect(next.links[0].recordingId).toBe('rec-1')
    expect(next.name).toBe('Song Title')
    expect(next.composer).toBe('Artist')
  })

  test('removeAddDraftMediaLink drops by index', function() {
    const tune = {
      links: [
        { title: 'a', recordingId: '1', link: 'abcbook-recording:1' },
        { title: 'b', recordingId: '2', link: 'abcbook-recording:2' },
      ],
    }
    const next = addFormAttach.removeAddDraftMediaLink(tune, 0)
    expect(next.links).toHaveLength(1)
    expect(next.links[0].title).toBe('b')
  })
})
