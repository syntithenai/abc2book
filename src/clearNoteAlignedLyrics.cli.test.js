import fs from 'fs'
import path from 'path'
import useAbcTools from './useAbcTools'
import { parseTunebookExportJson } from './tuneChordReadinessAudit'
import { clearNoteAlignedLyricsOnTunes } from './clearNoteAlignedLyrics'

const { abc2Tunebook } = useAbcTools()

function loadTunesFromInput(inputPath) {
  const resolved = path.resolve(inputPath)
  const text = fs.readFileSync(resolved, 'utf8')
  if (/\.abc$/i.test(resolved)) {
    return abc2Tunebook(text)
  }
  return parseTunebookExportJson(text)
}

describe('clearNoteAlignedLyrics CLI', function() {
  test('reports and optionally clears note-aligned lyrics when NOTE_ALIGNED_INPUT is set', function() {
    const inputEnv = process.env.NOTE_ALIGNED_INPUT
    if (!inputEnv) return

    const tunes = loadTunesFromInput(inputEnv)
    const apply = process.env.NOTE_ALIGNED_APPLY === '1'
    const result = clearNoteAlignedLyricsOnTunes(tunes, { dryRun: !apply })

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      input: path.resolve(inputEnv),
      totalTunes: result.total,
      withNoteAlignedLyrics: result.withNoteAligned,
      cleared: result.cleared,
      dryRun: result.dryRun,
    }, null, 2))

    if (apply) {
      const out = process.env.NOTE_ALIGNED_OUTPUT
        || path.join(path.dirname(path.resolve(inputEnv)), 'tunebook-no-wlines.json')
      fs.writeFileSync(path.resolve(out), JSON.stringify(result.tunes, null, 2))
      // eslint-disable-next-line no-console
      console.log('Wrote cleared tunebook to ' + path.resolve(out))
    }

    expect(result.total).toBeGreaterThanOrEqual(0)
    expect(result.withNoteAligned).toBeGreaterThanOrEqual(0)
  })
})
