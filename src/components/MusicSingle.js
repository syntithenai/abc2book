import {useState, useEffect, useRef} from 'react'
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
import abcjs from "abcjs";
//import ParserProblemsDiff from './ParserProblemsDiff'
import useAbcjsParser from '../useAbcjsParser'
import useWindowSize from '../useWindowSize'
import TitleAndLyricsEditorModal from './TitleAndLyricsEditorModal'
import MediaSeekSlider from '../components/MediaSeekSlider'
import MediaPlayerMedia from '../components/MediaPlayerMedia'
import PDFViewer from './PDFViewer'
import ImagesManagerModal from './ImagesManagerModal'
import RecordingsManagerModal from './RecordingsManagerModal'  
import RepeatsEditorModal from './RepeatsEditorModal'  
import OpenSheetMusicDisplay from './OpenSheetMusicDisplay'
import useFileManager from '../useFileManager'
import FileRenderer from './FileRenderer'
import FileControls from './FileControls'
import TuneFilePanel from './TuneFilePanel'
import useGoogleDocument from '../useGoogleDocument'
import { findTuneFileMeta } from '../tuneFiles'
import LyricsAutoscrollModal from './LyricsAutoscrollModal'
import TuneDownloadDropdown from './TuneDownloadMenu'
import { getTuneNotationFitMode, setNotationFitMode } from '../notationFitSettings'
import { NOTATION_FIT_VERTICAL } from '../gigNotationFit'
import {
  EDITOR_VIEW_MODES,
  viewModeToDisplayFlags,
  resolveDisplayFlagsForTune,
  defaultViewModeForTune,
  getAvailableDisplayFlags,
} from '../viewModeUtils'
import { resolveTuneDisplayLayout, isViewModesEmpty } from '../tuneDisplayLayout'
import { clampGigZoom, getTuneGigZoom } from '../gigDisplaySettings'
import MarkdownContent from './MarkdownContent'
import StructureChordBlock from './StructureChordBlock'
import LyricsZoomControls from './LyricsZoomControls'
import FileZoomControls, { clampFileViewZoom } from './FileZoomControls'
import TimedLyricsChordsView from './TimedLyricsChordsView'
import LyricsStructureSyncPanel from './LyricsStructureSyncPanel'
import { filterTuneVoices } from '../abcVoiceFilter'
import { getTuneVoiceKeys, getVisibleVoiceKeys } from '../abcVoiceViewSettings'
import { tuneHasExplicitChords } from '../timedLyricsChordsDisplay'
import { shouldMusicSingleMountMediaEngine, shouldMusicSingleOwnMidiEngine } from '../nowPlayingQueuePlayback'
import { recordTuneView } from '../tuneViewHistoryStore'

