import { useMemo, useState } from 'react'
import { Button, ButtonGroup, Col, Form, ListGroup, Row, Spinner } from 'react-bootstrap'
import CapitalizeTitleButton from './CapitalizeTitleButton'
import FieldVoiceFillButton from './FieldVoiceFillButton'
import BookSelectorModal from './BookSelectorModal'
import TagsSelectorModal from './TagsSelectorModal'
import { findCollectionMatches, matchConfidenceLabel } from '../tuneCollectionMatch'
import { primaryArtist } from '../tuneBibliographicUtils'

function uniqueStrings(values) {
  const seen = {}
  const out = []
  ;(values || []).forEach(function(value) {
    const text = String(value || '').trim()
    if (!text) return
    const key = text.toLowerCase()
    if (seen[key]) return
    seen[key] = true
    out.push(text)
  })
  return out
}

/**
 * Slim Add dialog body: title, composer, books/tags, collection open-buttons.
 */
export default function AddTuneSimpleForm(props) {
  const values = props.values || {}
  const tunes = props.tunes || {}
  const tunebook = props.tunebook
  const title = String(values.title || '').trim()
  const artist = String(values.artist || '').trim()
  const [titleFocus, setTitleFocus] = useState(false)
  const [composerFocus, setComposerFocus] = useState(false)

  const matches = useMemo(function() {
    return findCollectionMatches({
      title: values.title || '',
      artist: values.artist || '',
      tunes: tunes,
      limit: 8,
    }) || []
  }, [values.title, values.artist, tunes])

  const titleSuggestions = useMemo(function() {
    const names = matches.map(function(item) {
      return item && item.tune ? item.tune.name : ''
    })
    // Also surface short local fuzzy names when only composer typed
    if (!title && artist) {
      Object.keys(tunes).forEach(function(id) {
        const tune = tunes[id]
        if (!tune || !tune.name) return
        const composer = primaryArtist(tune)
        if (composer && composer.toLowerCase().indexOf(artist.toLowerCase()) >= 0) {
          names.push(tune.name)
        }
      })
    }
    return uniqueStrings(names).slice(0, 12)
  }, [matches, title, artist, tunes])

  const composerSuggestions = useMemo(function() {
    const artists = []
    if (title) {
      matches.forEach(function(item) {
        if (!item || !item.tune) return
        const name = primaryArtist(item.tune)
        if (name) artists.push(name)
        if (Array.isArray(item.tune.artists)) {
          item.tune.artists.forEach(function(a) { artists.push(a) })
        }
      })
    } else {
      matches.forEach(function(item) {
        if (item && item.tune) artists.push(primaryArtist(item.tune))
      })
    }
    return uniqueStrings(artists).slice(0, 12)
  }, [matches, title])

  const bookList = String(values.bookList || '')
  const tagList = String(values.tagList || '')
  const primaryBook = bookList.split(',').map(function(part) {
    return part.trim()
  }).filter(Boolean)[0] || ''
  const selectedTags = tagList.split(',').map(function(part) {
    return part.trim()
  }).filter(Boolean)

  function setField(key, value) {
    if (typeof props.onChange !== 'function') return
    props.onChange(function(current) {
      return Object.assign({}, current, { [key]: value })
    })
  }

  function canAdd() {
    return !!(title && artist)
  }

  function handleAdd() {
    if (!canAdd() || typeof props.onAdd !== 'function') return
    props.onAdd()
  }

  function openMatch(tune) {
    if (!tune || !tune.id) return
    if (typeof props.onOpenMatch === 'function') props.onOpenMatch(tune)
  }

  const showTitleMenu = titleFocus && titleSuggestions.length > 0
  const showComposerMenu = composerFocus && composerSuggestions.length > 0

  return (
    <div className="add-tune-simple-form" data-testid="add-tune-simple-form">
      <Row>
        <Col md={7}>
          <Form.Group className="mb-3">
            <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
              <Form.Label className="mb-0">Title</Form.Label>
              <CapitalizeTitleButton
                value={values.title || ''}
                onCapitalize={function(next) { setField('title', next) }}
              />
            </div>
            <div className="d-flex gap-2 align-items-start">
              <div className="flex-grow-1 position-relative">
                <Form.Control
                  value={values.title || ''}
                  autoComplete="off"
                  list="add-tune-title-suggestions"
                  data-testid="add-tune-title"
                  placeholder="Song title"
                  onChange={function(e) { setField('title', e.target.value) }}
                  onFocus={function() { setTitleFocus(true) }}
                  onBlur={function() { setTimeout(function() { setTitleFocus(false) }, 150) }}
                />
                <datalist id="add-tune-title-suggestions">
                  {titleSuggestions.map(function(name) {
                    return <option key={name} value={name} />
                  })}
                </datalist>
                {showTitleMenu ? (
                  <ListGroup
                    className="position-absolute w-100 shadow-sm"
                    style={{ zIndex: 5, maxHeight: '12em', overflow: 'auto' }}
                  >
                    {titleSuggestions.map(function(name) {
                      return (
                        <ListGroup.Item
                          key={name}
                          action
                          onMouseDown={function(e) { e.preventDefault(); setField('title', name) }}
                        >
                          {name}
                        </ListGroup.Item>
                      )
                    })}
                  </ListGroup>
                ) : null}
              </div>
              <FieldVoiceFillButton
                fieldKind="title"
                token={props.token}
                setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                onFill={function(text) { setField('title', text) }}
                data-testid="add-tune-title-mic"
              />
            </div>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Composer</Form.Label>
            <div className="d-flex gap-2 align-items-start">
              <div className="flex-grow-1 position-relative">
                <Form.Control
                  value={values.artist || ''}
                  autoComplete="off"
                  list="add-tune-composer-suggestions"
                  data-testid="add-tune-composer"
                  placeholder="Composer / artist"
                  onChange={function(e) { setField('artist', e.target.value) }}
                  onFocus={function() { setComposerFocus(true) }}
                  onBlur={function() { setTimeout(function() { setComposerFocus(false) }, 150) }}
                />
                <datalist id="add-tune-composer-suggestions">
                  {composerSuggestions.map(function(name) {
                    return <option key={name} value={name} />
                  })}
                </datalist>
                {showComposerMenu ? (
                  <ListGroup
                    className="position-absolute w-100 shadow-sm"
                    style={{ zIndex: 5, maxHeight: '12em', overflow: 'auto' }}
                  >
                    {composerSuggestions.map(function(name) {
                      return (
                        <ListGroup.Item
                          key={name}
                          action
                          onMouseDown={function(e) { e.preventDefault(); setField('artist', name) }}
                        >
                          {name}
                        </ListGroup.Item>
                      )
                    })}
                  </ListGroup>
                ) : null}
              </div>
              <FieldVoiceFillButton
                fieldKind="composer"
                token={props.token}
                setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                onFill={function(text) { setField('artist', text) }}
                data-testid="add-tune-composer-mic"
              />
            </div>
          </Form.Group>

          <div className="mb-3">
            <Button
              variant={canAdd() ? 'success' : 'secondary'}
              disabled={!canAdd()}
              data-testid="add-tune-save"
              onClick={handleAdd}
            >
              Add
            </Button>
            {props.matchingBusy ? (
              <Spinner animation="border" size="sm" className="ms-2" aria-label="Matching" />
            ) : null}
          </div>

          <Row className="mb-2">
            <Col md={6}>
              <Form.Group className="mb-2">
                <Form.Label>Book(s)</Form.Label>
                {tunebook ? (
                  <ButtonGroup style={{ backgroundColor: '#3f81e3', borderRadius: '10px' }}>
                    {primaryBook ? (
                      <Button title="Clear book" onClick={function() { setField('bookList', '') }}>
                        {tunebook.icons && tunebook.icons.closecircle ? tunebook.icons.closecircle : '×'}
                      </Button>
                    ) : null}
                    <BookSelectorModal
                      forceRefresh={props.forceRefresh}
                      title="Select a Book"
                      tunebook={tunebook}
                      value={primaryBook}
                      onChange={function(val) { setField('bookList', val || '') }}
                      defaultOptions={tunebook.getTuneBookOptions}
                      searchOptions={tunebook.getSearchTuneBookOptions}
                      triggerElement={
                        <Button style={{ marginLeft: '0.1em', color: 'black' }}>
                          {tunebook.icons && tunebook.icons.book ? tunebook.icons.book : null}{' '}
                          {primaryBook ? <b>{primaryBook}</b> : 'Select a book'}
                        </Button>
                      }
                    />
                  </ButtonGroup>
                ) : (
                  <Form.Control
                    value={bookList}
                    placeholder="comma separated"
                    onChange={function(e) { setField('bookList', e.target.value) }}
                  />
                )}
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-2">
                <Form.Label>Tags</Form.Label>
                {tunebook ? (
                  <div>
                    <TagsSelectorModal
                      forceRefresh={props.forceRefresh}
                      tunebook={tunebook}
                      setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                      defaultOptions={tunebook.getTuneTagOptions}
                      searchOptions={tunebook.getSearchTuneTagOptions}
                      value={selectedTags}
                      onChange={function(value) {
                        setField('tagList', Array.isArray(value) ? value.join(', ') : '')
                      }}
                      showTags={true}
                    />
                    <span>
                      {selectedTags.map(function(tag) {
                        return <Button key={tag} style={{ marginLeft: '0.2em' }} variant="outline-info">{tag}</Button>
                      })}
                    </span>
                  </div>
                ) : (
                  <Form.Control
                    value={tagList}
                    placeholder="comma separated"
                    onChange={function(e) { setField('tagList', e.target.value) }}
                  />
                )}
              </Form.Group>
            </Col>
          </Row>
        </Col>

        <Col md={5}>
          <div className="border rounded p-2" data-testid="add-tune-matches">
            <strong className="d-block mb-2">Collection matches</strong>
            {!matches.length ? (
              <div className="text-muted small">Type a title or composer to find existing tunes.</div>
            ) : (
              <ListGroup>
                {matches.map(function(item) {
                  const tune = item.tune
                  const conf = matchConfidenceLabel(item.score, item.youtubeMatch)
                  return (
                    <ListGroup.Item
                      key={tune.id}
                      className="d-flex justify-content-between align-items-center gap-2"
                    >
                      <div style={{ minWidth: 0 }}>
                        <div className="text-truncate">{tune.name || 'Untitled'}</div>
                        <div className="text-muted small text-truncate">
                          {primaryArtist(tune) || 'Unknown'}
                          {conf ? (' · ' + conf) : ''}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="primary"
                        data-testid="add-tune-open-match"
                        onClick={function() { openMatch(tune) }}
                      >
                        Open
                      </Button>
                    </ListGroup.Item>
                  )
                })}
              </ListGroup>
            )}
          </div>
        </Col>
      </Row>
    </div>
  )
}
