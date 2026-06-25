import {Button, Modal, Form, ButtonGroup} from 'react-bootstrap'
import {useState, useEffect, useRef} from 'react'
import { toast } from 'react-toastify'
import BookSelectorModal from './BookSelectorModal'
import GroupBySelectorModal from './GroupBySelectorModal'
import TagsSearchSelectorModal from './TagsSearchSelectorModal'
import { trackSearch } from '../analytics'

const SEARCH_DEBOUNCE_MS = 300

export default function IndexSearchForm(props) {
    var [inputColor, setInputColor] = useState('#e9ecef')
    const [searchText, setSearchText] = useState(props.filter || '')
    const debounceRef = useRef(null)
    const [showSaveModal, setShowSaveModal] = useState(false)
    const [saveName, setSaveName] = useState('')
    const [overwriteWarning, setOverwriteWarning] = useState(false)
    const showGroupBy = props.tunes && props.filtered && props.filtered.length < props.LIST_PROTECTION_LIMIT * 5

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
        setInputColor('##5400ff2e')
        scheduleSearchFilter(value)
    }

    function openSaveModal() {
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
            var payload = { name: saveName, filter: props.filter || '', groupBy: props.groupBy || '', tagFilter: props.tagFilter || [], currentTuneBook: props.currentTuneBook || '' }
            list[saveName] = payload
            window.localStorage.setItem('bookstorage_saved_filters', JSON.stringify(list))
            toast.success('Saved filter "' + saveName + '"')
            setShowSaveModal(false)
        } catch (e) {
            console.log('save filter error', e)
        }
    }

    return <>
            <div id="tunesearchform" className="tune-search-form">
                <div className="tune-search-controls">
                    <div className="tune-search-primary">
                        <span className="tune-search-heading">Search</span>
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
                    </div>
                    <div className="tune-search-filters">
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
                                    <Button variant="primary" style={{marginLeft:'0.1em'}}>
                                        {props.tunebook.icons.book} {(props.currentTuneBook ? <b>{props.currentTuneBook}</b> : '')}
                                    </Button>
                                }
                            />
                            {props.currentTuneBook ? (
                                <Button variant="primary" title="Clear book filter" onClick={clearBookFilter}>
                                    {props.tunebook.icons.closecircle}
                                </Button>
                            ) : null}
                        </ButtonGroup>

                        <TagsSearchSelectorModal
                            tagCollation={props.tagCollation}
                            setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                            forceRefresh={props.forceRefresh}
                            tunebook={props.tunebook}
                            defaultOptions={props.tunebook.getTuneTagOptions}
                            searchOptions={props.tunebook.getSearchTuneTagOptions}
                            value={props.tagFilter}
                            onChange={function(val) {
                                props.setTagFilter(val)
                                props.forceRefresh()
                            }}
                        />

                        {showGroupBy ? (
                            <GroupBySelectorModal
                                LIST_PROTECTION_LIMIT={props.LIST_PROTECTION_LIMIT}
                                onChange={function(val) { props.setGroupBy(val)}}
                                value={props.groupBy}
                                tunebook={props.tunebook}
                                showPreviewInList={props.showPreviewInList}
                                setShowPreviewInList={props.setShowPreviewInList}
                                tunes={Object.keys(props.filtered)}
                            />
                        ) : null}

                        <Button
                            className="tune-search-clear-all"
                            variant="danger"
                            title="Clear all filters"
                            onClick={clearAllFilters}
                        >
                            {props.tunebook.icons.closecircle}
                        </Button>

                        <span className="tune-search-save" id="tunebookbuttons">
                            <Button onClick={openSaveModal} variant="info" title="Save current filter">
                                {props.tunebook.icons.save}
                            </Button>
                        </span>
                    </div>
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
                            <Form.Control autoFocus type="text" value={saveName} onChange={function(e) { setSaveName(e.target.value); if (overwriteWarning) setOverwriteWarning(false) }} />
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
