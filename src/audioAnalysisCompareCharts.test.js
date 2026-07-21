import { buildStereoSpectrumSeries } from './audioAnalysisCompareCharts'

describe('buildStereoSpectrumSeries', function() {
  function noteWithSpec(db, freqs, featuresKey) {
    const note = { features: {} }
    const feat = {
      spectrumDb: db,
      spectrumFreqs: freqs
    }
    if (featuresKey === 'featuresR') note.featuresR = feat
    else note.features = feat
    return note
  }

  test('includes L series always and R when featuresR present', function() {
    const freqs = [100, 200, 300]
    const baseline = {
      notes: [
        noteWithSpec([-20, -25, -30], freqs),
        Object.assign(noteWithSpec([-22, -24, -28], freqs), {
          featuresR: { spectrumDb: [-10, -12, -14], spectrumFreqs: freqs }
        })
      ]
    }
    const candidate = {
      notes: [
        noteWithSpec([-18, -20, -22], freqs)
      ]
    }
    const series = buildStereoSpectrumSeries(baseline, candidate)
    expect(series.length).toBe(3)
    expect(series[0].label).toBe('A L')
    expect(series[1].label).toBe('B L')
    expect(series[2].label).toBe('A R')
    expect(series[2].dashed).toBe(true)
    expect(series[0].spec.spectrumDb[0]).toBeCloseTo(-21, 0)
  })

  test('omits R when no featuresR', function() {
    const freqs = [100, 200]
    const baseline = { notes: [noteWithSpec([-20, -25], freqs)] }
    const candidate = { notes: [noteWithSpec([-18, -22], freqs)] }
    const series = buildStereoSpectrumSeries(baseline, candidate)
    expect(series.length).toBe(2)
    expect(series.every(function(s) { return !s.dashed })).toBe(true)
  })
})
