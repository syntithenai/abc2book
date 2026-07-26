import { useEffect, useRef, useState } from 'react'
import { Button, Modal, ListGroup } from 'react-bootstrap'
import { searchMediaLinks } from '../mediaLinkSearchClient'
import { getActiveResolverAccessToken } from '../mediaResolverHealthStore'
import { resolveResolverAccessToken } from '../resolverAccessToken'
import {
  MediaSearchResultDetailsModal,
  MediaSearchResultImage,
} from './MediaSearchResultDetails'
import VoiceFillInput from './VoiceFillInput'

function resolvedSearchToken(props) {
  return resolveResolverAccessToken(props && props.token) || getActiveResolverAccessToken() || ''
}

const MODAL_ART_STYLE = {
  width: 80,
  height: 80,
  objectFit: 'cover',
  borderRadius: 4,
  marginRight: '0.75rem',
  float: 'left',
}

function YouTubeSearchModal(props) {
  const [show, setShow] = useState(false)
  const [filter, setFilter] = useState('')
  const [error, setError] = useState('')
  const [results, setResults] = useState([])
  const filterChangeTimeoutRef = useRef(null)

  const handleClose = function() {
    setShow(false)
    if (props.handleClose) props.handleClose()
  }

  const handleShow = function() {
    setShow(true)
  }

  useEffect(function() {
    setFilter(props.value)
  }, [props.value])

  function runSearch(query) {
    const trimmed = String(query || '').trim()
    if (!trimmed) {
      setResults([])
      setError('')
      return
    }
    const accessToken = resolvedSearchToken(props)
    searchMediaLinks({
      query: trimmed,
      maxResults: 10,
      accessToken: accessToken,
      token: accessToken,
    }).then(function(listResult) {
      let list = []
      if (listResult && Array.isArray(listResult.candidates)) list = listResult.candidates
      else if (listResult && listResult.link) list = [listResult]
      setResults(list)
      setError('')
    }).catch(function(err) {
      setError(err && err.message ? err.message : 'Media search failed')
      setResults([])
    })
  }

  function filterChange(e) {
    setFilter(e.target.value)
    if (filterChangeTimeoutRef.current) clearTimeout(filterChangeTimeoutRef.current)
    if (e.target.value.trim() === '') {
      setResults([])
      return
    }
    filterChangeTimeoutRef.current = setTimeout(function() {
      runSearch(e.target.value)
    }, 1000)
  }

  useEffect(function() {
    if (show) runSearch(props.value)
  }, [show, props.value])

  function selectLink(link) {
    props.onChange(link)
    handleClose()
  }

  return (
    <>
      {typeof props.renderTrigger === 'function'
        ? props.renderTrigger({ onClick: handleShow })
        : (
          <Button style={{ color: 'black' }} variant="danger" disabled={props.disabled} onClick={handleShow}>
            {props.triggerElement}
          </Button>
        )}

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Search media</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <VoiceFillInput
            layout="wrap"
            useFormControl={false}
            type="text"
            value={filter}
            onChange={filterChange}
            onBlur={function() { if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(false) }}
            onFocus={function() { if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(true) }}
            setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
            token={props.token}
            fieldKind="search"
          />
        </Modal.Body>
        <Modal.Footer>
          {(error && error.length > 0) && <b>{error}</b>}
          <ListGroup style={{ clear: 'both', width: '100%' }}>
            {results.map(function(option, tk) {
              return (
                <ListGroup.Item key={tk} className={(tk % 2 === 0) ? 'even' : 'odd'}>
                  <Button style={{ float: 'right' }} onClick={function() { selectLink(option) }} variant="success">Select</Button>
                  <MediaSearchResultImage
                    item={option}
                    token={props.token}
                    style={MODAL_ART_STYLE}
                  />
                  <MediaSearchResultDetailsModal item={option} />
                </ListGroup.Item>
              )
            })}
          </ListGroup>
        </Modal.Footer>
      </Modal>
    </>
  )
}
export default YouTubeSearchModal
