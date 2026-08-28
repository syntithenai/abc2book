/**
 * @jest-environment node
 */
import {
  findTunebookTuneByImportHash,
  mergeSimilarMelodyRows,
  resolveSimilarMelodySelection,
  searchSimilarMelodies,
  searchTunebookByContour,
  searchTunebookExactDuplicates,
} from './searchSimilarMelodies'
import { abcToContour, contourSimilarity } from './abcContour'
import * as notationImportUtils from './notationImportUtils'

const SAMPLE_A = `X:1
T:Test A
M:4/4
L:1/8
K:G
|:G2A2 B2c2|d2c2 B2A2:|
`

const SAMPLE_B = `X:1
T:Test B close
M:4/4
L:1/8
K:G
|:G2A2 B2c2|d2c2 B2G2:|
`

describe('searchSimilarMelodies helpers', () => {
  test('searchTunebookByContour returns close local tunes', () => {
    const abcTools = {
      json2abc: function(tune) { return tune.abc || '' },
    }
    const tunes = {
      current: { id: 'current', name: 'Current', abc: SAMPLE_A },
      other: { id: 'other', name: 'Close', abc: SAMPLE_B },
    }
    const hits = searchTunebookByContour({
      queryAbc: SAMPLE_A,
      tunes: tunes,
      abcTools: abcTools,
      excludeTuneId: 'current',
      minScore: 70,
    })
    expect(hits.length).toBeGreaterThanOrEqual(1)
    expect(hits[0].tuneId).toBe('other')
    expect(hits[0].kind).toBe('tunebook')
    expect(hits[0].contourScore).toBeGreaterThanOrEqual(70)
  })

  test('searchTunebookExactDuplicates finds same import hash', () => {
    const abcTools = {
      json2abc: function(tune) { return tune.abc || '' },
      getTuneImportHash: function(tune) { return tune.hash },
    }
    const queryTune = { id: 'a', name: 'A', hash: 'same', abc: SAMPLE_A }
    const hits = searchTunebookExactDuplicates({
      queryTune: queryTune,
      tunes: {
        a: queryTune,
        b: { id: 'b', name: 'B', hash: 'same', abc: SAMPLE_A },
        c: { id: 'c', name: 'C', hash: 'other', abc: SAMPLE_B },
      },
      abcTools: abcTools,
    })
    expect(hits.map(function(row) { return row.tuneId })).toEqual(['b'])
    expect(hits[0].contourScore).toBe(100)
  })

  test('mergeSimilarMelodyRows keeps all tunebook duplicate ids', () => {
    const rows = mergeSimilarMelodyRows([
      { kind: 'tunebook', tuneId: 'b', title: 'Copy', abc: SAMPLE_A, contourScore: 100 },
    ], [], 'a', 12)
    expect(rows.length).toBe(1)
    expect(rows[0].tuneId).toBe('b')
  })

  test('searchSimilarMelodies keeps exact local duplicates matching query ABC', async () => {
    const abcTools = {
      json2abc: function(tune) { return tune.abc || '' },
      getTuneImportHash: function(tune) { return tune.hash || tune.id },
    }
    const queryTune = { id: 'a', name: 'A', hash: 'dup', abc: SAMPLE_A }
    const payload = await searchSimilarMelodies({
      queryAbc: SAMPLE_A,
      queryTune: queryTune,
      tunes: {
        a: queryTune,
        b: { id: 'b', name: 'A copy', hash: 'dup', abc: SAMPLE_A },
      },
      abcTools: abcTools,
      excludeTuneId: 'a',
      resolverAvailable: false,
    })
    expect(payload.results.length).toBe(1)
    expect(payload.results[0].tuneId).toBe('b')
  })

  test('resolveSimilarMelodySelection reuses matching import hash', () => {
    const existing = { id: 'local-1', name: 'Existing', notes: 'GABC' }
    const tunebook = {
      abcTools: {
        getTuneImportHash: function(tune) {
          return String(tune.name || '') + '|' + String(tune.notes || '')
        },
      },
      createTune: function() { throw new Error('should reuse') },
      saveTune: function() { throw new Error('should reuse') },
    }
    const spy = jest.spyOn(notationImportUtils, 'importedTuneFromNotationCandidate')
      .mockReturnValue({ name: 'Existing', notes: 'GABC' })
    try {
      const result = resolveSimilarMelodySelection({
        kind: 'resource',
        title: 'Existing',
        abc: SAMPLE_A,
      }, {
        tunebook: tunebook,
        tunes: { 'local-1': existing },
      })
      expect(result).toEqual({ tuneId: 'local-1', created: false })
    } finally {
      spy.mockRestore()
    }
  })

  test('resolveSimilarMelodySelection opens tunebook hits directly', () => {
    const result = resolveSimilarMelodySelection({
      kind: 'tunebook',
      tuneId: 'abc123',
      title: 'Local',
      abc: SAMPLE_A,
    }, { tunebook: {}, tunes: {} })
    expect(result).toEqual({ tuneId: 'abc123', created: false })
  })

  test('resolveSimilarMelodySelection imports when no local match', () => {
    const created = { id: 'new-1', name: 'Fresh' }
    const tunebook = {
      abcTools: {
        getTuneImportHash: function() { return 'unique-hash' },
      },
      createTune: function(tune) {
        return Object.assign({}, tune, created)
      },
      saveTune: jest.fn(),
    }
    const spy = jest.spyOn(notationImportUtils, 'importedTuneFromNotationCandidate')
      .mockReturnValue({ name: 'Fresh', notes: 'CDEF' })
    try {
      const result = resolveSimilarMelodySelection({
        kind: 'resource',
        title: 'Fresh',
        abc: SAMPLE_A,
      }, {
        tunebook: tunebook,
        tunes: {},
      })
      expect(result).toEqual({ tuneId: 'new-1', created: true })
      expect(tunebook.saveTune).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  test('findTunebookTuneByImportHash skips excluded id', () => {
    const getHash = function(tune) { return tune.hash }
    const found = findTunebookTuneByImportHash(
      {
        a: { id: 'a', hash: 'same' },
        b: { id: 'b', hash: 'same' },
      },
      { hash: 'same' },
      getHash,
      'a'
    )
    expect(found.id).toBe('b')
  })

  test('contour similarity aligns with close samples', () => {
    const score = contourSimilarity(abcToContour(SAMPLE_A), abcToContour(SAMPLE_B))
    expect(score).toBeGreaterThanOrEqual(70)
  })
})
