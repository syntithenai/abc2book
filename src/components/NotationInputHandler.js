import { useEffect, useRef } from 'react';
import { resolveNotationAction } from '../notation/notationShortcuts';

/**
 * Staff/keyboard shortcuts for the notation editor.
 *
 * Listens on document so note-input still works after a staff click that leaves
 * focus on body / playlist chrome (common with abcjs SVG hit targets).
 */
export default function NotationInputHandler(props) {
  const { containerRef, onAction, enabled, noteInputActive } = props;
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  useEffect(function() {
    if (!enabled) return undefined;

    function onKeyDown(event) {
      const target = event.target;
      const tag = target && target.tagName ? String(target.tagName).toLowerCase() : '';
      if (tag === 'textarea' || tag === 'input' || tag === 'select') return;
      if (target && target.isContentEditable) return;
      if (target && target.closest && target.closest('.piano-roll-workspace')) return;
      if (target && target.closest && target.closest('.modal.show')) return;

      const node = containerRef && containerRef.current;
      if (!node) return;

      const active = document.activeElement;
      const focusInside = !!(active && (active === node || node.contains(active)));
      if (!focusInside && !noteInputActive) return;

      const action = resolveNotationAction(event, {});
      if (!action) return;
      event.preventDefault();
      if (typeof onActionRef.current === 'function') onActionRef.current(action, event);
    }

    document.addEventListener('keydown', onKeyDown);
    return function() { document.removeEventListener('keydown', onKeyDown); };
  }, [containerRef, enabled, noteInputActive]);

  return null;
}
