import { useMemo } from 'react';
import { Modal } from 'react-bootstrap';
import Abc from './Abc';
import TimedLyricsChordsView from './TimedLyricsChordsView';
import LyricsStructureSyncPanel from './LyricsStructureSyncPanel';
import StructureChordBlock from './StructureChordBlock';
import MarkdownContent from './MarkdownContent';
import useAbcjsParser from '../useAbcjsParser';
import { filterTuneVoices } from '../abcVoiceFilter';
import { getTuneVoiceKeys, getVisibleVoiceKeys } from '../abcVoiceViewSettings';
import { tuneHasExplicitChords } from '../timedLyricsChordsDisplay';
import {
  viewModeToDisplayFlags,
  resolveDisplayFlagsForTune,
  getAvailableDisplayFlags,
  defaultViewModeForTune,
} from '../viewModeUtils';
import { resolveTuneDisplayLayout, isViewModesEmpty } from '../tuneDisplayLayout';
import { getTuneNotationFitMode } from '../notationFitSettings';
import { stripNotationDisplayMetadata, stripBlockLyricsFromDisplayAbc } from '../notation/notationDisplayAbc';
import { getTuneGigZoom } from '../gigDisplaySettings';
import { NOTATION_FIT_VERTICAL } from '../gigNotationFit';
import { tuneImportTitle } from '../importTitleMatch';

function stripNotationMeta(abcText) {
  if (!abcText) return '';
  return stripBlockLyricsFromDisplayAbc(stripNotationDisplayMetadata(abcText));
}

