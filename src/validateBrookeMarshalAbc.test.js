import fs from 'fs'
import path from 'path'
import useAbcTools from './useAbcTools'
import { isChordLine } from './chordSheetUtils'

const abcPath = path.join(__dirname, '..', 'scripts', 'brooke-marshal-output', 'brooke-marshal.abc')

describe('brooke-marshal.abc', function() {
  test('parses 28 tunes with book and tag metadata', function() {
    const abc = fs.readFileSync(abcPath, 'utf8')
    const abcTools = useAbcTools()
    const tunes = abcTools.abc2Tunebook(abc)
    expect(tunes.length).toBe(28)
    tunes.forEach(function(tune) {
      expect(tune.name).toBeTruthy()
      expect(tune.name).not.toMatch(/^[A-Z\s?'-]+$/)
      expect(tune.books).toContain('brooke marshal')
      expect(tune.tags).toContain('brooke marshal originals')
      expect(tune.composer).toBe('Brooke Marshal')
      const lyricCount = Array.isArray(tune.wLines) ? tune.wLines.length : (tune.words || []).length
      expect(lyricCount).toBeGreaterThan(0)
    })
    const roots = tunes.find(function(t) { return String(t.name || '').trim() === 'Roots Down' })
    const rootsNotes = Object.values(roots.voices)[0].notes.join('\n')
    expect(rootsNotes).toMatch(/"D"/)
    expect(rootsNotes).toMatch(/"G"/)
    expect(rootsNotes).toMatch(/"A"/)
    expect(roots.wLines.some(function(l) { return /^D\s+G\s+A$/.test(String(l).trim()) })).toBe(false)
    expect(roots.wLines.some(function(l) { return String(l).startsWith('# ') })).toBe(true)
    expect(rootsNotes).toMatch(/\|\|/)
    const cantFakeIt = tunes.find(function(t) { return /Can.t Fake It/i.test(String(t.name || '')) })
    expect(cantFakeIt).toBeTruthy()
    expect(isChordLine('Am G')).toBe(true)
    const cantFakeNotes = Object.values(cantFakeIt.voices)[0].notes.join('\n')
    expect(cantFakeNotes).toMatch(/"Am"/)
    expect(cantFakeNotes).toMatch(/"G"/)
    expect(cantFakeIt.wLines.some(function(l) { return String(l).trim() === 'Am G' })).toBe(false)
    const grey = tunes.find(function(t) { return String(t.name || '').trim() === 'Grey' })
    expect(grey).toBeTruthy()
    expect(String(grey.tempo || '')).toContain('61')
    const blotting = tunes.find(function(t) { return /Blotting Paper/i.test(String(t.name || '')) })
    expect(blotting).toBeTruthy()
    expect(blotting.capo).toBe(2)
    const pigPen = tunes.find(function(t) { return /Pig Pen/i.test(String(t.name || '')) })
    expect(pigPen).toBeTruthy()
    expect(pigPen.capo).toBe(3)
  })
})
