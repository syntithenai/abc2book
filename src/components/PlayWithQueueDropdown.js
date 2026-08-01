import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, ButtonGroup, Dropdown } from 'react-bootstrap'
import './PlayWithQueueDropdown.css'

const LIST_ITEM_MENU_WIDTH = 200
const LIST_ITEM_MENU_ESTIMATED_HEIGHT = 132
const VIEWPORT_PADDING = 8

function useListItemPortalMenuPosition(show, anchorRef) {
  const [style, setStyle] = useState(null)

  useLayoutEffect(function() {
    if (!show || !anchorRef.current) {
      setStyle(null)
      return undefined
    }

    function updatePosition() {
      const anchor = anchorRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const menuWidth = LIST_ITEM_MENU_WIDTH
      const menuHeight = LIST_ITEM_MENU_ESTIMATED_HEIGHT
      let top = rect.bottom + 2
      let left = Math.min(
        Math.max(VIEWPORT_PADDING, rect.right - menuWidth),
        viewportWidth - menuWidth - VIEWPORT_PADDING
      )
      if (top + menuHeight > viewportHeight - VIEWPORT_PADDING && rect.top - menuHeight > VIEWPORT_PADDING) {
        top = rect.top - menuHeight - 2
      }
      setStyle({
        position: 'fixed',
        top: top + 'px',
        left: left + 'px',
        zIndex: 10020,
        minWidth: menuWidth + 'px',
      })
    }

    updatePosition()
    const scrollRoot = document.querySelector('.tune-list-scroll-root')
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    if (scrollRoot) scrollRoot.addEventListener('scroll', updatePosition)
    return function() {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
      if (scrollRoot) scrollRoot.removeEventListener('scroll', updatePosition)
    }
  }, [show, anchorRef])

  return style
}

function QueueMenuItems({
  onAddToQueue,
  onPlayNext,
  onAddToTunebook,
  addToQueueLabel,
  playNextLabel,
  addToTunebookLabel,
  onClose,
  asDropdownItems = true,
}) {
  function wrapHandler(handler) {
    return function(event) {
      if (handler) handler(event)
      if (onClose) onClose()
    }
  }

  if (asDropdownItems) {
    return (
      <>
        {onAddToQueue ? (
          <Dropdown.Item onClick={wrapHandler(onAddToQueue)}>{addToQueueLabel}</Dropdown.Item>
        ) : null}
        {onPlayNext ? (
          <Dropdown.Item onClick={wrapHandler(onPlayNext)}>{playNextLabel}</Dropdown.Item>
        ) : null}
        {onAddToTunebook ? (
          <Dropdown.Item onClick={wrapHandler(onAddToTunebook)}>{addToTunebookLabel}</Dropdown.Item>
        ) : null}
      </>
    )
  }

  return (
    <>
      {onAddToQueue ? (
        <button type="button" className="dropdown-item" onClick={wrapHandler(onAddToQueue)}>
          {addToQueueLabel}
        </button>
      ) : null}
      {onPlayNext ? (
        <button type="button" className="dropdown-item" onClick={wrapHandler(onPlayNext)}>
          {playNextLabel}
        </button>
      ) : null}
      {onAddToTunebook ? (
        <button type="button" className="dropdown-item" onClick={wrapHandler(onAddToTunebook)}>
          {addToTunebookLabel}
        </button>
      ) : null}
    </>
  )
}

