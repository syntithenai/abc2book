import {
  applyTabOnlyNotationDisplay,
  clearTabOnlyNotationDisplay,
  getTabStaffVoiceIndices,
  measureTabOnlyLineShifts,
} from './notationTabDisplay'

describe('notationTabDisplay', () => {
  it('detects tab staff by line count not tab number voice class', () => {
    const root = document.createElement('div')
    root.innerHTML = [
      '<svg>',
      '  <g class="abcjs-staff abcjs-l0 abcjs-v0"><path/><path/><path/><path/><path/></g>',
      '  <g class="abcjs-staff abcjs-l0 abcjs-v1"><path/><path/><path/><path/></g>',
      '  <text class="tab-number abcjs-l0 abcjs-v0">3</text>',
      '</svg>',
    ].join('')
    const indices = getTabStaffVoiceIndices(root.querySelector('svg'))
    expect(indices.has(1)).toBe(true)
    expect(indices.has(0)).toBe(false)
  })

  it('keeps every tab staff on a line when multiple voices have tab', () => {
    const root = document.createElement('div')
    root.innerHTML = [
      '<svg>',
      '  <g class="abcjs-staff abcjs-l0 abcjs-v0"><path/><path/><path/><path/><path/></g>',
      '  <g class="abcjs-staff abcjs-l0 abcjs-v1"><path/><path/><path/><path/><path/></g>',
      '  <g class="abcjs-staff abcjs-l0 abcjs-v2"><path/><path/><path/><path/><path/><path/></g>',
      '  <g class="abcjs-staff abcjs-l0 abcjs-v3"><path/><path/><path/><path/><path/><path/></g>',
      '  <g class="abcjs-tabNumber abcjs-l0 abcjs-v0"><text class="tab-number">3</text></g>',
      '  <g class="abcjs-tabNumber abcjs-l0 abcjs-v1"><text class="tab-number">5</text></g>',
      '</svg>',
    ].join('')
    const indices = getTabStaffVoiceIndices(root.querySelector('svg'))
    expect([...indices].sort()).toEqual([2, 3])
  })

  it('keeps tab staff lines and hides notation staff lines', () => {
    const root = document.createElement('div')
    root.innerHTML = [
      '<svg>',
      '  <g class="abcjs-staff abcjs-l0 abcjs-v0"><path/><path/><path/><path/><path/></g>',
      '  <g class="abcjs-staff abcjs-l0 abcjs-v1"><path/><path/><path/><path/><path/><path/></g>',
      '  <g class="abcjs-note abcjs-l0 abcjs-v0"></g>',
      '  <g class="abcjs-tabNumber abcjs-l0 abcjs-v0"><text class="tab-number">3</text></g>',
      '</svg>',
    ].join('')
    applyTabOnlyNotationDisplay(root, 1)
    expect(root.classList.contains('notation-display-tab-only')).toBe(true)
    expect(root.querySelector('g.abcjs-staff.abcjs-v0').style.display).toBe('none')
    expect(root.querySelector('g.abcjs-staff.abcjs-v1').style.display).not.toBe('none')
    expect(root.querySelector('g.abcjs-note').style.display).toBe('none')
    expect(root.querySelector('.tab-number').style.display).not.toBe('none')
  })

  it('does not process the same svg twice', () => {
    const root = document.createElement('div')
    root.innerHTML = [
      '<svg>',
      '  <g class="abcjs-staff abcjs-l0 abcjs-v1"><path/><path/><path/><path/><path/><path/></g>',
      '  <text class="tab-number abcjs-l0 abcjs-v0">3</text>',
      '</svg>',
    ].join('')
    applyTabOnlyNotationDisplay(root, 1)
    const svg = root.querySelector('svg')
    svg.setAttribute('data-test', 'once')
    applyTabOnlyNotationDisplay(root, 1)
    expect(svg.getAttribute('data-test')).toBe('once')
  })

  it('measures vertical gap between notation and tab staves', () => {
    const root = document.createElement('div')
    root.innerHTML = [
      '<svg>',
      '  <g class="abcjs-staff abcjs-l0 abcjs-v0"><path d="M0 0 L100 0"/><path d="M0 40 L100 40"/></g>',
      '  <g class="abcjs-staff abcjs-l0 abcjs-v1"><path d="M0 100 L100 100"/><path d="M0 150 L100 150"/></g>',
      '  <g class="abcjs-tabNumber abcjs-l0 abcjs-v0"><text class="tab-number">3</text></g>',
      '</svg>',
    ].join('')
    const svg = root.querySelector('svg')
    const shifts = measureTabOnlyLineShifts(svg, new Set([1]))
    expect(shifts['0']).toBe(100)
  })

  it('clears tab-only class', () => {
    const root = document.createElement('div')
    root.classList.add('notation-display-tab-only')
    root.dataset.tabOnlyApplied = '1'
    clearTabOnlyNotationDisplay(root)
    expect(root.classList.contains('notation-display-tab-only')).toBe(false)
    expect(root.dataset.tabOnlyApplied).toBeUndefined()
  })
})
