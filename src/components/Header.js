import { Link  , useLocation} from 'react-router-dom'
import {Button, Dropdown, ButtonGroup} from 'react-bootstrap'
import AddSongModal from './AddSongModal'
import ImportOptionsModal from './ImportOptionsModal'
import {useEffect, useState} from 'react'
import {isMobile} from 'react-device-detect';
import {useNavigate} from 'react-router-dom'
import MediaPlayerButtons from './MediaPlayerButtons'
import useKeyPress from '../useKeyPress';


export default function Header(props) {
    var location = useLocation()
    var navigate = useNavigate()
    //console.log(props.token)
    //var params = useParams() // empty  ???
    var parts = location.pathname.split("/")
    var params = {tuneId: parts.length >= 3 ? parts[2] : null}
    const [userImageError, setUserImageError] = useState(false)
    useEffect(function() {
        //console.log(props.user, props.token)
        setUserImageError(false)
        if (props.token && props.user) props.loadUserImage(props.token, props.user)
    },[props.user])
    
    useEffect(function() {
        //console.log("FORCE NAV", props.forceNav)
        if (props.forceNav) {
            //console.log("REALLY FORCE NAV", props.forceNav)
            props.setForceNav(null)
            navigate(props.forceNav)
        }
    },[props.forceNav])
    
    const [width, setWidth] = useState(window.innerWidth);
    const verySmallScreen = width <= 480;

    useEffect(() => {
    /* Inside of a "useEffect" hook add an event listener that updates
       the "width" state variable when the window size changes */
    window.addEventListener("resize", () => {setWidth(window.innerWidth)});

    /* passing an empty array as the dependencies of the effect will cause this
       effect to only run when the component mounts, and not each time it updates.
       We only want the listener to be added once */
    }, []);

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
    const navButtonSize = compactNav ? undefined : 'lg'

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
                        setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                        tunes={props.tunes}
                        show={getShowParam()}
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
                    <ImportOptionsModal
                        setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                        tunes={props.tunes}
                        token={props.token}
                        show={showImport}
                        tunesHash={props.tunesHash}
                        forceRefresh={props.forceRefresh}
                        tunebook={props.tunebook}
                        currentTuneBook={props.currentTuneBook}
                        setCurrentTuneBook={props.setCurrentTuneBook}
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
            </Dropdown.Menu>
        )
    }

    if (location.pathname.startsWith('/print')) return null
    var selected = props.selected ? Object.keys(props.selected).map(function(v) {
        if (props.selected[v]) {
             return v
        } else {
            return ''
        }
    }).join(",") : ''
    //console.log("param  ",params,location)
    return <header className="App-header" style={{zIndex:11, fontSize:'1.2em'}} >
        <span style={{display:'inline-flex', alignItems:'center'}}>
            <ButtonGroup>
               <Link to="/tunes" ><Button size="lg" variant="info" style={{marginLeft:'0.1em', color: 'black', border: (location.pathname === '/tunes' ? '1px solid black' : '')}} onClick={function(e) {props.tunebook.utils.scrollTo('topofpage',70); props.setAbcPlaylist(null); props.setMediaPlaylist(null); }} ><img src="/favicon.png" alt="Tunes" style={{height:'40px', width:'40px'}} /></Button></Link>

                <Dropdown autoClose={true} style={{marginLeft:'0.1em', position:'relative'}}>
                    {props.isSyncing && <b style={{position:'absolute', top:0, left:0, backgroundColor:'lightgrey', zIndex:999}}>SYNC</b>}
                    <Dropdown.Toggle variant="info" id="dropdown-header" style={{height: compactNav ? '3em' : '3.4em', width: compactNav ? '2.8em' : '3em'}}>
                    </Dropdown.Toggle>
                    {renderNavMenu()}
                </Dropdown>
             </ButtonGroup>
                {!verySmallScreen && (
                    <span className="header-auth-separator">
                        {renderAuthButton(true)}
                    </span>
                )}
            
             
       </span>
       
        {(location.pathname.startsWith('/tunes') || location.pathname.startsWith('/editor/')) && <span style={{float:'right', padding:'0.1em', paddingLeft:'0.1em', backgroundColor:'#5400ff'}}>
        <MediaPlayerButtons user={props.user} mediaController={props.mediaController} tunebook={props.tunebook} abcPlaylist={props.abcPlaylist} setAbcPlaylist={props.setAbcPlaylist}   mediaPlaylist={props.mediaPlaylist} setMediaPlaylist={props.setMediaPlaylist} currentTuneBook={props.currentTuneBook} tagFilter={props.tagFilter} selected={selected}/>
        <>{(params.tuneId && (location.pathname.indexOf('/tunes') !== -1 || location.pathname.indexOf('/editor') !== -1)) && <ButtonGroup>
               <Button size="lg" onClick={function() {props.tunebook.navigateToPreviousSong(params.tuneId,navigate)}} >{props.tunebook.icons.skipback}</Button>
                <Button size="lg" onClick={function() {props.tunebook.navigateToNextSong(params.tuneId,navigate)}} >{props.tunebook.icons.skipforward}</Button> 
            </ButtonGroup>
            }</>
        
        </span>}
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
