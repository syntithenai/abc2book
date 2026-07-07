import React from 'react';
import { Button, ButtonGroup, Dropdown } from 'react-bootstrap';
import { MARK_MENU_GROUPS } from '../notation/notationTokens';

export default function NotationMarksDropdown(props) {
  const { onToggleTie, onMarkAction } = props;

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
      <Dropdown.Menu className="notation-marks-menu">
        {MARK_MENU_GROUPS.map(function(group, gi) {
          return (
            <React.Fragment key={group.header}>
              {gi > 0 ? <Dropdown.Divider /> : null}
              <Dropdown.Header>{group.header}</Dropdown.Header>
              {group.items.map(function(item) {
                const label = item.shortcut
                  ? item.label + ' (' + item.shortcut + ')'
                  : item.label;
                return (
                  <Dropdown.Item
                    key={item.key}
                    onClick={function() { onMarkAction(item.key); }}
                  >{label}</Dropdown.Item>
                );
              })}
            </React.Fragment>
          );
        })}
      </Dropdown.Menu>
    </Dropdown>
  );
}
