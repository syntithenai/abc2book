import {useRef, useState} from 'react'
import {Button, ButtonGroup, Dropdown, Form, Modal, Tabs, Tab, ListGroup} from 'react-bootstrap'
import { toast } from 'react-toastify'
import BulkChangeValueModal from './BulkChangeValueModal'
import BulkCheckModal from './BulkCheckModal'
import BulkSearchModal from './BulkSearchModal'
import BulkComposerDiscoveryModal from './BulkComposerDiscoveryModal'
import TuneDownloadDropdown from './TuneDownloadMenu'
import { MediaCacheQueueTriggerButton } from './MediaCacheQueueModal'
import { StemCreateQueueTriggerButton } from './StemCreateQueueModal'
import useMediaCacheQueue from '../useMediaCacheQueue'
import useStemCreateQueue from '../useStemCreateQueue'
import { isStemsDownloadDisabled } from '../tuneDownloadActions'
import { getMediaResolverHealthState } from '../mediaResolverHealthStore'
import {savePerformanceSet} from '../performanceSetStore'
import {savePlaylistFromQueue} from '../savedPlaylistsStore'
import {createQueue} from '../nowPlayingQueue'
import {
  isMediaCacheLocked,
  setMediaCacheLockForTunes,
} from '../mediaCacheLock'
import {Link, useNavigate} from 'react-router-dom'

function BulkOpsButton({icon, label, className, children, ...buttonProps}) {
  const classes = ['bulk-ops-action-btn']
  if (className) classes.push(className)
  return (
    <Button
      className={classes.join(' ')}
      aria-label={label}
      title={label}
      {...buttonProps}
    >
      {icon}
      <span className="bulk-ops-btn-label">{children || label}</span>
    </Button>
  )
}

function BulkOpsSearchBox({icons, id, value, onChange, placeholder}) {
  return (
    <div className="bulk-ops-search">
      <span className="bulk-ops-search-icon" aria-hidden="true">{icons.search}</span>
      <Form.Control
        id={id}
        type="search"
        className="bulk-ops-search-input"
        value={value}
        placeholder={placeholder}
        onChange={function(e) { onChange(e.target.value) }}
      />
      {value ? (
        <Button
          type="button"
          variant="link"
          className="bulk-ops-search-clear"
          aria-label="Clear search"
          title="Clear search"
          onClick={function() { onChange('') }}
        >
          {icons.closecircle}
        </Button>
      ) : null}
    </div>
  )
}

function clearFilterTimeout(timeoutRef) {
  if (timeoutRef.current) {
    clearTimeout(timeoutRef.current)
    timeoutRef.current = null
  }
}

function applyFilterChange(value, setFilter, setResults, getDefaultResults, searchResults, timeoutRef) {
  setFilter(value.toLowerCase())
  clearFilterTimeout(timeoutRef)
  if (value.trim() === '') {
    setResults(getDefaultResults())
    return
  }
  timeoutRef.current = setTimeout(function() {
    timeoutRef.current = null
    setResults(searchResults(value))
  }, 500)
}

