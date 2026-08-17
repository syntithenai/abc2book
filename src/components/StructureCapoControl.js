import { useEffect, useMemo, useState } from 'react'
import { Button, ButtonGroup, Dropdown, Form } from 'react-bootstrap'
import { buildCapoQuickOptions, clampCapoOffset } from '../capoViewUtils'

/**
 * Capo toggle with quick shape picks (C / G / D) and custom fret input.
 */
export default function StructureCapoControl(props) {
  const {
    capoOffset,
    capoEnabled,
    onToggle,
    onOffsetChange,
    tune,
    chordGridText,
    className,
  } = props

  const [customValue, setCustomValue] = useState(String(capoOffset || ''))

  const quickOptions = useMemo(function() {
    return buildCapoQuickOptions(tune, chordGridText)
  }, [tune, chordGridText])

  useEffect(function() {
    setCustomValue(String(capoOffset || ''))
  }, [capoOffset])

  function applyOffset(offset) {
    const next = clampCapoOffset(offset)
    setCustomValue(String(next))
    if (typeof onOffsetChange === 'function') onOffsetChange(next)
  }

  function commitCustomValue() {
    applyOffset(customValue)
  }

  const mainLabel = capoEnabled && capoOffset > 0 ? 'Capo ' + capoOffset : 'Capo'
  const mainTitle = capoEnabled
    ? 'Show transposed chords'
    : 'Show capo fingering'

  return (
    <Dropdown as={ButtonGroup} className={'structure-capo-control' + (className ? ' ' + className : '')}>
      <Button
        size="sm"
        variant={capoEnabled ? 'primary' : 'outline-secondary'}
        className="structure-capo-toggle-btn"
        aria-pressed={capoEnabled}
        aria-label={mainLabel + (capoEnabled ? ' on' : ' off')}
        title={mainTitle}
        onClick={function() {
          if (typeof onToggle === 'function') onToggle()
        }}
      >
        {mainLabel}
      </Button>
      <Dropdown.Toggle
        split
        variant={capoEnabled ? 'primary' : 'outline-secondary'}
        size="sm"
        aria-label="Capo options"
        className="structure-capo-menu-toggle"
      />
      <Dropdown.Menu
        align="end"
        className="structure-capo-menu"
        popperConfig={{ strategy: 'fixed' }}
      >
        <Dropdown.Header>Guitar shapes</Dropdown.Header>
        {quickOptions.map(function(option) {
          const active = capoEnabled && capoOffset === option.offset
          return (
            <Dropdown.Item
              key={option.shapeKey}
              active={active}
              onClick={function() { applyOffset(option.offset) }}
            >
              <span className="structure-capo-menu-label">{option.label}</span>
              <span className="structure-capo-menu-detail">{option.detail}</span>
            </Dropdown.Item>
          )
        })}
        <Dropdown.Divider />
        <div
          className="structure-capo-custom px-3 py-2"
          onClick={function(e) { e.stopPropagation() }}
        >
          <Form.Label className="structure-capo-custom-label small mb-1">Capo fret</Form.Label>
          <div className="structure-capo-custom-row">
            <Form.Control
              type="number"
              size="sm"
              min={0}
              max={12}
              value={customValue}
              aria-label="Capo fret"
              onChange={function(e) { setCustomValue(e.target.value) }}
              onKeyDown={function(e) {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitCustomValue()
                }
              }}
            />
            <Button size="sm" variant="outline-secondary" onClick={commitCustomValue}>
              Set
            </Button>
          </div>
        </div>
      </Dropdown.Menu>
    </Dropdown>
  )
}
