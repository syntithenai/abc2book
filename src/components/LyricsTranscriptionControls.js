import { Alert } from 'react-bootstrap'
import TuneMediaAnalysisButton from './TuneMediaAnalysisButton'
import useTuneMediaAnalysis from '../useTuneMediaAnalysis'

export default function LyricsTranscriptionControls({
  buttonStyle,
}) {
  const { analysis } = useTuneMediaAnalysis()

  return (
    <>
      <TuneMediaAnalysisButton
        label="Transcribe"
        activeLabel="Transcribing..."
        buttonStyle={buttonStyle}
      />
      {analysis && analysis.formatted && analysis.formatted.lyricsText && (
        <Alert variant="success" style={{ marginTop: '0.8em', clear: 'both' }}>
          Lyrics from the latest analysis are already in the editor below. Use the back arrow above to undo if needed.
        </Alert>
      )}
    </>
  )
}
