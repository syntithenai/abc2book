import React from 'react';
import { Button } from 'react-bootstrap';

/**
 * Standard toolbar clear control (× icon).
 */
export default function NotationClearIconButton(props) {
  const {
    tunebook,
    title,
    onClick,
    disabled,
    size,
    testId,
    className,
  } = props;
  const icon = tunebook && tunebook.icons ? tunebook.icons.close : '×';

  return (
    <Button
      size={size || 'lg'}
      variant="outline-secondary"
      className={'notation-clear-icon-btn' + (className ? ' ' + className : '')}
      title={title}
      aria-label={title}
      data-testid={testId}
      disabled={!!disabled}
      onClick={onClick}
    >{icon}</Button>
  );
}
