import { Button, ProgressBar } from 'react-bootstrap';
import useMediaResolverHealth from '../useMediaResolverHealth';
import useTuneMediaAnalysis from '../useTuneMediaAnalysis';
import './MediaImportWizard.css';

function getUnavailableTitle(checked, available, whisper, disabled) {
  if (!checked) return 'Checking media resolver...';
  if (!available) return 'Media resolver is not available';
  if (!whisper) return 'Media analysis is not available on this resolver';
  if (disabled) return 'Add a media link first';
  return '';
}

export default function MediaImportEntryButton(props) {
  const { available, checked, features } = useMediaResolverHealth();
  const { isAnalyzing, status, progress } = useTuneMediaAnalysis({ tune: props.tune });

  const whisper = !!features.whisper;
  const canAnalyze = checked && available && whisper;
  const showAnalysisState = canAnalyze && isAnalyzing;
  const idleLabel = props.label || 'Import from media';
  const label = showAnalysisState ? (status || 'Analyzing...') : idleLabel;
  const compact = !!props.compact;
  const disabled = !canAnalyze || !!props.disabled || showAnalysisState;
  const title = props.title || getUnavailableTitle(checked, available, whisper, props.disabled);

  return (
    <div className={'media-import-entry-button' + (compact ? ' media-import-entry-button-compact' : '') + (props.className ? ' ' + props.className : '')}>
      <Button
        variant={showAnalysisState ? 'warning' : (compact ? 'outline-secondary' : 'success')}
        size={compact ? 'sm' : undefined}
        disabled={disabled}
        title={title}
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
