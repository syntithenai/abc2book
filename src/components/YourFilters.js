import {Button, Modal} from 'react-bootstrap'
import {useEffect, useState} from 'react'
import { toast } from 'react-toastify'

export default function YourFilters(props) {
    const [filters, setFilters] = useState({})
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const [deleteName, setDeleteName] = useState(null)

    useEffect(function() {
        loadFilters()
    },[])

    function loadFilters() {
        try {
            var saved = window.localStorage.getItem('bookstorage_saved_filters')
            var list = saved ? JSON.parse(saved) : {}
            setFilters(list)
            if (typeof props.onFiltersChange === 'function') {
                props.onFiltersChange(list)
            }
        } catch (e) {
            setFilters({})
            if (typeof props.onFiltersChange === 'function') {
                props.onFiltersChange({})
            }
        }
    }

    function performDelete(name) {
        try {
            var saved = window.localStorage.getItem('bookstorage_saved_filters')
            var list = saved ? JSON.parse(saved) : {}
            delete list[name]
            window.localStorage.setItem('bookstorage_saved_filters', JSON.stringify(list))
            setFilters(list)
            toast.success('Deleted filter "' + name + '"')
        } catch (e) {
            console.log('delete error', e)
        }
    }

    function loadAndNavigate(name) {
        try {
            var saved = window.localStorage.getItem('bookstorage_saved_filters')
            var list = saved ? JSON.parse(saved) : {}
            var item = list[name]
            if (!item) return
            if (props.setFilter) props.setFilter(item.filter || '')
            if (props.setGroupBy) props.setGroupBy(item.groupBy || '')
            if (props.setTagFilter) props.setTagFilter(item.tagFilter || [])
            if (props.setCurrentTuneBook) props.setCurrentTuneBook(item.currentTuneBook || '')
            if (typeof props.forceRefresh === 'function') {
                // ensure list updates (grouping, filtering) after applying saved criteria
                setTimeout(function() { 
                    props.forceRefresh(); 
                    // navigate after refresh so groupBy takes effect on the tunes page
                    if (props.tunebook && typeof props.tunebook.navigate === 'function') {
                        props.tunebook.navigate('/tunes')
                    } else {
                        window.location.hash = '#/tunes'
                    }
                }, 50)
            } else {
                // navigate immediately if no refresh function is available
                if (props.tunebook && typeof props.tunebook.navigate === 'function') {
                    props.tunebook.navigate('/tunes')
                } else {
                    window.location.hash = '#/tunes'
                }
            }
        } catch (e) {
            console.log('load and nav error', e)
        }
    }

    // if no filters, render nothing unless showWhenEmpty
    const keys = Object.keys(filters)
    if (!keys || keys.length === 0) {
        if (!props.showWhenEmpty) return null
        return <p className="books-page-saved-filters-empty">No filters yet. Save a filter from the search page.</p>
    }

    return <div className={props.embedded ? 'books-page-saved-filters-list' : ''} style={props.embedded ? undefined : {padding:'1em'}}>
        <div style={{display:'flex', flexWrap:'wrap'}}>
            {keys.map(function(name, idx) {
                return <div key={idx} style={{margin: '0.2em', position: 'relative'}}>
                    <Button onClick={function() { loadAndNavigate(name) }} variant="primary" style={{minWidth: '84px', paddingRight: '3.6em', backgroundColor:'#0d6efd', borderColor:'#0d6efd'}}>
                        <span style={{display:'inline-block', maxWidth: '180px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', verticalAlign:'middle'}} title={name}>{name}</span>
                    </Button>
                    <Button onClick={function(e) { e && e.stopPropagation(); setDeleteName(name); setShowDeleteModal(true); }} variant="secondary" size="sm" aria-label={`Delete filter ${name}`} style={{position:'absolute', right:0, top:'50%', transform:'translateY(-50%)', width:'28px', height:'28px', padding:0, lineHeight:'1', borderRadius:'0 4px 0 4px'}}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="12" height="12" fill="currentColor" style={{display:'block', margin:'6px auto'}} aria-hidden>
                            <path d="M3.404 2.596a.5.5 0 0 1 .707 0L8 6.485l3.889-3.89a.5.5 0 1 1 .707.707L8.707 7.192l3.89 3.889a.5.5 0 0 1-.707.707L8 7.899l-3.889 3.89a.5.5 0 0 1-.707-.707l3.889-3.889L3.404 3.303a.5.5 0 0 1 0-.707z"/>
                        </svg>
                    </Button>
                </div>
            })}
        </div>
        <style>{`.delete-confirm-dialog{ margin-top:15em !important; }`}</style>
        <Modal dialogClassName="delete-confirm-dialog" show={showDeleteModal} onHide={function() { setShowDeleteModal(false); setDeleteName(null); }}>
            <Modal.Header closeButton>
                <Modal.Title>Delete filter?</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                Are you sure you want to delete the filter "{deleteName}"? This cannot be undone.
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={function() { setShowDeleteModal(false); setDeleteName(null); }}>Cancel</Button>
                <Button variant="danger" onClick={function() { performDelete(deleteName); setShowDeleteModal(false); setDeleteName(null); }}>Delete</Button>
            </Modal.Footer>
        </Modal>
    </div>
}
