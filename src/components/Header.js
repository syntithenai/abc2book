import { Link  , useLocation} from 'react-router-dom'
import {Button, Dropdown, ButtonGroup} from 'react-bootstrap'
import SavedPlaylistsOpenModal from './SavedPlaylistsOpenModal'
import AccountModal from './AccountModal'
import { useState, useEffect, useRef, useSyncExternalStore} from 'react'
import {useNavigate} from 'react-router-dom'
import MediaPlayerButtons from './MediaPlayerButtons'
import PracticeSessionButton from './PracticeSessionButton'
import { PRACTICE_LISTS_ENABLED, PRACTICE_MODE_ENABLED } from '../practiceModeEnabled'
import { THEORY_SECTION_ENABLED } from '../theorySectionEnabled'
import VoiceCommandButton from './VoiceCommandButton'
import useKeyPress from '../useKeyPress';
import { useIsHeaderAuthHidden, useIsHeaderPlaybackInMenu, useIsNarrowViewport } from '../useMediaQuery';
import { PLAYBACK_VOLUME_STEP } from '../playbackVolumeSettings';
import { isQueueActive } from '../nowPlayingQueue';
import {
  getViewedTuneIdFromPath,
  getSkipNavigationTuneId,
  isQueuePlaybackEngaged,
  isTuneListPath,
  isTuneSingleViewPath,
} from '../playbackNavigationUtils';
import { toggleTunePlayback } from '../tunePlaybackActions';
import { isEditorNotationPath } from '../viewModeUtils';
import { OFFLINE_LOGIN_MESSAGE, useNavigatorOnline } from '../offlineNetwork';
import {
  isPlaybackInterruptPath,
  useToolPagePlaybackInterrupt,
} from '../toolPlaybackInterrupt';
import useMediaResolverHealth from '../useMediaResolverHealth';
import { resolveTunesListPath } from '../searchFilterParams';
import {
  getImportReviewSessionRevision,
  hasActiveImportReviewSession,
  isImportReviewUiVisible,
  openImportReviewFromToast,
  subscribeImportReviewSession,
} from '../importReviewSessionStore'
import {
  getBackgroundReviewRevision,
  getBackgroundReviewSummary,
  subscribeBackgroundReviewQueue,
} from '../backgroundReviewQueue'
import {
  subscribe as subscribeFieldLookupQueue,
} from '../tuneFieldLookupQueue'

