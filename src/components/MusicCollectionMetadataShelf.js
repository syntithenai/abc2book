import { useCallback, useEffect, useState } from 'react'
import { Button, Spinner } from 'react-bootstrap'
import { LIBRARY_OPTIONS_DEFAULT, LIBRARY_OPTIONS_EXPANDED } from '../recentTunes'
import { formatMusicCollectionBrowseError } from '../musicCollectionBrowseAccess'

export default function MusicCollectionMetadataShelf(props) {
  const labelKey = props.labelKey || 'name'
  const rowsKey = props.rowsKey || 'items'
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async function() {
    setBusy(true)
    setError('')
    try {
      const body = await props.fetchRows({
        query: props.query,
        limit: showMore ? LIBRARY_OPTIONS_EXPANDED : LIBRARY_OPTIONS_DEFAULT,
        offset: 0,
        accessToken: props.token,
      })
      setRows(body[rowsKey] || [])
      setTotal(typeof body.total === 'number' ? body.total : (body[rowsKey] || []).length)
      if (typeof props.onLoadTotal === 'function') {
        props.onLoadTotal(typeof body.total === 'number' ? body.total : (body[rowsKey] || []).length)
      }
    } catch (e) {
      setError(formatMusicCollectionBrowseError(e))
      setRows([])
      setTotal(0)
    } finally {
      setBusy(false)
    }
  }, [props.fetchRows, props.query, props.token, rowsKey, showMore])

  useEffect(function() {
    load()
  }, [load])

  useEffect(function() {
    setShowMore(false)
  }, [props.query])

  const selectedValue = props.selectedValue || ''
  const canToggle = total > LIBRARY_OPTIONS_DEFAULT

  return (
    <div className="library-metadata-shelf">
      {busy && !rows.length ? <Spinner animation="border" size="sm" /> : null}
      {error ? <div className="small text-danger mb-2">{error}</div> : null}
      {!busy || rows.length ? (
        <div className="small text-muted mb-2">{total} {props.itemLabel || 'items'}</div>
      ) : null}
      <div className="library-shelf-grid">
        {rows.map(function(row) {
          const value = String(row[labelKey] || '').trim()
          if (!value) return null
          const active = selectedValue === value
          return (
            <button
              key={value}
              type="button"
              className={'library-shelf-card' + (active ? ' library-shelf-card--active' : '')}
              onClick={function() {
                if (typeof props.onSelect === 'function') props.onSelect(value, row)
              }}
            >
              <div className="library-shelf-card-title">{value}</div>
              <div className="library-shelf-card-meta">{row.trackCount || 0} tracks</div>
            </button>
          )
        })}
      </div>
      {canToggle ? (
        <Button
          variant="link"
          size="sm"
          className="library-shelf-show-more px-0"
          onClick={function() { setShowMore(function(prev) { return !prev }) }}
        >
          {showMore ? 'Show fewer' : 'Show more'}
        </Button>
      ) : null}
    </div>
  )
}