export default function MusicSingle(props) {
    let params = useParams();
    let navigate = useNavigate();
    const location = useLocation();
    var windowSize = useWindowSize()
    const audioPlayer = useRef(); 
    
    //var youtubeProgressInterval = useRef()
    var speakTimeout = null
    const abcjsParser = useAbcjsParser({tunebook: props.tunebook})
    //var {searchYouTube} = useYouTubeSearch()
    //console.log('single',props)
    const [showMedia, setShowMedia] = useState(false)

    useEffect(function() {
      if (params.tuneId) recordTuneView(params.tuneId)
    }, [params.tuneId])

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
    const [notationFitMode, setNotationFitModeState] = useState(function() {
      return getTuneNotationFitMode(null)
    })
    const [lyricsZoom, setLyricsZoom] = useState(1.2)
    const [fileViewZoom, setFileViewZoom] = useState(1)
    const [voiceSettingsVersion, setVoiceSettingsVersion] = useState(0)
    
    var allowedImageMimeTypes = ['text/plain','image/*','application/pdf','application/musicxml','.musicxml','.mxl'] //application/musicxml
	var fileManager = useFileManager('files',props.token ? props.token : null, props.logout, tune, allowedImageMimeTypes, true)
	var allowedAudioMimeTypes = ['audio/*']
	var recordingsManager = useFileManager('recordings',props.token ? props.token : null, props.logout, tune, allowedAudioMimeTypes)
	var driveDocs = useGoogleDocument(props.token, props.logout || function() {})
	
	//const [files, setFiles] = useState([])
	//const [recordings, setRecordings] = useState([])

	//function forceFileRefresh(t) {
		//console.log("FORCE FILE REFRESH",t)
		//fileManager.search(null,t && t.id ? t.id : null,false).then(function(res) {
			//console.log("searchres files",t,res)
			//setFiles(res)
		//})
		//recordingsManager.search(null,t && t.id ? t.id : null,false).then(function(res) {
			//console.log("searchres recs",t,res)
			//setRecordings(res)
		//})
	//}

    useEffect(function() {
		var t = props.tunes ? props.tunes[new String(params.tuneId)] : null
        //console.log('single change', params.tuneId, t, props.tunes)
        if (t) {
			//if (t && t.id && Array.isArray(t.files)) console.log('FILES',t.files)
            //t.tempo = t.tempo * (props.mediaController.playbackSpeed> 0 ? props.mediaController.playbackSpeed : 1)
            //console.log("HACK TUNE TEMPO", t.tempo)
            setTune(t)
            //forceFileRefresh(t)
        }
        
    },[params.tuneId, props.tunes, props.mediaController.playbackSpeed])
    
    //const [abc, setAbc] = useState('')
    //let tune = props.tunes ? props.tunes[new String(params.tuneId)] : null
    const [chordViewMode, setChordViewMode] = useState('transposed')
    
    //let abc = '' //props.tunebook.abcTools.settingFromTune(tune).abc
    const handlers = useSwipeable({
        delta:300,
        trackMouse: false,    
      onSwipedRight: (eventData) => {
          props.tunebook.navigateToPreviousSong(tune.id, navigate)
      },
      onSwipedLeft: (eventData) => {
          props.tunebook.navigateToNextSong(tune.id, navigate)
      }
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
        //console.log('setuptune',tune)
        if (tune) {
           setNotationFitModeState(getTuneNotationFitMode(tune))
           setLyricsZoom(getTuneGigZoom(tune))
           setFileViewZoom(1)
           if (tune.viewMode) {
               props.setViewMode(tune.viewMode)
           } else {
               const hasChordsForDefault = tuneHasExplicitChords(tune, props.tunebook, abcjsParser)
               props.setViewMode(defaultViewModeForTune(tune, props.tunebook, { hasChords: hasChordsForDefault }))
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
        setupTune()
    },[params.tuneId,props.tunes])  //, params.mediaLinkNumber, params.playState

    useEffect(function() {
        setupTune()
        //return function() {
            //props.mediaController.setTune(null)
        //}
    },[])

    useEffect(function() {
        setFileViewZoom(1)
    }, [tune && tune.activeFile])

    function getTempo() {
        // use page tempo that has been updated from tune
        var tempo = (tune && tune.tempo > 0 ? tune.tempo :  100)
        if (tempo > 400) tempo = 400
        if (tempo < 1) tempo = 1
        return tempo
    }
    
    let lastScrollTop = 0;
	const [fixedSingleMenu, setFixedSingleMenu] = useState(false)
	useEffect(() => {
		//console.log('scroll init')
		const handleScroll = (e) => {
			//console.log('scroll e')
			//console.log('scrolld e',e, e.currentTarget, e.target)
				const currentScrollTop = window.scrollY;
				if (currentScrollTop > lastScrollTop) {
				  // Scrolling down
				  //console.log('Scrolling down',window.scrollY);
				  setFixedSingleMenu(false)
				} else {
				  // Scrolling up
				  //console.log('Scrolling up',window.scrollY);
				  if (currentScrollTop > 100) {
					  setFixedSingleMenu(true)
					  //setTimeout(function() { setFixedSingleMenu(false) }, 5000)
				  } else {
					  setFixedSingleMenu(false)
				  }
				}
				
				lastScrollTop = currentScrollTop;
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
        if (Array.isArray(tune.words)) {
            tune.words.forEach(function(line) {
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
        const previewTune = filterTuneVoices(tune, getVisibleVoiceKeys(tune.id, getTuneVoiceKeys(tune)))
        var firstVoice = previewTune.voices && Object.keys(previewTune.voices).length > 0 ? Object.values(previewTune.voices)[0] : {notes:[]}
        //var parsed = props.tunebook.abcTools.parseAbcToBeats(firstVoice.notes.join("\n"))
        ////console.log('sING',parsed.chords)
        //var [a,b,chordsArray,c] = parsed
        var chordTranspose = (Number(tune.transpose) || 0) - (chordViewMode === 'capo' ? (Number(tune.capo) || 0) : 0)
        var chords = abcjsParser.renderChords(props.tunebook.abcTools.emptyABC(tune.name)  + firstVoice.notes.join("\n"), false, chordTranspose, tune.key, tune.noteLength, tune.meter)
        var chordsWithDots = abcjsParser.renderChords(props.tunebook.abcTools.emptyABC(tune.name)  + firstVoice.notes.join("\n"), false, chordTranspose, tune.key, tune.noteLength, tune.meter)
        
        //props.tunebook.abcTools.renderChords(chordsArray,false, tune.transpose)
        var uniqueChords={}
        chords.replaceAll("|",' ').split(' ').forEach(function(chord) {
            if (chord.trim().length > 0) uniqueChords[chord.trim()] = true
        })
        
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
            if (props.mediaPlaylist || props.abcPlaylist) {
                nextLinkOrTune()
            }
        }

        const practiceSessionActive = !!(props.practiceSession && props.practiceSession.sessionOpen)
        const mountMediaEngine = shouldMusicSingleMountMediaEngine({
            viewedTuneId: tune.id,
            queue: props.nowPlayingQueue,
            mediaController: props.mediaController,
            practiceSessionActive: practiceSessionActive,
            gigModeActive: false,
            pathname: location.pathname,
            tunes: props.tunes,
        })
        const ownMidiEngine = shouldMusicSingleOwnMidiEngine(tune.id, props.nowPlayingQueue)
       
                const compactToolbar = windowSize[0] <= 768
                const mediumToolbar = windowSize[0] <= 1180
                const toolbarClassName = 'music-buttons' + (fixedSingleMenu ? ' music-buttons-fixed' : '')
                const hasChords = tuneHasExplicitChords(tune, props.tunebook, abcjsParser)
                const availableFlags = getAvailableDisplayFlags(tune, props.tunebook, {
                  hasChords: hasChords,
                  hasInfo: !!(tune.backgroundInfo && String(tune.backgroundInfo).trim()),
                })
                const viewFlags = resolveDisplayFlagsForTune(
                  viewModeToDisplayFlags(props.viewMode),
                  tune,
                  props.tunebook,
                  { hasChords: hasChords }
                )
                const fileOverlayActive = !!findTuneFileMeta(tune, tune.activeFile)
                const availableForControls = fileOverlayActive
                  ? Object.assign({}, availableFlags, {
                    notation: false,
                    lyrics: false,
                    structure: false,
                    chords: false,
                  })
                  : availableFlags
                const layout = resolveTuneDisplayLayout(viewFlags)
                const notationVisible = !!viewFlags.notation && viewFlags.notation !== 'off'
                const lyricsVisible = !!viewFlags.lyrics
                const structureVisible = !!viewFlags.structure && hasChords
                const chordsAnnotate = !!viewFlags.chords
                // File overlay covers chart panels; keep them mounted (hidden) for capture/playback.
                const showNotationUi = notationVisible && !fileOverlayActive
                const showLyricsUi = lyricsVisible && !fileOverlayActive
                const showStructureUi = structureVisible && !fileOverlayActive
                const viewModesEmpty = !fileOverlayActive && isViewModesEmpty(viewFlags, availableFlags)
                const fitHeightOn = notationFitMode === NOTATION_FIT_VERTICAL
                const syncLyricsStructure = !!layout.syncLyricsStructure
                // Without notation: fit-height scales lyrics (or structure-only, or synced pair).
                const lyricsStructureFitHeight = fitHeightOn && !notationVisible && !fileOverlayActive && syncLyricsStructure
                const lyricsFitHeight = fitHeightOn && !notationVisible && !fileOverlayActive && lyricsVisible && !syncLyricsStructure
                const structureFitHeight = fitHeightOn && !notationVisible && !fileOverlayActive && structureVisible && !lyricsVisible
                const backgroundInfoText = tune && typeof tune.backgroundInfo === 'string'
                  ? tune.backgroundInfo.trim()
                  : ''
                const tuneBooks = Array.isArray(tune.books)
                  ? tune.books.map(function(item) { return String(item || '').trim() }).filter(Boolean)
                  : []
                const tuneTags = Array.isArray(tune.tags)
                  ? tune.tags.map(function(item) { return String(item || '').trim() }).filter(Boolean)
                  : []
                const visibleVoiceKeys = getVisibleVoiceKeys(tune.id, getTuneVoiceKeys(tune))
                const notationTune = filterTuneVoices(tune, visibleVoiceKeys)
                const tuneTranspose = Number(tune.transpose) || 0
                const effectiveCapo = Number(tune.capo) || 0

                const transposeCapoBlock = (
                  <div className="music-transpose-capo-block">
                    <span className="music-transpose-capo-label">Transpose</span>
                    <ButtonGroup size="sm" className="music-transpose-group">
                      <Button variant="outline-secondary" onClick={function() { changeTuneTranspose(-1) }} aria-label="Transpose down">−</Button>
                      <Button variant="outline-secondary" disabled>{tuneTranspose >= 0 ? '+' + tuneTranspose : tuneTranspose}</Button>
                      <Button variant="outline-secondary" onClick={function() { changeTuneTranspose(1) }} aria-label="Transpose up">+</Button>
                    </ButtonGroup>
                    {effectiveCapo > 0 ? (
                      <Button
                        size="sm"
                        variant={chordViewMode === 'capo' ? 'primary' : 'outline-secondary'}
                        className="music-capo-toggle-btn"
                        aria-pressed={chordViewMode === 'capo'}
                        aria-label={'Capo ' + effectiveCapo + (chordViewMode === 'capo' ? ' fingering' : ' transposed')}
                        title={chordViewMode === 'capo' ? 'Show transposed chords' : 'Show capo fingering'}
                        onClick={function() {
                          setChordViewMode(chordViewMode === 'capo' ? 'transposed' : 'capo')
                        }}
                      >
                        Capo {effectiveCapo}
                      </Button>
                    ) : null}
                  </div>
                )

                function persistTunePatch(patch) {
                  props.tunebook.saveTune(Object.assign({}, tune, patch))
                }

                function handleNotationFitModeChange(mode) {
                  const next = setNotationFitMode(mode)
                  setNotationFitModeState(next)
                  persistTunePatch({ notationFit: next, viewMode: props.viewMode })
                }

                function handleViewModeChange(val) {
                  props.setViewMode(val)
                  persistTunePatch({ viewMode: val })
                }

                function handleLyricsZoomChange(next) {
                  const clamped = clampGigZoom(next)
                  setLyricsZoom(clamped)
                  persistTunePatch({ zoom: clamped })
                }

                function handleFileViewZoomChange(next) {
                  setFileViewZoom(clampFileViewZoom(next))
                }

                function fixLinks(tune,index,field,startOrEnd) {
                        var previousKey = parseInt(index - 1)
                        var link = tune.links[index]
                        if (startOrEnd === 'start' && link[field] > 0) tune.links[previousKey].startAt = link[field]
                        if (startOrEnd === 'end' && link[field] > 0) tune.links[previousKey].endAt = link[field]
                        props.tunebook.saveTune(tune)
                }

                function removeLink(tune,index) {
                        tune.links.splice(index,1)
                        props.tunebook.saveTune(tune)
                }

                function changeTuneTranspose(delta) {
                  const next = tuneTranspose + delta
                  tune.transpose = next
                  props.tunebook.saveTune(tune)
                }

                function openPrintPdfLayout() {
                  navigate('/print', { state: { tuneIds: [tune.id] } })
                }

                function stripNotationMeta(abcText) {
                  if (!abcText) return ''
                  return abcText
                    .split('\n')
                    .filter(function(line) {
                      const trimmed = String(line || '').trim()
                      if (trimmed.startsWith('B:')) return false
                      if (/^H:/i.test(trimmed)) return false
                      if (/^W:/i.test(trimmed)) return false
                      if (trimmed.startsWith('% abcbook-tags')) return false
                      if (trimmed.startsWith('%%abcbook-tags')) return false
                      return true
                    })
                    .join('\n')
                }

                const notationVisualTranspose = chordTranspose
                const notationAbc = stripNotationMeta(props.tunebook.abcTools.json2abc(notationTune))

                var useInstrument = localStorage.getItem('bookstorage_last_chord_instrument') ? localStorage.getItem('bookstorage_last_chord_instrument') : 'guitar'
                return <div className="music-single" style={{border:'1px solid black'}} {...handlers} >
			<div className={toolbarClassName}>
			  <div className="music-buttons-inner">
			    <div className="music-buttons-col-left">
            <Dropdown as={ButtonGroup} autoClose="outside">
			        <Dropdown.Toggle variant="outline-dark" id="dropdown-basic" className="music-actions-dropdown-toggle">
			          {props.tunebook.icons.menu}
			        </Dropdown.Toggle>

			        <Dropdown.Menu className="music-actions-dropdown-menu" popperConfig={{ strategy: 'fixed' }}>
                <div className="music-actions-dropdown-cols">
                  <div className="music-actions-dropdown-actions">
                    <Dropdown.Item>
                      <ShareTunebookModal tunebook={props.tunebook} token={props.token} login={props.login} googleDocumentId={props.googleDocumentId} shareKind="tune" tuneId={tune.id} tuneName={tune.name} tunes={props.tunes} saveTune={props.tunebook.saveTune} />
                    </Dropdown.Item>
                    <Dropdown.Item>
                      <Button className="music-actions-menu-btn btn-primary" onClick={openPrintPdfLayout}>
                        {props.tunebook.icons.printer} Print
                      </Button>
                    </Dropdown.Item>
                    <Dropdown.Item as="div" className="music-actions-download-main">
                      <div className="music-actions-nested-dropdown-wrap" onClick={function(e) { e.stopPropagation() }}>
                        <TuneDownloadDropdown
                          tunebook={props.tunebook}
                          tunes={[tune]}
                          archiveBaseName={(tune.name ? tune.name.trim() : 'tune')}
                          token={props.token}
                          buttonVariant="success"
                          buttonClassName="music-actions-menu-btn"
                        />
                      </div>
                    </Dropdown.Item>
                    <Dropdown.Item>
                      <Button
                        variant="danger"
                        className="music-actions-menu-btn"
                        onClick={function() {
                          if (window.confirm('Do you really want to delete this tune ?')) {
                            props.tunebook.deleteTune(tune.id)
                          }
                          navigate('/tunes')
                        }}
                      >
                        {props.tunebook.icons.bin} Delete
                      </Button>
                    </Dropdown.Item>
                  </div>

                  <div className="music-actions-dropdown-col-meta music-actions-dropdown-col-meta-compact">
                    <ButtonGroup className="music-tune-meta-group">
                      <BoostSettingsModal tunebook={props.tunebook} value={tune.boost} onChange={function(val) {tune.boost = val; props.tunebook.saveTune(tune); props.forceRefresh()}} difficulty={tune.difficulty > 0 ? tune.difficulty : 0} onChangeDifficulty={function(val) {tune.difficulty = val; props.tunebook.saveTune(tune); props.forceRefresh()}} />
                      <BookMultiSelectorModal forceRefresh={props.forceRefresh} tunebook={props.tunebook} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} value={tune.books} onChange={function(val) { tune.books = val; props.tunebook.saveTune(tune);} } />
                      <TagsSelectorModal forceRefresh={props.forceRefresh} tunebook={props.tunebook} setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}  defaultOptions={props.tunebook.getTuneTagOptions} searchOptions={props.tunebook.getSearchTuneTagOptions} value={tune.tags} onChange={function(val) { tune.tags = val; props.tunebook.saveTune(tune);} } />
                    </ButtonGroup>
                    <ButtonGroup className="music-tune-meta-group">
                      <LinksEditorModal icon="media" mediaController={props.mediaController} forceRefresh={props.forceRefresh} tunebook={props.tunebook} tune={tune} onChange={
                        function(links) {
                          if (tune) {
                            tune.links = links
                            props.tunebook.saveTune(tune)
                          }
                        }
                      } />
                    </ButtonGroup>
                    <div className="music-actions-nested-dropdown-wrap" onClick={function(e) { e.stopPropagation() }}>
                      <TuneDownloadDropdown
                        tunebook={props.tunebook}
                        tunes={[tune]}
                        archiveBaseName={(tune.name ? tune.name.trim() : 'tune')}
                        token={props.token}
                        buttonVariant="success"
                        buttonClassName="music-actions-menu-btn"
                      />
                    </div>
                  </div>
                </div>
			        </Dropdown.Menu>
			      </Dropdown>

            <Dropdown as={ButtonGroup} className="music-actions-edit-dropdown" title="Edit tune">
              <Dropdown.Toggle variant="warning" className="music-actions-edit-btn" aria-label="Edit tune">
                {props.tunebook.icons.pencil}
              </Dropdown.Toggle>
              <Dropdown.Menu
                className="music-actions-edit-submenu-menu"
                popperConfig={{ strategy: 'fixed' }}
              >
                {EDITOR_VIEW_MODES.map(function(mode) {
                  return (
                    <Dropdown.Item key={mode.id} as={Link} to={'/editor/' + params.tuneId + '/' + mode.id}>
                      {mode.label}
                    </Dropdown.Item>
                  )
                })}
              </Dropdown.Menu>
            </Dropdown>
			    </div>

			    <div className="music-buttons-col-meta music-tune-meta-inline">
			      <ButtonGroup className="music-tune-meta-group">
			        <BoostSettingsModal tunebook={props.tunebook} value={tune.boost} onChange={function(val) {tune.boost = val; props.tunebook.saveTune(tune); props.forceRefresh()}} difficulty={tune.difficulty > 0 ? tune.difficulty : 0} onChangeDifficulty={function(val) {tune.difficulty = val; props.tunebook.saveTune(tune); props.forceRefresh()}} />
			        <BookMultiSelectorModal forceRefresh={props.forceRefresh} tunebook={props.tunebook} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} value={tune.books} onChange={function(val) { tune.books = val; props.tunebook.saveTune(tune);} } />
			        <TagsSelectorModal forceRefresh={props.forceRefresh} tunebook={props.tunebook} setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}  defaultOptions={props.tunebook.getTuneTagOptions} searchOptions={props.tunebook.getSearchTuneTagOptions} value={tune.tags} onChange={function(val) { tune.tags = val; props.tunebook.saveTune(tune);} } />
			      </ButtonGroup>
			      <ButtonGroup className="music-tune-meta-group">
			        <LinksEditorModal icon="media" mediaController={props.mediaController} forceRefresh={props.forceRefresh} tunebook={props.tunebook} tune={tune} onChange={
			          function(links) {
			            if (tune) {
			              tune.links = links
			              props.tunebook.saveTune(tune)
			            }
			          }
			        } />
			      </ButtonGroup>
			    </div>

			    <div className="music-buttons-col-right">
			      {fileOverlayActive ? (
			        <FileZoomControls
			          zoom={fileViewZoom}
			          onChange={handleFileViewZoomChange}
			          tunebook={props.tunebook}
			        />
			      ) : availableFlags.lyrics ? (
			        <LyricsZoomControls
			          zoom={lyricsZoom}
			          onChange={handleLyricsZoomChange}
			        />
			      ) : null}
			      <LyricsAutoscrollModal
			        tune={tune}
			        tunebook={props.tunebook}
			        mediaController={props.mediaController}
			        mediaLinkNumber={props.mediaController && props.mediaController.mediaLinkNumber != null ? props.mediaController.mediaLinkNumber : 0}
			        musicSingleSelector=".music-single"
			        barLayout={compactToolbar ? 'default' : 'gig-inline'}
			        buttonVariant="outline-secondary"
			        buttonSize="sm"
			      />
			      <ViewModeSelectorModal
			        className="music-view-mode-selector"
			        viewMode={props.viewMode}
			        tune={tune}
			        tunebook={props.tunebook}
              forceDropdown={mediumToolbar}
			        notationFitMode={notationFitMode}
			        onNotationFitModeChange={handleNotationFitModeChange}
              hideInlineVoiceControls={fileOverlayActive}
              fileOverlayActive={fileOverlayActive}
              availableOverride={availableForControls}
              onVoiceSettingsChange={function() {
                  setVoiceSettingsVersion(function(v) { return v + 1 })
              }}
              fileControls={(
                <FileControls
                  tune={tune}
                  tunebook={props.tunebook}
                  token={props.token}
                  driveApi={driveDocs}
                  requestGoogleScopes={props.requestGoogleScopes}
                  login={props.login}
                  variant={mediumToolbar ? 'menu' : 'toolbar'}
                  stopMenuClose={!!mediumToolbar}
                  onTuneChange={function(next) {
                    setTune(next)
                    props.tunebook.saveTune(next)
                    if (props.forceRefresh) props.forceRefresh()
                  }}
                />
              )}
              extraMenuContent={fileOverlayActive ? null : transposeCapoBlock}
			        onChange={handleViewModeChange}
			      />
            {!mediumToolbar && !fileOverlayActive ? transposeCapoBlock : null}
			    </div>
			  </div>
			</div>
            {(fileManager && Array.isArray(fileManager.filtered) && fileManager.filtered.length > 0 ) && <div style={{textAlign:'center'}} >
				<b style={{fontSize:'2em'}}>{tune.name}</b>
				{tune.composer && <span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; by <span>{tune.composer}</span></span>} 
			</div>}
			
             {(props.mediaController.mediaLinkNumber != null) && <MediaSeekSlider  mediaController={props.mediaController} />}
             {(fileManager && Array.isArray(fileManager.filtered))  && fileManager.filtered.map(function(file, fk) {
				return <FileRenderer key={fk} tunebook={props.tunebook} file={file} /> 
			 })}

             {fileOverlayActive ? (
               <TuneFilePanel
                 tune={tune}
                 token={props.token}
                 driveApi={driveDocs}
                 fitMode={notationFitMode}
                 zoom={fileViewZoom}
                 onTuneChange={function(next) {
                   setTune(next)
                   props.tunebook.saveTune(next)
                 }}
               />
             ) : null}


              
             <div className={`music-single-panels tune-display-panels ${layout.layoutClass}${!fileOverlayActive && notationFitMode === NOTATION_FIT_VERTICAL ? ' music-panels-fit-height' : ''}${fileOverlayActive ? ' music-single-panels--file-overlay' : ''}`}>
               {viewModesEmpty ? (
                 <div className="tune-view-modes-empty" role="status">
                   No view modes enabled
                 </div>
               ) : null}
               {/* Notation panel — always in DOM for audio continuity, visually hidden when off or file overlay */}
               <div className={`music-body-notation tune-panel-notation${!chordsAnnotate ? ' no-inline-chords' : ''}${layout.main === 'notation' ? ' tune-slot-main' : ''}${layout.side === 'notation' ? ' tune-slot-side' : ''}`} style={showNotationUi ? {} : {display:'none'}}>
                 <div style={{paddingLeft:'0.7em', paddingRight:'0.7em'}}>
                   {(showMedia && Array.isArray(tune.links) && tune.links.length > 0) && <div style={{clear:'both', width:'100%', height:'3em'}} />}
                   <div id={"abccontainer-"+(autoStart ? "Y":"N")+"-"+(localStorage.getItem('bookstorage_autoprime') === "true"?"Y":"N")}>
                     {autoStart && <Abc  showRepeats={true} warp={props.mediaController.playbackSpeed} onStarted={function() {props.mediaController.play()}} onStopped={function() {props.mediaController.pause()}}  mediaController={props.mediaController} speakTitle={localStorage.getItem('bookstorage_announcesong')} autoStart={true} autoPrime={true} autoScroll={showNotationUi} setMidiData={setMidiData} forceRefresh={props.forceRefresh} metronomeCountIn={true}  tunes={props.tunes} editableTempo={true} repeat={notationTune.repeats > 0 ? notationTune.repeats : 1 } tunebook={props.tunebook}  abc={notationAbc}  meter={notationTune.meter} fitMode={notationFitMode} onEnded={onEnded} hideSvg={false} hidePlayer={true} visualTranspose={notationVisualTranspose} playbackEngine={ownMidiEngine} />}
                     {!autoStart && <Abc  showRepeats={true} warp={props.mediaController.playbackSpeed} onStarted={function() {props.mediaController.play()}} onStopped={function() {props.mediaController.pause()}}  mediaController={props.mediaController}  speakTitle={localStorage.getItem('bookstorage_announcesong')}  autoStart={false} autoPrime={true} autoScroll={showNotationUi} setMidiData={setMidiData} forceRefresh={props.forceRefresh} metronomeCountIn={true}  tunes={props.tunes} editableTempo={true} repeat={notationTune.repeats > 0 ? notationTune.repeats : 1 } tunebook={props.tunebook}  abc={notationAbc}  meter={notationTune.meter} fitMode={notationFitMode} onEnded={onEnded} hideSvg={false} hidePlayer={true} visualTranspose={notationVisualTranspose} playbackEngine={ownMidiEngine} />}
                   </div>
                 </div>
               </div>

               {/* Lyrics panel — keep mounted when enabled so Capture screenshot can reveal it under overlay */}
               {lyricsVisible && (
                 <div className={`music-body-lyrics tune-panel-lyrics${syncLyricsStructure ? ' tune-panel-lyrics-structure-sync' : ''}${layout.main === 'lyrics' ? ' tune-slot-main' : ''}${layout.side === 'lyrics' ? ' tune-slot-side' : ''}${layout.below === 'lyrics' ? ' tune-slot-below' : ''}${layout.wrapLyricsAroundStructure ? ' tune-lyrics-wrap' : ''}`} style={showLyricsUi ? undefined : {display:'none'}}>
                   <div className="lyrics-panel-inner">
                     <div className="lyrics-panel-header">
                       {Object.keys(words).length > 0 && <Button style={{marginRight:'1em'}} onClick={function() {setSquashLyrics(!squashLyrics)}}>{props.tunebook.icons.map2}</Button>}
                       <TitleAndLyricsEditorModal tunebook={props.tunebook} tune={tune} tunes={props.tunes} />
                       {tune.composer && <span> - {tune.composer}</span>}
                     </div>
                     {!squashLyrics ? (
                       syncLyricsStructure ? (
                         <LyricsStructureSyncPanel
                           tune={tune}
                           tunebook={props.tunebook}
                           chordTranspose={chordTranspose}
                           hideChords={!chordsAnnotate}
                           zoom={lyricsZoom > 0 ? lyricsZoom : 1}
                           fitHeight={lyricsStructureFitHeight}
                           chords={chords}
                           uniqueChords={uniqueChords}
                           useInstrument={useInstrument}
                         />
                       ) : (
                         <TimedLyricsChordsView
                           tune={tune}
                           tunebook={props.tunebook}
                           chordTranspose={chordTranspose}
                           hideChords={!chordsAnnotate}
                           suppressLeadingTitle={true}
                           zoom={lyricsZoom > 0 ? lyricsZoom : 1}
                           fitHeight={lyricsFitHeight}
                         />
                       )
                     ) : (
                       <div className="lyrics" style={{fontSize:(lyricsZoom > 0 ? lyricsZoom : 1) * 100+'%', paddingLeft:'0.3em', marginTop:'2.5em'}}>
                         {Object.keys(words).map(function(key) {
                           return <div key={key} className="lyrics-block" style={{paddingTop:'1em', paddingBottom:'1em', pageBreakInside:'avoid'}}>
                             <div className="lyrics-line">{words[key][0]}</div>
                             {words[key].length > 1 && (
                               <div className="lyrics-line-first words">
                                 {words[key].slice(1).map(function(line, lk) {
                                   var parts = line.trim().split(' ')
                                   return <span key={lk}>{parts[0]} {parts[1]}...</span>
                                 })}
                               </div>
                             )}
                           </div>
                         })}
                       </div>
                     )}
                   </div>
                 </div>
               )}

               {/* Structure (chord block) panel */}
               {structureVisible && !syncLyricsStructure && (
                 <div className={`music-body-chords tune-panel-structure${layout.main === 'structure' ? ' tune-slot-main' : ''}${layout.side === 'structure' ? ' tune-slot-side' : ''}`} style={showStructureUi ? undefined : {display:'none'}}>
                   <StructureChordBlock
                     chords={chords}
                     uniqueChords={uniqueChords}
                     useInstrument={useInstrument}
                     tune={tune}
                     fitHeight={structureFitHeight}
                   />
                 </div>
               )}
             </div>
             
             
             
             {mountMediaEngine && (
               <MediaPlayerMedia mediaController={props.mediaController} tunebook={props.tunebook} tune={tune} onEnded={onEnded} />
             )}

             {(viewFlags.info && backgroundInfoText) || tuneBooks.length > 0 || tuneTags.length > 0 ? (
              <div className="music-single-footer-meta">
                {viewFlags.info && backgroundInfoText ? (
                  <div className="music-tune-info-section">
                    <div className="tune-background-info-view">
                      <MarkdownContent text={backgroundInfoText} />
                    </div>
                  </div>
                ) : null}
                {tuneBooks.length > 0 || tuneTags.length > 0 ? (
                  <div className="music-single-books-tags" aria-label="Books and tags">
                    {tuneBooks.length > 0 ? (
                      <div className="music-single-books-tags-row">
                        <span className="music-single-books-tags-label">Books</span>
                        <div className="music-single-books-tags-buttons">
                          {tuneBooks.map(function(book, idx) {
                            return <Button key={'book-' + idx} variant="outline-secondary" size="sm" disabled tabIndex={-1}>{book}</Button>
                          })}
                        </div>
                      </div>
                    ) : null}
                    {tuneTags.length > 0 ? (
                      <div className="music-single-books-tags-row">
                        <span className="music-single-books-tags-label">Tags</span>
                        <div className="music-single-books-tags-buttons">
                          {tuneTags.map(function(tag, idx) {
                            return <Button key={'tag-' + idx} variant="outline-secondary" size="sm" disabled tabIndex={-1}>{tag}</Button>
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
             ) : null}
             
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
