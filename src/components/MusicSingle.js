import {useState, useEffect, useRef} from 'react'
import {Link , useParams , useNavigate, useLocation, useSearchParams} from 'react-router-dom'
import {Alert, Button, Dropdown} from 'react-bootstrap'
import Abc from './Abc'
import BoostSettingsModal from './BoostSettingsModal'
import StarToggleButton from './StarToggleButton'
//import ReactTags from 'react-tag-autocomplete'
import BookMultiSelectorModal from  './BookMultiSelectorModal'
import TagsSelectorModal from './TagsSelectorModal'
import ShareTunebookModal from './ShareTunebookModal'
import {useSwipeable} from 'react-swipeable'
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import YouTube from 'react-youtube';  
import LinksEditorModal from './LinksEditorModal'
import ViewModeSelectorModal from './ViewModeSelectorModal'
import TablatureSelector from './TablatureSelector'
import abcjs from "abcjs";
//import ParserProblemsDiff from './ParserProblemsDiff'
import useAbcjsParser from '../useAbcjsParser'
import useWindowSize from '../useWindowSize'
import TitleAndLyricsEditorModal from './TitleAndLyricsEditorModal'
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
import { findTuneFileMeta, isPdfTuneFileType } from '../tuneFiles'
import LyricsAutoscrollModal from './LyricsAutoscrollModal'
import TuneDownloadDropdown from './TuneDownloadMenu'
import { getTuneNotationFitMode, setNotationFitMode } from '../notationFitSettings'
import { NOTATION_FIT_VERTICAL, NOTATION_FIT_HORIZONTAL } from '../gigNotationFit'
import { prepareTuneViewNotationAbc } from '../notation/notationDisplayAbc'
import { buildUniqueChordsMap, isSectionMarkerChordName } from '../chordSheetUtils'
import { resolveTunesListPath } from '../searchFilterParams'
import { SINGLE_VIEW_EDIT_MODES,
  viewModeToDisplayFlags,
  resolveDisplayFlagsForTune,
  defaultViewModeForTune,
  getAvailableDisplayFlags,
  showsMusicNotation,
} from '../viewModeUtils'
import { resolveTuneDisplayLayout, isViewModesEmpty, isStructureOnlyLayout } from '../tuneDisplayLayout'
import { clampGigZoom, getTuneGigZoom } from '../gigDisplaySettings'
import MarkdownContent from './MarkdownContent'
import StructureChordBlock from './StructureChordBlock'
import LyricsZoomControls from './LyricsZoomControls'
import FileZoomControls, { clampFileViewZoom } from './FileZoomControls'
import ChordPitchButton from './ChordPitchButton'
import TimedLyricsChordsView from './TimedLyricsChordsView'
import LyricsStructureSyncPanel from './LyricsStructureSyncPanel'
import { filterTuneVoices } from '../abcVoiceFilter'
import { getTuneVoiceKeys, getVisibleVoiceKeys } from '../abcVoiceViewSettings'
import { tuneHasExplicitChords } from '../timedLyricsChordsDisplay'
import { shouldMusicSingleMountMediaEngine, shouldMusicSingleOwnMidiEngine } from '../nowPlayingQueuePlayback'
import { isQueueActive, getCurrentTuneId } from '../nowPlayingQueue'
import { shouldSyncViewedTuneToMediaController } from '../playbackNavigationUtils'
import { useCapoViewState } from '../useCapoViewState'
import { chordTransposeWithCapo } from '../capoViewUtils'
import { recordTuneView } from '../tuneViewHistoryStore'
import {buildSingleTuneTitle, DEFAULT_APP_TITLE, setDocumentTitle} from '../pageTitle'
import { isAddTuneAutoEnrichPending, subscribeAddTuneAutoEnrich, getAddTuneAutoEnrichState, dismissAddTuneAutoEnrichFailure, dismissAddTuneAutoEnrichChordPaste, dismissAddTuneAutoEnrichNotationPaste, dismissAddTuneAutoEnrichSummary, shouldSkipAbcMergeForChordPaste, abandonAutoEnrichNotationPaste, cancelAddTuneAutoEnrich } from '../addTuneAutoEnrich'
import { toast } from 'react-toastify'
import SearchProgressBar from './SearchProgressBar'
import PasteChordSheetModal from './PasteChordSheetModal'
import LockedSourcePasteModal from './LockedSourcePasteModal'
import { commitPasteChordSheetToTune } from '../commitPasteChordSheetToTune'
import useMediaResolverHealth from '../useMediaResolverHealth'
import useTuneSnapshotRouteSync, { applyTuneSnapshotFromSearchParams } from '../useTuneSnapshotRouteSync'
import { ensurePlainWordsFromNoteAlignedLyrics } from '../wLinesUtils'
import { isMobilePlatform } from '../platformUtils'
import useMusicToolbarWidth from '../useMusicToolbarWidth'
import { isMusicToolbarCompact, isMusicToolbarFolded } from '../musicToolbarLayout'
import { getTune as getTuneFromRepository } from '../tuneRepository'
import ScratchpadWorkspacePickerModal from './scratchpad/ScratchpadWorkspacePickerModal'
import { exportTuneToScratchpadComposition } from '../exportTuneToScratchpadComposition'
import { scratchpadItemPath } from '../scratchpadExportToast'
import {
  buildMuseScoreSearchUrl,
  filterActionableNotationManualCandidates,
  isMuseScoreUrl,
} from '../chordSearchSites'
import { melodyHasMidBlockDoubleBarlines } from '../melodyBarlineNormalize'

function museScoreManualCandidates(manualCandidates) {
  return filterActionableNotationManualCandidates(manualCandidates).filter(function(item) {
    return isMuseScoreUrl(item.url)
  })
}

function truncateEnrichLabel(text, maxLen) {
  const value = String(text || '').trim()
  if (!value) return ''
  const limit = maxLen || 72
  if (value.length <= limit) return value
  return value.slice(0, limit - 1) + '…'
}

