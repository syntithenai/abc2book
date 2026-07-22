import abcjs from 'abcjs'
import {
  convertSessionLineBreaks,
  needsSessionLineBreakFix,
  normalizeAbcForImport,
  protectAbcAnnotations,
  restoreAbcAnnotations,
} from './abcImportNormalize'

const USER_REEL_BODY = [
  '|:"Am"E2A2 ABcd|e2d2 c2A2|"G"B2G2 GFGA|"Em"B2AG E2D2|!',
  ' "Am"E2A2 ABcd|e2d2 e2ag|"Em"e2d2 "G"BedB|"Am"A4 A4:|!',
  ' |:"Am"a2e2 e2fg|abag e2fg|abaf "Em"g3e|"G"dedB G4|!',
  ' "Am"a2e2 e2fg|abag e2d2|"Em"B2e2 "G"d2B2|"Am"A4 A4:|',
].join('')

function miniAbc(body) {
  return [
    'X:1',
    'T:Test',
    'M:4/4',
    'L:1/8',
    'K:Am',
    body,
  ].join('\n')
}

function countBarsBeforeRepeatEnd(abc) {
  const parsed = abcjs.parseOnly(abc)
  expect(parsed.length).toBeGreaterThan(0)
  const measures = abcjs.extractMeasures(abc)
  expect(measures.length).toBeGreaterThan(0)
  const list = measures[0].measures || []
  let bars = 0
  for (let i = 0; i < list.length; i++) {
    const token = String(list[i].abc || '')
    bars += 1
    if (token.indexOf(':|') >= 0 || token.indexOf(':|') >= 0) break
  }
  return bars
}

describe('abcImportNormalize', function() {
  test('protectAbcAnnotations preserves paired tokens', function() {
    const input = 'A !p! B !slide! c'
    const protectedParts = protectAbcAnnotations(input)
    expect(protectedParts.text).not.toContain('!p!')
    expect(protectedParts.annotations).toEqual(['!p!', '!slide!'])
    expect(restoreAbcAnnotations(protectedParts.text, protectedParts.annotations)).toBe(input)
  })

  test('needsSessionLineBreakFix detects Session markers', function() {
    expect(needsSessionLineBreakFix(USER_REEL_BODY)).toBe(true)
    expect(needsSessionLineBreakFix('CDEF|GABc|')).toBe(false)
    expect(needsSessionLineBreakFix('A !p! B')).toBe(false)
  })

  test('convertSessionLineBreaks fixes user reel repeat section bar count', function() {
    const raw = miniAbc(USER_REEL_BODY)
    const normalized = convertSessionLineBreaks(raw)
    expect(normalized).toContain('E2D2|\n "Am"E2A2')
    expect(countBarsBeforeRepeatEnd(normalized)).toBe(8)
  })

  test('convertSessionLineBreaks preserves !annotation! tokens', function() {
    const input = 'A2 !p! B2 | !slide!c2 d2 |'
    expect(convertSessionLineBreaks(input)).toBe(input)
  })

  test('convertSessionLineBreaks handles |! at end of line and |! mid-line', function() {
    const input = 'A2 B2 |!\nC2 D2 |!\nE2 F2 |'
    const out = convertSessionLineBreaks(input)
    expect(out).toBe('A2 B2 |\n\nC2 D2 |\n\nE2 F2 |')
    expect(convertSessionLineBreaks('A2 B2 |! C2 D2 |')).toBe('A2 B2 |\n C2 D2 |')
  })

  test('normalizeAbcForImport is no-op without bare bang markers', function() {
    const input = miniAbc('CDEF|GABc|cdef|')
    expect(normalizeAbcForImport(input)).toBe(input)
  })
})
