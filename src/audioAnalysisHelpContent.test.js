/**
 * @jest-environment jsdom
 */
import { printAudioAnalysisHelp } from './audioAnalysisHelpContent'

describe('printAudioAnalysisHelp', function() {
  afterEach(function() {
    document.body.innerHTML = ''
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  test('writes help HTML into a print iframe and calls print', function() {
    jest.useFakeTimers()
    var root = document.createElement('div')
    root.className = 'audio-analysis-help-body'
    root.innerHTML =
      '<h5>Tap mode</h5><p>Damp strings.</p>' +
      '<img src="helpimages/audio-analysis-curtin-rig.jpg" loading="lazy" alt="rig" />'
    document.body.appendChild(root)

    var printCalls = 0
    var created = null

    // jsdom iframes do not provide a real contentDocument; stub append + contentWindow.
    jest.spyOn(document.body, 'appendChild').mockImplementation(function(node) {
      if (node && node.tagName === 'IFRAME') {
        created = node
        var doc = document.implementation.createHTMLDocument('print')
        var win = {
          document: doc,
          focus: function() {},
          print: function() { printCalls += 1 }
        }
        Object.defineProperty(node, 'contentWindow', { value: win, configurable: true })
        return HTMLElement.prototype.appendChild.call(document.body, node)
      }
      return HTMLElement.prototype.appendChild.call(document.body, node)
    })

    printAudioAnalysisHelp(root)

    expect(created).toBeTruthy()
    var written = created.contentWindow.document.documentElement.innerHTML
    expect(written).toContain('ABC Tune Book — Audio Analysis help')
    expect(written).toContain('Tap mode')
    expect(written).toContain('Damp strings.')
    expect(written).toMatch(/src="[^"]*helpimages\/audio-analysis-curtin-rig\.jpg"/)
    expect(written).not.toContain('loading="lazy"')

    // Image load wait (4s) then print delay (100ms).
    jest.runAllTimers()
    expect(printCalls).toBe(1)
  })

  test('no-ops when root is missing', function() {
    expect(function() { printAudioAnalysisHelp(null) }).not.toThrow()
  })
})
