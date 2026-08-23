import React from 'react';
import MidiImportEditor from '../components/MidiImportEditor';
import useAbcjsParser from '../useAbcjsParser';
import { useDocumentTitle } from '../pageTitle';

export default function MidiImportPage(props) {
  useDocumentTitle('MIDI Import');
  const abcjsParser = useAbcjsParser();

  // Navigation is registered by MidiImportNavigateRegistrar (always mounted).
  // Do not register/unregister here — StrictMode remount cleanup was clearing
  // hostNavigate and dropping the pending file handoff.

  return (
    <MidiImportEditor
      tunebook={props.tunebook}
      book={props.book}
      abcjsParser={abcjsParser}
      accessToken={props.accessToken}
      onComplete={props.onComplete}
    />
  );
}
