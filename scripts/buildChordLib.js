#!/usr/bin/env node
/**
 * Build uke, banjo4, banjo5 sections and merge into src/chordlib.json.
 * Preserves existing guitar and mandolin data; enriches mandolin with neck alternatives.
 */
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const { chordParserFactory, chordRendererFactory } = require('chord-symbol')

const ROOT = path.join(__dirname, '..')
const CHORDLIB_PATH = path.join(ROOT, 'src', 'chordlib.json')
const UKULELE_DIR = path.join(ROOT, 'src', 'react-chords', 'db', 'ukulele', 'chords')
const BANJO4_CHART = path.join(ROOT, 'src', 'banjo4.chords.chart.json')
const BANJO5_CHART = path.join(ROOT, 'src', 'banjo5.chords.chart.json')

const NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const CHORD_LETTER_MAP = { 'C#': 'Db', 'G#': 'Ab', 'D#': 'Eb', 'A#': 'Bb', 'Gb': 'F#' }
const CHORD_LETTER_MAP_COMPLETE = {
  'F#': 'Gb', 'C#': 'Db', 'G#': 'Ab', 'D#': 'Eb', 'A#': 'Bb',
  'Bb': 'A#', 'Eb': 'D#', 'Ab': 'G#', 'Db': 'C#', 'Gb': 'F#'
}

const INSTRUMENT_TUNINGS = {
  uke: ['G', 'C', 'E', 'A'],
  mandolin: ['G', 'D', 'A', 'E'],
  banjo4: ['C', 'G', 'D', 'A'],
  banjo5: ['g', 'D', 'G', 'B', 'D']
}

const SUFFIX_TO_NAME = {
  major: '',
  minor: 'm',
  dim: 'dim',
  aug: 'aug',
  '6': '6',
  '7': '7',
  maj7: 'maj7',
  m7: 'm7',
  dim7: 'dim7',
  m6: 'm6',
  mmaj7: 'm(maj7)',
  sus2: 'sus2',
  sus4: 'sus4',
  '7sus4': '7sus4',
  '7b5': '7b5',
  m7b5: 'm7b5',
  add9: 'add9',
  madd9: 'madd9'
}

const SUFFIX_TO_QUALITY = {
  major: 'major',
  minor: 'minor',
  dim: 'diminished',
  aug: 'augmented',
  '6': 'major6',
  '7': 'dominant7',
  maj7: 'major7',
  m7: 'minor7',
  dim7: 'diminished7',
  m6: 'minor6',
  mmaj7: 'minorMajor7',
  sus2: 'suspended2',
  sus4: 'suspended4'
}

const PREFERRED_PRIMARY_FRETS = {
  mandolin: {
    major: {
      G: ['0023'],
      C: ['0230'],
      D: ['2002'],
      A: ['2200'],
      E: ['1220'],
      F: ['5301']
    },
    minor: {
      G: ['0013'],
      D: ['2001'],
      A: ['2100']
    }
  },
  banjo5: {
    major: {
      G: ['00000'],
      C: ['02012'],
      D: ['04234', '0230x'],
      A: ['00222'],
      F: ['00213']
    },
    minor: {
      E: ['02020', '00402'],
      A: ['00212']
    },
    dominant7: {
      D: ['00210'],
      G: ['00000'],
      C: ['00012'],
      A: ['00222']
    }
  }
}

const parseChord = chordParserFactory()
const renderChord = chordRendererFactory({ useShortNamings: false })

let voicing = null

async function loadVoicingGenerator() {
  if (voicing) return voicing
  voicing = await import(pathToFileURL(path.join(ROOT, 'src', 'chordVoicingGenerator.js')).href)
  return voicing
}

function canonicalChordLetter(chordLetter) {
  return CHORD_LETTER_MAP[chordLetter] || chordLetter
}

function normalizeNoteName(note) {
  if (!note) return note
  const letter = note.length === 1 ? note.toUpperCase() : note[0].toUpperCase() + note.slice(1)
  return canonicalChordLetter(letter) || letter
}

function sharpFlatAdjust(note, chordNotes) {
  if (!note || !Array.isArray(chordNotes)) return note
  if (chordNotes.indexOf(note) !== -1) return note
  if (CHORD_LETTER_MAP_COMPLETE[note]) return CHORD_LETTER_MAP_COMPLETE[note]
  return note
}

function parseFretChar(char) {
  if (!char || char.toLowerCase() === 'x') return char.toLowerCase() === 'x' ? 'x' : null
  const val = parseInt(char, 16)
  return isNaN(val) ? null : val
}

