import { Button } from 'react-bootstrap';
import { icons } from '../Icons';
import './CheckToggleButton.css';

export default function CheckToggleButton({
  checked,
  onClick,
  disabled,
  className,
  size,
  ariaLabel,
  stretch,
}) {
  const variant = checked ? 'primary' : 'outline-primary';
  const rootClassName = [
    'check-toggle-btn',
    checked ? 'check-toggle-btn--checked' : 'check-toggle-btn--unchecked',
    stretch ? 'check-toggle-btn--stretch' : null,
    className,
  ].filter(Boolean).join(' ');

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={rootClassName}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={!!checked}
      onClick={onClick}
    >
      {icons.check}
    </Button>
  );
}
