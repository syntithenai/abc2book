import { Button, ProgressBar } from 'react-bootstrap';
import useMediaResolverHealth from '../useMediaResolverHealth';
import useTuneMediaAnalysis from '../useTuneMediaAnalysis';
import './MediaImportWizard.css';

export default function MediaImportEntryButton(props) {
  const { available, checked, features } = useMediaResolverHealth();
  const { isAnalyzing, status, progress } = useTuneMediaAnalysis({ tune: props.tune });

  if (!checked) {
    return null;
  }

  const showAnalysisState = available && features.whisper && isAnalyzing;
  const label = showAnalysisState ? (status || 'Analyzing...') : 'Import from media';

  return (
    <div className="media-import-entry-button">
      <Button
        variant={showAnalysisState ? 'warning' : 'success'}
        onClick={props.onOpen}
      >
        {label}
      </Button>
      {showAnalysisState && (
        <ProgressBar
          now={progress || 0}
          label={`${progress || 0}%`}
          animated
          striped
          className="media-import-entry-progress"
        />
      )}
    </div>
  );
}
