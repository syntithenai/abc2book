import {Link} from 'react-router-dom'
import {Button, ButtonGroup} from 'react-bootstrap'
import ImportCollectionsAccordion from '../components/ImportCollectionsAccordion'
import {useEffect, useState, useCallback} from 'react'
import TuneBookOptionsModal from '../components/TuneBookOptionsModal'
import {useNavigate} from 'react-router-dom'
import YourFilters from '../components/YourFilters'
import CollectionNav from '../components/CollectionNav'
import {
  BOOKS_PAGE_SECTIONS,
  consumeBooksPageScrollTarget,
  getRecentTunes,
} from '../recentTunes'
import { trackBookSectionClick } from '../analytics'

const BOOK_SECTION_NAMES = {
  [BOOKS_PAGE_SECTIONS.filters]: 'filters',
  [BOOKS_PAGE_SECTIONS.recent]: 'recent',
  [BOOKS_PAGE_SECTIONS.books]: 'books',
  [BOOKS_PAGE_SECTIONS.tags]: 'tags',
}

export default function BooksPage(props) {
    const { defaultTab, tunebook } = props
    const navigate = useNavigate()
    const [searchFilter, setSearchFilter] = useState('')
    const [searchTagFilter, setSearchTagFilter] = useState('')
    const [tagImageIsHidden, setTagImageIsHidden] = useState({})
    const [myBookImageIsHidden, setMyBookImageIsHidden] = useState({})
    const [savedFilterCount, setSavedFilterCount] = useState(0)

    function hideTagImage(key) {
        var v = tagImageIsHidden
        v[key] = true
        setTagImageIsHidden(v)
    }

    function hideMyBookImage(key) {
        var v = myBookImageIsHidden
        v[key] = true
        setMyBookImageIsHidden(v)
    }

    const scrollToSection = useCallback(function(sectionId) {
        tunebook.utils.scrollTo(sectionId, 70)
    }, [tunebook])

    function trackAndScrollToSection(sectionId) {
        const section = BOOK_SECTION_NAMES[sectionId]
        if (section) trackBookSectionClick(section)
        scrollToSection(sectionId)
    }

    useEffect(function() {
        const queued = consumeBooksPageScrollTarget()
        const target = queued
            || (defaultTab === 'tags' ? BOOKS_PAGE_SECTIONS.tags : null)
        if (target) {
            setTimeout(function() {
                scrollToSection(target)
            }, 300)
        }
    }, [defaultTab, scrollToSection])

    var tbOptions = Object.keys(props.tunebook.getTuneBookOptions()).filter(function(a) {return (a && a.length > 0)})
    var tagOptions = Object.keys(props.tunebook.getTuneTagOptions()).filter(function(a) {return (a && a.length > 0)})
    tbOptions.sort(function(a,b) {if (a > b) return 1; else return -1})
    tagOptions.sort(function(a,b) {if (a > b) return 1; else return -1})
    const recentTunes = getRecentTunes(props.tunes)

    return <div className="App-books books-page">
        <div style={{clear:'both', width:'100%'}}>
            {tbOptions.length > 0 && <div>
                <CollectionNav
                    className="books-page-nav"
                    tunebook={props.tunebook}
                    tbCount={tbOptions.length}
                    tagCount={tagOptions.length}
                    savedFilterCount={savedFilterCount}
                    onSectionClick={trackAndScrollToSection}
                />

                <section id={BOOKS_PAGE_SECTIONS.filters} className="books-page-section">
                    <h3 className="books-page-section-title">Filters</h3>
                    <YourFilters
                        embedded
                        showWhenEmpty
                        onFiltersChange={function(list) { setSavedFilterCount(Object.keys(list || {}).length) }}
                        tunebook={props.tunebook}
                        setFilter={props.setFilter}
                        setGroupBy={props.setGroupBy}
                        setTagFilter={props.setTagFilter}
                        setCurrentTuneBook={props.setCurrentTuneBook}
                        forceRefresh={props.forceRefresh}
                    />
                </section>

                <section id={BOOKS_PAGE_SECTIONS.recent} className="books-page-section">
                    <h3 className="books-page-section-title">Recent</h3>
                    {recentTunes.length > 0 ? (
                        <div className="books-page-recent-list">
                            {recentTunes.map(function(tune) {
                                return (
                                    <Link
                                        key={tune.id}
                                        to={'/tunes/' + tune.id}
                                        style={{textDecoration:'none'}}
                                        onClick={function() {
                                            if (props.setCurrentTune) props.setCurrentTune(tune.id)
                                        }}
                                    >
                                        <Button variant="primary" className="books-page-recent-btn">
                                            {tune.name && tune.name.trim().length > 0 ? tune.name : 'Untitled Song'}
                                        </Button>
                                    </Link>
                                )
                            })}
                        </div>
                    ) : (
                        <p className="books-page-recent-empty">Open a tune from search to see it here.</p>
                    )}
                </section>

                <section id={BOOKS_PAGE_SECTIONS.books} className="books-page-section">
                    <h3 className="books-page-section-title">Your Books</h3>
                    <input className="books-page-section-search" type="search" value={searchFilter} onChange={function(e) {setSearchFilter(e.target.value)}} />
                    <div className="books-page-grid">
                        {tbOptions.map(function(option, ok) {
                            if (option && option.trim().length > 0 && ((searchFilter.trim && searchFilter.trim() === '') || searchFilter.trim && option.trim().indexOf(searchFilter.trim()) !== -1)) {
                                return <ButtonGroup key={ok} className="books-page-book-card" variant="primary" onClick={function(e) {props.setCurrentTuneBook(option); props.setTagFilter(''); props.setFilter('')}}>
                                    <TuneBookOptionsModal tunebook={props.tunebook} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook} googleDocumentId={props.googleDocumentId} token={props.token} fillMediaPlaylist={props.tunebook.fillMediaPlaylist} fillAbcPlaylist={props.tunebook.fillAbcPlaylist} tunebookOption={option} user={props.user} btnClassName="books-page-collection-card-side" />
                                    <Link to="/tunes" className="books-page-collection-card-link" style={{textDecoration:'none'}}>
                                        <Button variant="primary" className="books-page-collection-card-main">
                                            <span className="books-page-collection-card-label">{option}</span>
                                            {!myBookImageIsHidden[ok] && <img className="books-page-collection-card-cover" src={"/book_images/"+option.replaceAll(" ","")+".jpeg"} onError={function() {hideMyBookImage(ok)}} alt="" />}
                                        </Button>
                                    </Link>
                                    <Button className="books-page-collection-card-side" onClick={function(e) {e.stopPropagation(); props.tunebook.fillMediaPlaylist(option); navigate("/tunes")}} variant="primary">{props.tunebook.icons.playwhite}</Button>
                                </ButtonGroup>
                            }
                            return null
                        })}
                    </div>
                </section>

                <section id={BOOKS_PAGE_SECTIONS.tags} className="books-page-section">
                    <h3 className="books-page-section-title">Your Tags</h3>
                    <input className="books-page-section-search" type="search" value={searchTagFilter} onChange={function(e) {setSearchTagFilter(e.target.value)}} />
                    <div className="books-page-grid">
                        {tagOptions.map(function(option, ok) {
                            if (option && option.trim().length > 0 && ((searchTagFilter.trim && searchTagFilter.trim() === '') || searchTagFilter.trim && option.trim().indexOf(searchTagFilter.trim()) !== -1)) {
                                return <ButtonGroup key={ok} className="books-page-tag-card" variant="primary">
                                    <Button className="books-page-collection-card-main" variant="primary" onClick={function(e) {props.setTagFilter([option]); props.setCurrentTuneBook(''); props.setFilter(''); navigate('/tunes')}}>
                                        <span className="books-page-collection-card-label">{option}</span>
                                        {!tagImageIsHidden[ok] && <img className="books-page-collection-card-cover" src={"/book_images/"+option.replaceAll(" ","")+".jpeg"} onError={function() {hideTagImage(ok)}} alt="" />}
                                    </Button>
                                    <Button className="books-page-collection-card-side" variant="primary" onClick={function() {
                                        props.setTagFilter([option])
                                        props.setCurrentTuneBook('')
                                        props.setFilter('')
                                        props.tunebook.fillMediaPlaylist('', '', [option])
                                        navigate("/tunes")
                                    }}>{props.tunebook.icons.playwhite}</Button>
                                </ButtonGroup>
                            }
                            return null
                        })}
                    </div>
                </section>
            </div>}

            {tbOptions.length === 0 && <div>
                <h4>Import a Book</h4>
                <div>
                    <hr/>
                    <div style={{marginTop:'1em'}}>
                    This tune book software helps musicians collect and organise and practice their music.
                    </div>
                    <div style={{marginTop:'1em'}}>
                    The software helps you to find and manage lyrics and music from the Internet and provides tools to help tidy up those resources into something you can play along with.
                    </div>
                    <div style={{marginTop:'1em',marginBottom:'1em'}}>
                    Import one of the curated tunebooks to get started.
                    </div>
                    <ImportCollectionsAccordion tunebook={props.tunebook} setCurrentTuneBook={props.setCurrentTuneBook} />
                </div>
            </div>}

            <div style={{float:'left', width:'100%'}}>
                <hr/>
                <div style={{marginTop:'1em', float:'right'}}>
                The Tune Book is <br/>
                <a target="_blank" rel="noreferrer" href="https://github.com/syntithenai/abc2book/"><Button><img style={{maxHeight:'1.5em'}} src="opensource.svg" alt="" /> Open Source Software</Button></a>
                </div>
            </div>
        </div>
    </div>
}
