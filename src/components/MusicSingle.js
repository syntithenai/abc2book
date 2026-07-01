import {useState, useEffect, useRef, useCallback} from 'react'
import {Link , useParams , useNavigate, useLocation} from 'react-router-dom'
import {Button, Dropdown} from 'react-bootstrap'
import Abc from './Abc'
import BoostSettingsModal from './BoostSettingsModal'
//import ReactTags from 'react-tag-autocomplete'
import BookMultiSelectorModal from  './BookMultiSelectorModal'
import TagsSelectorModal from './TagsSelectorModal'
import ShareTunebookModal from './ShareTunebookModal'
import {useSwipeable} from 'react-swipeable'
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import YouTube from 'react-youtube';  
import LinksEditorModal from './LinksEditorModal'
import ViewModeSelectorModal from './ViewModeSelectorModal'
import PlaylistManagerModal from './PlaylistManagerModal'
import abcjs from "abcjs";
//import ParserProblemsDiff from './ParserProblemsDiff'
import useAbcjsParser from '../useAbcjsParser'
import TitleAndLyricsEditorModal from './TitleAndLyricsEditorModal'
import MediaSeekSlider from '../components/MediaSeekSlider'
import MediaPlayerMedia from '../components/MediaPlayerMedia'
import SharePublicTuneModal from '../components/SharePublicTuneModal'
import RepeatsEditorModal from './RepeatsEditorModal'  
import OpenSheetMusicDisplay from './OpenSheetMusicDisplay'
import TimedLyricsChordsView from './TimedLyricsChordsView'
import { normalizeViewMode, showsMusicNotation } from '../viewModeUtils'
import { getLyricLinesForDisplay } from '../wLinesUtils'
import { classifyLyricChordLines, hasChordLines, formatChordChartForDisplay } from '../chordSheetUtils'
import MarkdownContent from './MarkdownContent'
import { buildAbcWithNoteSpacing } from '../noteSpacingUtils'
import {buildSingleTuneTitle, DEFAULT_APP_TITLE, setDocumentTitle} from '../pageTitle'
import { useIsNarrowViewport } from '../useMediaQuery'
import useKeyPress from '../useKeyPress'
import { toggleTunePlayback } from '../tunePlaybackActions'
import LyricsAutoscrollModal from './LyricsAutoscrollModal'

