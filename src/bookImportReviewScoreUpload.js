/**
 * Add MusicXML / MXL / MSCZ as an ABC candidate during Import Book review.
 */
import { musicXmlToAbc } from './musicXmlToAbc'
import { extractMusicXmlFromMxl, isMusicXmlText } from './mxlExtract'
import { extractMusicXmlFromMscz } from './msczExtract'
import { candidateId, chordCount } from './bookImportAbcLookup'

async function readFileAsText(file) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader()
    reader.onload = function() { resolve(String(reader.result || '')) }
    reader.onerror = function() { reject(new Error('Could not read file')) }
    reader.readAsText(file)
  })
}

async function readFileAsArrayBuffer(file) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader()
    reader.onload = function() { resolve(reader.result) }
    reader.onerror = function() { reject(new Error('Could not read file')) }
    reader.readAsArrayBuffer(file)
  })
}

function titleFromFileName(name) {
  return String(name || 'score')
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim() || 'Score'
}

/**
 * @param {File} file
 * @param {{ allParts?: boolean }} [options]
 * @returns {Promise<{ candidate: object, hint: string }>}
 */
export async function scoreFileToImportCandidate(file, options) {
  const opts = options || {}
  const fileName = file.name || 'score.xml'
  const ext = fileName.split('.').pop().toLowerCase()
  let musicXml = ''

  if (ext === 'mxl') {
    const buffer = await readFileAsArrayBuffer(file)
    musicXml = String(await extractMusicXmlFromMxl(buffer) || '').trim()
  } else if (ext === 'mscz') {
    const extracted = await extractMusicXmlFromMscz(file)
    musicXml = String(extracted.musicXml || '').trim()
  } else {
    musicXml = String(await readFileAsText(file)).trim()
  }

  if (!musicXml || !isMusicXmlText(musicXml)) {
    throw new Error('File does not contain valid MusicXML')
  }

  const partFilter = opts.allParts ? 'all' : '1'
  const xml2abcOpts = partFilter === '1' ? { p: '1' } : { p: 'f' }
  const converted = musicXmlToAbc(musicXml, xml2abcOpts)
  const abc = String(converted || '').trim()
  if (!abc) throw new Error('MusicXML conversion produced empty ABC')

  const kind = ext === 'mscz' ? 'mscz' : 'musicxml'
  const source = kind + ':' + fileName
  const candidate = {
    id: candidateId(source, abc),
    source: source,
    abc: abc,
    score: 0.85,
    title: titleFromFileName(fileName),
    url: '',
    hasChords: chordCount(abc) >= 3,
  }
  let hint = 'Added: ' + fileName
  if (partFilter === 'all') hint += ' (all parts)'
  else hint += ' (part 1)'
  return { candidate: candidate, hint: hint }
}
