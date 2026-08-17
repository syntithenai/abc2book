import { useRef, useState } from 'react'
import { Button } from 'react-bootstrap'
import { toast } from 'react-toastify'
import { setPendingAbcImportBatch } from '../abcImportBatchStore'
import { NOTATION_DOWNLOAD_FILE_ACCEPT } from '../importSourceParse'
import {
  requestImportReview,
  showImportReviewUi,
} from '../importReviewSessionStore'
import { runNotationFileImport } from '../notationFileImport'
import { useIsNarrowViewport } from '../useMediaQuery'
import useAbcjsParser from '../useAbcjsParser'
import useMediaResolverHealth from '../useMediaResolverHealth'

const SELECT_BUTTON_STYLE = {
  color: 'black',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35em',
  whiteSpace: 'nowrap',
}

export default function NotationSelectButton({
  tune,
  tunebook,
  token,
  tunes,
  book,
  onNotation,
  disabled,
  buttonStyle,
}) {
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const narrow = useIsNarrowViewport()
  const abcjsParser = useAbcjsParser({ tunebook: tunebook })
  const { available: resolverAvailable } = useMediaResolverHealth()
  const icon = tunebook && tunebook.icons && tunebook.icons.folderin
  const style = Object.assign({}, SELECT_BUTTON_STYLE, buttonStyle || {})

  function openImportReview(candidates) {
    requestImportReview(candidates || [], { entryMode: 'import' })
    showImportReviewUi()
  }

  async function importFile(file) {
    if (!file || busy) return
    setBusy(true)
    try {
      const planned = await runNotationFileImport(file, {
        resolverAvailable: resolverAvailable,
        token: token,
        tunebook: tunebook,
        abcjsParser: abcjsParser,
        book: book || '',
        tunes: tunes || {},
        currentTuneId: tune && tune.id,
        currentTune: tune,
      })
      if (!planned || planned.action === 'cancelled') return
      if (planned.action === 'error') {
        toast.error(planned.message || 'Import failed.')
        return
      }
      if (planned.action === 'batch' && planned.batchSummary) {
        setPendingAbcImportBatch(planned.batchSummary)
        return
      }
      if (planned.action === 'review') {
        openImportReview(planned.candidates)
        return
      }
      if (planned.action === 'apply' && planned.candidate && typeof onNotation === 'function') {
        onNotation(planned.candidate)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        hidden
        accept={NOTATION_DOWNLOAD_FILE_ACCEPT}
        data-testid="notation-select-file-input"
        disabled={disabled || busy}
        onChange={function(event) {
          const file = event.target.files && event.target.files[0]
          event.target.value = ''
          if (file) importFile(file)
        }}
      />
      <Button
        type="button"
        style={style}
        disabled={disabled || busy}
        title="Select a notation file to import (ABC, MusicXML, MIDI, MuseScore)"
        aria-label="Select notation file"
        data-testid="notation-select-button"
        onClick={function() {
          if (fileRef.current) fileRef.current.click()
        }}
      >
        {icon || null}
        {!narrow && <span>{busy ? 'Importing…' : 'Select'}</span>}
      </Button>
    </>
  )
}
