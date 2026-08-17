/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import TimedLyricsChordsView from './TimedLyricsChordsView'

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

describe('TimedLyricsChordsView transpose', function() {
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

  test('applies chordTranspose to passthrough chord-over-words charts', function() {
    const tune = {
      name: 'Test',
      key: 'C',
      words: ['C    G', 'hello there', '', 'Am   F', 'second line'],
      voices: {},
    }

    act(function() {
      root.render(React.createElement(TimedLyricsChordsView, {
        tune: tune,
        chordTranspose: 2,
        chordsOnly: true,
        forceBlockLayout: true,
        suppressLeadingTitle: true,
      }))
    })

    const text = container.textContent
    expect(text).toMatch(/\bD\b/)
    expect(text).toMatch(/\bA\b/)
    expect(text).not.toMatch(/\bC\b/)
  })

  test('spells Bb not A# when transposing A in Dm', function() {
    const tune = {
      name: 'Howdy Howdy',
      key: 'Dm',
      words: ['A    E', 'You and me are always gonna be howdy howdy'],
      voices: {},
    }

    act(function() {
      root.render(React.createElement(TimedLyricsChordsView, {
        tune: tune,
        chordTranspose: 1,
        chordsOnly: true,
        forceBlockLayout: true,
        suppressLeadingTitle: true,
      }))
    })

    const text = container.textContent
    expect(text).toMatch(/Bb/)
    expect(text).not.toMatch(/A#/)
  })

  test('renders a spacer for a blank line inside a joined verse', function() {
    const tune = {
      name: 'Howdy Howdy',
      key: 'Dm',
      words: [
        '# verse',
        'Tell me what did the riddle say to the song?',
        'The Devil he is blowing reveille and we aint got long',
        'Lets play the Spider Bit The Baby-O',
        'Last time, last rhyme, one more for the road',
        '',
        'One more for the road',
        '# chorus',
        'You and me are always gonna be howdy howdy',
      ],
      voices: {},
    }

    act(function() {
      root.render(React.createElement(TimedLyricsChordsView, {
        tune: tune,
        forceBlockLayout: true,
        suppressLeadingTitle: true,
      }))
    })

    expect(container.querySelector('.lyrics-line-spacer')).not.toBeNull()
    expect(container.textContent).toContain('One more for the road')
    expect(container.textContent).toContain('Last time, last rhyme')
  })

  test('widens only short lyric fragments that sit under closely adjacent chords', function() {
    const tune = {
      name: 'Test',
      key: 'C',
      words: ['[Cmaj7]I [G]am Amazing', '[G]Amazing grace how [C]sweet'],
      voices: {},
    }

    act(function() {
      root.render(React.createElement(TimedLyricsChordsView, {
        tune: tune,
        suppressLeadingTitle: true,
      }))
    })

    const tokens = Array.from(container.querySelectorAll('.chordpro-token'))
    const labeled = tokens.map(function(token) {
      const chord = token.querySelector('.chordpro-chord--symbol')
      return {
        chord: chord ? chord.textContent : '',
        needsGap: token.classList.contains('chordpro-token--needs-gap'),
        overflow: !!token.querySelector('.chordpro-chord--overflow'),
      }
    }).filter(function(item) { return !!item.chord })

    expect(labeled).toEqual([
      { chord: 'Cmaj7', needsGap: true, overflow: false },
      { chord: 'G', needsGap: false, overflow: true },
      { chord: 'G', needsGap: true, overflow: false },
      { chord: 'C', needsGap: false, overflow: true },
    ])
  })

  test('keeps pickup chords in their own column before the first word', function() {
    const tune = {
      name: 'Test',
      words: ['[G]  Amazing grace'],
      voices: {},
    }

    act(function() {
      root.render(React.createElement(TimedLyricsChordsView, {
        tune: tune,
        suppressLeadingTitle: true,
      }))
    })

    const tokens = Array.from(container.querySelectorAll('.chordpro-token'))
    expect(tokens.length).toBeGreaterThanOrEqual(2)
    expect(tokens[0].classList.contains('chordpro-token--pad')).toBe(true)
    expect(tokens[0].querySelector('.chordpro-chord--symbol').textContent).toBe('G')
    expect(tokens[0].querySelector('.chordpro-chord--overflow')).toBeNull()
    expect(tokens[0].querySelector('.chordpro-lyric').textContent).toBe('  ')
    expect(tokens[1].querySelector('.chordpro-lyric').textContent).toMatch(/^Amazing/)
  })

  test('applies first-verse ChordPro onto later verses that lack chords', function() {
    const tune = {
      name: 'Worthwhile',
      words: [
        '# Chorus',
        '[C]Health and time and love',
        '',
        '# Verse I',
        '[C]In our younger days, we are taught to save',
        '[C]Putting it away to compound for a rainy [D]day',
        '',
        '# Chorus',
        '',
        '# Verse II',
        'Tendons, broken teeth, the aches and pains',
        'Feeling so much less like energetic play',
        '',
        '# Verse III',
        'smoothing of consumption, from age to youth',
        'compounding of our memory dividend, the only truth',
      ],
      voices: {},
    }

    act(function() {
      root.render(React.createElement(TimedLyricsChordsView, {
        tune: tune,
        suppressLeadingTitle: true,
      }))
    })

    const text = container.textContent
    expect(text).toMatch(/Tendons/)
    expect(text).toMatch(/smoothing/)
    const chords = Array.from(container.querySelectorAll('.chordpro-chord--symbol')).map(function(el) {
      return el.textContent
    })
    expect(chords.filter(function(c) { return c === 'C'; }).length).toBeGreaterThanOrEqual(4)
    expect(chords).toContain('D')
    const tendonsToken = Array.from(container.querySelectorAll('.chordpro-token')).find(function(token) {
      const lyric = token.querySelector('.chordpro-lyric')
      return lyric && /Tendons/.test(lyric.textContent)
    })
    expect(tendonsToken).toBeTruthy()
    expect(tendonsToken.querySelector('.chordpro-chord--symbol').textContent).toBe('C')
  })
})
