import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, ButtonGroup, Form, Modal } from 'react-bootstrap';
import abcjs from 'abcjs';
import DeleteVoiceConfirmModal from './DeleteVoiceConfirmModal';

function normalizeVoices(voices) {
  if (!voices || typeof voices !== 'object' || Object.keys(voices).length === 0) {
    return { '1': { meta: '', notes: [] } };
  }
  const next = {};
  Object.keys(voices).forEach(function(key) {
    const voice = voices[key] || {};
    next[key] = {
      meta: typeof voice.meta === 'string' ? voice.meta : '',
      notes: Array.isArray(voice.notes)
        ? voice.notes.slice()
        : String(voice.notes || '').split(/\r?\n/),
    };
  });
  return next;
}

function voiceNotesText(voice) {
  if (!voice) return '';
  return Array.isArray(voice.notes) ? voice.notes.join('\n') : String(voice.notes || '');
}

function nextVoiceKey(voices) {
  const keys = Object.keys(voices || {});
  let n = keys.length + 1;
  while (voices[String(n)]) n += 1;
  return String(n);
}

function sortVoiceKeys(voices) {
  return Object.keys(voices || {}).sort(function(a, b) {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  });
}

export function primaryVoiceNotesText(voices) {
  const normalized = normalizeVoices(voices);
  const keys = sortVoiceKeys(normalized);
  for (let i = 0; i < keys.length; i += 1) {
    const text = voiceNotesText(normalized[keys[i]]);
    if (String(text || '').trim()) return text;
  }
  return voiceNotesText(normalized[keys[0] || '1']);
}

function flattenVoiceNotes(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

/** Minimal one-line ABC for the compact strip — avoid full json2abc (headers/lyrics noise). */
function buildOneLinePreviewAbc(voices, metadata, enabledKeys) {
  const meta = metadata || {};
  const enabled = Array.isArray(enabledKeys) && enabledKeys.length
    ? enabledKeys
    : sortVoiceKeys(voices);
  const lines = [
    'X:1',
    'M:' + (meta.meter || '4/4'),
    'L:' + (meta.noteLength || '1/8'),
    'K:' + (meta.key || 'C'),
  ];
  let noteCount = 0;
  enabled.forEach(function(key) {
    if (!voices || !voices[key]) return;
    const notes = flattenVoiceNotes(voiceNotesText(voices[key]));
    if (!notes) return;
    noteCount += 1;
    if (enabled.length > 1) {
      const voiceMeta = voices[key].meta && String(voices[key].meta).trim()
        ? String(voices[key].meta).trim()
        : '';
      lines.push('V:' + key + (voiceMeta ? ' ' + voiceMeta : ''));
    }
    lines.push(notes);
  });
  if (noteCount === 0) return '';
  return lines.join('\n');
}

function hasRenderableNotes(abc) {
  return String(abc || '').split(/\n/).some(function(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed) return false;
    // Skip ABC header fields like M:, K:, L:, V:, etc.
    if (/^[A-Za-z]:/.test(trimmed)) return false;
    return true;
  });
}

const PENCIL_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="none" d="M0 0h24v24H0z" />
    <path fill="currentColor" d="M15.728 9.686l-1.414-1.414L5 17.586V19h1.414l9.314-9.314zm1.414-1.414l1.414-1.414-1.414-1.414-1.414 1.414 1.414 1.414zM7.242 21H3v-4.243L16.435 3.322a1 1 0 0 1 1.414 0l2.829 2.829a1 1 0 0 1 0 1.414L7.243 21z" />
  </svg>
);

