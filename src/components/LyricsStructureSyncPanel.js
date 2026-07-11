import { useRef } from 'react';
import TimedLyricsChordsView from './TimedLyricsChordsView';
import StructureChordBlock from './StructureChordBlock';
import { useFitTextScale } from '../useFitTextScale';

/**
 * Lyrics (left) + structure chord block (right) in one scroll container.
 * When fitHeight is on, both columns share one font scale and scroll together.
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

  const structureColRef = useRef(null);
  const fit = useFitTextScale({
    fitHeight: !!fitHeight,
    measureLongestLine: true,
    widthColumnRef: structureColRef,
    minScale: 0.35,
    maxScale: 4.5,
    padX: 16,
    padY: 16,
    deps: [
      fitHeight,
      hideChords,
      tune && tune.id,
      zoom,
      chordTranspose,
      chords,
    ],
  });

  const hostClass = 'tune-lyrics-structure-sync-host'
    + (fitHeight ? ' tune-lyrics-structure-sync-host--fit-height' : '')
    + (fit.overflows ? ' tune-lyrics-structure-sync-host--scrollable' : '');

  return (
    <div
      className={hostClass}
      ref={fitHeight ? fit.containerRef : null}
      style={fitHeight ? {
        flex: '1 1 auto',
        minHeight: 0,
        overflow: fit.overflows ? 'auto' : 'hidden',
        display: 'flex',
        flexDirection: 'column',
      } : undefined}
    >
      <div
        className="tune-lyrics-structure-sync-inner"
        ref={fitHeight ? fit.contentRef : null}
        style={fitHeight ? { fontSize: fit.fontScale + 'em' } : undefined}
      >
        <div className="tune-lyrics-structure-sync-lyrics tune-panel-lyrics">
          <TimedLyricsChordsView
            tune={tune}
            tunebook={tunebook}
            chordTranspose={chordTranspose}
            hideChords={hideChords}
            suppressLeadingTitle={true}
            zoom={zoom}
            inheritZoom={!!fitHeight}
            fitHeight={false}
          />
        </div>
        <div
          className="tune-lyrics-structure-sync-structure tune-panel-structure"
          ref={structureColRef}
        >
          <StructureChordBlock
            chords={chords}
            uniqueChords={uniqueChords}
            useInstrument={useInstrument}
            tune={tune}
            inheritScale={!!fitHeight}
            fitHeight={false}
          />
        </div>
      </div>
    </div>
  );
}