export default function SelectedItemsModal(props) {
  const icons = props.tunebook.icons
  const navigate = useNavigate()
  const [show, setShow] = useState(false)
  const mediaCacheQueue = useMediaCacheQueue()
  const stemCreateQueue = useStemCreateQueue()
  const [filterAdd, setFilterAdd] = useState('')
  const [filterRemove, setFilterRemove] = useState('')
  const [options, setOptions] = useState(props.defaultOptions())
  const [filterAddTag, setFilterAddTag] = useState('')
  const [filterRemoveTag, setFilterRemoveTag] = useState('')
  const [tagOptions, setTagOptions] = useState(props.defaultTagOptions())

  const filterAddTimeoutRef = useRef(null)
  const filterRemoveTimeoutRef = useRef(null)
  const filterAddTagTimeoutRef = useRef(null)
  const filterRemoveTagTimeoutRef = useRef(null)

  const handleClose = function() {
    setShow(false)
  }

  const handleShow = function() {
    clearFilterTimeout(filterAddTimeoutRef)
    clearFilterTimeout(filterRemoveTimeoutRef)
    clearFilterTimeout(filterAddTagTimeoutRef)
    clearFilterTimeout(filterRemoveTagTimeoutRef)
    setShow(true)
    setFilterAdd('')
    setFilterRemove('')
    setFilterAddTag('')
    setFilterRemoveTag('')
    setOptions(props.defaultOptions())
    setTagOptions(props.defaultTagOptions())
  }

  function filterAddTagChange(value) {
    applyFilterChange(
      value,
      setFilterAddTag,
      setTagOptions,
      props.defaultTagOptions,
      props.searchTagOptions,
      filterAddTagTimeoutRef
    )
  }

  function filterRemoveTagChange(value) {
    applyFilterChange(
      value,
      setFilterRemoveTag,
      setTagOptions,
      props.defaultTagOptions,
      props.searchTagOptions,
      filterRemoveTagTimeoutRef
    )
  }

  function newTag() {
    if (filterAddTag && filterAddTag.trim()) {
      if (window.confirm('Are you sure that you want to add the tag ' + filterAddTag + ' to all the ' + props.selectedCount + ' selected tunes?')) {
        var currentSelection = Object.keys(props.selected).filter(function(item) {
          return (props.selected[item] ? true : false)
        })
        props.tunebook.indexes.addTagToIndex(filterAddTag)
        props.tunebook.addTunesToTag(currentSelection, filterAddTag)
        setFilterAddTag('')
        setFilterRemoveTag('')
        setTagOptions(props.defaultTagOptions())
        props.forceRefresh()
        handleClose()
      }
    }
  }

  function clickAddTagOption(option) {
    if (option && option.trim()) {
      if (window.confirm('Are you sure that you want to add the tag ' + option + ' to all the ' + props.selectedCount + ' selected tunes ?')) {
        var currentSelection = Object.keys(props.selected).filter(function(item) {
          return (props.selected[item] ? true : false)
        })
        props.tunebook.addTunesToTag(currentSelection, option)
        setFilterAdd('')
        setFilterRemove('')
        props.forceRefresh()
        handleClose()
      }
    }
  }

  function clickRemoveTagOption(option) {
    if (option && option.trim()) {
      if (window.confirm('Are you sure that you want to remove the tag ' + option + ' from all the ' + props.selectedCount + ' selected tunes ?')) {
        var currentSelection = Object.keys(props.selected).filter(function(item) {
          return (props.selected[item] ? true : false)
        })
        props.tunebook.removeTunesFromTag(currentSelection, option)
        setFilterAdd('')
        setFilterRemove('')
        props.forceRefresh()
        handleClose()
      }
    }
  }

  function filterAddChange(value) {
    applyFilterChange(
      value,
      setFilterAdd,
      setOptions,
      props.defaultOptions,
      props.searchOptions,
      filterAddTimeoutRef
    )
  }

  function filterRemoveChange(value) {
    applyFilterChange(
      value,
      setFilterRemove,
      setOptions,
      props.defaultOptions,
      props.searchOptions,
      filterRemoveTimeoutRef
    )
  }

  function newBook() {
    if (filterAdd && filterAdd.trim()) {
      if (window.confirm('Are you sure that you want to add all the selected tunes to the new book  ' + filterAdd + ' ?')) {
        var currentSelection = Object.keys(props.selected).filter(function(item) {
          return (props.selected[item] ? true : false)
        })
        props.tunebook.indexes.addBookToIndex(filterAdd)
        props.tunebook.addTunesToBook(currentSelection, filterAdd)
        setFilterAdd('')
        setFilterRemove('')
        setOptions(props.defaultOptions())
        props.forceRefresh()
        handleClose()
      }
    }
  }

  function clickAddOption(option) {
    if (option && option.trim()) {
      if (window.confirm('Are you sure that you want to add all the selected tunes to the book ' + option + ' ?')) {
        var currentSelection = Object.keys(props.selected).filter(function(item) {
          return (props.selected[item] ? true : false)
        })
        props.tunebook.addTunesToBook(currentSelection, option)
        setFilterAdd('')
        setFilterRemove('')
        props.forceRefresh()
        handleClose()
      }
    }
  }

  function clickRemoveOption(option) {
    if (option && option.trim()) {
      if (window.confirm('Are you sure that you want to remove all the selected tunes from the book ' + option + ' ?')) {
        var currentSelection = Object.keys(props.selected).filter(function(item) {
          return (props.selected[item] ? true : false)
        })
        props.tunebook.removeTunesFromBook(currentSelection, option)
        setFilterAdd('')
        setFilterRemove('')
        props.forceRefresh()
        handleClose()
      }
    }
  }

  function clickDelete() {
    if (window.confirm('Are you sure that you want to delete all the ' + props.selectedCount + ' selected tunes?')) {
      var currentSelection = Object.keys(props.selected).filter(function(item) {
        return (props.selected[item] ? true : false)
      })
      props.tunebook.deleteTunes(currentSelection)
      props.setSelected({})
      props.setSelectedCount(0)
      handleClose()
      props.forceRefresh()
    }
  }

  function selectedTunes() {
    return props.tunebook.fromSelection(props.selected)
  }

  function currentSelectionIds() {
    return Object.keys(props.selected).filter(function(item) {
      return props.selected[item] ? true : false
    })
  }

  function handleBulkBlockFromPractice() {
    if (!window.confirm('Block all ' + props.selectedCount + ' selected tunes from practice sessions?')) return
    props.tunebook.bulkChangeTunes(currentSelectionIds(), 'suitableForPractice', false)
    props.forceRefresh()
    handleClose()
  }

  function handleBulkUnblockFromPractice() {
    if (!window.confirm('Unblock all ' + props.selectedCount + ' selected tunes for practice sessions?')) return
    props.tunebook.bulkChangeTunes(currentSelectionIds(), 'suitableForPractice', true)
    props.forceRefresh()
    handleClose()
  }

  function handleBulkCache() {
    const tunes = selectedTunes()
    mediaCacheQueue.enqueueTunesCacheJobs(tunes, {
      utils: props.tunebook.utils,
      accessToken: props.token && props.token.access_token ? props.token.access_token : null,
    })
    mediaCacheQueue.start()
  }

  function handleBulkStems() {
    const tunes = selectedTunes()
    const health = getMediaResolverHealthState()
    stemCreateQueue.enqueueTunesStemCreateJobs(tunes, {
      utils: props.tunebook.utils,
      accessToken: props.token && props.token.access_token ? props.token.access_token : null,
      demucsModel: health.status && health.status.demucsModel ? health.status.demucsModel : 'htdemucs',
    })
    stemCreateQueue.start()
  }

  function handleClearSelectedCaches(kind) {
    const allTuneIds = selectedTuneIds()
    if (!allTuneIds.length) return
    const selected = selectedTunes()
    const lockedTuneIds = {}
    selected.forEach(function(tune) {
      if (isMediaCacheLocked(tune)) lockedTuneIds[tune.id] = true
    })
    const clearOptions = {
      respectLock: true,
      lockedTuneIds: lockedTuneIds,
    }
    const skippedLocked = allTuneIds.filter(function(tuneId) {
      return lockedTuneIds[tuneId]
    }).length
    const utils = props.tunebook.utils
    let clearPromise
    if (kind === 'audio') {
      clearPromise = utils.clearDownloadedAudioCacheForTunes(allTuneIds, clearOptions)
    } else if (kind === 'stems') {
      clearPromise = utils.clearStemsCacheForTunes(allTuneIds, clearOptions)
    } else if (kind === 'midi') {
      clearPromise = utils.clearMidiCacheForTunes(allTuneIds)
    } else {
      clearPromise = utils.clearAudioAndStemsCacheForTunes(allTuneIds, clearOptions)
    }
    Promise.resolve(clearPromise).then(function(result) {
      let detail
      if (kind === 'both' && result && result.audio && result.stems) {
        const audioRemoved = result.audio.removed || 0
        const stemsRemoved = result.stems.removed || 0
        detail = 'Removed ' + audioRemoved + ' audio and ' + stemsRemoved + ' stem cache entr' + ((audioRemoved + stemsRemoved) === 1 ? 'y' : 'ies') + ' for selected tunes.'
      } else {
        const removed = result && result.removed != null ? result.removed : 0
        const label = kind === 'stems' ? 'stem' : (kind === 'midi' ? 'MIDI' : 'audio')
        detail = 'Removed ' + removed + ' ' + label + ' cache entr' + (removed === 1 ? 'y' : 'ies') + ' for selected tunes.'
      }
      if (skippedLocked > 0 && kind !== 'midi') {
        detail += ' Skipped ' + skippedLocked + ' locked tune' + (skippedLocked === 1 ? '' : 's') + '.'
      }
      toast.success(detail)
    }).catch(function() {
      toast.error('Could not clear cache for selected tunes.')
    })
  }

  function handleBulkCacheLock(locked) {
    const tunes = selectedTunes()
    if (!tunes.length) return
    setMediaCacheLockForTunes(props.tunebook, tunes, locked)
    props.forceRefresh()
  }

  function selectedTuneIds() {
    return Object.keys(props.selected).filter(function(item) {
      return props.selected[item] ? true : false
    })
  }

  function createSetlistFromSelected() {
    var tuneIds = selectedTuneIds()
    if (!tuneIds.length) return
    var defaultName = 'New set'
    var name = window.prompt(
      'Name for the new setlist with ' + tuneIds.length + ' tune' + (tuneIds.length === 1 ? '' : 's') + ':',
      defaultName
    )
    if (name === null) return
    name = String(name).trim() || defaultName
    var saved = savePerformanceSet({
      name: name,
      date: new Date().toISOString().slice(0, 10),
      notes: '',
      items: tuneIds.map(function(tuneId) {
        return { type: 'tune', tuneId: tuneId }
      }),
    })
    handleClose()
    navigate('/sets/' + encodeURIComponent(saved.id))
  }

  function createPlaylistFromSelected() {
    var tuneIds = selectedTuneIds()
    if (!tuneIds.length) return
    var defaultName = 'Playlist'
    var name = window.prompt(
      'Name for the new playlist with ' + tuneIds.length + ' tune' + (tuneIds.length === 1 ? '' : 's') + ':',
      defaultName
    )
    if (name === null) return
    name = String(name).trim() || defaultName
    var queue = createQueue({
      tuneIds: tuneIds,
      name: name,
      source: 'selection',
    })
    var saved = savePlaylistFromQueue(queue, { name: name })
    if (saved) {
      queue.savedPlaylistId = saved.id
      queue.name = saved.name
    }
    if (props.tunebook.startNowPlayingQueue) {
      props.tunebook.startNowPlayingQueue(queue, navigate, {
        startPlayback: true,
        mediaController: props.mediaController,
      })
    } else if (props.setNowPlayingQueue) {
      props.setNowPlayingQueue(queue)
    }
    handleClose()
  }

  var sortedOptions = Object.keys(options)
  sortedOptions.sort(function(a, b) { if (a > b) return 1; else return -1 })
  var sortedTagOptions = Object.keys(tagOptions)
  sortedTagOptions.sort(function(a, b) { if (a > b) return 1; else return -1 })

  return (
    <>
      <Button variant="secondary" onClick={handleShow} aria-label="Bulk actions" title="Bulk actions">
        {icons.dropdown}
      </Button>

      <Modal show={show} onHide={handleClose} fullscreen dialogClassName="bulk-ops-modal">
        <Modal.Header closeButton>
          <Modal.Title>With {props.selectedCount} selected tunes ..</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="bulk-ops-toolbar">
            <div className="bulk-ops-toolbar-block bulk-ops-tools-block">
              <BulkChangeValueModal
                forceRefresh={props.forceRefresh}
                tunebook={props.tunebook}
                onClose={handleClose}
                selected={props.selected}
                selectedCount={props.selectedCount}
              />
              <BulkOpsButton as={Link} to="/print" variant="primary" icon={icons.printer} label="Print" />
              <BulkCheckModal
                tunebook={props.tunebook}
                selected={props.selected}
                selectedCount={props.selectedCount}
                forceRefresh={props.forceRefresh}
                token={props.token}
                autoStartCheck={false}
              />
              <BulkSearchModal
                tunebook={props.tunebook}
                selected={props.selected}
                selectedCount={props.selectedCount}
                token={props.token}
              />
              <BulkComposerDiscoveryModal
                tunebook={props.tunebook}
                selected={props.selected}
                selectedCount={props.selectedCount}
                token={props.token}
              />
            </div>
            <div className="bulk-ops-toolbar-block bulk-ops-practice-block">
              <span className="bulk-ops-toolbar-block-title">Practice</span>
              <ButtonGroup className="bulk-ops-practice-btn-group" aria-label="Block tunes from practice">
                <BulkOpsButton
                  variant="warning"
                  icon={icons.lock}
                  label="Block from practice"
                  onClick={handleBulkBlockFromPractice}
                >
                  Block
                </BulkOpsButton>
                <BulkOpsButton
                  variant="success"
                  icon={icons.unlock}
                  label="Unblock for practice"
                  onClick={handleBulkUnblockFromPractice}
                >
                  Unblock
                </BulkOpsButton>
              </ButtonGroup>
            </div>
            <div className="bulk-ops-toolbar-block bulk-ops-cache-block">
                <span className="bulk-ops-toolbar-block-title">Cache</span>
                <ButtonGroup className="bulk-ops-cache-btn-group" aria-label="Cache operations">
                  <MediaCacheQueueTriggerButton
                    tunebook={props.tunebook}
                    label="Save"
                    variant="primary"
                    pendingCount={mediaCacheQueue.pendingCount}
                    onClick={handleBulkCache}
                  />
                  <Dropdown as={ButtonGroup} className="bulk-ops-clear-cache-dropdown">
                    <Dropdown.Toggle
                      variant="warning"
                      className="bulk-ops-action-btn"
                      id="bulk-ops-clear-cache"
                      aria-label="Clear cache for selected tunes"
                      title="Clear cache for selected tunes"
                    >
                      {icons.deletebin}
                      <span className="bulk-ops-btn-label">Clear</span>
                    </Dropdown.Toggle>
                    <Dropdown.Menu>
                      <Dropdown.Item onClick={function() { handleClearSelectedCaches('audio') }}>
                        Clear Audio cache
                      </Dropdown.Item>
                      <Dropdown.Item onClick={function() { handleClearSelectedCaches('stems') }}>
                        Clear Stem cache
                      </Dropdown.Item>
                      <Dropdown.Item onClick={function() { handleClearSelectedCaches('midi') }}>
                        Clear MIDI cache
                      </Dropdown.Item>
                      <Dropdown.Divider />
                      <Dropdown.Item onClick={function() { handleClearSelectedCaches('both') }}>
                        Clear Audio and Stem cache
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown>
                  <BulkOpsButton
                    variant="secondary"
                    icon={icons.lock}
                    label="Lock cache"
                    onClick={function() { handleBulkCacheLock(true) }}
                  >
                    Lock
                  </BulkOpsButton>
                  <BulkOpsButton
                    variant="secondary"
                    icon={icons.unlock}
                    label="Unlock cache"
                    onClick={function() { handleBulkCacheLock(false) }}
                  >
                    Unlock
                  </BulkOpsButton>
                </ButtonGroup>
              </div>
              <div className="bulk-ops-toolbar-block bulk-ops-create-block">
                <span className="bulk-ops-toolbar-block-title">Create</span>
                <ButtonGroup className="bulk-ops-create-btn-group" aria-label="Create from selection">
                  <BulkOpsButton
                    variant="success"
                    icon={icons.playlist}
                    label="Create setlist"
                    onClick={createSetlistFromSelected}
                  >
                    Set List
                  </BulkOpsButton>
                  <BulkOpsButton
                    variant="success"
                    icon={icons.playlist}
                    label="Create playlist"
                    onClick={createPlaylistFromSelected}
                  >
                    Play List
                  </BulkOpsButton>
                  <StemCreateQueueTriggerButton
                    tunebook={props.tunebook}
                    label="Stems"
                    variant="success"
                    pendingCount={stemCreateQueue.pendingCount}
                    disabled={isStemsDownloadDisabled(selectedTunes(), props.tunebook)}
                    onClick={handleBulkStems}
                  />
                </ButtonGroup>
              </div>
            <div className="bulk-ops-toolbar-block bulk-ops-download-block">
              <TuneDownloadDropdown
                tunebook={props.tunebook}
                tunes={selectedTunes()}
                archiveBaseName="selected"
                token={props.token}
                onComplete={handleClose}
              />
              <BulkOpsButton variant="danger" icon={icons.deletebin} label="Delete" onClick={clickDelete} />
            </div>
          </div>

          <Tabs defaultActiveKey="addbook" className="bulk-ops-tabs">
            <Tab eventKey="addbook" title="Add Book">
              <div className="bulk-ops-tab-panel">
                <div className="bulk-ops-tab-toolbar">
                  <BulkOpsSearchBox
                    icons={icons}
                    id="bulk-ops-filter-add-book"
                    value={filterAdd}
                    onChange={filterAddChange}
                    placeholder="Search books"
                  />
                  {(props.allowNew !== false) && (
                    <BulkOpsButton
                      key="newbook"
                      variant="primary"
                      icon={icons.fileadd}
                      label="New Book"
                      onClick={newBook}
                    />
                  )}
                </div>
                <ListGroup className="bulk-ops-list">
                  {sortedOptions.map(function(option, tk) {
                    return (
                      <ListGroup.Item
                        key={tk}
                        className={(tk % 2 === 0) ? 'even' : 'odd'}
                        onClick={function() { clickAddOption(options[option]) }}
                      >
                        {options[option]}
                      </ListGroup.Item>
                    )
                  })}
                </ListGroup>
              </div>
            </Tab>
            <Tab eventKey="removebook" title="Remove Book">
              <div className="bulk-ops-tab-panel">
                <div className="bulk-ops-tab-toolbar">
                  <BulkOpsSearchBox
                    icons={icons}
                    id="bulk-ops-filter-remove-book"
                    value={filterRemove}
                    onChange={filterRemoveChange}
                    placeholder="Search books"
                  />
                  <BulkOpsButton
                    variant="success"
                    icon={icons.closecircle}
                    label="Remove"
                    onClick={function() { clickRemoveOption(filterRemove) }}
                  />
                </div>
                <ListGroup className="bulk-ops-list">
                  {sortedOptions.map(function(option, tk) {
                    return (
                      <ListGroup.Item
                        key={tk}
                        className={(tk % 2 === 0) ? 'even' : 'odd'}
                        onClick={function() { clickRemoveOption(options[option]) }}
                      >
                        {options[option]}
                      </ListGroup.Item>
                    )
                  })}
                </ListGroup>
              </div>
            </Tab>
            <Tab eventKey="addtag" title="Add Tag">
              <div className="bulk-ops-tab-panel">
                <div className="bulk-ops-tab-toolbar">
                  <BulkOpsSearchBox
                    icons={icons}
                    id="bulk-ops-filter-add-tag"
                    value={filterAddTag}
                    onChange={filterAddTagChange}
                    placeholder="Search tags"
                  />
                  {(props.allowNew !== false) && (
                    <BulkOpsButton
                      key="newtag"
                      variant="primary"
                      icon={icons.add}
                      label="New Tag"
                      onClick={newTag}
                    />
                  )}
                </div>
                <ListGroup className="bulk-ops-list">
                  {sortedTagOptions.map(function(option, tk) {
                    return (
                      <ListGroup.Item
                        key={tk}
                        className={(tk % 2 === 0) ? 'even' : 'odd'}
                        onClick={function() { clickAddTagOption(tagOptions[option]) }}
                      >
                        {tagOptions[option]}
                      </ListGroup.Item>
                    )
                  })}
                </ListGroup>
              </div>
            </Tab>
            <Tab eventKey="removetag" title="Remove Tag">
              <div className="bulk-ops-tab-panel">
                <div className="bulk-ops-tab-toolbar">
                  <BulkOpsSearchBox
                    icons={icons}
                    id="bulk-ops-filter-remove-tag"
                    value={filterRemoveTag}
                    onChange={filterRemoveTagChange}
                    placeholder="Search tags"
                  />
                  <BulkOpsButton
                    variant="success"
                    icon={icons.closecircle}
                    label="Remove"
                    onClick={function() { clickRemoveTagOption(filterRemoveTag) }}
                  />
                </div>
                <ListGroup className="bulk-ops-list">
                  {sortedTagOptions.map(function(option, tk) {
                    return (
                      <ListGroup.Item
                        key={tk}
                        className={(tk % 2 === 0) ? 'even' : 'odd'}
                        onClick={function() { clickRemoveTagOption(tagOptions[option]) }}
                      >
                        {tagOptions[option]}
                      </ListGroup.Item>
                    )
                  })}
                </ListGroup>
              </div>
            </Tab>
          </Tabs>
        </Modal.Body>
      </Modal>
    </>
  )
}
