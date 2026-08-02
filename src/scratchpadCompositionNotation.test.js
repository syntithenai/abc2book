import {
  listNotationStrainsForTune,
  strainMarkerFromStrain,
  buildNotationChunkSourceTune,
  isNotationChunkSourceResolved,
  notationChunkVoiceKeys,
} from './scratchpadCompositionNotation'

function multiStrainTune() {
  return {
    id: 't1',
    name: 'Test',
    voices: {
      '1': {
        meta: 'V:1',
        notes: ['C D E F | G A B c || d e f g |'],
      },
      '2': {
        meta: 'V:2',
        notes: ['z z z z | z z z z || z z z z |'],
      },
    },
  }
}

describe('scratchpadCompositionNotation', function() {
  test('listNotationStrainsForTune lists strains split on ||', function() {
    const strains = listNotationStrainsForTune(multiStrainTune())
    expect(strains.length).toBe(2)
    expect(strains[0].label).toBe('Strain 1')
    expect(strains[0].marker).toBe('C D E F')
    expect(strains[1].marker).toBe('d e f g')
  })

  test('buildNotationChunkSourceTune slices strain by index', function() {
    const tune = multiStrainTune()
    const slice = buildNotationChunkSourceTune(tune, {
      wholeItem: false,
      strainIndex: 1,
      strainMarker: 'd e f g',
    })
    expect(slice).toBeTruthy()
    expect(slice.voices['1'].notes).toEqual(['d e f g |'])
    expect(slice.voices['2'].notes).toEqual(['z z z z |'])
  })

  test('buildNotationChunkSourceTune filters voices', function() {
    const tune = multiStrainTune()
    const slice = buildNotationChunkSourceTune(tune, {
      wholeItem: true,
      voiceKeys: ['1'],
    })
    expect(slice).toBeTruthy()
    expect(Object.keys(slice.voices)).toEqual(['1'])
  })

  test('notationChunkVoiceKeys prefers chunk voiceKeys', function() {
    const tune = multiStrainTune()
    expect(notationChunkVoiceKeys({ voiceKeys: ['2'] }, tune)).toEqual(['2'])
    expect(notationChunkVoiceKeys({}, tune)).toEqual(['1', '2'])
  })

  test('isNotationChunkSourceResolved is false when strain marker is lost', function() {
    const tune = multiStrainTune()
    const item = { type: 'notation', notation: { tuneSnapshot: tune } }
    const chunk = {
      sourceKind: 'notation-strain',
      wholeItem: false,
      strainIndex: 1,
      strainMarker: 'missing bar',
    }
    expect(isNotationChunkSourceResolved(item, chunk)).toBe(false)
  })

  test('strainMarkerFromStrain uses first bar fingerprint', function() {
    const marker = strainMarkerFromStrain({ text: 'C D E F | G A B c |' })
    expect(marker).toBe('C D E F')
  })
})
