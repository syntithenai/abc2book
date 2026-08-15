import TimedLyricsChordsView from './TimedLyricsChordsView';
import StructureChordBlock from './StructureChordBlock';

/**
 * Lyrics (left) + structure chord block (right).
 * Structure height-fits the sticky panel (shrink only; otherwise scrolls).
 * Lyrics use fitHeight when the Fit height control is on.
 */
export default function LyricsStructureSyncPanel(props) {
  const {
    tune,
    tunebook,
    zoom,
    chordTranspose,
    hideChords,
    chords,
    melodyNoteLines,
    uniqueChords,
    useInstrument,
    fitHeight,
    showCapoControl,
    capoOffset,
    capoEnabled,
    onCapoToggle,
    onCapoOffsetChange,
    lyricsHeader,
  } = props;

  const lyricsZoom = zoom > 0 ? zoom : 1;
  const hostClass = 'tune-lyrics-structure-sync-host'
    + (fitHeight ? ' tune-lyrics-structure-sync-host--fit-height' : '');

  return (
    <div className={hostClass}>
      <div className="tune-lyrics-structure-sync-inner">
        <div
          className="tune-lyrics-structure-sync-lyrics tune-panel-lyrics lyrics-zoom-host"
          style={{ fontSize: lyricsZoom + 'em' }}
        >
          {lyricsHeader ? (
            <div className="lyrics-panel-header">{lyricsHeader}</div>
          ) : null}
          <TimedLyricsChordsView
            tune={tune}
            tunebook={tunebook}
            chordTranspose={chordTranspose}
            hideChords={hideChords}
            suppressLeadingTitle={true}
            inheritZoom={true}
            fitHeight={!!fitHeight}
          />
        </div>
        <div className="tune-lyrics-structure-sync-structure tune-panel-structure">
          <StructureChordBlock
            chords={chords}
            melodyNoteLines={melodyNoteLines}
            uniqueChords={uniqueChords}
            useInstrument={useInstrument}
            tune={tune}
            chordTranspose={chordTranspose}
            fitHeight={true}
            fitHeightGrow={false}
            showCapoControl={showCapoControl}
            capoOffset={capoOffset}
            capoEnabled={capoEnabled}
            onCapoToggle={onCapoToggle}
            onCapoOffsetChange={onCapoOffsetChange}
          />
        </div>
      </div>
    </div>
  );
}
