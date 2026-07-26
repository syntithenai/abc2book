import {
  buildScratchpadCreateOptions,
  getScratchpadDriveMimeTypes,
  getScratchpadFileAccept,
  loadScratchpadDriveFile,
  notationFileNeedsImportWizard,
  pickScratchpadDriveFiles,
  prepareScratchpadCreateFiles,
  scratchpadSourcesForType,
} from './scratchpadCreateImport'
import { openGoogleDrivePicker } from './googleDrivePickerClient'

jest.mock('./googleDrivePickerClient', function() {
  return {
    DRIVE_READONLY_SCOPE: 'https://www.googleapis.com/auth/drive.readonly',
    fetchDriveFileBlob: jest.fn(),
    fetchDriveFileText: jest.fn(),
    openGoogleDrivePicker: jest.fn(),
  }
})

jest.mock('./midiImportWizard', function() {
  return { openMidiImportWizard: jest.fn() }
})

describe('scratchpadCreateImport', function() {
  test('lists Google Drive and Google Photos sources for images when logged in', function() {
    const sources = scratchpadSourcesForType('image', null, { loggedIn: true })
    expect(sources.map(function(s) { return s.key })).toEqual([
      'blank', 'camera', 'import', 'drive', 'google-photos',
    ])
  })

  test('hides Google sources when not logged in', function() {
    const imageSources = scratchpadSourcesForType('image', null, { loggedIn: false })
    expect(imageSources.map(function(s) { return s.key })).toEqual([
      'blank', 'camera', 'import',
    ])
    const audioSources = scratchpadSourcesForType('audio', null, { loggedIn: false })
    expect(audioSources.map(function(s) { return s.key })).toEqual([
      'capture', 'import',
    ])
    const notationSources = scratchpadSourcesForType('notation', { mode: 'available' }, { loggedIn: false })
    expect(notationSources.map(function(s) { return s.key })).toEqual([
      'blank', 'import',
    ])
  })

  test('lists Google Drive source for audio when logged in', function() {
    const sources = scratchpadSourcesForType('audio', null, { loggedIn: true })
    expect(sources.map(function(s) { return s.key })).toEqual([
      'capture', 'import', 'drive',
    ])
  })

  test('uses notation ABC-only drive mime types when abcOnly', function() {
    const mimes = getScratchpadDriveMimeTypes('notation', { abcOnly: true })
    expect(mimes).toEqual(['text/plain', 'application/vnd.google-apps.document'])
  })

  test('file accept includes video for audio scratchpad items', function() {
    expect(getScratchpadFileAccept('audio')).toContain('video/*')
  })

  test('buildScratchpadCreateOptions accepts video files for audio items', async function() {
    const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' })
    const options = await buildScratchpadCreateOptions('audio', file, {})
    expect(options).toEqual({ title: 'clip', blob: file })
  })

  test('buildScratchpadCreateOptions builds text item from plain file', async function() {
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' })
    const options = await buildScratchpadCreateOptions('text', file, {})
    expect(options).toEqual({ textBody: 'hello', title: 'note' })
  })

  test('notationFileNeedsImportWizard detects midi files', function() {
    const midi = new File(['midi'], 'tune.mid', { type: 'audio/midi' })
    expect(notationFileNeedsImportWizard(midi)).toBe(true)
    const abc = new File(['X:1'], 'tune.abc', { type: 'text/plain' })
    expect(notationFileNeedsImportWizard(abc)).toBe(false)
  })

  test('prepareScratchpadCreateFiles keeps only first file when midi is in batch', function() {
    const midi1 = new File(['a'], 'a.mid', { type: 'audio/midi' })
    const midi2 = new File(['b'], 'b.mid', { type: 'audio/midi' })
    const result = prepareScratchpadCreateFiles('notation', [midi1, midi2])
    expect(result.files).toEqual([midi1])
    expect(result.skipped).toBe(1)
  })

  test('prepareScratchpadCreateFiles keeps all abc files in batch', function() {
    const abc1 = new File(['X:1'], 'a.abc', { type: 'text/plain' })
    const abc2 = new File(['X:2'], 'b.abc', { type: 'text/plain' })
    const result = prepareScratchpadCreateFiles('notation', [abc1, abc2])
    expect(result.files).toEqual([abc1, abc2])
    expect(result.skipped).toBe(0)
  })

  test('prepareScratchpadCreateFiles does not limit non-notation types', function() {
    const a = new File(['a'], 'a.png', { type: 'image/png' })
    const b = new File(['b'], 'b.png', { type: 'image/png' })
    const result = prepareScratchpadCreateFiles('image', [a, b])
    expect(result.files).toEqual([a, b])
    expect(result.skipped).toBe(0)
  })

  test('pickScratchpadDriveFiles loads multiple drive selections', async function() {
    const onFetchStart = jest.fn()
    const onFetchProgress = jest.fn()
    const driveApi = {
      getDocumentMeta: jest.fn()
        .mockResolvedValueOnce({ name: 'a.png', mimeType: 'image/png' })
        .mockResolvedValueOnce({ name: 'b.png', mimeType: 'image/png' }),
    }
    const blob = new Blob(['png'], { type: 'image/png' })
    const { fetchDriveFileBlob } = require('./googleDrivePickerClient')
    fetchDriveFileBlob.mockResolvedValue(blob)
    openGoogleDrivePicker.mockResolvedValue([{ id: 'id1' }, { id: 'id2' }])

    const files = await pickScratchpadDriveFiles({
      token: { access_token: 'token' },
      driveApi: driveApi,
      itemType: 'image',
      mimeTypes: ['image/png'],
      multiSelect: true,
      onFetchStart: onFetchStart,
      onFetchProgress: onFetchProgress,
    })

    expect(onFetchStart).toHaveBeenCalledWith(2)
    expect(onFetchProgress).toHaveBeenCalledWith(1, 2)
    expect(onFetchProgress).toHaveBeenCalledWith(2, 2)

    expect(openGoogleDrivePicker).toHaveBeenCalledWith(expect.objectContaining({
      multiSelect: true,
      mimeTypes: ['image/png'],
    }))
    expect(files).toHaveLength(2)
    expect(files[0].name).toBe('a.png')
    expect(files[1].name).toBe('b.png')
  })

  test('loadScratchpadDriveFile fetches blob for audio drive files', async function() {
    const driveApi = {
      getDocumentMeta: jest.fn().mockResolvedValue({ name: 'song.mp3', mimeType: 'audio/mpeg' }),
    }
    const blob = new Blob(['mp3'], { type: 'audio/mpeg' })
    const { fetchDriveFileBlob } = require('./googleDrivePickerClient')
    fetchDriveFileBlob.mockResolvedValue(blob)

    const file = await loadScratchpadDriveFile(driveApi, 'file-id', null, 'audio')
    expect(file.name).toBe('song.mp3')
    expect(file.type).toBe('audio/mpeg')
  })
})
