import {Link} from 'react-router-dom'
import {Button, ButtonGroup} from 'react-bootstrap'
import ImportCollectionsAccordion from '../components/ImportCollectionsAccordion'
import AddSongModal from '../components/AddSongModal'
import {useEffect, useState, useCallback} from 'react'
import TuneBookOptionsModal from '../components/TuneBookOptionsModal'
import {useNavigate} from 'react-router-dom'
import YourFilters from '../components/YourFilters'
import CollectionNav from '../components/CollectionNav'
import {
  BOOKS_PAGE_SECTIONS,
  RECENT_TUNES_DEFAULT,
  RECENT_TUNES_EXPANDED,
  consumeBooksPageScrollTarget,
  getRecentTunes,
  scrollBooksPageSection,
} from '../recentTunes'
import { trackBookSectionClick } from '../analytics'
import { playQueueItem, navigateToQueueTune } from '../nowPlayingQueuePlayback'

const BOOK_SECTION_NAMES = {
  [BOOKS_PAGE_SECTIONS.filters]: 'filters',
  [BOOKS_PAGE_SECTIONS.recent]: 'recent',
  [BOOKS_PAGE_SECTIONS.books]: 'books',
  [BOOKS_PAGE_SECTIONS.tags]: 'tags',
  [BOOKS_PAGE_SECTIONS.genres]: 'genres',
  [BOOKS_PAGE_SECTIONS.artists]: 'artists',
}

function matchesSectionSearch(option, searchValue) {
  if (!option || !option.trim()) return false
  var needle = (searchValue && searchValue.trim) ? searchValue.trim().toLowerCase() : ''
  if (!needle) return true
  return option.toLowerCase().indexOf(needle) !== -1
}

