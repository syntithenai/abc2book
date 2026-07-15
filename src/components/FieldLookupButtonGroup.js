import { Badge, Button, ButtonGroup, ProgressBar } from 'react-bootstrap'
import { useIsNarrowViewport } from '../useMediaQuery'

const DEFAULT_SEARCH_ICON = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <path fill="none" d="M0 0h24v24H0z" />
    <path d="M18.031 16.617l4.283 4.282-1.415 1.415-4.282-4.283A8.96 8.96 0 0 1 11 20c-4.968 0-9-4.032-9-9s4.032-9 9-9 9 4.032 9 9a8.96 8.96 0 0 1-1.969 5.617zm-2.006-.742A6.977 6.977 0 0 0 18 11c0-3.868-3.133-7-7-7-3.868 0-7 3.132-7 7 0 3.867 3.132 7 7 7a6.977 6.977 0 0 0 4.875-1.975l.15-.15z" />
  </svg>
)

const CLEAR_ICON = (
  <span aria-hidden="true" style={{ fontWeight: 700, lineHeight: 1 }}>×</span>
)

/**
 * Uniform field search chrome:
 * [Clear?] [Suggestions?] [Search|Cancel] [External?]
 * Clear / Suggestions only render when suggestionCount > 0.
 * + progress bar while busy.
 */
export function FieldLookupButtonGroup(props) {
  const {
    automaticLookup = true,
    busy,
    disabled,
    externalUrl,
    externalLinkIcon,
    showExternal,
    narrow: narrowProp,
    onSearch,
    onClearSuggestions,
    onOpenSuggestions,
    suggestionCount = 0,
    buttonStyle,
    searchIcon,
    inline,
    progress = 0,
  } = props
  const viewportNarrow = useIsNarrowViewport()
  const narrow = typeof narrowProp === 'boolean' ? narrowProp : viewportNarrow
  const style = Object.assign({
    color: 'black',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35em',
    whiteSpace: 'nowrap',
  }, buttonStyle || {})
  const icon = searchIcon || DEFAULT_SEARCH_ICON
  const canSearch = automaticLookup !== false
  const externalAllowed = !!showExternal && !!externalUrl && !!externalLinkIcon
  const count = Number(suggestionCount) || 0
  const showSuggestions = count > 0 && typeof onOpenSuggestions === 'function'

  function handleSearchClick() {
    if (typeof onSearch === 'function') onSearch(busy ? undefined : 'auto')
  }

  if (!canSearch) {
    if (!externalAllowed) {
      return (
        <Button style={style} disabled>
          {externalLinkIcon || icon}
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
        {externalLinkIcon || icon}
      </Button>
    )
  }

  const clearBtn = showSuggestions ? (
    <Button
      type="button"
      variant="outline-secondary"
      style={style}
      disabled={disabled || busy || typeof onClearSuggestions !== 'function'}
      title="Clear suggestions"
      aria-label="Clear suggestions"
      data-testid="field-suggestions-clear"
      onClick={function() {
        if (typeof onClearSuggestions === 'function') onClearSuggestions()
      }}
    >
      {CLEAR_ICON}
    </Button>
  ) : null

  const suggestionsBtn = showSuggestions ? (
    <Button
      type="button"
      variant="info"
      style={style}
      disabled={disabled}
      title="Open suggestions"
      aria-label="Open suggestions"
      data-testid="field-suggestions-open"
      onClick={function() {
        if (typeof onOpenSuggestions === 'function') onOpenSuggestions()
      }}
    >
      {!narrow && <span>Suggestions</span>}
      <Badge bg="dark" pill className="ms-1">{count}</Badge>
    </Button>
  ) : null

  const searchBtn = (
    <Button
      type="button"
      style={style}
      variant={busy ? 'warning' : undefined}
      disabled={disabled && !busy}
      onClick={handleSearchClick}
      data-testid="field-search-button"
    >
      {icon}
      {!narrow && <span>{busy ? 'Cancel' : 'Search'}</span>}
    </Button>
  )

  const externalBtn = externalAllowed ? (
    <Button
      as="a"
      href={externalUrl}
      target="_blank"
      rel="noreferrer"
      style={style}
    >
      {externalLinkIcon}
    </Button>
  ) : null

  const group = inline ? (
    <>
      {clearBtn}
      {suggestionsBtn}
      {searchBtn}
      {externalBtn}
    </>
  ) : (
    <ButtonGroup>
      {clearBtn}
      {suggestionsBtn}
      {searchBtn}
      {externalBtn}
    </ButtonGroup>
  )

  return (
    <div className="field-lookup-button-group" data-testid="field-lookup-button-group">
      {group}
      {busy ? (
        <ProgressBar
          now={Math.max(5, Math.min(100, Number(progress) || 15))}
          animated
          className="mt-1"
          style={{ height: '0.35rem' }}
          data-testid="field-search-progress"
        />
      ) : null}
    </div>
  )
}

export default FieldLookupButtonGroup
