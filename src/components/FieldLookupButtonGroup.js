import { Button, ButtonGroup, ProgressBar } from 'react-bootstrap'
import { useIsNarrowViewport } from '../useMediaQuery'

const DEFAULT_SEARCH_ICON = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <path fill="none" d="M0 0h24v24H0z" />
    <path d="M18.031 16.617l4.283 4.282-1.415 1.415-4.282-4.283A8.96 8.96 0 0 1 11 20c-4.968 0-9-4.032-9-9s4.032-9 9-9 9 4.032 9 9a8.96 8.96 0 0 1-1.969 5.617zm-2.006-.742A6.977 6.977 0 0 0 18 11c0-3.868-3.133-7-7-7-3.868 0-7 3.132-7 7 0 3.867 3.132 7 7 7a6.977 6.977 0 0 0 4.875-1.975l.15-.15z" />
  </svg>
)

/**
 * Uniform field search chrome:
 * [Search|Cancel] [External?] [optional resultsCaret]
 * Cached search results reopen via field caret / resultsCaret — not a Suggestions button.
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
    buttonStyle,
    searchIcon,
    inline,
    progress = 0,
    resultsCaret = null,
    externalMenu = null,
  } = props
  void props.suggestionCount
  void props.onOpenSuggestions
  void inline
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
  const externalAllowed = !!showExternal && !!externalUrl && !!externalLinkIcon && !externalMenu
  const hasExternalMenu = !!showExternal && !!externalMenu

  function handleSearchClick() {
    if (typeof onSearch === 'function') onSearch(busy ? undefined : 'auto')
  }

  if (!canSearch) {
    if (hasExternalMenu) return externalMenu
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

  const externalBtn = hasExternalMenu
    ? externalMenu
    : (externalAllowed ? (
      <Button
        as="a"
        href={externalUrl}
        target="_blank"
        rel="noreferrer"
        style={style}
      >
        {externalLinkIcon}
      </Button>
    ) : null)

  const searchGroup = (
    <ButtonGroup>
      {searchBtn}
      {externalBtn}
      {resultsCaret}
    </ButtonGroup>
  )

  return (
    <div
      className="field-lookup-button-group"
      data-testid="field-lookup-button-group"
      style={{
        display: 'inline-flex',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: '0.35rem',
      }}
    >
      <div style={{ display: 'inline-flex', flexDirection: 'column' }}>
        {searchGroup}
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
    </div>
  )
}

export default FieldLookupButtonGroup
