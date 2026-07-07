import { useEffect } from 'react';
import { resolveNotationAction } from '../notation/notationShortcuts';

export default function NotationInputHandler(props) {
  const { containerRef, onAction, enabled } = props;

  useEffect(function() {
    if (!enabled) return undefined;
    const node = containerRef && containerRef.current;
    if (!node) return undefined;

    function onKeyDown(event) {
      const target = event.target;
      const tag = target && target.tagName ? String(target.tagName).toLowerCase() : '';
      if (tag === 'textarea' || tag === 'input' || tag === 'select') return;
      if (target && target.closest && target.closest('.piano-roll-workspace')) return;
      const action = resolveNotationAction(event, {});
      if (!action) return;
      event.preventDefault();
      onAction(action, event);
    }

    node.addEventListener('keydown', onKeyDown);
    return function() { node.removeEventListener('keydown', onKeyDown); };
  }, [containerRef, enabled, onAction]);

  return null;
}
