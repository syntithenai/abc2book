import {
  transposeNote,
  fretsStringToDiagram,
  stringsFromInstrument,
  noteFromFret,
  canonicalChordLetter,
  tuningLabelsFromDiagram,
  selectBestDiagram,
  chordToneMismatchCount
} from './chordLibUtils'
import {
  isFretAllowedOnString,
  isValidBanjo5Voicing,
  lowestFrettedPosition
} from './chordVoicingGenerator'
import { INSTRUMENT_TUNINGS, BANJO5_DRONE_STRING_INDEX, BANJO5_DRONE_MIN_FRET } from './chordLibConfig'

const NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

function chordNotes(root, intervals) {
  const rootIdx = NOTES.indexOf(root)
  return intervals.map((semi) => NOTES[(rootIdx + semi) % 12])
}

function soundingNotes(diagram) {
  return diagram.tuning.map((n) => n[0]).filter(Boolean)
}

function canonicalizeNotes(notes) {
  return notes.map((note) => canonicalChordLetter(note) || note)
}

function fretsFromDiagram(diagram) {
  return diagram.chord.map((row) => row[1]).join('')
}

describe('chordLibUtils', () => {
  it('transposes mandolin G to banjo4 C', () => {
    expect(transposeNote('G', 5)).toBe('C')
  })

  it('builds uke C major as 0003', () => {
    const diagram = fretsStringToDiagram('0003', '0003', 'uke', ['C', 'E', 'G'])
    expect(fretsFromDiagram(diagram)).toBe('0003')
  })

  it('builds banjo4 C major as 0023', () => {
    const diagram = fretsStringToDiagram('0023', '0012', 'banjo4', ['C', 'E', 'G'])
    expect(fretsFromDiagram(diagram)).toBe('0023')
    expect(diagram.tuning.map((n) => n[0])).toEqual(['C', 'G', 'E', 'C'])
  })

  it('builds banjo5 G major as 00000', () => {
    const diagram = fretsStringToDiagram('00000', '00000', 'banjo5', ['G', 'B', 'D'])
    expect(fretsFromDiagram(diagram)).toBe('00000')
    expect(diagram.chord.length).toBe(5)
  })

  it('reports string counts for all instruments', () => {
    expect(stringsFromInstrument('guitar')).toBe(6)
    expect(stringsFromInstrument('mandolin')).toBe(4)
    expect(stringsFromInstrument('uke')).toBe(4)
    expect(stringsFromInstrument('banjo4')).toBe(4)
    expect(stringsFromInstrument('banjo5')).toBe(5)
    expect(stringsFromInstrument('bouzouki')).toBe(4)
  })

  it('parses banjo5 drone string tuning', () => {
    expect(INSTRUMENT_TUNINGS.banjo5[0]).toBe('g')
    expect(noteFromFret('banjo5', 0, 0)).toBe('G')
    expect(noteFromFret('banjo4', 0, 0)).toBe('C')
  })

  it('only allows banjo5 drone string frets at nut or 7th+', () => {
    expect(isFretAllowedOnString('banjo5', BANJO5_DRONE_STRING_INDEX, 0)).toBe(true)
    expect(isFretAllowedOnString('banjo5', BANJO5_DRONE_STRING_INDEX, 3)).toBe(false)
    expect(isFretAllowedOnString('banjo5', BANJO5_DRONE_STRING_INDEX, BANJO5_DRONE_MIN_FRET)).toBe(true)
  })

  it('accepts common open-position banjo5 D7', () => {
    expect(isValidBanjo5Voicing('00210', 'D', 'dominant7')).toBe(true)
  })

  it('canonicalizes enharmonic spellings', () => {
    expect(canonicalChordLetter('C#')).toBe('Db')
  })

  it('labels guitar Em from frets not stale slash-chord data', () => {
    const diagram = {
      name: 'Em',
      chord: [
        [6, '0', ''], [5, '2', ''], [4, '2', ''], [3, '0', ''], [2, '0', ''], [1, '0', '']
      ]
    }
    expect(tuningLabelsFromDiagram(diagram, 'guitar', ['E', 'G', 'B'])).toEqual(
      ['E', 'B', 'E', 'G', 'B', 'E']
    )
  })

  it('prefers plain Dm over Dm/C', () => {
    const entry = {
      main: [],
      secondary: [
        { name: 'Dm/C', chord: [[6, 'x', ''], [5, '3', ''], [4, '3', ''], [3, '2', ''], [2, '3', ''], [1, 'x', '']] },
        { name: 'Dm', chord: [[6, 'x', ''], [5, 'x', ''], [4, '0', ''], [3, '2', ''], [2, '3', ''], [1, '1', '']] }
      ]
    }
    const best = selectBestDiagram(entry, 'Dm', {
      instrument: 'guitar',
      chordNotes: ['D', 'F', 'A']
    })
    expect(best.name).toBe('Dm')
    expect(chordToneMismatchCount('guitar', entry.secondary[0], ['D', 'F', 'A'])).toBeGreaterThan(0)
  })
})

