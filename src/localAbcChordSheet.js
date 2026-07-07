import {
  chartBlockHasChords,
  splitChordChartIntoBlocks,
} from './chordSheetUtils'
import { sheetLinesToLyricLines, sheetLinesToWizardChords } from './chordSheetImportUtils'
import { getPlainLyricLines } from './wLinesUtils'

function chordChartLineToSheetLine(line) {
  const tokens = String(line || '').trim().split(/\s+/).filter(function(token) {
    return token && token !== '|' && token !== '.'
  })
  if (!tokens.length) return ''
  return tokens.join(' ')
}

function sheetLinesFromChordChart(chordChart) {
  const sheetLines = []
  splitChordChartIntoBlocks(chordChart).forEach(function(block) {
    String(block || '').split('\n').forEach(function(line) {
      if (!chartBlockHasChords(line)) return
      const sheetLine = chordChartLineToSheetLine(line)
      if (sheetLine) sheetLines.push(sheetLine)
    })
  })
  return sheetLines
}

export function buildSheetLinesFromAbcTune(abcText, tune, abcTools, renderChords) {
  if (!abcText || !abcTools || typeof renderChords !== 'function') return null
  const notes = abcTools.justNotes(abcText)
  if (!abcTools.hasChords(notes)) return null

  const chordChart = renderChords(abcText, true)
  if (!chordChart || !String(chordChart).trim()) return null

  const sheetLines = sheetLinesFromChordChart(chordChart)
  if (!sheetLines.length) return null

  const lyricLines = tune ? getPlainLyricLines(tune) : []
  if (lyricLines.length) {
    if (sheetLines.length && lyricLines.length) sheetLines.push('')
    lyricLines.forEach(function(line) {
      if (String(line || '').trim()) sheetLines.push(String(line))
    })
  }

  return sheetLines
}

export function buildLocalAbcChordCandidate(abcText, tune, meta, abcTools, renderChords) {
  const sheetLines = buildSheetLinesFromAbcTune(abcText, tune, abcTools, renderChords)
  if (!sheetLines || !sheetLines.length) return null

  const chordText = sheetLinesToWizardChords(sheetLines)
  if (!chordText.trim()) return null

  const lyricLines = sheetLinesToLyricLines(sheetLines)
  return {
    sheetLines: sheetLines,
    chordText: chordText,
    lyricLines: lyricLines,
    lyricText: lyricLines.join('\n'),
    title: meta.title || '',
    artist: meta.artist || '',
    source: meta.source || 'local collection',
    sourceUrl: meta.sourceUrl || '',
    preview: chordText.split('\n').slice(0, 4).join('\n'),
    titleOnly: false,
  }
}