export default function MusicSingle(props) {
    let params = useParams();
    let navigate = useNavigate();
    const location = useLocation();
    const isNarrowViewport = useIsNarrowViewport();
    const swipeGestureRef = useRef({ dx: 0, dy: 0 });
    const audioPlayer = useRef(); 
    
    //var youtubeProgressInterval = useRef()
    var speakTimeout = null
    const abcjsParser = useAbcjsParser({tunebook: props.tunebook})
    //var {searchYouTube} = useYouTubeSearch()
    //console.log('single',props)
    const [showMedia, setShowMedia] = useState(false)
    const [mediaLinkNumber, setMediaLinkNumber] = useState(params.mediaLinkNumber > 0 ? params.mediaLinkNumber : 0)
    const [mediaLoading, setMediaLoading] = useState(false)
    const [ytMediaPlayer, setYTMediaPlayer] = useState(null)
    const [mediaProgress, setMediaProgress] = useState(0)
    const [midiData, setMidiData] = useState(null)
    const [mediaRefresh, setMediaRefresh] = useState(new Date())
    const [isPlaying, setIsPlaying] = useState(false)
    const [autoStart, setAutoStart] = useState(false)
    const [hasSpoken, setHasSpoken] = useState(false)
    const [squashLyrics, setSquashLyrics] = useState(false)
    const [tune, setTune] = useState(null)
    
    useEffect(function() {
		var t = props.tunes ? props.tunes[new String(params.tuneId)] : null
        //console.log('single change', params.tuneId, t, props.tunes)
        if (t) {
            setTune(t)
            props.mediaController.setTune(t)
        }
        setMusicStaffWidth(null)
        
    },[params.tuneId, props.tunes, props.mediaController])

    const handlePlaybackShortcut = useCallback(function(event) {
        if (props.blockKeyboardShortcuts) return
        const handled = toggleTunePlayback(props.mediaController, props.tunebook, navigate, location)
        if (handled) event.preventDefault()
    }, [props.blockKeyboardShortcuts, props.mediaController, props.tunebook, navigate, location])

    useKeyPress([' '], handlePlaybackShortcut)

    useEffect(function() {
        setDocumentTitle(buildSingleTuneTitle(tune && tune.name))
        return function() {
            setDocumentTitle(DEFAULT_APP_TITLE)
        }
    }, [tune])

    //const [abc, setAbc] = useState('')
    //let tune = props.tunes ? props.tunes[new String(params.tuneId)] : null
    const [zoomChords, setZoomChords] = useState(!props.tunebook.hasLyrics(tune))
    const [chordViewMode, setChordViewMode] = useState('transposed')
    // Non-persistent abcjs staff width for the music view. null = abcjs default (~740px).
    // Larger staff width packs more bars per line so the music renders skinnier and
    // more lines of music fit on the page. Intentionally not saved to the tune.
    const [musicStaffWidth, setMusicStaffWidth] = useState(null)
    
    //let abc = '' //props.tunebook.abcTools.settingFromTune(tune).abc
    const handlers = useSwipeable({
        delta: 50,
        trackMouse: false,
        preventScrollOnSwipe: false,
        swipeDuration: 500,
        touchEventOptions: { passive: true },
        onSwiping: function(eventData) {
            swipeGestureRef.current = { dx: eventData.deltaX, dy: eventData.deltaY };
        },
        onSwipedRight: function() {
            const g = swipeGestureRef.current;
            if (!tune || !tune.id) return;
            if (Math.abs(g.dx) < Math.abs(g.dy) * 1.5) return;
            props.tunebook.navigateToPreviousSong(tune.id, navigate);
        },
        onSwipedLeft: function() {
            const g = swipeGestureRef.current;
            if (!tune || !tune.id) return;
            if (Math.abs(g.dx) < Math.abs(g.dy) * 1.5) return;
            props.tunebook.navigateToNextSong(tune.id, navigate);
        },
    });
    
    
    
    //useEffect(function() {
        //if (!showMedia) {
            ////console.log('stop tom er')
            //clearInterval(youtubeProgressInterval.current)
            //youtubeProgressInterval.current = null
        //}
    //}, [showMedia])
    
    function getBeatsPerBar(meter) {
          switch (meter) {
            case '2/2':
              return 2
            case '3/2':
              return 3
            case '4/2':
              return 4
            case '3/8':
              return 1
            case '6/8':
              return 2
            case '9/8':
              return 3
            case '12/8':
              return 4
            case '2/4':
              return 2
            case '3/4':
              return 3
            case '4/4':
              return 4
            case '6/4':
              return 2
            case '9/4':
              return 3
          }
          return 4
        
    }
    

    function setupTune() {
        let tune = props.tunes ? props.tunes[params.tuneId] : null
        setZoomChords(!props.tunebook.hasLyrics(tune))
        //console.log('setuptune',tune)
        if (tune) {
           const hasTimedAlignment = tune.timedLyrics && tune.timedChords
           if (tune.viewMode) {
               props.setViewMode(normalizeViewMode(tune.viewMode))
           } else if (!props.tunebook.hasNotesOrChords(tune))  {
               props.setViewMode(hasTimedAlignment ? 'chordsInline' : 'chordsBlock')
           } else if (props.tunebook.hasLyrics(tune) && !props.tunebook.hasNotes(tune))  {
               props.setViewMode(hasTimedAlignment ? 'chordsInline' : 'chordsBlock')
           } else if (!props.tunebook.hasLyrics(tune) && props.tunebook.hasNotes(tune))  {
               props.setViewMode('music')
           }
           //props.tunebook.utils.scrollTo('topofpage')
           //setMediaLinkNumber(params.mediaLinkNumber)
           //console.log(params,tune.links)
           //props.mediaController.setTune(tune)
           //if (params.mediaLinkNumber > 0) props.mediaController.setSourceFromTune(params.mediaLinkNumber)
           
           //if (params.playState === "playMedia") {
               //props.mediaController.play()
                ////setAutoStart(false)
                ////if (Array.isArray(tune.links) && tune.links.length > 0) {
                    //////setMediaLinkNumber(0)
                    ////if (tune.links[0].startAt > 0) {
                        ////setMediaProgress(tune.links[0].startAt) 
                    ////} else {
                        ////setMediaProgress(0)
                    ////}
                    ////setMediaLoading(true); 
                    ////setShowMedia(true)
                ////}
           //} else if (params.playState === "playMidi") {
               ////console.log('playmidi')
               //props.mediaController.setSrc('')
               ////props.mediaController.ytPlayerRef.current = null
               ////props.mediaController.playerRef.current = null
                 ////props.mediaController.initMidi().then(function() {
                     ////props.mediaController.setCurrentTime(0)
                     //props.mediaController.play()
                 ////})
            //}
             ////else {
                ////props.mediaController.stop()
            ////}
             ////else {
                ////setAutoStart(false)
            ////}
            //console.log('Set Tune',tune)
            
        } else {
            //props.mediaController.setTune(null)
        }
    }

    useEffect(function() {
        setZoomChords(false)
        setupTune()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setupTune reads params.tuneId and props.tunes
    },[params.tuneId, props.tunes])

    function getTempo() {
        // use page tempo that has been updated from tune
        var tempo = (tune && tune.tempo > 0 ? tune.tempo :  100)
        if (tempo > 400) tempo = 400
        if (tempo < 1) tempo = 1
        return tempo
    }
    
    const lastScrollTopRef = useRef(0);
	const [fixedSingleMenu, setFixedSingleMenu] = useState(false)
	useEffect(() => {
		const handleScroll = (e) => {
				const currentScrollTop = window.scrollY;
				if (currentScrollTop > lastScrollTopRef.current) {
				  setFixedSingleMenu(false)
				} else {
				  if (currentScrollTop > 100) {
					  setFixedSingleMenu(true)
				  } else {
					  setFixedSingleMenu(false)
				  }
				}
				lastScrollTopRef.current = currentScrollTop;
		};

		window.addEventListener("scroll", handleScroll);

		return () => {
			window.removeEventListener("scroll", handleScroll);
		};
	}, []);
    
       //<Button style={{float:'right'}} variant="danger" ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="none" d="M0 0h24v24H0z"/><path d="M12 3a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zm0-2a5 5 0 0 1 5 5v4a5 5 0 0 1-10 0V6a5 5 0 0 1 5-5zM3.055 11H5.07a7.002 7.002 0 0 0 13.858 0h2.016A9.004 9.004 0 0 1 13 18.945V23h-2v-4.055A9.004 9.004 0 0 1 3.055 11z"/></svg></Button>
    //console.log('single T',params.tuneId,tune,props.tunes)
    var words = {}
        
    if (tune) {
        var current = 0
        var lyricLines = getLyricLinesForDisplay(tune)
        if (lyricLines.length > 0) {
            lyricLines.forEach(function(line) {
              if (line && line.trim().length > 0) {
                  if (!Array.isArray(words[current])) words[current] = []
                  words[current].push(line)
              } else {
                  current++
              }
            })
        }  
        
        //<iframe src={link} ></iframe>
        //console.log('sING abc',props.tunebook.abcTools.tunesToAbc(props.tunes))
        var firstVoice = tune.voices && Object.keys(tune.voices).length > 0 ? Object.values(tune.voices)[0] : {notes:[]}
        //var parsed = props.tunebook.abcTools.parseAbcToBeats(firstVoice.notes.join("\n"))
        ////console.log('sING',parsed.chords)
        //var [a,b,chordsArray,c] = parsed
        var chordTranspose = (Number(tune.transpose) || 0) + (chordViewMode === 'capo' ? (Number(tune.capo) || 0) : 0)
        var hasCapo = Number(tune.capo) > 0
        var normalizedViewMode = normalizeViewMode(props.viewMode)
        var isMusicView = normalizedViewMode === 'music'
        var isMusicAndLyricsView = normalizedViewMode === 'musicAndLyrics'
        var isChordBlockView = normalizedViewMode === 'chordsBlock'
        var isChordInlineView = normalizedViewMode === 'chordsInline'
        var isInfoView = normalizedViewMode === 'info'
        var isChordLayout = isChordBlockView || isChordInlineView
        var showNotation = showsMusicNotation(normalizedViewMode)
        var displayAbc = showNotation
          ? buildAbcWithNoteSpacing(tune, props.tunebook.abcTools, { includeLyrics: isMusicAndLyricsView })
          : props.tunebook.abcTools.json2abc(tune)
        var staffDisplayAbc = showNotation
          ? displayAbc.split('\n').filter(function(line) { return !line.startsWith('B:'); }).join('\n')
          : displayAbc
        var plainLyricLines = getLyricLinesForDisplay(tune)
        var isLyricChordSheet = hasChordLines(plainLyricLines)
        var lyricsVisibleInView = plainLyricLines.length > 0 && (isChordLayout || isMusicAndLyricsView)
        var chords = formatChordChartForDisplay(abcjsParser.renderChords(props.tunebook.abcTools.emptyABC(tune.name)  + firstVoice.notes.join("\n"), false, chordTranspose, tune.key, tune.noteLength, tune.meter))
        var chordsWithDots = formatChordChartForDisplay(abcjsParser.renderChords(props.tunebook.abcTools.emptyABC(tune.name)  + firstVoice.notes.join("\n"), true, chordTranspose, tune.key, tune.noteLength, tune.meter))
        var uniqueChords = {}
        chords.replaceAll("|",' ').split(' ').forEach(function(chord) {
            if (chord.trim().length > 0) uniqueChords[chord.trim()] = true
        })
        if (isLyricChordSheet) {
            classifyLyricChordLines(plainLyricLines).forEach(function(item) {
                if (item.type !== 'chord') return
                String(item.text || '').trim().split(/\s+/).forEach(function(chord) {
                    if (chord.trim().length > 0) uniqueChords[chord.trim()] = true
                })
            })
        }
        
        function getYouTubeId(url) {
            const arr = url.split(/(vi\/|v%3D|v=|\/v\/|youtu\.be\/|\/embed\/)/);
            return undefined !== arr[2] ? arr[2].split(/[^\w-]/i)[0] : arr[0];
        }
        
        function isYoutubeLink(urlToParse){
            if (urlToParse) {
                var regExp = /^(?:https?:\/\/)?(?:m\.|www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:\S+)?$/;
                if (urlToParse.match(regExp)) {
                    return true;
                }
            }
            return false;
        }
        
        function shouldPlayMedia() {
            //console.log('SPM',showMedia,tune)
            return (showMedia && Array.isArray(tune.links) && tune.links.length > mediaLinkNumber && tune.links[mediaLinkNumber])
        }
        var useMediaLinkNumber = mediaLinkNumber > 0 ? mediaLinkNumber : 0
        
        // update state to next link or navigate to next tune where there is a currentMediaPlaylist
        function nextLinkOrTune() {
            props.tunebook.navigateToNextSong(tune.id, navigate)
        }
        
        function onEnded(progress, start, stop,seek) {
            if (props.mediaController.invokePracticeSessionHandler && props.mediaController.invokePracticeSessionHandler()) {
                return
            }
            if (props.mediaPlaylist || props.abcPlaylist) {
                nextLinkOrTune()
            }
        }
       
        function downloadMidi() {
            props.tunebook.downloadMidi(tune)
        }
        
        
        function fixLinks(tune,index,field,startOrEnd) {
            var previousKey = parseInt(index - 1)
            var link = tune.links[index]
            if (startOrEnd === 'start' && link[field] > 0) tune.links[previousKey].startAt = link[field]
            if (startOrEnd === 'end' && link[field] > 0) tune.links[previousKey].endAt = link[field]
            //console.log('update tune',tune,tune.links)
            props.tunebook.saveTune(tune)
        }
        
        function removeLink(tune,index) {
            //console.log('remove links',tune.links,index)
            tune.links.splice(index,1)
            props.tunebook.saveTune(tune)
        }
        
        function zoomIn() {
            //console.log("zoomin",tune)
            var zoom = tune && tune.zoom && tune.zoom < 5 ? tune.zoom : 1 
            tune.zoom = zoom + 0.1
            props.tunebook.saveTune(tune)
        }
        
        function zoomOut() {
            //console.log("zoomout",tune)
            var zoom = tune && tune.zoom && tune.zoom < 5 ? tune.zoom : 1 
            tune.zoom = zoom - 0.1
            props.tunebook.saveTune(tune)
        }
        
        var MUSIC_STAFF_WIDTH_DEFAULT = 740
        var MUSIC_STAFF_WIDTH_STEP = 120
        var MUSIC_STAFF_WIDTH_MIN = 300
        var MUSIC_STAFF_WIDTH_MAX = 2200
        // Bigger music: fewer bars per line. Narrower staff width.
        function musicZoomIn() {
            setMusicStaffWidth(function(w) {
                var cur = w || MUSIC_STAFF_WIDTH_DEFAULT
                return Math.max(MUSIC_STAFF_WIDTH_MIN, cur - MUSIC_STAFF_WIDTH_STEP)
            })
        }
        // Skinnier music: more bars per line, so more lines of music fit on the page.
        function musicZoomOut() {
            setMusicStaffWidth(function(w) {
                var cur = w || MUSIC_STAFF_WIDTH_DEFAULT
                return Math.min(MUSIC_STAFF_WIDTH_MAX, cur + MUSIC_STAFF_WIDTH_STEP)
            })
        }
        
         
        
        
        // 640ac8b26312f4897797a843
        var abc = props.tunebook.abcTools.json2abc(tune)        
        var useInstrument = localStorage.getItem('bookstorage_last_chord_instrument') ? localStorage.getItem('bookstorage_last_chord_instrument') : 'guitar'
        //console.log('uniq',uniqueChords)
        var chordPanelTop = zoomChords
            ? '0em'
            : (props.mediaController.duration > 0 ? '10.5em' : '7.4em')
        var fullLyricsPanel = plainLyricLines.length > 0 ? (
          isLyricChordSheet
            ? <TimedLyricsChordsView tune={tune} tunebook={props.tunebook} />
            : <div className="full-lyrics-panel" style={{ fontSize: (tune && tune.zoom > 0 ? tune.zoom : 1) * 100 + '%' }}>
              {plainLyricLines.map(function(line, index) {
                if (!line || String(line).trim().length === 0) {
                  return <div key={index} className="lyrics-line-spacer" style={{ height: '0.6em' }} />;
                }
                return <div key={index} className="lyrics-line" style={{ marginBottom: '0.35em' }}>{line}</div>;
              })}
            </div>
        ) : null
        function openFormattedPrint() {
            navigate('/print', { state: { tuneIds: [tune.id] } });
        }

        var abcContainerId = 'abccontainer-' + (autoStart ? 'Y' : 'N') + '-' + (localStorage.getItem('bookstorage_autoprime') === 'true' ? 'Y' : 'N')
        var abcPlayer = (
          <div id={abcContainerId}>
            <Abc key={tune.id + '-' + (autoStart ? 'auto' : 'manual')} showRepeats={true} warp={1} staffwidth={musicStaffWidth} onStarted={function() {if (props.mediaController.confirmPlayingStarted) props.mediaController.confirmPlayingStarted()}} mediaController={props.mediaController} speakTitle={localStorage.getItem('bookstorage_announcesong')} autoStart={autoStart} autoPrime={true} autoScroll={showNotation} setMidiData={setMidiData} forceRefresh={props.forceRefresh} metronomeCountIn={true} tunes={props.tunes} editableTempo={true} repeat={tune.repeats > 0 ? tune.repeats : 1 } tunebook={props.tunebook} abc={staffDisplayAbc} meter={tune.meter} onEnded={onEnded} hideSvg={false} hidePlayer={true} />
          </div>
        )
        var tuneInfoSection = (Array.isArray(tune.books) && tune.books.length > 0) || (Array.isArray(tune.tags) && tune.tags.length > 0) ? (
          <div className="music-tune-info-section">
            {Array.isArray(tune.books) && tune.books.map(function(book, index) {
              return <div key={'book-' + index} className="music-tune-info-line">Book: {book}</div>;
            })}
            {Array.isArray(tune.tags) && tune.tags.length > 0 && (
              <div className="music-tune-info-line">Tags: {tune.tags.join(', ')}</div>
            )}
          </div>
        ) : null
        var backgroundInfoText = tune && typeof tune.backgroundInfo === 'string' ? tune.backgroundInfo.trim() : ''
        var backgroundInfoPanel = isInfoView ? (
          <div className="tune-background-info-view" style={{ padding: '1em 1.2em', maxWidth: '48em' }}>
            <div className="title" style={{ marginBottom: '1em' }}>
              <TitleAndLyricsEditorModal
                tunebook={props.tunebook}
                tune={tune}
              token={props.token}
              setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
            />
              {tune.composer && <span> - {tune.composer}</span>}
            </div>
            {backgroundInfoText ? (
              <MarkdownContent text={backgroundInfoText} />
            ) : (
              <div style={{ color: '#666' }}>
                No background information yet — use the editor Info tab to add some.
              </div>
            )}
          </div>
        ) : null
        var practiceHidesVisibleUi = props.practiceSession
          && props.practiceSession.sessionOpen
          && props.practiceSession.phase === 'tune'
          && props.practiceSession.currentStep
          && props.practiceSession.currentStep.type === 'tune'
          && props.practiceSession.currentStep.tuneId === params.tuneId
        var tuneMetaControls = (
          <>
            <BoostSettingsModal tunebook={props.tunebook} value={tune.boost} onChange={function(val) {tune.boost = val; props.tunebook.saveTune(tune); props.forceRefresh()}} difficulty={tune.difficulty > 0 ? tune.difficulty : 0} onChangeDifficulty={function(val) {tune.difficulty = val; props.tunebook.saveTune(tune); props.forceRefresh()}} setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts} />
            <BookMultiSelectorModal forceRefresh={props.forceRefresh} tunebook={props.tunebook} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} value={tune.books} onChange={function(val) { tune.books = val; props.tunebook.saveTune(tune);} } setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts} />
            <TagsSelectorModal forceRefresh={props.forceRefresh} tunebook={props.tunebook} setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts} defaultOptions={props.tunebook.getTuneTagOptions} searchOptions={props.tunebook.getSearchTuneTagOptions} value={tune.tags} onChange={function(val) { tune.tags = val; props.tunebook.saveTune(tune);} } />
            <LinksEditorModal icon="media" mediaController={props.mediaController} forceRefresh={props.forceRefresh} tunebook={props.tunebook} tune={tune} setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts} onChange={
              function(links) {
                if (tune) {
                  tune.links = links
                  props.tunebook.saveTune(tune)
                }
              }
            } />
          </>
        )
        return <div className={'music-single' + (practiceHidesVisibleUi ? ' music-single-practice-playback-only' : '')} style={practiceHidesVisibleUi ? undefined : {border:'1px solid black'}} {...handlers} >
			
        
            <div className={'music-buttons' + (fixedSingleMenu ? ' music-buttons-fixed' : '')}>
              <div className="music-buttons-inner">
                <div className="music-buttons-col music-buttons-col-left">
                <Dropdown as={ButtonGroup} drop={isNarrowViewport ? 'up' : 'down'}>
                      <Dropdown.Toggle variant="outline-dark" id="dropdown-basic" className="music-actions-dropdown-toggle" aria-label="Tune actions">
                        <span aria-hidden="true">{props.tunebook.icons.dropdown}</span>
                      </Dropdown.Toggle>

                      <Dropdown.Menu className="music-actions-dropdown-menu">
                        <div className="music-actions-dropdown-cols">
                          <div className="music-actions-dropdown-actions">
                            <Dropdown.Item as="div" className="music-actions-dropdown-cell">
                              <Button as={Link} to={'/editor/'+params.tuneId} variant="outline-primary" className="music-actions-menu-btn">
                                {props.tunebook.icons.pencil} Edit
                              </Button>
                            </Dropdown.Item>
                            <Dropdown.Item as="div" className="music-actions-dropdown-cell">
                              <Button variant="outline-danger" className="music-actions-menu-btn" onClick={function() { if (window.confirm('Do you really want to delete this tune ?')) { props.tunebook.deleteTune(tune.id) }; navigate('/tunes') }}>
                                {props.tunebook.icons.bin} Delete
                              </Button>
                            </Dropdown.Item>
                            <Dropdown.Item as="div" className="music-actions-dropdown-cell">
                              <Button variant="outline-secondary" className="music-actions-menu-btn" onClick={openFormattedPrint}>
                                {props.tunebook.icons.printer} Print (formatted)
                              </Button>
                            </Dropdown.Item>
                            <Dropdown.Item as="div" className="music-actions-dropdown-cell">
                              <Button variant="outline-secondary" className="music-actions-menu-btn" onClick={function() { props.tunebook.utils.download((tune.name ? tune.name.trim() : 'tune') + '.abc', props.tunebook.abcTools.json2abc(tune).trim()) }}>
                                {props.tunebook.icons.save} Download ABC
                              </Button>
                            </Dropdown.Item>
                            <Dropdown.Item as="div" className="music-actions-dropdown-cell">
                              <Button id="midi-download-button" variant="outline-secondary" className="music-actions-menu-btn" onClick={downloadMidi}>
                                {props.tunebook.icons.midi} Download MIDI
                              </Button>
                            </Dropdown.Item>
                            <Dropdown.Item as="div" className="music-actions-dropdown-cell">
                              <SharePublicTuneModal tunebook={props.tunebook} token={props.token} tune={tune} buttonClassName="music-actions-menu-btn" />
                            </Dropdown.Item>
                          </div>
                          {isNarrowViewport && (
                          <div className="music-actions-dropdown-col music-actions-dropdown-col-meta">
                            {tuneMetaControls}
                          </div>
                          )}
                        </div>
                      </Dropdown.Menu>
                    </Dropdown>
                </div>

                {!isNarrowViewport && (
                <div className="music-buttons-col music-buttons-col-meta music-tune-meta-inline">
                  <ButtonGroup className="music-tune-meta-group">
                    {tuneMetaControls}
                  </ButtonGroup>
                </div>
                )}

                <div className="music-buttons-col music-buttons-col-right">
                  {isChordLayout && <>
                 {hasCapo && <Button
                            variant={chordViewMode === 'capo' ? 'primary' : 'outline-primary'}
                            size="sm"
                            className="music-toolbar-btn music-capo-toggle-btn"
                            aria-pressed={chordViewMode === 'capo'}
                            aria-label={'Capo ' + tune.capo + (chordViewMode === 'capo' ? ' fingering' : ' transposed')}
                            onClick={function() {setChordViewMode(chordViewMode === 'capo' ? 'transposed' : 'capo')}}>
                            Capo {tune.capo}
                        </Button>}
                 <Button onClick={zoomIn} className="music-toolbar-btn" aria-label="Zoom in">{props.tunebook.icons.zoomin}</Button>
                 <Button onClick={zoomOut} className="music-toolbar-btn" aria-label="Zoom out">{props.tunebook.icons.zoomout}</Button>
                  </>}
                 {(isMusicView || isMusicAndLyricsView) && <>
                 <Button onClick={musicZoomIn} className="music-toolbar-btn" aria-label="Zoom in music">{props.tunebook.icons.zoomin}</Button>
                 <Button onClick={musicZoomOut} className="music-toolbar-btn" aria-label="Zoom out music">{props.tunebook.icons.zoomout}</Button>
                  </>}
                  {lyricsVisibleInView && !practiceHidesVisibleUi && (
                    <LyricsAutoscrollModal
                      tune={tune}
                      tunebook={props.tunebook}
                      mediaController={props.mediaController}
                      mediaLinkNumber={mediaLinkNumber}
                      setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                    />
                  )}
                  <ViewModeSelectorModal viewMode={props.viewMode} tunebook={props.tunebook}  onChange={function(val) {
                    const mode = normalizeViewMode(val)
                    props.setViewMode(mode)
                    tune.viewMode = mode
                    tune.id = params.tuneId
                    props.tunebook.saveTune(tune)
                  }} />
                </div>
              </div>
            </div>
             {props.mediaController.duration > 0 && <MediaSeekSlider mediaController={props.mediaController} />}
             
				  
              
             {isChordLayout && <>
                {!zoomChords && <div style={{border:'1px solid black'}}>
                     <div className="title" style={{ marginTop:'0.25em',marginBottom:'1em', width:'55%', paddingLeft:'0.3em'}} >
                        {Object.keys(words).length > 0  && <Button style={{marginRight:'1em'}}  onClick={function() {setSquashLyrics(!squashLyrics)}}>{props.tunebook.icons.map2}</Button>}
                        <TitleAndLyricsEditorModal
                          tunebook={props.tunebook}
                          tune={tune}
                          token={props.token}
                          setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                        />
                        {tune.composer && <span> - {tune.composer}</span>}
                     </div>

                     {(isChordInlineView || (isChordBlockView && isLyricChordSheet && !squashLyrics)) && (
                       <TimedLyricsChordsView tune={tune} tunebook={props.tunebook} chordTranspose={chordTranspose} />
                     )}
                     
                     {isChordBlockView && !isLyricChordSheet && (!squashLyrics && Object.keys(words).length > 0) && <div className="lyrics" style={{ fontSize:(tune && tune.zoom > 0 ? tune.zoom : 1) * 100+"%" , width:'55%', paddingLeft:'0.3em' ,marginTop:'1em'}} >
                        {Object.keys(words).map(function(key) {
                            return <div  key={key} className="lyrics-block" style={{paddingTop:'1em',paddingBottom:'1em', pageBreakInside:'avoid'}} >{words[key].map(function(line,lk) {
                                    return <div key={lk} className="lyrics-line" >{line}</div>
                                })}</div>
                        })}
                     </div>}
                     {isChordBlockView && !isLyricChordSheet && (squashLyrics && Object.keys(words).length > 0) && <div className="lyrics" style={{ width:'55%', paddingLeft:'0.3em' ,marginTop:'2.5em'}} >
                        {Object.keys(words).map(function(key) {
                            return <div  key={key} className="lyrics-block" style={{paddingTop:'1em',paddingBottom:'1em', pageBreakInside:'avoid'}} >
                                    <div  className="lyrics-line" >{words[key][0]}</div>
                                    {words[key].length > 1 && <div  className="lyrics-line-first words" >{words[key].slice(1).map(function(line,lk) {
                                            var parts = line.trim().split(' ')
                                            return <span>{parts[0]} {parts[1]}...</span>
                                        })}
                                    </div>}
                                    
                             </div>
                        })}
                        
                     </div>}
                </div>  }
      
                 {isChordBlockView && (Object.keys(uniqueChords).length > 0) && <div className={'chord-diagram-panel' + (zoomChords === true ? ' chord-diagram-panel-expanded' : '')} style={{ top: chordPanelTop }} >
                    {!(zoomChords === true) && <Button style={{color:'white'}} aria-label="Expand chord diagrams" aria-expanded={false} onClick={function() {setZoomChords(true)}} >{props.tunebook.icons.arrowlefts}</Button>}
                    {(zoomChords === true) && <Button style={{color:'white'}} aria-label="Collapse chord diagrams" aria-expanded={true} onClick={function() {setZoomChords(false)}} >{props.tunebook.icons.arrowrights}</Button>}
                    <span>
                        {Object.keys(uniqueChords).map(function(chord) {
                            var chordLetter = chord
                            var chordType = ''
                            return <Link to={"/chords/"+useInstrument+"/"+chordLetter+"/"+chordType} ><Button>{chord}</Button></Link>
                        })}
                        </span>
                        {zoomChords && <TitleAndLyricsEditorModal
                          tunebook={props.tunebook}
                          tune={tune}
              token={props.token}
              setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
            />} 
                    <div style={{ overflowY:'scroll', height:'100%'}} >
                        <pre style={{ fontWeight:'bold', fontSize:(zoomChords === true ? '2.5em' : '') ,border:'1px solid black', borderRadius:'5px',marginTop:'1em', padding:'0.3em', lineHeight:'2em'}} >{(zoomChords ? chordsWithDots : chords)}</pre>
                        <br/><br/><br/>
                    </div>
                 </div>}
             </>}
             
             
             {isInfoView && backgroundInfoPanel}

             {isMusicView ? (
               <div>
                 {(showMedia && Array.isArray(tune.links) && tune.links.length > 0) && <div style={{ clear: 'both', width: '100%', height: '3em' }} />}
                 <div className="music-notation-section">
                   {abcPlayer}
                 </div>
                 {tuneInfoSection && <>
                   <hr className="music-page-divider" />
                   {tuneInfoSection}
                 </>}
               </div>
             ) : (
             <div style={{paddingLeft:'0.7em', paddingRight:'0.7em'}}>
                 {(showMedia && Array.isArray(tune.links) && tune.links.length > 0) && <div style={{  clear:'both',  width:'100%', height:'3em'}} ></div>}
                 {isMusicAndLyricsView && plainLyricLines.length > 0 ? (
                   <div className="music-and-lyrics-split">
                     <div className="music-and-lyrics-notation">
                       {abcPlayer}
                     </div>
                     <div className="music-and-lyrics-text">
                       <div className="title" style={{ marginBottom: '1em' }}>
                         <TitleAndLyricsEditorModal
                           tunebook={props.tunebook}
                           tune={tune}
              token={props.token}
              setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
            />
                         {tune.composer && <span> - {tune.composer}</span>}
                       </div>
                       {fullLyricsPanel}
                     </div>
                   </div>
                 ) : (
                   <div style={!showNotation ? {position: 'relative', top: 2000} : {}}>
                     {abcPlayer}
                   </div>
                 )}
             </div>
             )}
             
             
             
             <MediaPlayerMedia mediaController={props.mediaController} tunebook={props.tunebook}  tune={tune} onEnded={onEnded} />
             
             <div style={{display:'none'}} id="transpose_render"></div>
        </div>
    }
}

