import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, ButtonGroup } from 'react-bootstrap'
import './PlayWithQueueDropdown.css'

const MENU_WIDTH = 200
const MENU_ESTIMATED_HEIGHT = 132
const VIEWPORT_PADDING = 8

function usePortalMenuPosition(show, anchorRef) {
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
      const menuWidth = MENU_WIDTH
      const menuHeight = MENU_ESTIMATED_HEIGHT
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
}) {
  function wrapHandler(handler) {
    return function(event) {
      if (event) {
        event.preventDefault()
      }
      if (onClose) onClose()
      if (handler) handler(event)
    }
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
  const isListItemPlay = !!(className && className.indexOf('tune-list-item-play') !== -1)
  const basePlayVariant = playVariant || (variant === 'collection-side' ? 'primary' : 'success')
  // Search list row buttons stay green while playing; the row uses tune-list-item--now-playing.
  const playButtonVariant = (isPlaying && !isListItemPlay) ? 'warning' : basePlayVariant
  const resolvedPlayIcon = isPlaying && pauseIcon ? pauseIcon : playIcon
  const playButtonTitle = isPlaying && pauseIcon ? 'Pause' : (isPlaying ? 'Now playing' : 'Play')
  const hasQueueMenu = showQueueMenu && (onAddToQueue || onPlayNext || onAddToTunebook)
  const useListItemMenu = listItemMenu || (variant === 'compact' && isListItemPlay)
  const resolvedButtonSize = buttonSize != null
    ? buttonSize
    : (variant === 'compact' ? (isListItemPlay ? undefined : 'sm') : undefined)
  const [menuOpen, setMenuOpen] = useState(false)
  const anchorRef = useRef(null)
  const menuRef = useRef(null)
  const portalMenuStyle = usePortalMenuPosition(menuOpen && hasQueueMenu, anchorRef)
  const groupClass = 'play-with-queue-dropdown play-with-queue-dropdown--' + variant + (className ? ' ' + className : '') + (menuOpen ? ' show' : '')

  function closeMenu() {
    setMenuOpen(false)
  }

  function handleToggleMenu(event) {
    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }
    if (disabled) return
    setMenuOpen(function(open) { return !open })
  }

  useEffect(function() {
    if (!menuOpen) return undefined
    function handlePointerDown(event) {
      const anchor = anchorRef.current
      const menu = menuRef.current
      if (anchor && anchor.contains(event.target)) return
      if (menu && menu.contains(event.target)) return
      setMenuOpen(false)
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown, true)
    document.addEventListener('touchstart', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown, true)
    return function() {
      document.removeEventListener('mousedown', handlePointerDown, true)
      document.removeEventListener('touchstart', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [menuOpen])

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
    onClose: closeMenu,
  }

  const portalMenu = menuOpen && portalMenuStyle && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={menuRef}
        className={'dropdown-menu show play-with-queue-dropdown-menu play-with-queue-dropdown-menu--portal' + (useListItemMenu ? '' : ' play-with-queue-dropdown-menu--toolbar')}
        style={portalMenuStyle}
        role="menu"
      >
        <QueueMenuItems {...menuItemsProps} />
      </div>,
      document.body
    )
    : null

  return (
    <>
      <div ref={anchorRef} className="play-with-queue-dropdown-anchor">
        <ButtonGroup
          className={groupClass}
          onClick={handleContainerClick}
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
          <Button
            variant={playButtonVariant}
            size={resolvedButtonSize}
            className={'dropdown-toggle dropdown-toggle-split play-with-queue-dropdown-toggle' + (variant === 'collection-side' ? ' books-page-collection-card-side' : '')}
            aria-label="Queue options"
            aria-expanded={menuOpen}
            disabled={disabled}
            onClick={handleToggleMenu}
          />
        </ButtonGroup>
      </div>
      {portalMenu}
    </>
  )
}
