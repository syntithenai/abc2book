import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CHORD_RECORD_LEAVE_MESSAGE,
  confirmLeaveChordRecord,
  isChordRecordNavigationBlocked,
} from '../chordRecordNavigationGuard';

function locationKey(location) {
  if (!location) return '';
  return String(location.pathname || '') + String(location.search || '') + String(location.hash || '');
}

export default function ChordRecordNavigationGuard() {
  const location = useLocation();
  const navigate = useNavigate();
  const lastLocationRef = useRef(location);

  useEffect(function() {
    function onBeforeUnload(event) {
      if (!isChordRecordNavigationBlocked()) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return function() {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  useEffect(function() {
    if (!isChordRecordNavigationBlocked()) {
      lastLocationRef.current = location;
      return;
    }

    const previous = lastLocationRef.current;
    const previousKey = locationKey(previous);
    const nextKey = locationKey(location);

    if (previousKey === nextKey) {
      return;
    }

    if (!confirmLeaveChordRecord()) {
      navigate(previous.pathname + previous.search + previous.hash, { replace: true });
      return;
    }

    lastLocationRef.current = location;
  }, [location, navigate]);

  useEffect(function() {
    if (!isChordRecordNavigationBlocked()) {
      lastLocationRef.current = location;
    }
  }, [location]);

  return null;
}

export { CHORD_RECORD_LEAVE_MESSAGE };