export default function BooksPage(props) {
    const { defaultTab, tunebook } = props
    const navigate = useNavigate()
    const [searchFilter, setSearchFilter] = useState('')
    const [searchTagFilter, setSearchTagFilter] = useState('')
    const [searchGenreFilter, setSearchGenreFilter] = useState('')
    const [searchArtistFilter, setSearchArtistFilter] = useState('')
    const [tagImageIsHidden, setTagImageIsHidden] = useState({})
    const [genreImageIsHidden, setGenreImageIsHidden] = useState({})
    const [artistImageIsHidden, setArtistImageIsHidden] = useState({})
    const [myBookImageIsHidden, setMyBookImageIsHidden] = useState({})
    const [savedFilterCount, setSavedFilterCount] = useState(0)
    const [showMoreRecent, setShowMoreRecent] = useState(false)

    function hideTagImage(key) {
        var v = tagImageIsHidden
        v[key] = true
        setTagImageIsHidden(v)
    }

    function hideGenreImage(key) {
        var v = genreImageIsHidden
        v[key] = true
        setGenreImageIsHidden(v)
    }

    function hideArtistImage(key) {
        var v = artistImageIsHidden
        v[key] = true
        setArtistImageIsHidden(v)
    }

    function hideMyBookImage(key) {
        var v = myBookImageIsHidden
        v[key] = true
        setMyBookImageIsHidden(v)
    }

    const scrollToSection = useCallback(function(sectionId) {
        scrollBooksPageSection(sectionId)
    }, [])

    function trackAndScrollToSection(sectionId) {
        const section = BOOK_SECTION_NAMES[sectionId]
        if (section) trackBookSectionClick(section)
        scrollToSection(sectionId)
    }

    useEffect(function() {
        const queued = consumeBooksPageScrollTarget()
        const target = queued
            || (defaultTab === 'tags' ? BOOKS_PAGE_SECTIONS.tags : null)
            || (defaultTab === 'genres' ? BOOKS_PAGE_SECTIONS.genres : null)
            || (defaultTab === 'artists' ? BOOKS_PAGE_SECTIONS.artists : null)
        if (target) {
            setTimeout(function() {
                scrollToSection(target)
            }, 300)
        }
    }, [defaultTab, scrollToSection])

    var tbOptions = Object.keys(props.tunebook.getTuneBookOptions()).filter(function(a) {return (a && a.length > 0)})
    var tagOptions = Object.keys(props.tunebook.getTuneTagOptions()).filter(function(a) {return (a && a.length > 0)})
    var genreOptions = Object.keys(props.tunebook.getTuneGenreOptions()).filter(function(a) {return (a && a.length > 0)})
    var artistOptions = Object.keys(props.tunebook.getTuneArtistOptions()).filter(function(a) {return (a && a.length > 0)})
    tbOptions.sort(function(a,b) {if (a.toLowerCase() > b.toLowerCase()) return 1; else return -1})
    tagOptions.sort(function(a,b) {if (a.toLowerCase() > b.toLowerCase()) return 1; else return -1})
    genreOptions.sort(function(a,b) {if (a.toLowerCase() > b.toLowerCase()) return 1; else return -1})
    artistOptions.sort(function(a,b) {if (a.toLowerCase() > b.toLowerCase()) return 1; else return -1})
    const recentTunesExpanded = getRecentTunes(props.tunes, RECENT_TUNES_EXPANDED)
    const recentTunes = showMoreRecent
        ? recentTunesExpanded
        : recentTunesExpanded.slice(0, RECENT_TUNES_DEFAULT)
    const canToggleRecent = recentTunesExpanded.length > RECENT_TUNES_DEFAULT

    function clearCollectionFilters() {
        props.setTagFilter([])
        if (props.setGenreFilter) props.setGenreFilter([])
        if (props.setArtistFilter) props.setArtistFilter([])
        props.setCurrentTuneBook('')
        props.setFilter('')
    }

    function applyBookFilter(option) {
        props.setCurrentTuneBook(option)
        props.setTagFilter([])
        if (props.setGenreFilter) props.setGenreFilter([])
        if (props.setArtistFilter) props.setArtistFilter([])
        props.setFilter('')
    }

    function applyTagFilter(option) {
        clearCollectionFilters()
        props.setTagFilter([option])
    }

    function applyGenreFilter(option) {
        clearCollectionFilters()
        if (props.setGenreFilter) props.setGenreFilter([option])
    }

    function applyArtistFilter(option) {
        clearCollectionFilters()
        if (props.setArtistFilter) props.setArtistFilter([option])
    }

    function playFilteredCollection(book, tags, genres, artists, applyFilterFn) {
        // 1) Build the queue (no navigate yet — we drive navigation explicitly
        //    below so we can arm the playback engine first).
        if (typeof applyFilterFn === 'function') applyFilterFn()
        var tuneId = props.tunebook.fillAnyPlaylist(
            book || '',
            '',
            tags || [],
            null,
            genres || [],
            artists || []
        )
        if (!tuneId) {
            navigate('/tunes')
            return
        }

        var mediaController = props.mediaController
        var tune = props.tunes && props.tunes[tuneId]
        if (!mediaController || !tune) {
            navigate('/tunes')
            return
        }

        // 2) Unlock audio contexts inside the click gesture (required for the very
        //    first playback; later auto-advances rely on this already being unlocked).
        if (mediaController.preparePlaybackFromUserGesture) {
            mediaController.preparePlaybackFromUserGesture()
        }

        // 3) Arm the playback engine using the SAME proven path the queue uses when
        //    auto-advancing to a not-yet-mounted tune page: apply the route + arm
        //    intent now, then navigate. When the tune page mounts, its media/midi
        //    onReady handler starts playback (no play() call while unmounted).
        var item = { tuneId: tuneId, prefer: 'auto' }
        playQueueItem(mediaController, props.tunebook, tune, item, { deferPlaybackEngine: true })
        navigateToQueueTune(navigate, tuneId, item, props.tunebook, props.tunes)
    }

    return <div className="App-books books-page">
        <div style={{clear:'both', width:'100%'}}>
            {tbOptions.length > 0 && <div>
                <CollectionNav
                    className="books-page-nav"
                    tunebook={props.tunebook}
                    tbCount={tbOptions.length}
                    tagCount={tagOptions.length}
                    genreCount={genreOptions.length}
                    artistCount={artistOptions.length}
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
                        setGenreFilter={props.setGenreFilter}
                        setArtistFilter={props.setArtistFilter}
                        setCurrentTuneBook={props.setCurrentTuneBook}
                        forceRefresh={props.forceRefresh}
                    />
                </section>

                <section id={BOOKS_PAGE_SECTIONS.recent} className="books-page-section">
                    <h3 className="books-page-section-title">Recent</h3>
                    {recentTunes.length > 0 ? (
                        <>
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
                                                {tune.name && tune.name.trim().length > 0 ? tune.name.toLowerCase() : 'untitled song'}
                                            </Button>
                                        </Link>
                                    )
                                })}
                            </div>
                            {canToggleRecent ? (
                                <Button
                                    variant="outline-secondary"
                                    size="sm"
                                    className="books-page-recent-toggle"
                                    onClick={function() { setShowMoreRecent(!showMoreRecent) }}
                                >
                                    {showMoreRecent ? 'show less' : 'show more'}
                                </Button>
                            ) : null}
                        </>
                    ) : (
                        <p className="books-page-recent-empty">Open a tune from search to see it here.</p>
                    )}
                </section>

                <section id={BOOKS_PAGE_SECTIONS.books} className="books-page-section">
                    <h3 className="books-page-section-title">Books</h3>
                    <input className="books-page-section-search" type="search" value={searchFilter} onChange={function(e) {setSearchFilter(e.target.value)}} />
                    <div className="books-page-grid">
                        {tbOptions.map(function(option, ok) {
                            if (matchesSectionSearch(option, searchFilter)) {
                                return <ButtonGroup key={ok} className="books-page-book-card" variant="primary" onClick={function(e) {applyBookFilter(option)}}>
                                    <TuneBookOptionsModal tunebook={props.tunebook} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook} googleDocumentId={props.googleDocumentId} token={props.token} login={props.login} tunes={props.tunes} fillMediaPlaylist={props.tunebook.fillMediaPlaylist} fillAbcPlaylist={props.tunebook.fillAbcPlaylist} tunebookOption={option} user={props.user} btnClassName="books-page-collection-card-side" />
                                    <Link to="/tunes" className="books-page-collection-card-link" style={{textDecoration:'none'}}>
                                        <Button variant="primary" className="books-page-collection-card-main">
                                            <span className="books-page-collection-card-label">{option.toLowerCase()}</span>
                                            {!myBookImageIsHidden[ok] && <img className="books-page-collection-card-cover" src={"/book_images/"+option.replaceAll(" ","")+".jpeg"} onError={function() {hideMyBookImage(ok)}} alt="" />}
                                        </Button>
                                    </Link>
                                    <Button className="books-page-collection-card-side" onClick={function(e) {e.stopPropagation(); playFilteredCollection(option, null, null, null, function() { applyBookFilter(option) })}} variant="primary">{props.tunebook.icons.playwhite}</Button>
                                </ButtonGroup>
                            }
                            return null
                        })}
                    </div>
                </section>

                <section id={BOOKS_PAGE_SECTIONS.tags} className="books-page-section">
                    <h3 className="books-page-section-title">Tags</h3>
                    <input className="books-page-section-search" type="search" value={searchTagFilter} onChange={function(e) {setSearchTagFilter(e.target.value)}} />
                    <div className="books-page-grid">
                        {tagOptions.map(function(option, ok) {
                            if (matchesSectionSearch(option, searchTagFilter)) {
                                return <ButtonGroup key={ok} className="books-page-tag-card" variant="primary">
                                    <Button className="books-page-collection-card-main" variant="primary" onClick={function(e) {applyTagFilter(option); navigate('/tunes')}}>
                                        <span className="books-page-collection-card-label">{option.toLowerCase()}</span>
                                        {!tagImageIsHidden[ok] && <img className="books-page-collection-card-cover" src={"/book_images/"+option.replaceAll(" ","")+".jpeg"} onError={function() {hideTagImage(ok)}} alt="" />}
                                    </Button>
                                    <Button className="books-page-collection-card-side" variant="primary" onClick={function() {
                                        playFilteredCollection('', [option], null, null, function() { applyTagFilter(option) })
                                    }}>{props.tunebook.icons.playwhite}</Button>
                                </ButtonGroup>
                            }
                            return null
                        })}
                    </div>
                </section>

                <section id={BOOKS_PAGE_SECTIONS.genres} className="books-page-section">
                    <h3 className="books-page-section-title">Genres</h3>
                    <input className="books-page-section-search" type="search" value={searchGenreFilter} onChange={function(e) {setSearchGenreFilter(e.target.value)}} />
                    <div className="books-page-grid">
                        {genreOptions.map(function(option, ok) {
                            if (matchesSectionSearch(option, searchGenreFilter)) {
                                return <ButtonGroup key={ok} className="books-page-tag-card" variant="primary">
                                    <Button className="books-page-collection-card-main" variant="primary" onClick={function(e) {applyGenreFilter(option); navigate('/tunes')}}>
                                        <span className="books-page-collection-card-label">{option.toLowerCase()}</span>
                                        {!genreImageIsHidden[ok] && <img className="books-page-collection-card-cover" src={"/book_images/"+option.replaceAll(" ","")+".jpeg"} onError={function() {hideGenreImage(ok)}} alt="" />}
                                    </Button>
                                    <Button className="books-page-collection-card-side" variant="primary" onClick={function() {
                                        playFilteredCollection('', [], [option], null, function() { applyGenreFilter(option) })
                                    }}>{props.tunebook.icons.playwhite}</Button>
                                </ButtonGroup>
                            }
                            return null
                        })}
                    </div>
                </section>

                <section id={BOOKS_PAGE_SECTIONS.artists} className="books-page-section">
                    <h3 className="books-page-section-title">Artists</h3>
                    <input className="books-page-section-search" type="search" value={searchArtistFilter} onChange={function(e) {setSearchArtistFilter(e.target.value)}} />
                    <div className="books-page-grid">
                        {artistOptions.map(function(option, ok) {
                            if (matchesSectionSearch(option, searchArtistFilter)) {
                                return <ButtonGroup key={ok} className="books-page-tag-card" variant="primary">
                                    <Button className="books-page-collection-card-main" variant="primary" onClick={function(e) {applyArtistFilter(option); navigate('/tunes')}}>
                                        <span className="books-page-collection-card-label">{option.toLowerCase()}</span>
                                        {!artistImageIsHidden[ok] && <img className="books-page-collection-card-cover" src={"/book_images/"+option.replaceAll(" ","")+".jpeg"} onError={function() {hideArtistImage(ok)}} alt="" />}
                                    </Button>
                                    <Button className="books-page-collection-card-side" variant="primary" onClick={function() {
                                        playFilteredCollection('', [], [], [option], function() { applyArtistFilter(option) })
                                    }}>{props.tunebook.icons.playwhite}</Button>
                                </ButtonGroup>
                            }
                            return null
                        })}
                    </div>
                </section>
            </div>}

            {tbOptions.length === 0 && <div className="books-page-empty">
                <div className="books-page-empty-add">
                    <AddSongModal
                        buttonSize="lg"
                        setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                        tunes={props.tunes}
                        token={props.token}
                        requestGoogleScopes={props.requestGoogleScopes}
                        login={props.login}
                        tunesHash={props.tunesHash}
                        forceRefresh={props.forceRefresh}
                        filter={props.filter}
                        setFilter={props.setFilter}
                        tunebook={props.tunebook}
                        currentTuneBook={props.currentTuneBook}
                        setCurrentTuneBook={props.setCurrentTuneBook}
                        tagFilter={props.tagFilter}
                        setTagFilter={props.setTagFilter}
                        searchIndex={props.searchIndex}
                        loadTuneTexts={props.loadTuneTexts}
                        mediaController={props.mediaController}
                    />
                    <div className="books-page-empty-add-instructions">
                        <h4 className="books-page-empty-title">Get started</h4>
                        <p className="books-page-empty-lead">
                            Tap <strong>Add</strong> to bring tunes into your book — the same import tools as the header menu.
                        </p>
                        <ul className="books-page-empty-import-list">
                            <li><strong>Add</strong> tab — one tune at a time from ABC, MusicXML, chord sheets, pasted text, Google Drive, sheet photos, YouTube, or online search for notation and lyrics.</li>
                            <li><strong>Bulk</strong> tab — many tunes at once from a pasted list, file, YouTube playlist, or curated collection.</li>
                        </ul>
                    </div>
                </div>
                <hr/>
                <div style={{marginTop:'1em'}}>
                    This tune book software helps musicians collect and organise and practice their music.
                </div>
                <div style={{marginTop:'1em'}}>
                    The software helps you to find and manage lyrics and music from the Internet and provides tools to help tidy up those resources into something you can play along with.
                </div>
                <div style={{marginTop:'1em',marginBottom:'1em'}}>
                    Or import one of the curated tunebooks below.
                </div>
                <ImportCollectionsAccordion tunebook={props.tunebook} setCurrentTuneBook={props.setCurrentTuneBook} startCollapsed={false} />
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
