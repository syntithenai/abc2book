import { useMemo, useState } from 'react'
import { Alert, Button, Dropdown, Modal, ProgressBar } from 'react-bootstrap'
import { toast } from 'react-toastify'
import {
  TUNE_DOWNLOAD_FORMATS,
  executeTuneDownload,
  getTuneDownloadStartToastMessage,
  isStemsDownloadDisabled,
  isTuneDownloadFormatDisabled,
} from '../tuneDownloadActions'
import useStemDownloadQueue from '../useStemDownloadQueue'
import { getMediaResolverHealthState } from '../mediaResolverHealthStore'

const STEMS_FORMAT = {
  id: 'stems',
  label: 'Stems',
  icon: 'headphone',
  description: 'ZIP with solo stem WAV files (percussion, vocals, bass, guitar, piano, other)',
}

function formatIsDisabled(format, tunes, tunebook) {
  return isTuneDownloadFormatDisabled(format.id, tunes, tunebook)
}

function DownloadOptionButton({ format, icons, disabled, busy, onClick, className }) {
  return (
    <Button
      variant="outline-primary"
      className={className}
      disabled={disabled || busy}
      onClick={onClick}
      aria-label={format.label}
      title={format.description}
    >
      {icons[format.icon]}
      <span className="tune-download-option-label">{format.label}</span>
    </Button>
  )
}

function useTuneDownloadState(tunes, tunebook, archiveBaseName, token, onComplete, onOpenQueue) {
  const [busyFormatId, setBusyFormatId] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  async function runDownload(formatId) {
    setErrorMessage('')
    setBusyFormatId(formatId)
    toast.info(getTuneDownloadStartToastMessage(formatId, tunes.length), { autoClose: 3000 })
    try {
      await executeTuneDownload(formatId, {
        tunes: tunes,
        tunebook: tunebook,
        archiveBaseName: archiveBaseName,
        token: token,
        onOpenQueue: onOpenQueue,
      })
      if (onComplete) onComplete(formatId)
    } catch (error) {
      setErrorMessage(error && error.message ? error.message : 'Download failed.')
    } finally {
      setBusyFormatId('')
    }
  }

  return { busyFormatId, errorMessage, runDownload }
}

function buildStemQueueTunebook(tunebook, token) {
  const health = getMediaResolverHealthState()
  return {
    utils: tunebook.utils,
    accessToken: token && token.access_token ? token.access_token : null,
    demucsModel: health.status && health.status.demucsModel ? health.status.demucsModel : 'htdemucs',
  }
}

function StemsDownloadSection({ tunes, tunebook, token, icons, layout }) {
  const { getProgressForTunes, enqueueTunes, start } = useStemDownloadQueue()
  const [stemsError, setStemsError] = useState('')
  const progress = getProgressForTunes(tunes)
  const disabled = isStemsDownloadDisabled(tunes, tunebook)
  const busy = progress.active

  function runStemsDownload() {
    setStemsError('')
    toast.info(getTuneDownloadStartToastMessage('stems', tunes.length), { autoClose: 3000 })
    const ids = enqueueTunes(tunes, buildStemQueueTunebook(tunebook, token))
    if (!ids.length) {
      setStemsError('No cacheable linked media was found on the selected tune(s).')
      return
    }
    start()
  }

  if (layout === 'dropdown') {
    return (
      <>
        <Dropdown.Item
          disabled={disabled || busy}
          onClick={runStemsDownload}
          className="tune-download-dropdown-item"
        >
          <span className="tune-download-dropdown-icon" aria-hidden="true">{icons[STEMS_FORMAT.icon]}</span>
          <span className="tune-download-dropdown-text">
            <span className="tune-download-dropdown-label">{STEMS_FORMAT.label}</span>
            <span className="tune-download-dropdown-description">{STEMS_FORMAT.description}</span>
          </span>
        </Dropdown.Item>
        {busy || stemsError || progress.error ? (
          <Dropdown.ItemText className="tune-download-stems-progress">
            {stemsError || progress.error ? (
              <span className="text-danger">{stemsError || progress.error}</span>
            ) : (
              <>
                <div className="tune-download-stems-progress-label">{progress.message || 'Preparing stems...'}</div>
                <ProgressBar now={progress.percent} label={progress.percent + '%'} animated striped />
              </>
            )}
          </Dropdown.ItemText>
        ) : null}
      </>
    )
  }

  return (
    <div className="tune-download-stems-option">
      <Button
        variant="outline-primary"
        className="tune-download-option-btn tune-download-stems-btn"
        disabled={disabled || busy}
        onClick={runStemsDownload}
        aria-label={STEMS_FORMAT.label}
        title={STEMS_FORMAT.description}
      >
        {icons[STEMS_FORMAT.icon]}
        <span className="tune-download-option-label">{STEMS_FORMAT.label}</span>
      </Button>
      {busy ? (
        <div className="tune-download-stems-progress">
          <div className="tune-download-stems-progress-label">{progress.message || 'Preparing stems...'}</div>
          <ProgressBar now={progress.percent} label={progress.percent + '%'} animated striped />
        </div>
      ) : null}
      {stemsError || progress.error ? (
        <Alert variant="danger" className="tune-download-stems-error">{stemsError || progress.error}</Alert>
      ) : null}
    </div>
  )
}