function buildUniqueChords(chordsText) {
  const uniqueChords = {};
  String(chordsText || '').replaceAll('|', ' ').split(' ').forEach(function(chord) {
    const token = chord.trim();
    if (!token) return;
    if (token === ':' || token === '|:' || token === ':|' || token === ':|:' || /^\[\d+$/.test(token) || /^\d+\.$/.test(token)) return;
    uniqueChords[token] = true;
  });
  return uniqueChords;
}

/**
 * Read-only single-view tune panels (no toolbar, no media engine).
 */
export function TuneSingleViewContent(props) {
  const tune = props.tune;
  const tunebook = props.tunebook;
  const abcjsParser = useAbcjsParser({ tunebook: tunebook });

  const hasChords = !!tune && tuneHasExplicitChords(tune, tunebook, abcjsParser);
  const availableFlags = useMemo(function() {
    if (!tune) {
      return { notation: true, lyrics: true, structure: true, chords: true, info: true };
    }
    return getAvailableDisplayFlags(tune, tunebook, {
      hasChords: hasChords,
      hasInfo: !!(tune.backgroundInfo && String(tune.backgroundInfo).trim()),
    });
  }, [tune, tunebook, hasChords]);

  const viewMode = useMemo(function() {
    if (!tune) return 'music';
    return tune.viewMode || defaultViewModeForTune(tune, tunebook, { hasChords: hasChords });
  }, [tune, tunebook, hasChords]);

  const viewFlags = useMemo(function() {
    if (!tune) return viewModeToDisplayFlags(viewMode);
    return resolveDisplayFlagsForTune(
      viewModeToDisplayFlags(viewMode),
      tune,
      tunebook,
      { hasChords: hasChords }
    );
  }, [viewMode, tune, tunebook, hasChords]);

  const layout = useMemo(function() {
    return resolveTuneDisplayLayout(viewFlags);
  }, [viewFlags]);

  if (!tune || !tunebook) return null;

  const visibleVoiceKeys = getVisibleVoiceKeys(tune.id, getTuneVoiceKeys(tune));
  const notationTune = filterTuneVoices(tune, visibleVoiceKeys);
  const tuneTranspose = Number(tune.transpose) || 0;
  const chordTranspose = tuneTranspose;
  const notationVisualTranspose = chordTranspose;
  const notationFitMode = getTuneNotationFitMode(tune, visibleVoiceKeys);
  const lyricsZoom = getTuneGigZoom(tune) || 1.2;
  const notationVisible = !!viewFlags.notation && viewFlags.notation !== 'off';
  const lyricsVisible = !!viewFlags.lyrics;
  const structureVisible = !!viewFlags.structure && hasChords;
  const chordsAnnotate = !!viewFlags.chords;
  const syncLyricsStructure = !!layout.syncLyricsStructure;
  const viewModesEmpty = isViewModesEmpty(viewFlags, availableFlags);
  const fitHeightOn = notationFitMode === NOTATION_FIT_VERTICAL;
  const lyricsStructureFitHeight = fitHeightOn && !notationVisible && syncLyricsStructure;
  const lyricsFitHeight = fitHeightOn && !notationVisible && lyricsVisible && !syncLyricsStructure;
  const structureFitHeight = structureVisible && !syncLyricsStructure;

  const firstVoice = notationTune.voices && Object.keys(notationTune.voices).length > 0
    ? Object.values(notationTune.voices)[0]
    : { notes: [] };
  const chords = abcjsParser.renderChords(
    tunebook.abcTools.emptyABC(tune.name) + (firstVoice.notes || []).join('\n'),
    false,
    chordTranspose,
    tune.key,
    tune.noteLength,
    tune.meter
  );
  const uniqueChords = buildUniqueChords(chords);
  const useInstrument = localStorage.getItem('bookstorage_last_chord_instrument')
    ? localStorage.getItem('bookstorage_last_chord_instrument')
    : 'guitar';
  const notationAbc = stripNotationMeta(tunebook.abcTools.json2abc(notationTune));
  const backgroundInfoText = typeof tune.backgroundInfo === 'string' ? tune.backgroundInfo.trim() : '';
  const tuneBooks = Array.isArray(tune.books)
    ? tune.books.map(function(item) { return String(item || '').trim(); }).filter(Boolean)
    : [];
  const tuneTags = Array.isArray(tune.tags)
    ? tune.tags.map(function(item) { return String(item || '').trim(); }).filter(Boolean)
    : [];

  return (
    <div className="tune-single-view-dialog-content music-single music-single--preview">
      <div
        className={'music-single-panels tune-display-panels ' + layout.layoutClass + (fitHeightOn ? ' music-panels-fit-height' : '')}
      >
        {viewModesEmpty ? (
          <div className="tune-view-modes-empty" role="status">
            <div className="tune-view-modes-empty-title">
              {tune.name}
              {tune.composer ? <span className="tune-view-modes-empty-composer"> by {tune.composer}</span> : null}
            </div>
            <div>No view modes enabled</div>
          </div>
        ) : null}

        {notationVisible ? (
          <div
            className={'music-body-notation tune-panel-notation' + (!chordsAnnotate ? ' no-inline-chords' : '') + (layout.main === 'notation' ? ' tune-slot-main' : '') + (layout.side === 'notation' ? ' tune-slot-side' : '')}
          >
            <div style={{ paddingLeft: '0.7em', paddingRight: '0.7em' }}>
              <Abc
                showRepeats={true}
                autoStart={false}
                autoPrime={false}
                autoScroll={false}
                tunes={{}}
                editableTempo={false}
                repeat={notationTune.repeats > 0 ? notationTune.repeats : 1}
                tunebook={tunebook}
                abc={notationAbc}
                meter={notationTune.meter}
                fitMode={notationFitMode}
                hideSvg={false}
                hidePlayer={true}
                visualTranspose={notationVisualTranspose}
                playbackEngine={false}
                tablatureSourceTune={tune}
                tablatureVoiceKeys={visibleVoiceKeys}
              />
            </div>
          </div>
        ) : null}

        {lyricsVisible ? (
          <div
            className={'music-body-lyrics tune-panel-lyrics' + (syncLyricsStructure ? ' tune-panel-lyrics-structure-sync' : '') + (layout.main === 'lyrics' ? ' tune-slot-main' : '') + (layout.side === 'lyrics' ? ' tune-slot-side' : '') + (layout.below === 'lyrics' ? ' tune-slot-below' : '') + (layout.wrapLyricsAroundStructure ? ' tune-lyrics-wrap' : '')}
          >
            <div className="lyrics-panel-inner">
              {syncLyricsStructure ? (
                <LyricsStructureSyncPanel
                  tune={tune}
                  tunebook={tunebook}
                  chordTranspose={chordTranspose}
                  hideChords={!chordsAnnotate}
                  zoom={lyricsZoom > 0 ? lyricsZoom : 1}
                  fitHeight={lyricsStructureFitHeight}
                  chords={chords}
                  uniqueChords={uniqueChords}
                  useInstrument={useInstrument}
                />
              ) : (
                <TimedLyricsChordsView
                  tune={tune}
                  tunebook={tunebook}
                  chordTranspose={chordTranspose}
                  hideChords={!chordsAnnotate}
                  suppressLeadingTitle={true}
                  zoom={lyricsZoom > 0 ? lyricsZoom : 1}
                  fitHeight={lyricsFitHeight}
                />
              )}
            </div>
          </div>
        ) : null}

        {structureVisible && !syncLyricsStructure ? (
          <div
            className={'music-body-chords tune-panel-structure' + (layout.main === 'structure' ? ' tune-slot-main' : '') + (layout.side === 'structure' ? ' tune-slot-side' : '')}
          >
            <StructureChordBlock
              chords={chords}
              uniqueChords={uniqueChords}
              useInstrument={useInstrument}
              tune={tune}
              fitHeight={structureFitHeight}
            />
          </div>
        ) : null}
      </div>

      {(viewFlags.info && backgroundInfoText) || tuneBooks.length > 0 || tuneTags.length > 0 ? (
        <div className="music-single-footer-meta">
          {viewFlags.info && backgroundInfoText ? (
            <div className="music-tune-info-section">
              <div className="tune-background-info-view">
                <MarkdownContent text={backgroundInfoText} />
              </div>
            </div>
          ) : null}
          {tuneBooks.length > 0 || tuneTags.length > 0 ? (
            <div className="music-single-books-tags" aria-label="Books and tags">
              {tuneBooks.length > 0 ? (
                <div className="music-single-books-tags-row">
                  <span className="music-single-books-tags-label">Books</span>
                  <div className="music-single-books-tags-buttons">
                    {tuneBooks.map(function(book, idx) {
                      return <span key={'book-' + idx} className="badge bg-light text-dark border">{book}</span>;
                    })}
                  </div>
                </div>
              ) : null}
              {tuneTags.length > 0 ? (
                <div className="music-single-books-tags-row">
                  <span className="music-single-books-tags-label">Tags</span>
                  <div className="music-single-books-tags-buttons">
                    {tuneTags.map(function(tag, idx) {
                      return <span key={'tag-' + idx} className="badge bg-light text-dark border">{tag}</span>;
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function TuneSingleViewDialog(props) {
  const show = !!props.show && !!props.tune;
  const tune = props.tune;

  return (
    <Modal
      show={show}
      onHide={props.onClose}
      size="xl"
      dialogClassName="tune-single-view-dialog"
      container={typeof document !== 'undefined' ? document.body : undefined}
      enforceFocus={false}
    >
      <Modal.Header closeButton>
        <Modal.Title>{tuneImportTitle(tune)}</Modal.Title>
      </Modal.Header>
      <Modal.Body className="tune-single-view-dialog-body" style={{ maxHeight: '80vh', overflow: 'auto' }}>
        {show ? (
          <TuneSingleViewContent tune={tune} tunebook={props.tunebook} />
        ) : null}
      </Modal.Body>
    </Modal>
  );
}
