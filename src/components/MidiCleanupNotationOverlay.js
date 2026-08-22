import { useMemo } from 'react';
import { NotationPreview } from './SuggestionPreviewDialog';
import { buildCleanupScorePreviewAbc } from '../midiCleanupNotationPreview';

export default function MidiCleanupNotationOverlay(props) {
  const abc = useMemo(function() {
    return buildCleanupScorePreviewAbc(props.voices, {
      tempoBpm: props.tempoBpm,
      meter: props.meter,
      key: props.key,
      beatsPerBar: props.beatsPerBar,
      slotsPerBeat: props.slotsPerBeat,
      noteLength: props.noteLength,
      quantStrength: props.quantStrength,
    });
  }, [
    props.voices,
    props.tempoBpm,
    props.meter,
    props.key,
    props.beatsPerBar,
    props.slotsPerBeat,
    props.noteLength,
    props.quantStrength,
  ]);

  if (!abc) {
    return <div className="text-muted small py-3">No notation preview for selected tracks.</div>;
  }

  return (
    <div className="midi-cleanup-notation-overlay">
      <NotationPreview
        abc={abc}
        fitWidth={true}
        wrapToWidth={true}
        maxHeight={null}
        className="midi-cleanup-notation-preview-host"
      />
    </div>
  );
}
