import {
  computeTallies,
  filterOldtimeTunes,
  normalizeEnrichPackage,
} from './oldtimeEnrichReviewStore'

describe('oldtimeEnrichReviewStore', function() {
  const samplePkg = {
    kind: 'oldtimefiddletunes-enrich',
    book: 'old time',
    siteTag: 'oldtimefiddletunes.net',
    tunes: [
      {
        id: 'a',
        slug: 'a',
        title: 'Alpha',
        midiUrl: 'https://www.oldtimefiddletunes.net/tunes/a.MID',
        pdfUrl: 'https://www.oldtimefiddletunes.net/tunes/a.pdf',
        candidates: [
          { source: 'local', abc: 'X:1\nT:Alpha\nK:C\nC', score: 0.9, title: 'Alpha' },
        ],
      },
      {
        id: 'b',
        slug: 'b',
        title: 'Beta',
        midiUrl: 'https://www.oldtimefiddletunes.net/tunes/b.MID',
        candidates: [],
      },
    ],
  }

  it('normalizes package and auto-selects best candidate', function() {
    const set = normalizeEnrichPackage(samplePkg)
    expect(set.kind).toBe('oldtimefiddletunes-enrich')
    expect(set.tunes).toHaveLength(2)
    expect(set.tunes[0].selectedCandidateId).toBeTruthy()
    expect(set.tunes[0].abc).toContain('T:Alpha')
    expect(set.tunes[0].convertPrefer).toBe('midi')
    expect(set.tunes[1].status).toBe('needs_notation')
    expect(set.tallies.needs_notation).toBe(1)
    expect(set.tallies.midi_available).toBe(2)
    expect(set.policy.no_search).toBe(true)
  })

  it('keeps proof package source-only with convertPrefer', function() {
    const proof = normalizeEnrichPackage({
      kind: 'oldtimefiddletunes-enrich',
      proof: true,
      policy: { source_only: true, no_search: true, allow_duplicate_titles: true },
      tunes: [
        { slug: 'a', title: 'A', midiUrl: 'm.mid', pdfUrl: 'a.pdf', convertPrefer: 'midi', candidates: [] },
        { slug: 'b', title: 'B', pdfUrl: 'b.pdf', convertPrefer: 'omr', candidates: [] },
      ],
    })
    expect(proof.proof).toBe(true)
    expect(proof.tunes[0].convertPrefer).toBe('midi')
    expect(proof.tunes[1].convertPrefer).toBe('omr')
    expect(proof.tallies.needs_notation).toBe(2)
  })

  it('filters needs_notation and midi_available', function() {
    const set = normalizeEnrichPackage(samplePkg)
    expect(filterOldtimeTunes(set.tunes, { statusFilter: 'needs_notation' })).toHaveLength(1)
    expect(filterOldtimeTunes(set.tunes, { statusFilter: 'midi_available' })).toHaveLength(1)
    expect(filterOldtimeTunes(set.tunes, { nameQuery: 'alp' })).toHaveLength(1)
  })

  it('computeTallies counts selections', function() {
    const tallies = computeTallies([
      { selectedCandidateId: 'x', abc: 'X:1', midiUrl: 'm', pdfUrl: 'p', reviewed: true, candidates: [{}] },
      { candidates: [], reviewed: false },
    ])
    expect(tallies.has_selection).toBe(1)
    expect(tallies.needs_notation).toBe(1)
    expect(tallies.reviewed).toBe(1)
  })
})