function noteFromFret(instrument, stringIndex, fret) {
  const tuning = INSTRUMENT_TUNINGS[instrument]
  if (!tuning || !tuning[stringIndex]) return null
  const startLetter = normalizeNoteName(tuning[stringIndex])
  const noteStart = NOTES.indexOf(startLetter)
  if (noteStart === -1) return null
  return NOTES[(noteStart + fret) % 12]
}

function buildBarres(barreFret, numStrings) {
  if (!barreFret) return []
  return [{
    fromString: numStrings,
    toString: 1,
    fret: barreFret
  }]
}

function fretsToDiagram(fretsStr, fingersStr, instrument, chordNotes, options = {}) {
  const tuning = INSTRUMENT_TUNINGS[instrument]
  const numStrings = tuning.length
  const frets = fretsStr.split('')
  const fingers = (fingersStr || '').padEnd(numStrings, '').split('')
  const chord = []
  const tuningLabels = []

  for (let i = 0; i < numStrings; i++) {
    const stringNum = numStrings - i
    const raw = frets[i] !== undefined ? frets[i] : 'x'
    const fretVal = raw.toLowerCase() === 'x' ? 'x' : String(parseFretChar(raw))
    const finger = fretVal === 'x' ? '' : (fingers[i] && fingers[i] !== '0' ? fingers[i] : '')
    chord.push([stringNum, fretVal, finger])
    if (fretVal === 'x') {
      tuningLabels.push([''])
    } else {
      const fretNum = parseInt(fretVal, 10)
      const note = noteFromFret(instrument, i, isNaN(fretNum) ? 0 : fretNum)
      tuningLabels.push([sharpFlatAdjust(note, chordNotes)])
    }
  }

  const position = options.position !== undefined
    ? options.position
    : calcDiagramPosition(chord)
  const barres = options.barres ? buildBarres(options.barres, numStrings) : []

  return { chord, barres, position, tuning: tuningLabels }
}

function calcDiagramPosition(chordRows) {
  let max = 3
  let minFret = 99
  chordRows.forEach((row) => {
    const val = parseInt(row[1], 10)
    if (!isNaN(val) && val > 0) {
      if (val > max) max = val
      if (val < minFret) minFret = val
    }
  })
  return max > 4 ? minFret : 0
}

function makeDiagramEntry(name, fretsStr, fingersStr, instrument, chordNotes, options) {
  const diagram = fretsToDiagram(fretsStr, fingersStr, instrument, chordNotes, options)
  return { name, ...diagram }
}

function ensureLibEntry(lib, quality, root) {
  if (!lib[quality]) lib[quality] = {}
  if (!lib[quality][root]) lib[quality][root] = { main: [], secondary: [] }
  return lib[quality][root]
}

function walkChordFiles(dir) {
  const results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) results.push(...walkChordFiles(full))
    else if (entry.name.endsWith('.js') && entry.name !== 'index.js') results.push(full)
  }
  return results
}

function parseUkuleleFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const keyMatch = content.match(/key:\s*'([^']+)'/)
  const suffixMatch = content.match(/suffix:\s*'([^']+)'/)
  if (!keyMatch || !suffixMatch) return null

  const positions = []
  const blockRegex = /\{[^{}]*frets:\s*'([^']+)'[^{}]*\}/g
  let block
  while ((block = blockRegex.exec(content)) !== null) {
    const blockText = block[0]
    const frets = block[1]
    const fingersMatch = blockText.match(/fingers:\s*'([^']*)'/)
    const barresMatch = blockText.match(/barres:\s*(\d+)/)
    const capoMatch = blockText.match(/capo:\s*true/)
    positions.push({
      frets,
      fingers: fingersMatch ? fingersMatch[1] : '',
      barres: barresMatch ? parseInt(barresMatch[1], 10) : null,
      capo: !!capoMatch
    })
  }

  return { key: keyMatch[1], suffix: suffixMatch[1], positions }
}

function chordNameFromKeySuffix(key, suffix) {
  const frag = Object.prototype.hasOwnProperty.call(SUFFIX_TO_NAME, suffix)
    ? SUFFIX_TO_NAME[suffix]
    : suffix
  return key + frag
}

function buildUke() {
  const lib = {}
  const files = walkChordFiles(UKULELE_DIR)

  files.forEach((filePath) => {
    const parsed = parseUkuleleFile(filePath)
    if (!parsed || !parsed.positions.length) return

    const quality = SUFFIX_TO_QUALITY[parsed.suffix]
    if (!quality) return

    const chordName = chordNameFromKeySuffix(parsed.key, parsed.suffix)
    const chordInfo = parseChord(chordName)
    if (chordInfo.error) return

    const root = canonicalChordLetter(parsed.key)
    const label = renderChord(chordInfo)
    const entry = ensureLibEntry(lib, quality, root)

    parsed.positions.forEach((pos, index) => {
      const diagram = makeDiagramEntry(
        label,
        pos.frets,
        pos.fingers,
        'uke',
        chordInfo.normalized.notes,
        { barres: pos.barres }
      )
      if (index === 0) {
        entry.main.push([diagram])
      } else {
        entry.secondary.push(diagram)
      }
    })
  })

  return lib
}

