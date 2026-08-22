import { useMemo, useRef, useState } from 'react'
import { Button, ButtonGroup, Col, Form, InputGroup, ListGroup, Row, Spinner } from 'react-bootstrap'
import { toast } from 'react-toastify'
import CapitalizeTitleButton from './CapitalizeTitleButton'
import FieldVoiceFillButton from './FieldVoiceFillButton'
import VoiceFillInput from './VoiceFillInput'
import BookSelectorModal from './BookSelectorModal'
import TagsSelectorModal from './TagsSelectorModal'
import SelectInput from './SelectInput'
import ComposerSearchButton from './ComposerSearchButton'
import AddTuneYouTubePicker from './AddTuneYouTubePicker'
import { findCollectionMatches, matchConfidenceLabel } from '../tuneCollectionMatch'
import { primaryArtist } from '../tuneBibliographicUtils'
import useMusicBrainzArtistOptions from '../useMusicBrainzArtistOptions'
import { isOwnedMediaLink } from '../linkRecording'
import { isPdfTuneFileType } from '../tuneFiles'
import { removeAddDraftTuneFile } from '../addFormAttach'
import { fetchArtistDiscography } from '../artistDiscographyClient'
import { fetchAlbumDiscography } from '../albumDiscographyClient'
import { formatBulkLine } from '../bulkListFormat'
import SearchResultPickerModal from './SearchResultPickerModal'

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

function isAddFormExternalMediaLink(link) {
  if (!link || !String(link.link || '').trim()) return false
  return !isOwnedMediaLink(link)
}

function buildYouTubeQuery(title, artist) {
  return [String(title || '').trim(), String(artist || '').trim()]
    .filter(Boolean)
    .join(' ')
    .trim()
}

/**
 * Slim Add page form: title, artist search, books/tags, media link.
 */
