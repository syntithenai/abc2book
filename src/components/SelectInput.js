import { useEffect, useMemo, useState } from 'react'
import { FormControl, InputGroup } from 'react-bootstrap'
import { icons } from '../Icons'

/**
 * Text input with optional autosuggest options and an optional trailing append
 * (e.g. field-lookup suggestions).
 */
export default function SelectInput({
  options,
  onChange,
  onSelectOption,
  value,
  placeholder,
  endAppend,
  disabled,
  isInvalid,
  onFocus,
  onBlur,
  autoComplete,
  list,
  loading,
  'data-testid': dataTestId,
}) {
  const [inputValue, setInputValue] = useState(value == null ? '' : value)
  const datalistId = useMemo(function() {
    return 'select-input-list-' + Math.random().toString(36).slice(2, 10)
  }, [])

  useEffect(function() {
    setInputValue(value == null ? '' : value)
  }, [value])

  function handleInputChange(event) {
    setInputValue(event.target.value)
    if (typeof onChange === 'function') onChange(event.target.value)
  }

  const hasOptions = Array.isArray(options) && options.length > 0
  const showLoading = !!loading

  return (
    <InputGroup>
      <FormControl
        value={inputValue}
        onChange={handleInputChange}
        placeholder={placeholder || 'Type or select an option'}
        disabled={disabled}
        isInvalid={isInvalid}
        onFocus={onFocus}
        onBlur={onBlur}
        autoComplete={autoComplete}
        list={hasOptions ? datalistId : list}
        data-testid={dataTestId}
      />
      {showLoading ? (
        <InputGroup.Text
          className="select-input-loading-icon"
          aria-label="Loading suggestions"
          data-testid={dataTestId ? dataTestId + '-loading' : 'select-input-loading'}
        >
          {icons.waiting}
        </InputGroup.Text>
      ) : null}
      {hasOptions ? (
        <datalist id={datalistId}>
          {options.map(function(option) {
            return <option key={option} value={option} />
          })}
        </datalist>
      ) : null}
      {endAppend || null}
    </InputGroup>
  )
}
