import { useRef } from 'react';
import { Button } from 'react-bootstrap';

export default function FileInputButton(props) {
  const inputRef = useRef(null);
  const {
    label = 'Select files',
    icon = null,
    variant = 'outline-secondary',
    size,
    multiple,
    accept,
    directory,
    onChange,
    className,
    style,
    disabled,
    buttonClassName,
  } = props;

  const buttonClasses = ['links-editor-toolbar-btn']
  if (buttonClassName) buttonClasses.push(buttonClassName)
  if (className) buttonClasses.push(className)

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        onChange={onChange}
        disabled={disabled}
        style={{ display: 'none' }}
        {...(directory ? { webkitdirectory: '', directory: '' } : {})}
      />
      <Button
        variant={variant}
        size={size}
        className={buttonClasses.join(' ')}
        style={style}
        disabled={disabled}
        aria-label={label}
        title={label}
        onClick={function() {
          if (inputRef.current) inputRef.current.click();
        }}
      >
        {icon ? <span className="links-editor-toolbar-btn-icon" aria-hidden="true">{icon}</span> : null}
        <span className="links-editor-toolbar-btn-label">{label}</span>
      </Button>
    </>
  );
}
