import { Button } from 'react-bootstrap'

export default function TuneFilePdfToolbar(props) {
  const {
    fileName,
    page,
    numPages,
    onPageChange,
    onOpenIndex,
    menuIcon,
    className,
    embedded,
  } = props
  const currentPage = Math.max(1, parseInt(page, 10) || 1)

  function setPage(next) {
    if (!onPageChange) return
    const maxPage = numPages > 0 ? numPages : next
    onPageChange(Math.min(Math.max(1, next), maxPage))
  }

  const rootClass = [
    'tune-file-pdf-toolbar',
    'd-flex',
    'align-items-center',
    'gap-2',
    embedded ? 'tune-file-pdf-toolbar--embedded' : '',
    className || '',
  ].filter(Boolean).join(' ')

  return (
    <div className={rootClass}>
      <Button
        size="sm"
        variant="outline-secondary"
        className="tune-file-pdf-contents-btn"
        title="PDF Index"
        aria-label="PDF Index"
        onClick={onOpenIndex}
      >
        {menuIcon || '☰'}
      </Button>
      <Button
        size="sm"
        variant="outline-secondary"
        onClick={function() { setPage(currentPage - 1) }}
        disabled={currentPage <= 1}
      >
        Prev
      </Button>
      <span className="small tune-file-pdf-page-input">
        <input
          type="number"
          value={currentPage}
          min={1}
          max={numPages || 1}
          onChange={function(e) { setPage(parseInt(e.target.value, 10) || 1) }}
        />
        {' / '}{numPages || '…'}
      </span>
      <Button
        size="sm"
        variant="outline-secondary"
        onClick={function() { setPage(currentPage + 1) }}
        disabled={!!numPages && currentPage >= numPages}
      >
        Next
      </Button>
      {fileName ? (
        <span className="tune-file-pdf-toolbar-title text-truncate" title={fileName}>
          {fileName}
        </span>
      ) : null}
    </div>
  )
}
