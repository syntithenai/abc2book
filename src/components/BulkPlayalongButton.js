import { useMemo, useState } from 'react'
import { Button } from 'react-bootstrap'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import {
  PLAYALONG_TEMPO_MULTIPLIER_DEFAULT,
  clampPlayalongTempoMultiplier,
  createBulkPlayalongSession,
  estimateBulkPlayalongRecordingSeconds,
  formatApproximatePlayalongDuration,
} from '../bulkPlayalongSession'
import {
  clampPlayalongRepeats,
  loadPlayalongSettings,
  savePlayalongSettings,
} from '../playalongSettings'
import { shouldShowPlayalongRecordButton } from '../playalongTakes'
import PlayalongRecordConfigModal from './PlayalongRecordConfigModal'

export default function BulkPlayalongButton(props) {
  const navigate = useNavigate()
  const icons = props.tunebook && props.tunebook.icons ? props.tunebook.icons : {}
  const [showConfig, setShowConfig] = useState(false)
  const [playalongSettings, setPlayalongSettings] = useState(function() {
    return loadPlayalongSettings()
  })
  const [tempoMultiplier, setTempoMultiplier] = useState(PLAYALONG_TEMPO_MULTIPLIER_DEFAULT)

  const recordableTunes = useMemo(function() {
    return props.tunebook.fromSelection(props.selected)
      .filter(function(tune) {
        return tune && tune.id && shouldShowPlayalongRecordButton(tune, props.tunebook, false)
      })
  }, [props.tunebook, props.selected])

  const recordableTuneIds = useMemo(function() {
    return recordableTunes.map(function(tune) { return tune.id })
  }, [recordableTunes])

  const repeats = clampPlayalongRepeats(playalongSettings.repeats)
  const estimatedSeconds = useMemo(function() {
    return estimateBulkPlayalongRecordingSeconds(recordableTunes, props.tunebook, {
      repeats: repeats,
      tempoMultiplier: tempoMultiplier,
    })
  }, [recordableTunes, props.tunebook, repeats, tempoMultiplier])
  const bulkDurationLabel = formatApproximatePlayalongDuration(estimatedSeconds)

  function openConfig() {
    if (!recordableTuneIds.length) {
      toast.warn('None of the selected tunes have notation suitable for play-along recording.')
      return
    }
    const skipped = props.selectedCount - recordableTuneIds.length
    if (skipped > 0) {
      toast.info(
        skipped + ' selected tune' + (skipped === 1 ? '' : 's') +
        ' skipped (no melody notation for play-along).'
      )
    }
    setShowConfig(true)
  }

  function updatePlayalongSettings(next) {
    const saved = savePlayalongSettings(next)
    setPlayalongSettings(saved)
    return saved
  }

  function startBulkPlayalong(nextSettings) {
    const settings = nextSettings || playalongSettings
    const session = createBulkPlayalongSession({
      tuneIds: recordableTuneIds,
      settings: settings,
      tempoMultiplier: tempoMultiplier,
    })
    if (!session) return
    setShowConfig(false)
    if (typeof props.onClose === 'function') props.onClose()
    toast.info(
      'Play along 1/' + session.tuneIds.length + ': starting first tune'
    )
    navigate('/tunes/' + encodeURIComponent(session.tuneIds[0]))
  }

  return (
    <>
      <Button
        variant="secondary"
        className="bulk-ops-action-btn"
        aria-label="Play Along"
        title="Play Along"
        onClick={openConfig}
      >
        {icons.pianoroll || icons.recordcircle || '▤'}
        <span className="bulk-ops-btn-label">Play Along</span>
      </Button>
      <PlayalongRecordConfigModal
        show={showConfig}
        onHide={function() { setShowConfig(false) }}
        tempoAsMultiplier={true}
        tempoMultiplier={tempoMultiplier}
        onTempoMultiplierChange={function(next) {
          setTempoMultiplier(clampPlayalongTempoMultiplier(next))
        }}
        bulkTuneCount={recordableTuneIds.length}
        bulkDurationLabel={bulkDurationLabel}
        settings={playalongSettings}
        onSettingsChange={updatePlayalongSettings}
        canClear={false}
        onStart={startBulkPlayalong}
      />
    </>
  )
}
