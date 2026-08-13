import curated from '../CuratedTuneBooks'
import Accordion from 'react-bootstrap/Accordion';
import {Link, useNavigate} from 'react-router-dom'
import {Button} from 'react-bootstrap'
import {useState} from 'react'
import { buildCuratedImportPath } from '../curatedImportMatch'
import PlayWithQueueDropdown from './PlayWithQueueDropdown'

function buildCuratedGroups() {
    var collatedCurated = {}
    var notCollatedCurated = {}
    Object.keys(curated).forEach(function(bookTitle) {
        if (curated[bookTitle].group) {
            if (!collatedCurated.hasOwnProperty(curated[bookTitle].group)) collatedCurated[curated[bookTitle].group] = {}
            collatedCurated[curated[bookTitle].group][bookTitle] = curated[bookTitle]
        } else {
            notCollatedCurated[bookTitle] = curated[bookTitle]
        }
    })
    return { collatedCurated: collatedCurated, notCollatedCurated: notCollatedCurated }
}

export default function ImportCollectionsAccordion(props) {
    const navigate = useNavigate()
    const [imageIsHidden, setImageIsHidden] = useState({})
    function hideImage(key) {
        setImageIsHidden(function(prev) {
            if (prev[key]) return prev
            return Object.assign({}, prev, { [key]: true })
        })
    }
    var baseImageLink = (process.env.PUBLIC_URL || '') + '/book_images/'
    var groups = buildCuratedGroups()
    var collatedCurated = groups.collatedCurated
    var notCollatedCurated = groups.notCollatedCurated
    var flat = props.flat === true

    function renderBookButton(bookTitle, bookMeta, imageKey) {
        if (bookMeta.link) {
            const importPath = buildCuratedImportPath(bookMeta)
            const playPath = importPath + (bookMeta.book ? "/play" : "")
            return <div key={bookTitle} className="books-page-book-card" role="group">
                <Link to={importPath} className="books-page-collection-card-link" style={{textDecoration:'none'}}>
                    <Button variant="primary" className="books-page-collection-card-main" onClick={function() {props.setCurrentTuneBook(bookTitle)}}>
                        {bookMeta.image && !imageIsHidden[imageKey] && <img className="books-page-collection-card-cover" alt="" src={baseImageLink + bookMeta.image} onError={function() {hideImage(imageKey)}} />}
                        <span className="books-page-collection-card-label">{bookTitle}</span>
                    </Button>
                </Link>
                <PlayWithQueueDropdown
                    variant="collection-side"
                    playVariant="primary"
                    playIcon={props.tunebook.icons.playwhite}
                    showQueueMenu={false}
                    onPlay={function(e) {
                        e.preventDefault()
                        e.stopPropagation()
                        props.setCurrentTuneBook(bookTitle)
                        navigate(playPath)
                    }}
                    onContainerClick={function(e) { e.stopPropagation() }}
                />
            </div>
        }
        if (bookMeta.googleDocumentId) {
            const importPath = '/importdoc/' + bookMeta.googleDocumentId + (bookMeta.book ? "/book/"+encodeURIComponent(bookMeta.book) : "")
            const playPath = '/importlink/' + encodeURIComponent(bookMeta.link || '') + (bookMeta.book ? "/book/"+encodeURIComponent(bookMeta.book) + "play" : "")
            return <div key={bookTitle} className="books-page-book-card" role="group">
                <Link to={importPath} className="books-page-collection-card-link" style={{textDecoration:'none'}}>
                    <Button variant="primary" className="books-page-collection-card-main" onClick={function() {props.setCurrentTuneBook(bookTitle)}}>
                        {bookMeta.image && !imageIsHidden[imageKey] ? <img className="books-page-collection-card-cover" alt="" src={baseImageLink + bookMeta.image} onError={function() {hideImage(imageKey)}} /> : null}
                        <span className="books-page-collection-card-label">{bookTitle}</span>
                    </Button>
                </Link>
                <PlayWithQueueDropdown
                    variant="collection-side"
                    playVariant="primary"
                    playIcon={props.tunebook.icons.playwhite}
                    showQueueMenu={false}
                    onPlay={function(e) {
                        e.preventDefault()
                        e.stopPropagation()
                        props.setCurrentTuneBook(bookTitle)
                        navigate(playPath)
                    }}
                    onContainerClick={function(e) { e.stopPropagation() }}
                />
            </div>
        }
        return null
    }

    function renderGroupBooks(groupItems) {
        var groupOptions = Object.keys(groupItems)
        // Flat curated panel keeps CuratedTuneBooks insertion order; accordion sorts A–Z.
        if (!flat) {
            groupOptions.sort(function(a,b) {if (a > b) return 1; else return -1})
        }
        return groupOptions.map(function(bookTitle) {
            return renderBookButton(bookTitle, groupItems[bookTitle], bookTitle)
        })
    }

    function renderOtherBooks() {
        return Object.keys(notCollatedCurated).map(function(bookTitle) {
            return renderBookButton(bookTitle, notCollatedCurated[bookTitle], 'other:' + bookTitle)
        })
    }

    var hideGroupHeadings = props.hideGroupHeadings === true
    if (flat) {
        return (
            <div className="import-collections-flat" data-testid="import-collections-flat">
                {Object.keys(collatedCurated).map(function(groupTitle, gk) {
                    return (
                        <div key={gk} className="import-collections-flat-group" style={{marginBottom: '0.8em'}}>
                            {!hideGroupHeadings ? (
                                <h4 className="import-collections-flat-heading" style={{fontSize: '1rem', marginBottom: '0.4em'}}>{groupTitle}</h4>
                            ) : null}
                            <div className="import-collections-flat-books books-page-grid">
                                {renderGroupBooks(collatedCurated[groupTitle])}
                            </div>
                        </div>
                    )
                })}
                {Object.keys(notCollatedCurated).length > 0 ? (
                    <div className="import-collections-flat-group" style={{marginBottom: '0.8em'}}>
                        {!hideGroupHeadings ? (
                            <h4 className="import-collections-flat-heading" style={{fontSize: '1rem', marginBottom: '0.4em'}}>Other</h4>
                        ) : null}
                        <div className="import-collections-flat-books books-page-grid">
                            {renderOtherBooks()}
                        </div>
                    </div>
                ) : null}
            </div>
        )
    }

    return <Accordion defaultActiveKey={props.startCollapsed ? null : '0'}>
                    {Object.keys(collatedCurated).map(function(groupTitle,gk) {
                    var groupItems = collatedCurated[groupTitle]
                    return <Accordion.Item key={gk}  eventKey={String(gk)}>
                        <Accordion.Header  style={{marginTop:'0.3em'}} >{groupTitle}</Accordion.Header>
                        <Accordion.Body>{renderGroupBooks(groupItems)}</Accordion.Body>
                    </Accordion.Item>})}
                    {Object.keys(notCollatedCurated).length > 0 && <Accordion.Item eventKey="other">
                         <Accordion.Header style={{marginTop:'0.3em'}}>Other</Accordion.Header>
                         <Accordion.Body>{renderOtherBooks()}</Accordion.Body>
                     </Accordion.Item>

                 
                 }</Accordion>
                 
                 
}                
