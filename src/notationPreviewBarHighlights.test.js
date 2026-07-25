import abcjs from 'abcjs'
import { applyBarSlotHighlights, barNumberToAbcjsLayout } from './notationPreviewBarHighlights'

describe('notationPreviewBarHighlights', function() {
  test('barNumberToAbcjsLayout maps global bars to wrapped line and measure', function() {
    expect(barNumberToAbcjsLayout(1, 4)).toEqual({ lineIndex: 0, measureIndex: 0 })
    expect(barNumberToAbcjsLayout(4, 4)).toEqual({ lineIndex: 0, measureIndex: 3 })
    expect(barNumberToAbcjsLayout(5, 4)).toEqual({ lineIndex: 1, measureIndex: 0 })
  })

  test('applyBarSlotHighlights paints only source pitches in a chord', function() {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const abc = [
      'X:1',
      'M:4/4',
      'L:1/8',
      'K:C',
      '[ea] |',
    ].join('\n')
    abcjs.renderAbc(host, abc, {
      add_classes: true,
      wrap: { preferredMeasuresPerLine: 4 },
    })
    const tune = { voices: { '1': { notes: ['[ea] |'] } } }
    applyBarSlotHighlights(host, {
      source: [{
        voiceKey: '1',
        barNumber: 1,
        slotIndex: 0,
        targetPitchCount: 1,
        sourcePitchCount: 1,
      }],
      unpairedSource: [],
    }, tune, {
      measuresPerLine: 4,
    })
    const green = host.querySelectorAll('[style*="rgb(25, 135, 84)"], [style*="#198754"]')
    expect(green.length).toBe(1)
    document.body.removeChild(host)
  })

  test('applyBarSlotHighlights paints unpaired source notes red', function() {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const abc = [
      'X:1',
      'M:4/4',
      'L:1/8',
      'K:C',
      'g |',
    ].join('\n')
    abcjs.renderAbc(host, abc, {
      add_classes: true,
      wrap: { preferredMeasuresPerLine: 4 },
    })
    const tune = { voices: { '1': { notes: ['g |'] } } }
    applyBarSlotHighlights(host, {
      source: [],
      unpairedSource: [{
        voiceKey: '1',
        barNumber: 1,
        slotIndex: 0,
        targetPitchCount: 0,
        sourcePitchCount: 1,
      }],
    }, tune, {
      measuresPerLine: 4,
    })
    const red = host.querySelector('[style*="rgb(220, 53, 69)"], [style*="#dc3545"]')
    expect(red).toBeTruthy()
    document.body.removeChild(host)
  })
})
