/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import StructureChordBlock from './StructureChordBlock'
import useAbcjsParser from '../useAbcjsParser'
import useAbcTools from '../useAbcTools'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

beforeAll(function() {
  if (typeof global.ResizeObserver === 'undefined') {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

describe('StructureChordBlock height-fit sections', function() {
  let container
  let root

  beforeEach(function() {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(function() {
    act(function() { root.unmount() })
    container.remove()
  })

  test('marks heading-only repeated stanzas so they are excluded from the height fit', function() {
    const tune = {
      name: 'Test Song',
      words: [
        '[Verse 1]',
        'first verse line',
        '',
        '[Verse 2]',
        'second verse line',
        '',
        '[Verse 3]',
        'third verse line',
      ],
    }

    act(function() {
      root.render(React.createElement(StructureChordBlock, {
        chords: 'C G Am F',
        tune: tune,
        fitHeight: true,
      }))
    })

    const sections = container.querySelectorAll('.structure-section')
    expect(sections.length).toBe(4)

    // First row is the double-barline hint when one chart spans typed sections.
    expect(sections[0].textContent).toMatch(/double barlines/i)

    // First verse carries the chart and counts toward the fit.
    expect(sections[1].querySelector('.chord-block-line')).toBeTruthy()
    expect(sections[1].classList.contains('structure-section--no-chart')).toBe(false)

    // Repeated verses show only their heading and are excluded from the fit.
    for (let i = 2; i < sections.length; i++) {
      expect(sections[i].querySelector('.chord-block-line')).toBeFalsy()
      expect(sections[i].classList.contains('structure-section--no-chart')).toBe(true)
      expect(sections[i].textContent).toContain('Verse ' + i)
    }
  })

  test('splits structure chords across || melody strains for pop section headers', function() {
    const noteLines = [
      '"Am"zzzzzz|"E7"zzzzzz|"C"zzzzzz|"D"zzzzzz||',
      '"Fmaj7"zzzzzz|"C"zzzzzz|"E"zzzzzz|"Am"zzzzzz||',
      '"F"zzzzzz|"F"zzzzzz|"G"zzzzzz|"G"zzzzzz|',
    ]
    const tune = {
      name: 'Wine Song',
      key: 'Am',
      meter: '3/4',
      noteLength: '1/8',
      voices: {
        1: { notes: noteLines },
      },
      words: [
        'Opening verse line one',
        'Opening verse line two',
        '',
        '[Pre-Chorus]',
        'Pre chorus line',
        '',
        '[Chorus]',
        'Chorus line',
      ],
    }
    const abcjsParser = useAbcjsParser()
    const abcTools = useAbcTools()
    const melodyAbc = abcTools.emptyABC('Wine Song') + noteLines.join('\n')
    const chart = abcjsParser.renderChords(melodyAbc, false, 0, 'Am', '1/8', '3/4')

    act(function() {
      root.render(React.createElement(StructureChordBlock, {
        chords: chart,
        tune: tune,
        fitHeight: true,
      }))
    })

    const chartSections = container.querySelectorAll('.structure-section:not(.structure-section--no-chart)')
    expect(chartSections.length).toBeGreaterThanOrEqual(3)
    expect(container.textContent).toContain('Pre-Chorus')
    expect(container.textContent).toContain('Chorus')
  })

  test('hides chorus chart on empty #chorus revisit when chords come from notation', function() {
    const noteLines = [
      '"Em"zzzzzzzz|"Em"zzzzzzzz|"Em"zzzzzzzz|"G"zzzz"A"zzzz|',
      '"Em"zzzzzzzz|"Em"zzzzzzzz|"G"zzzz"Bm"zzzz|"G"zzzz"A"zzzz||',
      '"Em"zzzzzzzz|"Em"zzzzzzzz|"G"zzzz"Bm"zzzz|"D"zzzz"Em"zzzz|',
      '"Em"zzzzzzzz|"Em"zzzzzzzz|"G"zzzz"Bm"zzzz|"A"zzzz"Em"zzzz||',
      '"Bm"zzzzzzzz|"A"zzzzzzzz|"G"zzzzzzzz|"D"zzzzzzzz|"D"zzzzzzzz||',
    ]
    const tune = {
      name: 'AI Opium Pipe',
      composer: 'Steve Ryan',
      key: 'Bb',
      meter: '4/4',
      noteLength: '1/8',
      voices: { 1: { notes: noteLines } },
      words: [
        'Since the earliest of days, I have always loved to read.',
        'To learn about the big wide world, so many different creeds.',
        'With my AI friend that I can ask near anything it is really',
        'hard to let it up when I go on a bender',
        '',
        '# chorus',
        'Blood on my teeth. Fire in my gut. When I suck on the AI opium pipe.',
        'Spark in my eye. Butterflies in flight. When I suck on the AI opium pipe.',
        '',
        'We build a little app so I can search through the resources. And',
        'add a page of graphs to help me with the understanding. Then',
        'suddenly the sun is rising through the trees. Better',
        'turn the kettle on, make another cup of coffee.',
        '',
        '#chorus',
        '',
        '# bridge',
        'Compared to typing every word, I feel like I am on fire.',
        'Although the slop is getting messy, an incendiary pyre',
      ],
    }
    const abcjsParser = useAbcjsParser()
    const abcTools = useAbcTools()
    const melodyAbc = abcTools.emptyABC('AI Opium Pipe') + noteLines.join('\n')
    const chart = abcjsParser.renderChords(melodyAbc, false, 0, 'Bb', '1/8', '4/4')

    act(function() {
      root.render(React.createElement(StructureChordBlock, {
        chords: chart,
        tune: tune,
        title: tune.name,
        composer: tune.composer,
        fitHeight: true,
      }))
    })

    const chorusSections = Array.prototype.filter.call(
      container.querySelectorAll('.structure-section'),
      function(section) {
        const h = section.querySelector('.chord-section-header')
        return h && String(h.textContent || '').trim().toLowerCase().indexOf('chorus') >= 0
      }
    )
    expect(chorusSections.length).toBeGreaterThanOrEqual(2)
    // First chorus shows the chart; later #chorus revisits are heading-only.
    expect(chorusSections[0].classList.contains('structure-section--no-chart')).toBe(false)
    expect(chorusSections[0].querySelector('.chord-block-line')).toBeTruthy()
    for (let i = 1; i < chorusSections.length; i++) {
      expect(chorusSections[i].classList.contains('structure-section--no-chart')).toBe(true)
      expect(chorusSections[i].querySelector('.chord-block-line')).toBeFalsy()
    }
  })

  test('shows leading tune metre as a stacked fraction on the first chart', function() {
    const tune = {
      name: 'Flight',
      meter: '5/4',
      words: [
        '# v1',
        'first verse line',
        '',
        '# chorus',
        'chorus line',
      ],
    }

    act(function() {
      root.render(React.createElement(StructureChordBlock, {
        chords: 'Dm / / Cm / | A# / / Am / |\n\n[M:4/4] F | Dm |',
        tune: tune,
        fitHeight: false,
      }))
    })

    const meters = container.querySelectorAll('.chord-meter-mark')
    expect(meters.length).toBeGreaterThanOrEqual(2)
    expect(meters[0].getAttribute('aria-label')).toBe('5/4')
    expect(meters[0].querySelector('.chord-meter-num').textContent).toBe('5')
    expect(meters[0].querySelector('.chord-meter-den').textContent).toBe('4')
    expect(meters[1].getAttribute('aria-label')).toBe('4/4')
  })
})
