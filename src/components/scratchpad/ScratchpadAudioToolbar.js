import { useState } from 'react'
import { Button, ButtonGroup } from 'react-bootstrap'
import ScratchpadAudioTransport from './ScratchpadAudioTransport'
import ScratchpadAudioRecordSettings from './ScratchpadAudioRecordSettings'
import ScratchpadAudioEditModes from './ScratchpadAudioEditModes'
import ScratchpadAudioProcessMenu from './ScratchpadAudioProcessMenu'
import ScratchpadAudioExportGroup from './ScratchpadAudioExportGroup'
import ScratchpadAudioEditorHelpModal from './ScratchpadAudioEditorHelpModal'
import ScratchpadAudioToolbarOverflow from './ScratchpadAudioToolbarOverflow'
import ScratchpadAudioMetronomeControls from './ScratchpadAudioMetronomeControls'
import { isScratchpadToolbarNarrow } from '../../scratchpadAudioToolbarLayout'

function ScratchpadAudioToolbarGroup(props) {
  if (props.hidden) return null
  return (
    <div className={'scratchpad-audio-toolbar-group' + (props.compact ? ' scratchpad-audio-toolbar-group--compact' : '')}>
      {props.label && !props.compact ? (
        <span className="scratchpad-audio-toolbar-group-label">{props.label}</span>
      ) : null}
      <div className="scratchpad-audio-toolbar-group-body">
        {props.children}
      </div>
    </div>
  )
}

