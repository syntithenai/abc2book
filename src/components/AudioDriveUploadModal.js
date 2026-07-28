import { useEffect, useState } from 'react';
import { Modal, Button } from 'react-bootstrap';
import {
  getDefaultAudioDriveUpload,
  preferenceFromUploadSelection,
  setDefaultAudioDriveUpload,
} from '../audioDriveUploadPrefs';
import SelectAllToggle from './SelectAllToggle';
import CheckToggleButton from './CheckToggleButton';

export default function AudioDriveUploadModal(props) {
  const files = Array.isArray(props.files) ? props.files : [];
  const loggedIn = !!props.loggedIn;
  const [uploadSelected, setUploadSelected] = useState([]);

  useEffect(function() {
    if (props.show && files.length > 0) {
      const defaultSelected = getDefaultAudioDriveUpload();
      setUploadSelected(files.map(function() { return defaultSelected; }));
    }
  }, [props.show, files.length]);

  function handleClose() {
    if (typeof props.onCancel === 'function') props.onCancel();
  }

  function setAllSelected(selected) {
    setUploadSelected(files.map(function() { return selected; }));
  }

  function toggleFile(index) {
    setUploadSelected(function(prev) {
      const next = prev.slice();
      next[index] = !next[index];
      return next;
    });
  }

  function handleConfirm() {
    const flags = uploadSelected.slice();
    setDefaultAudioDriveUpload(preferenceFromUploadSelection(flags));
    if (typeof props.onConfirm === 'function') {
      props.onConfirm(flags);
    }
  }

  const selectedCount = uploadSelected.filter(Boolean).length;

  return (
    <Modal show={!!props.show} onHide={handleClose} centered dialogClassName="audio-drive-upload-modal">
      <Modal.Header closeButton>
        <Modal.Title>Upload to Google Drive?</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loggedIn ? (
          <p className="audio-drive-upload-modal-intro">
            Choose which files to upload to Google Drive. All audio is always saved locally on this device.
          </p>
        ) : (
          <p className="audio-drive-upload-modal-intro">
            Choose which files to upload to Google Drive when you sign in. All audio is saved locally until then.
          </p>
        )}
        {files.length > 0 && (
          <div className="audio-drive-upload-modal-select-actions select-all-host">
            <SelectAllToggle
              size="sm"
              totalCount={files.length}
              selectedCount={selectedCount}
              onSelectAll={function() { setAllSelected(true); }}
              onSelectNone={function() { setAllSelected(false); }}
              ariaLabel="Select all files for upload"
            />
          </div>
        )}
        <div className="audio-drive-upload-modal-file-list">
          {files.map(function(file, index) {
            return (
              <div
                key={file.name + '-' + file.size + '-' + file.lastModified + '-' + index}
                className="audio-drive-upload-file-row"
              >
                <CheckToggleButton
                  size="sm"
                  checked={!!uploadSelected[index]}
                  ariaLabel={'Upload ' + (file.name || 'Audio file')}
                  onClick={function() { toggleFile(index); }}
                />
                <span className="audio-drive-upload-file-name">{file.name || 'Audio file'}</span>
              </div>
            );
          })}
        </div>
      </Modal.Body>
      <Modal.Footer className="audio-drive-upload-modal-footer">
        <Button variant="outline-secondary" onClick={handleClose}>
          Cancel
        </Button>
        <Button variant="primary" disabled={files.length === 0} onClick={handleConfirm}>
          Continue{files.length > 1 ? ' (' + selectedCount + ' to Drive)' : ''}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
