import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isMediaProxyConfigured,
  probeMediaResolverCandidates,
} from './mediaProxyClient';

const RETRY_MS = 2000;
const MAX_ATTEMPTS = 20;

export default function useMediaResolverHealth(options) {
  const accessToken = options && options.accessToken ? options.accessToken : null;
  const [available, setAvailable] = useState(false);
  const [checked, setChecked] = useState(false);
  const [status, setStatus] = useState(null);
  const retryTimerRef = useRef(null);
  const attemptsRef = useRef(0);

  const refresh = useCallback(function() {
    if (!isMediaProxyConfigured()) {
      setAvailable(false);
      setChecked(true);
      setStatus(null);
      return Promise.resolve(false);
    }
    return probeMediaResolverCandidates(accessToken).then(function(nextStatus) {
      setStatus(nextStatus);
      setAvailable(nextStatus.available);
      setChecked(true);
      return nextStatus.available;
    });
  }, [accessToken]);

  useEffect(function() {
    let cancelled = false;

    function scheduleRetry() {
      clearTimeout(retryTimerRef.current);
      if (cancelled || attemptsRef.current >= MAX_ATTEMPTS) return;
      retryTimerRef.current = setTimeout(function() {
        attemptsRef.current += 1;
        runCheck();
      }, RETRY_MS);
    }

    function runCheck() {
      if (cancelled || !isMediaProxyConfigured()) {
        if (!cancelled) {
          setAvailable(false);
          setChecked(true);
          setStatus(null);
        }
        return;
      }
      probeMediaResolverCandidates(accessToken).then(function(nextStatus) {
        if (cancelled) return;
        setStatus(nextStatus);
        setAvailable(nextStatus.available);
        setChecked(true);
        if (!nextStatus.available) scheduleRetry();
      });
    }

    function onFocus() {
      if (!cancelled && isMediaProxyConfigured()) {
        probeMediaResolverCandidates(accessToken).then(function(nextStatus) {
          if (!cancelled) {
            setStatus(nextStatus);
            setAvailable(nextStatus.available);
            setChecked(true);
          }
        });
      }
    }

    attemptsRef.current = 0;
    runCheck();

    function onSettingsChanged() {
      if (!cancelled) {
        attemptsRef.current = 0;
        runCheck();
      }
    }

    window.addEventListener('focus', onFocus);
    window.addEventListener('mediaProxySettingsChanged', onSettingsChanged);

    return function() {
      cancelled = true;
      clearTimeout(retryTimerRef.current);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('mediaProxySettingsChanged', onSettingsChanged);
    };
  }, [accessToken]);

  return { available, checked, status, refreshMediaResolverHealth: refresh };
}
