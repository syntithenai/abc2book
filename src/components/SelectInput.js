import { useEffect, useState } from 'react'
import { FormControl, InputGroup, Dropdown, DropdownButton } from 'react-bootstrap'

const CARET_TITLE = (
  <span aria-hidden="true" style={{ display: 'inline-block', lineHeight: 1 }}>▾</span>
)

/**
 * Text input with optional MusicBrainz-style options dropdown (caret only)
 * and an optional trailing append (e.g. field-lookup suggestions).
 */
export default function SelectInput({
  options,
  onChange,
  onSelectOption,
  value,
  placeholder,
  endAppend,
  disabled,
  onFocus,
  onBlur,
  autoComplete,
  list,
  'data-testid': dataTestId,
}) {
  const [inputValue, setInputValue] = useState(value == null ? '' : value)

  useEffect(function() {
    setInputValue(value == null ? '' : value)
  }, [value])

  function handleInputChange(event) {
    setInputValue(event.target.value)
    if (typeof onChange === 'function') onChange(event.target.value)
  }

  function handleOptionSelect(option) {
    setInputValue(option)
    if (typeof onChange === 'function') onChange(option)
    if (typeof onSelectOption === 'function') onSelectOption(option)
  }

  const hasOptions = Array.isArray(options) && options.length > 0

  return (
    <InputGroup>
      <FormControl
        value={inputValue}
        onChange={handleInputChange}
        placeholder={placeholder || 'Type or select an option'}
        disabled={disabled}
        onFocus={onFocus}
        onBlur={onBlur}
        autoComplete={autoComplete}
        list={list}
        data-testid={dataTestId}
      />
      {hasOptions ? (
        <DropdownButton
          variant="outline-secondary"
          className="select-input-options-dropdown"
          title={CARET_TITLE}
          align="end"
          onSelect={handleOptionSelect}
          disabled={disabled}
          aria-label="Artist suggestions"
          data-testid="select-input-options-dropdown"
        >
          {options.map(function(option) {
            return (
              <Dropdown.Item key={option} eventKey={option}>
                {option}
              </Dropdown.Item>
            )
          })}
        </DropdownButton>
      ) : null}
      {endAppend || null}
    </InputGroup>
  )
}