export default function PlayWithQueueDropdown({
  variant = 'compact',
  onPlay,
  onAddToQueue,
  onPlayNext,
  onAddToTunebook,
  playIcon,
  pauseIcon,
  playVariant,
  isPlaying,
  showQueueMenu = true,
  disabled,
  playLabel,
  testId,
  className,
  addToQueueLabel = 'Add to queue',
  playNextLabel = 'Play next',
  addToTunebookLabel = 'Add to Tunebook',
  buttonSize,
  onContainerClick,
  listItemMenu = false,
}) {
  const playButtonVariant = isPlaying ? 'warning' : (playVariant || (variant === 'collection-side' ? 'primary' : 'success'))
  const resolvedPlayIcon = isPlaying && pauseIcon ? pauseIcon : playIcon
  const playButtonTitle = isPlaying && pauseIcon ? 'Pause' : (isPlaying ? 'Now playing' : 'Play')
  const groupClass = 'play-with-queue-dropdown play-with-queue-dropdown--' + variant + (className ? ' ' + className : '')
  const hasQueueMenu = showQueueMenu && (onAddToQueue || onPlayNext || onAddToTunebook)
  const isListItemPlay = !!(className && className.indexOf('tune-list-item-play') !== -1)
  const useListItemMenu = listItemMenu || (variant === 'compact' && isListItemPlay)
  const resolvedButtonSize = buttonSize != null
    ? buttonSize
    : (variant === 'compact' ? (isListItemPlay ? undefined : 'sm') : undefined)
  const [menuOpen, setMenuOpen] = useState(false)
  const anchorRef = useRef(null)
  const portalMenuStyle = useListItemPortalMenuPosition(menuOpen && useListItemMenu, anchorRef)

  useEffect(function() {
    if (!useListItemMenu || !menuOpen) return undefined
    function handlePointerDown(event) {
      const anchor = anchorRef.current
      if (!anchor) return
      const portalMenu = document.querySelector('.play-with-queue-dropdown-menu--portal')
      if (anchor.contains(event.target)) return
      if (portalMenu && portalMenu.contains(event.target)) return
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown, true)
    return function() {
      document.removeEventListener('mousedown', handlePointerDown, true)
    }
  }, [useListItemMenu, menuOpen])

  function handleContainerClick(event) {
    if (onContainerClick) onContainerClick(event)
  }

  if (!hasQueueMenu) {
    return (
      <Button
        variant={playButtonVariant}
        size={resolvedButtonSize}
        className={groupClass + ' play-with-queue-dropdown-play-only' + (variant === 'collection-side' ? ' books-page-collection-card-side' : ' tune-list-play-btn')}
        title={playButtonTitle}
        aria-label={playButtonTitle}
        data-testid={testId}
        disabled={disabled}
        onClick={onPlay}
      >
        {resolvedPlayIcon}
        {playLabel || null}
      </Button>
    )
  }

  const menuItemsProps = {
    onAddToQueue: onAddToQueue,
    onPlayNext: onPlayNext,
    onAddToTunebook: onAddToTunebook,
    addToQueueLabel: addToQueueLabel,
    playNextLabel: playNextLabel,
    addToTunebookLabel: addToTunebookLabel,
  }

  const portalMenu = useListItemMenu && menuOpen && portalMenuStyle && typeof document !== 'undefined'
    ? createPortal(
      <div
        className="dropdown-menu show play-with-queue-dropdown-menu play-with-queue-dropdown-menu--portal"
        style={portalMenuStyle}
        role="menu"
      >
        <QueueMenuItems
          {...menuItemsProps}
          asDropdownItems={false}
          onClose={function() { setMenuOpen(false) }}
        />
      </div>,
      document.body
    )
    : null

  return (
    <>
      <div ref={anchorRef} className="play-with-queue-dropdown-anchor">
        <Dropdown
          as={ButtonGroup}
          className={groupClass}
          onClick={handleContainerClick}
          show={useListItemMenu ? menuOpen : undefined}
          onToggle={useListItemMenu ? setMenuOpen : undefined}
        >
          <Button
            variant={playButtonVariant}
            size={resolvedButtonSize}
            className={'play-with-queue-dropdown-play' + (variant === 'collection-side' ? ' books-page-collection-card-side' : ' tune-list-play-btn')}
            title={playButtonTitle}
            aria-label={playButtonTitle}
            data-testid={testId}
            disabled={disabled}
            onClick={onPlay}
          >
            {resolvedPlayIcon}
            {playLabel || null}
          </Button>
          <Dropdown.Toggle
            split
            variant={playButtonVariant}
            size={resolvedButtonSize}
            className={'play-with-queue-dropdown-toggle' + (variant === 'collection-side' ? ' books-page-collection-card-side' : '')}
            aria-label="Queue options"
            disabled={disabled}
          />
          {!useListItemMenu ? (
            <Dropdown.Menu
              align="end"
              className="play-with-queue-dropdown-menu"
              popperConfig={{ strategy: 'fixed' }}
            >
              <QueueMenuItems {...menuItemsProps} />
            </Dropdown.Menu>
          ) : null}
        </Dropdown>
      </div>
      {portalMenu}
    </>
  )
}