export default function ScratchpadAudioToolbar(props) {
  const icons = props.icons || {}
  const [showHelp, setShowHelp] = useState(false)
  const tier = props.layoutTier || 'wide'
  const narrow = isScratchpadToolbarNarrow(tier)
  const compact = tier !== 'wide'

  const overflowItems = [
    { key: 'insert', label: 'Insert audio…', onClick: props.onInsertAudio },
    { key: 'zoom-in', label: 'Zoom in', onClick: function() { props.ee && props.ee.emit('zoomin') } },
    { key: 'zoom-out', label: 'Zoom out', onClick: function() { props.ee && props.ee.emit('zoomout') } },
    { key: 'edit', label: 'Edit menu', onClick: props.onFocusEdit },
    { key: 'process', label: 'Process menu', onClick: props.onFocusProcess },
    { key: 'export', label: 'Export…', onClick: props.onOpenExport },
    { key: 'settings', label: 'Audio settings…', onClick: props.onOpenSettings },
    { key: 'help', label: 'Help', onClick: function() { setShowHelp(true) } },
  ]

  return (
    <>
      <div className={'scratchpad-audio-toolbar scratchpad-audio-toolbar--' + tier} role="toolbar" aria-label="Audio editor tools">
        <ScratchpadAudioToolbarGroup label="Playback" compact={compact}>
          <ScratchpadAudioTransport
            icons={icons}
            ee={props.ee}
            isPlaying={props.isPlaying}
            currentTime={props.currentTime}
            duration={props.duration}
            formatTime={props.formatTime}
            onPlayPause={props.onPlayPause}
            onStop={props.onStop}
            compact={compact}
            hideZoom={narrow}
          />
        </ScratchpadAudioToolbarGroup>

        <ScratchpadAudioToolbarGroup label="Record" compact={compact}>
          <ScratchpadAudioMetronomeControls
            icons={icons}
            narrow={narrow}
            tempo={props.tempo}
            countInBars={props.countInBars}
            rhythmConfig={props.rhythmConfig}
            metronomeEnabled={props.metronomeEnabled}
            metronomeDuringPlayback={props.metronomeDuringPlayback}
            metronomeDuringRecording={props.metronomeDuringRecording}
            onMetronomeEnabledChange={props.onMetronomeEnabledChange}
            onCountInChange={props.onCountInChange}
            onTempoChange={props.onTempoChange}
            onRhythmConfigChange={props.onRhythmConfigChange}
            onMetronomeDuringPlaybackChange={props.onMetronomeDuringPlaybackChange}
            onMetronomeDuringRecordingChange={props.onMetronomeDuringRecordingChange}
          />
          <ButtonGroup size="sm">
            <Button
              variant={props.isRecording ? 'danger' : 'outline-danger'}
              title="Record on armed track"
              disabled={!props.armedTrackId}
              onClick={props.onRecord}
            >
              {icons.record || icons.mic || 'Record'}
            </Button>
          </ButtonGroup>
          {!narrow ? (
            <ScratchpadAudioRecordSettings
              tempo={props.tempo}
              countInBars={props.countInBars}
              punchInEnabled={props.punchInEnabled}
              recordMode={props.recordMode}
              onTempoChange={props.onTempoChange}
              onCountInChange={props.onCountInChange}
              rhythmConfig={props.rhythmConfig}
              onRhythmConfigChange={props.onRhythmConfigChange}
              onPunchInChange={props.onPunchInChange}
              onRecordModeChange={props.onRecordModeChange}
              onOpenSettings={props.onOpenSettings}
              snapToGrid={props.snapToGrid}
              onSnapChange={props.onSnapChange}
            />
          ) : null}
        </ScratchpadAudioToolbarGroup>

        {!narrow ? (
          <>
            <ScratchpadAudioToolbarGroup label="Edit" compact={compact}>
              <ScratchpadAudioEditModes
                icons={icons}
                mode={props.editMode}
                ee={props.ee}
                hasSelection={props.hasSelection}
                canPaste={props.canPaste}
                onModeChange={props.onEditModeChange}
                onTrim={props.onTrim}
                onCut={props.onCut}
                onCopy={props.onCopy}
                onPaste={props.onPaste}
                onDelete={props.onDelete}
                onSilence={props.onSilence}
                onReverse={props.onReverse}
                onInvert={props.onInvert}
                onSplit={props.onSplit}
                onAlignStart={props.onAlignStart}
                onAlignEnd={props.onAlignEnd}
                onAlignTogether={props.onAlignTogether}
                onInsertAudio={props.onInsertAudio}
              />
            </ScratchpadAudioToolbarGroup>

            <ScratchpadAudioToolbarGroup label="Process" compact={compact}>
              <ScratchpadAudioProcessMenu
                canApply={props.hasContent}
                onApplyEffect={props.onApplyEffect}
                stemBusy={props.stemBusy}
                canSeparate={props.canSeparate}
                onSeparateStems={props.onSeparateStems}
                trimSuggestion={props.trimSuggestion}
                trimming={props.trimming}
                onAutoTrim={props.onAutoTrim}
                onAddMarker={props.onAddMarker}
                onAnalyze={props.onAnalyze}
                onGenerate={props.onGenerate}
                spectrogramVisible={props.spectrogramVisible}
                onToggleSpectrogram={props.onToggleSpectrogram}
                macroSteps={props.macroSteps}
                onRunMacro={props.onRunMacro}
                onRealtimeFx={props.onRealtimeFx}
                icons={icons}
              />
            </ScratchpadAudioToolbarGroup>

            <ScratchpadAudioToolbarGroup label="Export" compact={compact}>
              <ScratchpadAudioExportGroup
                isSaving={props.isSaving}
                onMix={props.onMix}
                onDownload={props.onOpenExport}
              />
            </ScratchpadAudioToolbarGroup>

            <ScratchpadAudioToolbarGroup compact={compact}>
              <Button
                size="sm"
                variant="outline-secondary"
                onClick={function() { setShowHelp(true) }}
                title="Audio editor help"
                aria-label="Audio editor help"
              >
                {icons.question || '?'}
              </Button>
            </ScratchpadAudioToolbarGroup>
          </>
        ) : (
          <ScratchpadAudioToolbarGroup compact={compact}>
            <ScratchpadAudioToolbarOverflow items={overflowItems} />
          </ScratchpadAudioToolbarGroup>
        )}
      </div>

      <ScratchpadAudioEditorHelpModal
        show={showHelp}
        onHide={function() { setShowHelp(false) }}
      />
    </>
  )
}
