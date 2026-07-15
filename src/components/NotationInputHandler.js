import { useEffect, useRef } from 'react';
import { resolveNotationAction } from '../notation/notationShortcuts';

/**
 * Staff/keyboard shortcuts for the notation editor.
 *
 * Listens on document so shortcuts still work after a staff click that leaves
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
      const inAbcTextarea = !!(target && target.closest && target.closest('.notation-abc-textarea-wrap'));
      // While entering notes, keep A–G (etc.) for the staff even if Lyrics/search stole focus.
      // Still yield to the ABC source textarea — that is intentional text editing.
      if (inAbcTextarea) return;
      if (!noteInputActive) {
        if (tag === 'textarea' || tag === 'input' || tag === 'select') return;
        if (target && target.isContentEditable) return;
      } else if (tag === 'select') {
        return;
      }
      if (target && target.closest && target.closest('.piano-roll-workspace')) return;
      if (target && target.closest && target.closest('.modal.show')) return;

      const node = containerRef && containerRef.current;
      if (!node) return;

      // Do not require focus inside the editor: staff SVG clicks often leave focus on
      // body/chrome. Header already yields arrows on notation music tabs.
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
