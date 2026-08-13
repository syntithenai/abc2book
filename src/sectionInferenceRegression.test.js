import fs from 'fs'
import path from 'path'
import useAbcTools from './useAbcTools'
import { blocksFromTune } from './tuneBlockModel'

const { abc2Tunebook } = useAbcTools()

function loadTune(name) {
  const abc = fs.readFileSync(path.join(__dirname, '..', 'scrape', 'songs.abc'), 'utf8')
  let tune = abc2Tunebook(abc).find(function(t) { return t && t.name === name })
  if (!tune) {
    const abc2 = fs.readFileSync(path.join(__dirname, '..', 'scrape', 'traditional songs.abc'), 'utf8')
    tune = abc2Tunebook(abc2).find(function(t) { return t && t.name === name })
  }
  return tune
}

function blockHeaders(tune) {
  return blocksFromTune(tune).map(function(b) { return b.header || ''; })
}

describe('section inference regressions', function() {
  test('Bog Down cumulative verses are not labeled bridge', function() {
    const tune = loadTune('The Bog Down in the Valley-oh')
    const headers = blockHeaders(tune)
    const bridgeCount = headers.filter(function(h) { return /^\[Bridge/.test(h); }).length
    expect(bridgeCount).toBeLessThanOrEqual(1)
    expect(headers[3]).toBe('[Verse 2]')
    expect(headers.filter(function(h) { return /^\[Verse/.test(h); }).length).toBeGreaterThan(10)
  })

  test('Wine Song first unlabeled block is Verse 1 not Verse 3', function() {
    const tune = loadTune('Wine Song')
    const headers = blockHeaders(tune)
    expect(headers[0]).toBe('[Verse]')
    expect(headers[3]).toBe('[Verse 2]')
    expect(headers[7]).toBe('[Verse 3]')
  })

  test('Hundred Pipers chorus-first with parenthetical repeat markers', function() {
    const tune = loadTune('Hundred Pipers')
    const blocks = blocksFromTune(tune)
    expect(blocks[0].type).toBe('chorus')
    expect(blocks[0].header).toBe('[Chorus]')
    expect(blocks[1].type).toBe('verse')
    expect(blocks.filter(function(b) { return b.type === 'bridge'; }).length).toBe(0)
    expect(blocks[2].header).toMatch(/chorus/i)
    expect(blocks[blocks.length - 1].lyricLines.join(' ')).not.toMatch(/lyricstranslate/)
  })
})
