import React from 'react';
import { Button, ButtonGroup, Dropdown } from 'react-bootstrap';
import {
  ACCIDENTAL_FAVORITES_STORAGE_KEY,
  DEFAULT_ACCIDENTAL_FAVORITES,
} from '../notation/toolbarExpand';
import useToolbarFavorites from '../notation/useToolbarFavorites';
import NotationClearIconButton from './NotationClearIconButton';
import NotationToolbarFavoriteMenuItem from './NotationToolbarFavoriteMenuItem';

const ACCIDENTAL_OPTIONS = [
  { value: 0, label: '♮', title: 'Natural (=)', key: '0' },
  { value: -1, label: '♭', title: 'Flat (-)', key: '-1' },
  { value: 1, label: '♯', title: 'Sharp (+)', key: '1' },
  { value: -2, label: '𝄫', title: 'Double flat', key: '-2' },
  { value: 2, label: '𝄪', title: 'Double sharp', key: '2' },
];

export default function NotationAccidentalDropdown(props) {
  const { session, dispatch, onApplyAccidental, expanded, tunebook } = props;
  const carry = session.accidentalCarry;
  const current = ACCIDENTAL_OPTIONS.find(function(o) { return o.value === carry; });
  const mainLabel = current ? current.label : '♮';
  const hasSelection = !!(session.selection && session.selection.eventIds && session.selection.eventIds.length);
  const [favorites, starToggle] = useToolbarFavorites(
    ACCIDENTAL_FAVORITES_STORAGE_KEY,
    DEFAULT_ACCIDENTAL_FAVORITES
  );

  function apply(value) {
    if (typeof onApplyAccidental === 'function') {
      onApplyAccidental(value);
      return;
    }
    dispatch({ type: 'SET_ACCIDENTAL_CARRY', value: value });
  }

  const favoriteOptions = ACCIDENTAL_OPTIONS.filter(function(opt) {
    return favorites.indexOf(opt.key) >= 0;
  });

  const menu = (
    <Dropdown.Menu className="notation-accidental-menu">
      {ACCIDENTAL_OPTIONS.map(function(opt) {
        const isFav = favorites.indexOf(opt.key) >= 0;
        return (
          <NotationToolbarFavoriteMenuItem
            key={opt.key}
            label={<span>{opt.label} {opt.title}</span>}
            ariaLabel={opt.title}
            isFavorite={isFav}
            onSelect={function() { apply(opt.value); }}
            onFavoriteToggle={function(e) { starToggle(opt.key, e); }}
          />
        );
      })}
      <Dropdown.Divider />
      <Dropdown.Item onClick={function() {
        if (typeof dispatch === 'function') {
          dispatch({ type: 'SET_ACCIDENTAL_CARRY', value: null });
        }
      }}>Clear carry</Dropdown.Item>
    </Dropdown.Menu>
  );

  const clearButton = hasSelection ? (
    <NotationClearIconButton
      tunebook={tunebook}
      title="Clear accidental — remove sharp, flat, or natural from selection"
      testId="notation-accidental-clear"
      onClick={function() { apply(null); }}
    />
  ) : null;

  if (expanded) {
    return (
      <ButtonGroup className="notation-accidental-buttons" data-testid="notation-accidental-menu" aria-label="Accidentals">
        <Button
          size="lg"
          variant={carry === 0 ? 'primary' : 'outline-secondary'}
          title="Natural (=)"
          onClick={function() { apply(0); }}
        >♮</Button>
        {favoriteOptions.map(function(opt) {
          return (
            <Button
              key={opt.key}
              size="lg"
              variant={carry === opt.value ? 'primary' : 'outline-secondary'}
              title={opt.title}
              onClick={function() { apply(opt.value); }}
            >{opt.label}</Button>
          );
        })}
        <Dropdown as={ButtonGroup}>
          <Dropdown.Toggle
            split
            variant="outline-secondary"
            size="lg"
            aria-label="Full accidentals palette"
            title="Full accidentals palette"
          />
          {menu}
        </Dropdown>
        {clearButton}
      </ButtonGroup>
    );
  }

  return (
    <ButtonGroup className="notation-accidental-dropdown" data-testid="notation-accidental-menu" aria-label="Accidentals">
      <Dropdown as={ButtonGroup}>
        <Button
          size="lg"
          variant={carry != null || hasSelection ? 'primary' : 'outline-secondary'}
          title={hasSelection ? 'Apply natural to selection' : 'Natural accidental carry'}
          onClick={function() { apply(0); }}
        >{mainLabel}</Button>
        <Dropdown.Toggle
          split
          variant="outline-secondary"
          size="lg"
          aria-label="Choose accidental"
        />
        {menu}
      </Dropdown>
      {clearButton}
    </ButtonGroup>
  );
}
