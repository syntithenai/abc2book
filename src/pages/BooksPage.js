import {Link} from 'react-router-dom'
import {Button, InputGroup, Form} from 'react-bootstrap'
import ImportCollectionsAccordion from '../components/ImportCollectionsAccordion'
import {useEffect, useState, useCallback, useRef} from 'react'
import TuneBookOptionsModal from '../components/TuneBookOptionsModal'
import {useNavigate} from 'react-router-dom'
import YourFilters from '../components/YourFilters'
import CollectionNav from '../components/CollectionNav'
import FieldVoiceFillButton from '../components/FieldVoiceFillButton'
import {
  BOOKS_PAGE_SECTIONS,
  RECENT_ARTISTS_DEFAULT,
  RECENT_TUNES_DEFAULT,
  RECENT_TUNES_EXPANDED,
  consumeBooksPageScrollTarget,
  getRecentArtists,
  getRecentTunes,
  getStarredTunes,
  scrollBooksPageSection,
} from '../recentTunes'
import { trackBookSectionClick } from '../analytics'
import { resolvePlaybackForItem } from '../nowPlayingQueue'
import { requestNavigatePlayback } from '../tunePlaybackActions'
import { generateCurrentPlaylist } from '../generateCurrentPlaylist'
import { createQueue } from '../nowPlayingQueue'
import { toast } from 'react-toastify'
import { isMobilePlatform } from '../platformUtils'
import StarToggleButton from '../components/StarToggleButton'
import TuneListPlaybackButtons from '../components/TuneListPlaybackButtons'
import PlayWithQueueDropdown from '../components/PlayWithQueueDropdown'
import { getPlayableTuneIdsForCollection } from '../collectionQueueUtils'
import { appendTunesToQueue, insertTunesAfterCurrentInQueue } from '../nowPlayingQueue'
import { useDocumentTitle } from '../pageTitle'
import useMediaResolverHealth from '../useMediaResolverHealth'
import { shouldShowMusicCollectionBrowseEntry } from '../musicCollectionBrowseAccess'

const BOOK_SECTION_NAMES = {
  [BOOKS_PAGE_SECTIONS.filters]: 'filters',
  [BOOKS_PAGE_SECTIONS.recent]: 'recent',
  [BOOKS_PAGE_SECTIONS.starred]: 'starred',
  [BOOKS_PAGE_SECTIONS.books]: 'books',
  [BOOKS_PAGE_SECTIONS.tags]: 'tags',
  [BOOKS_PAGE_SECTIONS.genres]: 'genres',
  [BOOKS_PAGE_SECTIONS.artists]: 'artists',
}

function matchesSectionSearch(option, searchValue) {
  var needle = (searchValue && searchValue.trim) ? searchValue.trim().toLowerCase() : ''
  if (!needle) return true
  if (option == null || !String(option).trim()) return false
  return String(option).toLowerCase().indexOf(needle) !== -1
}

