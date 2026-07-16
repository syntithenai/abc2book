import { useMemo, useRef, useState } from 'react'
import { Button, ButtonGroup, Col, Form, InputGroup, ListGroup, Row, Spinner } from 'react-bootstrap'
import CapitalizeTitleButton from './CapitalizeTitleButton'
import FieldVoiceFillButton from './FieldVoiceFillButton'
import BookSelectorModal from './BookSelectorModal'
import TagsSelectorModal from './TagsSelectorModal'
import SelectInput from './SelectInput'
import ComposerSearchButton from './ComposerSearchButton'
import TuneArtistsField from './TuneArtistsField'
import AddTuneYouTubePicker from './AddTuneYouTubePicker'
import { findCollectionMatches, matchConfidenceLabel } from '../tuneCollectionMatch'
import { primaryArtist } from '../tuneBibliographicUtils'
import useMusicBrainzArtistOptions from '../useMusicBrainzArtistOptions'

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

function isYouTubeLink(link) {
  return !!(link && link.link && /youtu\.?be/i.test(String(link.link)))
}

function buildYouTubeQuery(title, composer, artists) {
  const parts = []
  const t = String(title || '').trim()
  const c = String(composer || '').trim()
  if (t) parts.push(t)
  if (c) {
    parts.push(c)
  } else {
    const firstArtist = (Array.isArray(artists) ? artists : []).map(function(a) {
      return String(a || '').trim()
    }).find(Boolean)
    if (firstArtist) parts.push(firstArtist)
  }
  return parts.join(' ').trim()
}

/**
 * Slim Add dialog: title, composer Search, artists, books/tags, embedded YouTube.
 */
