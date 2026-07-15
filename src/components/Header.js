import { Link  , useLocation} from 'react-router-dom'
import {Button, Dropdown, ButtonGroup} from 'react-bootstrap'
import SavedPlaylistsOpenModal from './SavedPlaylistsOpenModal'
import {useEffect, useMemo, useState, useSyncExternalStore} from 'react'
import {useNavigate} from 'react-router-dom'
import MediaPlayerButtons from './MediaPlayerButtons'
import PracticeSessionButton from './PracticeSessionButton'
import VoiceCommandButton from './VoiceCommandButton'
import useKeyPress from '../useKeyPress';
import { useIsHeaderAuthHidden, useIsHeaderPlaybackInMenu, useIsNarrowViewport } from '../useMediaQuery';
import { PLAYBACK_VOLUME_STEP } from '../playbackVolumeSettings';
import { isQueueActive, getCurrentTuneId } from '../nowPlayingQueue';
import {
  getViewedTuneIdFromPath,
  getSkipNavigationTuneId,
} from '../playbackNavigationUtils';
import { isEditorNotationPath } from '../viewModeUtils';
import {
  isPlaybackInterruptPath,
  useToolPagePlaybackInterrupt,
} from '../toolPlaybackInterrupt';
import useMediaResolverHealth from '../useMediaResolverHealth';
import {
    getBackgroundReviewRevision,
    getBackgroundReviewSummary,
    subscribeBackgroundReviewQueue,
} from '../backgroundReviewQueue'
import {
    getImportReviewSessionRevision,
    showImportReviewUi,
    subscribeImportReviewSession,
} from '../importReviewSessionStore'
import {
    subscribe as subscribeFieldLookupQueue,
    getState as getFieldLookupState,
} from '../tuneFieldLookupQueue'
import {
    getFileOcrJobs,
    subscribeFileOcrJobs,
} from '../fileOcrJobs'

function getFieldLookupReviewRevision() {
    const state = getFieldLookupState()
    return (state.jobs || []).map(function(job) {
        return job.id + ':' + job.status + ':' + (job.reviewCandidateId || '')
    }).join('|')
}

function getFileOcrReviewRevision() {
    return getFileOcrJobs().map(function(job) {
        return job.id + ':' + job.status
    }).join('|')
}

function useBackgroundReviewReadyCount() {
    const reviewRevision = useSyncExternalStore(
        subscribeBackgroundReviewQueue,
        getBackgroundReviewRevision,
        function() { return '' }
    )
    const importRevision = useSyncExternalStore(
        subscribeImportReviewSession,
        getImportReviewSessionRevision,
        function() { return '' }
    )
    const fieldLookupRevision = useSyncExternalStore(
        subscribeFieldLookupQueue,
        getFieldLookupReviewRevision,
        function() { return '' }
    )
    const fileOcrRevision = useSyncExternalStore(
        subscribeFileOcrJobs,
        getFileOcrReviewRevision,
        function() { return '' }
    )
    return useMemo(function() {
        return getBackgroundReviewSummary().ready
    }, [reviewRevision, importRevision, fieldLookupRevision, fileOcrRevision])
}