function CompactAbcStrip(props) {
  const hostRef = useRef(null);
  const abc = props.abc || '';
  const canRender = hasRenderableNotes(abc);
  // Remount/rerender when a parent dialog becomes visible (abcjs needs a laid-out container).
  const renderToken = props.renderToken || 0;

  useEffect(function() {
    const el = hostRef.current;
    if (!el) return undefined;
    el.innerHTML = '';
    if (!canRender) return undefined;

    let cancelled = false;
    function paint() {
      if (cancelled || !hostRef.current) return;
      const target = hostRef.current;
      target.innerHTML = '';
      try {
        abcjs.renderAbc(target, abc, {
          add_classes: true,
          selectTypes: false,
          staffwidth: 12000,
          scale: 1,
          paddingtop: 0,
          paddingbottom: 0,
          paddingleft: 0,
          paddingright: 0,
        });
        const svg = target.querySelector('svg');
        if (svg) {
          const attrH = parseFloat(svg.getAttribute('height')) || 0;
          const targetH = 90;
          const scale = attrH > 0 ? (targetH / attrH) : 1;
          const attrW = parseFloat(svg.getAttribute('width')) || 0;
          svg.removeAttribute('width');
          svg.removeAttribute('height');
          svg.style.height = targetH + 'px';
          svg.style.width = attrW > 0 ? Math.round(attrW * scale) + 'px' : 'auto';
          svg.style.maxHeight = targetH + 'px';
          svg.style.display = 'block';
        }
      } catch (e) {
        target.textContent = 'Unable to render notation.';
      }
    }

    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(function() {
      raf2 = window.requestAnimationFrame(paint);
    });
    return function() {
      cancelled = true;
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [abc, canRender, renderToken]);

  if (!canRender) {
    return (
      <div className="abc-voices-notes-strip abc-voices-notes-strip--empty text-muted small">
        No notation preview
      </div>
    );
  }

  return <div className="abc-voices-notes-strip" ref={hostRef} aria-label="Notation preview" />;
}

export default function AbcVoicesNotesEditor(props) {
  const voices = useMemo(function() {
    return normalizeVoices(props.voices);
  }, [props.voices]);
  const voiceKeys = useMemo(function() {
    return sortVoiceKeys(voices);
  }, [voices]);
  const [activeKey, setActiveKey] = useState(voiceKeys[0] || '1');
  const [deleteKey, setDeleteKey] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogVoices, setDialogVoices] = useState(voices);
  const [dialogActiveKey, setDialogActiveKey] = useState(voiceKeys[0] || '1');
  const [enabledKeys, setEnabledKeys] = useState(voiceKeys);
  const [previewDraft, setPreviewDraft] = useState('');
  const [dialogRenderToken, setDialogRenderToken] = useState(0);
  const [draftSynced, setDraftSynced] = useState(false);

  useEffect(function() {
    if (voiceKeys.indexOf(activeKey) < 0) {
      setActiveKey(voiceKeys[0] || '1');
    }
  }, [voiceKeys, activeKey]);

  useEffect(function() {
    setEnabledKeys(function(current) {
      const kept = (current || []).filter(function(key) {
        return voiceKeys.indexOf(key) >= 0;
      });
      if (kept.length === 0) return voiceKeys.slice();
      const additions = voiceKeys.filter(function(key) {
        return kept.indexOf(key) < 0 && (current || []).indexOf(key) < 0;
      });
      return additions.length ? kept.concat(additions) : kept;
    });
  }, [voiceKeys.join('|')]);

  const activeVoice = voices[activeKey] || { meta: '', notes: [] };
  const activeText = voiceNotesText(activeVoice);

  useEffect(function() {
    if (!dialogOpen) {
      setPreviewDraft(activeText);
      setDraftSynced(true);
    }
  }, [activeText, dialogOpen, activeKey]);

  function emit(nextVoices) {
    if (typeof props.onChange === 'function') props.onChange(normalizeVoices(nextVoices));
  }

  function updateActiveNotes(text) {
    const next = normalizeVoices(voices);
    if (!next[activeKey]) next[activeKey] = { meta: '', notes: [] };
    next[activeKey] = Object.assign({}, next[activeKey], {
      notes: String(text || '').split(/\r?\n/),
    });
    emit(next);
  }

  function updateActiveMeta(meta) {
    const next = normalizeVoices(voices);
    if (!next[activeKey]) next[activeKey] = { meta: '', notes: [] };
    next[activeKey] = Object.assign({}, next[activeKey], { meta: meta });
    emit(next);
  }

  function addVoice() {
    const next = normalizeVoices(voices);
    const key = nextVoiceKey(next);
    next[key] = { meta: 'Voice ' + key, notes: [''] };
    emit(next);
    setActiveKey(key);
    setEnabledKeys(function(keys) {
      return keys.indexOf(key) >= 0 ? keys : keys.concat([key]);
    });
  }

  function openDialog() {
    const snapshot = normalizeVoices(voices);
    setDialogVoices(snapshot);
    setDialogActiveKey(activeKey);
    setEnabledKeys(sortVoiceKeys(snapshot));
    setDialogOpen(true);
  }

  function saveDialog() {
    emit(dialogVoices);
    setActiveKey(dialogActiveKey);
    setDialogOpen(false);
  }

  function updateDialogNotes(text) {
    setDialogVoices(function(current) {
      const next = normalizeVoices(current);
      const key = dialogActiveKey;
      if (!next[key]) next[key] = { meta: '', notes: [] };
      next[key] = Object.assign({}, next[key], {
        notes: String(text || '').split(/\r?\n/),
      });
      return next;
    });
  }

  function updateDialogMeta(meta) {
    setDialogVoices(function(current) {
      const next = normalizeVoices(current);
      const key = dialogActiveKey;
      if (!next[key]) next[key] = { meta: '', notes: [] };
      next[key] = Object.assign({}, next[key], { meta: meta });
      return next;
    });
  }

  function addDialogVoice() {
    setDialogVoices(function(current) {
      const next = normalizeVoices(current);
      const key = nextVoiceKey(next);
      next[key] = { meta: 'Voice ' + key, notes: [''] };
      setDialogActiveKey(key);
      setEnabledKeys(function(keys) {
        return keys.indexOf(key) >= 0 ? keys : keys.concat([key]);
      });
      return next;
    });
  }

  function confirmDelete() {
    const key = deleteKey;
    setDeleteKey(null);
    const source = dialogOpen ? dialogVoices : voices;
    const keys = sortVoiceKeys(source);
    if (!key || keys.length <= 1) return;
    const next = normalizeVoices(source);
    delete next[key];
    const remaining = sortVoiceKeys(next);
    if (remaining.length === 0) {
      next['1'] = { meta: '', notes: [] };
      remaining.push('1');
    }
    setEnabledKeys(function(current) {
      const filtered = current.filter(function(item) { return item !== key; });
      return filtered.length ? filtered : remaining.slice();
    });
    if (dialogOpen) {
      setDialogVoices(next);
      setDialogActiveKey(remaining[0] || '1');
    } else {
      emit(next);
      setActiveKey(remaining[0] || '1');
    }
  }

  function toggleEnabled(key) {
    setEnabledKeys(function(current) {
      if (current.indexOf(key) >= 0) {
        if (current.length <= 1) return current;
        return current.filter(function(item) { return item !== key; });
      }
      return current.concat([key]);
    });
  }

  const dialogKeys = sortVoiceKeys(dialogVoices);
  const dialogVoice = dialogVoices[dialogActiveKey] || { meta: '', notes: [] };
  const dialogText = voiceNotesText(dialogVoice);
  const activeLabel = activeVoice.meta && String(activeVoice.meta).trim()
    ? activeVoice.meta
    : ('Voice ' + activeKey);
  const dialogLabel = dialogVoice.meta && String(dialogVoice.meta).trim()
    ? dialogVoice.meta
    : ('Voice ' + dialogActiveKey);
  const metadata = props.metadata || {};
  const formPreviewVoices = useMemo(function() {
    const next = normalizeVoices(voices);
    if (draftSynced && next[activeKey]) {
      next[activeKey] = Object.assign({}, next[activeKey], {
        notes: String(previewDraft || '').split(/\r?\n/),
      });
    }
    return next;
  }, [voices, activeKey, previewDraft, draftSynced]);
  const formPreviewAbc = buildOneLinePreviewAbc(
    formPreviewVoices,
    metadata,
    enabledKeys
  );
  const dialogPreviewAbc = buildOneLinePreviewAbc(
    dialogVoices,
    metadata,
    enabledKeys
  );
  const previewRows = props.previewLines || 5;

  function renderVoiceChooser(keys, currentKey, onSelect, onAdd, voiceSource) {
    return (
      <div className="abc-voices-notes-voice-chooser">
        <ButtonGroup size="sm">
          {keys.map(function(key) {
            const voice = voiceSource[key] || {};
            const label = voice.meta && String(voice.meta).trim() ? voice.meta : ('V' + key);
            return (
              <Button
                key={key}
                variant={key === currentKey ? 'primary' : 'outline-secondary'}
                onClick={function() { onSelect(key); }}
              >
                {label}
              </Button>
            );
          })}
        </ButtonGroup>
        <Button size="sm" variant="success" onClick={onAdd}>+ Voice</Button>
      </div>
    );
  }

  function renderPreviewToggles(keys, idPrefix, voiceSource) {
    return (
      <div className="abc-voices-notes-preview-toggles">
        <span className="abc-voices-notes-preview-label">Preview</span>
        {keys.map(function(key) {
          const voice = voiceSource[key] || {};
          const label = voice.meta && String(voice.meta).trim() ? voice.meta : ('V' + key);
          const enabled = enabledKeys.indexOf(key) >= 0;
          return (
            <Form.Check
              key={idPrefix + key}
              type="checkbox"
              id={idPrefix + key}
              className="mb-0"
              label={label}
              checked={enabled}
              onChange={function() { toggleEnabled(key); }}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="abc-voices-notes-editor mb-3">
      <div className="abc-voices-notes-toolbar">
        <div className="abc-voices-notes-toolbar-start">
          <Form.Label className="mb-0 abc-voices-notes-title">Notation</Form.Label>
          {props.suggestionControl || null}
        </div>
        {renderVoiceChooser(voiceKeys, activeKey, setActiveKey, addVoice, voices)}
        {renderPreviewToggles(voiceKeys, 'form-preview-', voices)}
        <Button
          size="sm"
          variant="outline-secondary"
          className="field-preview-editor-pencil"
          onClick={openDialog}
          aria-label="Edit notation"
          title="Edit notation"
        >
          {PENCIL_ICON}
        </Button>
      </div>

      <div className="abc-voices-notes-name-row">
        <Form.Label className="mb-0">Voice name</Form.Label>
        <Form.Control
          size="sm"
          className="abc-voices-notes-name-input"
          value={activeVoice.meta || ''}
          placeholder={'Voice ' + activeKey}
          onChange={function(e) { updateActiveMeta(e.target.value); }}
        />
        <Button
          size="sm"
          variant="outline-danger"
          className="abc-voices-notes-delete"
          disabled={voiceKeys.length <= 1}
          onClick={function() { setDeleteKey(activeKey); }}
        >
          Delete voice
        </Button>
      </div>

      <div className="abc-voices-notes-main-row">
        <Form.Control
          as="textarea"
          className="field-preview-editor-textarea field-preview-editor-textarea--mono abc-voices-notes-textarea"
          rows={previewRows}
          value={previewDraft}
          placeholder="No notes for this voice yet."
          onChange={function(e) { setPreviewDraft(e.target.value); }}
          onBlur={function() {
            if (previewDraft !== activeText) updateActiveNotes(previewDraft);
          }}
        />
        <CompactAbcStrip abc={formPreviewAbc} />
      </div>

      <Modal
        show={dialogOpen}
        onHide={function() { setDialogOpen(false); }}
        onEntered={function() { setDialogRenderToken(function(n) { return n + 1; }); }}
        fullscreen
        backdrop="static"
        className="abc-voices-notes-dialog"
      >
        <Modal.Header closeButton className="abc-voices-notes-dialog-header">
          <div className="abc-voices-notes-toolbar abc-voices-notes-toolbar--dialog">
            <Modal.Title className="abc-voices-notes-title">Edit Notation</Modal.Title>
            {renderVoiceChooser(dialogKeys, dialogActiveKey, setDialogActiveKey, addDialogVoice, dialogVoices)}
            {renderPreviewToggles(dialogKeys, 'dialog-preview-', dialogVoices)}
          </div>
        </Modal.Header>
        <Modal.Body className="abc-voices-notes-dialog-body">
          <div className="abc-voices-notes-name-row">
            <Form.Label className="mb-0">Voice name</Form.Label>
            <Form.Control
              size="sm"
              className="abc-voices-notes-name-input"
              value={dialogVoice.meta || ''}
              placeholder={'Voice ' + dialogActiveKey}
              onChange={function(e) { updateDialogMeta(e.target.value); }}
            />
            <Button
              size="sm"
              variant="outline-danger"
              className="abc-voices-notes-delete"
              disabled={dialogKeys.length <= 1}
              onClick={function() { setDeleteKey(dialogActiveKey); }}
            >
              Delete voice
            </Button>
          </div>

          <CompactAbcStrip abc={dialogPreviewAbc} renderToken={dialogRenderToken} />

          <Form.Control
            as="textarea"
            className="field-preview-editor-dialog-textarea field-preview-editor-textarea--mono abc-voices-notes-dialog-textarea"
            value={dialogText}
            onChange={function(e) { updateDialogNotes(e.target.value); }}
            autoFocus
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={function() { setDialogOpen(false); }}>Cancel</Button>
          <Button variant="success" onClick={saveDialog}>Save</Button>
        </Modal.Footer>
      </Modal>

      <DeleteVoiceConfirmModal
        show={!!deleteKey}
        voiceLabel={dialogOpen ? dialogLabel : activeLabel}
        onHide={function() { setDeleteKey(null); }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
