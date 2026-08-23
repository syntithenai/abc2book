import {useRef, useState} from 'react'
import {Button, ButtonGroup, Dropdown, Form, Modal, Tabs, Tab, ListGroup} from 'react-bootstrap'
import BulkChangeValueModal from './BulkChangeValueModal'
import BulkCheckModal from './BulkCheckModal'
import BulkSearchModal from './BulkSearchModal'
import BulkOperationProgressModal from './BulkOperationProgressModal'
import TuneDownloadDropdown from './TuneDownloadMenu'
import AddTunesToListModal from './AddTunesToListModal'
import {appendTunesToPerformanceSet, savePerformanceSet} from '../performanceSetStore'
import {appendTunesToPracticeList, savePracticeList} from '../practiceListStore'
import { PRACTICE_LISTS_ENABLED } from '../practiceModeEnabled'
import {appendTunesToPlaylist, savePlaylistFromQueue} from '../savedPlaylistsStore'
import {createQueue} from '../nowPlayingQueue'
import {Link, useNavigate} from 'react-router-dom'
import {toast} from 'react-toastify'
import FieldVoiceFillButton from './FieldVoiceFillButton'
import useBulkOperationProgress from '../useBulkOperationProgress'
import { shouldShowBulkOperationProgress } from '../bulkOperationProgress'
import MediaCacheQueueModal, { useMediaCacheQueueModal } from './MediaCacheQueueModal'

function BulkOpsDualIcon({leading, trailing}) {
  return (
    <span className="bulk-ops-dual-icon" aria-hidden="true">
      {leading}
      {trailing}
    </span>
  )
}

function BulkOpsDropdownItem({icon, label, onClick}) {
  return (
    <Dropdown.Item onClick={onClick}>
      <span className="bulk-ops-dropdown-item-icon" aria-hidden="true">{icon}</span>
      <span className="bulk-ops-dropdown-item-label">{label}</span>
    </Dropdown.Item>
  )
}

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

