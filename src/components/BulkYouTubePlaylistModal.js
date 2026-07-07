import { useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import useYouTubePlaylist, { parseYouTubePlaylistId } from '../useYouTubePlaylist';
import { formatBulkLine } from '../bulkListFormat';

export default function BulkYouTubePlaylistModal(props) {
  const [show, setShow] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { getPlaylistItems } = useYouTubePlaylist();

  function handleClose() {
    setShow(false);
    setInput('');
    setError('');
    setLoading(false);
  }

  function handleSubmit() {
    const playlistId = parseYouTubePlaylistId(input);
    if (!playlistId) {
      setError('Enter a valid YouTube playlist URL or playlist ID.');
      return;
    }
    setError('');
    setLoading(true);
    getPlaylistItems(playlistId, null).then(function(items) {
      setLoading(false);
      if (!Array.isArray(items) || items.length === 0) {
        setError('No videos found in that playlist.');
        return;
      }
      const lines = items.map(function(item) {
        return formatBulkLine({
          title: item.title || 'Untitled',
          artist: '',
          link: item.youtubeId ? 'https://www.youtube.com/watch?v=' + item.youtubeId : '',
        });
      }).join('\n');
      if (typeof props.onLines === 'function') props.onLines(lines, items.length);
      handleClose();
    }).catch(function(e) {
      setLoading(false);
      setError(e.message || 'Could not load playlist.');
    });
  }

  return (
    <>
      <Button variant="outline-primary" disabled={props.disabled} onClick={function() { setShow(true); }}>
        YouTube
      </Button>
      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>YouTube playlist</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group>
            <Form.Label>Playlist URL or ID</Form.Label>
            <Form.Control value={input} onChange={function(e) { setInput(e.target.value); }} />
          </Form.Group>
          {error && <Alert variant="danger" className="mt-2">{error}</Alert>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button variant="primary" disabled={loading} onClick={handleSubmit}>
            {loading ? 'Loading…' : 'Add to list'}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
