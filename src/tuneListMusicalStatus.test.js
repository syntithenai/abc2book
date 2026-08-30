import abcjs from 'abcjs'
import { scanTuneMusicalIssueStatus } from './tuneListMusicalStatus'

function makeTune(notes, extras) {
  return Object.assign({
    id: 'tune-a',
    name: 'Tune A',
    meter: '4/4',
    key: 'C',
    voices: { V: { notes: notes } },
  }, extras || {})
}

describe('scanTuneMusicalIssueStatus', function() {
  test('returns no flags without abcTools', function() {
    expect(scanTuneMusicalIssueStatus(makeTune(['CDEF|']))).toEqual({
      hasMusicalErrors: false,
      hasMusicalWarnings: false,
    })
  })

  test('empty voice is a musical error', function() {
    const abcTools = {
      json2abc: function() { return 'X:1\nT:Tune A\nM:4/4\nK:C\n' },
      getMetaValueFromAbc: function() { return '' },
    }
    const status = scanTuneMusicalIssueStatus(makeTune([]), { abcTools: abcTools })
    expect(status.hasMusicalErrors).toBe(true)
  })

  test('photo-only stubs are not musical errors', function() {
    const abcTools = {
      json2abc: function() {
        return 'X:1\nT:Maltese Dance No. 13\nM:4/4\nK:C\n%% photo only — ABC not transcribed\n'
      },
      getMetaValueFromAbc: function() { return '' },
    }
    const status = scanTuneMusicalIssueStatus(makeTune([]), { abcTools: abcTools })
    expect(status).toEqual({
      hasMusicalErrors: false,
      hasMusicalWarnings: false,
    })
  })

  test('missing meter header is a musical warning', function() {
    const abcTools = {
      json2abc: function() { return 'X:1\nT:Tune A\nK:C\nCDEF|' },
      getMetaValueFromAbc: function() { return '' },
    }
    const status = scanTuneMusicalIssueStatus(makeTune(['CDEF|']), { abcTools: abcTools })
    expect(status.hasMusicalWarnings).toBe(true)
    expect(status.hasMusicalErrors).toBe(false)
  })

  test('unmatched repeat start is a musical error', function() {
    const abcTools = {
      json2abc: function() { return 'X:1\nT:Tune A\nM:4/4\nK:C\n|: CDEF|' },
      getMetaValueFromAbc: function() { return '' },
    }
    const status = scanTuneMusicalIssueStatus(makeTune(['|: CDEF|']), { abcTools: abcTools })
    expect(status.hasMusicalErrors).toBe(true)
  })

  test('does not call renderAbc', function() {
    const renderSpy = jest.spyOn(abcjs, 'renderAbc')
    const abcTools = {
      json2abc: function() { return 'X:1\nT:Tune A\nM:4/4\nK:C\nCDEF|' },
      getMetaValueFromAbc: function() { return '' },
    }
    scanTuneMusicalIssueStatus(makeTune(['CDEF|']), { abcTools: abcTools })
    expect(renderSpy).not.toHaveBeenCalled()
    renderSpy.mockRestore()
  })
})
