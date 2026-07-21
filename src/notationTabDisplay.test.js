import { applyTabOnlyNotationDisplay } from './notationTabDisplay'

describe('notationTabDisplay', () => {
  it('adds tab-only class and hides notation staff groups', () => {
    const root = document.createElement('div')
    root.innerHTML = [
      '<svg>',
      '  <g class="abcjs-staff abcjs-v0"></g>',
      '  <g class="abcjs-staff abcjs-v1"></g>',
      '  <g class="abcjs-note abcjs-v0"></g>',
      '  <g class="abcjs-tabNumber abcjs-note abcjs-v0"></g>',
      '</svg>',
    ].join('')
    applyTabOnlyNotationDisplay(root, 1)
    expect(root.classList.contains('notation-display-tab-only')).toBe(true)
    expect(root.querySelector('g.abcjs-staff.abcjs-v0').style.display).toBe('none')
    expect(root.querySelector('g.abcjs-staff.abcjs-v1').style.display).not.toBe('none')
    expect(root.querySelector('g.abcjs-note:not(.abcjs-tabNumber)').style.display).toBe('none')
    expect(root.querySelector('.abcjs-tabNumber').style.display).not.toBe('none')
  })
})
