import {
  listGroups,
  saveGroup,
  deleteGroup,
  listSets,
  saveSet,
  moveSetToGroup,
  deleteSet,
  listDeletedSets,
  listUnsyncedSets,
  markSetsSynced,
  saveNoteAudioBlob,
  getNoteAudioBlob,
  __clearAudioAnalysisStoreForTests
} from './soundpostSetStore'

describe('soundpostSetStore', function() {
  beforeEach(async function() {
    await __clearAudioAnalysisStoreForTests()
  })

  test('create and list groups', async function() {
    const g = await saveGroup({ label: 'My violin' })
    expect(g.id).toBeTruthy()
    const list = await listGroups()
    expect(list.length).toBe(1)
    expect(list[0].label).toBe('My violin')
  })

  test('rename group', async function() {
    const g = await saveGroup({ label: 'A' })
    await saveGroup({ id: g.id, label: 'B' })
    const list = await listGroups()
    expect(list[0].label).toBe('B')
  })

  test('delete group reassigns sets to ungrouped and tombstones group', async function() {
    const g = await saveGroup({ label: 'G' })
    await saveSet({ label: 'S1', groupId: g.id, instrument: 'violin', notes: [] })
    await deleteGroup(g.id)
    expect((await listGroups()).length).toBe(0)
    const sets = await listSets()
    expect(sets[0].groupId).toBeNull()
  })

  test('delete set creates tombstone and removes from list', async function() {
    const s = await saveSet({ label: 'gone', notes: [] })
    await deleteSet(s.id)
    expect((await listSets()).length).toBe(0)
    const tombs = await listDeletedSets()
    expect(tombs.some(function(t) { return t.id === s.id })).toBe(true)
  })

  test('unsynced tracking', async function() {
    const s = await saveSet({ label: 'S', notes: [] })
    expect((await listUnsyncedSets()).some(function(x) { return x.id === s.id })).toBe(true)
    await markSetsSynced([s.id])
    expect((await listUnsyncedSets()).some(function(x) { return x.id === s.id })).toBe(false)
  })

  test('move set between groups', async function() {
    const g1 = await saveGroup({ label: 'G1' })
    const g2 = await saveGroup({ label: 'G2' })
    const s = await saveSet({ label: 'S', groupId: g1.id, notes: [] })
    await moveSetToGroup(s.id, g2.id)
    expect((await listSets())[0].groupId).toBe(g2.id)
  })

  test('blob round-trip and set delete removes blobs', async function() {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' })
    const key = await saveNoteAudioBlob(blob)
    const got = await getNoteAudioBlob(key)
    expect(got).toBeTruthy()
    const s = await saveSet({
      label: 'with audio',
      notes: [{ id: 'n1', targetNote: 'A4', audioBlobKey: key, features: {} }]
    })
    await deleteSet(s.id)
    expect(await getNoteAudioBlob(key)).toBeNull()
  })
})
