/* eslint-disable react-hooks/rules-of-hooks */
import useAbcTools from './useAbcTools'
import useAbcjsParser from './useAbcjsParser'

function tools() {
  return { abcTools: useAbcTools(), abcjsParser: useAbcjsParser() }
}

describe('useAbcjsParser mergeChords harmonyOnly', function() {
  test('harmonyOnly updates quoted chords without destroying bracket voicing', function() {
    const { abcTools, abcjsParser } = tools()
    const mini = [
      'X:1',
      'T:',
      'M:4/4',
      'L:1/8',
      'K:D',
      '[aa][bc]2dd | z2z2z2z2 |',
    ].join('\n')
    const chart = 'Am | G |'
    const merged = abcjsParser.mergeChords(chart, mini, null, { harmonyOnly: true })
    expect(merged).toMatch(/"Am"/)
    expect(merged).toMatch(/"G"/)
    expect(merged).toMatch(/\[aa\]/)
    expect(merged).not.toMatch(/zzzz/)
  })

  test('harmonyOnly injects inline meter from chart', function() {
    const { abcjsParser } = tools()
    const mini = [
      'X:1',
      'T:',
      'M:4/4',
      'L:1/8',
      'K:C',
      '[aa]dd | z2z2z2z2 |',
    ].join('\n')
    const chart = '[M:3/4] Am | G |'
    const merged = abcjsParser.mergeChords(chart, mini, null, { harmonyOnly: true })
    expect(merged).toMatch(/\[M:3\/4\]/)
    expect(merged).toMatch(/\[aa\]/)
  })

  test('harmonyOnly voicing fingerprint stable for simple bracket strain', function() {
    const { abcjsParser } = tools()
    const strain = '[aa][bc]2dd | z2z2z2z2 |'
    const mini = [
      'X:1',
      'T:',
      'M:4/4',
      'L:1/8',
      'K:D',
      strain,
    ].join('\n')
    const merged = abcjsParser.mergeChords('Am | G |', mini, null, { harmonyOnly: true })
    function fp(s) {
      return s.replace(/"([^"]*)"/g, '')
        .replace(/\[[MQLK]:[^\]]*\]/gi, '')
        .replace(/\[([a-gA-G]+)\]/g, function(_, letters) {
          return '[' + letters.split('').sort().join('') + ']'
        })
        .replace(/\s+/g, '')
    }
    expect(fp(merged)).toBe(fp(strain))
  })
})
