import {
  filterArtistCandidates,
  splitComposerSearchCandidates,
} from './ComposerSearchButton'
import { shouldOfferTitleSuggestion } from '../composerDiscoveryUtils'

describe('ComposerSearchButton candidate helpers', function() {
  test('splitComposerSearchCandidates separates writers and performers', function() {
    const split = splitComposerSearchCandidates([
      { artist: 'Claude Debussy', role: 'writer' },
      { artist: 'Lang Lang', role: 'performer' },
      { artist: 'Joseph Kosma', role: 'writer' },
    ])
    expect(split.composerCandidates.map(function(c) { return c.artist })).toEqual([
      'Claude Debussy',
      'Joseph Kosma',
    ])
    expect(split.artistCandidates.map(function(c) { return c.artist })).toEqual([
      'Lang Lang',
    ])
  })

  test('splitComposerSearchCandidates falls back to all for composer when no writers', function() {
    const performers = [
      { artist: 'Lang Lang', role: 'performer' },
      { artist: 'Yuja Wang', role: 'performer' },
    ]
    const split = splitComposerSearchCandidates(performers)
    expect(split.composerCandidates).toEqual(performers)
    expect(split.artistCandidates).toEqual(performers)
  })

  test('filterArtistCandidates excludes existing and chosen composer', function() {
    const filtered = filterArtistCandidates(
      [
        { artist: 'Lang Lang', role: 'performer' },
        { artist: 'Claude Debussy', role: 'performer' },
        { artist: 'Yuja Wang', role: 'performer' },
      ],
      {
        existingArtists: ['Lang Lang'],
        chosenComposer: 'Claude Debussy',
      }
    )
    expect(filtered.map(function(c) { return c.artist })).toEqual(['Yuja Wang'])
  })

  test('shouldOfferTitleSuggestion detects spelling variants', function() {
    expect(shouldOfferTitleSuggestion('Claire de Lune', 'Clair de lune')).toBe(true)
    expect(shouldOfferTitleSuggestion('Clair de Lune', 'Clair de Lune')).toBe(false)
    expect(shouldOfferTitleSuggestion('Song A', 'Completely Different')).toBe(false)
  })
})
