/**
 * @jest-environment jsdom
 */
import {
  shareSetEmailSubject,
  shareSetEmailBody,
  shareGroupEmailSubject,
  shareGroupEmailBody,
  collectCompareDriveFileIds,
  stripLocalOnlyCompareSet,
  captureSetupMismatch,
  audioAnalysisProgressPercent
} from './audioAnalysisShareUtils'
import { importSharedAudioAnalysisSet, importSharedAudioAnalysisGroup } from './audioAnalysisShare'
import {
  listGroups,
  listSets,
  getNoteAudioBlob,
  __clearAudioAnalysisStoreForTests
} from './soundpostSetStore'

describe('audioAnalysis set share helpers', function() {
  test('shareSetEmailSubject uses set label', function() {
    expect(shareSetEmailSubject({ label: 'Post move A' })).toBe('Audio Analysis set: Post move A')
    expect(shareSetEmailSubject(null)).toBe('Audio Analysis set: Recording set')
  })

  test('shareSetEmailBody includes link', function() {
    const body = shareSetEmailBody('https://example.com/#/audioanalysis/share/abc')
    expect(body).toContain('https://example.com/#/audioanalysis/share/abc')
    expect(body.toLowerCase()).toContain('recording set')
  })

  test('shareGroupEmailSubject includes label and count', function() {
    expect(shareGroupEmailSubject('Soundpost A', 2)).toBe('Audio Analysis group: Soundpost A (2 sets)')
    expect(shareGroupEmailSubject('', 1)).toBe('Audio Analysis group: Ungrouped (1 set)')
  })

  test('shareGroupEmailBody includes link and group name', function() {
    const body = shareGroupEmailBody('https://example.com/#/audioanalysis/share/g1', 'Soundpost A')
    expect(body).toContain('https://example.com/#/audioanalysis/share/g1')
    expect(body).toContain('Soundpost A')
  })

  test('audioAnalysisProgressPercent handles counts', function() {
    expect(audioAnalysisProgressPercent(null)).toBeNull()
    expect(audioAnalysisProgressPercent({ current: 1, total: 4 })).toBe(25)
    expect(audioAnalysisProgressPercent({ current: 0, total: 0 })).toBeNull()
  })

  test('captureSetupMismatch warns on stereo and device differences', function() {
    const none = captureSetupMismatch(
      { stereoTap: false, inputDeviceId: 'a' },
      { stereoTap: false, inputDeviceId: 'a' }
    )
    expect(none.message).toBe('')

    const stereo = captureSetupMismatch(
      { channelCount: 1, stereoTap: false },
      { channelCount: 2, stereoTap: true }
    )
    expect(stereo.stereoMismatch).toBe(true)
    expect(stereo.message).toMatch(/mono vs stereo/)

    const device = captureSetupMismatch(
      { inputDeviceId: 'mic-1', inputDeviceLabel: 'Built-in' },
      { inputDeviceId: 'mic-2', inputDeviceLabel: 'USB' }
    )
    expect(device.deviceMismatch).toBe(true)
    expect(device.message).toMatch(/Built-in/)
    expect(device.message).toMatch(/USB/)
  })

  test('collectCompareDriveFileIds works with a single set', function() {
    const ids = collectCompareDriveFileIds(
      { notes: [{ driveFileId: 'a1' }, { driveFileId: 'a2' }] },
      null,
      ['extra']
    )
    expect(ids.sort()).toEqual(['a1', 'a2', 'extra'].sort())
  })

  test('stripLocalOnlyCompareSet keeps features and drive ids', function() {
    const stripped = stripLocalOnlyCompareSet({
      id: 's1',
      label: 'Set',
      notes: [{
        id: 'n1',
        targetNote: 'A4',
        audioBlobKey: 'local-key',
        driveFileId: 'drive-1',
        features: { rmsDb: -20 }
      }]
    })
    expect(stripped.notes[0].audioBlobKey).toBeUndefined()
    expect(stripped.notes[0].driveFileId).toBe('drive-1')
    expect(stripped.notes[0].features.rmsDb).toBe(-20)
  })
})

