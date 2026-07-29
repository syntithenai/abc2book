import {
  migrateLegacyAudioItem,
  normalizeAudioProject,
  createDefaultAudioProject,
  addTakeToTrack,
  setActiveTakeOnTrack,
  assignCompRegion,
  getActiveTake,
  AUDIO_PROJECT_VERSION,
  findOrphanedAudioDriveFileIds,
  resolveAudioProject,
  createTrackFolder,
  reorderTracks,
  moveTrackToFolder,
  toggleTrackFolderCollapsed,
  trackBlockHeight,
  DEFAULT_MAIN_LANE_HEIGHT,
  TAKE_LANE_HEIGHT,
  enumeratePlaylistLanes,
} from './scratchpadAudioProject'

describe('scratchpadAudioProject', function() {
  test('migrates legacy single blobKey to v2 project', function() {
    const item = {
      id: 'item-1',
      type: 'audio',
      audio: {
        blobKey: 'scratchpad:item-1:audio',
        markers: [{ time: 1, label: 'A' }],
      },
    }
    const migrated = migrateLegacyAudioItem(item)
    expect(migrated.audio.version).toBe(AUDIO_PROJECT_VERSION)
    expect(migrated.audio.tracks.length).toBe(1)
    expect(migrated.audio.tracks[0].takes[0].blobKey).toBe('scratchpad:item-1:audio')
    expect(migrated.audio.markers.length).toBe(1)
    expect(migrated.audio.blobKey).toBeUndefined()
  })

  test('createDefaultAudioProject has one audio track', function() {
    const project = createDefaultAudioProject('x')
    expect(project.tracks.length).toBe(1)
    expect(project.tracks[0].type).toBe('audio')
    expect(project.tracks[0].takes.length).toBe(1)
  })

  test('addTakeToTrack appends take and sets active', function() {
    const project = createDefaultAudioProject('x')
    const track = project.tracks[0]
    const next = addTakeToTrack(track, 'x', null)
    expect(next.takes.length).toBe(2)
    expect(next.activeTakeId).toBe(next.takes[1].id)
  })

  test('setActiveTakeOnTrack switches active take', function() {
    const project = createDefaultAudioProject('x')
    let track = addTakeToTrack(project.tracks[0], 'x', null)
    const firstId = track.takes[0].id
    track = setActiveTakeOnTrack(track, firstId)
    expect(getActiveTake(track).id).toBe(firstId)
  })

  test('assignCompRegion adds region', function() {
    const project = createDefaultAudioProject('x')
    const track = assignCompRegion(project.tracks[0], 1, 2, project.tracks[0].takes[0].id)
    expect(track.compRegions.length).toBe(1)
    expect(track.compEnabled).toBe(true)
  })

  test('normalizeAudioProject ensures tracks array', function() {
    const item = { id: 'a', type: 'audio', audio: { version: 2, tracks: [] } }
    const audio = normalizeAudioProject(item)
    expect(audio.tracks.length).toBeGreaterThan(0)
  })

  test('findOrphanedAudioDriveFileIds returns removed take and mixdown ids', function() {
    const prev = {
      tracks: [{
        id: 't1',
        type: 'audio',
        takes: [
          { id: 'take-1', driveFileId: 'drive-a' },
          { id: 'take-2', driveFileId: 'drive-b' },
        ],
      }],
      mixdownDriveFileId: 'drive-mix',
    }
    const next = {
      tracks: [{
        id: 't1',
        type: 'audio',
        takes: [{ id: 'take-1', driveFileId: 'drive-a' }],
      }],
      mixdownDriveFileId: null,
    }
    expect(findOrphanedAudioDriveFileIds(prev, next).sort()).toEqual(['drive-b', 'drive-mix'])
  })

  test('resolveAudioProject accepts bare audio override', function() {
    const project = createDefaultAudioProject('item-2')
    const resolved = resolveAudioProject({ id: 'item-2', type: 'audio' }, project)
    expect(resolved.tracks.length).toBe(1)
  })

  test('createTrackFolder and moveTrackToFolder', function() {
    const folder = createTrackFolder('Drums')
    expect(folder.name).toBe('Drums')
    const project = createDefaultAudioProject('x')
    const moved = moveTrackToFolder(project.tracks[0], folder.id)
    expect(moved.folderId).toBe(folder.id)
  })

  test('reorderTracks moves item', function() {
    const project = createDefaultAudioProject('x')
    const second = addTakeToTrack(project.tracks[0], 'x', null)
    const tracks = [project.tracks[0], Object.assign({}, second, { id: 'trk-2', name: 'B' })]
    const reordered = reorderTracks(tracks, 0, 1)
    expect(reordered[0].id).toBe('trk-2')
  })

  test('toggleTrackFolderCollapsed flips collapsed', function() {
    const folder = createTrackFolder('Vocals')
    const next = toggleTrackFolderCollapsed([folder], folder.id)
    expect(next[0].collapsed).toBe(true)
  })

  test('trackBlockHeight includes take lanes', function() {
    const project = createDefaultAudioProject('x')
    let track = addTakeToTrack(project.tracks[0], 'x', null)
    const height = trackBlockHeight(track)
    expect(height).toBe(DEFAULT_MAIN_LANE_HEIGHT + 2 * TAKE_LANE_HEIGHT)
  })

  test('enumeratePlaylistLanes matches main and take rows', function() {
    const project = createDefaultAudioProject('x')
    const track = project.tracks[0]
    track.takes[0].blobKey = 'blob-a'
    const lanes = enumeratePlaylistLanes(project, false)
    expect(lanes.some(function(l) { return l.kind === 'main' })).toBe(true)
    expect(lanes.filter(function(l) { return l.kind === 'take' }).length).toBe(1)
  })
})
