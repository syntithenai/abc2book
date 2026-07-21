import { useState } from 'react'
import { Button, ButtonGroup, Dropdown } from 'react-bootstrap'
import {
  TAB_DISPLAY_OPTIONS,
  applyTabDisplay,
  getTabDisplay,
  getTablatureSelection,
  tabInstrumentLabel,
} from '../tablatureConfig'
import TablatureSettingsModal, { tablatureSettingsSummary } from './TablatureSettingsModal'

export default function TablatureSelector(props) {
  const { tune, tunebook, onChange, variant, stopMenuClose, className } = props
  const [showModal, setShowModal] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  if (!tune) return null

  const selection = getTablatureSelection(tune)
  const tabActive = !!selection.instrumentId
  const tabDisplay = getTabDisplay(tune)
  const buttonText = tabActive ? tabInstrumentLabel(selection.instrumentId) : 'Tablature'
  const buttonTitle = tabActive
    ? ('Tablature: ' + tablatureSettingsSummary(tune))
    : 'Set tablature instrument and tuning'

  function stop(e) {
    if (!stopMenuClose) return
    e.preventDefault()
    e.stopPropagation()
  }

  function openModal(e) {
    stop(e)
    setShowMenu(false)
    setShowModal(true)
  }

  function turnOff(e) {
    stop(e)
    setShowMenu(false)
    tune.tablature = ''
    tune.tabDisplay = ''
    if (tune.id && tunebook && tunebook.saveTune) {
      tunebook.saveTune(tune)
    }
    if (onChange) onChange('')
  }

  function setDisplayMode(e, mode) {
    stop(e)
    setShowMenu(false)
    applyTabDisplay(tune, mode)
    if (tune.id && tunebook && tunebook.saveTune) {
      tunebook.saveTune(tune)
    }
    if (onChange) onChange(tune.tablature || '')
  }

  const blockClass = 'tablature-selector-block'
    + (variant === 'menu' ? ' tablature-selector-block--menu' : '')
    + (className ? ' ' + className : '')

  return (
    <div
      className={blockClass}
      onClick={stop}
      onMouseDown={stop}
    >
      <Dropdown
        as={ButtonGroup}
        show={showMenu}
        onToggle={function(next) { setShowMenu(next) }}
        align="end"
      >
        <Button
          size="sm"
          variant={tabActive ? 'primary' : 'outline-secondary'}
          className="tablature-selector-btn"
          aria-label={buttonTitle}
          title={buttonTitle}
          onClick={openModal}
        >
          {buttonText}
        </Button>
        <Dropdown.Toggle
          split
          size="sm"
          variant={tabActive ? 'primary' : 'outline-secondary'}
          className="tablature-selector-toggle"
          aria-label="Tablature options"
        />
        <Dropdown.Menu
          className="tablature-selector-menu"
          popperConfig={{ strategy: 'fixed' }}
        >
          <Dropdown.Item onClick={openModal}>
            Choose instrument and tuning…
          </Dropdown.Item>
          {tabActive ? (
            <>
              <Dropdown.Divider />
              {TAB_DISPLAY_OPTIONS.map(function(option) {
                const active = tabDisplay === option.value
                return (
                  <Dropdown.Item
                    key={option.value}
                    active={active}
                    onClick={function(e) { setDisplayMode(e, option.value) }}
                  >
                    {option.label}
                  </Dropdown.Item>
                )
              })}
              <Dropdown.Divider />
              <Dropdown.Item onClick={turnOff}>
                Turn off tablature
              </Dropdown.Item>
            </>
          ) : null}
        </Dropdown.Menu>
      </Dropdown>

      <TablatureSettingsModal
        show={showModal}
        onHide={function() { setShowModal(false) }}
        tune={tune}
        tunebook={tunebook}
        onApply={function() {
          if (onChange) onChange(tune.tablature || '')
        }}
      />
    </div>
  )
}