function BulkOpsSearchBox({icons, id, value, onChange, placeholder, token, setBlockKeyboardShortcuts}) {
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
      <FieldVoiceFillButton
        fieldKind="search"
        token={token}
        setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}
        onFill={onChange}
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
  const bulkProgress = useBulkOperationProgress()
  const mediaCacheQueueModal = useMediaCacheQueueModal()
  const [show, setShow] = useState(false)
  const [filterAdd, setFilterAdd] = useState('')
  const [filterRemove, setFilterRemove] = useState('')
  const [options, setOptions] = useState(props.defaultOptions())
  const [filterAddTag, setFilterAddTag] = useState('')
  const [filterRemoveTag, setFilterRemoveTag] = useState('')
  const [tagOptions, setTagOptions] = useState(props.defaultTagOptions())
  const [addToListKind, setAddToListKind] = useState(null)

  const filterAddTimeoutRef = useRef(null)
  const filterRemoveTimeoutRef = useRef(null)
  const filterAddTagTimeoutRef = useRef(null)
  const filterRemoveTagTimeoutRef = useRef(null)

  const handleClose = function() {
    setAddToListKind(null)
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
        var currentSelection = selectedTuneIds()
        props.tunebook.indexes.addTagToIndex(filterAddTag)
        runChunkedTunebookAction({
          tuneIds: currentSelection,
          title: 'Adding tag',
          verb: 'Tagging',
          processChunk: function(chunk, deferOpts) {
            props.tunebook.addTunesToTag(chunk, filterAddTag, deferOpts)
          },
          onComplete: function() {
            setFilterAddTag('')
            setFilterRemoveTag('')
            setTagOptions(props.defaultTagOptions())
            props.forceRefresh()
            handleClose()
          },
        })
      }
    }
  }

  function clickAddTagOption(option) {
    if (option && option.trim()) {
      if (window.confirm('Are you sure that you want to add the tag ' + option + ' to all the ' + props.selectedCount + ' selected tunes ?')) {
        var currentSelection = selectedTuneIds()
        runChunkedTunebookAction({
          tuneIds: currentSelection,
          title: 'Adding tag',
          verb: 'Tagging',
          processChunk: function(chunk, deferOpts) {
            props.tunebook.addTunesToTag(chunk, option, deferOpts)
          },
          onComplete: function() {
            setFilterAdd('')
            setFilterRemove('')
            props.forceRefresh()
            handleClose()
          },
        })
      }
    }
  }

  function clickRemoveTagOption(option) {
    if (option && option.trim()) {
      if (window.confirm('Are you sure that you want to remove the tag ' + option + ' from all the ' + props.selectedCount + ' selected tunes ?')) {
        var currentSelection = selectedTuneIds()
        runChunkedTunebookAction({
          tuneIds: currentSelection,
          title: 'Removing tag',
          verb: 'Updating',
          processChunk: function(chunk, deferOpts) {
            props.tunebook.removeTunesFromTag(chunk, option, deferOpts)
          },
          onComplete: function() {
            setFilterAdd('')
            setFilterRemove('')
            props.forceRefresh()
            handleClose()
          },
        })
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
        var currentSelection = selectedTuneIds()
        props.tunebook.indexes.addBookToIndex(filterAdd)
        runChunkedTunebookAction({
          tuneIds: currentSelection,
          title: 'Adding to book',
          verb: 'Updating',
          processChunk: function(chunk, deferOpts) {
            props.tunebook.addTunesToBook(chunk, filterAdd, deferOpts)
          },
          onComplete: function() {
            setFilterAdd('')
            setFilterRemove('')
            setOptions(props.defaultOptions())
            props.forceRefresh()
            handleClose()
          },
        })
      }
    }
  }

  function clickAddOption(option) {
    if (option && option.trim()) {
      if (window.confirm('Are you sure that you want to add all the selected tunes to the book ' + option + ' ?')) {
        var currentSelection = selectedTuneIds()
        runChunkedTunebookAction({
          tuneIds: currentSelection,
          title: 'Adding to book',
          verb: 'Updating',
          processChunk: function(chunk, deferOpts) {
            props.tunebook.addTunesToBook(chunk, option, deferOpts)
          },
          onComplete: function() {
            setFilterAdd('')
            setFilterRemove('')
            props.forceRefresh()
            handleClose()
          },
        })
      }
    }
  }

  function clickRemoveOption(option) {
    if (option && option.trim()) {
      if (window.confirm('Are you sure that you want to remove all the selected tunes from the book ' + option + ' ?')) {
        var currentSelection = selectedTuneIds()
        runChunkedTunebookAction({
          tuneIds: currentSelection,
          title: 'Removing from book',
          verb: 'Updating',
          processChunk: function(chunk, deferOpts) {
            props.tunebook.removeTunesFromBook(chunk, option, deferOpts)
          },
          onComplete: function() {
            setFilterAdd('')
            setFilterRemove('')
            props.forceRefresh()
            handleClose()
          },
        })
      }
    }
  }

  function clickDelete() {
    if (window.confirm('Are you sure that you want to delete all the ' + props.selectedCount + ' selected tunes?')) {
      var currentSelection = selectedTuneIds()
      runChunkedTunebookAction({
        tuneIds: currentSelection,
        title: 'Deleting tunes',
        verb: 'Deleting',
        processChunk: function(chunk, deferOpts) {
          props.tunebook.deleteTunes(chunk, deferOpts)
        },
        onComplete: function() {
          props.setSelected({})
          props.setSelectedCount(0)
          handleClose()
          props.forceRefresh()
        },
      })
    }
  }

  function selectedTunes() {
    return props.tunebook.fromSelection(props.selected)
  }

  function selectedTuneIds() {
    return Object.keys(props.selected).filter(function(item) {
      return props.selected[item] ? true : false
    })
  }

  function runChunkedTunebookAction(options) {
    const tuneIds = options.tuneIds || selectedTuneIds()
    const deferOpts = { deferSave: true }
    const runAction = function(chunk) {
      options.processChunk(chunk, deferOpts)
    }
    if (shouldShowBulkOperationProgress(tuneIds.length)) {
      return bulkProgress.runTunebook({
        tunebook: props.tunebook,
        items: tuneIds,
        title: options.title,
        messageForIndex: function(current, total) {
          return (options.verb || 'Processing') + ' tune ' + current + ' of ' + total
        },
        processChunk: function(chunk) {
          runAction(chunk)
        },
      }).then(function() {
        if (options.onComplete) options.onComplete()
      })
    }
    props.tunebook.beginTunesBatchCommit()
    runAction(tuneIds)
    props.tunebook.commitTunesBatch()
    if (options.onComplete) options.onComplete()
    return Promise.resolve()
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

  function createPracticeListFromSelected() {
    var tuneIds = selectedTuneIds()
    if (!tuneIds.length) return
    var defaultName = 'Practice list'
    var name = window.prompt(
      'Name for the new practice list with ' + tuneIds.length + ' tune' + (tuneIds.length === 1 ? '' : 's') + ':',
      defaultName
    )
    if (name === null) return
    name = String(name).trim() || defaultName
    var saved = savePracticeList({
      name: name,
      notes: '',
      tuneIds: tuneIds,
    })
    handleClose()
    navigate('/practice-lists/' + encodeURIComponent(saved.id))
  }

  function openAddToSetlist() {
    if (!selectedTuneIds().length) return
    setAddToListKind('setlist')
  }

  function openAddToPlaylist() {
    if (!selectedTuneIds().length) return
    setAddToListKind('playlist')
  }

  function openAddToPracticeList() {
    if (!selectedTuneIds().length) return
    setAddToListKind('practice-list')
  }

  function bulkSetStarred(starred) {
    var tuneIds = selectedTuneIds()
    if (!tuneIds.length) return
    var actionLabel = starred ? 'star' : 'unstar'
    if (!window.confirm(
      'Are you sure you want to ' + actionLabel + ' all ' + props.selectedCount + ' selected tune' +
      (props.selectedCount === 1 ? '' : 's') + '?'
    )) {
      return
    }
    runChunkedTunebookAction({
      tuneIds: tuneIds,
      title: starred ? 'Starring tunes' : 'Unstarring tunes',
      verb: starred ? 'Starring' : 'Unstarring',
      processChunk: function(chunk, deferOpts) {
        props.tunebook.bulkChangeTunes(chunk, [{ key: 'starred', value: starred }], null, deferOpts)
      },
      onComplete: function() {
        props.forceRefresh()
      },
    })
  }

  function handleAddToList(list) {
    var tuneIds = selectedTuneIds()
    if (!list || !list.id || !tuneIds.length) return
    var updated = null
    if (addToListKind === 'setlist') {
      updated = appendTunesToPerformanceSet(list.id, tuneIds)
      if (!updated) {
        toast.error('Could not add tunes to that setlist.')
        return
      }
      toast.success(
        'Added ' + tuneIds.length + ' tune' + (tuneIds.length === 1 ? '' : 's') +
        ' to setlist "' + (updated.name || list.name || 'Set') + '"'
      )
    } else if (addToListKind === 'playlist') {
      updated = appendTunesToPlaylist(list.id, tuneIds)
      if (!updated) {
        toast.error('Could not add tunes to that playlist.')
        return
      }
      toast.success(
        'Added ' + tuneIds.length + ' tune' + (tuneIds.length === 1 ? '' : 's') +
        ' to playlist "' + (updated.name || list.name || 'Playlist') + '"'
      )
    } else if (addToListKind === 'practice-list') {
      updated = appendTunesToPracticeList(list.id, tuneIds)
      if (!updated) {
        toast.error('Could not add tunes to that practice list.')
        return
      }
      toast.success(
        'Added ' + tuneIds.length + ' tune' + (tuneIds.length === 1 ? '' : 's') +
        ' to practice list "' + (updated.name || list.name || 'Practice list') + '"'
      )
    }
    setAddToListKind(null)
    handleClose()
  }

  var sortedOptions = Object.keys(options)
  sortedOptions.sort(function(a, b) { if (a > b) return 1; else return -1 })
  var sortedTagOptions = Object.keys(tagOptions)
  sortedTagOptions.sort(function(a, b) { if (a > b) return 1; else return -1 })

  return (
    <>
      <BulkOperationProgressModal
        show={bulkProgress.show}
        title={bulkProgress.title}
        progress={bulkProgress.progress}
      />
      <MediaCacheQueueModal
        show={mediaCacheQueueModal.show}
        onHide={mediaCacheQueueModal.closeQueueModal}
        tunebook={props.tunebook}
        title="Media download queue"
      />
      <Button
        variant="secondary"
        className="tune-list-bulk-ops-btn"
        onClick={handleShow}
        aria-label="Bulk actions"
        title="Bulk actions"
      >
        {icons.dropdown}
      </Button>

      <Modal show={show} onHide={handleClose} fullscreen dialogClassName="bulk-ops-modal">
        <Modal.Header closeButton>
          <Modal.Title>With {props.selectedCount} selected tunes ..</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="bulk-ops-toolbar">
            <div className="bulk-ops-toolbar-block bulk-ops-tools-block">
              <Dropdown
                as={ButtonGroup}
                className="bulk-ops-star-dropdown"
                onSelect={function(key) {
                  if (key === 'star') bulkSetStarred(true)
                  else if (key === 'unstar') bulkSetStarred(false)
                }}
              >
                <Dropdown.Toggle
                  variant="warning"
                  className="bulk-ops-action-btn"
                  id="bulk-ops-star"
                  aria-label="Star selected tunes"
                  title="Star selected tunes"
                >
                  {icons.star}
                  <span className="bulk-ops-btn-label"> Star</span>
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  <Dropdown.Item eventKey="star">
                    <span className="bulk-ops-dropdown-item-icon" aria-hidden="true">
                      {icons.starfilled || icons.star}
                    </span>
                    <span className="bulk-ops-dropdown-item-label">Star selected</span>
                  </Dropdown.Item>
                  <Dropdown.Item eventKey="unstar">
                    <span className="bulk-ops-dropdown-item-icon" aria-hidden="true">{icons.star}</span>
                    <span className="bulk-ops-dropdown-item-label">Unstar selected</span>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
              <BulkChangeValueModal
                forceRefresh={props.forceRefresh}
                tunebook={props.tunebook}
                onClose={handleClose}
                selected={props.selected}
                selectedCount={props.selectedCount}
                token={props.token}
              />
              <BulkSearchModal
                tunebook={props.tunebook}
                selected={props.selected}
                selectedCount={props.selectedCount}
                token={props.token}
                forceRefresh={props.forceRefresh}
              />
              <BulkCheckModal
                tunebook={props.tunebook}
                selected={props.selected}
                setSelected={props.setSelected}
                setSelectedCount={props.setSelectedCount}
                selectedCount={props.selectedCount}
                forceRefresh={props.forceRefresh}
                tunesHash={props.tunesHash}
                mediaController={props.mediaController}
                token={props.token}
                login={props.login}
                autoStartCheck={false}
              />
            </div>
              <div className="bulk-ops-toolbar-block bulk-ops-create-block">
                <Dropdown as={ButtonGroup} className="bulk-ops-lists-dropdown">
                  <Dropdown.Toggle
                    variant="success"
                    className="bulk-ops-action-btn"
                    id="bulk-ops-lists"
                    aria-label="Create or add to lists from selection"
                    title="Create or add to lists from selection"
                  >
                    {icons.filelist}
                    <span className="bulk-ops-btn-label"> Lists</span>
                  </Dropdown.Toggle>
                  <Dropdown.Menu>
                    <BulkOpsDropdownItem
                      icon={<BulkOpsDualIcon leading={icons.start} trailing={icons.setlist} />}
                      label="Create setlist"
                      onClick={createSetlistFromSelected}
                    />
                    <BulkOpsDropdownItem
                      icon={<BulkOpsDualIcon leading={icons.start} trailing={icons.playlist} />}
                      label="Create playlist"
                      onClick={createPlaylistFromSelected}
                    />
                    {PRACTICE_LISTS_ENABLED ? (
                      <BulkOpsDropdownItem
                        icon={<BulkOpsDualIcon leading={icons.start} trailing={icons.reviewsmall} />}
                        label="Create practice list"
                        onClick={createPracticeListFromSelected}
                      />
                    ) : null}
                    <Dropdown.Divider />
                    <BulkOpsDropdownItem
                      icon={<BulkOpsDualIcon leading={icons.add} trailing={icons.setlist} />}
                      label="Add to setlist"
                      onClick={openAddToSetlist}
                    />
                    <BulkOpsDropdownItem
                      icon={<BulkOpsDualIcon leading={icons.add} trailing={icons.playlist} />}
                      label="Add to playlist"
                      onClick={openAddToPlaylist}
                    />
                    {PRACTICE_LISTS_ENABLED ? (
                      <BulkOpsDropdownItem
                        icon={<BulkOpsDualIcon leading={icons.add} trailing={icons.reviewsmall} />}
                        label="Add to practice list"
                        onClick={openAddToPracticeList}
                      />
                    ) : null}
                  </Dropdown.Menu>
                </Dropdown>
              </div>
            <div className="bulk-ops-toolbar-block bulk-ops-download-block">
              <TuneDownloadDropdown
                tunebook={props.tunebook}
                tunes={selectedTunes()}
                archiveBaseName="selected"
                token={props.token}
                allowRestrictedFormats={true}
                onComplete={handleClose}
                onOpenQueue={mediaCacheQueueModal.openQueueModal}
              />
              <BulkOpsButton as={Link} to="/print" variant="primary" icon={icons.printer} label="Print" />
              <BulkOpsButton variant="danger" icon={icons.deletebin} label="Delete" onClick={clickDelete} />
            </div>
          </div>

          <div className="bulk-ops-tabs-shell">
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
                    token={props.token}
                    setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
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
                    token={props.token}
                    setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
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
                    token={props.token}
                    setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
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
                    token={props.token}
                    setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
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
          </div>
        </Modal.Body>
      </Modal>

      <AddTunesToListModal
        show={!!addToListKind}
        kind={addToListKind || 'playlist'}
        tuneIds={selectedTuneIds()}
        onHide={function() { setAddToListKind(null) }}
        onSelect={handleAddToList}
      />
    </>
  )
}
