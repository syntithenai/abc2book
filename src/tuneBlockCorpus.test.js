import fs from 'fs'
import path from 'path'
import useAbcTools from './useAbcTools'
import { auditCorpus, auditTuneBlockStructure, classifyLyricPattern, classifyStrainLyricMapping, critiqueBlocksAgainstLyrics } from './tuneBlockCorpusAudit'
import { blocksFromLyricLines } from './tuneBlockModel'
import { lyricLinesForChecks } from './tuneDisplayLayers'
import { SONGS_DOUBLE_SPACED_CHORUS_LABEL } from './importSampleFixtures'

const { abc2Tunebook } = useAbcTools()

const SONGS_ABC = path.join(__dirname, '..', 'scrape', 'songs.abc')
const TUNES_ABC = path.join(__dirname, '..', 'scrape', 'tunes.abc')
const MIN_SONGS_PASS_RATE = 0.95

function loadTunesFromAbc(abcPath) {
  const abc = fs.readFileSync(abcPath, 'utf8')
  return abc2Tunebook(abc)
}

function tunesWithLyrics(tunes) {
  return tunes.filter(function(tune) {
    return lyricLinesForChecks(tune).some(function(line) {
      return String(line || '').trim().length > 0
    })
  })
}

describe('tuneBlockCorpusAudit', function() {
  test('classifyLyricPattern tags double-spaced and section labels', function() {
    const patterns = classifyLyricPattern(SONGS_DOUBLE_SPACED_CHORUS_LABEL)
    expect(patterns).toContain('section_label')
    expect(patterns).toContain('double_spaced')
  })

  test('critiqueBlocksAgainstLyrics passes when lines are preserved', function() {
    const lines = ['verse one', '', 'verse two']
    const blocks = blocksFromLyricLines(lines)
    const critique = critiqueBlocksAgainstLyrics(lines, blocks)
    expect(critique.ok).toBe(true)
  })

  test('classifyStrainLyricMapping buckets typical shapes', function() {
    expect(classifyStrainLyricMapping(0, 2, []).bucket).toBe('instrumental')
    expect(classifyStrainLyricMapping(4, 0, []).bucket).toBe('lyrics_no_melody')
    expect(classifyStrainLyricMapping(3, 3, []).bucket).toBe('aligned')
    expect(classifyStrainLyricMapping(10, 1, []).bucket).toBe('one_progression')
    expect(classifyStrainLyricMapping(8, 3, []).bucket).toBe('pop_mismatch')
    expect(classifyStrainLyricMapping(2, 5, []).bucket).toBe('strain_heavy')
    expect(classifyStrainLyricMapping(10, 1, [
      { chartRevisit: false },
      { chartRevisit: true },
      { chartRevisit: true },
    ]).bucket).toBe('hymn_like')
  })
})

describe('scrape/songs.abc corpus', function() {
  let allTunes
  let lyricsTunes

  beforeAll(function() {
    allTunes = loadTunesFromAbc(SONGS_ABC)
    lyricsTunes = tunesWithLyrics(allTunes)
  })

  test('parses songs.abc with expected scale', function() {
    expect(allTunes.length).toBeGreaterThan(1000)
    expect(lyricsTunes.length).toBeGreaterThan(100)
  })

  test('Thula Mama keeps title lyric when it opens the first stanza', function() {
    const abc = fs.readFileSync(SONGS_ABC, 'utf8')
    const tune = abc2Tunebook(abc).find(function(item) {
      return item && item.name === 'Thula Mama'
    })
    expect(tune).toBeTruthy()
    const result = auditTuneBlockStructure(tune)
    expect(result.critique.issues.some(function(issue) {
      return issue.code === 'missing_line' && issue.message.indexOf('Thula Mama') >= 0
    })).toBe(false)
    expect(result.ok).toBe(true)
  })

  test('lyrics-bearing songs pass block structure critique at threshold', function() {
    const report = auditCorpus(lyricsTunes)
    expect(report.passRate).toBeGreaterThanOrEqual(MIN_SONGS_PASS_RATE)
  })
})

describe('scrape/tunes.abc corpus', function() {
  let allTunes
  let lyricsTunes

  beforeAll(function() {
    allTunes = loadTunesFromAbc(TUNES_ABC)
    lyricsTunes = tunesWithLyrics(allTunes)
  })

  test('parses tunes.abc', function() {
    expect(allTunes.length).toBeGreaterThan(500)
  })

  test('instrumental tunes do not fail critique', function() {
    const instrumental = allTunes.filter(function(tune) {
      return !lyricLinesForChecks(tune).some(function(line) {
        return String(line || '').trim().length > 0
      })
    })
    instrumental.slice(0, 50).forEach(function(tune) {
      const result = auditTuneBlockStructure(tune)
      expect(result.ok).toBe(true)
      expect(result.patterns).toContain('no_lyrics')
    })
  })

  test('lyrics-bearing tunes pass block structure critique', function() {
    if (!lyricsTunes.length) return
    const report = auditCorpus(lyricsTunes)
    expect(report.passRate).toBeGreaterThanOrEqual(MIN_SONGS_PASS_RATE)
  })
})
