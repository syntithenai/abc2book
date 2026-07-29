import { ButtonGroup, Dropdown } from 'react-bootstrap'
import ScratchpadAudioEffectsPanel from './ScratchpadAudioEffectsPanel'
import { GENERATORS } from '../../scratchpadAudioGenerate'
import { SCRATCHPAD_DROPDOWN_POPPER } from '../../scratchpadDropdownPopper'

export default function ScratchpadAudioProcessMenu(props) {
  const icons = props.icons || {}
  const trimSuggestion = props.trimSuggestion
  const trimming = !!props.trimming

  const toggleClass = props.menuBar ? 'scratchpad-audio-menu-bar-toggle' : undefined
  const toggleVariant = props.menuBar ? 'link' : 'outline-secondary'

  return (
    <Dropdown
      as={ButtonGroup}
      size="sm"
      className={'scratchpad-audio-tools-dropdown' + (props.menuBar ? ' scratchpad-audio-menu-bar-item' : '')}
    >
      <Dropdown.Toggle variant={toggleVariant} className={toggleClass}>Process</Dropdown.Toggle>
      <Dropdown.Menu popperConfig={SCRATCHPAD_DROPDOWN_POPPER}>
        <Dropdown.Item onClick={props.onAddMarker}>
          {icons.add || icons.plus || '+'} Add marker at playhead
        </Dropdown.Item>
        <Dropdown.Divider />
        <Dropdown.Header>Effects</Dropdown.Header>
        <ScratchpadAudioEffectsPanel
          canApply={props.canApply}
          onApply={props.onApplyEffect}
          triggerVariant="menuItem"
        />
        <Dropdown.Divider />
        <Dropdown.Header>Generate</Dropdown.Header>
        {GENERATORS.map(function(g) {
          return (
            <Dropdown.Item key={g.id} onClick={function() { props.onGenerate && props.onGenerate(g.id) }}>
              {g.label}
            </Dropdown.Item>
          )
        })}
        <Dropdown.Divider />
        <Dropdown.Header>Analyze</Dropdown.Header>
        <Dropdown.Item onClick={function() { props.onAnalyze && props.onAnalyze('rms') }}>Measure RMS / peak</Dropdown.Item>
        <Dropdown.Item onClick={function() { props.onAnalyze && props.onAnalyze('clipping') }}>Find clipping</Dropdown.Item>
        <Dropdown.Item onClick={function() { props.onAnalyze && props.onAnalyze('spectrum') }}>Plot spectrum</Dropdown.Item>
        <Dropdown.Item onClick={function() { props.onAnalyze && props.onAnalyze('labelSounds') }}>Label sounds</Dropdown.Item>
        <Dropdown.Item onClick={function() { props.onAnalyze && props.onAnalyze('beats') }}>Beat finder</Dropdown.Item>
        <Dropdown.Item onClick={props.onToggleSpectrogram}>
          {props.spectrogramVisible ? 'Hide spectrogram' : 'Show spectrogram'}
        </Dropdown.Item>
        <Dropdown.Divider />
        <Dropdown.Header>Automation</Dropdown.Header>
        <Dropdown.Item disabled={!props.macroSteps} onClick={props.onRunMacro}>
          Run macro ({props.macroSteps || 0} steps)
        </Dropdown.Item>
        <Dropdown.Item onClick={props.onRealtimeFx} disabled>
          Realtime FX (preview)
        </Dropdown.Item>
        <Dropdown.Divider />
        <Dropdown.Item
          disabled={props.stemBusy || !props.canSeparate}
          onClick={props.onSeparateStems}
        >
          {props.stemBusy ? 'Separating stems…' : 'Separate stems'}
        </Dropdown.Item>
        {trimSuggestion ? (
          <Dropdown.Item disabled={trimming} onClick={props.onAutoTrim}>
            {trimming ? 'Trimming…' : 'Auto-trim silence'}
          </Dropdown.Item>
        ) : null}
      </Dropdown.Menu>
    </Dropdown>
  )
}
