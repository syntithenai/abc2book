import React from 'react';
import Dropdown from 'react-bootstrap/Dropdown';
import OriginalDropdownMenu from 'react-bootstrap/DropdownMenu';

const POSITION_FIX_MODIFIER_NAME = 'abc2bookDropdownPositionFix';

/**
 * Popper can measure a dropdown menu before its first layout pass (height 0),
 * flip it above the toggle, then place it correctly on the next open once the
 * menu has been shown once. Schedule a post-paint update on each open.
 */
export function withDropdownPositionFix(userPopperConfig) {
  function appendFixModifier(config) {
    const base = config && typeof config === 'object' ? config : {};
    const modifiers = Array.isArray(base.modifiers) ? base.modifiers.slice() : [];
    if (modifiers.some(function(m) { return m && m.name === POSITION_FIX_MODIFIER_NAME; })) {
      return base;
    }
    modifiers.push({
      name: POSITION_FIX_MODIFIER_NAME,
      enabled: true,
      phase: 'afterWrite',
      fn: function({ state, instance }) {
        const popperEl = state.elements.popper;
        if (!popperEl || !popperEl.classList.contains('show')) {
          if (popperEl) delete popperEl.dataset.abc2bookPositionFixOpen;
          return;
        }
        if (popperEl.dataset.abc2bookPositionFixOpen === '1') return;
        popperEl.dataset.abc2bookPositionFixOpen = '1';
        requestAnimationFrame(function() {
          requestAnimationFrame(function() {
            if (!popperEl.classList.contains('show')) return;
            instance.update();
          });
        });
      },
    });
    return Object.assign({}, base, { modifiers: modifiers });
  }

  if (typeof userPopperConfig === 'function') {
    return function popperConfig(options) {
      return appendFixModifier(userPopperConfig(options));
    };
  }
  return appendFixModifier(userPopperConfig);
}

const PatchedDropdownMenu = React.forwardRef(function PatchedDropdownMenu(props, ref) {
  const userPopperConfig = props.popperConfig;
  const popperConfig = React.useMemo(
    function() { return withDropdownPositionFix(userPopperConfig); },
    [userPopperConfig]
  );
  return (
    <OriginalDropdownMenu
      {...props}
      ref={ref}
      popperConfig={popperConfig}
    />
  );
});

PatchedDropdownMenu.displayName = 'DropdownMenu';

Dropdown.Menu = PatchedDropdownMenu;
