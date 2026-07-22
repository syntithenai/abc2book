import { useEffect, useState } from 'react'
import { Button, ButtonGroup, Form } from 'react-bootstrap'

export default function TuneFilePdfToolbar(props) {
  const {
    fileName,
    page,
    numPages,
    pageStep: pageStepProp,
    onPageChange,
    onPrevSpread,
    onNextSpread,
    onFileNameChange,
    onOpenIndex,
    menuIcon,
    icons,
    className,
    embedded,
  } = props
  const currentPage = Math.max(1, parseInt(page, 10) || 1)
  const step = Math.max(1, parseInt(pageStepProp, 10) || 1)
  const [draftName, setDraftName] = useState(fileName || '')

  useEffect(function() {
    setDraftName(fileName || '')
  }, [fileName])

  function setPage(next) {
    if (!onPageChange) return
    const maxPage = numPages > 0 ? numPages : next
    onPageChange(Math.min(Math.max(1, next), maxPage))
  }

  function commitFileName() {
    if (!onFileNameChange) return
    const trimmed = String(draftName || '').trim()
    const next = trimmed || 'File'
    setDraftName(next)
    if (next !== String(fileName || '').trim()) {
      onFileNameChange(next)
    }
  }

  function handleNameKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitFileName()
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setDraftName(fileName || '')
      e.currentTarget.blur()
    }
  }

  const rootClass = [
    'tune-file-pdf-toolbar',
    embedded ? 'tune-file-pdf-toolbar--embedded' : '',
    className || '',
  ].filter(Boolean).join(' ')

  return (
    <div className={rootClass}>
      <ButtonGroup size="sm" className="tune-file-pdf-toolbar-group music-tune-meta-group">
        <Button
          variant="outline-secondary"
          className="tune-file-pdf-contents-btn"
          title="PDF Index"
          aria-label="PDF Index"
          onClick={onOpenIndex}
        >
          {menuIcon || '☰'}
        </Button>
        <Button
          variant="outline-secondary"
          className="tune-file-pdf-page-btn"
          onClick={function() {
            if (onPrevSpread) onPrevSpread()
            else setPage(currentPage - step)
          }}
          disabled={currentPage <= 1}
          title={step > 1 ? ('Previous ' + step + ' pages') : 'Previous page'}
          aria-label={step > 1 ? ('Previous ' + step + ' pages') : 'Previous page'}
        >
          {(icons && icons.arrowup) || '↑'}
        </Button>
        <span className="btn btn-sm btn-outline-secondary tune-file-pdf-page-input">
          <input
            type="number"
            value={currentPage}
            min={1}
            max={numPages || 1}
            aria-label="PDF page"
            onChange={function(e) { setPage(parseInt(e.target.value, 10) || 1) }}
          />
          {' / '}{numPages || '…'}
        </span>
        <Button
          variant="outline-secondary"
          className="tune-file-pdf-page-btn"
          onClick={function() {
            if (onNextSpread) onNextSpread()
            else setPage(currentPage + step)
          }}
          disabled={!!numPages && currentPage >= numPages}
          title={step > 1 ? ('Next ' + step + ' pages') : 'Next page'}
          aria-label={step > 1 ? ('Next ' + step + ' pages') : 'Next page'}
        >
          {(icons && icons.arrowdown) || '↓'}
        </Button>
        <Form.Control
          size="sm"
          type="text"
          className="tune-file-pdf-toolbar-title-input"
          value={draftName}
          maxLength={50}
          aria-label="PDF document title"
          title="PDF document title"
          onChange={function(e) { setDraftName(e.target.value) }}
          onBlur={commitFileName}
          onKeyDown={handleNameKeyDown}
        />
      </ButtonGroup>
    </div>
  )
}