export default function AddTuneSimpleForm(props) {
  const values = props.values || {}
  const tunes = props.tunes || {}
  const tunebook = props.tunebook
  const title = String(values.title || '').trim()
  const composer = String(values.artist || '').trim()
  const musicBrainzComposerOptions = useMusicBrainzArtistOptions(values.artist)
  const [composerSuggestOptions, setComposerSuggestOptions] = useState([])
  const [performerSuggestOptions, setPerformerSuggestOptions] = useState([])
  const [youtubeSearchQuery, setYoutubeSearchQuery] = useState('')
  const [youtubeSearchNonce, setYoutubeSearchNonce] = useState(0)
  const artistsRef = useRef([])

  const matches = useMemo(function() {
    return findCollectionMatches({
      title: values.title || '',
      artist: values.artist || '',
      tunes: tunes,
      limit: 8,
    }) || []
  }, [values.title, values.artist, tunes])

  const composerOptions = useMemo(function() {
    return uniqueStrings([].concat(composerSuggestOptions, musicBrainzComposerOptions))
  }, [composerSuggestOptions, musicBrainzComposerOptions])

  const bookList = String(values.bookList || '')
  const tagList = String(values.tagList || '')
  const primaryBook = bookList.split(',').map(function(part) {
    return part.trim()
  }).filter(Boolean)[0] || ''
  const selectedTags = tagList.split(',').map(function(part) {
    return part.trim()
  }).filter(Boolean)
  const artists = Array.isArray(values.artists) ? values.artists : []
  artistsRef.current = artists
  const youtubeLink = (Array.isArray(values.links) ? values.links : []).find(isYouTubeLink) || null

  function setField(key, value) {
    if (typeof props.onChange !== 'function') return
    props.onChange(function(current) {
      return Object.assign({}, current, { [key]: value })
    })
  }

  function scheduleYouTubeSearch(nextComposer, nextArtists) {
    const query = buildYouTubeQuery(
      values.title || title,
      nextComposer != null ? nextComposer : values.artist,
      nextArtists != null ? nextArtists : artistsRef.current
    )
    if (!query) return
    setYoutubeSearchQuery(query)
    setYoutubeSearchNonce(function(n) { return n + 1 })
  }

  function openMatch(tune) {
    if (!tune || !tune.id) return
    if (typeof props.onOpenMatch === 'function') props.onOpenMatch(tune)
  }

  function handleYouTubePick(link) {
    if (!link || !link.link) return
    const youtube = {
      title: link.title || '',
      link: link.link,
      startAt: '',
      endAt: '',
    }
    if (link.image) youtube.image = link.image
    setField('links', [youtube].concat(
      (Array.isArray(values.links) ? values.links : []).filter(function(item) {
        return !isYouTubeLink(item)
      })
    ))
    if (!title && link.title) setField('title', String(link.title))
    if (typeof props.onPickYouTube === 'function') props.onPickYouTube(link)
  }

  function clearYouTube() {
    setField('links', (Array.isArray(values.links) ? values.links : []).filter(function(item) {
      return !isYouTubeLink(item)
    }))
  }

  const canSearchComposer = !!(title && props.candidateId)

  return (
    <div className="add-tune-simple-form" data-testid="add-tune-simple-form">
      <Row>
        <Col md={7}>
          <Form.Group className="mb-3 add-tune-field-block">
            <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
              <Form.Label className="mb-0">Title</Form.Label>
              <CapitalizeTitleButton
                value={values.title || ''}
                onCapitalize={function(next) { setField('title', next) }}
              />
            </div>
            <InputGroup>
              <Form.Control
                value={values.title || ''}
                autoComplete="off"
                data-testid="add-tune-title"
                placeholder="Song title"
                onChange={function(e) { setField('title', e.target.value) }}
              />
              <FieldVoiceFillButton
                fieldKind="title"
                token={props.token}
                setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                onFill={function(text) { setField('title', text) }}
                data-testid="add-tune-title-mic"
              />
            </InputGroup>
          </Form.Group>

          <Form.Group className="mb-3 add-tune-field-block">
            <ComposerSearchButton
              candidateId={props.candidateId}
              title={values.title || ''}
              composer={values.artist || ''}
              titleHint={values.title || ''}
              token={props.token}
              tunebook={tunebook}
              resolverAvailable={props.resolverAvailable}
              disabled={!canSearchComposer}
              inline={true}
              pickWhenMultiple={true}
              skipArtistPicker={true}
              showSuggestionsChrome={false}
              existingArtists={artists}
              onComposer={function(result) {
                if (result && result.artist) {
                  setField('artist', result.artist)
                  scheduleYouTubeSearch(result.artist, artistsRef.current)
                }
              }}
              onComposerCandidates={function(names) {
                setComposerSuggestOptions(uniqueStrings(names || []))
              }}
              onPerformerCandidates={function(names) {
                setPerformerSuggestOptions(uniqueStrings(names || []))
              }}
            >
              {function(api) {
                return (
                  <>
                    <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                      <Form.Label className="mb-0">Composer</Form.Label>
                      {api.buttonGroup}
                    </div>
                    <SelectInput
                      value={values.artist || ''}
                      options={composerOptions}
                      placeholder={canSearchComposer
                        ? 'Composer'
                        : 'Enter a title, then Search'}
                      autoComplete="off"
                      data-testid="add-tune-composer"
                      onChange={function(val) { setField('artist', val) }}
                      onSelectOption={function(val) {
                        scheduleYouTubeSearch(val, artistsRef.current)
                      }}
                      onBlur={function() {
                        scheduleYouTubeSearch(values.artist, artistsRef.current)
                      }}
                      endAppend={
                        <FieldVoiceFillButton
                          fieldKind="composer"
                          token={props.token}
                          setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                          onFill={function(text) {
                            setField('artist', text)
                            scheduleYouTubeSearch(text, artistsRef.current)
                          }}
                          data-testid="add-tune-composer-mic"
                        />
                      }
                    />
                    {api.errorNode}
                    <div className="mt-3">
                      <TuneArtistsField
                        value={artists}
                        onChange={function(next) {
                          const prev = artistsRef.current || []
                          setField('artists', next)
                          const grew = Array.isArray(next) && next.length > prev.length
                          const hasComposer = !!String(values.artist || '').trim()
                          if (grew && !hasComposer) {
                            scheduleYouTubeSearch('', next)
                          }
                        }}
                        label="Artists"
                        placeholder="Type or pick a performer"
                        suggestOptions={performerSuggestOptions}
                      />
                    </div>
                  </>
                )
              }}
            </ComposerSearchButton>
          </Form.Group>

          {props.matchingBusy ? (
            <div className="mb-2">
              <Spinner animation="border" size="sm" aria-label="Matching" />
            </div>
          ) : null}

          <div className="mb-3 add-tune-books-tags">
            <div className="add-tune-inner-block">
              <div className="add-tune-label-control-row add-tune-label-control-row--tight">
                <Form.Label className="mb-0">Book(s)</Form.Label>
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
              </div>
            </div>
            <div className="add-tune-inner-block">
              <div className="add-tune-label-control-row add-tune-label-control-row--tight">
                <Form.Label className="mb-0">Tags</Form.Label>
                {tunebook ? (
                  <div className="d-flex align-items-center gap-2 flex-wrap">
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
                    {selectedTags.map(function(tag) {
                      return <Button key={tag} size="sm" variant="outline-info">{tag}</Button>
                    })}
                  </div>
                ) : (
                  <Form.Control
                    value={tagList}
                    placeholder="comma separated"
                    onChange={function(e) { setField('tagList', e.target.value) }}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="mb-3 add-tune-field-block">
            <AddTuneYouTubePicker
              selected={youtubeLink}
              searchQuery={youtubeSearchQuery}
              searchNonce={youtubeSearchNonce}
              setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
              onChange={handleYouTubePick}
              onClear={clearYouTube}
            />
          </div>
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