describe('importSharedAudioAnalysisSet', function() {
  beforeEach(async function() {
    await __clearAudioAnalysisStoreForTests()
  })

  test('imports set into matching group and downloads audio', async function() {
    const wav = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/wav' })
    const driveApi = {
      getPublicDocumentBlob: jest.fn(async function() { return wav }),
      getDocumentBlob: jest.fn()
    }
    const result = await importSharedAudioAnalysisSet(driveApi, {
      manifestFileId: 'manifest-1',
      groupLabel: 'Soundpost A',
      set: {
        id: 'remote-set',
        label: 'Before move',
        instrument: 'violin',
        measurementMode: 'bowed',
        notes: [{
          id: 'n1',
          targetNote: 'A4',
          driveFileId: 'drive-note-1',
          features: { rmsDb: -18 }
        }]
      }
    })
    expect(result.ok).toBe(true)
    expect(result.alreadyImported).toBe(false)
    expect(result.notesWithAudio).toBe(1)

    const groups = await listGroups()
    expect(groups.length).toBe(1)
    expect(groups[0].label).toBe('Soundpost A')

    const sets = await listSets()
    expect(sets.length).toBe(1)
    expect(sets[0].label).toBe('Before move')
    expect(sets[0].groupId).toBe(groups[0].id)
    expect(sets[0].sourceManifestId).toBe('manifest-1')
    expect(sets[0].notes[0].driveFileId).toBeNull()
    expect(sets[0].notes[0].audioBlobKey).toBeTruthy()
    expect(await getNoteAudioBlob(sets[0].notes[0].audioBlobKey)).toBeTruthy()

    const again = await importSharedAudioAnalysisSet(driveApi, {
      manifestFileId: 'manifest-1',
      groupLabel: 'Soundpost A',
      set: { id: 'remote-set', label: 'Before move', notes: [] }
    })
    expect(again.alreadyImported).toBe(true)
    expect((await listSets()).length).toBe(1)
  })

  test('copies note audio into recipient Drive when copyToDrive is set', async function() {
    const wav = new Blob([new Uint8Array([9, 8, 7, 6])], { type: 'audio/wav' })
    let createCount = 0
    const driveApi = {
      getPublicDocumentBlob: jest.fn(async function() { return wav }),
      getDocumentBlob: jest.fn(),
      findTuneBookFolderInDrive: jest.fn(async function() { return 'tb' }),
      findOrCreateAudioAnalysisFolderInDrive: jest.fn(async function() { return 'aa' }),
      findFileInFolder: jest.fn(async function() { return 'blobs' }),
      createDocument: jest.fn(async function() {
        createCount += 1
        return 'recipient-drive-' + createCount
      }),
      updateDocumentData: jest.fn(async function() { return true })
    }
    const result = await importSharedAudioAnalysisSet(driveApi, {
      manifestFileId: 'manifest-drive-copy',
      groupLabel: 'Drive Copy',
      copyToDrive: true,
      syncIndex: false,
      set: {
        id: 'remote-set-2',
        label: 'Tap set',
        notes: [{
          id: 'n1',
          targetNote: 'Tap 1',
          driveFileId: 'sharer-drive-1',
          features: {}
        }]
      }
    })
    expect(result.ok).toBe(true)
    expect(result.notesCopiedToDrive).toBe(1)
    const sets = await listSets()
    const imported = sets.find(function(s) { return s.sourceManifestId === 'manifest-drive-copy' })
    expect(imported.notes[0].driveFileId).toBe('recipient-drive-1')
    expect(imported.notes[0].driveFileId).not.toBe('sharer-drive-1')
  })
  test('copies note audio into recipient Drive when copyToDrive is set', async function() {
    const wav = new Blob([new Uint8Array([9, 8, 7, 6])], { type: 'audio/wav' })
    let created = 0
    const driveApi = {
      getPublicDocumentBlob: jest.fn(async function() { return wav }),
      getDocumentBlob: jest.fn(async function() {
        return new Blob([JSON.stringify({ version: 2, groups: [], sets: [], deletedSets: [], deletedGroups: [] })], {
          type: 'application/json'
        })
      }),
      findTuneBookFolderInDrive: jest.fn(async function() { return 'tb-folder' }),
      findOrCreateAudioAnalysisFolderInDrive: jest.fn(async function() { return 'aa-folder' }),
      findFileInFolder: jest.fn(async function(parent, name) {
        if (name === 'blobs') return 'blobs-folder'
        if (name === 'audio-analysis-index.json') return 'index-file'
        return null
      }),
      createDocument: jest.fn(async function() {
        created += 1
        return 'new-drive-' + created
      }),
      updateDocumentData: jest.fn(async function() { return true })
    }
    const result = await importSharedAudioAnalysisSet(driveApi, {
      manifestFileId: 'manifest-copy',
      groupLabel: 'Protected',
      copyToDrive: true,
      set: {
        id: 'remote-copy',
        label: 'Tap set',
        notes: [{
          id: 'n1',
          targetNote: 'Tap 1',
          driveFileId: 'sharer-file',
          features: {}
        }]
      }
    })
    expect(result.ok).toBe(true)
    expect(result.notesCopiedToDrive).toBe(1)
    const sets = await listSets()
    expect(sets[0].notes[0].driveFileId).toBe('new-drive-1')
    expect(sets[0].notes[0].driveFileId).not.toBe('sharer-file')
  })
})

