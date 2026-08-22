import {
  alignedX,
  applyPlayalongStaffGaps,
  buildBeatAnchors,
  clearPlayalongStaffGaps,
  lineIndexFromClassList,
  maxAbcjsLineIndex,
  measureAbcjsLineLayout,
  mountSvgLineSlice,
  scrollPlayalongPlayingLineIntoCenter,
} from './playalongStaffLayout'

function svgEl(tag, className) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag)
  if (className) el.setAttribute('class', className)
  return el
}

describe('playalongStaffLayout', function() {
  test('reads abcjs line indexes', function() {
    expect(lineIndexFromClassList(['abcjs-staff', 'abcjs-l2', 'abcjs-v0'])).toBe(2)
    expect(lineIndexFromClassList(['abcjs-note'])).toBe(null)
  })

  test('shifts each staff system down to make room above it', function() {
    const svg = svgEl('svg')
    svg.setAttribute('height', '200')
    svg.setAttribute('viewBox', '0 0 400 200')
    const root = svgEl('g')
    const line0 = svgEl('g', 'abcjs-staff abcjs-l0')
    const line1 = svgEl('g', 'abcjs-staff abcjs-l1')
    line1.setAttribute('transform', 'translate(10,20)')
    root.appendChild(line0)
    root.appendChild(line1)
    svg.appendChild(root)
    document.body.appendChild(svg)

    expect(maxAbcjsLineIndex(svg)).toBe(1)
    applyPlayalongStaffGaps(svg, 50)
    expect(line0.getAttribute('transform')).toBe('translate(0,50)')
    expect(line1.getAttribute('transform')).toBe('translate(0,100) translate(10,20)')
    expect(svg.getAttribute('height')).toBe('300')
    expect(svg.getAttribute('viewBox')).toBe('0 0 400 300')

    clearPlayalongStaffGaps(svg)
    expect(line0.getAttribute('transform')).toBe(null)
    expect(line1.getAttribute('transform')).toBe('translate(10,20)')
    expect(svg.getAttribute('height')).toBe('200')
    expect(svg.getAttribute('viewBox')).toBe('0 0 400 200')
    svg.remove()
  })

  test('accepts a per-line gap list', function() {
    const svg = svgEl('svg')
    svg.setAttribute('height', '200')
    svg.setAttribute('viewBox', '0 0 400 200')
    const root = svgEl('g')
    const line0 = svgEl('g', 'abcjs-staff abcjs-l0')
    const line1 = svgEl('g', 'abcjs-staff abcjs-l1')
    root.appendChild(line0)
    root.appendChild(line1)
    svg.appendChild(root)
    document.body.appendChild(svg)
    applyPlayalongStaffGaps(svg, [20, 40])
    expect(line0.getAttribute('transform')).toBe('translate(0,20)')
    expect(line1.getAttribute('transform')).toBe('translate(0,60)')
    expect(svg.getAttribute('height')).toBe('260')
    svg.remove()
  })

  test('maps bar beats onto measured bar x positions', function() {
    const anchors = buildBeatAnchors({
      barBeats: [4, 8],
      barXs: [120, 240],
      patternDurationBeats: 8,
      startX: 40,
      endX: 240,
    })
    expect(alignedX(0, anchors, 0)).toBeCloseTo(40, 5)
    expect(alignedX(4, anchors, 0)).toBeCloseTo(120, 5)
    expect(alignedX(6, anchors, 0)).toBeCloseTo(180, 5)
    expect(alignedX(8, anchors, 0)).toBeCloseTo(240, 5)
  })

  test('includes per-note beat anchors for non-linear spacing', function() {
    const anchors = buildBeatAnchors({
      barBeats: [4],
      barXs: [200],
      noteBeats: [0, 1, 2],
      noteXs: [40, 70, 130],
      patternDurationBeats: 4,
      startX: 40,
      endX: 200,
    })
    expect(alignedX(0, anchors, 0)).toBeCloseTo(40, 5)
    expect(alignedX(1, anchors, 0)).toBeCloseTo(70, 5)
    expect(alignedX(2, anchors, 0)).toBeCloseTo(130, 5)
    expect(alignedX(3, anchors, 0)).toBeCloseTo(165, 5)
  })

  test('measureAbcjsLineLayout collects bar x from each staff line', function() {
    const overlay = document.createElement('div')
    const svg = svgEl('svg')
    const bar = svgEl('g', 'abcjs-bar abcjs-l0')
    const line = svgEl('line')
    bar.appendChild(line)
    svg.appendChild(bar)
    overlay.appendChild(svg)
    document.body.appendChild(overlay)
    overlay.getBoundingClientRect = function() {
      return { top: 0, left: 0, right: 400, bottom: 200, width: 400, height: 200 }
    }
    bar.getBoundingClientRect = function() {
      return { top: 20, left: 80, right: 84, bottom: 60, width: 4, height: 40 }
    }
    line.getBoundingClientRect = function() {
      return { top: 20, left: 80, right: 84, bottom: 60, width: 4, height: 40 }
    }
    const slots = measureAbcjsLineLayout(svg, overlay)
    expect(slots.length).toBe(1)
    expect(slots[0].lineIndex).toBe(0)
    expect(slots[0].barXs[0]).toBeCloseTo(82, 5)
    expect(slots[0].sliceHeight).toBeGreaterThan(0)
    overlay.remove()
  })

  test('mountSvgLineSlice clones the source svg into a clipped host', function() {
    const host = document.createElement('div')
    const svg = svgEl('svg')
    svg.setAttribute('id', 'source')
    const staff = svgEl('g', 'abcjs-staff abcjs-l0')
    svg.appendChild(staff)
    document.body.appendChild(host)
    document.body.appendChild(svg)
    mountSvgLineSlice(host, svg, { sliceTop: 10, sliceHeight: 40 })
    expect(host.querySelector('svg')).toBeTruthy()
    expect(host.querySelector('svg').getAttribute('id')).toBe(null)
    expect(host.querySelector('svg').style.top).toBe('-10px')
    host.remove()
    svg.remove()
  })

  test('scrollPlayalongPlayingLineIntoCenter centers the matching interleave row', function() {
    const stack = document.createElement('div')
    stack.className = 'playalong-notation-stack playalong-notation-stack--sliced'
    const line0 = document.createElement('div')
    line0.className = 'playalong-interleave-line'
    line0.setAttribute('data-line-index', '0')
    line0.setAttribute('data-slice-top', '0')
    line0.setAttribute('data-slice-height', '40')
    const line1 = document.createElement('div')
    line1.className = 'playalong-interleave-line'
    line1.setAttribute('data-line-index', '1')
    line1.setAttribute('data-slice-top', '50')
    line1.setAttribute('data-slice-height', '40')
    line1.scrollIntoView = jest.fn()
    line0.scrollIntoView = jest.fn()
    stack.appendChild(line0)
    stack.appendChild(line1)
    document.body.appendChild(stack)

    const note = document.createElement('div')
    note.className = 'abcjs-note abcjs-l1'
    const ok = scrollPlayalongPlayingLineIntoCenter({
      top: 60,
      elements: [[note]],
    })
    expect(ok).toBe(true)
    expect(line1.scrollIntoView).toHaveBeenCalled()
    expect(line1.scrollIntoView.mock.calls[0][0]).toEqual({ block: 'center', inline: 'nearest' })
    stack.remove()
  })
})
