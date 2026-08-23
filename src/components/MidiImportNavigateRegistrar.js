import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerMidiImportNavigate } from '../midiImportPendingStore';

/** Always-mounted registrar so openMidiImportWizard can navigate before the page loads. */
export default function MidiImportNavigateRegistrar() {
  const navigate = useNavigate();
  useEffect(function() {
    registerMidiImportNavigate(navigate);
    return function() {
      // Only clear if we are still the active navigate (avoids StrictMode
      // cleanup of an older effect wiping a newer registration).
      registerMidiImportNavigate(null, navigate);
    };
  }, [navigate]);
  return null;
}