function chordNameFromQuality(letter, quality) {
  switch (quality) {
    case 'major': return letter
    case 'minor': return letter + 'm'
    case 'diminished': return letter + 'dim'
    case 'augmented': return letter + 'aug'
    case 'dominant7': return letter + '7'
    case 'major7': return letter + 'maj7'
    case 'minor7': return letter + 'm7'
    case 'major6': return letter + '6'
    case 'minor6': return letter + 'm6'
    default: return letter + quality
  }
}

function fillBanjoEnharmonics(lib) {
  const pairs = [
    ['C#', 'Db'], ['D#', 'Eb'], ['F#', 'Gb'], ['G#', 'Ab'], ['A#', 'Bb']
  ]
  pairs.forEach(([sharp, flat]) => {
    Object.keys(lib).forEach((quality) => {
      if (lib[quality][sharp] && !lib[quality][flat]) {
        lib[quality][flat] = JSON.parse(JSON.stringify(lib[quality][sharp]))
      }
      if (lib[quality][flat] && !lib[quality][sharp]) {
        lib[quality][sharp] = JSON.parse(JSON.stringify(lib[quality][flat]))
      }
    })
  })
  return lib
}

function preferredFretsFor(instrument, quality, root) {
  const byInstrument = PREFERRED_PRIMARY_FRETS[instrument]
  if (!byInstrument || !byInstrument[quality]) return []
  return byInstrument[quality][root] || []
}

function diagramFrets(diagram) {
  if (!diagram || !Array.isArray(diagram.chord)) return ''
  return diagram.chord.map((row) => row[1]).join('')
}

function promotePreferredPrimary(entry, preferredFrets) {
  if (!entry || !preferredFrets || !preferredFrets.length) return entry
  const preferredSet = new Set(preferredFrets.map((f) => String(f).toLowerCase()))

  for (let i = 0; i < entry.main.length; i += 1) {
    const group = entry.main[i]
    for (let j = 0; j < group.length; j += 1) {
      const frets = diagramFrets(group[j]).toLowerCase()
      if (!preferredSet.has(frets)) continue
      if (i === 0 && j === 0) return entry
      const chosen = group[j]
      const previousPrimary = entry.main[0] && entry.main[0][0] ? entry.main[0][0] : null
      entry.main[i].splice(j, 1)
      if (entry.main[i].length === 0) entry.main.splice(i, 1)
      entry.main.unshift([chosen])
      if (previousPrimary && diagramFrets(previousPrimary).toLowerCase() !== frets) {
        entry.secondary.unshift(previousPrimary)
      }
      return entry
    }
  }

  const secIndex = entry.secondary.findIndex((diagram) =>
    preferredSet.has(diagramFrets(diagram).toLowerCase()))
  if (secIndex === -1) return entry
  const chosen = entry.secondary.splice(secIndex, 1)[0]
  const previousPrimary = entry.main[0] && entry.main[0][0] ? entry.main[0][0] : null
  entry.main.unshift([chosen])
  if (previousPrimary && diagramFrets(previousPrimary).toLowerCase() !== diagramFrets(chosen).toLowerCase()) {
    entry.secondary.unshift(previousPrimary)
  }
  return entry
}

function applyPreferredPrimaries(lib, instrument) {
  if (!lib) return lib
  Object.keys(lib).forEach((quality) => {
    Object.keys(lib[quality]).forEach((root) => {
      promotePreferredPrimary(lib[quality][root], preferredFretsFor(instrument, quality, root))
    })
  })
  return lib
}

async function buildGeneratedBanjoInstrument(chart, instrument) {
  const vg = await loadVoicingGenerator()
  const lib = {}

  NOTES.forEach((root) => {
    Object.keys(vg.QUALITY_INTERVALS).forEach((quality) => {
      const chartSpec = chart[root] && chart[root][quality] ? chart[root][quality] : null
      const specs = vg.buildVoicingSpecs(
        instrument,
        root,
        quality,
        chartSpec,
        preferredFretsFor(instrument, quality, root)
      )
      if (!specs.length) return

      const chordInfo = parseChord(chordNameFromQuality(root, quality))
      if (chordInfo.error) return
      const label = renderChord(chordInfo)
      const entry = ensureLibEntry(lib, chordInfo.normalized.quality, canonicalChordLetter(root))

      const primary = specs[0]
      const primaryDiagram = makeDiagramEntry(
        label,
        primary.frets,
        primary.fingers || '',
        instrument,
        chordInfo.normalized.notes,
        { position: primary.position, barres: primary.barres }
      )
      entry.main = [[primaryDiagram]]

      specs.slice(1).forEach((spec) => {
        entry.secondary.push(makeDiagramEntry(
          vg.alternativeDiagramName(label, spec.frets, spec.position),
          spec.frets,
          spec.fingers || '',
          instrument,
          chordInfo.normalized.notes,
          { position: spec.position, barres: spec.barres }
        ))
      })
    })
  })

  fillBanjoEnharmonics(lib)
  return applyPreferredPrimaries(lib, instrument)
}

