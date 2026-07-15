import { useState } from 'react'
import { Button, ButtonGroup } from 'react-bootstrap'
import FieldSearchModeDialog from './FieldSearchModeDialog'

const DEFAULT_SEARCH_ICON = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <path fill="none" d="M0 0h24v24H0z" />
    <path d="M18.031 16.617l4.283 4.282-1.415 1.415-4.282-4.283A8.96 8.96 0 0 1 11 20c-4.968 0-9-4.032-9-9s4.032-9 9-9 9 4.032 9 9a8.96 8.96 0 0 1-1.969 5.617zm-2.006-.742A6.977 6.977 0 0 0 18 11c0-3.868-3.133-7-7-7-3.868 0-7 3.132-7 7 0 3.867 3.132 7 7 7a6.977 6.977 0 0 0 4.875-1.975l.15-.15z" />
  </svg>
)

function renderSearchButton(props) {
  const {
    busy,
    disabled,
    narrow,
    onClick,
    buttonStyle,
    searchIcon,
  } = props
  const style = Object.assign({
    color: 'black',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35em',
    whiteSpace: 'nowrap',
  }, buttonStyle || {})
  const icon = searchIcon || DEFAULT_SEARCH_ICON
  const label = busy ? 'Cancel' : 'Search'
  return (
    <Button
      style={style}
      variant={busy ? 'warning' : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {!narrow && <span>{label}</span>}
    </Button>
  )
}

function renderExternalButton(props) {
  const { externalUrl, externalLinkIcon, buttonStyle } = props
  if (!externalLinkIcon || !externalUrl) return null
  const style = Object.assign({
    color: 'black',
    display: 'inline-flex',
    alignItems: 'center',
  }, buttonStyle || {})
  return (
    <Button
      as="a"
      href={externalUrl}
      target="_blank"
      rel="noreferrer"
      style={style}
    >
      {externalLinkIcon}
    </Button>
  )
}

/**
 * Search (+ optional external link) control.
 * When confirmSearchMode is true (default for automatic lookup), Search opens
 * Auto / Review / Cancel; onSearch receives 'auto' | 'review'.
 * When busy, Search cancels and calls onSearch() with no mode.
 */
export function FieldLookupButtonGroup(props) {
  const {
    automaticLookup,
    busy,
    disabled,
    externalUrl,
    externalLinkIcon,
    narrow,
    onSearch,
    buttonStyle,
    searchIcon,
    inline,
    confirmSearchMode = true,
    modeDialogTitle,
    modeDialogBody,
  } = props
  const [showModeDialog, setShowModeDialog] = useState(false)

  const style = Object.assign({ color: 'black' }, buttonStyle || {})
  const shared = {
    busy: busy,
    disabled: disabled,
    narrow: narrow,
    buttonStyle: buttonStyle,
    searchIcon: searchIcon,
    externalUrl: externalUrl,
    externalLinkIcon: externalLinkIcon,
  }

  function handleSearchClick() {
    if (busy) {
      if (typeof onSearch === 'function') onSearch()
      return
    }
    if (confirmSearchMode) {
      setShowModeDialog(true)
      return
    }
    if (typeof onSearch === 'function') onSearch('auto')
  }

  function chooseMode(mode) {
    setShowModeDialog(false)
    if (typeof onSearch === 'function') onSearch(mode)
  }

  const modeDialog = (
    <FieldSearchModeDialog
      show={showModeDialog}
      onHide={function() { setShowModeDialog(false) }}
      onAuto={function() { chooseMode('auto') }}
      onReview={function() { chooseMode('review') }}
      title={modeDialogTitle}
      body={modeDialogBody}
    />
  )

  if (!automaticLookup) {
    if (disabled || !externalUrl) {
      return (
        <Button style={style} disabled>
          {externalLinkIcon || DEFAULT_SEARCH_ICON}
        </Button>
      )
    }
    return (
      <Button
        as="a"
        href={externalUrl}
        target="_blank"
        rel="noreferrer"
        style={style}
      >
        {externalLinkIcon || DEFAULT_SEARCH_ICON}
      </Button>
    )
  }

  if (inline) {
    return (
      <>
        {renderSearchButton(Object.assign({}, shared, { onClick: handleSearchClick }))}
        {renderExternalButton(shared)}
        {modeDialog}
      </>
    )
  }

  return (
    <>
      <ButtonGroup>
        {renderSearchButton(Object.assign({}, shared, { onClick: handleSearchClick }))}
        {renderExternalButton(shared)}
      </ButtonGroup>
      {modeDialog}
    </>
  )
}
