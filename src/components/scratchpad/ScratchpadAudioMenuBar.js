import { useState } from 'react'
import { Dropdown } from 'react-bootstrap'
import ScratchpadAudioEditModes from './ScratchpadAudioEditModes'
import ScratchpadAudioProcessMenu from './ScratchpadAudioProcessMenu'
import ScratchpadAudioExportGroup from './ScratchpadAudioExportGroup'
import ScratchpadAudioEditorHelpModal from './ScratchpadAudioEditorHelpModal'
import { SCRATCHPAD_DROPDOWN_POPPER } from '../../scratchpadDropdownPopper'

export default function ScratchpadAudioMenuBar(props) {
  const [showHelp, setShowHelp] = useState(false)

  return (
    <>
      <div className="scratchpad-audio-menu-bar" role="menubar" aria-label="Audio editor menus">
        <ScratchpadAudioEditModes
          menuBar={true}
          icons={props.icons}
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

        <ScratchpadAudioProcessMenu
          menuBar={true}
          user={props.user}
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
          icons={props.icons}
        />

        <ScratchpadAudioExportGroup
          menuBar={true}
          isSaving={props.isSaving}
          onMix={props.onMix}
          onDownload={props.onOpenExport}
        />

        <Dropdown className="scratchpad-audio-menu-bar-item">
          <Dropdown.Toggle variant="link" size="sm" className="scratchpad-audio-menu-bar-toggle">
            View
          </Dropdown.Toggle>
          <Dropdown.Menu popperConfig={SCRATCHPAD_DROPDOWN_POPPER}>
            <Dropdown.Item onClick={props.onToggleSpectrogram}>
              {props.spectrogramVisible ? 'Hide spectrogram' : 'Show spectrogram'}
            </Dropdown.Item>
            <Dropdown.Item disabled={!props.hasSelection} onClick={props.onZoomToSelection}>
              Zoom to selection
            </Dropdown.Item>
            {props.selectionBarCompact ? (
              <Dropdown.Item onClick={props.onExpandSelectionBar}>
                Show selection details
              </Dropdown.Item>
            ) : null}
            <Dropdown.Divider />
            <Dropdown.Item
              active={!!props.advancedFeatures}
              onClick={function() {
                if (props.onAdvancedFeaturesChange) {
                  props.onAdvancedFeaturesChange(!props.advancedFeatures)
                }
              }}
            >
              {props.advancedFeatures ? '✓ ' : ''}Advanced features (MIDI)
            </Dropdown.Item>
            <Dropdown.Divider />
            <Dropdown.Item onClick={function() { setShowHelp(true) }}>Help…</Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </div>

      <ScratchpadAudioEditorHelpModal
        show={showHelp}
        onHide={function() { setShowHelp(false) }}
      />
    </>
  )
}
