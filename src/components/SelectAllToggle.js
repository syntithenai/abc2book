import CheckToggleButton from './CheckToggleButton';
import './SelectAllToggle.css';

/**
 * Tri-state select-all control using the same check icon as tune list rows.
 * Click clears when any are selected; otherwise selects all.
 */
export default function SelectAllToggle({
  totalCount,
  selectedCount,
  onSelectAll,
  onSelectNone,
  disabled,
  className,
  label,
  ariaLabel,
  size,
}) {
  const total = typeof totalCount === 'number' ? totalCount : 0;
  const selected = typeof selectedCount === 'number' ? selectedCount : 0;
  const checked = selected > 0;
  const resolvedAriaLabel = ariaLabel || label || 'Select all';
  const rootClassName = ['select-all-toggle', className].filter(Boolean).join(' ');

  function handleClick() {
    if (selected > 0) {
      if (typeof onSelectNone === 'function') onSelectNone();
    } else if (typeof onSelectAll === 'function') {
      onSelectAll();
    }
  }

  const button = (
    <CheckToggleButton
      className={rootClassName}
      checked={checked}
      onClick={handleClick}
      disabled={disabled || total === 0}
      ariaLabel={resolvedAriaLabel}
      size={size}
      stretch
    />
  );

  if (label) {
    return (
      <div className="select-all-toggle-with-label">
        {button}
        <span className="select-all-toggle-label">{label}</span>
      </div>
    );
  }

  return button;
}
