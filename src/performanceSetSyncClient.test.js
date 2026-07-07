import {
  importSinglePerformanceSetFromAbc,
  mergePerformanceSetsFromTuneBookAbc,
} from './performanceSetSyncClient'
import { readPerformanceSetsMap } from './performanceSetStore'
import { renderPerformanceSetsToAbc } from './performanceSetSync'

describe('performanceSetSyncClient share import', function() {
  beforeEach(function() {
    localStorage.clear()
  })

  test('importSinglePerformanceSetFromAbc merges one set', function() {
    const abc = renderPerformanceSetsToAbc({
      s1: {
        id: 's1',
        name: 'Gig set',
        date: '2026-01-01',
        notes: '',
        items: [{ type: 'tune', tuneId: 't1' }],
        updatedAt: 1000,
      },
    })
    const result = importSinglePerformanceSetFromAbc(abc, 's1')
    expect(result.changed).toBe(true)
    const sets = readPerformanceSetsMap()
    expect(sets.s1.name).toBe('Gig set')
  })

  test('mergePerformanceSetsFromTuneBookAbc merges all sets', function() {
    const abc = renderPerformanceSetsToAbc({
      s1: {
        id: 's1',
        name: 'One',
        date: '',
        notes: '',
        items: [],
        updatedAt: 1000,
      },
      s2: {
        id: 's2',
        name: 'Two',
        date: '',
        notes: '',
        items: [],
        updatedAt: 2000,
      },
    })
    return mergePerformanceSetsFromTuneBookAbc(abc, { interactive: false, applySilently: true }).then(function(result) {
      expect(result.changed).toBe(true)
      const sets = readPerformanceSetsMap()
      expect(Object.keys(sets).sort()).toEqual(['s1', 's2'])
    })
  })
})
