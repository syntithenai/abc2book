import { Alert } from 'react-bootstrap'
import TuneMediaAnalysisButton from './TuneMediaAnalysisButton'
import useTuneMediaAnalysis from '../useTuneMediaAnalysis'

export default function LyricsTranscriptionControls({
  tune,
  buttonStyle,
}) {
  const { analysis, isAnalyzing, status } = useTuneMediaAnalysis({ tune })

  return (
    <>
      <TuneMediaAnalysisButton
        label="Transcribe"
        activeLabel="Transcribing..."
        buttonStyle={buttonStyle}
      />
      {isAnalyzing && status && (
        <Alert variant="warning" style={{ marginTop: '0.8em', clear: 'both' }}>
          {status} You can leave this page; analysis will continue in the background.
        </Alert>
      )}
      {!isAnalyzing && analysis && analysis.formatted && analysis.formatted.lyricsText && (
        <Alert variant="info" style={{ marginTop: '0.8em', clear: 'both' }}>
          Transcription finished. Use the merge tools below to compare and apply lyrics.
        </Alert>
      )}
    </>
  )
}
