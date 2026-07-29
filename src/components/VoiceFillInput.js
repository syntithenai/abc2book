import { Form, InputGroup } from 'react-bootstrap'
import FieldVoiceFillButton from './FieldVoiceFillButton'

/**
 * Single-line text/search input with optional voice mic (tap or hold to speak).
 *
 * layout="group" — Bootstrap InputGroup + Form.Control (default)
 * layout="wrap"  — flex row with raw input or Form.Control + mic
 */
export default function VoiceFillInput(props) {
  const {
    value,
    onChange,
    onFill,
    fieldKind = 'search',
    token,
    setBlockKeyboardShortcuts,
    layout = 'group',
    useFormControl = true,
    type = 'search',
    className,
    inputClassName,
    wrapClassName,
    micClassName,
    micTestId,
    size,
    children,
    ...inputProps
  } = props

  function emitChange(nextValue) {
    if (typeof onChange === 'function') {
      onChange({ target: { value: nextValue } })
    }
  }

  function handleFill(text) {
    if (typeof onFill === 'function') {
      onFill(text)
      return
    }
    emitChange(text)
  }

  const mic = (
    <FieldVoiceFillButton
      fieldKind={fieldKind}
      token={token}
      setBlockKeyboardShortcuts={setBlockKeyboardShortcuts}
      className={micClassName}
      size={size}
      data-testid={micTestId}
      onFill={handleFill}
    />
  )

  const controlProps = Object.assign({}, inputProps, {
    type: type,
    value: value == null ? '' : value,
    onChange: onChange,
    className: inputClassName,
  })

  if (layout === 'wrap') {
    const wrapClasses = ['voice-fill-input-wrap']
    if (wrapClassName) wrapClasses.push(wrapClassName)
    if (className) wrapClasses.push(className)
    return (
      <div className={wrapClasses.join(' ')}>
        {useFormControl
          ? <Form.Control {...controlProps} />
          : <input {...controlProps} />}
        {mic}
        {children}
      </div>
    )
  }

  const groupClasses = ['voice-fill-input-group']
  if (className) groupClasses.push(className)
  return (
    <InputGroup className={groupClasses.join(' ')}>
      {useFormControl
        ? <Form.Control {...controlProps} />
        : <input {...controlProps} />}
      {mic}
      {children}
    </InputGroup>
  )
}
