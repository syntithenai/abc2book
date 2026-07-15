import React, { useState, useEffect } from 'react';
import { Button, ButtonGroup, Dropdown } from 'react-bootstrap';
import { MARK_MENU_GROUPS } from '../notation/notationTokens';
import {
  loadMarkFavorites,
  saveMarkFavorites,
  toggleMarkFavorite,
  MARK_COMPACT_LABELS,
} from '../notation/toolbarExpand';

function allMarkItems() {
  const items = [];
  MARK_MENU_GROUPS.forEach(function(group) {
    group.items.forEach(function(item) { items.push(item); });
  });
  return items;
}

export default function NotationMarksDropdown(props) {
  const { onToggleTie, onMarkAction, expanded } = props;
  const [favorites, setFavorites] = useState(loadMarkFavorites);

  useEffect(function() {
    saveMarkFavorites(favorites);
  }, [favorites]);

  function starToggle(key, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    setFavorites(function(prev) { return toggleMarkFavorite(prev, key); });
  }

  function applyItem(key) {
    if (key === '_tie') {
      onToggleTie();
      return;
    }
    onMarkAction(key);
  }

  const favoriteItems = allMarkItems().filter(function(item) {
    return favorites.indexOf(item.key) >= 0;
  });

  const menu = (
    <Dropdown.Menu className="notation-marks-menu">
      {MARK_MENU_GROUPS.map(function(group, gi) {
        return (
          <React.Fragment key={group.header}>
            {gi > 0 ? <Dropdown.Divider /> : null}
            <Dropdown.Header>{group.header}</Dropdown.Header>
            {group.items.map(function(item) {
              const isFav = favorites.indexOf(item.key) >= 0;
              const label = item.shortcut
                ? item.label + ' (' + item.shortcut + ')'
                : item.label;
              return (
                <Dropdown.Item
                  key={item.key}
                  as="div"
                  className="notation-marks-menu-item d-flex align-items-center justify-content-between gap-2"
                  onClick={function(e) {
                    // Prefer the label click to apply; star has its own handler.
                    if (e.target && e.target.closest && e.target.closest('.notation-marks-star')) return;
                    applyItem(item.key);
                  }}
                >
                  <span className="notation-marks-menu-label flex-grow-1">{label}</span>
                  <button
                    type="button"
                    className={'notation-marks-star btn btn-link btn-sm p-0' + (isFav ? ' is-favorite' : '')}
                    title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                    aria-label={isFav ? 'Unfavorite ' + item.label : 'Favorite ' + item.label}
                    onClick={function(e) { starToggle(item.key, e); }}
                  >{isFav ? '★' : '☆'}</button>
                </Dropdown.Item>
              );
            })}
          </React.Fragment>
        );
      })}
    </Dropdown.Menu>
  );

  if (expanded) {
    return (
      <ButtonGroup className="notation-marks-expanded" data-testid="notation-marks-expanded">
        <Button
          size="lg"
          variant="outline-secondary"
          className="notation-marks-main-btn"
          title="Tie (T)"
          onClick={onToggleTie}
        >♪</Button>
        {favoriteItems.map(function(item) {
          const compact = MARK_COMPACT_LABELS[item.key] || item.label.slice(0, 3);
          return (
            <Button
              key={item.key}
              size="lg"
              variant="outline-secondary"
              title={item.label}
              className="notation-marks-fav-btn"
              onClick={function() { applyItem(item.key); }}
            >{compact}</Button>
          );
        })}
        <Dropdown as={ButtonGroup}>
          <Dropdown.Toggle
            split
            variant="outline-secondary"
            size="lg"
            aria-label="Full marks palette"
            data-testid="notation-marks-menu"
            title="Full palette"
          />
          {menu}
        </Dropdown>
      </ButtonGroup>
    );
  }

  return (
    <Dropdown as={ButtonGroup} className="notation-marks-dropdown">
      <Button
        size="lg"
        variant="outline-secondary"
        className="notation-marks-main-btn"
        title="Tie (T)"
        onClick={onToggleTie}
      >♪</Button>
      <Dropdown.Toggle split variant="outline-secondary" size="lg" aria-label="Marks menu" data-testid="notation-marks-menu" />
      {menu}
    </Dropdown>
  );
}
