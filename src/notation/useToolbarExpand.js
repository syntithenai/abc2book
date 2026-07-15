import { useEffect, useState } from 'react';
import { expandFlagsForWidth } from './toolbarExpand';

/** Observe container width and return expand flags for notation toolbars. */
export default function useToolbarExpand(containerRef) {
  const [flags, setFlags] = useState(function() {
    return expandFlagsForWidth(1200);
  });

  useEffect(function() {
    const node = containerRef && containerRef.current;
    if (!node) return undefined;

    function measure() {
      const w = node.getBoundingClientRect().width;
      setFlags(expandFlagsForWidth(w));
    }

    measure();
    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(node);
    }
    window.addEventListener('resize', measure);
    return function() {
      if (observer) observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [containerRef]);

  return flags;
}
