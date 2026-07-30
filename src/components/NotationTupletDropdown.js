import React from 'react';
import { Button, ButtonGroup, Dropdown } from 'react-bootstrap';
import { TUPLET_PRESETS } from '../notation/notationTokens';
import {
  DEFAULT_TUPLET_FAVORITES,
  TUPLET_FAVORITES_STORAGE_KEY,
} from '../notation/toolbarExpand';
import useToolbarFavorites from '../notation/useToolbarFavorites';
import NotationToolbarFavoriteMenuItem from './NotationToolbarFavoriteMenuItem';

function tupletKey(preset) {
  return preset.num + '-' + preset.den;
}

const TUPLET_ACTION_ITEMS = [
  { key: '_endTuplet', label: 'End', title: 'End tuplet mode', action: '_endTuplet' },
  { key: '_beamBreak', label: 'Beam', title: 'Break beam before selection', action: '_beamBreak' },
];

export default function NotationTupletDropdown(props) {
  const { session, onTupletAction, expanded } = props;
  const mode = session.tupletMode;
  const mainLabel = mode ? '(' + mode.num : '(3';
  const [favorites, starToggle] = useToolbarFavorites(
    TUPLET_FAVORITES_STORAGE_KEY,
    DEFAULT_TUPLET_FAVORITES
  );

  const favoritePresets = TUPLET_PRESETS.filter(function(preset) {
    return favorites.indexOf(tupletKey(preset)) >= 0;
  });

  const menu = (
    <Dropdown.Menu className="notation-tuplet-menu">
      <Dropdown.Header>Tuplets</Dropdown.Header>
      {TUPLET_PRESETS.map(function(preset) {
        const key = tupletKey(preset);
        const isFav = favorites.indexOf(key) >= 0;
        return (
          <NotationToolbarFavoriteMenuItem
            key={key}
            label={preset.label + ' (' + preset.num + ':' + preset.den + ')'}
            ariaLabel={preset.label}
            isFavorite={isFav}
            onSelect={function() { onTupletAction(preset); }}
            onFavoriteToggle={function(e) { starToggle(key, e); }}
          />
        );
      })}
      <Dropdown.Divider />
      <NotationToolbarFavoriteMenuItem
        key="_endTuplet"
        label="End tuplet mode"
        ariaLabel="End tuplet mode"
        isFavorite={favorites.indexOf('_endTuplet') >= 0}
        onSelect={function() { onTupletAction('_endTuplet'); }}
        onFavoriteToggle={function(e) { starToggle('_endTuplet', e); }}
      />
      <NotationToolbarFavoriteMenuItem
        key="_beamBreak"
        label="Break beam before selection"
        ariaLabel="Break beam before selection"
        isFavorite={favorites.indexOf('_beamBreak') >= 0}
        onSelect={function() { onTupletAction('_beamBreak'); }}
        onFavoriteToggle={function(e) { starToggle('_beamBreak', e); }}
      />
    </Dropdown.Menu>
  );

  const mainButton = (
    <Button
      size="lg"
      variant={mode ? 'primary' : 'outline-secondary'}
      title={mode ? 'End tuplet mode' : 'Start triplet'}
      onClick={function() {
        if (mode) onTupletAction('_endTuplet');
        else onTupletAction('_triplet');
      }}
    >{mainLabel}</Button>
  );

  if (expanded) {
    return (
      <ButtonGroup className="notation-tuplet-expanded" data-testid="notation-tuplet-expanded">
        {mainButton}
        {favoritePresets.map(function(preset) {
          return (
            <Button
              key={tupletKey(preset)}
              size="lg"
              variant="outline-secondary"
              title={preset.label}
              className="notation-tuplet-compact-btn"
              onClick={function() { onTupletAction(preset); }}
            >{preset.num}:{preset.den}</Button>
          );
        })}
        {TUPLET_ACTION_ITEMS.filter(function(item) {
          return favorites.indexOf(item.key) >= 0;
        }).map(function(item) {
          return (
            <Button
              key={item.key}
              size="lg"
              variant="outline-secondary"
              title={item.title}
              className="notation-tuplet-compact-btn"
              onClick={function() { onTupletAction(item.action); }}
            >{item.label}</Button>
          );
        })}
        <Dropdown as={ButtonGroup}>
          <Dropdown.Toggle
            split
            variant="outline-secondary"
            size="lg"
            aria-label="Tuplets and grace menu"
            data-testid="notation-tuplet-menu"
          />
          {menu}
        </Dropdown>
      </ButtonGroup>
    );
  }

  return (
    <Dropdown as={ButtonGroup} className="notation-tuplet-dropdown">
      {mainButton}
      <Dropdown.Toggle split variant="outline-secondary" size="lg" aria-label="Tuplets and grace menu" data-testid="notation-tuplet-menu" />
      {menu}
    </Dropdown>
  );
}
