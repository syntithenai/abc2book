import TimedLyricsChordsView from './TimedLyricsChordsView';
import StructureChordBlock from './StructureChordBlock';

/**
 * Lyrics (left) + structure chord block (right).
 * Structure always height-fits the viewport and stays sticky under the nav
 * so chords remain visible while lyrics scroll. Lyrics use fitHeight only
 * when the Fit height control is on.
 */
export default function LyricsStructureSyncPanel(props) {
  const {
    tune,
    tunebook,
    zoom,
    chordTranspose,
    hideChords,
    chords,
    uniqueChords,
    useInstrument,
    fitHeight,
  } = props;

  const hostClass = 'tune-lyrics-structure-sync-host'
    + (fitHeight ? ' tune-lyrics-structure-sync-host--fit-height' : '');

  return (
    <div className={hostClass}>
      <div className="tune-lyrics-structure-sync-inner">
        <div className="tune-lyrics-structure-sync-lyrics tune-panel-lyrics">
          <TimedLyricsChordsView
            tune={tune}
            tunebook={tunebook}
            chordTranspose={chordTranspose}
            hideChords={hideChords}
            suppressLeadingTitle={true}
            zoom={zoom}
            fitHeight={!!fitHeight}
          />
        </div>
        <div className="tune-lyrics-structure-sync-structure tune-panel-structure">
          <StructureChordBlock
            chords={chords}
            uniqueChords={uniqueChords}
            useInstrument={useInstrument}
            tune={tune}
            fitHeight={true}
          />
        </div>
      </div>
    </div>
  );
}