describe('chordlib.json instruments', () => {
  const chordlib = require('./chordlib.json')

  it('includes all instruments', () => {
    expect(Object.keys(chordlib)).toEqual(
      expect.arrayContaining(['guitar', 'mandolin', 'uke', 'banjo4', 'banjo5', 'bouzouki'])
    )
  })

  it('has expected starter chords', () => {
    const frets = (inst, quality, root) =>
      chordlib[inst][quality][root].main[0][0].chord.map((r) => r[1]).join('')

    expect(frets('uke', 'major', 'C')).toBe('0003')
    expect(frets('mandolin', 'major', 'A')).toBe('2200')
    expect(frets('mandolin', 'major', 'C')).toBe('0230')
    expect(frets('mandolin', 'major', 'G')).toBe('0023')
    expect(frets('banjo4', 'major', 'C')).toBe('0023')
    expect(frets('banjo5', 'major', 'G')).toBe('00000')
    expect(frets('bouzouki', 'major', 'G')).toBe('0020')
    expect(frets('bouzouki', 'major', 'D')).toBe('2400')
    expect(frets('banjo5', 'major', 'C')).toBe('02012')
    expect(frets('banjo5', 'major', 'A')).toBe('00222')
    expect(frets('banjo5', 'major', 'F')).toBe('03213')
    const d7 = chordlib.banjo5.dominant7.D.main[0][0]
    expect(d7.chord.map((r) => r[1]).join('')).toBe('00210')
    expect(lowestFrettedPosition(d7.chord.map((r) => parseInt(r[1], 10) || 0))).toBeLessThanOrEqual(2)
  })

  it('adds mandolin neck alternatives', () => {
    expect(chordlib.mandolin.major.A.secondary.length).toBeGreaterThan(0)
  })

  it('adds banjo5 neck alternatives', () => {
    expect(chordlib.banjo5.major.G.secondary.length).toBeGreaterThan(0)
  })

  it('builds banjo4 E major from chord tones', () => {
    const diagram = chordlib.banjo4.major.E.main[0][0]
    const notes = canonicalizeNotes(soundingNotes(diagram))
    const want = canonicalizeNotes(chordNotes('E', [0, 4, 7]))
    expect(notes).toEqual(expect.arrayContaining(['E']))
    expect([...new Set(notes)].every((note) => want.includes(note))).toBe(true)
  })

  it('uses plain guitar voicings for Dm and Em', () => {
    const dm = chordlib.guitar.minor.D.main[0][0]
    const em = chordlib.guitar.minor.E.main[0][0]
    expect(dm.name).toBe('Dm')
    expect(dm.chord.map((r) => r[1]).join('')).toBe('xx0231')
    expect(dm.tuning.map((n) => n[0])).toEqual(['', '', 'D', 'A', 'D', 'F'])
    expect(em.name).toBe('Em')
    expect(em.chord.map((r) => r[1]).join('')).toBe('022000')
    expect(em.tuning.map((n) => n[0])).toEqual(['E', 'B', 'E', 'G', 'B', 'E'])
  })

  it('frets banjo5 F major with F on the middle D string', () => {
    const diagram = chordlib.banjo5.major.F.main[0][0]
    expect(diagram.chord.map((r) => r[1]).join('')).toBe('03213')
    expect(diagram.tuning.map((n) => n[0])).toEqual(['G', 'F', 'A', 'C', 'F'])
  })

  it('builds banjo5 Bb major from chord tones', () => {
    const diagram = chordlib.banjo5.major.Bb.main[0][0]
    const notes = canonicalizeNotes(soundingNotes(diagram))
    const want = canonicalizeNotes(chordNotes('Bb', [0, 4, 7]))
    const allowedDrones = ['G', 'D']
    expect(notes).toEqual(expect.arrayContaining(['Bb']))
    expect([...new Set(notes)].every((note) => want.includes(note) || allowedDrones.includes(note))).toBe(true)
  })
})
