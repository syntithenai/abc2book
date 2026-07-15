import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, ButtonGroup, Form, Modal } from 'react-bootstrap';
import abcjs from 'abcjs';
import DeleteVoiceConfirmModal from './DeleteVoiceConfirmModal';
import { FULLSCREEN_ICON } from './FieldPreviewEditor';

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

function noteLinesFromVoice(voice, flatten) {
  const raw = voiceNotesText(voice);
  if (flatten) {
    const flat = flattenVoiceNotes(raw);
    return flat ? [flat] : [];
  }
  return String(raw || '')
    .split(/\r?\n/)
    .map(function(line) { return String(line || '').replace(/\s+$/g, ''); })
    .filter(function(line) { return !!String(line || '').trim(); });
}

/**
 * Preview ABC for notation panes.
 * flatten:true → one continuous staff (main form, horizontal scroll)
 * flatten:false → preserve newlines (fullscreen, vertical flow)
 */
function buildPreviewAbc(voices, metadata, enabledKeys, options) {
  const flatten = !!(options && options.flatten);
  const meta = metadata || {};
  const enabled = enabledKeys == null
    ? sortVoiceKeys(voices)
    : (Array.isArray(enabledKeys) ? enabledKeys : []);
  if (enabled.length === 0) return '';
  const lines = [
    'X:1',
    'M:' + (meta.meter || '4/4'),
    'L:' + (meta.noteLength || '1/8'),
    'K:' + (meta.key || 'C'),
  ];
  let noteCount = 0;
  enabled.forEach(function(key) {
    if (!voices || !voices[key]) return;
    const noteLines = noteLinesFromVoice(voices[key], flatten);
    if (!noteLines.length) return;
    noteCount += 1;
    if (enabled.length > 1) {
      const voiceMeta = voices[key].meta && String(voices[key].meta).trim()
        ? String(voices[key].meta).trim()
        : '';
      lines.push('V:' + key + (voiceMeta ? ' ' + voiceMeta : ''));
    }
    noteLines.forEach(function(line) { lines.push(line); });
  });
  if (noteCount === 0) return '';
  return lines.join('\n');
}

function hasRenderableNotes(abc) {
  return String(abc || '').split(/\n/).some(function(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed) return false;
    if (/^[A-Za-z]:/.test(trimmed)) return false;
    return true;
  });
}

