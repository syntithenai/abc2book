import {Button, Modal, Form, ButtonGroup, Dropdown} from 'react-bootstrap'
import {useState, useEffect, useRef} from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import BookSelectorModal from './BookSelectorModal'
import GroupBySelectorModal from './GroupBySelectorModal'
import TagsSearchSelectorModal from './TagsSearchSelectorModal'
import GenreSearchSelectorModal from './GenreSearchSelectorModal'
import ArtistSearchSelectorModal from './ArtistSearchSelectorModal'
import AlbumSearchSelectorModal from './AlbumSearchSelectorModal'
import FieldVoiceFillButton from './FieldVoiceFillButton'
import VoiceFillInput from './VoiceFillInput'
import { trackSearch } from '../analytics'
import { useIsCompactViewport } from '../useMediaQuery'

const SEARCH_DEBOUNCE_MS = 300

export default function IndexSearchForm(props) {
    var [inputColor, setInputColor] = useState('var(--app-surface)')
    const [searchText, setSearchText] = useState(props.filter || '')
    const debounceRef = useRef(null)
    const [showSaveModal, setShowSaveModal] = useState(false)
    const [saveName, setSaveName] = useState('')
    const [overwriteWarning, setOverwriteWarning] = useState(false)
    const [filtersMenuOpen, setFiltersMenuOpen] = useState(false)
    const isVerySmallScreen = useIsCompactViewport()
    const showGroupBy = props.tunes && props.filtered && props.filtered.length < props.LIST_PROTECTION_LIMIT * 5
    const hasActiveSearchFilters = !!(
        props.currentTuneBook
        || props.starredFilter
        || (Array.isArray(props.tagFilter) && props.tagFilter.length > 0)
        || (Array.isArray(props.genreFilter) && props.genreFilter.length > 0)
        || (Array.isArray(props.artistFilter) && props.artistFilter.length > 0)
        || (Array.isArray(props.albumFilter) && props.albumFilter.length > 0)
    )
    const tuneCount = props.tunes ? Object.keys(props.tunes).length : 0

    function goToBooksPageTop() {
        try {
            window.sessionStorage.removeItem('bookstorage_scroll_section')
        } catch (e) {
            // ignore
        }
        setTimeout(function() {
            window.scrollTo({ top: 0, behavior: 'smooth' })
        }, 50)
    }

    useEffect(function() {
        setSearchText(props.filter || '')
    }, [props.filter])

    useEffect(function() {
        return function() {
            if (debounceRef.current) clearTimeout(debounceRef.current)
        }
    }, [])

    function applySearchFilter(value) {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current)
            debounceRef.current = null
        }
        props.setFilter(value)
        if (value && value.trim()) trackSearch()
    }

    function scheduleSearchFilter(value) {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(function() {
            debounceRef.current = null
            props.setFilter(value)
            if (value && value.trim()) trackSearch()
        }, SEARCH_DEBOUNCE_MS)
    }

    function handleSearchChange(value) {
        setSearchText(value)
        setInputColor('var(--app-brand-subtle)')
        scheduleSearchFilter(value)
    }

    function openSaveModal() {
        setFiltersMenuOpen(false)
        setSaveName('')
        setOverwriteWarning(false)
        setShowSaveModal(true)
    }

    function closeSaveModal() {
        setShowSaveModal(false)
    }

    function clearAllFilters() {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current)
            debounceRef.current = null
        }
        setSearchText('')
        props.setFilter('')
        props.setCurrentTuneBook('')
        props.setGroupBy('')
        props.setTagFilter([])
        if (props.setGenreFilter) props.setGenreFilter([])
        if (props.setArtistFilter) props.setArtistFilter([])
        if (props.setAlbumFilter) props.setAlbumFilter([])
        if (props.setStarredFilter) props.setStarredFilter(false)
        props.setSelected({})
        props.setSelectedCount(0)
        props.setFiltered('')
        props.setGrouped({})
        props.setListHash('')
    }

    function clearBookFilter() {
        props.setCurrentTuneBook('')
        props.forceRefresh()
    }

    function saveCurrentFilter() {
        try {
            var saved = window.localStorage.getItem('bookstorage_saved_filters')
            var list = saved ? JSON.parse(saved) : {}
            if (!saveName || saveName.trim() === '') return
            if (list[saveName] && !overwriteWarning) {
                setOverwriteWarning(true)
                return
            }
            var payload = { name: saveName, filter: props.filter || '', groupBy: props.groupBy || '', tagFilter: props.tagFilter || [], genreFilter: props.genreFilter || [], artistFilter: props.artistFilter || [], albumFilter: props.albumFilter || [], currentTuneBook: props.currentTuneBook || '' }
            list[saveName] = payload
            window.localStorage.setItem('bookstorage_saved_filters', JSON.stringify(list))
            toast.success('Saved filter "' + saveName + '"')
            setShowSaveModal(false)
        } catch (e) {
            console.log('save filter error', e)
        }
    }

    function renderStarredFilterToggle(hideSelection) {
        return (
            <Button
                type="button"
                variant={props.starredFilter ? 'warning' : (hideSelection ? 'outline-secondary' : 'secondary')}
                className="tune-search-starred-filter-btn"
                title={props.starredFilter ? 'Show all tunes' : 'Show starred tunes only'}
                aria-label={props.starredFilter ? 'Clear starred filter' : 'Filter starred tunes'}
                aria-pressed={!!props.starredFilter}
                onClick={function() {
                    if (typeof props.setStarredFilter === 'function') {
                        props.setStarredFilter(!props.starredFilter)
                    }
                    props.setListHash('')
                    props.forceRefresh()
                }}
            >
                {props.starredFilter
                    ? (props.tunebook.icons.starfilled || props.tunebook.icons.star)
                    : props.tunebook.icons.star}
            </Button>
        )
    }

    function renderBookTagArtistFilters(options) {
        var activeOnly = !!(options && options.activeOnly)
        var hideSelection = !!(options && options.hideSelection)
        var hasBook = !!props.currentTuneBook
        var hasTags = Array.isArray(props.tagFilter) && props.tagFilter.length > 0
        var hasGenres = Array.isArray(props.genreFilter) && props.genreFilter.length > 0
        var hasArtists = Array.isArray(props.artistFilter) && props.artistFilter.length > 0
        var hasAlbums = Array.isArray(props.albumFilter) && props.albumFilter.length > 0

        return <>
            {(!activeOnly || props.starredFilter) ? renderStarredFilterToggle(hideSelection) : null}
            {(!activeOnly || hasBook) ? (
                <ButtonGroup>
                    <BookSelectorModal
                        tunes={props.tunes}
                        blockKeyboardShortcuts={props.blockKeyboardShortcuts}
                        forceRefresh={props.forceRefresh}
                        title={'Select a Book'}
                        currentTuneBook={props.currentTuneBook}
                        setCurrentTuneBook={props.setCurrentTuneBook}
                        tunebook={props.tunebook}
                        onChange={function(val) {props.setCurrentTuneBook(val); props.forceRefresh();}}
                        defaultOptions={props.tunebook.getTuneBookOptions}
                        searchOptions={props.tunebook.getSearchTuneBookOptions}
                        triggerElement={
                            <Button variant="primary" style={hideSelection ? undefined : {marginLeft:'0.1em'}}>
                                {props.tunebook.icons.book}
                                {hideSelection ? <span className="tune-search-filters-btn-label"> Book</span> : null}
                                {(!hideSelection && props.currentTuneBook) ? <b>{' ' + String(props.currentTuneBook).toLowerCase()}</b> : null}
                            </Button>
                        }
                    />
                    {!hideSelection && hasBook ? (
                        <Button variant="primary" title="Clear book filter" onClick={clearBookFilter}>
                            {props.tunebook.icons.closecircle}
                        </Button>
                    ) : null}
                </ButtonGroup>
            ) : null}

            {(!activeOnly || hasTags) ? (
                <TagsSearchSelectorModal
                    setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                    forceRefresh={props.forceRefresh}
                    tunebook={props.tunebook}
                    defaultOptions={props.tunebook.getTuneTagOptions}
                    searchOptions={props.tunebook.getSearchTuneTagOptions}
                    value={props.tagFilter}
                    hideSelection={hideSelection}
                    onChange={function(val) {
                        props.setTagFilter(val)
                        props.forceRefresh()
                    }}
                />
            ) : null}

            {(!activeOnly || hasGenres) ? (
                <GenreSearchSelectorModal
                    setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                    forceRefresh={props.forceRefresh}
                    tunebook={props.tunebook}
                    defaultOptions={props.tunebook.getTuneGenreOptions}
                    searchOptions={props.tunebook.getSearchTuneGenreOptions}
                    value={props.genreFilter}
                    hideSelection={hideSelection}
                    onChange={function(val) {
                        props.setGenreFilter(val)
                        props.forceRefresh()
                    }}
                />
            ) : null}

            {(!activeOnly || hasArtists) ? (
                <ArtistSearchSelectorModal
                    setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                    forceRefresh={props.forceRefresh}
                    tunebook={props.tunebook}
                    defaultOptions={props.tunebook.getTuneArtistOptions}
                    searchOptions={props.tunebook.getSearchTuneArtistOptions}
                    value={props.artistFilter}
                    hideSelection={hideSelection}
                    onChange={function(val) {
                        props.setArtistFilter(val)
                        props.forceRefresh()
                    }}
                />
            ) : null}

            {(!activeOnly || hasAlbums) ? (
                <AlbumSearchSelectorModal
                    setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                    forceRefresh={props.forceRefresh}
                    tunebook={props.tunebook}
                    defaultOptions={props.tunebook.getTuneAlbumOptions}
                    searchOptions={props.tunebook.getSearchTuneAlbumOptions}
                    value={props.albumFilter}
                    hideSelection={hideSelection}
                    onChange={function(val) {
                        props.setAlbumFilter(val)
                        props.forceRefresh()
                    }}
                />
            ) : null}
        </>
    }

    function renderGroupByAndSave(options) {
        var hideSelection = !!(options && options.hideSelection)
        return <>
            {showGroupBy ? (
                <GroupBySelectorModal
                    onChange={function(val) { props.setGroupBy(val)}}
                    value={props.groupBy}
                    tunebook={props.tunebook}
                    hideSelection={hideSelection}
                />
            ) : null}

            <span className="tune-search-save" id="tunebookbuttons">
                <Button onClick={openSaveModal} variant="info" title="Save current filter">
                    {props.tunebook.icons.save}
                    {hideSelection ? <span className="tune-search-filters-btn-label"> Save</span> : null}
                </Button>
            </span>
        </>
    }

    function renderListDisplayModeToggle(showLabels) {
        var mode = props.listDisplayMode || 'compact'
        var icons = props.tunebook.icons
        var previewLimit = props.PREVIEW_LIST_LIMIT > 0 ? props.PREVIEW_LIST_LIMIT : 150
        var previewDisabled = Array.isArray(props.filtered) && props.filtered.length > previewLimit
        function setMode(next) {
            if (next === 'preview' && previewDisabled) {
                toast.info('Refine your search to ' + previewLimit + ' or fewer results to enable Preview mode')
                return
            }
            if (typeof props.setListDisplayMode === 'function') props.setListDisplayMode(next)
            if (next === 'compact') {
                if (typeof props.setSelected === 'function') props.setSelected({})
                if (typeof props.setSelectedCount === 'function') props.setSelectedCount(0)
            }
        }
        var options = [
            { id: 'compact', label: 'Compact', icon: icons.list, title: 'Compact list' },
            { id: 'detailed', label: 'Detailed', icon: icons.menu, title: 'Detailed list' },
            {
                id: 'preview',
                label: 'Preview',
                icon: icons.music,
                title: previewDisabled
                    ? 'Preview list is unavailable for more than ' + previewLimit + ' results — narrow the search first'
                    : 'Preview list',
                disabled: previewDisabled,
            },
        ]
        return (
            <ButtonGroup className="tune-search-display-mode-group" aria-label="List display mode">
                {options.map(function(option) {
                    return (
                        <Button
                            key={option.id}
                            type="button"
                            size="sm"
                            variant={mode === option.id ? 'primary' : 'outline-secondary'}
                            className={option.disabled ? 'tune-search-display-mode-disabled' : undefined}
                            title={option.title}
                            aria-label={option.label}
                            aria-pressed={mode === option.id}
                            aria-disabled={!!option.disabled}
                            onClick={function() { setMode(option.id) }}
                        >
                            {option.icon}
                            {showLabels ? <span className="tune-search-filters-btn-label"> {option.label}</span> : null}
                        </Button>
                    )
                })}
            </ButtonGroup>
        )
    }

    return <>
            <div id="tunesearchform" className="tune-search-form">
                <div className="tune-search-controls">
                    <div className="tune-search-primary">
                        <Link
                            to="/books"
                            className="tune-search-books-link"
                            title="Books"
                            aria-label={tuneCount + ' tunes — open books'}
                            onClick={goToBooksPageTop}
                        >
                            <Button variant="secondary" className="tune-search-books-btn">
                                {props.tunebook.icons.book}
                                <span className="tune-search-books-count">{tuneCount}</span>
                            </Button>
                        </Link>
                        <span className="tune-search-heading">Search</span>
                        <div className="tune-search-input-wrap">
                            <input
                                className="tune-search-input"
                                onBlur={function() {
                                    if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(false)
                                    applySearchFilter(searchText)
                                }}
                                onFocus={function() {if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(true)}}
                                style={{backgroundColor: inputColor}}
                                type='search'
                                value={searchText}
                                onChange={function(e) {
                                    handleSearchChange(e.target.value)
                                }}
                            />
                            <FieldVoiceFillButton
                                fieldKind="search"
                                token={props.token}
                                setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                                className="tune-search-mic-btn"
                                data-testid="tune-search-mic"
                                onFill={function(text) {
                                    handleSearchChange(text)
                                    applySearchFilter(text)
                                }}
                            />
                        </div>
                        <Dropdown
                            as={ButtonGroup}
                            className="tune-search-filters-dropdown"
                            show={filtersMenuOpen}
                            onToggle={function(next) { setFiltersMenuOpen(!!next) }}
                            autoClose="outside"
                            align="end"
                        >
                            <Button
                                variant={hasActiveSearchFilters ? 'primary' : 'secondary'}
                                title="Search filters"
                                aria-label="Search filters"
                                onClick={function() { setFiltersMenuOpen(!filtersMenuOpen) }}
                            >
                                {props.tunebook.icons.filter}
                            </Button>
                            <Dropdown.Toggle
                                split
                                variant={hasActiveSearchFilters ? 'primary' : 'secondary'}
                                id="tune-search-filters-dropdown"
                                title="Search filters"
                                aria-label="Open search filters"
                            />
                            <Dropdown.Menu
                                className="tune-search-filters-menu"
                                popperConfig={{ strategy: 'fixed' }}
                                style={{
                                    paddingLeft: '1.25rem',
                                    paddingRight: '1.25rem',
                                    paddingTop: '0.65rem',
                                    paddingBottom: '0.65rem',
                                }}
                            >
                                <div
                                    className="tune-search-filters-menu-body"
                                    onClick={function(e) { e.stopPropagation() }}
                                >
                                    <div className="tune-search-filters-menu-row">
                                        <span className="tune-search-filters-menu-label">Filter by</span>
                                        {renderBookTagArtistFilters({ hideSelection: true })}
                                        <span className="tune-search-filters-menu-sep" aria-hidden="true" />
                                        {renderGroupByAndSave({ hideSelection: true })}
                                    </div>
                                    <div className="tune-search-filters-menu-sep-h" aria-hidden="true" />
                                    <div className="tune-search-filters-menu-row">
                                        <span className="tune-search-filters-menu-label">Display</span>
                                        {renderListDisplayModeToggle(true)}
                                    </div>
                                </div>
                            </Dropdown.Menu>
                        </Dropdown>
                        {!isVerySmallScreen ? (
                            <span className="tune-search-display-mode-bar">
                                {renderListDisplayModeToggle(false)}
                            </span>
                        ) : null}
                        <Button
                            className="tune-search-clear-all"
                            variant="danger"
                            title="Clear all filters"
                            onClick={clearAllFilters}
                        >
                            {props.tunebook.icons.closecircle}
                        </Button>
                    </div>
                    {hasActiveSearchFilters ? (
                        <div className="tune-search-filters">
                            {renderBookTagArtistFilters({ activeOnly: true })}
                        </div>
                    ) : null}
                </div>
            </div>

            <Modal show={showSaveModal} onHide={closeSaveModal}>
                <Form onSubmit={function(e) { e.preventDefault(); saveCurrentFilter(); }}>
                <Modal.Header closeButton>
                    <Modal.Title>Save filter</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                        <Form.Group>
                            <Form.Label>Name</Form.Label>
                            <VoiceFillInput
                              autoFocus
                              type="text"
                              value={saveName}
                              onChange={function(e) { setSaveName(e.target.value); if (overwriteWarning) setOverwriteWarning(false) }}
                              setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                              token={props.token}
                              fieldKind="search"
                            />
                            {overwriteWarning && <div style={{color:'red', marginTop:'0.5em'}}>A filter with that name already exists. Click Save again to overwrite.</div>}
                        </Form.Group>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={closeSaveModal}>Cancel</Button>
                    <Button type="submit" variant="primary">Save</Button>
                </Modal.Footer>
                </Form>
            </Modal>
        </>
}