describe('importSharedAudioAnalysisGroup', function() {
  beforeEach(async function() {
    await __clearAudioAnalysisStoreForTests()
  })

  test('imports all sets into one group and dedupes by source set id', async function() {
    const wav = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/wav' })
    const driveApi = {
      getPublicDocumentBlob: jest.fn(async function() { return wav }),
      getDocumentBlob: jest.fn()
    }
    const payload = {
      manifestFileId: 'group-manifest-1',
      groupLabel: 'Session 1',
      sets: [
        {
          id: 'remote-a',
          label: 'Baseline',
          instrument: 'violin',
          measurementMode: 'tap',
          stereoTap: true,
          inputDeviceId: 'dev-1',
          inputDeviceLabel: 'USB Mic',
          channelCount: 2,
          notes: [{ id: 'n1', targetNote: 'Tap 1', driveFileId: 'd1', features: {} }]
        },
        {
          id: 'remote-b',
          label: 'After move',
          instrument: 'violin',
          measurementMode: 'tap',
          stereoTap: false,
          notes: [{ id: 'n2', targetNote: 'Tap 1', driveFileId: 'd2', features: {} }]
        }
      ]
    }
    const result = await importSharedAudioAnalysisGroup(driveApi, payload)
    expect(result.ok).toBe(true)
    expect(result.importedCount).toBe(2)
    expect(result.alreadyImported).toBe(false)

    const groups = await listGroups()
    expect(groups.length).toBe(1)
    expect(groups[0].label).toBe('Session 1')

    const sets = await listSets()
    expect(sets.length).toBe(2)
    expect(sets.map(function(s) { return s.label }).sort()).toEqual(['After move', 'Baseline'])
    expect(sets.every(function(s) { return s.groupId === groups[0].id })).toBe(true)
    expect(sets.find(function(s) { return s.label === 'Baseline' }).stereoTap).toBe(true)
    expect(sets.find(function(s) { return s.label === 'Baseline' }).inputDeviceLabel).toBe('USB Mic')

    const again = await importSharedAudioAnalysisGroup(driveApi, payload)
    expect(again.ok).toBe(true)
    expect(again.alreadyImported).toBe(true)
    expect((await listSets()).length).toBe(2)
  })

  test('emits import progress events', async function() {
    const wav = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/wav' })
    const driveApi = {
      getPublicDocumentBlob: jest.fn(async function() { return wav }),
      getDocumentBlob: jest.fn()
    }
    const events = []
    await importSharedAudioAnalysisGroup(driveApi, {
      manifestFileId: 'group-manifest-progress',
      groupLabel: 'Progress Group',
      sets: [{
        id: 'remote-p',
        label: 'Tap set',
        notes: [
          { id: 'n1', targetNote: 'Tap 1', driveFileId: 'd1', features: {} },
          { id: 'n2', targetNote: 'Tap 2', driveFileId: 'd2', features: {} }
        ]
      }],
      onProgress: function(info) { events.push(info) }
    })
    expect(events.length).toBeGreaterThan(2)
    expect(events.some(function(e) { return e.phase === 'import-start' })).toBe(true)
    expect(events.some(function(e) { return e.phase === 'import-note' })).toBe(true)
    expect(events.some(function(e) { return e.phase === 'import-done' })).toBe(true)
    const noteEvents = events.filter(function(e) { return e.phase === 'import-note' })
    expect(noteEvents[0].total).toBe(2)
  })
})