function readSvgContentBox(svg) {
  if (!svg) return null;

  // Union every drawable child's box — extreme ledger lines often sit outside
  // abcjs's reported SVG height / viewBox.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;
  const nodes = svg.querySelectorAll('*');
  for (let i = 0; i < nodes.length; i += 1) {
    const el = nodes[i];
    if (typeof el.getBBox !== 'function') continue;
    try {
      const b = el.getBBox();
      if (!(b.width >= 0) || !(b.height >= 0)) continue;
      if (b.width === 0 && b.height === 0) continue;
      found = true;
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    } catch (e) {
      // Some elements throw if not rendered yet.
    }
  }
  if (found && maxX > minX && maxY > minY) {
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  let box = null;
  try {
    box = svg.getBBox();
  } catch (e) {
    box = null;
  }
  const layoutH = parseFloat(svg.getAttribute('height')) || 0;
  const layoutW = parseFloat(svg.getAttribute('width')) || 0;
  const vb = svg.viewBox && svg.viewBox.baseVal;
  const vbW = vb && vb.width > 0 ? vb.width : layoutW;
  const vbH = vb && vb.height > 0 ? vb.height : layoutH;
  const vbX = vb ? vb.x : 0;
  const vbY = vb ? vb.y : 0;
  if (box && box.width > 0 && box.height > 0) {
    const x1 = Math.min(vbX, box.x);
    const y1 = Math.min(vbY, box.y);
    const x2 = Math.max(vbX + vbW, box.x + box.width);
    const y2 = Math.max(vbY + vbH, box.y + box.height);
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }
  if (vbW > 0 && vbH > 0) return { x: vbX, y: vbY, width: vbW, height: vbH };
  if (layoutW > 0 && layoutH > 0) return { x: 0, y: 0, width: layoutW, height: layoutH };
  return null;
}

/** Main-form strip: shrink full ink (incl. extreme ledger lines) into pane height. */
function fitSvgToStripHeight(svg, availH) {
  if (!svg || !(availH > 0)) return;
  const box = readSvgContentBox(svg);
  if (!box || !(box.width > 0) || !(box.height > 0)) return;
  // Extra pad so far ledger notes aren't clipped at the edges after scaling.
  const pad = 10;
  const vbX = box.x - pad;
  const vbY = box.y - pad;
  const vbW = box.width + pad * 2;
  const vbH = box.height + pad * 2;
  svg.setAttribute('viewBox', [vbX, vbY, vbW, vbH].join(' '));
  svg.setAttribute('preserveAspectRatio', 'xMinYMid meet');
  // Always shrink to fit strip height — no vertical overflow/scroll.
  const scale = Math.min(1, (availH - 2) / vbH);
  const displayH = Math.max(1, vbH * scale);
  const displayW = Math.max(1, vbW * scale);
  svg.setAttribute('width', String(displayW));
  svg.setAttribute('height', String(displayH));
  svg.style.width = displayW + 'px';
  svg.style.height = displayH + 'px';
  svg.style.maxWidth = 'none';
  svg.style.maxHeight = availH + 'px';
  svg.style.display = 'block';
  svg.style.flexShrink = '0';
  svg.style.overflow = 'visible';
}

/** Fullscreen page: fit to pane width; natural height for vertical scroll. */
function fitSvgToPageWidth(svg, availW) {
  if (!svg || !(availW > 0)) return;
  const box = readSvgContentBox(svg);
  if (!box || !(box.width > 0) || !(box.height > 0)) return;
  const pad = 4;
  const vbX = box.x - pad;
  const vbY = box.y - pad;
  const vbW = box.width + pad * 2;
  const vbH = box.height + pad * 2;
  svg.setAttribute('viewBox', [vbX, vbY, vbW, vbH].join(' '));
  const scale = Math.min(1, availW / vbW);
  const displayW = Math.max(1, vbW * scale);
  const displayH = Math.max(1, vbH * scale);
  svg.setAttribute('width', String(displayW));
  svg.setAttribute('height', String(displayH));
  svg.style.width = displayW + 'px';
  svg.style.height = displayH + 'px';
  svg.style.maxWidth = '100%';
  svg.style.maxHeight = 'none';
  svg.style.display = 'block';
  svg.style.flexShrink = '0';
}

function CompactAbcStrip(props) {
  const shellRef = useRef(null);
  const hostRef = useRef(null);
  const abc = props.abc || '';
  const canRender = hasRenderableNotes(abc);
  const renderToken = props.renderToken || 0;
  const emptyLabel = props.emptyLabel || 'No notation preview';
  const layout = props.layout === 'page' ? 'page' : 'strip';
  const heightPx = props.heightPx;

  useEffect(function() {
    const shell = shellRef.current;
    const host = hostRef.current;
    if (!shell || !host) return undefined;
    host.innerHTML = '';
    if (!canRender) return undefined;

    let cancelled = false;
    let rafPaint = 0;
    let lastSizeKey = '';

    function paint(force) {
      if (cancelled || !shellRef.current || !hostRef.current) return;
      const target = hostRef.current;
      const shellEl = shellRef.current;
      const availW = Math.max(160, shellEl.clientWidth - 12);
      const availH = Math.max(28, shellEl.clientHeight - 8);
      const sizeKey = layout + ':' + availW + 'x' + availH;
      if (!force && sizeKey === lastSizeKey && target.querySelector('svg')) {
        const svg = target.querySelector('svg');
        if (layout === 'page') fitSvgToPageWidth(svg, availW);
        else fitSvgToStripHeight(svg, availH);
        return;
      }
      lastSizeKey = sizeKey;
      target.innerHTML = '';
      try {
        const staffwidth = layout === 'page'
          ? Math.max(200, availW)
          : Math.max(2400, availW * 12);
        // Large vertical padding so abcjs keeps extreme ledger lines inside the SVG.
        const vPad = layout === 'strip' ? 48 : 10;
        abcjs.renderAbc(target, abc, {
          add_classes: true,
          selectTypes: false,
          staffwidth: staffwidth,
          scale: 1,
          paddingtop: vPad,
          paddingbottom: vPad,
          paddingleft: 2,
          paddingright: 2,
        });
        const svg = target.querySelector('svg');
        if (layout === 'page') fitSvgToPageWidth(svg, availW);
        else fitSvgToStripHeight(svg, availH);
      } catch (e) {
        target.textContent = 'Unable to render notation.';
      }
    }

    function schedulePaint(force) {
      if (rafPaint) return;
      rafPaint = window.requestAnimationFrame(function() {
        rafPaint = 0;
        paint(!!force);
      });
    }

    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(function() {
      raf2 = window.requestAnimationFrame(function() { schedulePaint(true); });
    });

    function onWindowResize() {
      schedulePaint(true);
    }
    window.addEventListener('resize', onWindowResize);

    return function() {
      cancelled = true;
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      if (rafPaint) window.cancelAnimationFrame(rafPaint);
      window.removeEventListener('resize', onWindowResize);
    };
  }, [abc, canRender, renderToken, layout, heightPx]);

  const shellClass = 'abc-voices-notes-strip'
    + (layout === 'page' ? ' abc-voices-notes-strip--page' : ' abc-voices-notes-strip--strip')
    + (!canRender ? ' abc-voices-notes-strip--empty text-muted small' : '');
  const shellStyle = (layout === 'strip' && heightPx > 0)
    ? { height: heightPx + 'px' }
    : undefined;

  if (!canRender) {
    return (
      <div className={shellClass} style={shellStyle}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className={shellClass} ref={shellRef} style={shellStyle} aria-label="Notation preview">
      <div className="abc-voices-notes-strip-canvas" ref={hostRef} />
    </div>
  );
}

export default function AbcVoicesNotesEditor(props) {
  const voices = useMemo(function() {
    return normalizeVoices(props.voices);
  }, [props.voices]);
  const voiceKeys = useMemo(function() {
    return sortVoiceKeys(voices);
  }, [voices]);
  const voiceKeysKey = voiceKeys.join('|');
  const prevVoiceKeysRef = useRef(voiceKeys);
  const [activeKey, setActiveKey] = useState(voiceKeys[0] || '1');
  const [deleteKey, setDeleteKey] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogActiveKey, setDialogActiveKey] = useState(voiceKeys[0] || '1');
  const [enabledKeys, setEnabledKeys] = useState(function() { return voiceKeys.slice(); });
  const [previewDraft, setPreviewDraft] = useState('');
  const [dialogRenderToken, setDialogRenderToken] = useState(0);
  const [draftSynced, setDraftSynced] = useState(false);
  const [formStripHeight, setFormStripHeight] = useState(0);
  const formTextareaRef = useRef(null);

  useEffect(function() {
    if (voiceKeys.indexOf(activeKey) < 0) {
      setActiveKey(voiceKeys[0] || '1');
    }
  }, [voiceKeysKey, activeKey]);

  useEffect(function() {
    if (voiceKeys.indexOf(dialogActiveKey) < 0) {
      setDialogActiveKey(voiceKeys[0] || '1');
    }
  }, [voiceKeysKey, dialogActiveKey]);

  // Keep preview selection in sync: drop removed voices, auto-select newly added ones.
  // Do not re-select everything when the user has cleared the selection.
  useEffect(function() {
    const prevKeys = prevVoiceKeysRef.current || [];
    prevVoiceKeysRef.current = voiceKeys;
    setEnabledKeys(function(current) {
      const kept = (current || []).filter(function(key) {
        return voiceKeys.indexOf(key) >= 0;
      });
      const additions = voiceKeys.filter(function(key) {
        return prevKeys.indexOf(key) < 0 && kept.indexOf(key) < 0;
      });
      return kept.concat(additions);
    });
  }, [voiceKeysKey]);

  const activeVoice = voices[activeKey] || { meta: '', notes: [] };
  const activeText = voiceNotesText(activeVoice);

  useEffect(function() {
    if (!dialogOpen) {
      setPreviewDraft(activeText);
      setDraftSynced(true);
    }
  }, [activeText, dialogOpen, activeKey]);

  useEffect(function() {
    const node = formTextareaRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    function syncHeight() {
      const next = Math.round(node.offsetHeight || 0);
      setFormStripHeight(function(current) {
        return current === next ? current : next;
      });
    }
    syncHeight();
    const ro = new ResizeObserver(function() { syncHeight(); });
    ro.observe(node);
    return function() { ro.disconnect(); };
  }, [dialogOpen]);

  function emit(nextVoices) {
    if (typeof props.onChange === 'function') props.onChange(normalizeVoices(nextVoices));
  }

  function updateVoiceNotes(voiceKey, text) {
    const next = normalizeVoices(voices);
    if (!next[voiceKey]) next[voiceKey] = { meta: '', notes: [] };
    next[voiceKey] = Object.assign({}, next[voiceKey], {
      notes: String(text || '').split(/\r?\n/),
    });
    emit(next);
  }

  function updateVoiceMeta(voiceKey, meta) {
    const next = normalizeVoices(voices);
    if (!next[voiceKey]) next[voiceKey] = { meta: '', notes: [] };
    next[voiceKey] = Object.assign({}, next[voiceKey], { meta: meta });
    emit(next);
  }

  function updateActiveNotes(text) {
    updateVoiceNotes(activeKey, text);
  }

  function updateActiveMeta(meta) {
    updateVoiceMeta(activeKey, meta);
  }

  function addVoice() {
    const next = normalizeVoices(voices);
    const key = nextVoiceKey(next);
    next[key] = { meta: 'Voice ' + key, notes: [''] };
    emit(next);
    setActiveKey(key);
    if (dialogOpen) setDialogActiveKey(key);
  }

  function openDialog() {
    setDialogActiveKey(activeKey);
    setDialogOpen(true);
  }

  function closeDialog() {
    setActiveKey(dialogActiveKey);
    setDialogOpen(false);
  }

  function updateDialogNotes(text) {
    updateVoiceNotes(dialogActiveKey, text);
  }

  function updateDialogMeta(meta) {
    updateVoiceMeta(dialogActiveKey, meta);
  }

  function confirmDelete() {
    const key = deleteKey;
    setDeleteKey(null);
    const keys = sortVoiceKeys(voices);
    if (!key || keys.length <= 1) return;
    const next = normalizeVoices(voices);
    delete next[key];
    const remaining = sortVoiceKeys(next);
    if (remaining.length === 0) {
      next['1'] = { meta: '', notes: [] };
      remaining.push('1');
    }
    setEnabledKeys(function(current) {
      return current.filter(function(item) { return item !== key; });
    });
    emit(next);
    const nextActive = remaining[0] || '1';
    if (dialogOpen) setDialogActiveKey(nextActive);
    setActiveKey(nextActive);
  }

  function toggleEnabled(key) {
    setEnabledKeys(function(current) {
      if (current.indexOf(key) >= 0) {
        return current.filter(function(item) { return item !== key; });
      }
      return current.concat([key]);
    });
  }

  const dialogKeys = voiceKeys;
  const dialogVoice = voices[dialogActiveKey] || { meta: '', notes: [] };
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
    if (draftSynced && !dialogOpen && next[activeKey]) {
      next[activeKey] = Object.assign({}, next[activeKey], {
        notes: String(previewDraft || '').split(/\r?\n/),
      });
    }
    return next;
  }, [voices, activeKey, previewDraft, draftSynced, dialogOpen]);
  const formPreviewAbc = buildPreviewAbc(formPreviewVoices, metadata, enabledKeys, { flatten: true });
  const dialogPreviewAbc = buildPreviewAbc(voices, metadata, enabledKeys, { flatten: false });
  const previewEmptyLabel = enabledKeys.length === 0
    ? 'No voices selected for preview'
    : 'No notation preview';

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
          className="field-preview-editor-fullscreen-btn"
          onClick={openDialog}
          aria-label="Edit notation fullscreen"
          title="Edit notation fullscreen"
        >
          {FULLSCREEN_ICON}
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

      <div className="abc-voices-notes-main-stack">
        <Form.Control
          as="textarea"
          ref={formTextareaRef}
          className="field-preview-editor-textarea field-preview-editor-textarea--mono abc-voices-notes-textarea"
          rows={5}
          value={previewDraft}
          placeholder="No notes for this voice yet."
          onChange={function(e) {
            const next = e.target.value;
            setPreviewDraft(next);
            updateActiveNotes(next);
          }}
        />
        <CompactAbcStrip
          abc={formPreviewAbc}
          emptyLabel={previewEmptyLabel}
          heightPx={formStripHeight}
          layout="strip"
        />
      </div>

      <Modal
        show={dialogOpen}
        onHide={closeDialog}
        onEntered={function() { setDialogRenderToken(function(n) { return n + 1; }); }}
        fullscreen
        className="abc-voices-notes-dialog"
      >
        <Modal.Header closeButton className="abc-voices-notes-dialog-header">
          <div className="abc-voices-notes-toolbar abc-voices-notes-toolbar--dialog">
            <Modal.Title className="abc-voices-notes-title">Edit Notation</Modal.Title>
            {renderVoiceChooser(dialogKeys, dialogActiveKey, setDialogActiveKey, addVoice, voices)}
            {renderPreviewToggles(dialogKeys, 'dialog-preview-', voices)}
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

          <Form.Control
            as="textarea"
            className="field-preview-editor-textarea--mono abc-voices-notes-dialog-textarea"
            rows={10}
            value={dialogText}
            onChange={function(e) { updateDialogNotes(e.target.value); }}
            autoFocus
          />

          <CompactAbcStrip
            abc={dialogPreviewAbc}
            renderToken={dialogRenderToken}
            emptyLabel={previewEmptyLabel}
            layout="page"
          />
        </Modal.Body>
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
