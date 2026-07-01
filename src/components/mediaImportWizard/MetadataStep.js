import { Form } from 'react-bootstrap';
import CreatableSelect from 'react-select/creatable';

export default function MediaImportMetadataStep(props) {
  const metadata = props.draft.metadata || {};
  const tunebook = props.tunebook;

  function update(field, value) {
    props.onChange(Object.assign({}, metadata, { [field]: value }));
  }

  return (
    <Form>
      <Form.Group className="mb-3">
        <Form.Label>Title</Form.Label>
        <Form.Control
          value={metadata.name || ''}
          onChange={function(e) { update('name', e.target.value); }}
        />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label>Composer</Form.Label>
        <Form.Control
          value={metadata.composer || ''}
          onChange={function(e) { update('composer', e.target.value); }}
        />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label>Time signature</Form.Label>
        <CreatableSelect
          value={metadata.meter ? { value: metadata.meter, label: metadata.meter } : { value: '', label: '' }}
          onChange={function(val) { update('meter', val ? val.label : ''); }}
          options={tunebook.abcTools.getTimeSignatureTypes().map(function(type) {
            return { value: type, label: type };
          })}
          isClearable={false}
        />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label>Key</Form.Label>
        <Form.Control
          value={metadata.key || ''}
          onChange={function(e) { update('key', e.target.value); }}
        />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label>Tempo (BPM)</Form.Label>
        <Form.Control
          type="number"
          min="1"
          placeholder="eg 120"
          value={metadata.tempo || ''}
          onChange={function(e) { update('tempo', e.target.value); }}
        />
      </Form.Group>
    </Form>
  );
}
