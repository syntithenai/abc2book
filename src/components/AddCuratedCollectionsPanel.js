/**
 * Curated tunebook browser for Add chrome / Bulk page.
 */
import ImportCollectionsAccordion from './ImportCollectionsAccordion';
import ImportCollectionModal from './ImportCollectionModal';

export default function AddCuratedCollectionsPanel(props) {
  return (
    <div className="add-curated-collections-panel" data-testid="add-curated-panel">
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
        <div>
          <h5 className="mb-1">Curated collections</h5>
          <p className="text-muted small mb-0">
            Import a ready-made tunebook. Updates match by tune id and skip tunes that are newer locally.
          </p>
        </div>
        <ImportCollectionModal
          label="Browse…"
          tunebook={props.tunebook}
          setCurrentTuneBook={props.setCurrentTuneBook}
          currentTuneBook={props.currentTuneBook}
          forceRefresh={props.forceRefresh}
        />
      </div>
      <ImportCollectionsAccordion
        tunebook={props.tunebook}
        setCurrentTuneBook={props.setCurrentTuneBook}
        startCollapsed={props.startCollapsed === true}
      />
    </div>
  );
}