export default function AddTuneSimpleForm(props) {
  const values = props.values || {}
  const tunes = props.tunes || {}
  const tunebook = props.tunebook
  const title = String(values.title || '').trim()
  const artist = String(values.artist || '').trim()
  const musicBrainzArtist = useMusicBrainzArtistOptions(values.artist)
  const musicBrainzArtistOptions = musicBrainzArtist.options || []
  const [artistSuggestOptions, setArtistSuggestOptions] = useState([])
  const [youtubeSearchQuery, setYoutubeSearchQuery] = useState('')
  const [youtubeSearchNonce, setYoutubeSearchNonce] = useState(0)
  const [discographyBusy, setDiscographyBusy] = useState(false)
  const [discographyProgress, setDiscographyProgress] = useState('')
  const [albumDiscographyBusy, setAlbumDiscographyBusy] = useState(false)
  const [albumDiscographyProgress, setAlbumDiscographyProgress] = useState('')
  const [albumPickerCandidates, setAlbumPickerCandidates] = useState([])
  const [showAlbumPicker, setShowAlbumPicker] = useState(false)
  const [album, setAlbum] = useState('')
  const discographyAbortRef = useRef(null)

  const matches = useMemo(function() {
    return findCollectionMatches({
      title: values.title || '',
      artist: values.artist || '',
      tunes: tunes,
      limit: 8,
      importTune: {
        name: values.title || '',
        composer: values.artist || '',
        words: String(values.lyrics || '').split(/\r?\n/),
      },
    }) || []
  }, [values.title, values.artist, values.lyrics, tunes])

  const artistOptions = useMemo(function() {
    return uniqueStrings([].concat(artistSuggestOptions, musicBrainzArtistOptions))
  }, [artistSuggestOptions, musicBrainzArtistOptions])

  const bookList = String(values.bookList || '')
  const tagList = String(values.tagList || '')
  const primaryBook = bookList.split(',').map(function(part) {
    return part.trim()
  }).filter(Boolean)[0] || ''
  const selectedTags = tagList.split(',').map(function(part) {
    return part.trim()
  }).filter(Boolean)
  const selectedMediaLink = (Array.isArray(values.links) ? values.links : []).find(isAddFormExternalMediaLink) || null
  const mediaLinks = (Array.isArray(values.links) ? values.links : [])
    .map(function(link, index) { return { link: link, index: index } })
    .filter(function(entry) { return isOwnedMediaLink(entry.link) })
  const tuneFiles = Array.isArray(values.tuneFiles) ? values.tuneFiles : []

  function setField(key, value) {
    if (typeof props.onChange !== 'function') return
    props.onChange(function(current) {
      return Object.assign({}, current, { [key]: value })
    })
  }

  function scheduleYouTubeSearch(nextArtist) {
    const query = buildYouTubeQuery(
      values.title || title,
      nextArtist != null ? nextArtist : values.artist
    )
    if (!query) return
    setYoutubeSearchQuery(query)
    setYoutubeSearchNonce(function(n) { return n + 1 })
  }

  function openMatch(tune) {
    if (!tune || !tune.id) return
    if (typeof props.onOpenMatch === 'function') props.onOpenMatch(tune)
  }

  function handleMediaLinkPick(link) {
    if (!link || !link.link) return
    if (typeof props.onPickYouTube === 'function') {
      props.onPickYouTube(link)
      return
    }
    const mediaLink = {
      title: link.title || '',
      link: link.link,
      startAt: '',
      endAt: '',
    }
    if (link.image) mediaLink.image = link.image
    setField('links', [mediaLink].concat(
      (Array.isArray(values.links) ? values.links : []).filter(function(item) {
        return !isAddFormExternalMediaLink(item)
      })
    ))
    if (!title && link.title) setField('title', String(link.title))
  }

  function clearMediaLink() {
    setField('links', (Array.isArray(values.links) ? values.links : []).filter(function(item) {
      return !isAddFormExternalMediaLink(item)
    }))
  }

  function removeMediaLink(index) {
    const links = Array.isArray(values.links) ? values.links.slice() : []
    if (index < 0 || index >= links.length) return
    links.splice(index, 1)
    setField('links', links)
  }

  async function removeTuneFile(fileId) {
    if (!fileId) return
    const asTune = {
      id: props.tuneId || 'draft',
      tuneFiles: tuneFiles,
      activeFile: values.activeFile || '',
    }
    const next = await removeAddDraftTuneFile(asTune, fileId)
    if (typeof props.onChange !== 'function') return
    props.onChange(function(current) {
      return Object.assign({}, current, {
        tuneFiles: next.tuneFiles || [],
        activeFile: next.activeFile || '',
      })
    })
  }

  const canSearchArtist = !!(title && props.candidateId)
  const albumName = String(album || '').trim()

  function fillBulkImportLines(lines) {
    if (!lines || !lines.length) return
    if (typeof props.onFillBulkDiscography === 'function') {
      props.onFillBulkDiscography(lines)
    }
  }

  async function handleDiscography() {
    if (!artist || discographyBusy) return
    if (discographyAbortRef.current) {
      discographyAbortRef.current.abort()
    }
    const controller = new AbortController()
    discographyAbortRef.current = controller
    setDiscographyBusy(true)
    setDiscographyProgress('Looking up artist…')
    try {
      const result = await fetchArtistDiscography(artist, {
        signal: controller.signal,
        onProgress: function(message) {
          setDiscographyProgress(String(message || '').trim())
        },
      })
      const artistLabel = String(result.artistName || artist).trim()
      const lines = (result.titles || []).map(function(songTitle) {
        return formatBulkLine({ title: songTitle, artist: artistLabel })
      })
      if (!lines.length) {
        toast.info('No songs found in that artist discography.')
        return
      }
      fillBulkImportLines(lines)
      toast.success('Loaded ' + lines.length + ' song' + (lines.length === 1 ? '' : 's') + ' into bulk import.')
    } catch (e) {
      if (e && e.name === 'AbortError') return
      toast.error((e && e.message) || 'Could not look up discography.')
    } finally {
      if (discographyAbortRef.current === controller) {
        discographyAbortRef.current = null
      }
      setDiscographyBusy(false)
      setDiscographyProgress('')
    }
  }

  function applyAlbumTrackLines(result) {
    const artistLabel = String(result.artistName || artist || '').trim()
    const lines = (result.titles || []).map(function(songTitle) {
      return formatBulkLine({
        title: songTitle,
        artist: artistLabel,
      })
    })
    if (!lines.length) {
      toast.info('No tracks found for that album.')
      return
    }
    fillBulkImportLines(lines)
    toast.success('Loaded ' + lines.length + ' track' + (lines.length === 1 ? '' : 's') + ' into bulk import.')
  }

  function albumPickerItems(candidates) {
    return (candidates || []).map(function(candidate) {
      const albumLine = candidate.label || candidate.albumName || ''
      const metaParts = []
      if (candidate.artistName) metaParts.push(String(candidate.artistName).trim())
      if (candidate.matchType) metaParts.push(String(candidate.matchType))
      if (candidate.confidence && candidate.confidence !== 'high') metaParts.push(candidate.confidence)
      return {
        title: albumLine,
        artist: candidate.artistName || '',
        matchType: metaParts.join(' · '),
        candidate: candidate,
      }
    })
  }

  async function loadAlbumTracks(candidate, controller) {
    const result = await fetchAlbumDiscography(albumName, artist, {
      signal: controller.signal,
      candidate: candidate,
      onProgress: function(message) {
        setAlbumDiscographyProgress(String(message || '').trim())
      },
    })
    applyAlbumTrackLines(result)
  }

  async function handleAlbumDiscography() {
    if (!albumName || albumDiscographyBusy || discographyBusy) return
    if (discographyAbortRef.current) {
      discographyAbortRef.current.abort()
    }
    const controller = new AbortController()
    discographyAbortRef.current = controller
    setAlbumDiscographyBusy(true)
    setAlbumDiscographyProgress('Looking up album…')
    setShowAlbumPicker(false)
    setAlbumPickerCandidates([])
    try {
      const result = await fetchAlbumDiscography(albumName, artist, {
        signal: controller.signal,
        onProgress: function(message) {
          setAlbumDiscographyProgress(String(message || '').trim())
        },
      })
      if (result.needsPicker && Array.isArray(result.candidates) && result.candidates.length) {
        setAlbumPickerCandidates(result.candidates)
        setShowAlbumPicker(true)
        return
      }
      applyAlbumTrackLines(result)
    } catch (e) {
      if (e && e.name === 'AbortError') return
      toast.error((e && e.message) || 'Could not look up album tracks.')
    } finally {
      if (discographyAbortRef.current === controller) {
        discographyAbortRef.current = null
      }
      setAlbumDiscographyBusy(false)
      setAlbumDiscographyProgress('')
    }
  }

  async function handleAlbumPickerSelect(item) {
    if (!item || !item.candidate) return
    setShowAlbumPicker(false)
    setAlbumPickerCandidates([])
    if (discographyAbortRef.current) {
      discographyAbortRef.current.abort()
    }
    const controller = new AbortController()
    discographyAbortRef.current = controller
    setAlbumDiscographyBusy(true)
    setAlbumDiscographyProgress('Loading album tracks…')
    try {
      await loadAlbumTracks(item.candidate, controller)
    } catch (e) {
      if (e && e.name === 'AbortError') return
      toast.error((e && e.message) || 'Could not look up album tracks.')
    } finally {
      if (discographyAbortRef.current === controller) {
        discographyAbortRef.current = null
      }
      setAlbumDiscographyBusy(false)
      setAlbumDiscographyProgress('')
    }
  }

  return (
    <div className="add-tune-simple-form" data-testid="add-tune-simple-form">
      <Form.Group className="mb-3 add-tune-field-block add-tune-title-block">
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

      <Row>
        <Col md={7}>
          <Form.Group className="mb-3 add-tune-field-block">
            <div className="d-flex align-items-center justify-content-between gap-2 mb-2 flex-wrap">
              <span className="small text-muted mb-0">Artist</span>
            <div className="d-flex flex-column align-items-end gap-1">
              <Button
                variant="outline-primary"
                size="sm"
                disabled={!artist || discographyBusy || albumDiscographyBusy}
                data-testid="add-tune-discography"
                title={discographyBusy ? (discographyProgress || 'Looking up discography…') : 'Load this artist\'s discography into bulk import'}
                onClick={handleDiscography}
              >
                {discographyBusy ? (
                  <Spinner animation="border" size="sm" className="me-1" aria-hidden="true" />
                ) : null}
                Discography
              </Button>
              {discographyBusy && discographyProgress ? (
                <span
                  className="small text-muted text-end"
                  data-testid="add-tune-discography-progress"
                  role="status"
                >
                  {discographyProgress}
                </span>
              ) : null}
            </div>
            </div>
            <ComposerSearchButton
              candidateId={props.candidateId}
              title={values.title || ''}
              composer={values.artist || ''}
              titleHint={values.title || ''}
              token={props.token}
              tunebook={tunebook}
              resolverAvailable={props.resolverAvailable}
              disabled={!canSearchArtist}
              inline={true}
              pickWhenMultiple={true}
              skipArtistPicker={true}
              onComposer={function(result) {
                if (result && result.artist) {
                  setField('artist', result.artist)
                  scheduleYouTubeSearch(result.artist)
                }
              }}
              onComposerCandidates={function(names) {
                setArtistSuggestOptions(uniqueStrings(names || []))
              }}
            >
              {function(api) {
                const suggestLoading = !!(api && api.busy) || !!musicBrainzArtist.loading
                return (
                  <>
                    <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                      <Form.Label className="mb-0">Artist</Form.Label>
                      {api.buttonGroup}
                    </div>
                    <SelectInput
                      value={values.artist || ''}
                      options={artistOptions}
                      loading={suggestLoading}
                      placeholder={canSearchArtist
                        ? 'Artist'
                        : 'Enter a title, then Search'}
                      autoComplete="off"
                      data-testid="add-tune-composer"
                      onChange={function(val) { setField('artist', val) }}
                      onSelectOption={function(val) {
                        scheduleYouTubeSearch(val)
                      }}
                      onBlur={function() {
                        scheduleYouTubeSearch(values.artist)
                      }}
                      endAppend={
                        <FieldVoiceFillButton
                          fieldKind="composer"
                          token={props.token}
                          setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                          onFill={function(text) {
                            setField('artist', text)
                            scheduleYouTubeSearch(text)
                          }}
                          data-testid="add-tune-composer-mic"
                        />
                      }
                    />
                    {api.errorNode}
                  </>
                )
              }}
            </ComposerSearchButton>
          </Form.Group>

          <Form.Group className="mb-3 add-tune-field-block">
            <div className="d-flex align-items-center justify-content-between gap-2 mb-2 flex-wrap">
              <span className="small text-muted mb-0">Album</span>
              <div className="d-flex flex-column align-items-end gap-1">
                <Button
                  variant="outline-primary"
                  size="sm"
                  disabled={!albumName || albumDiscographyBusy || discographyBusy}
                  data-testid="add-tune-album-discography"
                  title={
                    albumDiscographyBusy
                      ? (albumDiscographyProgress || 'Looking up album tracks…')
                      : 'Find this album by name and load its track list into bulk import'
                  }
                  onClick={handleAlbumDiscography}
                >
                  {albumDiscographyBusy ? (
                    <Spinner animation="border" size="sm" className="me-1" aria-hidden="true" />
                  ) : null}
                  Load tracks
                </Button>
                {albumDiscographyBusy && albumDiscographyProgress ? (
                  <span
                    className="small text-muted text-end"
                    data-testid="add-tune-album-discography-progress"
                    role="status"
                  >
                    {albumDiscographyProgress}
                  </span>
                ) : null}
              </div>
            </div>
            <Form.Control
              value={album}
              autoComplete="off"
              data-testid="add-tune-album"
              placeholder="Album name (not saved on the tune)"
              onChange={function(e) { setAlbum(e.target.value) }}
            />
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
                  <VoiceFillInput
                    value={bookList}
                    placeholder="comma separated"
                    onChange={function(e) { setField('bookList', e.target.value) }}
                    fieldKind="search"
                    token={props.token}
                    setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
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
                  <VoiceFillInput
                    value={tagList}
                    placeholder="comma separated"
                    onChange={function(e) { setField('tagList', e.target.value) }}
                    fieldKind="search"
                    token={props.token}
                    setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                  />
                )}
              </div>
            </div>
          </div>

          {tuneFiles.length > 0 ? (
            <div className="mb-3 add-tune-field-block" data-testid="add-tune-files-block">
              <Form.Label className="mb-1">Files</Form.Label>
              <ListGroup>
                {tuneFiles.map(function(file) {
                  if (!file || !file.id) return null
                  const kind = isPdfTuneFileType(file.type) ? 'PDF' : 'Image'
                  return (
                    <ListGroup.Item
                      key={file.id}
                      className="d-flex justify-content-between align-items-center gap-2 py-2"
                    >
                      <div style={{ minWidth: 0 }}>
                        <div className="text-truncate">{file.name || 'File'}</div>
                        <div className="text-muted small">{kind} · local only</div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        data-testid="add-tune-remove-file"
                        onClick={function() { removeTuneFile(file.id) }}
                      >
                        Remove
                      </Button>
                    </ListGroup.Item>
                  )
                })}
              </ListGroup>
            </div>
          ) : null}

          {mediaLinks.length > 0 ? (
            <div className="mb-3 add-tune-field-block" data-testid="add-tune-media-block">
              <Form.Label className="mb-1">Audio / video</Form.Label>
              <ListGroup>
                {mediaLinks.map(function(entry) {
                  const link = entry.link || {}
                  const kind = link.mediaKind === 'video' || link.source === 'video-file'
                    ? 'Video'
                    : 'Audio'
                  return (
                    <ListGroup.Item
                      key={(link.recordingId || link.link || entry.index) + '-' + entry.index}
                      className="d-flex justify-content-between align-items-center gap-2 py-2"
                    >
                      <div style={{ minWidth: 0 }}>
                        <div className="text-truncate">{link.title || 'Recording'}</div>
                        <div className="text-muted small">{kind} · local only</div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        data-testid="add-tune-remove-media"
                        onClick={function() { removeMediaLink(entry.index) }}
                      >
                        Remove
                      </Button>
                    </ListGroup.Item>
                  )
                })}
              </ListGroup>
            </div>
          ) : null}

          {props.addFromToolbar ? (
            <div className="mb-3 add-tune-field-block" data-testid="add-from-in-form">
              {props.addFromToolbar}
            </div>
          ) : null}

          <div className="mb-3 add-tune-field-block">
            <AddTuneYouTubePicker
              selected={selectedMediaLink}
              searchQuery={youtubeSearchQuery}
              searchNonce={youtubeSearchNonce}
              setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
              token={props.token}
              login={props.login}
              onChange={handleMediaLinkPick}
              onClear={clearMediaLink}
            />
          </div>
        </Col>

        <Col md={5}>
          <div className="border rounded p-2" data-testid="add-tune-matches">
            <strong className="d-block mb-2">Already In Your Library</strong>
            {!matches.length ? (
              <div className="text-muted small">Type a title or artist to find existing tunes.</div>
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

      <SearchResultPickerModal
        show={showAlbumPicker}
        title="Choose album"
        items={albumPickerItems(albumPickerCandidates)}
        comment="Multiple albums matched this name. Pick the one you want before loading tracks."
        emptyMessage="No albums found."
        onSelect={handleAlbumPickerSelect}
        onHide={function() {
          setShowAlbumPicker(false)
          setAlbumPickerCandidates([])
        }}
      />
    </div>
  )
}
