/**
 * Shared render wiring for field-lookup search buttons.
 * Supports:
 * - function children({ buttonGroup, suggestionsDropdown, errorNode })
 *   (suggestionsDropdown is null; use Suggestions in buttonGroup to open dialogs)
 * - element children rendered after the button group
 * - no children → button group only
 */
export function renderFieldLookupSearchUi(options) {
  const {
    children,
    buttonGroup,
    suggestionsDropdown,
    errorNode,
    modals,
    busy,
  } = options

  if (typeof children === 'function') {
    return (
      <>
        {children({
          buttonGroup: buttonGroup,
          suggestionsDropdown: suggestionsDropdown || null,
          errorNode: errorNode || null,
          busy: !!busy,
        })}
        {modals}
      </>
    )
  }

  if (children) {
    return (
      <>
        {buttonGroup}
        {children}
        {errorNode || null}
        {modals}
      </>
    )
  }

  return (
    <>
      {buttonGroup}
      {errorNode || null}
      {modals}
    </>
  )
}
