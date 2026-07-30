import { useState, useEffect } from 'react';
import {
  loadToolbarFavorites,
  saveToolbarFavorites,
  toggleToolbarFavorite,
} from './toolbarExpand';

export default function useToolbarFavorites(storageKey, defaultKeys) {
  const [favorites, setFavorites] = useState(function() {
    return loadToolbarFavorites(storageKey, defaultKeys);
  });

  useEffect(function() {
    saveToolbarFavorites(storageKey, favorites);
  }, [storageKey, favorites]);

  function starToggle(key, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    setFavorites(function(prev) { return toggleToolbarFavorite(prev, key); });
  }

  return [favorites, starToggle];
}
