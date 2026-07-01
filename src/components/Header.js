import { Link  , useLocation} from 'react-router-dom'
import {Button, Dropdown, ButtonGroup} from 'react-bootstrap'
import AddSongModal from './AddSongModal'
import {useEffect, useState} from 'react'
import {isMobile} from 'react-device-detect';
import {useNavigate} from 'react-router-dom'
import MediaPlayerButtons from './MediaPlayerButtons'
import PracticeSessionButton from './PracticeSessionButton'
import VoiceCommandButton from './VoiceCommandButton'
import useKeyPress from '../useKeyPress';
import { useIsHeaderAuthHidden, useIsNarrowViewport } from '../useMediaQuery';


export default function Header(props) {
    var location = useLocation()
    var navigate = useNavigate()
    //console.log(props.token)
    //var params = useParams() // empty  ???
    var parts = location.pathname.split("/")
    var params = {tuneId: parts.length >= 3 ? parts[2] : null}
    const [userImageError, setUserImageError] = useState(false)
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

    const onKeyPress = (event) => {
        if (!props.blockKeyboardShortcuts) {
            if (event.key === 'ArrowRight' && location.pathname.startsWith('/tunes/') && params.tuneId) {
                props.tunebook.navigateToNextSong(params.tuneId,navigate)
                //props.setCurrentTune(params.tuneId)
            } else if (event.key === 'ArrowLeft' && location.pathname.startsWith('/tunes/') && params.tuneId) {
                props.tunebook.navigateToPreviousSong(params.tuneId,navigate)
                //props.setCurrentTune(params.tuneId)
            }
            //console.log(`key pressed: ${event.key}`);
        }
    };
    useKeyPress(['ArrowRight', 'ArrowLeft'], onKeyPress);

    function getShowParam() {
        if (window.location.hash && window.location.hash.indexOf('?show=') !== -1) {
            return window.location.hash.slice(window.location.hash.indexOf('?show=') + 6)
        }
        return ''
    }

    const showImport = (getShowParam() === "importList" || getShowParam() === "importAbc" || getShowParam() === "importCollection")
    const compactNav = isMobile
    const selected = props.selected ? Object.keys(props.selected).map(function(v) {
        if (props.selected[v]) {
             return v
        } else {
            return ''
        }
    }).join(",") : ''
    const navButtonSize = compactNav ? undefined : 'lg'
    const headerTunesBtnStyle = {
        height: compactNav ? '3em' : '3.25em',
        minWidth: compactNav ? '3.4em' : '3.8em',
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: compactNav ? '0.35em' : '0.4em',
        paddingRight: compactNav ? '0.65em' : '0.85em',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
    }
    const playbackButtonSize = compactNav ? 'sm' : 'lg'
    const onTunesOrEditor = location.pathname.startsWith('/tunes') || location.pathname.startsWith('/editor/')
    const showHeaderPlayback = onTunesOrEditor && !narrowViewport
    const headerDropdownBtnStyle = {
        height: compactNav ? '2.85em' : '3.05em',
        width: compactNav ? '2.55em' : '2.7em',
        padding: 0,
        minHeight: 0,
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
    }

    function renderAuthButton(inHeader) {
        const className = inHeader ? 'header-auth-btn' : 'header-dropdown-btn'
        const size = inHeader ? (compactNav ? 'sm' : undefined) : navButtonSize
        const imgSize = inHeader ? (compactNav ? '28px' : '32px') : (compactNav ? '40px' : '50px')
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
                        ? <img src={profileUrl} onError={function() { setUserImageError(true) }} className="header-auth-profile-img" style={{ height: imgSize, width: imgSize }} alt="" />
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

    function renderNavMenu() {
        return (
            <Dropdown.Menu className="header-nav-menu" align="start">
                <div className="header-dropdown-section header-dropdown-section-actions">
                    <AddSongModal
                        buttonSize={navButtonSize}
                        buttonClassName="header-dropdown-btn"
                        setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                        tunes={props.tunes}
                        token={props.token}
                        requestGoogleScopes={props.requestGoogleScopes}
                        tunesHash={props.tunesHash}
                        show={getShowParam()}
                        showImport={showImport}
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
                    />
                </div>
                <Dropdown.Divider />
                <div className="header-dropdown-section">
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
                        {renderAuthButton(false)}
                    </Dropdown.Item>
                </div>
                <Dropdown.Divider />
                <div className="header-dropdown-section">
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
                </div>
                {narrowViewport && (location.pathname.startsWith('/tunes') || location.pathname.startsWith('/editor/')) && <>
                <Dropdown.Divider />
                <div className="header-dropdown-section header-dropdown-section-media">
                    <MediaPlayerButtons user={props.user} mediaController={props.mediaController} tunebook={props.tunebook} abcPlaylist={props.abcPlaylist} setAbcPlaylist={props.setAbcPlaylist} mediaPlaylist={props.mediaPlaylist} setMediaPlaylist={props.setMediaPlaylist} currentTuneBook={props.currentTuneBook} tagFilter={props.tagFilter} selected={selected}/>
                </div>
                </>}
                <Dropdown.Divider />
                <div className="header-dropdown-section header-dropdown-section-actions">
                    <PracticeSessionButton
                        tunebook={props.tunebook}
                        tunes={props.tunes}
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
                    style={{
                        ...headerTunesBtnStyle,
                        color: 'black',
                    }}
                    onClick={function() {
                        props.tunebook.utils.scrollTo('topofpage', 70)
                        props.setAbcPlaylist(null)
                        props.setMediaPlaylist(null)
                    }}
                >
                    {props.tunebook.icons.musicheader}
                </Button>
                <Dropdown as={ButtonGroup} autoClose={true} className="header-nav-dropdown" style={{position:'relative'}}>
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
            {showHeaderPlayback && (
                <span className="header-playback">
                    <MediaPlayerButtons
                        user={props.user}
                        mediaController={props.mediaController}
                        tunebook={props.tunebook}
                        buttonSize={playbackButtonSize}
                        abcPlaylist={props.abcPlaylist}
                        setAbcPlaylist={props.setAbcPlaylist}
                        mediaPlaylist={props.mediaPlaylist}
                        setMediaPlaylist={props.setMediaPlaylist}
                        currentTuneBook={props.currentTuneBook}
                        tagFilter={props.tagFilter}
                        selected={selected}
                    />
                    {(params.tuneId && (location.pathname.indexOf('/tunes') !== -1 || location.pathname.indexOf('/editor') !== -1)) && (
                        <ButtonGroup className="header-skip-buttons">
                            <Button size={playbackButtonSize} aria-label="Previous tune" onClick={function() { props.tunebook.navigateToPreviousSong(params.tuneId, navigate) }}>{props.tunebook.icons.skipback}</Button>
                            <Button size={playbackButtonSize} aria-label="Next tune" onClick={function() { props.tunebook.navigateToNextSong(params.tuneId, navigate) }}>{props.tunebook.icons.skipforward}</Button>
                        </ButtonGroup>
                    )}
                </span>
            )}
            <VoiceCommandButton
                token={props.token}
                tunebook={props.tunebook}
                tunes={props.tunes}
                setFilter={props.setFilter}
                setCurrentTuneBook={props.setCurrentTuneBook}
                setTagFilter={props.setTagFilter}
                setGroupBy={props.setGroupBy}
                setCurrentTune={props.setCurrentTune}
                setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
            />
        </span>
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
