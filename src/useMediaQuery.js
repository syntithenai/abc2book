import { useEffect, useState } from 'react';

/**
 * Viewport-based layout queries. Use for column stacking, toolbar reflow, etc.
 * For platform/touch behavior (e.g. disabled tune-list chips), use isMobilePlatform().
 */
export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(function() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(function() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia(query);
    function handler(e) {
      setMatches(e.matches);
    }
    mql.addEventListener('change', handler);
    setMatches(mql.matches);
    return function() {
      mql.removeEventListener('change', handler);
    };
  }, [query]);

  return matches;
}

export function useIsNarrowViewport() {
  return useMediaQuery('(max-width: 768px)');
}

export function useIsCompactViewport() {
  return useMediaQuery('(max-width: 620px)');
}

export function useIsHeaderAuthHidden() {
  return useMediaQuery('(max-width: 480px)');
}

/** Playback collapses into the nav dropdown only when the header cannot fit in one row. */
export function useIsHeaderPlaybackInMenu() {
  return useMediaQuery('(max-width: 420px)');
}