export function TuneDownloadModal({
  show,
  onHide,
  tunebook,
  tunes,
  archiveBaseName,
  token,
  onComplete,
  onOpenQueue,
}) {
  const icons = tunebook.icons
  const tuneList = useMemo(function() {
    return Array.isArray(tunes) ? tunes.filter(Boolean) : []
  }, [tunes])
  const { busyFormatId, errorMessage, runDownload } = useTuneDownloadState(
    tuneList,
    tunebook,
    archiveBaseName,
    token,
    function(formatId) {
      if (onComplete) onComplete(formatId)
      if (onHide) onHide()
    },
    onOpenQueue
  )

  return (
    <Modal show={show} onHide={onHide} dialogClassName="tune-download-modal">
      <Modal.Header closeButton>
        <Modal.Title>Download</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="tune-download-intro">
          Choose a format for {tuneList.length} tune{tuneList.length === 1 ? '' : 's'}.
        </p>
        {errorMessage ? <Alert variant="danger">{errorMessage}</Alert> : null}
        <div className="tune-download-options">
          {TUNE_DOWNLOAD_FORMATS.map(function(format) {
            return (
              <DownloadOptionButton
                key={format.id}
                format={format}
                icons={icons}
                className="tune-download-option-btn"
                disabled={formatIsDisabled(format, tuneList, tunebook) || !!busyFormatId}
                busy={!!busyFormatId}
                onClick={function() { runDownload(format.id) }}
              />
            )
          })}
          <StemsDownloadSection
            tunes={tuneList}
            tunebook={tunebook}
            token={token}
            icons={icons}
            layout="modal"
          />
        </div>
      </Modal.Body>
    </Modal>
  )
}

export default function TuneDownloadDropdown({
  tunebook,
  tunes,
  archiveBaseName,
  token,
  onComplete,
  onOpenQueue,
  buttonVariant,
  buttonClassName,
}) {
  const icons = tunebook.icons
  const tuneList = useMemo(function() {
    return Array.isArray(tunes) ? tunes.filter(Boolean) : []
  }, [tunes])
  const { busyFormatId, errorMessage, runDownload } = useTuneDownloadState(
    tuneList,
    tunebook,
    archiveBaseName,
    token,
    onComplete,
    onOpenQueue
  )

  return (
    <Dropdown className="tune-download-dropdown" as="span">
      <Dropdown.Toggle
        variant={buttonVariant || 'success'}
        className={'bulk-ops-action-btn ' + (buttonClassName || '')}
        aria-label="Download"
        title="Download"
        disabled={!!busyFormatId}
      >
        {icons.save}
        <span className="bulk-ops-btn-label"> Download</span>
      </Dropdown.Toggle>
      <Dropdown.Menu
        className="tune-download-dropdown-menu"
        popperConfig={{
          strategy: 'fixed',
          modifiers: [
            {
              name: 'offset',
              options: { offset: [0, 8] },
            },
            {
              name: 'centerHorizontally',
              enabled: true,
              phase: 'write',
              fn: function({ state }) {
                const width = state.rects.popper.width
                const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : width
                const x = Math.max(8, (viewportWidth - width) / 2)
                state.styles.popper.left = x + 'px'
                state.styles.popper.right = 'auto'
                state.styles.popper.transform = ''
                if (state.modifiersData.popperOffsets) {
                  state.modifiersData.popperOffsets.x = x
                }
              },
            },
          ],
        }}
      >
        {errorMessage ? (
          <Dropdown.ItemText className="text-danger tune-download-dropdown-error">
            {errorMessage}
          </Dropdown.ItemText>
        ) : null}
        <div className="tune-download-dropdown-options">
          {TUNE_DOWNLOAD_FORMATS.map(function(format) {
            var disabled = formatIsDisabled(format, tuneList, tunebook) || !!busyFormatId
            return (
              <Button
                key={format.id}
                variant="outline-primary"
                className="tune-download-option-btn"
                disabled={disabled}
                onClick={function() { runDownload(format.id) }}
                aria-label={format.label}
                title={format.description}
              >
                {icons[format.icon]}
                <span className="tune-download-option-label">{format.label}</span>
              </Button>
            )
          })}
          <StemsDownloadSection
            tunes={tuneList}
            tunebook={tunebook}
            token={token}
            icons={icons}
            layout="modal"
          />
        </div>
      </Dropdown.Menu>
    </Dropdown>
  )
}

export function TuneDownloadTriggerButton({
  tunebook,
  className,
  onClick,
  label,
}) {
  return (
    <Button
      variant="primary"
      className={className || 'music-actions-menu-btn'}
      aria-label={label || 'Download'}
      title={label || 'Download'}
      onClick={onClick}
    >
      {tunebook.icons.save}
      <span className="music-actions-menu-btn-label"> {label || 'Download'}</span>
    </Button>
  )
}
