import { useState } from 'react';
import { Button, ButtonGroup, Dropdown } from 'react-bootstrap';
import {
  EDITOR_VIEW_MODES,
  normalizeEditorViewMode,
  getEditorViewModeLabel,
  viewModeToDisplayFlags,
  displayFlagsToViewMode,
  getAvailableDisplayFlags,
  resolveDisplayFlagsForTune,
} from '../viewModeUtils';
import { voiceDisplayLabel } from '../notation/notationDisplayAbc';
import {
  getTuneVoiceKeys,
  getVoiceViewSettings,
  setVoiceViewSettings,
} from '../abcVoiceViewSettings';
import { tuneHasExplicitChords } from '../timedLyricsChordsDisplay';
import useAbcjsParser from '../useAbcjsParser';
import { useIsNarrowViewport } from '../useMediaQuery';
import DisplayModeControls from './DisplayModeControls';
import { NOTATION_FIT_VERTICAL } from '../gigNotationFit';

function NotationFitButton(props) {
  const { tunebook, fitMode, onChange, stopMenuClose, className } = props;
  const vertical = fitMode === NOTATION_FIT_VERTICAL;
  const label = vertical ? 'Fit notation to page width' : 'Fit notation to page height';

  function stop(e) {
    if (!stopMenuClose) return;
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <Button
      size="sm"
      variant={vertical ? 'primary' : 'outline-secondary'}
      className={'notation-fit-btn' + (className ? ' ' + className : '')}
      aria-label={label}
      title={label}
      aria-pressed={vertical}
      onMouseDown={stop}
      onClick={function(e) {
        stop(e);
        if (onChange) {
          onChange(vertical ? 'horizontal' : NOTATION_FIT_VERTICAL);
        }
      }}
    >
      <span className="notation-fit-btn-icon">{tunebook.icons.fitvertical}</span>
      <span className="notation-fit-btn-label">Fit height</span>
    </Button>
  );
}

function renderEditorModeIcon(modeId, tunebook) {
  if (modeId === 'music') return tunebook.icons.music;
  if (modeId === 'pianoRoll') return tunebook.icons.pianoroll;
  if (modeId === 'notationAbc') return tunebook.icons.music;
  if (modeId === 'sourceAbc') return tunebook.icons.filelist;
  if (modeId === 'chords') return tunebook.icons.guitar;
  if (modeId === 'info') return tunebook.icons.question;
  if (modeId === 'lyrics') return tunebook.icons.quillpen;
  return null;
}

function ViewModeVoiceControls(props) {
  const { tune, tuneId, onChange, inline } = props;
  const voiceKeys = getTuneVoiceKeys(tune);

  if (!tuneId || voiceKeys.length <= 1) return null;

  const settings = getVoiceViewSettings(tuneId, voiceKeys);

  function toggleVoice(voiceKey) {
    const currentlyOn = settings.visible[voiceKey] !== false;
    const nextVisible = Object.assign({}, settings.visible);
    nextVisible[voiceKey] = !currentlyOn;
    const anyOn = voiceKeys.some(function(key) { return nextVisible[key] !== false; });
    if (!anyOn) return;
    const nextPlayable = Object.assign({}, settings.playable);
    voiceKeys.forEach(function(key) {
      nextPlayable[key] = nextVisible[key] !== false;
    });
    const saved = setVoiceViewSettings(tuneId, {
      visible: nextVisible,
      playable: nextPlayable,
    }, voiceKeys);
    if (onChange) onChange(saved);
  }

  return (
    <div
      className={'view-mode-voice-controls' + (inline ? ' view-mode-voice-controls--inline' : '')}
      onClick={function(e) { e.stopPropagation(); }}
      onMouseDown={function(e) { e.preventDefault(); e.stopPropagation(); }}
    >
      {!inline ? <div className="view-mode-voice-header">Voices</div> : null}
      <ButtonGroup size="sm" className="view-mode-voice-btn-group" aria-label="Voices">
        {inline ? (
          <Button
            variant="light"
            size="sm"
            className="view-mode-voice-group-label"
            disabled
            tabIndex={-1}
            aria-hidden="true"
          >
            Voices
          </Button>
        ) : null}
        {voiceKeys.map(function(voiceKey) {
          const label = voiceDisplayLabel(tune, voiceKey);
          const active = settings.visible[voiceKey] !== false;
          return (
            <Button
              key={voiceKey}
              variant={active ? 'primary' : 'outline-secondary'}
              className="view-mode-voice-btn"
              aria-label={active ? 'Hide ' + label : 'Show ' + label}
              title={label}
              aria-pressed={active}
              onClick={function(e) {
                e.preventDefault();
                e.stopPropagation();
                toggleVoice(voiceKey);
              }}
            >
              {label}
            </Button>
          );
        })}
      </ButtonGroup>
    </div>
  );
}

