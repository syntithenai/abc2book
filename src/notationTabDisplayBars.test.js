import abcjs from 'abcjs'
import { buildTablatureRenderOptions } from './tablatureConfig'
import { applyTabOnlyNotationDisplay } from './notationTabDisplay'

function barGroups(svg) {
  return Array.from(svg.querySelectorAll('g.abcjs-bar')).map(function(g) {
    return {
      className: g.getAttribute('class'),
      display: g.style.display,
      pathVisible: g.querySelector('path') && g.querySelector('path').style.display !== 'none',
    }
  })
}

describe('tab barlines', () => {
  it('keeps barlines visible on the tab staff in tab-only mode', () => {
    const tune = {
      tablature: 'guitar',
      tabDisplay: 'tab',
      voices: { '1': { notes: ['CDEF GABc | cBAG FEDC |'] } },
    }
    const abc = 'X:1\nT:t\nM:4/4\nL:1/8\nK:C\nCDEF GABc | cBAG FEDC |\n'
    const opts = buildTablatureRenderOptions(tune)
    const root = document.createElement('div')
    abcjs.renderAbc(root, abc, { tablature: opts, add_classes: true })
    const svg = root.querySelector('svg')
    expect(barGroups(svg).length).toBeGreaterThan(0)
    applyTabOnlyNotationDisplay(root, 1)
    const after = barGroups(svg)
    const visibleBars = after.filter(function(bar) {
      return bar.display !== 'none' && bar.pathVisible
    })
    expect(visibleBars.length).toBeGreaterThan(0)
  })
})
