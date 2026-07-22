import { useLayoutEffect, useState } from 'react';

/** Observe the tune toolbar container width for responsive collapse. */
export default function useMusicToolbarWidth(containerRef) {
  const [width, setWidth] = useState(0);

  useLayoutEffect(function() {
    const node = containerRef && containerRef.current;
    if (!node) return undefined;

    function measure() {
      setWidth(node.getBoundingClientRect().width);
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

  return width;
}
