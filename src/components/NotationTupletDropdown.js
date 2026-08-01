import React from 'react';
import { Button, ButtonGroup, Dropdown } from 'react-bootstrap';
import { TUPLET_PRESETS } from '../notation/notationTokens';
import {
  DEFAULT_TUPLET_FAVORITES,
  TUPLET_FAVORITES_STORAGE_KEY,
} from '../notation/toolbarExpand';
import useToolbarFavorites from '../notation/useToolbarFavorites';
import NotationToolbarFavoriteMenuItem from './NotationToolbarFavoriteMenuItem';
import NotationTupletIcon from './NotationTupletIcon';

function tupletKey(preset) {
  return preset.num + '-' + preset.den;
}

const TUPLET_ACTION_ITEMS = [
  { key: '_endTuplet', label: 'End', title: 'End tuplet mode', action: '_endTuplet' },
  { key: '_beamBreak', label: 'Beam', title: 'Break beam before selection', action: '_beamBreak' },
];

function sortPresetsByNum(presets) {
  return presets.slice().sort(function(a, b) { return a.num - b.num; });
}

function tupletModeLabel(mode) {
  if (!mode) return '';
  const preset = TUPLET_PRESETS.find(function(p) {
    return p.num === mode.num && p.den === mode.den;
  });
  if (preset) return preset.label;
  return 'Tuplet ' + mode.num;
}

export default function NotationTupletDropdown(props) {
  const { session, onTupletAction, expanded } = props;
  const mode = session.tupletMode;
  const [favorites, starToggle] = useToolbarFavorites(
    TUPLET_FAVORITES_STORAGE_KEY,
    DEFAULT_TUPLET_FAVORITES
  );

  const favoritePresets = sortPresetsByNum(TUPLET_PRESETS.filter(function(preset) {
    return favorites.indexOf(tupletKey(preset)) >= 0;
  }));

  const favoriteActions = TUPLET_ACTION_ITEMS.filter(function(item) {
    return favorites.indexOf(item.key) >= 0;
  });

  const primaryPreset = favoritePresets[0] || TUPLET_PRESETS.find(function(preset) {
    return preset.num === 3 && preset.den === 2;
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

  const tupletBadgeLabel = tupletModeLabel(mode);
  const tupletBadge = mode ? (
    <span
      className="notation-mode-badge notation-mode-badge-in-group notation-mode-badge-tuplet"
      title={tupletBadgeLabel + ' input mode active'}
      data-testid="notation-mode-badge-tuplet"
    >
      {tupletBadgeLabel}
    </span>
  ) : null;

  function renderPresetButton(preset) {
    return (
      <Button
        key={tupletKey(preset)}
        size="lg"
        variant="outline-secondary"
        title={preset.label}
        aria-label={preset.label}
        className="notation-tuplet-compact-btn"
        onClick={function() { onTupletAction(preset); }}
      ><NotationTupletIcon num={preset.num} /></Button>
    );
  }

  const dropdownToggle = (
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
  );

  if (expanded) {
    return (
      <ButtonGroup className="notation-tuplet-expanded" data-testid="notation-tuplet-expanded">
        {tupletBadge}
        {favoritePresets.map(renderPresetButton)}
        {favoriteActions.map(function(item) {
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
        {dropdownToggle}
      </ButtonGroup>
    );
  }

  return (
    <ButtonGroup className="notation-tuplet-dropdown">
      {tupletBadge}
      <Dropdown as={ButtonGroup}>
        <Button
          size="lg"
          variant="outline-secondary"
          title={primaryPreset.label}
          aria-label={primaryPreset.label}
          className="notation-tuplet-compact-btn"
          onClick={function() { onTupletAction(primaryPreset); }}
        ><NotationTupletIcon num={primaryPreset.num} /></Button>
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