export default function Header(props) {
    var location = useLocation()
    var navigate = useNavigate()
    //console.log(props.token)
    //var params = useParams() // empty  ???
    var parts = location.pathname.split("/")
    var params = {tuneId: parts.length >= 3 ? parts[2] : null}
    const [userImageError, setUserImageError] = useState(false)
    const [showPlaylists, setShowPlaylists] = useState(false)
    const [navMenuOpen, setNavMenuOpen] = useState(false)
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
        //console.log("FORCE NAV", props.forceNav)
        if (forceNav) {
            //console.log("REALLY FORCE NAV", props.forceNav)
            setForceNav(null)
            navigate(forceNav)
        }
    },[forceNav, navigate, setForceNav])
    
    const verySmallScreen = useIsHeaderAuthHidden();
    const narrowViewport = useIsNarrowViewport();
    const playbackInMenu = useIsHeaderPlaybackInMenu();
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
        const navTuneId = queueActive
            ? getCurrentTuneId(props.nowPlayingQueue)
            : getSkipNavigationTuneId(location.pathname, props.nowPlayingQueue);

        if (ctrlSeek && (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && mediaController && mediaController.seekBySeconds) {
            event.preventDefault();
            mediaController.seekBySeconds(event.key === 'ArrowLeft' ? -5 : 5);
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

        if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && navTuneId) {
            const onTunePage = !!(viewedTuneId && (location.pathname.startsWith('/tunes/') || location.pathname.startsWith('/editor/')));
            if (!onTunePage && !queueActive) return;
            event.preventDefault();
            if (event.key === 'ArrowRight') {
                props.tunebook.navigateToNextSong(navTuneId, null, navigate, location.pathname, {
                    mediaController: props.mediaController,
                });
            } else {
                props.tunebook.navigateToPreviousSong(navTuneId, navigate, location.pathname, {
                    mediaController: props.mediaController,
                });
            }
        }
    };
    useKeyPress(['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'], onKeyPress);

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
        minWidth: compactNav ? '3.4em' : '3.8em',
        paddingLeft: compactNav ? '0.35em' : '0.4em',
        paddingRight: compactNav ? '0.65em' : '0.85em',
    }
    const playbackButtonSize = navButtonSize
    const onTunesOrEditor = location.pathname.startsWith('/tunes') || location.pathname.startsWith('/editor/')
    const onPlaybackInterruptTool = isPlaybackInterruptPath(location.pathname)
    const showHeaderPlayback = onTunesOrEditor && !playbackInMenu
    const viewedTuneId = getViewedTuneIdFromPath(location.pathname)
    const queueActive = isQueueActive(props.nowPlayingQueue)
    const skipTuneId = getSkipNavigationTuneId(location.pathname, props.nowPlayingQueue)
    // Search-result skip in header; playlist stepping uses the bottom transport bar.
    const showSkipButtons = !!(skipTuneId && !queueActive && viewedTuneId)
    // On settings/chords/help/etc., show the full player while a queue is active.
    // Hide on metronome/tuner/piano (those pages pause playback for their own audio).
    // Keep skip-only on narrow tunes/editor layouts where playback lives in the menu.
    const showFullHeaderPlayback = !onPlaybackInterruptTool && showHeaderPlayback && !!viewedTuneId
    const headerDropdownBtnStyle = {
        width: compactNav ? '2.55em' : '3em',
    }
    const reviewReadyCount = useBackgroundReviewReadyCount()

    function renderSkipButtons(buttonSize) {
        if (!showSkipButtons) return null
        const prevLabel = 'Previous search result'
        const nextLabel = 'Next search result'
        return (
            <span className="header-list-nav">
                <ButtonGroup className="header-skip-buttons">
                    <Button size={buttonSize} aria-label={prevLabel} title={prevLabel} onClick={function() {
                        props.tunebook.navigateToPreviousSong(skipTuneId, navigate, location.pathname, {
                            mediaController: props.mediaController,
                        })
                    }}>{props.tunebook.icons.skipback}</Button>
                    <Button size={buttonSize} aria-label={nextLabel} title={nextLabel} onClick={function() {
                        props.tunebook.navigateToNextSong(skipTuneId, null, navigate, location.pathname, {
                            mediaController: props.mediaController,
                        })
                    }}>{props.tunebook.icons.skipforward}</Button>
                </ButtonGroup>
            </span>
        )
    }

    function renderAuthButton(inHeader) {
        const className = inHeader ? 'header-auth-btn' : 'header-dropdown-btn'
        const size = inHeader ? undefined : navButtonSize
        const imgSize = inHeader ? undefined : (compactNav ? '40px' : '50px')
        if (props.token) {
            const profileUrl = props.user && props.user.picture && props.token.access_token && !userImageError
                ? props.user.picture + '?access_token=' + props.token.access_token + '&not-from-cache-please'
                : null
            return (
                <Button
                    size={size}
                    variant="danger"
                    className={className + (profileUrl ? ' header-auth-btn-profile' : '')}
                    aria-label="Log out"
                    onClick={function() { props.logout() }}
                >
                    {profileUrl
                        ? <img src={profileUrl} onError={function() { setUserImageError(true) }} className="header-auth-profile-img" style={imgSize ? { height: imgSize, width: imgSize } : undefined} alt="" />
                        : props.tunebook.icons.logout}
                </Button>
            )
        }
        return (
            <Button size={size} variant="success" className={className} aria-label="Log in" onClick={function() { props.login() }}>
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
                queuePlayConfirm={props.queuePlayConfirm}
                setQueuePlayConfirm={props.setQueuePlayConfirm}
                tunes={props.tunes}
                currentTuneBook={props.currentTuneBook}
                tagFilter={props.tagFilter}
                genreFilter={props.genreFilter}
                artistFilter={props.artistFilter}
                selected={selected}
            />
        )
    }

    function renderNavMenu() {
        return (
            <Dropdown.Menu className="header-nav-menu" align="start">
                {playbackInMenu && onTunesOrEditor && <>
                <div className="header-dropdown-section header-dropdown-section-media">
                    {renderMediaPlayerSection(playbackButtonSize)}
                </div>
                <Dropdown.Divider />
                </>}
                <div className="header-dropdown-section header-dropdown-section-actions">
                    <ButtonGroup className="header-dropdown-actions-group">
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
                        {reviewReadyCount > 0 ? (
                            <Button
                                as={Link}
                                to="/review"
                                variant="primary"
                                size={navButtonSize}
                                className="header-dropdown-btn header-dropdown-review-btn"
                                data-testid="header-review-button"
                                title="Review"
                                onClick={function() {
                                    setNavMenuOpen(false)
                                    showImportReviewUi()
                                }}
                            >
                                <span className="header-dropdown-btn-label">
                                    {props.tunebook.icons.menu}
                                    <span>Review</span>
                                </span>
                            </Button>
                        ) : null}
                    </ButtonGroup>
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
                    <div className="header-dropdown-account-trailing">
                        <Dropdown.Item as="div">
                            <Link to="/sets">
                                <Button size={navButtonSize} variant="info" className="header-dropdown-btn">
                                    {props.tunebook.icons.setlist} Setlists
                                </Button>
                            </Link>
                        </Dropdown.Item>
                        <Dropdown.Item as="div">
                            <Button
                                size={navButtonSize}
                                variant="info"
                                className="header-dropdown-btn"
                                data-testid="header-playlists-button"
                                onClick={function() { setShowPlaylists(function(v) { return !v }) }}
                            >
                                {props.tunebook.icons.playlist} Playlists
                            </Button>
                        </Dropdown.Item>
                        <Dropdown.Item as="div" className="header-dropdown-item-login">
                            {renderAuthButton(false)}
                        </Dropdown.Item>
                    </div>
                </div>
                <Dropdown.Divider />
                <div className="header-dropdown-section header-dropdown-section-tools">
                    <Dropdown.Item as="div">
                        <Link to="/metronome">
                            <Button size={navButtonSize} variant="info" className="header-dropdown-btn">
                                {props.tunebook.icons.metronome} Metronome
                            </Button>
                        </Link>
                    </Dropdown.Item>
                    <Dropdown.Item as="div">
                        <Link to="/tuner">
                            <Button size={navButtonSize} variant="info" className="header-dropdown-btn">
                                {props.tunebook.icons.tuner} Tuner
                            </Button>
                        </Link>
                    </Dropdown.Item>
                    <Dropdown.Item as="div">
                        <Link to="/chords">
                            <Button size={navButtonSize} variant="info" className="header-dropdown-btn">
                                {props.tunebook.icons.guitar} Chords
                            </Button>
                        </Link>
                    </Dropdown.Item>
                    <Dropdown.Item as="div">
                        <Link to="/piano">
                            <Button size={navButtonSize} variant="info" className="header-dropdown-btn">
                                {props.tunebook.icons.piano} Keyboard
                            </Button>
                        </Link>
                    </Dropdown.Item>
                    {resolverAvailable ? (
                        <Dropdown.Item as="div">
                            <Link to="/lyrics">
                                <Button size={navButtonSize} variant="info" className="header-dropdown-btn">
                                    {props.tunebook.icons.words} Lyrics
                                </Button>
                            </Link>
                        </Dropdown.Item>
                    ) : null}
                </div>
                <Dropdown.Divider />
                <div className="header-dropdown-section header-dropdown-section-actions">
                    <PracticeSessionButton
                        tunebook={props.tunebook}
                        tunes={props.tunes}
                        mediaController={props.mediaController}
                        forceRefresh={props.forceRefresh}
                        setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                        practiceSession={props.practiceSession}
                        buttonSize={navButtonSize}
                        buttonClassName="header-dropdown-btn"
                    />
                </div>
            </Dropdown.Menu>
        )
    }

    if (location.pathname.startsWith('/print')) return null
    //console.log("param  ",params,location)
    return <header className="App-header" style={{zIndex:11, fontSize:'1.2em'}} >
        <span className="header-left">
            <ButtonGroup className="header-nav-buttons">
                <Button
                    as={Link}
                    to="/tunes"
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
                    onToggle={function(next) { setNavMenuOpen(!!next) }}
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
                    {renderSkipButtons(playbackButtonSize)}
                </span>
            )}
            {!showFullHeaderPlayback && !onPlaybackInterruptTool && showSkipButtons && (
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