export default function MusicSingle(props) {
    let params = useParams();
    let navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    var windowSize = useWindowSize()
    const toolbarRef = useRef(null)
    const lastNotationChordRef = useRef('')
    const toolbarContainerWidth = useMusicToolbarWidth(toolbarRef)
    const audioPlayer = useRef(); 
    const { available: resolverAvailable } = useMediaResolverHealth()
    
    //var youtubeProgressInterval = useRef()
    var speakTimeout = null
    const abcjsParser = useAbcjsParser({tunebook: props.tunebook})
    //var {searchYouTube} = useYouTubeSearch()
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
    const [tune, setTune] = useState(null)
    const [tuneLoadState, setTuneLoadState] = useState('idle')
    const [notationFitMode, setNotationFitModeState] = useState(function() {
      return getTuneNotationFitMode(null)
    })
    const [lyricsZoom, setLyricsZoom] = useState(1.2)
    const [fileViewZoom, setFileViewZoom] = useState(1)
    const [voiceSettingsVersion, setVoiceSettingsVersion] = useState(0)
    const [autoEnrichPending, setAutoEnrichPending] = useState(function() {
      return isAddTuneAutoEnrichPending(params.tuneId)
    })
    const [autoEnrichState, setAutoEnrichState] = useState(function() {
      return getAddTuneAutoEnrichState(params.tuneId)
    })
    const [showAutoEnrichChordPaste, setShowAutoEnrichChordPaste] = useState(false)
    const [showAutoEnrichNotationPaste, setShowAutoEnrichNotationPaste] = useState(false)
    const autoEnrichSummaryShownRef = useRef('')
    const mediaControllerRef = useRef(props.mediaController)
    mediaControllerRef.current = props.mediaController
    const nowPlayingQueueRef = useRef(props.nowPlayingQueue)
    nowPlayingQueueRef.current = props.nowPlayingQueue
    const [pdfToolbarHost, setPdfToolbarHost] = useState(null)
    const [showScratchpadCopyPicker, setShowScratchpadCopyPicker] = useState(false)
    const [copyToScratchpadBusy, setCopyToScratchpadBusy] = useState(false)
    const [dismissMidBlockDoubleBarWarning, setDismissMidBlockDoubleBarWarning] = useState(false)

    useEffect(function() {
      setDismissMidBlockDoubleBarWarning(false)
    }, [params.tuneId])

    useTuneSnapshotRouteSync(tune, function(next) {
      setTune(next)
      props.tunebook.saveTune(next)
      if (props.forceRefresh) props.forceRefresh()
    })

    useEffect(function() {
        setDocumentTitle(buildSingleTuneTitle(tune && tune.name))
        return function() {
            setDocumentTitle(DEFAULT_APP_TITLE)
        }
    }, [tune])

    useEffect(function() {
      function syncPending() {
        setAutoEnrichPending(isAddTuneAutoEnrichPending(params.tuneId))
        setAutoEnrichState(getAddTuneAutoEnrichState(params.tuneId))
      }
      syncPending()
      return subscribeAddTuneAutoEnrich(syncPending)
    }, [params.tuneId])

    useEffect(function() {
      setShowAutoEnrichChordPaste(false)
      setShowAutoEnrichNotationPaste(false)
    }, [params.tuneId])

    useEffect(function() {
      const summary = String(autoEnrichState.summary || '').trim()
      if (!summary || autoEnrichPending) return
      if (autoEnrichSummaryShownRef.current === summary) return
      autoEnrichSummaryShownRef.current = summary
      toast.info(summary, { autoClose: 12000 })
      dismissAddTuneAutoEnrichSummary(params.tuneId)
    }, [autoEnrichPending, autoEnrichState.summary, params.tuneId])

    async function runCopyToScratchpad(workspaceId) {
        if (!tune || !workspaceId) return
        setCopyToScratchpadBusy(true)
        try {
            await exportTuneToScratchpadComposition({
                tune: tune,
                workspaceId: workspaceId,
                tunebook: props.tunebook,
                abcjsParser: abcjsParser,
                onOpenItem: function(itemId) {
                    navigate(scratchpadItemPath(itemId))
                },
            })
        } catch (e) {
            // export helper shows toast for errors
        } finally {
            setCopyToScratchpadBusy(false)
        }
    }

    function handleAutoEnrichNotationAbandoned() {
      if (!tune || !props.tunebook) {
        dismissAddTuneAutoEnrichNotationPaste(params.tuneId)
        return
      }
      void abandonAutoEnrichNotationPaste({
        tuneId: params.tuneId,
        tune: tune,
        tunebook: props.tunebook,
        accessToken: props.token || '',
        resolverAvailable: resolverAvailable,
        forceRefresh: props.forceRefresh,
      }).then(function(result) {
        setShowAutoEnrichNotationPaste(false)
        if (result && result.applied) {
          setTune(Object.assign({}, tune))
          if (typeof props.forceRefresh === 'function') props.forceRefresh()
          const label = result.source ? ('Notation from ' + result.source) : 'Notation applied'
          toast.info(label, { autoClose: 8000 })
        } else {
          dismissAddTuneAutoEnrichFailure(params.tuneId)
        }
      })
    }
    
    var allowedImageMimeTypes = ['text/plain','image/*','application/pdf','application/musicxml','.musicxml','.mxl'] //application/musicxml
	var fileManager = useFileManager('files',props.token ? props.token : null, props.logout, tune, allowedImageMimeTypes, true)
	var allowedAudioMimeTypes = ['audio/*']
	var recordingsManager = useFileManager('recordings',props.token ? props.token : null, props.logout, tune, allowedAudioMimeTypes)
	var driveDocs = useGoogleDocument(props.token, props.logout || function() {})
	
	//const [files, setFiles] = useState([])
	//const [recordings, setRecordings] = useState([])

	//function forceFileRefresh(t) {
		//fileManager.search(null,t && t.id ? t.id : null,false).then(function(res) {
			//setFiles(res)
		//})
		//recordingsManager.search(null,t && t.id ? t.id : null,false).then(function(res) {
			//setRecordings(res)
		//})
	//}

    useEffect(function() {
        let cancelled = false
        const tuneId = params.tuneId
        if (!tuneId) {
            setTune(null)
            setTuneLoadState('missing')
            return undefined
        }

        const fromProps = props.tunes ? props.tunes[new String(tuneId)] : null
        if (fromProps) {
            setTune(applyTuneSnapshotFromSearchParams(fromProps, searchParams))
            setTuneLoadState('ready')
            const mc = mediaControllerRef.current
            if (mc && mc.setTune
              && shouldSyncViewedTuneToMediaController(
                mc,
                nowPlayingQueueRef.current,
                fromProps.id
              )) {
              mc.setTune(fromProps)
            }
            return undefined
        }

        setTune(null)
        setTuneLoadState('loading')
        getTuneFromRepository(tuneId).then(function(loaded) {
            if (cancelled) return
            if (loaded) {
                setTune(applyTuneSnapshotFromSearchParams(loaded, searchParams))
                setTuneLoadState('ready')
                const mc = mediaControllerRef.current
                if (mc && mc.setTune
                  && shouldSyncViewedTuneToMediaController(
                    mc,
                    nowPlayingQueueRef.current,
                    loaded.id
                  )) {
                  mc.setTune(loaded)
                }
                return
            }
            setTune(null)
            setTuneLoadState('missing')
        }).catch(function() {
            if (cancelled) return
            setTune(null)
            setTuneLoadState('missing')
        })

        return function() {
            cancelled = true
        }
    },[params.tuneId, props.tunes, props.mediaController && props.mediaController.playbackSpeed, searchParams])

    useEffect(function() {
        if (tuneLoadState !== 'missing') return undefined
        const mc = mediaControllerRef.current
        const queue = nowPlayingQueueRef.current
        if (!mc || !isQueueActive(queue) || queue.autoAdvance === false) return undefined
        const currentId = getCurrentTuneId(queue)
        if (!currentId || String(currentId) !== String(params.tuneId)) return undefined
        if (typeof mc.reportPlaybackFailure === 'function') {
            mc.reportPlaybackFailure()
        }
    }, [tuneLoadState, params.tuneId])
    
    //const [abc, setAbc] = useState('')
    //let tune = props.tunes ? props.tunes[new String(params.tuneId)] : null
    const capoState = useCapoViewState(tune && tune.id, tune && tune.capo)
    
    //let abc = '' //props.tunebook.abcTools.settingFromTune(tune).abc
    const handlers = useSwipeable({
        delta:300,
        trackMouse: false,    
      onSwipedRight: (eventData) => {
          props.tunebook.navigateToPreviousSong(tune.id, navigate, location.pathname, {
            forceSearchList: true,
          })
      },
      onSwipedLeft: (eventData) => {
          props.tunebook.navigateToNextSong(tune.id, null, navigate, location.pathname, {
            forceSearchList: true,
          })
      }
    });  
    
    
    
    //useEffect(function() {
        //if (!showMedia) {
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
        if (tune) {
           setFileViewZoom(1)
           if (tune.viewMode) {
               setNotationFitModeState(getTuneNotationFitMode(tune))
               props.setViewMode(tune.viewMode)
           } else {
               const hasChordsForDefault = tuneHasExplicitChords(tune, props.tunebook, abcjsParser)
               const defaultMode = defaultViewModeForTune(tune, props.tunebook, { hasChords: hasChordsForDefault })
               // Defaulted-to-notation tunes should also default to fit-height.
               if (tune.notationFit !== NOTATION_FIT_VERTICAL && tune.notationFit !== NOTATION_FIT_HORIZONTAL && showsMusicNotation(defaultMode)) {
                   setNotationFitModeState(NOTATION_FIT_VERTICAL)
               } else {
                   setNotationFitModeState(getTuneNotationFitMode(tune))
               }
               props.setViewMode(defaultMode)
           }
           //props.tunebook.utils.scrollTo('topofpage')
           //setMediaLinkNumber(params.mediaLinkNumber)
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
            
        } else {
            //props.mediaController.setTune(null)
        }
    }

    useEffect(function() {
        setupTune()
    },[params.tuneId,props.tunes])  //, params.mediaLinkNumber, params.playState

    useEffect(function() {
        const saved = props.tunes && props.tunes[params.tuneId]
        if (saved) setLyricsZoom(getTuneGigZoom(saved))
    }, [params.tuneId])

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
    
    
       //<Button style={{float:'right'}} variant="danger" ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="none" d="M0 0h24v24H0z"/><path d="M12 3a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zm0-2a5 5 0 0 1 5 5v4a5 5 0 0 1-10 0V6a5 5 0 0 1 5-5zM3.055 11H5.07a7.002 7.002 0 0 0 13.858 0h2.016A9.004 9.004 0 0 1 13 18.945V23h-2v-4.055A9.004 9.004 0 0 1 3.055 11z"/></svg></Button>
    if (tuneLoadState === 'loading') {
        return (
          <div className="music-single music-single--loading p-3" role="status">
            Loading tune…
          </div>
        )
    }

    if (!tune) {
        return (
          <Alert variant="warning" className="m-2" role="status">
            <div>This tune could not be found. It may have been deleted or is not loaded yet.</div>
            <div className="mt-2">
              <Button as={Link} to={resolveTunesListPath({
                currentTuneBook: props.currentTuneBook,
                filter: props.filter,
                tagFilter: props.tagFilter,
                genreFilter: props.genreFilter,
                artistFilter: props.artistFilter,
                albumFilter: props.albumFilter,
                groupBy: props.groupBy,
              })} variant="primary" size="sm">Back to tune list</Button>
            </div>
          </Alert>
        )
    }

    if (tune) {
        //<iframe src={link} ></iframe>
        const previewTune = filterTuneVoices(tune, getVisibleVoiceKeys(tune.id, getTuneVoiceKeys(tune)))
        var firstVoice = previewTune.voices && Object.keys(previewTune.voices).length > 0 ? Object.values(previewTune.voices)[0] : {notes:[]}
        const hasAbcChords = props.tunebook.abcTools.hasChords(firstVoice.notes.join('\n'))
        const hasMidBlockDoubleBarlines = melodyHasMidBlockDoubleBarlines(firstVoice.notes)
        function handleNotationChordClick(abcelem) {
          if (abcelem && Array.isArray(abcelem.chord) && abcelem.chord.length > 0) {
            const name = String(abcelem.chord[0].name || '')
              .replace(/♭/g, 'b')
              .replace(/♯/g, '#')
            if (name && !isSectionMarkerChordName(name)) {
              lastNotationChordRef.current = name
            }
          }
        }
        //var parsed = props.tunebook.abcTools.parseAbcToBeats(firstVoice.notes.join("\n"))
        //var [a,b,chordsArray,c] = parsed
        var chordTranspose = chordTransposeWithCapo(tune.transpose, capoState.capoOffset, capoState.capoEnabled)
        var chords = abcjsParser.renderChords(props.tunebook.abcTools.emptyABC(tune.name)  + firstVoice.notes.join("\n"), false, chordTranspose, tune.key, tune.noteLength, tune.meter)
        var chordsWithDots = abcjsParser.renderChords(props.tunebook.abcTools.emptyABC(tune.name)  + firstVoice.notes.join("\n"), false, chordTranspose, tune.key, tune.noteLength, tune.meter)
        
        //props.tunebook.abcTools.renderChords(chordsArray,false, tune.transpose)
        var uniqueChords = buildUniqueChordsMap(chords)
        
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
                const foldControlsIntoMenu = isMusicToolbarFolded(windowSize[0], compactToolbar)
                const mediumToolbar = foldControlsIntoMenu
                const compactNotationControls = isMusicToolbarCompact(
                  toolbarContainerWidth,
                  windowSize[0],
                  foldControlsIntoMenu
                )
                const showInlineTuneMeta = !foldControlsIntoMenu
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
                const activeFileMeta = fileOverlayActive
                  ? findTuneFileMeta(tune, tune.activeFile)
                  : null
                const pdfSnapshotActive = !!(activeFileMeta && isPdfTuneFileType(activeFileMeta.type))
                const toolbarClassName = 'music-buttons'
                  + (foldControlsIntoMenu ? ' music-buttons--folded-menu' : '')
                  + (compactNotationControls ? ' music-buttons--compact-controls' : '')
                  + (compactToolbar ? ' music-buttons--mobile-collapsed' : '')
                  + (mediumToolbar && !compactToolbar ? ' music-buttons--meta-collapsed' : '')
                  + (pdfSnapshotActive ? ' music-buttons--pdf-snapshot' : '')
                const embedPdfToolbarInMainBar = pdfSnapshotActive
                const pdfToolbarBesideMenu = pdfSnapshotActive && foldControlsIntoMenu
                const pdfToolbarInMainRow = pdfSnapshotActive && !foldControlsIntoMenu
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
                // Without notation: fit-height scales lyrics (synced pair or lyrics-only).
                // Structure always height-fits the viewport (see StructureChordBlock).
                const lyricsStructureFitHeight = fitHeightOn && !notationVisible && !fileOverlayActive && syncLyricsStructure
                const lyricsFitHeight = fitHeightOn && !notationVisible && !fileOverlayActive && lyricsVisible && !syncLyricsStructure
                const structureOnlyView = !fileOverlayActive
                  && structureVisible
                  && !syncLyricsStructure
                  && isStructureOnlyLayout(viewFlags)
                const structureFitHeight = !fileOverlayActive && structureVisible && !syncLyricsStructure
                const structureFitHeightGrow = structureOnlyView
                const backgroundInfoText = tune && typeof tune.backgroundInfo === 'string'
                  ? tune.backgroundInfo.trim()
                  : ''
                const tuneBooks = Array.isArray(tune.books)
                  ? tune.books.map(function(item) { return String(item || '').trim() }).filter(Boolean)
                  : []
                const tuneTags = Array.isArray(tune.tags)
                  ? tune.tags.map(function(item) { return String(item || '').trim() }).filter(Boolean)
                  : []
                const tuneAlbums = Array.isArray(tune.albums)
                  ? tune.albums.map(function(item) { return String(item || '').trim() }).filter(Boolean)
                  : []
                const visibleVoiceKeys = getVisibleVoiceKeys(tune.id, getTuneVoiceKeys(tune))
                const notationTune = filterTuneVoices(tune, visibleVoiceKeys)
                const tuneTranspose = Number(tune.transpose) || 0

                function handleCapoOffsetChange(offset) {
                  capoState.applyCapoOffset(offset)
                  persistTunePatch({ capo: offset })
                }

                const tablatureInViewMode = foldControlsIntoMenu || compactNotationControls
                const tablatureSelector = availableFlags.notation && !fileOverlayActive ? (
                  <TablatureSelector
                    tune={tune}
                    tunebook={props.tunebook}
                    variant={tablatureInViewMode ? 'menu' : 'toolbar'}
                    stopMenuClose={!!tablatureInViewMode}
                    onChange={function() {
                      setTune(Object.assign({}, tune))
                      if (props.forceRefresh) props.forceRefresh()
                    }}
                  />
                ) : null

                const transposeCapoBlock = (
                  <div className="music-transpose-capo-block">
                    <span className="music-transpose-capo-label">Transpose</span>
                    <ButtonGroup size="sm" className="music-transpose-group">
                      <Button variant="outline-secondary" onClick={function() { changeTuneTranspose(-1) }} aria-label="Transpose down">−</Button>
                      <Button variant="outline-secondary" disabled>{tuneTranspose >= 0 ? '+' + tuneTranspose : tuneTranspose}</Button>
                      <Button variant="outline-secondary" onClick={function() { changeTuneTranspose(1) }} aria-label="Transpose up">+</Button>
                    </ButtonGroup>
                  </div>
                )

                const notationControlsBlock = fileOverlayActive ? null : (
                  <div className="music-notation-controls-block">
                    {tablatureSelector}
                    {transposeCapoBlock}
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

                const notationVisualTranspose = chordTranspose
                const notationAbc = prepareTuneViewNotationAbc(
                  props.tunebook.abcTools.json2abc(notationTune),
                  chordsAnnotate
                )

                const menuControlsVariant = foldControlsIntoMenu ? 'menu' : 'toolbar'
                const menuControlsStopClose = foldControlsIntoMenu
                const fileControlsElement = (
                  <FileControls
                    tune={tune}
                    tunebook={props.tunebook}
                    token={props.token}
                    driveApi={driveDocs}
                    googleDocumentId={props.googleDocumentId}
                    requestGoogleScopes={props.requestGoogleScopes}
                    login={props.login}
                    variant={menuControlsVariant}
                    stopMenuClose={menuControlsStopClose}
                    onTuneChange={function(next) {
                      setTune(next)
                      props.tunebook.saveTune(next)
                      if (props.forceRefresh) props.forceRefresh()
                    }}
                  />
                )
                const zoomControlsElement = fileOverlayActive && !pdfSnapshotActive ? (
                  <FileZoomControls
                    zoom={fileViewZoom}
                    onChange={handleFileViewZoomChange}
                    tunebook={props.tunebook}
                  />
                ) : showLyricsUi && availableFlags.lyrics && !fitHeightOn ? (
                  <LyricsZoomControls
                    zoom={lyricsZoom}
                    onChange={handleLyricsZoomChange}
                  />
                ) : null
                const chordPitchButtonElement = hasAbcChords && !fileOverlayActive ? (
                  <ChordPitchButton
                    chordChart={chords}
                    structureSelector=".structure-chord-block"
                    lastNotationChordRef={lastNotationChordRef}
                    icon={props.tunebook.icons.blockchord}
                  />
                ) : null
                const tuneMetaButtons = (
                  <ButtonGroup className="music-tune-meta-group">
                    <StarToggleButton className="tune-meta-modal-btn" tunebook={props.tunebook} tune={tune} forceRefresh={props.forceRefresh} />
                    <BoostSettingsModal tunebook={props.tunebook} value={tune.boost} onChange={function(val) {tune.boost = val; props.tunebook.saveTune(tune); props.forceRefresh()}} difficulty={tune.difficulty > 0 ? tune.difficulty : 0} onChangeDifficulty={function(val) {tune.difficulty = val; props.tunebook.saveTune(tune); props.forceRefresh()}} />
                    <BookMultiSelectorModal forceRefresh={props.forceRefresh} tunebook={props.tunebook} setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts} token={props.token} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} value={tune.books} onChange={function(val) { tune.books = val; props.tunebook.saveTune(tune);} } />
                    <TagsSelectorModal forceRefresh={props.forceRefresh} tunebook={props.tunebook} setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}  defaultOptions={props.tunebook.getTuneTagOptions} searchOptions={props.tunebook.getSearchTuneTagOptions} value={tune.tags} onChange={function(val) { tune.tags = val; props.tunebook.saveTune(tune);} } />
                    <LinksEditorModal icon="media" mediaController={props.mediaController} forceRefresh={props.forceRefresh} tunebook={props.tunebook} tune={tune} token={props.token} user={props.user} googleDocumentId={props.googleDocumentId} login={props.login} onTuneChange={function(updated) {
                      if (!updated || !updated.id) return
                      props.tunebook.saveTune(updated)
                      if (props.forceRefresh) props.forceRefresh()
                      if (tune && String(tune.id) === String(updated.id)) {
                        setTune(updated)
                      }
                    }} onChange={
                      function(links, targetId) {
                        const id = targetId || (tune && tune.id)
                        if (!id) return
                        const base = (props.tunes && props.tunes[id])
                          || (tune && String(tune.id) === String(id) ? tune : null)
                        if (!base) return
                        const next = Object.assign({}, base, { id: id, links: links })
                        props.tunebook.saveTune(next)
                        if (tune && String(tune.id) === String(id)) {
                          setTune(next)
                        }
                      }
                    } />
                  </ButtonGroup>
                )
                const editTuneDropdown = (
                  <Dropdown as={ButtonGroup} className="music-actions-edit-dropdown" title="Edit tune">
                    <Dropdown.Toggle variant="warning" className="music-actions-edit-btn" aria-label="Edit tune">
                      {props.tunebook.icons.pencil}
                    </Dropdown.Toggle>
                    <Dropdown.Menu
                      className="music-actions-edit-submenu-menu"
                      popperConfig={{ strategy: 'fixed' }}
                    >
                      {SINGLE_VIEW_EDIT_MODES.map(function(mode) {
                        const editorPath = mode.id === 'info'
                          ? '/editor/' + params.tuneId
                          : '/editor/' + params.tuneId + '/' + mode.id
                        return (
                          <Dropdown.Item key={mode.id} as={Link} to={editorPath}>
                            {mode.label}
                          </Dropdown.Item>
                        )
                      })}
                      <Dropdown.Divider />
                      <Dropdown.Item
                        disabled={copyToScratchpadBusy}
                        onClick={function() { setShowScratchpadCopyPicker(true) }}
                      >
                        Copy To Scratchpad
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown>
                )
                const foldedZoomTransposeRow = foldControlsIntoMenu && (zoomControlsElement || (!fileOverlayActive && transposeCapoBlock)) ? (
                  <div className="view-mode-zoom-transpose-row">
                    {!fileOverlayActive ? transposeCapoBlock : null}
                    {zoomControlsElement}
                  </div>
                ) : null
                const viewModeSelector = (
                  <ViewModeSelectorModal
                    className="music-view-mode-selector"
                    viewMode={props.viewMode}
                    tune={tune}
                    tunebook={props.tunebook}
                    forceDropdown={compactNotationControls}
                    embeddedPanel={foldControlsIntoMenu}
                    stopMenuClose={foldControlsIntoMenu || compactNotationControls}
                    notationFitMode={notationFitMode}
                    onNotationFitModeChange={handleNotationFitModeChange}
                    hideInlineVoiceControls={fileOverlayActive}
                    fileOverlayActive={fileOverlayActive}
                    availableOverride={availableForControls}
                    tablatureSelector={tablatureInViewMode ? tablatureSelector : null}
                    onVoiceSettingsChange={function() {
                      setVoiceSettingsVersion(function(v) { return v + 1 })
                    }}
                    fileControls={fileControlsElement}
                    afterDisplayModes={foldedZoomTransposeRow}
                    extraMenuContent={!foldControlsIntoMenu && compactNotationControls && !fileOverlayActive
                      ? transposeCapoBlock
                      : null}
                    onChange={handleViewModeChange}
                  />
                )
                const sharePrintDownloadDelete = (
                  <>
                    <Dropdown.Item className="music-actions-dropdown-item-labeled">
                      <ShareTunebookModal
                        tunebook={props.tunebook}
                        token={props.token}
                        login={props.login}
                        googleDocumentId={props.googleDocumentId}
                        shareKind="tune"
                        tuneId={tune.id}
                        tuneName={tune.name}
                        tunes={props.tunes}
                        saveTune={props.tunebook.saveTune}
                        buttonClassName="music-actions-menu-btn btn-info music-actions-menu-btn--labeled"
                      />
                    </Dropdown.Item>
                    <Dropdown.Item className="music-actions-dropdown-item-labeled">
                      <Button className="music-actions-menu-btn btn-primary music-actions-menu-btn--labeled" onClick={openPrintPdfLayout}>
                        {props.tunebook.icons.printer}
                        <span className="music-actions-menu-btn-label"> Print</span>
                      </Button>
                    </Dropdown.Item>
                    <Dropdown.Item as="div" className="music-actions-dropdown-item-labeled">
                      <div className="music-actions-nested-dropdown-wrap" onClick={function(e) { e.stopPropagation() }}>
                        <TuneDownloadDropdown
                          tunebook={props.tunebook}
                          tunes={[tune]}
                          archiveBaseName={(tune.name ? tune.name.trim() : 'tune')}
                          token={props.token}
                          user={props.user}
                          allowRestrictedFormats={true}
                          buttonVariant="success"
                          buttonClassName="music-actions-menu-btn music-actions-menu-btn--labeled"
                          labelClassName="music-actions-menu-btn-label"
                        />
                      </div>
                    </Dropdown.Item>
                    <Dropdown.Item className="music-actions-dropdown-item-labeled">
                      <Button
                        variant="danger"
                        className="music-actions-menu-btn music-actions-menu-btn--labeled"
                        onClick={function() {
                          if (window.confirm('Do you really want to delete this tune ?')) {
                            props.tunebook.deleteTune(tune.id)
                          }
                          navigate(resolveTunesListPath({
                            currentTuneBook: props.currentTuneBook,
                            filter: props.filter,
                            tagFilter: props.tagFilter,
                            genreFilter: props.genreFilter,
                            artistFilter: props.artistFilter,
                            albumFilter: props.albumFilter,
                            groupBy: props.groupBy,
                          }))
                        }}
                      >
                        {props.tunebook.icons.bin}
                        <span className="music-actions-menu-btn-label"> Delete</span>
                      </Button>
                    </Dropdown.Item>
                  </>
                )

                var useInstrument = localStorage.getItem('bookstorage_last_chord_instrument') ? localStorage.getItem('bookstorage_last_chord_instrument') : 'guitar'
                return <div className={'music-single' + (fileOverlayActive ? ' music-single--file-overlay' : '')} style={{border:'1px solid black'}} {...handlers} >
			<div ref={toolbarRef} className={toolbarClassName}>
			  <div className="music-buttons-inner">
			    <div className="music-buttons-col-left">
            <Dropdown as={ButtonGroup} autoClose="outside">
			        <Dropdown.Toggle variant="outline-dark" id="dropdown-basic" className="music-actions-dropdown-toggle">
			          {props.tunebook.icons.menu}
			        </Dropdown.Toggle>

			        <Dropdown.Menu className="music-actions-dropdown-menu" popperConfig={{ strategy: 'fixed' }}>
                {foldControlsIntoMenu ? (
                  <div className="music-actions-dropdown-menu-body">
                    <div className="music-actions-dropdown-section music-actions-dropdown-section-layout">
                      {viewModeSelector}
                      {!pdfSnapshotActive ? (
                        <div
                          className="music-actions-dropdown-autoscroll-row"
                          onClick={function(e) { e.stopPropagation() }}
                          onMouseDown={function(e) { e.stopPropagation() }}
                        >
                          {chordPitchButtonElement}
                          <div className="music-actions-dropdown-autoscroll">
                            <LyricsAutoscrollModal
                              tune={tune}
                              tunebook={props.tunebook}
                              mediaController={props.mediaController}
                              mediaLinkNumber={props.mediaController && props.mediaController.mediaLinkNumber != null ? props.mediaController.mediaLinkNumber : 0}
                              musicSingleSelector=".music-single"
                              barLayout="gig-inline"
                              buttonVariant="outline-secondary"
                              buttonSize="sm"
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <Dropdown.Divider className="music-actions-dropdown-divider" />
                    <div
                      className="music-actions-dropdown-section music-actions-dropdown-section-meta"
                      onClick={function(e) { e.stopPropagation() }}
                      onMouseDown={function(e) { e.stopPropagation() }}
                    >
                      <div className="music-tune-meta-toolbar">
                        {editTuneDropdown}
                        {tuneMetaButtons}
                      </div>
                    </div>
                    <Dropdown.Divider className="music-actions-dropdown-divider" />
                    <div className="music-actions-dropdown-section music-actions-dropdown-section-actions">
                      {sharePrintDownloadDelete}
                    </div>
                  </div>
                ) : (
                <div className="music-actions-dropdown-cols">
                  <div className="music-actions-dropdown-actions">
                    {sharePrintDownloadDelete}
                  </div>

                  <div
                    className="music-actions-dropdown-col-meta music-actions-dropdown-col-meta-compact"
                    onClick={function(e) { e.stopPropagation() }}
                    onMouseDown={function(e) { e.stopPropagation() }}
                  >
                    {mediumToolbar ? editTuneDropdown : null}
                    {tuneMetaButtons}
		          </div>
			</div>
                )}
			        </Dropdown.Menu>
			      </Dropdown>

            {showInlineTuneMeta ? editTuneDropdown : null}
			    </div>

          {pdfToolbarBesideMenu ? (
            <div
              ref={setPdfToolbarHost}
              className="music-pdf-toolbar-slot music-pdf-toolbar-slot--beside-menu"
              aria-hidden={!pdfToolbarHost}
            />
          ) : null}

			    <div className="music-buttons-col-meta music-tune-meta-inline">
			      {showInlineTuneMeta ? tuneMetaButtons : null}
			    </div>

			    {!foldControlsIntoMenu ? (
			    <div className="music-buttons-col-right">
            {pdfToolbarInMainRow ? (
              <div
                ref={setPdfToolbarHost}
                className="music-pdf-toolbar-slot"
                aria-hidden={!pdfToolbarHost}
              />
            ) : null}
			      {zoomControlsElement}
			      {chordPitchButtonElement}
			      {!pdfSnapshotActive ? (
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
            ) : null}
			      {viewModeSelector}
            {!compactNotationControls && !fileOverlayActive ? notationControlsBlock : null}
			    </div>
            ) : null}
			  </div>
			</div>
      {autoEnrichPending ? (
        <Alert variant="warning" className="m-2 mb-0" data-testid="auto-enrich-pending-alert">
          <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
            <div className="flex-grow-1">
              More information is loading. Please wait.
              <SearchProgressBar
                visible={true}
                percent={autoEnrichState.progress || 0}
                message={autoEnrichState.message || 'Searching...'}
                defaultMessage="Searching..."
              />
            </div>
            <Button
              size="sm"
              variant="outline-secondary"
              data-testid="auto-enrich-cancel"
              onClick={function() { cancelAddTuneAutoEnrich(params.tuneId) }}
            >
              Cancel enhancement
            </Button>
          </div>
        </Alert>
      ) : null}
      {!autoEnrichPending && autoEnrichState.needsChordPaste ? (
        <Alert
          variant="warning"
          className="m-2 mb-0"
          data-testid="auto-enrich-chord-paste-alert"
          dismissible
          onClose={function() { dismissAddTuneAutoEnrichChordPaste(params.tuneId) }}
        >
          <div>
            {autoEnrichState.message
              || 'Chords need a manual paste from Ultimate Guitar.'}
          </div>
          <div className="mt-2 d-flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              data-testid="auto-enrich-open-chord-paste"
              onClick={function() { setShowAutoEnrichChordPaste(true) }}
            >
              Open link and paste chords
            </Button>
            {autoEnrichState.chordPasteCandidate && autoEnrichState.chordPasteCandidate.url ? (
              <Button
                size="sm"
                variant="outline-primary"
                as="a"
                href={autoEnrichState.chordPasteCandidate.url}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="auto-enrich-chord-source-link"
              >
                {autoEnrichState.chordPasteCandidate.searchFallback
                  ? 'Search Ultimate Guitar'
                  : ('Open ' + (autoEnrichState.chordPasteCandidate.source || 'chord page'))}
              </Button>
            ) : null}
          </div>
        </Alert>
      ) : null}
      {!autoEnrichPending && autoEnrichState.needsNotationPaste && !autoEnrichState.needsChordPaste ? (
        <Alert
          variant="warning"
          className="m-2 mb-0"
          data-testid="auto-enrich-notation-paste-alert"
          dismissible
          onClose={handleAutoEnrichNotationAbandoned}
        >
          <div>
            {autoEnrichState.message
              || 'Notation was found on MuseScore, but needs a manual download (MusicXML, .mxl, .mscz, or MIDI) or paste.'}
          </div>
          {museScoreManualCandidates(autoEnrichState.notationManualCandidates).length > 0 ? (
            <div className="mt-2">
              <div className="small text-muted mb-1">MuseScore matches</div>
              <div className="d-flex flex-wrap gap-2">
                {museScoreManualCandidates(autoEnrichState.notationManualCandidates).slice(0, 6).map(function(item, index) {
                  const label = truncateEnrichLabel(item.title, 72) || ('Score ' + (index + 1))
                  return (
                    <Button
                      key={item.url || index}
                      size="sm"
                      variant="outline-primary"
                      as="a"
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="auto-enrich-notation-musescore-link"
                    >
                      {label}
                    </Button>
                  )
                })}
              </div>
            </div>
          ) : null}
          <div className="mt-2 d-flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              data-testid="auto-enrich-open-notation-paste"
              onClick={function() { setShowAutoEnrichNotationPaste(true) }}
            >
              Paste or import notation
            </Button>
            {autoEnrichState.notationPasteCandidate && autoEnrichState.notationPasteCandidate.url ? (
              <Button
                size="sm"
                variant="outline-primary"
                as="a"
                href={autoEnrichState.notationPasteCandidate.url}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="auto-enrich-notation-source-link"
              >
                {autoEnrichState.notationPasteCandidate.searchFallback
                  ? 'Search MuseScore'
                  : ('Open ' + (autoEnrichState.notationPasteCandidate.source || 'MuseScore'))}
              </Button>
            ) : null}
          </div>
        </Alert>
      ) : null}
      {!autoEnrichPending && autoEnrichState.musescorePaywalled && !autoEnrichState.needsNotationPaste ? (
        <Alert
          variant="info"
          className="m-2 mb-0"
          data-testid="auto-enrich-musescore-paywalled-alert"
          dismissible
          onClose={handleAutoEnrichNotationAbandoned}
        >
          {autoEnrichState.message
            || 'MuseScore matches require PRO or purchase; try MIDI or ABC sources instead.'}
          {tune && buildMuseScoreSearchUrl(tune.name, tune.composer) ? (
            <div className="mt-2 d-flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline-primary"
                as="a"
                href={buildMuseScoreSearchUrl(tune.name, tune.composer)}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="auto-enrich-musescore-paywalled-search"
              >
                Search MuseScore
              </Button>
              <Button
                size="sm"
                variant="primary"
                data-testid="auto-enrich-open-notation-paste"
                onClick={function() { setShowAutoEnrichNotationPaste(true) }}
              >
                Paste or import notation
              </Button>
            </div>
          ) : null}
        </Alert>
      ) : null}
      {!autoEnrichPending && autoEnrichState.failure ? (
        <Alert
          variant="danger"
          className="m-2 mb-0"
          data-testid="auto-enrich-failure-alert"
          dismissible
          onClose={function() { dismissAddTuneAutoEnrichFailure(params.tuneId) }}
        >
          {autoEnrichState.failure}
        </Alert>
      ) : null}
      {hasMidBlockDoubleBarlines && !dismissMidBlockDoubleBarWarning ? (
        <Alert
          variant="warning"
          className="m-2 mb-0"
          data-testid="mid-block-double-barline-alert"
          dismissible
          onClose={function() { setDismissMidBlockDoubleBarWarning(true) }}
        >
          <div>
            Double barlines (<code>||</code>) appear between bars inside a section.
            That usually comes from an older chord import and breaks notation-based chord layout.
            Use single <code>|</code> mid-section and keep <code>||</code> only at section ends.
          </div>
          <div className="mt-2">
            <Button
              size="sm"
              variant="outline-primary"
              as={Link}
              to={'/editor/' + params.tuneId + '/notationAbc'}
              data-testid="mid-block-double-barline-edit"
            >
              Edit ABC
            </Button>
          </div>
        </Alert>
      ) : null}
      <PasteChordSheetModal
        show={showAutoEnrichChordPaste}
        onHide={function() {
          setShowAutoEnrichChordPaste(false)
          dismissAddTuneAutoEnrichChordPaste(params.tuneId)
        }}
        tune={tune || {}}
        forceAbcMerge={false}
        initialLyricSheetOnly={shouldSkipAbcMergeForChordPaste(tune)}
        externalUrl={autoEnrichState.chordPasteCandidate && autoEnrichState.chordPasteCandidate.url
          ? autoEnrichState.chordPasteCandidate.url
          : ''}
        externalLinkLabel={'Open ' + ((autoEnrichState.chordPasteCandidate && autoEnrichState.chordPasteCandidate.source) || 'Ultimate Guitar')}
        externalSourceTitle={autoEnrichState.chordPasteCandidate && autoEnrichState.chordPasteCandidate.title
          ? autoEnrichState.chordPasteCandidate.title
          : ''}
        externalHelpText={shouldSkipAbcMergeForChordPaste(tune)
          ? 'Notation is already on this tune. Open the page, copy chords and lyrics, paste below, then Import — ABC notation will be left unchanged.'
          : 'Chords were found on a site that blocks automatic import. Open the page, copy the lyrics and chords, paste them below, then Import.'}
        onSaveSections={function(result) {
          if (!result || !tune) return
          const skipAbc = !!result.skipAbcMerge || shouldSkipAbcMergeForChordPaste(tune)
          const committed = commitPasteChordSheetToTune({
            result: result,
            tune: tune,
            tunebook: props.tunebook,
            abcjsParser: abcjsParser,
            forceUpdateLyrics: true,
            skipAbcMerge: skipAbc,
            historyLabel: result.historyLabel
              || (skipAbc
                ? 'Paste chords (keep notation)'
                : 'Paste chords and lyrics'),
          })
          if (!committed || !committed.ok) return
          setTune(Object.assign({}, tune))
          if (typeof props.forceRefresh === 'function') props.forceRefresh()
          setShowAutoEnrichChordPaste(false)
          dismissAddTuneAutoEnrichChordPaste(params.tuneId)
        }}
      />
      <ScratchpadWorkspacePickerModal
        show={showScratchpadCopyPicker}
        onHide={function() {
          if (copyToScratchpadBusy) return
          setShowScratchpadCopyPicker(false)
        }}
        title="Copy tune to scratchpad"
        description="Choose a workspace for the composition created from this tune."
        onConfirm={function(workspaceId) {
          setShowScratchpadCopyPicker(false)
          runCopyToScratchpad(workspaceId)
        }}
      />
      <LockedSourcePasteModal
        show={showAutoEnrichNotationPaste}
        onHide={function() {
          setShowAutoEnrichNotationPaste(false)
        }}
        onAbandon={handleAutoEnrichNotationAbandoned}
        candidate={autoEnrichState.notationPasteCandidate}
        searchTitle={tune && tune.name}
        searchArtist={tune && tune.composer}
        tunebook={props.tunebook}
        abcjsParser={abcjsParser}
        resolverAvailable={resolverAvailable}
        allowNotationFile={true}
        importLabel="Apply to tune"
        onImportCandidates={function(candidates) {
          const first = Array.isArray(candidates) ? candidates[0] : null
          if (!first || !first.tune || !tune || !props.tunebook || !props.tunebook.abcTools) {
            throw new Error('Could not apply pasted notation')
          }
          const imported = first.tune
          imported.id = tune.id
          // Keep lyrics already autofilled; MuseScore import should not wipe them.
          if ((!imported.words || !imported.words.length) && tune.words && tune.words.length) {
            imported.words = tune.words.slice()
          }
          if ((!imported.wLines || !imported.wLines.length) && tune.wLines && tune.wLines.length) {
            imported.wLines = tune.wLines.slice()
          }
          // Note-aligned MuseScore lyrics → plain words for the lyrics panel when empty.
          ensurePlainWordsFromNoteAlignedLyrics(imported)
          if (autoEnrichState.notationPasteCandidate && autoEnrichState.notationPasteCandidate.url) {
            imported.srcUrl = imported.srcUrl || autoEnrichState.notationPasteCandidate.url
          }
          props.tunebook.saveTune(imported, false, {
            historyLabel: 'Import MuseScore notation',
            immediate: true,
          })
          setTune(imported)
          if (typeof props.forceRefresh === 'function') props.forceRefresh()
          setShowAutoEnrichNotationPaste(false)
          dismissAddTuneAutoEnrichNotationPaste(params.tuneId)
        }}
      />
            {(fileManager && Array.isArray(fileManager.filtered) && fileManager.filtered.length > 0 ) && <div style={{textAlign:'center'}} >
				<b style={{fontSize:'2em'}}>{tune.name}</b>
				{tune.composer && <span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; by <span>{tune.composer}</span></span>} 
			</div>}
			
             {(fileManager && Array.isArray(fileManager.filtered))  && fileManager.filtered.map(function(file, fk) {
				return <FileRenderer key={fk} tunebook={props.tunebook} file={file} /> 
			 })}

             {fileOverlayActive ? (
               <TuneFilePanel
                 tune={tune} 
                 token={props.token}
                 driveApi={driveDocs}
                 tunebook={props.tunebook}
                 fitMode={NOTATION_FIT_VERTICAL}
                 zoom={fileViewZoom}
                 embedToolbarInMainBar={embedPdfToolbarInMainBar}
                 toolbarHost={pdfToolbarHost}
                 onTuneChange={function(next) {
                   setTune(next)
                   props.tunebook.saveTune(next)
                 }}
               />
             ) : null}


              
             <div className={`music-single-panels tune-display-panels ${layout.layoutClass}${!fileOverlayActive && fitHeightOn ? ' music-panels-fit-height' : ''}${fileOverlayActive ? ' music-single-panels--file-overlay' : ''}`}>
               {viewModesEmpty ? (
                 <div className="tune-view-modes-empty" role="status">
                   <div className="tune-view-modes-empty-title">
                     {tune.name}
                     {tune.composer && <span className="tune-view-modes-empty-composer"> by {tune.composer}</span>}
                   </div>
                   <div>No view modes enabled</div>
                 </div>
               ) : null}
               {/* Notation panel — always in DOM for audio continuity, visually hidden when off or file overlay */}
               <div className={`music-body-notation tune-panel-notation${!chordsAnnotate ? ' no-inline-chords' : ''}${layout.main === 'notation' ? ' tune-slot-main' : ''}${layout.side === 'notation' ? ' tune-slot-side' : ''}`} style={showNotationUi ? {} : {display:'none'}}>
                 <div style={{paddingLeft:'0.7em', paddingRight:'0.7em'}}>
                   {(showMedia && Array.isArray(tune.links) && tune.links.length > 0) && <div style={{clear:'both', width:'100%', height:'3em'}} />}
                   <div id={"abccontainer-"+(autoStart ? "Y":"N")+"-"+(localStorage.getItem('bookstorage_autoprime') === "true"?"Y":"N")}>
                     {autoStart && <Abc  showRepeats={true} warp={props.mediaController.playbackSpeed} onStarted={function() {props.mediaController.play()}} onStopped={function() {props.mediaController.pause()}}  mediaController={props.mediaController} speakTitle={localStorage.getItem('bookstorage_announcesong')} autoStart={true} autoPrime={true} autoScroll={showNotationUi} setMidiData={setMidiData} forceRefresh={props.forceRefresh} metronomeCountIn={true}  tunes={props.tunes} editableTempo={true} repeat={notationTune.repeats > 0 ? notationTune.repeats : 1 } tunebook={props.tunebook}  abc={notationAbc}  meter={notationTune.meter} fitMode={notationFitMode} onEnded={onEnded} hideSvg={false} hidePlayer={true} visualTranspose={notationVisualTranspose} playbackEngine={ownMidiEngine} tablatureSourceTune={tune} tablatureVoiceKeys={visibleVoiceKeys} onClick={handleNotationChordClick} />}
                     {!autoStart && <Abc  showRepeats={true} warp={props.mediaController.playbackSpeed} onStarted={function() {props.mediaController.play()}} onStopped={function() {props.mediaController.pause()}}  mediaController={props.mediaController}  speakTitle={localStorage.getItem('bookstorage_announcesong')}  autoStart={false} autoPrime={true} autoScroll={showNotationUi} setMidiData={setMidiData} forceRefresh={props.forceRefresh} metronomeCountIn={true}  tunes={props.tunes} editableTempo={true} repeat={notationTune.repeats > 0 ? notationTune.repeats : 1 } tunebook={props.tunebook}  abc={notationAbc}  meter={notationTune.meter} fitMode={notationFitMode} onEnded={onEnded} hideSvg={false} hidePlayer={true} visualTranspose={notationVisualTranspose} playbackEngine={ownMidiEngine} tablatureSourceTune={tune} tablatureVoiceKeys={visibleVoiceKeys} onClick={handleNotationChordClick} />}
                   </div>
                 </div>
               </div>

               {/* Lyrics panel — keep mounted when enabled so Capture screenshot can reveal it under overlay */}
               {lyricsVisible && (
                 <div className={`music-body-lyrics tune-panel-lyrics${syncLyricsStructure ? ' tune-panel-lyrics-structure-sync' : ''}${layout.main === 'lyrics' ? ' tune-slot-main' : ''}${layout.side === 'lyrics' ? ' tune-slot-side' : ''}${layout.below === 'lyrics' ? ' tune-slot-below' : ''}${layout.wrapLyricsAroundStructure ? ' tune-lyrics-wrap' : ''}`} style={showLyricsUi ? undefined : {display:'none'}}>
                   <div className="lyrics-panel-inner">
                     {!syncLyricsStructure ? (
                       <div className="lyrics-panel-header">
                         <TitleAndLyricsEditorModal tunebook={props.tunebook} tune={tune} tunes={props.tunes} forceRefresh={props.forceRefresh} token={props.token} />
                         {tune.composer && <span className="lyrics-panel-composer"> - {tune.composer}</span>}
                       </div>
                     ) : null}
                     {syncLyricsStructure ? (
                       <LyricsStructureSyncPanel
                         tune={tune}
                         tunebook={props.tunebook}
                         chordTranspose={chordTranspose}
                         hideChords={!chordsAnnotate}
                         zoom={lyricsZoom > 0 ? lyricsZoom : 1}
                         fitHeight={lyricsStructureFitHeight}
                         chords={chords}
                         melodyNoteLines={firstVoice.notes}
                         uniqueChords={uniqueChords}
                         useInstrument={useInstrument}
                         showCapoControl={structureVisible}
                         capoOffset={capoState.capoOffset}
                         capoEnabled={capoState.capoEnabled}
                         onCapoToggle={capoState.toggleCapo}
                         onCapoOffsetChange={handleCapoOffsetChange}
                         lyricsHeader={(
                           <>
                             <TitleAndLyricsEditorModal tunebook={props.tunebook} tune={tune} tunes={props.tunes} forceRefresh={props.forceRefresh} token={props.token} />
                             {tune.composer && <span className="lyrics-panel-composer"> - {tune.composer}</span>}
                           </>
                         )}
                       />
                     ) : (
                       <div className="lyrics-zoom-host" style={{ fontSize: (lyricsZoom > 0 ? lyricsZoom : 1) + 'em' }}>
                         <TimedLyricsChordsView
                           tune={tune}
                           tunebook={props.tunebook}
                           chordTranspose={chordTranspose}
                           hideChords={!chordsAnnotate}
                           suppressLeadingTitle={true}
                           inheritZoom={true}
                           fitHeight={lyricsFitHeight}
                         />
                       </div>
                     )}
                   </div>
                 </div>
               )}

               {/* Structure (chord block) panel */}
               {structureVisible && !syncLyricsStructure && (
                 <div className={`music-body-chords tune-panel-structure${layout.main === 'structure' ? ' tune-slot-main' : ''}${layout.side === 'structure' ? ' tune-slot-side' : ''}`} style={showStructureUi ? undefined : {display:'none'}}>
                   {structureOnlyView && showStructureUi ? (
                     <div className="title music-tune-heading music-structure-only-heading">
                       {tune.name}
                       {tune.composer ? <span className="music-tune-composer"> - {tune.composer}</span> : null}
                     </div>
                   ) : null}
                   <StructureChordBlock
                     chords={chords}
                     uniqueChords={uniqueChords}
                     useInstrument={useInstrument}
                     tune={tune}
                     melodyNoteLines={firstVoice.notes}
                     fitHeight={structureFitHeight}
                     fitHeightGrow={structureFitHeightGrow}
                     showCapoControl={true}
                     capoOffset={capoState.capoOffset}
                     capoEnabled={capoState.capoEnabled}
                     onCapoToggle={capoState.toggleCapo}
                     onCapoOffsetChange={handleCapoOffsetChange}
                   />
                 </div>
               )}
             </div>
             
             
             
             {mountMediaEngine && (
               <MediaPlayerMedia mediaController={props.mediaController} tunebook={props.tunebook} tune={tune} token={props.token} user={props.user} googleDocumentId={props.googleDocumentId} login={props.login} onEnded={onEnded} />
             )}

             {(viewFlags.info && backgroundInfoText) || tuneBooks.length > 0 || tuneTags.length > 0 || tuneAlbums.length > 0 ? (
              <div className="music-single-footer-meta">
                {viewFlags.info && backgroundInfoText ? (
                  <div className="music-tune-info-section">
                    <div className="tune-background-info-view">
                      <MarkdownContent text={backgroundInfoText} />
                    </div>
                  </div>
                ) : null}
                {tuneBooks.length > 0 || tuneTags.length > 0 || tuneAlbums.length > 0 ? (
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
                    {tuneAlbums.length > 0 ? (
                      <div className="music-single-books-tags-row">
                        <span className="music-single-books-tags-label">Albums</span>
                        <div className="music-single-books-tags-buttons">
                          {tuneAlbums.map(function(album, idx) {
                            return <Button key={'album-' + idx} variant="outline-secondary" size="sm" disabled tabIndex={-1}>{album}</Button>
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
                                //try {
                                    //if (audioPlayer && audioPlayer.current) audioPlayer.current.pause()
                                    //if (ytMediaPlayer) ytMediaPlayer.pauseVideo()
                                //} catch (e) {
                                //}
                                //try {
                                    //setIsPlaying(false)
                                //} catch (e) {
                                //}
                            //}} >{props.tunebook.icons.pause}</Button>}
                        //{(!mediaLoading && showMedia && !isPlaying) && <Button variant="success" onClick={function() {
                                //try {
                                    //if (audioPlayer && audioPlayer.current) audioPlayer.current.play()
                                    //if (ytMediaPlayer) ytMediaPlayer.playVideo()
                                //} catch (e) {
                                //}
                                //try {
                                    //setIsPlaying(true)
                                //} catch (e) {
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
                                //// next link
                                //if (props.mediaPlaylist || props.abcPlaylist) {
                                    //nextLinkOrTune()
                                //}
                            //}}
                            //onError={function(e) {
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
                                    //clearInterval(youtubeProgressInterval.current)
                                    //youtubeProgressInterval.current = null
                                    //if (props.mediaPlaylist || props.abcPlaylist) {
                                        //nextLinkOrTune()
                                    //}
                                //}} 
                                //onError={function(e) {
                                    //clearInterval(youtubeProgressInterval.current)
                                    //youtubeProgressInterval.current = null
                                    //if (props.mediaPlaylist || props.abcPlaylist) {
                                        //nextLinkOrTune()
                                    //}
                                //}} 
                                //onReady={
                                    //function(event) {
                                        //setYTMediaPlayer(event.target); 
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
                                            //if (ytMediaPlayer && ytMediaPlayer.getDuration && ytMediaPlayer.seekTo) {
                                                //ytMediaPlayer.seekTo(parseFloat(e.target.value * ytMediaPlayer.getDuration()).toFixed(2)) 
                                            //};
                                        //} catch (e) {
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
