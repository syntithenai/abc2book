import { useCallback, useEffect, useState } from 'react';
import MidiImportWizard from './components/MidiImportWizard';
import { pendingMidiFromBytes, pendingMidiFromFile } from './midiImportDetect';
import { getActiveResolverAccessToken } from './mediaResolverHealthStore';
import { resolveResolverAccessToken } from './resolverAccessToken';

let wizardHostApi = null;

/**
 * Register host callbacks from a mounted MidiImportWizardHost component.
 */
export function registerMidiImportWizardHost(api) {
  wizardHostApi = api;
}

export function openMidiImportWizard(options) {
  if (!wizardHostApi || typeof wizardHostApi.open !== 'function') {
    return Promise.reject(new Error('MIDI import wizard is not available'));
  }
  return wizardHostApi.open(options);
}

export function MidiImportWizardHost(props) {
  const [show, setShow] = useState(false);
  const [pendingMidi, setPendingMidi] = useState(null);
  const [resolver, setResolver] = useState(null);
  const [sessionAccessToken, setSessionAccessToken] = useState(null);

  const handleComplete = useCallback(function(payload) {
    if (resolver && resolver.resolve) {
      resolver.resolve(payload);
    }
    setShow(false);
    setPendingMidi(null);
    setResolver(null);
    setSessionAccessToken(null);
  }, [resolver]);

  const handleClose = useCallback(function() {
    if (resolver && resolver.reject) {
      resolver.reject(new Error('MIDI import cancelled'));
    }
    setShow(false);
    setPendingMidi(null);
    setResolver(null);
    setSessionAccessToken(null);
  }, [resolver]);

  const open = useCallback(async function(options) {
    const opts = options || {};
    let pending = opts.pendingMidi;
    if (!pending && opts.file) {
      const buffer = await opts.file.arrayBuffer();
      pending = await pendingMidiFromBytes(new Uint8Array(buffer), opts.file.name, opts.sourceUrl);
    }
    if (!pending && opts.midiBytes) {
      pending = await pendingMidiFromBytes(opts.midiBytes, opts.fileName, opts.sourceUrl);
    }
    if (!pending) {
      throw new Error('No MIDI data for wizard');
    }
    const sessionToken = resolveResolverAccessToken(opts.accessToken)
      || getActiveResolverAccessToken()
      || resolveResolverAccessToken(props.accessToken);
    return new Promise(function(resolve, reject) {
      setSessionAccessToken(sessionToken || null);
      setPendingMidi(pending);
      setResolver({ resolve: resolve, reject: reject });
      setShow(true);
    });
  }, [props.accessToken]);

  useEffect(function() {
    registerMidiImportWizardHost({ open: open });
    return function() {
      registerMidiImportWizardHost(null);
    };
  }, [open]);

  return (
    <MidiImportWizard
      show={show}
      pendingMidi={pendingMidi}
      accessToken={sessionAccessToken != null ? sessionAccessToken : props.accessToken}
      tunebook={props.tunebook}
      abcjsParser={props.abcjsParser}
      book={props.book}
      onComplete={handleComplete}
      onClose={handleClose}
    />
  );
}

export async function midiFileToWizardPending(file, sourceUrl) {
  if (!file) return null;
  const buffer = await file.arrayBuffer();
  return pendingMidiFromBytes(new Uint8Array(buffer), file.name, sourceUrl);
}

export { pendingMidiFromFile };
