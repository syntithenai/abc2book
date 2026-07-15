import { InputGroup } from 'react-bootstrap'
import FieldSuggestionsDropdown from './FieldSuggestionsDropdown'

/**
 * Shared render wiring for field-lookup search buttons.
 * Supports:
 * - function children({ buttonGroup, suggestionsDropdown, errorNode })
 * - element children wrapped in InputGroup + suggestions dropdown
 * - no children → button group only (legacy placement next to labels)
 */
export function renderFieldLookupSearchUi(options) {
  const {
    children,
    buttonGroup,
    suggestionsDropdown,
    errorNode,
    modals,
  } = options

  if (typeof children === 'function') {
    return (
      <>
        {children({
          buttonGroup: buttonGroup,
          suggestionsDropdown: suggestionsDropdown,
          errorNode: errorNode || null,
        })}
        {modals}
      </>
    )
  }

  if (children) {
    return (
      <>
        {buttonGroup}
        <InputGroup className="field-lookup-input-with-suggestions">
          {children}
          {suggestionsDropdown}
        </InputGroup>
        {errorNode || null}
        {modals}
      </>
    )
  }

  return (
    <>
      <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap: '0.35em', flexWrap: 'wrap' }}>
        {buttonGroup}
        {suggestionsDropdown}
      </div>
      {errorNode || null}
      {modals}
    </>
  )
}

export function buildSuggestionsDropdown(props) {
  return (
    <FieldSuggestionsDropdown
      items={props.items}
      count={props.count}
      onClear={props.onClear}
      onSelect={props.onSelect}
      getLabel={props.getLabel}
      disabled={props.disabled}
    />
  )
}
