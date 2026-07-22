import {
  migrateLegacyAudioItem,
  normalizeAudioProject,
  createDefaultAudioProject,
  addTakeToTrack,
  setActiveTakeOnTrack,
  assignCompRegion,
  getActiveTake,
  AUDIO_PROJECT_VERSION,
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
})
