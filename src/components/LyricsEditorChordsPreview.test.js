/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import LyricsEditorChordsPreview from './LyricsEditorChordsPreview'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mockPreviewState = { chordChart: 'C | G |', lastTranspose: null }

jest.mock('../useAbcjsParser', function() {
  return function useAbcjsParser() {
    return {
      renderChords: function(abc, showDots, transpose) {
        mockPreviewState.lastTranspose = transpose
        return mockPreviewState.chordChart
      },
    }
  }
})

jest.mock('./TimedLyricsChordsView', function() {
  return function TimedLyricsChordsView(props) {
    return (
      <div
        data-testid="timed-lyrics-chords-view"
        data-keep-beat-markers={props.keepBeatMarkers ? 'true' : 'false'}
        data-compact={props.compact ? 'true' : 'false'}
        data-chord-transpose={String(props.chordTranspose)}
        data-allow-notation-merge={props.allowNotationMerge ? 'true' : 'false'}
      >
        {(props.tune && Array.isArray(props.tune.words) ? props.tune.words : []).join('\n')}
      </div>
    )
  }
})

jest.mock('./StructureChordBlock', function() {
  return function StructureChordBlock(props) {
    return (
      <div data-testid="structure-chord-block" data-chord-transpose={String(props.chordTranspose)}>
        {props.chords}
      </div>
    )
  }
})

describe('LyricsEditorChordsPreview', function() {
  beforeEach(function() {
    mockPreviewState.chordChart = 'C | G |'
    mockPreviewState.lastTranspose = null
  })

  test('renders live lyric preview and structured chord blocks', function() {
    const container = document.createElement('div')
    const root = createRoot(container)
    act(function() {
      root.render(
        <LyricsEditorChordsPreview
          tune={{
            id: 't1',
            name: 'Amazing Grace',
            words: ['old'],
            voices: { '1': { notes: ['C2 D2'] } },
          }}
          tunebook={{
            abcTools: { emptyABC: function(name) { return 'X:1\nT:' + name + '\nK:C\n' } },
          }}
          lyricsText={'[G]a/mazing /grace how /sweet'}
        />
      )
    })
    const preview = container.querySelector('[data-testid="lyrics-chords-preview"]')
    expect(preview).toBeTruthy()
    const view = container.querySelector('[data-testid="timed-lyrics-chords-view"]')
    expect(view.getAttribute('data-keep-beat-markers')).toBe('true')
    expect(view.getAttribute('data-allow-notation-merge')).toBe('true')
    expect(view.textContent).toBe('[G]a/mazing /grace how /sweet')
    const structure = container.querySelector('[data-testid="lyrics-structure-chords"]')
    expect(structure).toBeTruthy()
    expect(container.querySelector('[data-testid="structure-chord-block"]').textContent).toBe('C | G |')
    expect(view.getAttribute('data-chord-transpose')).toBe('0')
    expect(container.querySelector('[data-testid="structure-chord-block"]').getAttribute('data-chord-transpose')).toBe('0')
    expect(mockPreviewState.lastTranspose).toBe(0)
    act(function() { root.unmount() })
  })

  test('applies song transpose and capo when transpose preview is on', function() {
    const container = document.createElement('div')
    const root = createRoot(container)
    act(function() {
      root.render(
        <LyricsEditorChordsPreview
          tune={{
            id: 't1',
            name: 'Amazing Grace',
            transpose: 2,
            capo: 0,
            words: ['old'],
            voices: { '1': { notes: ['C2 D2'] } },
          }}
          tunebook={{
            abcTools: { emptyABC: function(name) { return 'X:1\nT:' + name + '\nK:C\n' } },
          }}
          lyricsText={'[G]amazing'}
          transposePreview={true}
        />
      )
    })
    expect(mockPreviewState.lastTranspose).toBe(2)
    expect(container.querySelector('[data-testid="timed-lyrics-chords-view"]').getAttribute('data-chord-transpose')).toBe('2')
    expect(container.querySelector('[data-testid="structure-chord-block"]').getAttribute('data-chord-transpose')).toBe('2')
    act(function() { root.unmount() })
  })

  test('shows lyric preview without structure when ABC has no chords', function() {
    mockPreviewState.chordChart = ''
    const container = document.createElement('div')
    const root = createRoot(container)
    act(function() {
      root.render(
        <LyricsEditorChordsPreview
          tune={{
            id: 't1',
            name: 'Amazing Grace',
            words: ['hello'],
            voices: { '1': { notes: ['C2 D2'] } },
          }}
          tunebook={{
            abcTools: { emptyABC: function(name) { return 'X:1\nT:' + name + '\nK:C\n' } },
          }}
          lyricsText={'hello'}
        />
      )
    })
    expect(container.querySelector('[data-testid="lyrics-chords-preview"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="timed-lyrics-chords-view"]').textContent).toBe('hello')
    expect(container.querySelector('[data-testid="lyrics-structure-chords"]')).toBeNull()
    act(function() { root.unmount() })
  })

  test('returns null when there are no lyrics and no notation chords', function() {
    mockPreviewState.chordChart = ''
    const container = document.createElement('div')
    const root = createRoot(container)
    act(function() {
      root.render(
        <LyricsEditorChordsPreview
          tune={{
            id: 't1',
            name: 'Amazing Grace',
            words: [],
            voices: { '1': { notes: ['C2 D2'] } },
          }}
          tunebook={{
            abcTools: { emptyABC: function(name) { return 'X:1\nT:' + name + '\nK:C\n' } },
          }}
          lyricsText={''}
        />
      )
    })
    expect(container.querySelector('[data-testid="lyrics-chords-preview"]')).toBeNull()
    expect(container.querySelector('[data-testid="lyrics-structure-chords"]')).toBeNull()
    act(function() { root.unmount() })
  })

  test('returns null when there is no tune', function() {
    const container = document.createElement('div')
    const root = createRoot(container)
    act(function() {
      root.render(<LyricsEditorChordsPreview lyricsText="hello" />)
    })
    expect(container.querySelector('[data-testid="lyrics-chords-preview"]')).toBeNull()
    expect(container.querySelector('[data-testid="lyrics-structure-chords"]')).toBeNull()
    act(function() { root.unmount() })
  })
})
