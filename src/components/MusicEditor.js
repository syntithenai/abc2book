import {useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {Button, ButtonGroup} from 'react-bootstrap'
import {useState, useEffect, useCallback, useRef, useSyncExternalStore} from 'react'
import AbcEditor from './AbcEditor'
import TuneEnhanceButton from './TuneEnhanceButton'
import NotationSearchButton from './NotationSearchButton'
import MelodyAnalysisRefineModal from './MelodyAnalysisRefineModal'
import ViewModeSelectorModal from './ViewModeSelectorModal'
import { trackEditorOpen } from '../analytics'
import { canRedoTuneEdit, canUndoTuneEdit, getRedoTuneEditLabel, getUndoTuneEditLabel } from '../tuneEditHistory'
import { useBulkCheckReturnToast } from '../useBulkCheckReturnToast'
import { isNotationEditorView, normalizeEditorViewMode } from '../viewModeUtils'
import { getBackgroundReviewSummary } from '../backgroundReviewQueue'
import { showBackgroundJobsContinuingNotice } from '../backgroundReviewToast'
import {buildSingleTuneTitle, DEFAULT_APP_TITLE, setDocumentTitle} from '../pageTitle'
import {
  EMPTY_MEDIA_ANALYSIS_JOB,
  getMediaAnalysisJob,
  subscribeMediaAnalysisJobs,
} from '../mediaAnalysisJobs'
import { mediaAnalysisJobHasMelodySourceNotes } from '../mediaAnalysisSuggestions'

export default function MusicEditor(props) {
    const { tunebook, forceRefresh } = props
    let params = useParams();
    var navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const urlView = params.view ? normalizeEditorViewMode(params.view) : 'info'
    var [editorViewMode, setEditorViewMode] = useState(urlView)
    let tune = props.tunes ? props.tunes[params.tuneId] : null
    let abc = tunebook.abcTools.json2abc(tune)
    const editHistory = props.editHistory
    const historyState = editHistory ? editHistory.historyState : null
    const tuneId = tune && tune.id
    useBulkCheckReturnToast(tuneId)
    const canUndo = tuneId && historyState ? canUndoTuneEdit(historyState, tuneId) : false
    const canRedo = tuneId && historyState ? canRedoTuneEdit(historyState, tuneId) : false
    const undoLabel = tuneId && historyState ? getUndoTuneEditLabel(historyState, tuneId) : ''
    const redoLabel = tuneId && historyState ? getRedoTuneEditLabel(historyState, tuneId) : ''
    const autoActivateChordRecord = editorViewMode === 'chords' && searchParams.get('record') === '1'
    const mediaAnalysis = useSyncExternalStore(
      subscribeMediaAnalysisJobs,
      function() { return getMediaAnalysisJob(tuneId) },
      function() { return EMPTY_MEDIA_ANALYSIS_JOB }
    )
    const [showAnalysisRefine, setShowAnalysisRefine] = useState(false)
    const canFineTuneAnalysis = mediaAnalysisJobHasMelodySourceNotes({
      melodySourceNotes: mediaAnalysis.melodySourceNotes,
    })

    useEffect(function() {
        const nextView = params.view ? normalizeEditorViewMode(params.view) : 'info'
        setEditorViewMode(nextView)
    }, [params.tuneId, params.view])

    function handleEditorViewChange(nextView) {
        const normalized = normalizeEditorViewMode(nextView)
        setEditorViewMode(normalized)
        if (!tuneId) return
        const basePath = '/editor/' + encodeURIComponent(tuneId)
        const recordQuery = searchParams.get('record') === '1' && normalized === 'chords' ? '?record=1' : ''
        if (normalized === 'info') {
            navigate(basePath, { replace: true })
        } else {
            navigate(basePath + '/' + encodeURIComponent(normalized) + recordQuery, { replace: true })
        }
    }

    // Replace legacy sourceAbc/abc URLs with /editor/:id (normalized to info)
    useEffect(function() {
        if (!tuneId) return
        var legacyUrl = false
        if (params.view === 'sourceAbc' || params.view === 'abc') {
            legacyUrl = true
        }
        if (legacyUrl) {
            navigate('/editor/' + encodeURIComponent(tuneId), { replace: true })
        }
    }, [tuneId, params.view])

    const handleUndo = useCallback(function() {
        if (!tuneId) return
        if (tunebook.undoTuneEdits(tuneId)) {
            forceRefresh()
        }
    }, [tuneId, tunebook, forceRefresh])

    const handleRedo = useCallback(function() {
        if (!tuneId) return
        if (tunebook.redoTuneEdits(tuneId)) {
            forceRefresh()
        }
    }, [tuneId, tunebook, forceRefresh])

    // Editor does not clear the now-playing queue; follow-tune navigation is suppressed in editor.
    useEffect(function() {
      trackEditorOpen()
    },[])

    useEffect(function() {
        setDocumentTitle(buildSingleTuneTitle(tune && tune.name))
        return function() {
            setDocumentTitle(DEFAULT_APP_TITLE)
        }
    }, [tune && tune.name])

    const leaveWarnedRef = useRef(false)
    function warnIfJobsContinuing() {
      if (leaveWarnedRef.current) return
      const summary = getBackgroundReviewSummary()
      if (summary && summary.processing > 0) {
        leaveWarnedRef.current = true
        showBackgroundJobsContinuingNotice({ summary: summary })
      }
    }

    useEffect(function() {
      return function() {
        warnIfJobsContinuing()
      }
    }, [])

    useEffect(function() {
        function handleHistoryShortcut(event) {
            if (!tuneId || props.blockKeyboardShortcuts) return
            const target = event.target
            const tagName = target && target.tagName ? String(target.tagName).toLowerCase() : ''
            const isEditable = target && (target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select')
            if (isEditable) return
            const modifierPressed = event.metaKey || event.ctrlKey
            if (!modifierPressed) return
            const key = String(event.key || '').toLowerCase()
            if (key === 'z' && event.shiftKey) {
                if (canRedo) {
                    event.preventDefault()
                    handleRedo()
                }
                return
            }
            if (key === 'y') {
                if (canRedo) {
                    event.preventDefault()
                    handleRedo()
                }
                return
            }
            if (key === 'z') {
                if (canUndo) {
                    event.preventDefault()
                    handleUndo()
                }
            }
        }

        window.addEventListener('keydown', handleHistoryShortcut)
        return function() {
            window.removeEventListener('keydown', handleHistoryShortcut)
        }
    }, [props.blockKeyboardShortcuts, canRedo, canUndo, tuneId, handleRedo, handleUndo])
    
    const isNotationView = isNotationEditorView(editorViewMode)
    const historyButtonGroup = (
      <ButtonGroup className={'music-editor-history-group' + (isNotationView ? ' notation-toolbar-history-group' : '')} aria-label="Undo and redo">
        <Button
          size={isNotationView ? 'lg' : undefined}
          title={canUndo && undoLabel ? 'Undo ' + undoLabel : 'Undo'}
          disabled={!canUndo}
          variant={isNotationView ? 'outline-secondary' : 'secondary'}
          className={isNotationView ? undefined : 'btn-secondary'}
          onClick={handleUndo}
        >{props.tunebook.icons.arrowgoback}</Button>
        <Button
          size={isNotationView ? 'lg' : undefined}
          title={canRedo && redoLabel ? 'Redo ' + redoLabel : 'Redo'}
          disabled={!canRedo}
          variant={isNotationView ? 'outline-secondary' : 'secondary'}
          className={isNotationView ? undefined : 'btn-secondary'}
          onClick={handleRedo}
        >{props.tunebook.icons.arrowgoforward}</Button>
      </ButtonGroup>
    )

    //console.log('EDIT',tune,abc)
    return <div className={'music-editor' + (editorViewMode === 'lyrics' ? ' music-editor--lyrics' : '')} style={{width:'100%'}}>
        <div className="music-editor-buttons">
            <div className="music-editor-buttons-left">
                <Button className="btn-secondary music-editor-close-btn" onClick={function() {
                  warnIfJobsContinuing()
                  navigate('/tunes/' + tune.id)
                }}>{props.tunebook.icons.close}</Button>
                {isNotationView ? (
                  <>
                    <NotationSearchButton
                      tuneId={tuneId}
                      tune={tune}
                      title={tune && tune.name ? tune.name : ''}
                      artist={tune && tune.composer ? tune.composer : ''}
                      rhythm={tune && tune.rhythm ? tune.rhythm : ''}
                      currentGenre={tune && tune.genre ? tune.genre : ''}
                      currentValue={tune && tune.notes
                        ? (Array.isArray(tune.notes) ? tune.notes.join('\n') : String(tune.notes))
                        : (typeof abc === 'string' ? abc : '')}
                      token={props.token}
                      tunebook={props.tunebook}
                      disabled={!(tune && tune.name && String(tune.name).trim())}
                      onGenreAccept={function(genre) {
                        if (!tune) return
                        tune.genre = genre
                        tune.id = tuneId
                        props.tunebook.saveTune(tune)
                      }}
                      onNotation={function(candidate) {
                        if (!props.tunebook || !props.tunebook.abcTools || !tune) return
                        let imported = null
                        if (candidate && candidate.tune && typeof candidate.tune === 'object') {
                          imported = Object.assign({}, candidate.tune)
                        } else {
                          const abcText = candidate && candidate.abc ? String(candidate.abc) : ''
                          if (!abcText) return
                          imported = props.tunebook.abcTools.abc2json(abcText)
                        }
                        if (!imported) return
                        imported.id = tune.id
                        if (candidate && candidate.sourceUrl && !imported.srcUrl) {
                          imported.srcUrl = candidate.sourceUrl
                        }
                        props.tunebook.saveTune(imported, false, { historyLabel: 'Import from notation search' })
                        if (typeof props.forceRefresh === 'function') props.forceRefresh()
                      }}
                    />
                    {canFineTuneAnalysis ? (
                      <Button
                        size="lg"
                        variant="outline-secondary"
                        title="Fine-tune analysis"
                        aria-label="Fine-tune analysis"
                        style={{ marginLeft: '0.35em' }}
                        onClick={function() { setShowAnalysisRefine(true) }}
                      >
                        {props.tunebook.icons.filter}
                        <span style={{ marginLeft: '0.35em', fontSize: '0.85em' }}>Fine-tune</span>
                      </Button>
                    ) : null}
                    <MelodyAnalysisRefineModal
                      show={showAnalysisRefine}
                      onHide={function() { setShowAnalysisRefine(false) }}
                      tunebook={props.tunebook}
                      tune={tune}
                      melodySourceNotes={mediaAnalysis.melodySourceNotes}
                      timedMelody={mediaAnalysis.timedMelody}
                      chordsText={mediaAnalysis.chordsText || ''}
                      onApply={function(abcText) {
                        if (!abcText || !props.tunebook || !props.tunebook.abcTools || !tune) return
                        const imported = props.tunebook.abcTools.abc2json(abcText)
                        if (!imported) return
                        imported.id = tune.id
                        props.tunebook.saveTune(imported, false, { historyLabel: 'Fine-tune media analysis' })
                        if (typeof props.forceRefresh === 'function') props.forceRefresh()
                      }}
                    />
                  </>
                ) : historyButtonGroup}
                <span className="music-editor-search">
                    {editorViewMode === 'info' ? (
                      <TuneEnhanceButton
                        tune={tune}
                        tunebook={props.tunebook}
                        token={props.token}
                        forceRefresh={props.forceRefresh}
                      />
                    ) : null}
                </span>
            </div>
            <div className="music-editor-header-actions">
                <ViewModeSelectorModal
                  variant="editor"
                  viewMode={editorViewMode}
                  tunebook={props.tunebook}
                  onChange={handleEditorViewChange}
                />
            </div>
        </div>
        <AbcEditor
          logout={props.logout}
          login={props.login}
          token={props.token}
          mediaController={props.mediaController}
          audioProps={props.audioProps}
          forceRefresh={props.forceRefresh}
          isMobile={props.isMobile}
          abc={abc}
          tunebook={props.tunebook}
          tunes={props.tunes}
          tune={tune}
          editorViewMode={editorViewMode}
          onEditorViewModeChange={handleEditorViewChange}
          autoActivateChordRecord={autoActivateChordRecord}
          searchIndex={props.searchIndex}
          loadTuneTexts={props.loadTuneTexts}
          onNotationHelpModeChange={props.onNotationHelpModeChange}
          historyControls={isNotationView ? historyButtonGroup : null}
        />
    </div>
}
//  <TheSessionSearchSelectorModal value={tune ? tune.name : ''} currentTune={tune}  tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