export default function Header(props) {
    var location = useLocation()
    var navigate = useNavigate()
    //var params = useParams() // empty  ???
    var parts = location.pathname.split("/")
    var params = {tuneId: parts.length >= 3 ? parts[2] : null}
    const [userImageError, setUserImageError] = useState(false)
    const [showAccount, setShowAccount] = useState(false)
    const [showPlaylists, setShowPlaylists] = useState(false)
    const [navMenuOpen, setNavMenuOpen] = useState(false)
    const [listsMenuOpen, setListsMenuOpen] = useState(false)
    const navigatorOnline = useNavigatorOnline()
    const importReviewRevision = useSyncExternalStore(
        subscribeImportReviewSession,
        getImportReviewSessionRevision,
        function() { return '' }
    )
    const backgroundReviewRevision = useSyncExternalStore(
        function(listener) {
            const unsubQueue = subscribeBackgroundReviewQueue(listener)
            const unsubField = subscribeFieldLookupQueue(listener)
            return function() {
                unsubQueue()
                unsubField()
            }
        },
        getBackgroundReviewRevision,
        function() { return '' }
    )
    const showImportReviewButton = hasActiveImportReviewSession() && !isImportReviewUiVisible()
    const fieldLookupAwaitingCount = (getBackgroundReviewSummary().fieldLookupAwaiting || []).length
    const showSuggestionsReviewButton = fieldLookupAwaitingCount > 0
        && location.pathname !== '/review'
        && !location.pathname.startsWith('/review/')
    void importReviewRevision
    void backgroundReviewRevision
    const token = props.token
    const user = props.user
    const loadUserImage = props.loadUserImage
    useEffect(function() {
        setUserImageError(false)
        if (token && user) loadUserImage(token, user)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadUserImage identity is stable; token/user are the real triggers
    },[user, token])
    
    const forceNav = props.forceNav
    const setForceNav = props.setForceNav
    useEffect(function() {
        if (forceNav) {
            setForceNav(null)
            navigate(forceNav)
        }
    },[forceNav, navigate, setForceNav])
    
    const verySmallScreen = useIsHeaderAuthHidden();
    const narrowViewport = useIsNarrowViewport();
    const playbackInMenu = useIsHeaderPlaybackInMenu();
    const onSingleTuneView = isTuneSingleViewPath(location.pathname)
    const onTuneList = isTuneListPath(location.pathname)
    const searchListIds = props.tunebook.getSearchListOrderedIds
        ? props.tunebook.getSearchListOrderedIds()
        : []
    const hasSearchList = Array.isArray(searchListIds) && searchListIds.length > 0
    const queuePlaybackEngaged = isQueueActive(props.nowPlayingQueue)
        && isQueuePlaybackEngaged(props.mediaController, { queue: props.nowPlayingQueue })
    const keepPlaybackInHeader = onSingleTuneView || !playbackInMenu || (onTuneList && hasSearchList)
    const { available: resolverAvailable } = useMediaResolverHealth();
    useToolPagePlaybackInterrupt(props.mediaController, location.pathname);

    const onKeyPress = (event) => {
        if (props.blockKeyboardShortcuts) return;
        if (location.pathname.startsWith('/gig/')) return;
        // Notation music / piano-roll / ABC tabs own arrows (MuseScore: caret + transpose).
        if (isEditorNotationPath(location.pathname)) return;

        const mediaController = props.mediaController;
        const ctrlSeek = event.ctrlKey || event.metaKey;
        const viewedTuneId = getViewedTuneIdFromPath(location.pathname);
        const queueActive = isQueueActive(props.nowPlayingQueue);
        const searchListIds = props.tunebook.getSearchListOrderedIds
            ? props.tunebook.getSearchListOrderedIds()
            : [];
        const hasSearchList = Array.isArray(searchListIds) && searchListIds.length > 0;
        const onTuneList = isTuneListPath(location.pathname);
        // Arrow list-browse starts from the viewed tune, or first result on a fresh search list.
        const navTuneId = viewedTuneId || null;

        if (ctrlSeek && (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && mediaController && mediaController.seekBySeconds) {
            event.preventDefault();
            mediaController.seekBySeconds(event.key === 'ArrowLeft' ? -5 : 5);
            return;
        }

        if ((event.key === ' ' || event.key === 'k' || event.key === 'K') && mediaController) {
            event.preventDefault();
            toggleTunePlayback(mediaController, props.tunebook, navigate, location, {
                tunes: props.tunes,
                nowPlayingQueue: props.nowPlayingQueue,
                setNowPlayingQueue: props.setNowPlayingQueue,
                playOnceAndStop: isTuneSingleViewPath(location.pathname),
            });
            return;
        }

        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            if (mediaController && mediaController.isPlaying && mediaController.adjustPlaybackVolume) {
                event.preventDefault();
                const step = mediaController.playbackVolumeStep || PLAYBACK_VOLUME_STEP;
                mediaController.adjustPlaybackVolume(event.key === 'ArrowUp' ? step : -step);
            }
            return;
        }

        const onTunePage = !!(viewedTuneId && (location.pathname.startsWith('/tunes/') || location.pathname.startsWith('/editor/')));

        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            if (!onTunePage && !queueActive && !(onTuneList && hasSearchList)) return;
            if (!navTuneId && !(onTuneList && hasSearchList)) return;
            event.preventDefault();
            const navOpts = {
                mediaController: props.mediaController,
                forceSearchList: true,
            };
            if (event.key === 'ArrowRight') {
                props.tunebook.navigateToNextSong(navTuneId || getSkipNavigationTuneId(location.pathname, props.nowPlayingQueue), null, navigate, location.pathname, navOpts);
            } else {
                props.tunebook.navigateToPreviousSong(navTuneId || getSkipNavigationTuneId(location.pathname, props.nowPlayingQueue), navigate, location.pathname, navOpts);
            }
        }
    };
    useKeyPress(['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', ' ', 'k', 'K'], onKeyPress);

    const compactNav = narrowViewport
    const voiceMode = (location.pathname.startsWith('/help') || props.notationHelpActive) ? 'help' : 'playback'
    const selected = props.selected ? Object.keys(props.selected).map(function(v) {
        if (props.selected[v]) {
             return v
        } else {
            return ''
        }
    }).join(",") : ''
    const navButtonSize = compactNav ? undefined : 'lg'
    const headerTunesBtnStyle = {
        width: compactNav ? '2.7em' : '3em',
        minWidth: compactNav ? '2.7em' : '3em',
    }
    const playbackButtonSize = navButtonSize
    const onTunesOrEditor = location.pathname.startsWith('/tunes') || location.pathname.startsWith('/editor/')
    const onPlaybackInterruptTool = isPlaybackInterruptPath(location.pathname)
    const showHeaderPlayback = (onTunesOrEditor && keepPlaybackInHeader) || queuePlaybackEngaged
    const viewedTuneId = getViewedTuneIdFromPath(location.pathname)
    const skipTuneId = getSkipNavigationTuneId(location.pathname, props.nowPlayingQueue)
    const hasBrowsableList = hasSearchList || !!(props.currentTuneBook && String(props.currentTuneBook).length > 0)
    // Offer prev/next on a tune page, and on the list after a search so the
    // first result can be opened without clicking a row first.
    const showSkipButtons = !!(
        (onSingleTuneView && viewedTuneId)
        || (skipTuneId && viewedTuneId)
        || (onTuneList && hasSearchList)
        || (onSingleTuneView && hasBrowsableList)
    )
    // On settings/chords/help/etc., show the full player while a queue is active.
    // Hide on metronome/tuner/piano (those pages pause playback for their own audio).
    // Keep skip-only on narrow tunes/editor layouts where playback lives in the menu.
    // Also show play on the tune list when search results exist (plays first result).
    const showFullHeaderPlayback = !onPlaybackInterruptTool && showHeaderPlayback && (
        !!viewedTuneId || (onTuneList && hasSearchList) || queuePlaybackEngaged
    )
    const headerDropdownBtnStyle = {
        width: compactNav ? '2.55em' : '3em',
    }

    function renderSkipButtons(buttonSize) {
        if (!showSkipButtons) return null
        const navFromId = viewedTuneId || getSkipNavigationTuneId(location.pathname, props.nowPlayingQueue) || null
        const prevLabel = 'Previous search result (Ctrl+← to seek)'
        const nextLabel = 'Next search result (Ctrl+→ to seek)'
        const navOpts = { mediaController: props.mediaController, forceSearchList: true }
        return (
            <span className="header-list-nav">
                <ButtonGroup className="header-skip-buttons">
                    <Button size={buttonSize} aria-label={prevLabel} title={prevLabel} onClick={function() {
                        props.tunebook.navigateToPreviousSong(navFromId, navigate, location.pathname, navOpts)
                    }}>{props.tunebook.icons.skipback}</Button>
                    <Button size={buttonSize} aria-label={nextLabel} title={nextLabel} onClick={function() {
                        props.tunebook.navigateToNextSong(navFromId, null, navigate, location.pathname, navOpts)
                    }}>{props.tunebook.icons.skipforward}</Button>
                </ButtonGroup>
            </span>
        )
    }

    function openAccountDialog() {
        setNavMenuOpen(false)
        setListsMenuOpen(false)
        setShowAccount(true)
    }

    function renderAuthButton(inHeader) {
        const className = inHeader ? 'header-auth-btn' : 'header-dropdown-btn'
        const size = inHeader ? undefined : navButtonSize
        if (props.token) {
            const profileUrl = props.user && props.user.picture && props.token.access_token && !userImageError
                ? props.user.picture + '?access_token=' + props.token.access_token + '&not-from-cache-please'
                : null
            return (
                <Button
                    size={size}
                    variant="danger"
                    className={className + (profileUrl ? ' header-auth-btn-profile' : '')}
                    aria-label="Account"
                    title="Account"
                    onClick={openAccountDialog}
                >
                    {profileUrl
                        ? <img src={profileUrl} onError={function() { setUserImageError(true) }} className="header-auth-profile-img" alt="" />
                        : props.tunebook.icons.login}
                </Button>
            )
        }
        return (
            <Button
                size={size}
                variant="success"
                className={className}
                aria-label="Log in"
                title={navigatorOnline ? 'Log in' : OFFLINE_LOGIN_MESSAGE}
                disabled={!navigatorOnline}
                onClick={function() {
                    if (!navigatorOnline) return
                    if (typeof props.login === 'function') props.login()
                }}
            >
                {props.tunebook.icons.login}
            </Button>
        )
    }

    function renderMediaPlayerSection(buttonSize) {
        return (
            <MediaPlayerButtons
                user={props.user}
                mediaController={props.mediaController}
                tunebook={props.tunebook}
                buttonSize={buttonSize}
                nowPlayingQueue={props.nowPlayingQueue}
                setNowPlayingQueue={props.setNowPlayingQueue}
                tunes={props.tunes}
                currentTuneBook={props.currentTuneBook}
                tagFilter={props.tagFilter}
                genreFilter={props.genreFilter}
                artistFilter={props.artistFilter}
                selected={selected}
                onOpenNowPlaying={props.onOpenNowPlaying}
            />
        )
    }

    function renderNavMenu() {
        return (
            <Dropdown.Menu className="header-nav-menu" align="start">
                {playbackInMenu && !keepPlaybackInHeader && onTunesOrEditor && <>
                <div className="header-dropdown-section header-dropdown-section-media">
                    {renderMediaPlayerSection(playbackButtonSize)}
                </div>
                <Dropdown.Divider />
                </>}
                <div className="header-dropdown-section header-dropdown-section-actions">
                    <div className="header-dropdown-actions-group">
                        <Button
                            as={Link}
                            to="/books"
                            variant="secondary"
                            size={navButtonSize}
                            className="header-dropdown-btn header-dropdown-books-btn"
                            title="Browse"
                            aria-label="Browse"
                            data-testid="header-books-button"
                            onClick={function() { setNavMenuOpen(false) }}
                        >
                            <span className="header-dropdown-btn-label">
                                {props.tunebook.icons.book}
                                <span>Browse</span>
                            </span>
                        </Button>
                        <span className="header-dropdown-add-trigger" style={{ display: 'contents' }}>
                            <Button
                                as={Link}
                                to="/add"
                                variant="success"
                                size={navButtonSize}
                                className="header-dropdown-btn header-dropdown-add-btn"
                                title="Add Tunes"
                                data-testid="header-add-button"
                                onClick={function() { setNavMenuOpen(false) }}
                            >
                                <span className="header-dropdown-btn-label">
                                    {props.tunebook.icons.fileadd}
                                    <span>Add</span>
                                </span>
                            </Button>
                        </span>
                        {showImportReviewButton ? (
                            <Button
                                variant="primary"
                                size={navButtonSize}
                                className="header-dropdown-btn header-dropdown-review-btn"
                                title="Continue import review"
                                aria-label="Continue import review"
                                data-testid="header-import-review-button"
                                onClick={function() {
                                    setNavMenuOpen(false)
                                    openImportReviewFromToast()
                                }}
                            >
                                <span className="header-dropdown-btn-label">
                                    {props.tunebook.icons.reviewsmall || props.tunebook.icons.review}
                                    <span>Review</span>
                                </span>
                            </Button>
                        ) : null}
                        {showSuggestionsReviewButton ? (
                            <Button
                                as={Link}
                                to="/review"
                                variant="primary"
                                size={navButtonSize}
                                className="header-dropdown-btn header-dropdown-review-btn"
                                title={fieldLookupAwaitingCount === 1
                                    ? '1 search result ready for review'
                                    : (fieldLookupAwaitingCount + ' search results ready for review')}
                                aria-label="Review search suggestions"
                                data-testid="header-suggestions-review-button"
                                onClick={function() { setNavMenuOpen(false) }}
                            >
                                <span className="header-dropdown-btn-label">
                                    {props.tunebook.icons.reviewsmall || props.tunebook.icons.review}
                                    <span>{showImportReviewButton ? 'Suggestions' : 'Review'}</span>
                                </span>
                            </Button>
                        ) : null}
                    </div>
                </div>
                <Dropdown.Divider />
                <div className="header-dropdown-section header-dropdown-section-account">
                    <Dropdown.Item as="div">
                        <Link to="/settings">
                            <Button size={navButtonSize} variant="warning" className="header-dropdown-btn">
                                {props.tunebook.icons.settings} Settings
                            </Button>
                        </Link>
                    </Dropdown.Item>
                    <Dropdown.Item as="div">
                        <Link to="/help" onClick={function() { setTimeout(function() { props.tunebook.utils.scrollTo('topofpage') }, 300) }}>
                            <Button size={navButtonSize} variant="info" className="header-dropdown-btn">
                                {props.tunebook.icons.question} Help
                            </Button>
                        </Link>
                    </Dropdown.Item>
                    <Dropdown.Item as="div">
                        <Link to="/privacy" onClick={function() { setTimeout(function() { props.tunebook.utils.scrollTo('topofpage') }, 300) }}>
                            <Button size={navButtonSize} variant="info" className="header-dropdown-btn" title="Privacy Policy">
                                Privacy
                            </Button>
                        </Link>
                    </Dropdown.Item>
                    <div className="header-dropdown-account-trailing">
                        <Dropdown.Item as="div" className="header-dropdown-lists-item">
                            <div className="header-lists-dropdown">
                                <Button
                                    size={navButtonSize}
                                    variant="info"
                                    className={'header-dropdown-btn header-lists-toggle' + (listsMenuOpen ? ' header-lists-toggle--open' : '')}
                                    data-testid="header-lists-button"
                                    aria-expanded={listsMenuOpen}
                                    onClick={function(e) {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        setListsMenuOpen(function(v) { return !v })
                                    }}
                                >
                                    {props.tunebook.icons.lists} Lists
                                </Button>
                                {listsMenuOpen ? (
                                    <div className="header-lists-submenu" role="menu">
                                        <button
                                            type="button"
                                            className="header-lists-menu-item"
                                            data-testid="header-playlists-button"
                                            onClick={function() {
                                                setListsMenuOpen(false)
                                                setShowPlaylists(true)
                                                setNavMenuOpen(false)
                                            }}
                                        >
                                            {props.tunebook.icons.playlist} Playlists
                                        </button>
                                        <Link
                                            to="/sets"
                                            className="header-lists-menu-item"
                                            role="menuitem"
                                            onClick={function() {
                                                setListsMenuOpen(false)
                                                setNavMenuOpen(false)
                                            }}
                                        >
                                            {props.tunebook.icons.setlist} Setlists
                                        </Link>
                                        {PRACTICE_LISTS_ENABLED ? (
                                            <Link
                                                to="/practice-lists"
                                                className="header-lists-menu-item"
                                                role="menuitem"
                                                onClick={function() {
                                                    setListsMenuOpen(false)
                                                    setNavMenuOpen(false)
                                                }}
                                            >
                                                {props.tunebook.icons.reviewsmall} Practice Lists
                                            </Link>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        </Dropdown.Item>
                        <Dropdown.Item as="div" className="header-dropdown-item-login">
                            {renderAuthButton(false)}
                        </Dropdown.Item>
                    </div>
                </div>
                <Dropdown.Divider />
                <div className="header-dropdown-section header-dropdown-section-tools">
                    <Dropdown.Item as="div">
                        <Link to="/metronome" onClick={function() { setNavMenuOpen(false) }}>
                            <Button size={navButtonSize} variant="info" className="header-dropdown-btn">
                                {props.tunebook.icons.metronome} Rhythm
                            </Button>
                        </Link>
                    </Dropdown.Item>
                    <Dropdown.Item as="div">
                        <Link to="/tuner" onClick={function() { setNavMenuOpen(false) }}>
                            <Button size={navButtonSize} variant="info" className="header-dropdown-btn">
                                {props.tunebook.icons.tuner} Tuner
                            </Button>
                        </Link>
                    </Dropdown.Item>
                    <Dropdown.Item as="div">
                        <Link to="/chords" onClick={function() { setNavMenuOpen(false) }}>
                            <Button size={navButtonSize} variant="info" className="header-dropdown-btn">
                                {props.tunebook.icons.guitar} Chords
                            </Button>
                        </Link>
                    </Dropdown.Item>
                    <Dropdown.Item as="div">
                        <Link to="/piano" onClick={function() { setNavMenuOpen(false) }}>
                            <Button size={navButtonSize} variant="info" className="header-dropdown-btn">
                                {props.tunebook.icons.piano} Keyboard
                            </Button>
                        </Link>
                    </Dropdown.Item>
                    <Dropdown.Item as="div">
                        <a href="/yoga/" onClick={function() { setNavMenuOpen(false) }}>
                            <Button size={navButtonSize} variant="info" className="header-dropdown-btn">
                                Yoga
                            </Button>
                        </a>
                    </Dropdown.Item>
                    {resolverAvailable ? (
                        <Dropdown.Item as="div">
                            <Link to="/lyrics" onClick={function() { setNavMenuOpen(false) }}>
                                <Button size={navButtonSize} variant="info" className="header-dropdown-btn">
                                    {props.tunebook.icons.words} Lyrics
                                </Button>
                            </Link>
                        </Dropdown.Item>
                    ) : null}
                </div>
                <Dropdown.Divider />
                <div className="header-dropdown-section header-dropdown-section-actions">
                    <div className="header-dropdown-practice-feed-group">
                        {PRACTICE_MODE_ENABLED ? (
                            <PracticeSessionButton
                                tunebook={props.tunebook}
                                tunes={props.tunes}
                                mediaController={props.mediaController}
                                forceRefresh={props.forceRefresh}
                                setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                                practiceSession={props.practiceSession}
                                buttonSize={navButtonSize}
                                buttonClassName="header-dropdown-btn header-dropdown-practice-btn"
                            />
                        ) : null}
                        <Button
                            as={Link}
                            to="/scratchpad"
                            size={navButtonSize}
                            variant="primary"
                            className="header-dropdown-btn header-dropdown-scratchpad-btn"
                            data-testid="header-scratchpad-button"
                            onClick={function() { setNavMenuOpen(false) }}
                        >
                            <span className="header-dropdown-btn-label">
                                {props.tunebook.icons.pencil}
                                <span>Scratchpad</span>
                            </span>
                        </Button>
                        {THEORY_SECTION_ENABLED ? (
                            <Button
                                as={Link}
                                to="/feed"
                                size={navButtonSize}
                                variant="primary"
                                className="header-dropdown-btn header-dropdown-feed-btn"
                                data-testid="header-theory-button"
                                onClick={function() { setNavMenuOpen(false) }}
                            >
                                <span className="header-dropdown-btn-label">
                                    {props.tunebook.icons.theory}
                                    <span>Theory</span>
                                </span>
                            </Button>
                        ) : null}
                    </div>
                </div>
            </Dropdown.Menu>
        )
    }

    if (location.pathname.startsWith('/print')) return null
    return <header className="App-header" style={{fontSize:'1.2em'}} >
        <span className="header-left">
            <ButtonGroup className="header-nav-buttons">
                <Button
                    as={Link}
                    to={resolveTunesListPath({
                      currentTuneBook: props.currentTuneBook,
                      filter: props.filter,
                      tagFilter: props.tagFilter,
                      genreFilter: props.genreFilter,
                      artistFilter: props.artistFilter,
                      albumFilter: props.albumFilter,
                      groupBy: props.groupBy,
                    })}
                    variant="info"
                    className="header-nav-btn header-nav-tunes-btn"
                    title="Tunes"
                    aria-label="Tunes"
                    style={headerTunesBtnStyle}
                    onClick={function() {
                        props.tunebook.utils.scrollTo('topofpage', 70)
                    }}
                >
                    {props.tunebook.icons.musicheader}
                </Button>
                <Dropdown
                    as={ButtonGroup}
                    show={navMenuOpen}
                    onToggle={function(next) {
                        setNavMenuOpen(!!next)
                        if (!next) setListsMenuOpen(false)
                    }}
                    autoClose={true}
                    className="header-nav-dropdown"
                    style={{position:'relative'}}
                >
                    {props.isSyncing && <b style={{position:'absolute', top:0, left:0, backgroundColor:'lightgrey', zIndex:999}}>SYNC</b>}
                    <Dropdown.Toggle
                        variant="info"
                        id="dropdown-header"
                        className="header-nav-btn header-nav-dropdown-btn"
                        style={headerDropdownBtnStyle}
                        aria-label="Main menu"
                    />
                    {renderNavMenu()}
                </Dropdown>
            </ButtonGroup>
                {!verySmallScreen && (
                    <span className="header-auth-separator">
                        {renderAuthButton(true)}
                    </span>
                )}
            
             
       </span>

        <span className="header-right">
            {showFullHeaderPlayback && (
                <span className="header-playback">
                    {renderMediaPlayerSection(playbackButtonSize)}
                </span>
            )}
            {!onPlaybackInterruptTool && showSkipButtons && (
                <span className="header-playback header-playback-skip-only">
                    {renderSkipButtons(playbackButtonSize)}
                </span>
            )}
            <VoiceCommandButton
                token={props.token}
                tunebook={props.tunebook}
                tunes={props.tunes}
                mediaController={props.mediaController}
                setFilter={props.setFilter}
                setCurrentTuneBook={props.setCurrentTuneBook}
                setTagFilter={props.setTagFilter}
                setGroupBy={props.setGroupBy}
                setCurrentTune={props.setCurrentTune}
                setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                voiceMode={voiceMode}
            />
        </span>
        <SavedPlaylistsOpenModal
            show={showPlaylists}
            onHide={function() { setShowPlaylists(false) }}
            tunebook={props.tunebook}
            tunes={props.tunes}
            setNowPlayingQueue={props.setNowPlayingQueue}
            showSaveCurrentSearch={true}
            filter={props.filter}
            currentTuneBook={props.currentTuneBook}
            tagFilter={props.tagFilter}
            genreFilter={props.genreFilter}
            artistFilter={props.artistFilter}
            token={props.token}
            login={props.login}
            googleDocumentId={props.googleDocumentId}
        />
        <AccountModal
            show={showAccount}
            onHide={function() { setShowAccount(false) }}
            user={props.user}
            token={props.token}
            logout={props.logout}
            icons={props.tunebook.icons}
            imageError={userImageError}
            onImageError={function() { setUserImageError(true) }}
            tunes={props.tunes}
            tunebook={props.tunebook}
        />
    </header>
}


//<Dropdown.Item ><Link to="/files" ><Button  size="lg" variant="info"  >{props.tunebook.icons.camera} &nbsp;Images</Button></Link> </Dropdown.Item>
                            //<Dropdown.Item ><Link to="/recordings" ><Button  size="lg" variant="info"  >{props.tunebook.icons.recordcircle} &nbsp;Recordings</Button></Link> </Dropdown.Item>

//<Dropdown.Item style={dropdownStyle}><Link to="/files" ><Button  variant="info"  >{props.tunebook.icons.camera} </Button></Link> </Dropdown.Item>
                   //<Dropdown.Item style={dropdownStyle}><Link to="/recordings" ><Button variant="info"  >{props.tunebook.icons.recordcircle}</Button></Link> </Dropdown.Item>
              
//{(!params.tuneId && location.pathname.indexOf('/tunes') !== -1) && <ButtonGroup style={{float:'right'}}>
            //<Button onClick={function() {props.tunebook.fillMediaPlaylist(props.currentTuneBook,selected,props.tagFilter )}} variant={"success"} size="lg" >{props.tunebook.icons.play}</Button>
            //<MediaPlayerOptionsModal mediaController={props.mediaController} tunebook={props.tunebook} buttonSize={'lg'} abcPlaylist={props.abcPlaylist} setAbcPlaylist={props.setAbcPlaylist}  mediaPlaylist={props.mediaPlaylist} setMediaPlaylist={props.setMediaPlaylist} variant={"success"} currentTuneBook={props.currentTuneBook} tagFilter={props.tagFilter} selected={selected} />
        //</ButtonGroup>}
        

//{(location.pathname.startsWith('/tunes/') && params.tuneId) ? <span style={{marginLeft:'0.5em'}}>
                  //<AbcPlaylistManagerModal tunebook={props.tunebook} abcPlaylist={props.abcPlaylist} setAbcPlaylist={props.setAbcPlaylist} />
                  //<PlaylistManagerModal tunebook={props.tunebook} mediaPlaylist={props.mediaPlaylist} setMediaPlaylist={props.setMediaPlaylist} />
                  
              //</span>  : null}
            
            //{(isMobile && location.pathname.startsWith('/tunes/') && params.tuneId) ? <span style={{ marginLeft:'0.8em'}}>
                      //<AbcPlaylistManagerModal tunebook={props.tunebook} abcPlaylist={props.abcPlaylist} setAbcPlaylist={props.setAbcPlaylist} />
                     //<PlaylistManagerModal tunebook={props.tunebook} mediaPlaylist={props.mediaPlaylist} setMediaPlaylist={props.setMediaPlaylist} />
                  //</span>  : null}
                  

       //{isMobile && <Dropdown.Item style={dropdownStyle}  ><Link to="/review" ><Button  variant="info" style={{marginLeft:'0.1em', color: 'black', border: (location.pathname.startsWith('/review') ? '1px solid black' : '')}}>{props.tunebook.icons.review} </Button></Link>
                //</Dropdown.Item>}
                   //<Dropdown.Item style={dropdownStyle}  ><Link to="/recordings" ><Button   variant="info"   >{props.tunebook.icons.recordcircle} </Button></Link> </Dropdown.Item>

  //<Dropdown.Item ><Link to="/chords" ><Button  size="lg" variant="info"  >{props.tunebook.icons.guitar} Chords</Button></Link> </Dropdown.Item>
                        
                      

 //{location.pathname.startsWith('/tunes/') && <span  ><TempoControl showTempo={props.showTempo} setShowTempo={props.setShowTempo} tunebook={props.tunebook} value={props.tempo} beatsPerBar={props.beatsPerBar} setBeatsPerBar={props.setBeatsPerBar} onChange={function(val) {props.setTempo(val)}}  /></span>}
//<Link to="/menu" ><Button variant="info" style={{marginLeft:'0.4em', color: 'black'}} >...</Button></Link>
                    //{!isMobile && <span ><ShareTunebookModal tunebook ={props.tunebook} token={props.token} googleDocumentId={props.googleDocumentId} tiny={true} /></span>}
                    
                    
// <GoogleAd style={{ display: 'block', textAlign: "center" , height:'2em', zIndex: 0}} slot={process.env.REACT_APP_GOOGLE_AD_SLOT} googleAdId={process.env.REACT_APP_GOOGLE_AD_ID} />
 //<Link to="/review" ><Button size="lg" variant="info" style={{marginLeft:'0.1em', color: 'black', border: (location.pathname.startsWith('/review') ? '1px solid black' : '')}}>{props.tunebook.icons.review}</Button></Link>
                   //<Link to="/recordings" ><Button  variant="info" size="lg"  style={{marginLeft:'0.1em', color: 'black',  border: (location.pathname.startsWith('/recordings') ? '1px solid black' : '')}} >{props.tunebook.icons.recordcircle}</Button></Link>
