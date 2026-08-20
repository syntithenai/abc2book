import { Button } from 'react-bootstrap'

const LINKS_TOOLBAR_BTN_STYLE = { color: 'black' }

export default function LinksEditorRecordControls(props) {
    const icons = props.icons || {}
    const isRecording = !!props.isRecording
    const isSaving = !!props.isSaving
    const recordingDuration = Number(props.recordingDuration) || 0

    if (isRecording && !isSaving) {
        return (
            <>
                <Button
                    className="links-editor-toolbar-btn"
                    variant="danger"
                    style={LINKS_TOOLBAR_BTN_STYLE}
                    aria-label="Stop recording"
                    title="Stop recording"
                    data-testid="links-editor-stop-recording"
                    onClick={props.onStop}
                >
                    <span className="links-editor-toolbar-btn-icon" aria-hidden="true">{icons.stopsmall}</span>
                    <span className="links-editor-toolbar-btn-label">Stop recording</span>
                </Button>
                <Button
                    className="links-editor-toolbar-btn"
                    variant="outline-danger"
                    disabled
                    aria-label="Recording duration"
                >
                    {recordingDuration + 1}s
                </Button>
            </>
        )
    }

    return (
        <Button
            className="links-editor-toolbar-btn"
            variant="primary"
            style={LINKS_TOOLBAR_BTN_STYLE}
            aria-label={isSaving ? 'Saving recording' : 'Record'}
            title={isSaving ? 'Saving recording' : 'Record'}
            aria-busy={isSaving ? 'true' : undefined}
            disabled={isSaving || !!props.disabled}
            data-testid="links-editor-record-button"
            onClick={props.onRecord}
        >
            <span
                className={'links-editor-toolbar-btn-icon' + (isSaving ? ' is-waiting' : '')}
                aria-hidden="true"
            >
                {isSaving ? (icons.waiting || icons.recordcircle) : icons.recordcircle}
            </span>
            <span className="links-editor-toolbar-btn-label">
                {isSaving ? 'Saving' : 'Record'}
            </span>
        </Button>
    )
}
