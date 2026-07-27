import {
  allPracticeListTuneIds,
  appendTunesToPracticeList,
  deletePracticeList,
  getPracticeList,
  listPracticeLists,
  normalizePracticeListTuneIds,
  savePracticeList,
} from './practiceListStore'

describe('practiceListStore', function() {
  beforeEach(function() {
    localStorage.clear()
  })

  it('normalizes tune ids and removes duplicates', function() {
    expect(normalizePracticeListTuneIds(['a', 'b', 'a', '', 'b'])).toEqual(['a', 'b'])
  })

  it('saves and lists practice lists', function() {
    const saved = savePracticeList({ name: 'Morning tunes', tuneIds: ['t1', 't2'] })
    expect(saved.id).toBeTruthy()
    expect(saved.name).toBe('Morning tunes')
    expect(saved.tuneIds).toEqual(['t1', 't2'])
    const lists = listPracticeLists()
    expect(lists.length).toBe(1)
    expect(getPracticeList(saved.id).name).toBe('Morning tunes')
  })

  it('appends tunes without duplicates', function() {
    const saved = savePracticeList({ name: 'List', tuneIds: ['a'] })
    const updated = appendTunesToPracticeList(saved.id, ['b', 'a'])
    expect(updated.tuneIds).toEqual(['a', 'b'])
  })

  it('deletes practice lists', function() {
    const saved = savePracticeList({ name: 'Temp', tuneIds: [] })
    deletePracticeList(saved.id)
    expect(listPracticeLists().length).toBe(0)
  })

  it('returns deduplicated tune ids across all practice lists', function() {
    savePracticeList({ id: 'list-a', name: 'A', tuneIds: ['t1', 't2'] })
    savePracticeList({ id: 'list-b', name: 'B', tuneIds: ['t2', 't3'] })
    expect(allPracticeListTuneIds()).toEqual(['t1', 't2', 't3'])
  })
})
