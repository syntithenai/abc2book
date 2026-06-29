import { Button, ProgressBar } from 'react-bootstrap';
import useMediaResolverHealth from '../useMediaResolverHealth';
import useTuneMediaAnalysis from '../useTuneMediaAnalysis';
import './MediaImportWizard.css';

export default function MediaImportEntryButton(props) {
  const { available, checked } = useMediaResolverHealth();
  const { isAnalyzing, status, progress } = useTuneMediaAnalysis({ tune: props.tune });

  if (!checked || !available) {
    return null;
  }

  const label = isAnalyzing ? (status || 'Analyzing...') : 'Import from media';

  return (
    <div className="media-import-entry-button">
      <Button
        variant={isAnalyzing ? 'warning' : 'success'}
        onClick={props.onOpen}
      >
        {label}
      </Button>
      {isAnalyzing && (
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
