/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import PlayalongStaffPitchStrips from './PlayalongStaffPitchStrips'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('PlayalongStaffPitchStrips', function() {
  let container
  let root

  beforeEach(function() {
    global.ResizeObserver = class {
      observe() {}
      disconnect() {}
    }
    HTMLCanvasElement.prototype.getContext = function() {
      return {
        clearRect() {},
        fillRect() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        fill() {},
        arc() {},
        setTransform() {},
        fillText() {},
        strokeRect() {},
        setLineDash() {},
      }
    }
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(function() {
    act(function() { root.unmount() })
    container.remove()
  })

  test('renders pitch compare graphs interleaved with notation lines', async function() {
    await act(async function() {
      root.render(React.createElement('div', { className: 'playalong-notation-stack' },
        React.createElement('div', { id: 'abc_music_viewer' }),
        React.createElement(PlayalongStaffPitchStrips, {
          tune: {
            meter: '4/4',
            noteLength: '1/8',
            key: 'C',
            voices: { '1': { meta: '', notes: ['CDEF |', 'GABc |'] } },
          },
          takes: [{
            recordingId: 'r1',
            duration: 4,
            musicStartOffsetSeconds: 1,
            tempoBpm: 120,
          }],
          pitchPointsById: {
            r1: [
              { timeMs: 1000, rawMidi: 60 },
              { timeMs: 1500, rawMidi: 61 },
              { timeMs: 2500, rawMidi: 64 },
            ],
          },
          playbackSpeed: 1,
        })
      ))
      await Promise.resolve()
    })
    const compare = container.querySelector('[data-testid="playalong-pitch-compare"]')
    expect(compare).toBeTruthy()
    expect(compare.className).toMatch(/playalong-staff-pitch-panel/)
    expect(compare.querySelectorAll('.playalong-interleave-line').length).toBeGreaterThan(0)
    expect(compare.querySelectorAll('canvas').length).toBeGreaterThan(0)
    const canvases = compare.querySelectorAll('canvas')
    canvases.forEach(function(canvas) {
      const height = parseFloat(canvas.style.height)
      expect(height).toBeGreaterThan(0)
      expect(height).toBeLessThan(90)
    })
  })

  test('renders a live pitch graph while recording even when there are no saved takes', async function() {
    await act(async function() {
      root.render(React.createElement('div', { className: 'playalong-notation-stack' },
        React.createElement('div', { id: 'abc_music_viewer' }),
        React.createElement(PlayalongStaffPitchStrips, {
          tune: {
            meter: '4/4',
            noteLength: '1/8',
            key: 'C',
            voices: { '1': { meta: '', notes: ['CDEF |'] } },
          },
          takes: [],
          pitchPointsById: {},
          blobById: {},
          isRecording: true,
          getLivePitchSnapshot: function() {
            return {
              points: [
                { timeMs: 1000, rawMidi: 60, held: true },
                { timeMs: 1100, rawMidi: 60, held: true },
                { timeMs: 1200, rawMidi: 60, held: true },
              ],
              musicStartOffsetSeconds: 1,
              tempoBpm: 120,
              version: 3,
            }
          },
          liveTempoBpm: 120,
          liveMusicStartOffsetSeconds: 1,
          playbackSpeed: 1,
        })
      ))
      await Promise.resolve()
    })
    const compare = container.querySelector('[data-testid="playalong-pitch-compare"]')
    expect(compare).toBeTruthy()
    expect(compare.querySelectorAll('canvas').length).toBeGreaterThan(0)
  })

  test('hides a take from the piano roll when its score chip is outlined', async function() {
    await act(async function() {
      root.render(React.createElement('div', { className: 'playalong-notation-stack' },
        React.createElement('div', { id: 'abc_music_viewer' }),
        React.createElement(PlayalongStaffPitchStrips, {
          tune: {
            meter: '4/4',
            noteLength: '1/8',
            key: 'C',
            voices: { '1': { meta: '', notes: ['CDEF |'] } },
          },
          takes: [
            { recordingId: 'r1', duration: 4, musicStartOffsetSeconds: 1, tempoBpm: 120 },
            { recordingId: 'r2', duration: 4, musicStartOffsetSeconds: 1, tempoBpm: 120 },
          ],
          hiddenTakeIds: { r1: true },
          pitchPointsById: {
            r1: [
              { timeMs: 1000, rawMidi: 60 },
              { timeMs: 1500, rawMidi: 61 },
              { timeMs: 2500, rawMidi: 64 },
            ],
            r2: [
              { timeMs: 1000, rawMidi: 64 },
              { timeMs: 1500, rawMidi: 65 },
              { timeMs: 2500, rawMidi: 67 },
            ],
          },
          playbackSpeed: 1,
        })
      ))
      await Promise.resolve()
    })
    const compare = container.querySelector('[data-testid="playalong-pitch-compare"]')
    expect(compare).toBeTruthy()
    expect(compare.querySelectorAll('canvas').length).toBeGreaterThan(0)
  })
})
