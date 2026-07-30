import React from 'react';
import { Dropdown } from 'react-bootstrap';

export default function NotationToolbarFavoriteMenuItem(props) {
  const { label, isFavorite, onFavoriteToggle, onSelect, className } = props;

  return (
    <Dropdown.Item
      as="div"
      className={'notation-toolbar-favorite-menu-item d-flex align-items-center justify-content-between gap-2'
        + (className ? ' ' + className : '')}
      onClick={function(e) {
        if (e.target && e.target.closest && e.target.closest('.notation-marks-star')) return;
        if (typeof onSelect === 'function') onSelect();
      }}
    >
      <span className="notation-toolbar-favorite-menu-label flex-grow-1">{label}</span>
      <button
        type="button"
        className={'notation-marks-star btn btn-link btn-sm p-0' + (isFavorite ? ' is-favorite' : '')}
        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        aria-label={isFavorite ? 'Unfavorite ' + props.ariaLabel : 'Favorite ' + props.ariaLabel}
        onClick={function(e) {
          if (typeof onFavoriteToggle === 'function') onFavoriteToggle(e);
        }}
      >{isFavorite ? '★' : '☆'}</button>
    </Dropdown.Item>
  );
}