function DisplayModeToolbar(props) {
  const {
    displayFlags,
    available,
    tune,
    tunebook,
    onFlagsChange,
    onVoiceSettingsChange,
    notationFitMode,
    onNotationFitModeChange,
    className,
    hideInlineVoiceControls,
    separateInlineFitButton,
  } = props;

  const notationOn = displayFlags && displayFlags.notation !== 'off';

  return (
    <div
      className={'display-mode-toolbar' + (className ? ' ' + className : '')}
      aria-label="View options"
    >
      <DisplayModeControls
        flags={displayFlags}
        available={available}
        tunebook={tunebook}
        onChange={onFlagsChange}
      />
      {notationOn && !hideInlineVoiceControls ? (
        <ViewModeVoiceControls
          inline
          tune={tune}
          tuneId={tune && tune.id}
          tunebook={tunebook}
          onChange={onVoiceSettingsChange}
        />
      ) : null}
      {notationOn && onNotationFitModeChange && !separateInlineFitButton ? (
        <NotationFitButton
          tunebook={tunebook}
          fitMode={notationFitMode}
          onChange={onNotationFitModeChange}
        />
      ) : null}
    </div>
  );
}

function EditorViewModeToolbar(props) {
  const { currentMode, tunebook, onSelect, className } = props;

  return (
    <ButtonGroup
      className={'editor-view-mode-toolbar' + (className ? ' ' + className : '')}
      aria-label="Editor view"
    >
      {EDITOR_VIEW_MODES.map(function(mode) {
        const active = currentMode === mode.id;
        const icon = renderEditorModeIcon(mode.id, tunebook);
        return (
          <Button
            key={mode.id}
            variant={active ? 'primary' : 'outline-secondary'}
            className="editor-view-mode-btn"
            aria-label={mode.label}
            title={mode.label}
            aria-pressed={active}
            onClick={function() { onSelect(mode.id); }}
          >
            {icon ? <span className="editor-view-mode-btn-icon">{icon}</span> : null}
            <span className="editor-view-mode-btn-label">{mode.label}</span>
          </Button>
        );
      })}
    </ButtonGroup>
  );
}

