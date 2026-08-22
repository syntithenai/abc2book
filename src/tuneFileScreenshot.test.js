/**
 * @jest-environment jsdom
 */

jest.mock('html2canvas', function() {
  return jest.fn(function() {
    return Promise.resolve({ width: 40, height: 20 })
  })
})

import html2canvas from 'html2canvas'
import { captureTuneChartPanels } from './tuneFileScreenshot'

describe('captureTuneChartPanels', function() {
  let toBlobOriginal

  beforeEach(function() {
    document.body.innerHTML = ''
    html2canvas.mockReset()
    html2canvas.mockImplementation(function() {
      const canvas = document.createElement('canvas')
      canvas.width = 40
      canvas.height = 20
      return Promise.resolve(canvas)
    })
    toBlobOriginal = HTMLCanvasElement.prototype.toBlob
    HTMLCanvasElement.prototype.toBlob = function(cb) {
      cb(new Blob(['png'], { type: 'image/png' }))
    }
  })

  afterEach(function() {
    HTMLCanvasElement.prototype.toBlob = toBlobOriginal
  })

  test('hides the red playback cursor while capturing', async function() {
    const panel = document.createElement('div')
    panel.className = 'tune-panel-notation'
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    cursor.setAttribute('class', 'abcjs-cursor')
    cursor.style.visibility = 'visible'
    cursor.style.opacity = '1'
    svg.appendChild(cursor)
    panel.appendChild(svg)
    document.body.appendChild(panel)

    html2canvas.mockImplementation(function(el) {
      const found = el.querySelector('line.abcjs-cursor')
      expect(found.style.visibility).toBe('hidden')
      expect(found.style.opacity).toBe('0')
      const canvas = document.createElement('canvas')
      canvas.width = 40
      canvas.height = 20
      return Promise.resolve(canvas)
    })

    const blob = await captureTuneChartPanels()
    expect(blob).toBeTruthy()
    expect(html2canvas).toHaveBeenCalled()
    expect(cursor.style.visibility).toBe('visible')
    expect(cursor.style.opacity).toBe('1')
  })
})
