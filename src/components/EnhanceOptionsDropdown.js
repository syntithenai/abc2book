import { useState } from 'react'
import { Button, ButtonGroup, Dropdown, Form } from 'react-bootstrap'
import {
  ENHANCE_OPTION_GROUPS,
  createEmptyEnhanceSelection,
  hasAnyEnhanceSelection,
  setEnhanceGroupSelection,
} from '../enhanceOptions'

function stopMenuClose(e) {
  if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
}

function stopMenuCloseAndDefault(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault()
  stopMenuClose(e)
}

export function EnhanceOptionsMenu({
  selection,
  onToggleOption,
  onSetGroup,
  onStart,
  idPrefix,
}) {
  const prefix = idPrefix || 'enhance'
  const canStart = hasAnyEnhanceSelection(selection)

  return (
    <div
      className="enhance-options-menu"
      data-testid="enhance-options-menu"
      onMouseDown={stopMenuClose}
      onClick={stopMenuClose}
    >
      {ENHANCE_OPTION_GROUPS.map(function(group) {
        return (
          <div
            key={group.id}
            className="enhance-options-group"
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
                  onMouseDown={stopMenuCloseAndDefault}
                  onClick={function(e) {
                    stopMenuCloseAndDefault(e)
                    onSetGroup(group.id, true)
                  }}
                >
                  All
                </Button>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="enhance-options-group-select"
                  data-testid={'enhance-group-' + group.id + '-none'}
                  onMouseDown={stopMenuCloseAndDefault}
                  onClick={function(e) {
                    stopMenuCloseAndDefault(e)
                    onSetGroup(group.id, false)
                  }}
                >
                  None
                </Button>
              </span>
            </div>
            {group.options.map(function(option) {
              return (
                <Form.Check
                  key={option.id}
                  type="checkbox"
                  id={prefix + '-option-' + option.id}
                  className="enhance-options-check"
                  data-testid={'enhance-option-' + option.id}
                  label={option.label}
                  checked={!!(selection && selection[option.id])}
                  onMouseDown={stopMenuClose}
                  onClick={stopMenuClose}
                  onChange={function(e) {
                    stopMenuClose(e)
                    onToggleOption(option.id, e.target.checked)
                  }}
                />
              )
            })}
          </div>
        )
      })}
      <div className="enhance-options-footer">
        <Button
          type="button"
          variant="warning"
          className="enhance-options-start"
          data-testid="enhance-start"
          disabled={!canStart}
          onMouseDown={stopMenuCloseAndDefault}
          onClick={function(e) {
            stopMenuCloseAndDefault(e)
            if (!canStart) return
            onStart()
          }}
        >
          Start Enhancement
        </Button>
      </div>
    </div>
  )
}

export default function EnhanceOptionsDropdown({
  id,
  className,
  toggleClassName,
  toggleLabel,
  icons,
  disabled,
  title,
  onStart,
}) {
  const [show, setShow] = useState(false)
  const [selection, setSelection] = useState(createEmptyEnhanceSelection)

  function handleToggleOption(optionId, checked) {
    setSelection(function(prev) {
      const next = Object.assign({}, prev)
      next[optionId] = !!checked
      return next
    })
  }

  function handleSetGroup(groupId, checked) {
    setSelection(function(prev) {
      return setEnhanceGroupSelection(prev, groupId, checked)
    })
  }

  function handleStart() {
    const current = Object.assign({}, selection)
    if (typeof onStart === 'function') onStart(current)
    setSelection(createEmptyEnhanceSelection())
    setShow(false)
  }

  return (
    <Dropdown
      as={ButtonGroup}
      className={className || ''}
      show={show}
      onToggle={function(nextShow) { setShow(!!nextShow) }}
      autoClose="outside"
    >
      <Dropdown.Toggle
        variant="warning"
        className={toggleClassName || ''}
        id={id}
        disabled={!!disabled}
        aria-label={title || 'Enhance'}
        title={title || 'Enhance'}
        data-testid="enhance-dropdown-toggle"
      >
        {icons && icons.search ? icons.search : null}
        {toggleLabel ? <span className="bulk-ops-btn-label">{toggleLabel}</span> : <> Enhance</>}
      </Dropdown.Toggle>
      <Dropdown.Menu className="enhance-options-dropdown-menu" popperConfig={{ strategy: 'fixed' }}>
        <EnhanceOptionsMenu
          selection={selection}
          onToggleOption={handleToggleOption}
          onSetGroup={handleSetGroup}
          onStart={handleStart}
          idPrefix={id || 'enhance'}
        />
      </Dropdown.Menu>
    </Dropdown>
  )
}
