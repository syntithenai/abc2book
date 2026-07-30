import React from 'react';
import { Button, ButtonGroup, Dropdown } from 'react-bootstrap';
import { BARLINE_TOKENS } from '../notation/notationConstants';
import {
  BARLINE_FAVORITES_STORAGE_KEY,
  DEFAULT_BARLINE_FAVORITES,
} from '../notation/toolbarExpand';
import useToolbarFavorites from '../notation/useToolbarFavorites';
import NotationToolbarFavoriteMenuItem from './NotationToolbarFavoriteMenuItem';

const KEY_SIGNATURE_ICON = '/notation-key-signature.png';
const TIME_SIGNATURE_ICON = '/notation-time-signature.png';

const BARLINE_OPTIONS = [
  { token: BARLINE_TOKENS.SINGLE, label: '|', description: 'Bar line' },
  { token: BARLINE_TOKENS.DOUBLE, label: '||', description: 'Double bar' },
  { token: BARLINE_TOKENS.START_REPEAT, label: '|:', description: 'Start repeat' },
  { token: BARLINE_TOKENS.END_REPEAT, label: ':|', description: 'End repeat' },
  { token: BARLINE_TOKENS.BOTH_REPEAT, label: ':|:', description: 'End/start repeat' },
  { token: BARLINE_TOKENS.FINAL, label: '|]', description: 'Final bar' },
  { token: BARLINE_TOKENS.SECTION, label: '[|', description: 'Section bar' },
];

const SIGNATURE_ITEMS = [
  {
    key: 'keyChange',
    title: 'Insert key change',
    ariaLabel: 'key change',
    testId: 'notation-insert-key-change',
  },
  {
    key: 'meterChange',
    title: 'Insert time signature change',
    ariaLabel: 'time signature change',
    testId: 'notation-insert-meter-change',
  },
];

function allBarlineToolbarItems() {
  const items = SIGNATURE_ITEMS.slice();
  BARLINE_OPTIONS.forEach(function(option) {
    items.push({
      key: option.token,
      title: option.description + ' (' + option.label + ')',
      ariaLabel: option.description,
      compact: option.label,
      menuLabel: (
        <span>
          <span className="notation-barline-menu-label">{option.label}</span>
          {' '}{option.description}
        </span>
      ),
      testId: option.token === BARLINE_TOKENS.SINGLE ? 'notation-barline-menu-item' : undefined,
    });
  });
  return items;
}

function renderSignatureIcon(kind) {
  const src = kind === 'key' ? KEY_SIGNATURE_ICON : TIME_SIGNATURE_ICON;
  return <img src={src} alt="" aria-hidden="true" className="notation-signature-icon" />;
}

function renderMenuLabel(item) {
  if (item.key === 'keyChange') {
    return (
      <span className="d-inline-flex align-items-center gap-2">
        {renderSignatureIcon('key')}
        <span>Key change</span>
      </span>
    );
  }
  if (item.key === 'meterChange') {
    return (
      <span className="d-inline-flex align-items-center gap-2">
        {renderSignatureIcon('meter')}
        <span>Time signature change</span>
      </span>
    );
  }
  return item.menuLabel || item.compact || item.title;
}

function renderCompactButtonContent(item) {
  if (item.key === 'keyChange') return renderSignatureIcon('key');
  if (item.key === 'meterChange') return renderSignatureIcon('meter');
  return item.compact || item.title;
}

export default function NotationBarlinesDropdown(props) {
  const { onInsertBarline, onInsertKeyChange, onInsertMeterChange, expanded } = props;
  const [favorites, starToggle] = useToolbarFavorites(
    BARLINE_FAVORITES_STORAGE_KEY,
    DEFAULT_BARLINE_FAVORITES
  );

  function applyItem(key) {
    if (key === 'keyChange') {
      if (typeof onInsertKeyChange === 'function') onInsertKeyChange();
      return;
    }
    if (key === 'meterChange') {
      if (typeof onInsertMeterChange === 'function') onInsertMeterChange();
      return;
    }
    if (typeof onInsertBarline === 'function') onInsertBarline(key);
  }

  const allItems = allBarlineToolbarItems();
  const favoriteItems = allItems.filter(function(item) {
    return favorites.indexOf(item.key) >= 0;
  });

  const menu = (
    <Dropdown.Menu className="notation-barlines-menu">
      <Dropdown.Header>Signatures</Dropdown.Header>
      {SIGNATURE_ITEMS.map(function(item) {
        const isFav = favorites.indexOf(item.key) >= 0;
        return (
          <NotationToolbarFavoriteMenuItem
            key={item.key}
            label={renderMenuLabel(item)}
            ariaLabel={item.ariaLabel}
            isFavorite={isFav}
            onSelect={function() { applyItem(item.key); }}
            onFavoriteToggle={function(e) { starToggle(item.key, e); }}
          />
        );
      })}
      <Dropdown.Divider />
      <Dropdown.Header>Bar lines</Dropdown.Header>
      {BARLINE_OPTIONS.map(function(option) {
        const item = allItems.find(function(entry) { return entry.key === option.token; });
        const isFav = favorites.indexOf(option.token) >= 0;
        return (
          <NotationToolbarFavoriteMenuItem
            key={option.token}
            label={renderMenuLabel(item)}
            ariaLabel={option.description}
            isFavorite={isFav}
            onSelect={function() { applyItem(option.token); }}
            onFavoriteToggle={function(e) { starToggle(option.token, e); }}
          />
        );
      })}
    </Dropdown.Menu>
  );

  const mainButton = (
    <Button
      size="lg"
      variant="outline-secondary"
      className="notation-barline-main-btn"
      title="Bar line (|)"
      onClick={function() { applyItem(BARLINE_TOKENS.SINGLE); }}
      onMouseDown={function(e) { e.preventDefault(); }}
      data-testid="notation-barline"
    >|</Button>
  );

  if (expanded) {
    return (
      <ButtonGroup className="notation-barline-expanded" data-testid="notation-barline-expanded" aria-label="Bar lines">
        {mainButton}
        {favoriteItems.map(function(item) {
          return (
            <Button
              key={item.key}
              size="lg"
              variant="outline-secondary"
              className={'notation-barline-compact-btn'
                + (item.key === 'keyChange' || item.key === 'meterChange' ? ' notation-signature-icon-btn' : '')}
              title={item.title}
              aria-label={item.ariaLabel}
              data-testid={item.testId}
              onClick={function() { applyItem(item.key); }}
              onMouseDown={function(e) { e.preventDefault(); }}
            >{renderCompactButtonContent(item)}</Button>
          );
        })}
        <Dropdown as={ButtonGroup}>
          <Dropdown.Toggle
            split
            variant="outline-secondary"
            size="lg"
            title="Choose bar line or signature"
            data-testid="notation-barline-menu"
            aria-label="Choose bar line or signature"
          />
          {menu}
        </Dropdown>
      </ButtonGroup>
    );
  }

  return (
    <Dropdown as={ButtonGroup} className="notation-barline-dropdown">
      {mainButton}
      <Dropdown.Toggle
        split
        variant="outline-secondary"
        size="lg"
        title="Choose bar line or signature"
        data-testid="notation-barline-menu"
        aria-label="Choose bar line or signature"
      />
      {menu}
    </Dropdown>
  );
}
