import { useEffect, useState } from 'react'
import { Button, Form, Modal } from 'react-bootstrap'
import { useResponsiveModalProps } from '../useResponsiveModalProps'
import {
  ENHANCE_OPTION_GROUPS,
  createEmptyEnhanceSelection,
  filterEnhanceSelectionByAvailability,
  hasAnyEnhanceSelection,
  isEnhanceOptionAvailable,
  enhanceOptionUnavailableReason,
  setEnhanceGroupSelection,
} from '../enhanceOptions'

function audioGroupDisabled(availabilityContext) {
  return !!(availabilityContext && availabilityContext.hasScannableLinkedMedia === false)
}

export function EnhanceOptionsMenu({
  selection,
  onToggleOption,
  onSetGroup,
  onStart,
  idPrefix,
  availabilityContext,
  mediaSources,
  selectedMediaLinkIndex,
  onMediaLinkIndexChange,
}) {
  const prefix = idPrefix || 'enhance'
  const canStart = hasAnyEnhanceSelection(selection, availabilityContext)
  const sources = Array.isArray(mediaSources) ? mediaSources : []
  const showMediaSourcePicker = sources.length > 1 && !audioGroupDisabled(availabilityContext)

  return (
    <div
      className="enhance-options-menu"
      data-testid="enhance-options-menu"
    >
      <div className="enhance-options-actions">
        <Button
          type="button"
          variant="warning"
          className="enhance-options-start"
          data-testid="enhance-start"
          disabled={!canStart}
          onClick={function() {
            if (!canStart) return
            onStart()
          }}
        >
          Start Enhancement
        </Button>
      </div>
      {ENHANCE_OPTION_GROUPS.map(function(group) {
        const groupUnavailable = group.id === 'audio' && audioGroupDisabled(availabilityContext)
        return (
          <div
            key={group.id}
            className={'enhance-options-group' + (groupUnavailable ? ' enhance-options-group--disabled' : '')}
            data-testid={'enhance-group-' + group.id}
          >
            <div className="enhance-options-group-header">
              <span className="enhance-options-group-label">{group.label}</span>
              <span className="enhance-options-group-actions">
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="enhance-options-group-select"
                  data-testid={'enhance-group-' + group.id + '-all'}
                  disabled={groupUnavailable}
                  onClick={function() { onSetGroup(group.id, true) }}
                >
                  All
                </Button>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="enhance-options-group-select"
                  data-testid={'enhance-group-' + group.id + '-none'}
                  disabled={groupUnavailable}
                  onClick={function() { onSetGroup(group.id, false) }}
                >
                  None
                </Button>
              </span>
            </div>
            {group.id === 'audio' && groupUnavailable ? (
              <div className="enhance-options-group-note" data-testid="enhance-audio-unavailable">
                No linked media to analyze (MIDI-only links are excluded).
              </div>
            ) : null}
            {group.id === 'audio' && showMediaSourcePicker ? (
              <Form.Group className="enhance-options-media-source" controlId={prefix + '-media-source'}>
                <Form.Label>Media source</Form.Label>
                <Form.Select
                  size="sm"
                  data-testid="enhance-media-source"
                  value={selectedMediaLinkIndex == null ? String(sources[0].linkIndex) : String(selectedMediaLinkIndex)}
                  onChange={function(e) {
                    if (typeof onMediaLinkIndexChange === 'function') {
                      onMediaLinkIndexChange(Number(e.target.value))
                    }
                  }}
                >
                  {sources.map(function(source) {
                    return (
                      <option key={source.id || source.linkIndex} value={String(source.linkIndex)}>
                        {source.label || ('Linked media ' + (source.linkIndex + 1))}
                      </option>
                    )
                  })}
                </Form.Select>
              </Form.Group>
            ) : null}
            {group.options.map(function(option) {
              // No context → do not gate (call sites always pass health when known).
              const available = !availabilityContext
                || isEnhanceOptionAvailable(option.id, availabilityContext)
              const unavailableReason = available || !availabilityContext
                ? ''
                : enhanceOptionUnavailableReason(option.id, availabilityContext)
              return (
                <Form.Check
                  key={option.id}
                  type="checkbox"
                  id={prefix + '-option-' + option.id}
                  className="enhance-options-check"
                  data-testid={'enhance-option-' + option.id}
                  label={option.label}
                  checked={!!(selection && selection[option.id])}
                  disabled={!available}
                  title={unavailableReason || undefined}
                  onChange={function(e) {
                    if (!available) return
                    onToggleOption(option.id, e.target.checked)
                  }}
                />
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Button that opens a dialog to pick and start information enhancements.
 */
export default function EnhanceOptionsDropdown({
  id,
  className,
  toggleClassName,
  toggleLabel,
  labelClassName,
  hideLabel,
  icons,
  disabled,
  title,
  onStart,
  onOpen,
  availabilityContext,
  mediaSources,
}) {
  const [show, setShow] = useState(false)
  const [selection, setSelection] = useState(createEmptyEnhanceSelection)
  const [selectedMediaLinkIndex, setSelectedMediaLinkIndex] = useState(null)
  const responsiveModalProps = useResponsiveModalProps()
  const dialogTitle = title || 'Enhance'
  const sources = Array.isArray(mediaSources) ? mediaSources : []

  useEffect(function() {
    if (!sources.length) {
      setSelectedMediaLinkIndex(null)
      return
    }
    setSelectedMediaLinkIndex(function(prev) {
      if (prev != null && sources.some(function(source) { return source.linkIndex === prev })) {
        return prev
      }
      return sources[0].linkIndex
    })
  }, [sources])

  function handleToggleOption(optionId, checked) {
    if (availabilityContext && !isEnhanceOptionAvailable(optionId, availabilityContext)) {
      return
    }
    setSelection(function(prev) {
      const next = Object.assign({}, prev)
      next[optionId] = !!checked
      return next
    })
  }

  function handleSetGroup(groupId, checked) {
    setSelection(function(prev) {
      return setEnhanceGroupSelection(prev, groupId, checked, availabilityContext)
    })
  }

  function handleClose() {
    setShow(false)
  }

  function handleShow(e) {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    if (disabled) return
    setSelection(createEmptyEnhanceSelection())
    if (sources.length) setSelectedMediaLinkIndex(sources[0].linkIndex)
    setShow(true)
    if (typeof onOpen === 'function') onOpen()
  }

  function handleStart() {
    const current = filterEnhanceSelectionByAvailability(selection, availabilityContext)
    if (!hasAnyEnhanceSelection(current)) return
    if (typeof onStart === 'function') {
      onStart(current, {
        audioLinkIndex: sources.length ? selectedMediaLinkIndex : null,
      })
    }
    setSelection(createEmptyEnhanceSelection())
    setShow(false)
  }

  return (
    <span className={className || undefined}>
      <Button
        type="button"
        variant="warning"
        className={toggleClassName || ''}
        id={id}
        disabled={!!disabled}
        aria-label={dialogTitle}
        title={dialogTitle}
        data-testid="enhance-dropdown-toggle"
        onClick={handleShow}
      >
        {icons && icons.search ? icons.search : null}
        {!hideLabel ? (
          <span className={labelClassName || (toggleLabel ? 'bulk-ops-btn-label' : undefined)}>
            {toggleLabel || ' Enhance'}
          </span>
        ) : null}
      </Button>

      <Modal
        show={show}
        onHide={handleClose}
        onClick={function(e) { e.stopPropagation() }}
        className="enhance-options-modal"
        {...responsiveModalProps}
      >
        <Modal.Header closeButton>
          <Modal.Title>{dialogTitle}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="enhance-options-modal-body">
          <EnhanceOptionsMenu
            selection={selection}
            onToggleOption={handleToggleOption}
            onSetGroup={handleSetGroup}
            onStart={handleStart}
            idPrefix={id || 'enhance'}
            availabilityContext={availabilityContext}
            mediaSources={sources}
            selectedMediaLinkIndex={selectedMediaLinkIndex}
            onMediaLinkIndexChange={setSelectedMediaLinkIndex}
          />
        </Modal.Body>
      </Modal>
    </span>
  )
}
