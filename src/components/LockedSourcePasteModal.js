import { useEffect, useState } from 'react'
import { Alert, Button, Form, Modal } from 'react-bootstrap'
import { buildImportContext, dispatchAddImport } from '../addImportDispatch'
import {
  chordSheetTextToCandidate,
  parseImportText,
} from '../importSourceParse'
import { createImportCandidate } from '../importReviewSession'
import {
  requestImportReview,
  showImportReviewUi,
} from '../importReviewSessionStore'
import { setLyricLines } from '../wLinesUtils'

function contentLabel(contentType) {
  if (contentType === 'lyrics') return 'lyrics'
  if (contentType === 'notation') return 'ABC notation'
  return 'chord sheet'
}

function truncateTitle(title, maxLen) {
  const text = String(title || '').trim()
  if (!text) return ''
  const limit = maxLen || 80
  if (text.length <= limit) return text
  return text.slice(0, limit - 1) + '…'
}

function prefillCandidateMeta(candidates, options) {
  const searchTitle = String(options.searchTitle || '').trim()
  const searchArtist = String(options.searchArtist || '').trim()
  const sourceUrl = String(options.sourceUrl || '').trim()
  const fallbackTitle = String(options.fallbackTitle || '').trim()

  return (candidates || []).map(function(candidate) {
    const tune = Object.assign({}, candidate.tune || {})
    const name = String(tune.name || '').trim()
    if ((!name || name === 'Untitled') && (searchTitle || fallbackTitle)) {
      tune.name = searchTitle || fallbackTitle
    }
    if (!String(tune.composer || '').trim() && searchArtist) {
      tune.composer = searchArtist
    }
    if (!tune.srcUrl && sourceUrl) {
      tune.srcUrl = sourceUrl
    }
    return Object.assign({}, candidate, { tune: tune })
  })
}

function lyricsTextToCandidate(text, options) {
  const lines = String(text || '').split(/\r?\n/)
  const tune = {
    name: options.searchTitle || options.fallbackTitle || 'Untitled',
    composer: options.searchArtist || '',
    books: options.book ? [options.book] : [],
    voices: { '1': { meta: '', notes: [] } },
    srcUrl: options.sourceUrl || '',
  }
  setLyricLines(tune, lines)
  return createImportCandidate({
    tune: tune,
    sourceKind: 'lyrics',
    rawText: text,
  })
}

export default function LockedSourcePasteModal(props) {
  const show = !!props.show
  const candidate = props.candidate || null
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(function() {
    if (!show) {
      setText('')
      setError('')
      setBusy(false)
    }
  }, [show])

  function handleClose(options) {
    if (busy && !(options && options.force)) return
    if (typeof props.onHide === 'function') props.onHide()
  }

  function openLink() {
    if (!candidate || !candidate.url) return
    window.open(candidate.url, '_blank', 'noopener,noreferrer')
  }

  async function buildCandidates(trimmed) {
    const contentType = candidate && candidate.contentType ? candidate.contentType : ''
    const sourceUrl = candidate && candidate.url ? candidate.url : ''
    const tunebook = props.tunebook
    const abcjsParser = props.abcjsParser
    const book = props.book || ''
    const meta = {
      searchTitle: props.searchTitle,
      searchArtist: props.searchArtist,
      fallbackTitle: candidate && candidate.title,
      sourceUrl: sourceUrl,
      book: book,
    }

    if (contentType === 'lyrics') {
      try {
        const parsed = parseImportText({
          text: trimmed,
          fileName: 'pasted.txt',
          tunebook: tunebook,
          abcjsParser: abcjsParser,
          book: book,
        })
        if (parsed && parsed.length) {
          return prefillCandidateMeta(parsed, meta)
        }
      } catch (e) {
        // Fall through to lyrics-only candidate.
      }
      return prefillCandidateMeta([lyricsTextToCandidate(trimmed, meta)], meta)
    }

    if (contentType === 'chords' || !contentType) {
      try {
        const sheetCandidate = chordSheetTextToCandidate(
          trimmed,
          tunebook,
          abcjsParser,
          book
        )
        return prefillCandidateMeta([sheetCandidate], meta)
      } catch (e) {
        // Fall through to dispatchAddImport / parseImportText.
      }
    }

    const result = await dispatchAddImport(
      { text: trimmed, sourceUrl: sourceUrl },
      buildImportContext({
        tunebook: tunebook,
        abcjsParser: abcjsParser,
        book: book,
      })
    )
    if (result.action === 'error') {
      throw new Error(result.message || 'Import failed')
    }
    if (result.action !== 'review' || !result.candidates || !result.candidates.length) {
      throw new Error('Could not recognize pasted content')
    }
    return prefillCandidateMeta(result.candidates, meta)
  }

  async function handleImportToReview() {
    const trimmed = text.trim()
    if (!trimmed || !props.tunebook) return
    setError('')
    setBusy(true)
    try {
      const candidates = await buildCandidates(trimmed)
      requestImportReview(candidates)
      showImportReviewUi()
      setBusy(false)
      handleClose({ force: true })
    } catch (e) {
      setError(e && e.message ? e.message : 'Import failed')
      setBusy(false)
    }
  }

  const sourceLabel = candidate
    ? (candidate.source || candidate.host || 'External source')
    : 'External source'
  const pageTitle = candidate ? truncateTitle(candidate.title) : ''
  const pasteKind = contentLabel(candidate && candidate.contentType)
  const canImport = text.trim().length > 0 && !busy

  return (
    <Modal show={show} onHide={handleClose} size="lg" backdrop="static">
      <Modal.Header closeButton={!busy}>
        <Modal.Title>
          Paste from {sourceLabel}
          {pageTitle ? (
            <span style={{ display: 'block', fontSize: '0.7em', fontWeight: 400, marginTop: '0.25em' }}>
              {pageTitle}
            </span>
          ) : null}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ display: 'flex', flexDirection: 'column', gap: '0.75em' }}>
        <p style={{ marginBottom: 0 }}>
          This site blocks automated import. Open the page, copy the {pasteKind}, then paste it below and import to review.
        </p>
        <div style={{ display: 'flex', gap: '0.5em', flexWrap: 'wrap' }}>
          <Button
            variant="outline-primary"
            disabled={!candidate || !candidate.url}
            onClick={openLink}
          >
            Open link
          </Button>
          <Button
            variant="success"
            disabled={!canImport}
            onClick={handleImportToReview}
          >
            {busy ? 'Importing…' : 'Import to review'}
          </Button>
        </div>
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <Form.Control
          as="textarea"
          value={text}
          disabled={busy}
          onChange={function(e) { setText(e.target.value) }}
          style={{ minHeight: '50vh', fontFamily: 'monospace' }}
          placeholder={'Paste the ' + pasteKind + ' here…'}
        />
      </Modal.Body>
    </Modal>
  )
}
