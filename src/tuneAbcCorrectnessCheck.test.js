import abcjs from 'abcjs'
import useAbcTools from './useAbcTools'
import {
  applyNotationHeadersFromAbc,
  normalizeTuneAbc,
} from './tuneAbcCorrectnessCheck'

function tuneFromAbc(abcTools, abc, extras) {
  const json = abcTools.abc2json(abc)
  return Object.assign({
    id: 'test-tune',
    name: 'Test Tune',
    composer: 'Tester',
    meter: '4/4',
    key: 'C',
    noteLength: '1/4',
    tempo: 120,
    backgroundInfo: 'Tune background',
    words: ['Verse one'],
    links: [{ link: 'https://example.com/audio.mp3', title: 'Recording' }],
  }, json, extras || {})
}

function parseAndRender(abc) {
  const parsed = abcjs.parse(abc)
  if (!parsed || !parsed[0]) return abc
  return abcjs.stringify(parsed[0])
}

describe('normalizeTuneAbc', function() {
  const abcTools = useAbcTools()

  test('preserves bibliographic and app fields when notation changes', function() {
    const tune = {
      id: 'rich-tune',
      name: 'Rich Tune',
      composer: 'Original Artist',
      meter: '4/4',
      key: 'C',
      noteLength: '1/4',
      tempo: 120,
      backgroundInfo: 'Keep this background',
      words: ['Line one', 'Line two'],
      links: [{ link: 'https://example.com/a.mp3' }],
      suitableFor: ['violin'],
      voices: { '1': { meta: '', notes: ['C D E F | G A B c |'] } },
    }
    const rerender = function(abc) {
      return String(abc).replace('C D E F', 'C2 D2 E2 F2')
    }

    const normalized = normalizeTuneAbc(tune, abcTools, rerender)
    expect(normalized).not.toBeNull()
    expect(normalized.id).toBe('rich-tune')
    expect(normalized.name).toBe('Rich Tune')
    expect(normalized.composer).toBe('Original Artist')
    expect(normalized.backgroundInfo).toBe('Keep this background')
    expect(normalized.words).toEqual(['Line one', 'Line two'])
    expect(normalized.links).toEqual([{ link: 'https://example.com/a.mp3' }])
    expect(normalized.suitableFor).toEqual(['violin'])
    expect(abcTools.json2abc(normalized).indexOf('C2 D2 E2 F2')).toBeGreaterThan(-1)
  })

  test('updates notation headers from normalized ABC', function() {
    const tune = {
      id: 'headers',
      name: 'Headers',
      composer: 'Artist',
      meter: '',
      key: '',
      noteLength: '',
      tempo: '',
      voices: { '1': { meta: '', notes: ['C D E F | G A B c |'] } },
    }
    const abc = [
      'X:1',
      'T:Headers',
      'M:6/8',
      'L:1/8',
      'Q:1/4=90',
      'K:G',
      'C2 D2 E2 | F2 G2 A2 |',
    ].join('\n')

    const next = applyNotationHeadersFromAbc(tune, abc, abcTools)
    expect(next.meter).toBe('6/8')
    expect(next.key).toBe('G')
    expect(next.noteLength).toBe('1/8')
    expect(next.tempo).toBe(90)
  })

  test('returns null when notation and headers are unchanged', function() {
    const abc = [
      abcTools.emptyABC('Clean'),
      'C D E F | G A B c |',
    ].join('\n')
    const tune = tuneFromAbc(abcTools, abc)
    expect(normalizeTuneAbc(tune, abcTools, parseAndRender)).toBeNull()
  })
})