//<ImagesManagerModal tunebook={props.tunebook} tune={tune} login={props.login} logout={props.logout} token={props.token}  fileManager={fileManager} />
						
						//<RecordingsManagerModal tunebook={props.tunebook} tune={tune} login={props.login} logout={props.logout} token={props.token}  fileManager={recordingsManager} />
						
 //{(!props.abcPlaylist && props.mediaPlaylist && props.mediaPlaylist.tunes && props.mediaPlaylist.tunes.length > 0) && <div style={{position:'fixed', top: '6px', right: '6px', zIndex:999}} >
                    //<ButtonGroup variant="danger">
                        //{(!mediaLoading && showMedia && isPlaying) && <Button variant="warning" onClick={function() {
                            ////console.log(audioPlayer)
                                //try {
                                    //if (audioPlayer && audioPlayer.current) audioPlayer.current.pause()
                                    //if (ytMediaPlayer) ytMediaPlayer.pauseVideo()
                                //} catch (e) {
                                    //console.log(e)
                                //}
                                //try {
                                    //setIsPlaying(false)
                                //} catch (e) {
                                    //console.log(e)
                                //}
                            //}} >{props.tunebook.icons.pause}</Button>}
                        //{(!mediaLoading && showMedia && !isPlaying) && <Button variant="success" onClick={function() {
                                //try {
                                    //if (audioPlayer && audioPlayer.current) audioPlayer.current.play()
                                    //if (ytMediaPlayer) ytMediaPlayer.playVideo()
                                //} catch (e) {
                                    //console.log(e)
                                //}
                                //try {
                                    //setIsPlaying(true)
                                //} catch (e) {
                                    //console.log(e)
                                //}
                            //}} >{props.tunebook.icons.play}</Button>}
                        //<Button variant="danger" size="xl"  onClick={function() {props.setMediaPlaylist(null); setShowMedia(false)}} >{mediaLoading ? props.tunebook.icons.waiting : props.tunebook.icons.stop} </Button>
                        
                    //</ButtonGroup>
               //</div>}
              //{(showMedia && Array.isArray(tune.links) && tune.links.length > useMediaLinkNumber && tune.links[useMediaLinkNumber]) && <div style={{  clear:'both',  width:'100%'}} key={tune.id+"-"+params.playState+"-"+useMediaLinkNumber} >
                        //{!isYoutubeLink(tune.links[useMediaLinkNumber].link) ? <audio  ref={audioPlayer} 
                            //onCanPlay={function(event) { 
                                //setMediaLoading(false);
                                //var toSpeak = tune.name
                                //if (tune.composer) toSpeak += " by " + tune.composer
                                //var speakTitle = localStorage.getItem('bookstorage_announcesong') === "true" ? true : false
                                //if (speakTitle && !hasSpoken) window.speak(toSpeak)
                                //setHasSpoken(true)
                                //setIsPlaying(true)
                                
                                
                            //}} 
                            //width="1px" height="1px" autoPlay={"true"} 
                            //onEnded={function() {
                                ////console.log('ended a')
                                //// next link
                                //if (props.mediaPlaylist || props.abcPlaylist) {
                                    //nextLinkOrTune()
                                //}
                            //}}
                            //onError={function(e) {
                                //console.log('err media',e); 
                                //if (props.mediaPlaylist || props.abcPlaylist) {
                                    //nextLinkOrTune()
                                //}
                            //}} 
                            //onTimeUpdate={function(e) {
                                //setMediaProgress(e.target.currentTime/e.target.duration)
                            //}}
                             //>
                                //<source src={tune.links[useMediaLinkNumber].link} type="video/ogg" />
                                //Your browser does not support the video tag.
                                //</audio> : <div style={{clear:'both'}} >
                                
                                //<YouTube videoId={getYouTubeId(tune.links[useMediaLinkNumber].link)} opts={{
                                  //width: '100%',
                                  //playerVars: {
                                    //loop : 1,
                                    //autoplay: 1,
                                    //controls: 0,
                                    //start: (tune.links[useMediaLinkNumber].startAt ? parseInt(tune.links[useMediaLinkNumber].startAt) : 0),
                                    //end: (tune.links[useMediaLinkNumber].endAt ? parseInt(tune.links[useMediaLinkNumber].endAt) : 0)
                                  //},
                                //}} 
                                //onEnd={function() {
                                    ////console.log('ty ended')
                                    //clearInterval(youtubeProgressInterval.current)
                                    //youtubeProgressInterval.current = null
                                    //if (props.mediaPlaylist || props.abcPlaylist) {
                                        //nextLinkOrTune()
                                    //}
                                //}} 
                                //onError={function(e) {
                                    //console.log('err yt',e)
                                    //clearInterval(youtubeProgressInterval.current)
                                    //youtubeProgressInterval.current = null
                                    //if (props.mediaPlaylist || props.abcPlaylist) {
                                        //nextLinkOrTune()
                                    //}
                                //}} 
                                //onReady={
                                    //function(event) {
                                        //setYTMediaPlayer(event.target); 
                                        //console.log('YTREDD')
                                        //var toSpeak = tune.name
                                        //if (tune.composer) toSpeak += " by " + tune.composer
                                        //var speakTitle = localStorage.getItem('bookstorage_announcesong') === "true" ? true : false
            
                                        //if (speakTitle && !hasSpoken) window.speak(toSpeak)
                                        //setHasSpoken(true)
                                        //event.target.playVideo()
                                        //setIsPlaying(true)
                                        
                                    //}    
                                //}
                                //onStateChange={
                                    //function(e) {
                                        //if (e.data === 1) {
                                            //setMediaLoading(false)
                                            //clearInterval(youtubeProgressInterval.current)
                                            //youtubeProgressInterval.current = setInterval(function() {
                                                //setMediaProgress(e.target.getCurrentTime()/e.target.getDuration())
                                                ////console.log('yt progress',e.target.getCurrentTime(),e.target.getDuration())
                                            //}, 100)
                                        //}
                                    //}
                                //} 
                                
                                 ///> 
                                
                            //</div>
                            
                        //}
                        
                   //</div>}
