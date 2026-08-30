import { stripNotationDisplayMetadata } from './notation/notationDisplayAbc'
import { buildTuneFooterMetaRows, hasTuneFooterMeta } from './tuneAbcMetaDisplay'

describe('notation display strip for ABC info headers', function() {
  test('strips O A S Z D N and source-book comments from staff ABC', function() {
    const abc = [
      'X:1',
      'T:Tune',
      'C:Trad',
      'C:Extra Artist',
      'O:Ireland',
      'A:Munster',
      'S:Book',
      'Z:Pat',
      'D:Album',
      'N:A note',
      'B: songs',
      'H:history',
      '% abcbook-source-book O Neills',
      'M:4/4',
      'K:G',
      'G |',
    ].join('\n')

    const stripped = stripNotationDisplayMetadata(abc)
    expect(stripped).toContain('T:Tune')
    expect(stripped).toContain('C:Trad')
    expect(stripped).not.toContain('C:Extra Artist')
    expect(stripped).not.toMatch(/^O:/m)
    expect(stripped).not.toMatch(/^A:/m)
    expect(stripped).not.toMatch(/^S:/m)
    expect(stripped).not.toMatch(/^Z:/m)
    expect(stripped).not.toMatch(/^D:/m)
    expect(stripped).not.toMatch(/^N:/m)
    expect(stripped).not.toMatch(/^B:/m)
    expect(stripped).not.toMatch(/^H:/m)
    expect(stripped).not.toContain('abcbook-source-book')
  })
})

describe('tuneAbcMetaDisplay', function() {
  test('builds footer rows including origin (not staff duplicates)', function() {
    const tune = {
      composer: 'Trad',
      artists: ['Band'],
      aliases: ['Other Name'],
      genres: ['Irish'],
      origin: ['Ireland'],
      rhythm: 'reel',
      source: ["O'Neill's"],
      sourceBooks: ['1001'],
      infoNotes: ['Session favorite'],
      srcUrl: 'https://example.com/tune',
      backgroundInfo: '',
    }
    const rows = buildTuneFooterMetaRows(tune)
    const byKey = {}
    rows.forEach(function(row) { byKey[row.key] = row.value })
    expect(byKey.aliases).toBe('Other Name')
    expect(byKey.artists).toBe('Band')
    expect(byKey.genres).toBe('Irish')
    expect(byKey.origin).toBe('Ireland')
    expect(byKey.source).toBe("O'Neill's")
    expect(byKey.sourceBooks).toBe('1001')
    expect(byKey.infoNotes).toBe('Session favorite')
    expect(byKey.srcUrl).toBe('https://example.com/tune')
    expect(byKey.composer).toBeUndefined()
    expect(byKey.rhythm).toBeUndefined()
    expect(hasTuneFooterMeta(tune)).toBe(true)
  })
})
