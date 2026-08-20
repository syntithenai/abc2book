/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import PlayalongInlineRecordBar from './PlayalongInlineRecordBar'
import { REP_COLORS } from './PracticeWarmupPitchRoll'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('PlayalongInlineRecordBar', function() {
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

  test('renders a solid green record button and a score chip per take', async function() {
    const onRecordClick = jest.fn()
    await act(async function() {
      root.render(React.createElement(PlayalongInlineRecordBar, {
        tunebook: { icons: { recordcircle: 'mic' } },
        isRecording: false,
        onRecordClick: onRecordClick,
        compareTune: {
          meter: '4/4',
          noteLength: '1/8',
          key: 'C',
          voices: { '1': { meta: '', notes: ['CDEF |'] } },
        },
        takes: [
          { recordingId: 'r1', duration: 4, musicStartOffsetSeconds: 0, tempoBpm: 120 },
          { recordingId: 'r2', duration: 4, musicStartOffsetSeconds: 0, tempoBpm: 120 },
        ],
        pitchPointsById: {
          r1: [
            { timeMs: 100, rawMidi: 60 },
            { timeMs: 200, rawMidi: 60 },
            { timeMs: 300, rawMidi: 60 },
          ],
          r2: [
            { timeMs: 100, rawMidi: 72 },
            { timeMs: 200, rawMidi: 72 },
            { timeMs: 300, rawMidi: 72 },
          ],
        },
        playbackSpeed: 1,
      }))
      await Promise.resolve()
      await Promise.resolve()
    })
    const record = container.querySelector('[data-testid="playalong-inline-record-button"]')
    expect(record).toBeTruthy()
    expect(record.className).toMatch(/btn-success/)
    expect(record.className).not.toMatch(/btn-outline/)
    const chips = container.querySelectorAll('[data-testid="playalong-take-score-button"]')
    expect(chips.length).toBe(2)
    expect(chips[0].style.backgroundColor).toBeTruthy()
    expect(chips[1].style.backgroundColor).toBeTruthy()
    expect(chips[0].style.backgroundColor).not.toBe(chips[1].style.backgroundColor)
    expect(chips[0].getAttribute('aria-pressed')).toBe('false')

    await act(async function() {
      record.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onRecordClick).toHaveBeenCalled()
  })

  test('score chip toggles outline and reports hidden take', async function() {
    const onToggleTakeHidden = jest.fn()
    await act(async function() {
      root.render(React.createElement(PlayalongInlineRecordBar, {
        tunebook: { icons: { recordcircle: 'mic' } },
        hiddenTakeIds: { r1: true },
        onToggleTakeHidden: onToggleTakeHidden,
        takes: [
          { recordingId: 'r1', duration: 4, musicStartOffsetSeconds: 0, tempoBpm: 120 },
          { recordingId: 'r2', duration: 4, musicStartOffsetSeconds: 0, tempoBpm: 120 },
        ],
        pitchPointsById: {
          r1: [
            { timeMs: 100, rawMidi: 60 },
            { timeMs: 200, rawMidi: 60 },
            { timeMs: 300, rawMidi: 60 },
          ],
          r2: [
            { timeMs: 100, rawMidi: 72 },
            { timeMs: 200, rawMidi: 72 },
            { timeMs: 300, rawMidi: 72 },
          ],
        },
        playbackSpeed: 1,
      }))
      await Promise.resolve()
      await Promise.resolve()
    })
    const chips = container.querySelectorAll('[data-testid="playalong-take-score-button"]')
    expect(chips[0].className).toMatch(/is-outlined/)
    expect(chips[0].getAttribute('aria-pressed')).toBe('true')
    expect(chips[1].className).not.toMatch(/is-outlined/)
    expect(chips[1].getAttribute('aria-pressed')).toBe('false')

    await act(async function() {
      chips[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onToggleTakeHidden).toHaveBeenCalledWith('r2')
  })

  test('record button is solid red while recording', function() {
    act(function() {
      root.render(React.createElement(PlayalongInlineRecordBar, {
        tunebook: { icons: { recordcircle: 'mic' } },
        isRecording: true,
        takes: [],
      }))
    })
    const record = container.querySelector('[data-testid="playalong-inline-record-button"]')
    expect(record.className).toMatch(/btn-danger/)
    expect(record.className).not.toMatch(/btn-outline/)
  })

  test('record button shows waiting while the last take is processing', async function() {
    await act(async function() {
      root.render(React.createElement(PlayalongInlineRecordBar, {
        tunebook: { icons: { recordcircle: 'mic', waiting: 'wait' } },
        isRecording: false,
        isWaiting: true,
        takes: [
          { recordingId: 'r1', duration: 4, musicStartOffsetSeconds: 0, tempoBpm: 120 },
        ],
        pitchPointsById: {
          r1: [
            { timeMs: 100, rawMidi: 60 },
            { timeMs: 200, rawMidi: 60 },
            { timeMs: 300, rawMidi: 60 },
          ],
        },
        playbackSpeed: 1,
      }))
      await Promise.resolve()
      await Promise.resolve()
    })
    const record = container.querySelector('[data-testid="playalong-inline-record-button"]')
    expect(record.getAttribute('aria-busy')).toBe('true')
    expect(record.querySelector('.playalong-record-btn-icon.is-waiting')).toBeTruthy()
    expect(record.textContent).toMatch(/wait/)
  })
})