//{(showMedia && Array.isArray(tune.links) && tune.links.length > useMediaLinkNumber && tune.links[useMediaLinkNumber]) && <div style={{  clear:'both',  width:'100%'}} key={tune.id+"--"+params.playState+"-"+useMediaLinkNumber} >
                        
                        
                        //<div style={{float: 'left', fontSize:'0.6em', position:'relative', top:'1.5em'}} >
                            //{(audioPlayer && audioPlayer.current && audioPlayer.current.currentTime && audioPlayer.current.duration) ? <b>{audioPlayer.current.currentTime.toFixed(2)}/{audioPlayer.current.duration.toFixed(2)}</b> : null}
                            
                            //{(mediaProgress && ytMediaPlayer && ytMediaPlayer.getDuration && ytMediaPlayer.getDuration()  && ytMediaPlayer.seekTo) ? <b>{(mediaProgress * ytMediaPlayer.getDuration()).toFixed(2)}/{ytMediaPlayer.getDuration().toFixed(2)}</b> : null}
                        //</div>
                        
                        //<input style={{width:'100%',height:'40px', zIndex:9999999, marginTop:'1em'}} className="mediaprogressslider" type="range" min='0' max='1' step='0.0001' value={mediaProgress} onChange={function(e) {
                                        //setMediaProgress(e.target.value); 
                                            
                                        //try {
                                            ////console.log(e.target.value); 
                                            //if (ytMediaPlayer && ytMediaPlayer.getDuration && ytMediaPlayer.seekTo) {
                                                //ytMediaPlayer.seekTo(parseFloat(e.target.value * ytMediaPlayer.getDuration()).toFixed(2)) 
                                            //};
                                        //} catch (e) {
                                            //console.log(e)
                                        //}
                                        //if (audioPlayer && audioPlayer.current) {
                                            //audioPlayer.current.currentTime = parseFloat(e.target.value * audioPlayer.current.duration ).toFixed(2)
                                        //}
                                    
                                    //}}  />
                    //</div>}