async function enrichMandolinNeckAlternatives(lib) {
  const vg = await loadVoicingGenerator()
  if (!lib) return lib

  Object.keys(lib).forEach((quality) => {
    if (!vg.QUALITY_INTERVALS[quality]) return
    Object.keys(lib[quality]).forEach((root) => {
      const entry = lib[quality][root]
      if (!entry) return
      const chordInfo = parseChord(chordNameFromQuality(root, quality))
      if (chordInfo.error) return
      const label = renderChord(chordInfo)
      vg.enrichEntryWithNeckAlternatives(
        entry,
        'mandolin',
        root,
        quality,
        function(name, fretsStr, fingersStr, options) {
          return makeDiagramEntry(
            name,
            fretsStr,
            fingersStr || '',
            'mandolin',
            chordInfo.normalized.notes,
            options || {}
          )
        },
        label
      )
    })
  })

  return applyPreferredPrimaries(lib, 'mandolin')
}

async function enrichBanjo4NeckAlternatives(lib) {
  const vg = await loadVoicingGenerator()
  if (!lib) return lib

  Object.keys(lib).forEach((quality) => {
    if (!vg.QUALITY_INTERVALS[quality]) return
    Object.keys(lib[quality]).forEach((root) => {
      const entry = lib[quality][root]
      if (!entry) return
      const chordInfo = parseChord(chordNameFromQuality(root, quality))
      if (chordInfo.error) return
      const label = renderChord(chordInfo)
      const known = new Set()
      entry.main.forEach((group) => {
        group.forEach((diagram) => known.add(vg.voicingFingerprint(vg.fretsFromDiagram(diagram))))
      })
      entry.secondary.forEach((diagram) => {
        known.add(vg.voicingFingerprint(vg.fretsFromDiagram(diagram)))
      })

      const specs = vg.generateAllVoicings('banjo4', root, quality, { maxVoicings: 10, maxFret: 12 })
      specs.forEach((spec) => {
        const key = vg.voicingFingerprint(spec.frets)
        if (known.has(key)) return
        known.add(key)
        entry.secondary.push(makeDiagramEntry(
          vg.alternativeDiagramName(label, spec.frets),
          spec.frets,
          spec.fingers || '',
          'banjo4',
          chordInfo.normalized.notes,
          { position: spec.position, barres: spec.barres }
        ))
      })
    })
  })

  return lib
}

async function buildBanjo4() {
  const chart = JSON.parse(fs.readFileSync(BANJO4_CHART, 'utf8'))
  const lib = await buildGeneratedBanjoInstrument(chart, 'banjo4')
  return enrichBanjo4NeckAlternatives(lib)
}

async function buildBanjo5() {
  const chart = JSON.parse(fs.readFileSync(BANJO5_CHART, 'utf8'))
  return buildGeneratedBanjoInstrument(chart, 'banjo5')
}

async function main() {
  console.log('Loading existing chordlib...')
  const chordlib = JSON.parse(fs.readFileSync(CHORDLIB_PATH, 'utf8'))

  console.log('Building uke...')
  chordlib.uke = buildUke()
  console.log('  qualities:', Object.keys(chordlib.uke).length)

  console.log('Enriching mandolin with neck alternatives...')
  chordlib.mandolin = await enrichMandolinNeckAlternatives(chordlib.mandolin)
  const mandolinSample = chordlib.mandolin.major && chordlib.mandolin.major.A
  if (mandolinSample) {
    console.log('  mandolin A major secondaries:', mandolinSample.secondary.length)
  }

  console.log('Building banjo4 (CGDA)...')
  chordlib.banjo4 = await buildBanjo4()
  console.log('  qualities:', Object.keys(chordlib.banjo4).length)

  console.log('Building banjo5 (open G)...')
  chordlib.banjo5 = await buildBanjo5()
  console.log('  qualities:', Object.keys(chordlib.banjo5).length)

  fs.writeFileSync(CHORDLIB_PATH, JSON.stringify(chordlib, null, 4))
  console.log('Wrote', CHORDLIB_PATH)
}

main().catch(function(err) {
  console.error(err)
  process.exit(1)
})
