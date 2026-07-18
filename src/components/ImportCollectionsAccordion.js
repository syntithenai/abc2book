import curated from '../CuratedTuneBooks'
import Accordion from 'react-bootstrap/Accordion';
import {Link} from 'react-router-dom'
import {Button, ButtonGroup} from 'react-bootstrap'
import {useState} from 'react'
import { curatedScrapeUrl } from '../resourceBase'

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
    const [imageIsHidden, setImageIsHidden] = useState({})
    function hideImage(key) {
        setImageIsHidden(function(prev) {
            if (prev[key]) return prev
            return Object.assign({}, prev, { [key]: true })
        })
    }
    var baseImageLink = (process.env.PUBLIC_URL || '') + '/book_images/'
    var buttonGroupStyle={marginBottom:'0.2em',marginLeft:'0.2em',backgroundColor:'#0d6efd', border:'1px solid black', borderRadius:'10px'}
    var groups = buildCuratedGroups()
    var collatedCurated = groups.collatedCurated
    var notCollatedCurated = groups.notCollatedCurated
    var flat = props.flat === true

    function renderBookButton(bookTitle, bookMeta, imageKey) {
        if (bookMeta.link) {
            return <ButtonGroup key={bookTitle} style={buttonGroupStyle} variant="primary">
                <Link to={'/importlink/' + encodeURIComponent(curatedScrapeUrl(bookMeta.link)) + (bookMeta.book ? "/book/"+encodeURIComponent(bookMeta.book) : "") + (bookMeta.tag ? "/tag/"+encodeURIComponent(bookMeta.tag) : "")} style={{textDecoration:'none'}} >
                    <Button onClick={function() {props.setCurrentTuneBook(bookTitle)}} >
                        {bookMeta.image && !imageIsHidden[imageKey] && <img alt="" style={{height:'80px'}} src={baseImageLink + bookMeta.image} onError={function() {hideImage(imageKey)}} />}
                        &nbsp;{bookTitle}
                    </Button>
                </Link>
                <Link to={'/importlink/' + encodeURIComponent(curatedScrapeUrl(bookMeta.link)) + (bookMeta.book ? "/book/"+encodeURIComponent(bookMeta.book)+  (bookMeta.tag ? "/tag/"+encodeURIComponent(bookMeta.tag) : "") + "/play" : "")} style={{textDecoration:'none'}} >
                    <Button variant={"primary"} size="small" >{props.tunebook.icons.playwhite}</Button>
                </Link>
            </ButtonGroup>
        }
        if (bookMeta.googleDocumentId) {
            return <ButtonGroup key={bookTitle} style={buttonGroupStyle} variant="primary">
                <Link to={'/importdoc/' + bookMeta.googleDocumentId + (bookMeta.book ? "/book/"+encodeURIComponent(bookMeta.book) : "")} style={{textDecoration:'none'}} >
                    <Button style={{marginTop:'0.4em', align:'top'}} onClick={function() {props.setCurrentTuneBook(bookTitle)}} >
                        {bookMeta.image && !imageIsHidden[imageKey] ? <img alt="" style={{height:'80px'}} src={baseImageLink + bookMeta.image} onError={function() {hideImage(imageKey)}} /> : null}
                        &nbsp;{bookTitle}
                    </Button>
                </Link>
                <Link to={'/importlink/' + encodeURIComponent(bookMeta.link || '') + (bookMeta.book ? "/book/"+encodeURIComponent(bookMeta.book) + "play" : "")} style={{textDecoration:'none'}} >
                    <Button variant={"primary"} size="small" >{props.tunebook.icons.playwhite}</Button>
                </Link>
            </ButtonGroup>
        }
        return null
    }

    function renderGroupBooks(groupItems) {
        var groupOptions = Object.keys(groupItems)
        groupOptions.sort(function(a,b) {if (a > b) return 1; else return -1})
        return groupOptions.map(function(bookTitle) {
            return renderBookButton(bookTitle, groupItems[bookTitle], bookTitle)
        })
    }

    function renderOtherBooks() {
        return Object.keys(notCollatedCurated).map(function(bookTitle) {
            return renderBookButton(bookTitle, notCollatedCurated[bookTitle], 'other:' + bookTitle)
        })
    }

    if (flat) {
        return (
            <div className="import-collections-flat" data-testid="import-collections-flat">
                {Object.keys(collatedCurated).map(function(groupTitle, gk) {
                    return (
                        <div key={gk} className="import-collections-flat-group" style={{marginBottom: '0.8em'}}>
                            <h4 className="import-collections-flat-heading" style={{fontSize: '1rem', marginBottom: '0.4em'}}>{groupTitle}</h4>
                            <div className="import-collections-flat-books">
                                {renderGroupBooks(collatedCurated[groupTitle])}
                            </div>
                        </div>
                    )
                })}
                {Object.keys(notCollatedCurated).length > 0 ? (
                    <div className="import-collections-flat-group" style={{marginBottom: '0.8em'}}>
                        <h4 className="import-collections-flat-heading" style={{fontSize: '1rem', marginBottom: '0.4em'}}>Other</h4>
                        <div className="import-collections-flat-books">
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