//<Badge>{props.mediaPlaylist && props.mediaPlaylist.currentTune > 0 ? parseInt(props.mediaPlaylist.currentTune) + 1 : 1}/{props.mediaPlaylist.tunes.length}</Badge>
 //<Button title="Print" className='btn-primary'  style={{float:'left'}} onClick={window.print} >{props.tunebook.icons.printer}</Button>
                //<Button title="Download" className='btn-success' style={{float:'left'}} onClick={function() {props.tunebook.utils.download((tune.name ? tune.name.trim() : 'tune') + '.abc',props.tunebook.abcTools.json2abc(tune).trim())}} >{props.tunebook.icons.save}</Button>
                //<a  style={{float:'left'}}  target="_new" href={"https://www.youtube.com/results?search_query="+tune.name + ' '+(tune.composer ? tune.composer : '')} ><Button title="Search YouTube">{props.tunebook.icons.youtube}</Button></a>

//<Abc  autoPrime={localStorage.getItem('bookstorage_autoprime')} showTempoSlider={true} editableTempo={true} forceRefresh={props.forceRefresh} metronomeCountIn={true}  tunes={props.tunes} repeat={tune.repeats > 0 ? tune.repeats : 1 } tunebook={props.tunebook}  abc={props.tunebook.abcTools.json2abc(tune)} tempo={getTempo()} meter={tune.meter}  onEnded={onEnded} />
             



            //{props.viewMode === 'music' && <>
             
             
             //<div className="lyrics" style={{marginLeft:'2em'}} >
                //{Object.keys(words).map(function(key) {
                    //return <div  key={key} className="lyrics-block" style={{paddingTop:'1em',paddingBottom:'1em', pageBreakInside:'avoid'}} >{words[key].map(function(line,lk) {
                            //return <div key={lk} className="lyrics-line" >{line}</div>
                        //})}</div>
                //})}
             //</div>
             //</>}

 //{(window.location.href.startsWith('http://localhost') || (props.user && props.user.email &&  props.user.email === 'syntithenai@gmail.com')) &&  <div> {props.tunebook.hasLinks(tune) ? <div>
            //<div style={{clear:'both'}} ><br/><br/>    </div>
            //{tune.links.map(function(link,lk) {
                //return <div>{lk}&nbsp; 
                    //{true ? <>
                        //S:{link.startAt} {(parseInt(lk) > 0 && parseFloat(link.startAt) > 0) ? <><Button onClick={function() {fixLinks(tune,lk,'startAt','start')}}>Start</Button><Button onClick={function() {fixLinks(tune,lk,'startAt','end')}}>End</Button></> : ''} 
                        //E:{link.endAt} {(parseInt(lk) > 0 && parseFloat(link.endAt) > 0) ? <><Button onClick={function() {fixLinks(tune,lk,'endAt','start')}}>Start</Button><Button onClick={function() {fixLinks(tune,lk,'endAt','end')}}>End</Button></>:''}
                        //L:{link.link} {(parseInt(lk) > 0 && link.link.trim().length > 0) ? <><Button onClick={function() {fixLinks(tune,lk,'link','start')}}>Start</Button><Button onClick={function() {fixLinks(tune,lk,'link','end')}}>End</Button></> : ''}
                        //<Button variant="danger" onClick={function() {removeLink(tune,lk)}}>X</Button>
                    //</> : ''}
                    
                //</div>
            //})}
            
            //</div> : ''}
           //</div>}