export default function ViewModeSelectorModal(props) {
  const [show, setShow] = useState(false);
  const isEditor = props.variant === 'editor';
  const isNarrowViewport = useIsNarrowViewport();
  const abcjsParser = useAbcjsParser({ tunebook: props.tunebook });
  const hasChords = !isEditor && !!props.tune
    && tuneHasExplicitChords(props.tune, props.tunebook, abcjsParser);
  const hasInfo = !isEditor && !!props.tune
    && typeof props.tune.backgroundInfo === 'string'
    && !!props.tune.backgroundInfo.trim();
  const available = !isEditor
    ? getAvailableDisplayFlags(props.tune, props.tunebook, { hasChords: hasChords, hasInfo: hasInfo })
    : null;
  const displayFlags = !isEditor
    ? resolveDisplayFlagsForTune(
      viewModeToDisplayFlags(props.viewMode),
      props.tune,
      props.tunebook,
      { hasChords: hasChords }
    )
    : null;
  const currentMode = isEditor
    ? normalizeEditorViewMode(props.viewMode)
    : displayFlagsToViewMode(displayFlags);
  const label = isEditor ? getEditorViewModeLabel(currentMode) : null;
  const toggleIcon = isEditor
    ? renderEditorModeIcon(currentMode, props.tunebook)
    : props.tunebook.icons.eye;
  const forceDropdown = !!props.forceDropdown;
  const useEditorToolbar = isEditor && !isNarrowViewport;
  const useDisplayToolbar = !isEditor && !isNarrowViewport && !forceDropdown;
  const separateInlineFitButton = !isEditor && !!props.separateInlineFitButton;
  const showSeparateInlineFitButton = separateInlineFitButton
    && displayFlags
    && displayFlags.notation !== 'off'
    && !!props.onNotationFitModeChange;

  function handleSelect(modeId) {
    props.onChange(modeId);
    setShow(false);
    if (props.closeParent) props.closeParent();
  }

  function handleFlagsChange(nextFlags) {
    const nextMode = displayFlagsToViewMode(nextFlags);
    if (nextMode === currentMode) return;
    props.onChange(nextMode);
  }

  if (useEditorToolbar) {
    return (
      <EditorViewModeToolbar
        className={props.className}
        currentMode={currentMode}
        tunebook={props.tunebook}
        onSelect={handleSelect}
      />
    );
  }

  if (useDisplayToolbar) {
    return (
      <>
        <DisplayModeToolbar
          className={props.className}
          displayFlags={displayFlags}
          available={available}
          tune={props.tune}
          tunebook={props.tunebook}
          onFlagsChange={handleFlagsChange}
          onVoiceSettingsChange={props.onVoiceSettingsChange}
          notationFitMode={props.notationFitMode}
          onNotationFitModeChange={props.onNotationFitModeChange}
          hideInlineVoiceControls={props.hideInlineVoiceControls}
          separateInlineFitButton={separateInlineFitButton}
        />
        {showSeparateInlineFitButton ? (
          <NotationFitButton
            className="display-mode-toolbar-fit"
            tunebook={props.tunebook}
            fitMode={props.notationFitMode}
            onChange={props.onNotationFitModeChange}
          />
        ) : null}
      </>
    );
  }

  return (
    <Dropdown
      show={show}
      onToggle={function(next) { setShow(next); }}
      autoClose={isEditor ? true : 'outside'}
      align="end"
      className={(props.className ? props.className + ' ' : '') + (isEditor ? 'editor-view-mode-selector' : 'view-mode-selector')}
    >
      <Dropdown.Toggle
        variant="secondary"
        id={isEditor ? 'editor-view-mode-dropdown' : 'view-mode-dropdown'}
        aria-label={isEditor ? (label || 'View') : 'View options'}
        title={isEditor ? (label || 'View') : 'View options'}
      >
        {toggleIcon}
        {label ? <span className="view-mode-label">{label}</span> : null}
      </Dropdown.Toggle>
      <Dropdown.Menu
        className={isEditor ? '' : 'view-mode-selector-menu'}
        popperConfig={isEditor ? undefined : {
          strategy: 'fixed',
          modifiers: [
            {
              name: 'preventOverflow',
              options: { boundary: 'viewport', padding: 8, altAxis: true },
            },
            {
              name: 'flip',
              options: { fallbackPlacements: ['top-end', 'bottom-start', 'top-start'] },
            },
          ],
        }}
      >
        {isEditor ? (
          EDITOR_VIEW_MODES.map(function(mode) {
            const icon = renderEditorModeIcon(mode.id, props.tunebook);
            return (
              <Dropdown.Item
                key={mode.id}
                active={currentMode === mode.id}
                onClick={function() { handleSelect(mode.id); }}
              >
                <span className="view-mode-item-icon">{icon}</span>
                {mode.label}
              </Dropdown.Item>
            );
          })
        ) : (
          <div className="view-mode-display-panel px-2 py-2">
            <DisplayModeControls
              className="display-mode-controls--stacked"
              flags={displayFlags}
              available={available}
              tunebook={props.tunebook}
              onChange={handleFlagsChange}
              stopMenuClose={true}
            />
            {displayFlags.notation !== 'off' && getTuneVoiceKeys(props.tune).length > 1 ? (
              <>
                <Dropdown.Divider />
                <ViewModeVoiceControls
                  tune={props.tune}
                  tuneId={props.tune && props.tune.id}
                  tunebook={props.tunebook}
                  onChange={props.onVoiceSettingsChange}
                />
              </>
            ) : null}
            {props.extraMenuContent ? (
              <>
                <Dropdown.Divider />
                <div
                  className="view-mode-extra-menu-content"
                  onClick={function(e) { e.stopPropagation(); }}
                  onMouseDown={function(e) { e.stopPropagation(); }}
                >
                  {props.extraMenuContent}
                </div>
              </>
            ) : null}
            {displayFlags.notation !== 'off' && props.onNotationFitModeChange ? (
              <>
                <Dropdown.Divider />
                <NotationFitButton
                  className="notation-fit-btn--menu"
                  tunebook={props.tunebook}
                  fitMode={props.notationFitMode}
                  onChange={props.onNotationFitModeChange}
                  stopMenuClose={true}
                />
              </>
            ) : null}
          </div>
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
}