export default function BooksPage(props) {
    const { defaultTab, tunebook } = props
    const navigate = useNavigate()
    const { status: resolverStatus } = useMediaResolverHealth()
    const showLibraryBrowseButton = shouldShowMusicCollectionBrowseEntry({
        resolverStatus: resolverStatus,
        accessToken: props.token,
    })
    useDocumentTitle(defaultTab === 'tags' ? 'Tags' : 'Books')
    const [sectionSearch, setSectionSearch] = useState('')
    const [tagImageIsHidden, setTagImageIsHidden] = useState({})
    const [genreImageIsHidden, setGenreImageIsHidden] = useState({})
    const [artistImageIsHidden, setArtistImageIsHidden] = useState({})
    const [myBookImageIsHidden, setMyBookImageIsHidden] = useState({})
    const [savedFilterCount, setSavedFilterCount] = useState(0)
    const [showMoreRecent, setShowMoreRecent] = useState(false)
    const [showMoreStarred, setShowMoreStarred] = useState(false)
    const [showMoreArtists, setShowMoreArtists] = useState(false)
    const sectionSearchRef = useRef(null)

    useEffect(function() {
        if (isMobilePlatform()) return
        var input = sectionSearchRef.current
        if (input && typeof input.focus === 'function') input.focus()
    }, [])

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
    var recentArtistKeys = {}
    var recentArtistsFiltered = []
    getRecentArtists(props.tunes).forEach(function(artist) {
        if (!matchesSectionSearch(artist, sectionSearch)) return
        var key = String(artist).toLowerCase()
        if (recentArtistKeys[key]) return
        recentArtistKeys[key] = true
        recentArtistsFiltered.push(artist)
    })
    var remainingArtistsFiltered = []
    artistOptions.forEach(function(artist) {
        if (!matchesSectionSearch(artist, sectionSearch)) return
        var key = String(artist).toLowerCase()
        if (recentArtistKeys[key]) return
        remainingArtistsFiltered.push(artist)
    })
    // Prefer recently viewed; if none yet, fall back to the full alphabetical list.
    var artistsPrimary = recentArtistsFiltered.length > 0
        ? recentArtistsFiltered
        : remainingArtistsFiltered
    var artistsExtra = recentArtistsFiltered.length > 0
        ? remainingArtistsFiltered
        : []
    const artistsExpanded = artistsPrimary.concat(artistsExtra)
    const artistsCollapsed = artistsPrimary.slice(0, RECENT_ARTISTS_DEFAULT)
    const artistsShown = showMoreArtists ? artistsExpanded : artistsCollapsed
    const canToggleArtists = artistsExpanded.length > artistsCollapsed.length
    const recentTunesExpanded = getRecentTunes(props.tunes, RECENT_TUNES_EXPANDED)
        .filter(function(tune) {
            return matchesSectionSearch(tune && tune.name ? tune.name : '', sectionSearch)
        })
    const recentTunes = showMoreRecent
        ? recentTunesExpanded
        : recentTunesExpanded.slice(0, RECENT_TUNES_DEFAULT)
    const canToggleRecent = recentTunesExpanded.length > RECENT_TUNES_DEFAULT
    const starredTunesExpanded = getStarredTunes(props.tunes)
        .filter(function(tune) {
            return matchesSectionSearch(tune && tune.name ? tune.name : '', sectionSearch)
        })
    const starredTunes = showMoreStarred
        ? starredTunesExpanded
        : starredTunesExpanded.slice(0, RECENT_TUNES_DEFAULT)
    const canToggleStarred = starredTunesExpanded.length > RECENT_TUNES_DEFAULT
    const starredCount = getStarredTunes(props.tunes).length

    function renderSongLinkButton(tune) {
        return (
            <div key={tune.id} className="books-page-song-link" role="group">
                <StarToggleButton
                    className="books-page-song-star-btn"
                    tunebook={props.tunebook}
                    tune={tune}
                    forceRefresh={props.forceRefresh}
                />
                <Link
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
                <TuneListPlaybackButtons
                    tune={tune}
                    tunebook={props.tunebook}
                    mediaController={props.mediaController}
                    tunes={props.tunes}
                    nowPlayingQueue={props.nowPlayingQueue}
                    setNowPlayingQueue={props.setNowPlayingQueue}
                    setQueuePlayConfirm={props.setQueuePlayConfirm}
                    nowPlayingTuneId={props.mediaController && props.mediaController.tune && props.mediaController.tune.id}
                    playVariant="primary"
                    playIcon={props.tunebook.icons.playwhite}
                    className="books-page-song-play"
                    onContainerClick={function(e) { e.stopPropagation() }}
                />
            </div>
        )
    }

    function renderCollectionPlayControl(book, tags, genres, artists, applyFilterFn) {
        const filter = { book: book, tags: tags, genres: genres, artists: artists }
        const tuneIds = getPlayableTuneIdsForCollection(props.tunebook, props.tunes, filter)

        function handleAddToQueue(event) {
            event.preventDefault()
            event.stopPropagation()
            if (!props.setNowPlayingQueue || !tuneIds.length) return
            props.setNowPlayingQueue(appendTunesToQueue(props.nowPlayingQueue, tuneIds))
        }

        function handlePlayNext(event) {
            event.preventDefault()
            event.stopPropagation()
            if (!props.setNowPlayingQueue || !tuneIds.length) return
            props.setNowPlayingQueue(insertTunesAfterCurrentInQueue(props.nowPlayingQueue, tuneIds))
        }

        return (
            <PlayWithQueueDropdown
                variant="collection-side"
                playVariant="primary"
                playIcon={props.tunebook.icons.playwhite}
                onPlay={function(e) {
                    e.preventDefault()
                    e.stopPropagation()
                    playFilteredCollection(book, tags, genres, artists, applyFilterFn)
                }}
                onAddToQueue={props.setNowPlayingQueue && tuneIds.length ? handleAddToQueue : null}
                onPlayNext={props.setNowPlayingQueue && tuneIds.length ? handlePlayNext : null}
                addToQueueLabel="Add all to queue"
                playNextLabel="Play all next"
                onContainerClick={function(e) { e.stopPropagation() }}
            />
        )
    }

    function clearCollectionFilters() {
        props.setTagFilter([])
        if (props.setGenreFilter) props.setGenreFilter([])
        if (props.setArtistFilter) props.setArtistFilter([])
        if (props.setAlbumFilter) props.setAlbumFilter([])
        props.setCurrentTuneBook('')
        props.setFilter('')
    }

    function applyBookFilter(option) {
        props.setCurrentTuneBook(option)
        props.setTagFilter([])
        if (props.setGenreFilter) props.setGenreFilter([])
        if (props.setArtistFilter) props.setArtistFilter([])
        if (props.setAlbumFilter) props.setAlbumFilter([])
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

        // 3) Arm a pending play request, then navigate so playback starts when
        //    the play route mounts (same path as books-page per-tune play).
        var item = { tuneId: tuneId, prefer: 'auto' }
        var target = resolvePlaybackForItem(tune, item, props.tunebook)
        if (!target || target.type === 'external') {
            navigate('/tunes')
            return
        }
        var normalizedTarget = target.type === 'midi'
            ? { type: 'midi' }
            : { type: 'media', linkNum: target.linkNum != null ? target.linkNum : 0 }
        requestNavigatePlayback(
            mediaController,
            props.tunebook,
            navigate,
            tune,
            normalizedTarget
        )
    }

    function handleGeneratePlaylist() {
        var result = generateCurrentPlaylist(props.tunebook, props.tunes, {
            forceRefresh: props.forceRefresh,
        })
        if (!result.tuneIds || result.tuneIds.length === 0) {
            toast.warn('No matching tunes found — open some tunes first to build a playlist.')
            return
        }
        var queue = createQueue({
            tuneIds: result.tuneIds,
            name: 'Recent tunes',
            source: 'manual',
        })
        props.tunebook.startNowPlayingQueue(queue, props.tunebook.navigate, {
            startPlayback: true,
            mediaController: props.mediaController,
        })
    }

    return <div className="App-books books-page">
        <div style={{clear:'both', width:'100%'}}>
            {tbOptions.length > 0 && <div>
                <CollectionNav
                    className="books-page-nav"
                    tunebook={props.tunebook}
                    tuneCount={props.tunes ? Object.keys(props.tunes).length : 0}
                    tbCount={tbOptions.length}
                    tagCount={tagOptions.length}
                    genreCount={genreOptions.length}
                    artistCount={artistOptions.length}
                    savedFilterCount={savedFilterCount}
                    starredCount={starredCount}
                    showGenerate={true}
                    onGenerate={handleGeneratePlaylist}
                    onSectionClick={trackAndScrollToSection}
                />

                <InputGroup className="books-page-top-search-wrap">
                    <Button
                        type="button"
                        variant="secondary"
                        className="books-page-top-search-icon"
                        tabIndex={-1}
                        aria-hidden="true"
                    >
                        {props.tunebook.icons.search}
                    </Button>
                    <Form.Control
                        ref={sectionSearchRef}
                        className="books-page-top-search"
                        type="search"
                        placeholder="Filter books, tags, genres, artists…"
                        value={sectionSearch}
                        aria-label="Filter all sections"
                        onChange={function(e) { setSectionSearch(e.target.value) }}
                    />
                    <FieldVoiceFillButton
                        fieldKind="search"
                        token={props.token}
                        setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                        onFill={function(text) { setSectionSearch(text) }}
                    />
                </InputGroup>

                <section id={BOOKS_PAGE_SECTIONS.filters} className="books-page-section">
                    <div className="books-page-section-title-row">
                        <h3 className="books-page-section-title">Filters</h3>
                        {showLibraryBrowseButton ? (
                            <Button
                                as={Link}
                                to="/library"
                                variant="secondary"
                                size="sm"
                                className="books-page-browse-library-btn"
                                data-testid="browse-library-button"
                                title="Browse resolver music collection by folder, artist, album, and genre"
                            >
                                {props.tunebook.icons.album} Browse Library
                            </Button>
                        ) : null}
                    </div>
                    <YourFilters
                        embedded
                        showWhenEmpty
                        nameFilter={sectionSearch}
                        onFiltersChange={function(list) { setSavedFilterCount(Object.keys(list || {}).length) }}
                        tunebook={props.tunebook}
                        setFilter={props.setFilter}
                        setGroupBy={props.setGroupBy}
                        setTagFilter={props.setTagFilter}
                        setGenreFilter={props.setGenreFilter}
                        setArtistFilter={props.setArtistFilter}
                        setAlbumFilter={props.setAlbumFilter}
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
                                    return renderSongLinkButton(tune)
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
                        <p className="books-page-recent-empty">
                            {sectionSearch.trim()
                                ? 'No matching recent tunes.'
                                : 'Open a tune from search to see it here.'}
                        </p>
                    )}
                </section>

                <section id={BOOKS_PAGE_SECTIONS.starred} className="books-page-section">
                    <h3 className="books-page-section-title">Starred</h3>
                    {starredTunes.length > 0 ? (
                        <>
                            <div className="books-page-recent-list">
                                {starredTunes.map(function(tune) {
                                    return renderSongLinkButton(tune)
                                })}
                            </div>
                            {canToggleStarred ? (
                                <Button
                                    variant="outline-secondary"
                                    size="sm"
                                    className="books-page-recent-toggle"
                                    onClick={function() { setShowMoreStarred(!showMoreStarred) }}
                                >
                                    {showMoreStarred ? 'show less' : 'show more'}
                                </Button>
                            ) : null}
                        </>
                    ) : (
                        <p className="books-page-recent-empty">
                            {sectionSearch.trim()
                                ? 'No matching starred tunes.'
                                : 'Star a tune to see it here.'}
                        </p>
                    )}
                </section>

                <section id={BOOKS_PAGE_SECTIONS.books} className="books-page-section">
                    <h3 className="books-page-section-title">Books</h3>
                    <div className="books-page-grid">
                        {tbOptions.map(function(option, ok) {
                            if (matchesSectionSearch(option, sectionSearch)) {
                                return <div key={ok} className="books-page-book-card" role="group">
                                    <TuneBookOptionsModal tunebook={props.tunebook} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook} googleDocumentId={props.googleDocumentId} token={props.token} login={props.login} tunes={props.tunes} fillMediaPlaylist={props.tunebook.fillMediaPlaylist} fillAbcPlaylist={props.tunebook.fillAbcPlaylist} tunebookOption={option} user={props.user} btnClassName="books-page-collection-card-side" />
                                    <Link to="/tunes" className="books-page-collection-card-link" style={{textDecoration:'none'}} onClick={function() { applyBookFilter(option) }}>
                                        <Button variant="primary" className="books-page-collection-card-main">
                                            <span className="books-page-collection-card-label">{option.toLowerCase()}</span>
                                            {!myBookImageIsHidden[ok] && <img className="books-page-collection-card-cover" src={"/book_images/"+option.replaceAll(" ","")+".jpeg"} onError={function() {hideMyBookImage(ok)}} alt="" />}
                                        </Button>
                                    </Link>
                                    {renderCollectionPlayControl(option, null, null, null, function() { applyBookFilter(option) })}
                                </div>
                            }
                            return null
                        })}
                    </div>
                </section>

                <section id={BOOKS_PAGE_SECTIONS.tags} className="books-page-section">
                    <h3 className="books-page-section-title">Tags</h3>
                    <div className="books-page-grid">
                        {tagOptions.map(function(option, ok) {
                            if (matchesSectionSearch(option, sectionSearch)) {
                                return <div key={ok} className="books-page-tag-card" role="group">
                                    <Button className="books-page-collection-card-main" variant="primary" onClick={function(e) {applyTagFilter(option); navigate('/tunes')}}>
                                        <span className="books-page-collection-card-label">{option.toLowerCase()}</span>
                                        {!tagImageIsHidden[ok] && <img className="books-page-collection-card-cover" src={"/book_images/"+option.replaceAll(" ","")+".jpeg"} onError={function() {hideTagImage(ok)}} alt="" />}
                                    </Button>
                                    {renderCollectionPlayControl('', [option], null, null, function() { applyTagFilter(option) })}
                                </div>
                            }
                            return null
                        })}
                    </div>
                </section>

                <section id={BOOKS_PAGE_SECTIONS.genres} className="books-page-section">
                    <h3 className="books-page-section-title">Genres</h3>
                    <div className="books-page-grid">
                        {genreOptions.map(function(option, ok) {
                            if (matchesSectionSearch(option, sectionSearch)) {
                                return <div key={ok} className="books-page-tag-card" role="group">
                                    <Button className="books-page-collection-card-main" variant="primary" onClick={function(e) {applyGenreFilter(option); navigate('/tunes')}}>
                                        <span className="books-page-collection-card-label">{option.toLowerCase()}</span>
                                        {!genreImageIsHidden[ok] && <img className="books-page-collection-card-cover" src={"/book_images/"+option.replaceAll(" ","")+".jpeg"} onError={function() {hideGenreImage(ok)}} alt="" />}
                                    </Button>
                                    {renderCollectionPlayControl('', [], [option], null, function() { applyGenreFilter(option) })}
                                </div>
                            }
                            return null
                        })}
                    </div>
                </section>

                <section id={BOOKS_PAGE_SECTIONS.artists} className="books-page-section">
                    <h3 className="books-page-section-title">Artists</h3>
                    {artistsShown.length > 0 ? (
                        <>
                            <div className="books-page-grid">
                                {artistsShown.map(function(option) {
                                    return <div key={option} className="books-page-tag-card" role="group">
                                        <Button className="books-page-collection-card-main" variant="primary" onClick={function(e) {applyArtistFilter(option); navigate('/tunes')}}>
                                            <span className="books-page-collection-card-label">{option.toLowerCase()}</span>
                                            {!artistImageIsHidden[option] && <img className="books-page-collection-card-cover" src={"/book_images/"+option.replaceAll(" ","")+".jpeg"} onError={function() {hideArtistImage(option)}} alt="" />}
                                        </Button>
                                        {renderCollectionPlayControl('', [], [], [option], function() { applyArtistFilter(option) })}
                                    </div>
                                })}
                            </div>
                            {canToggleArtists ? (
                                <Button
                                    variant="outline-secondary"
                                    size="sm"
                                    className="books-page-recent-toggle"
                                    onClick={function() { setShowMoreArtists(!showMoreArtists) }}
                                >
                                    {showMoreArtists ? 'show less' : 'show more'}
                                </Button>
                            ) : null}
                        </>
                    ) : (
                        <p className="books-page-recent-empty">
                            {sectionSearch.trim()
                                ? 'No matching artists.'
                                : 'Open tunes with artists to see them here.'}
                        </p>
                    )}
                </section>
            </div>}

            {tbOptions.length === 0 && <div className="books-page-empty" data-testid="books-page-empty">
                <h3 className="books-page-empty-title">Getting Started</h3>
                <p className="books-page-empty-lead">
                    This software helps musicians collect, organise, and practice music — find lyrics and scores online, then tidy them into something you can play along with.
                </p>
                <p className="books-page-empty-cta">
                    Click <strong>Add</strong> to bring in your own tunes, or import from the curated list below.
                </p>
                <Button
                    as={Link}
                    to="/add"
                    variant="success"
                    size="lg"
                    className="books-page-empty-add-btn"
                    title="Add Tunes"
                    data-testid="books-page-add-button"
                >
                    {props.tunebook.icons.fileadd} Add
                </Button>
                <ImportCollectionsAccordion
                    tunebook={props.tunebook}
                    setCurrentTuneBook={props.setCurrentTuneBook}
                    flat
                    hideGroupHeadings
                />
            </div>}

            {tbOptions.length > 0 ? (
                <section
                    id="books-curated"
                    className="books-page-section books-page-curated-section"
                    data-testid="books-curated-section"
                    style={{ marginTop: '1.5em' }}
                >
                    <h3 className="books-page-section-title">Curated books</h3>
                    <ImportCollectionsAccordion
                        tunebook={props.tunebook}
                        setCurrentTuneBook={props.setCurrentTuneBook}
                        flat
                    />
                </section>
            ) : null}

            <div className="books-page-meta">
                <div className="books-page-meta-row">
                    <div className="books-page-meta-center">
                        <span>Copyleft Steve Ryan {'<'}<a href="mailto:syntithenai@gmail.com">syntithenai@gmail.com</a>{'>'}</span>
                        <span className="books-page-meta-sep" aria-hidden="true">·</span>
                        <Link to="/privacy">Privacy Policy</Link>
                    </div>
                    <div className="books-page-meta-right">
                        <Button
                            as="a"
                            target="_blank"
                            rel="noreferrer"
                            href="https://github.com/syntithenai/abc2book/"
                            size="sm"
                            variant="primary"
                            className="books-page-meta-opensource-btn"
                        >
                            <svg className="books-page-meta-github-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                                <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
                            </svg>
                            {' '}Open Source Software
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    </div>
}
