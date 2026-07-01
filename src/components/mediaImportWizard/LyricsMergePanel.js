import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Table } from 'react-bootstrap';
import {
  buildFuzzyAlignedLyricRows,
  lyricRowsHaveDiff,
  mergeFuzzyLyricRows,
} from '../../lyricsAlignmentUtils';

function cloneRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(function(row) {
    return Object.assign({}, row);
  });
}

export default function LyricsMergePanel(props) {
  const baseRows = useMemo(function() {
    const current = Array.isArray(props.currentLines) ? props.currentLines : [];
    const imported = Array.isArray(props.importedLines) ? props.importedLines : [];
    if (imported.length === 0) return [];
    return buildFuzzyAlignedLyricRows(current, imported);
  }, [props.currentLines, props.importedLines]);

  const importedLines = Array.isArray(props.importedLines) ? props.importedLines : [];
  const emptyMessage = props.emptyMessage || 'No imported lyrics are available yet.';
  const importedLabel = props.importedLabel || 'Imported';

  const [rows, setRows] = useState([]);

  useEffect(function() {
    setRows(cloneRows(baseRows));
  }, [baseRows]);

  const hasDiff = lyricRowsHaveDiff(rows);
  const mergedPreview = useMemo(function() {
    return mergeFuzzyLyricRows(rows);
  }, [rows]);

  if (importedLines.length === 0) {
    return <Alert variant="info">{emptyMessage}</Alert>;
  }

  if (!hasDiff) {
    return <Alert variant="success">Imported lyrics match the current lyrics.</Alert>;
  }

  function toggleRow(rowId) {
    setRows(function(current) {
      return current.map(function(row) {
        if (row.id !== rowId || row.type === 'same' || row.deleted) return row;
        return Object.assign({}, row, { useExisting: !row.useExisting });
      });
    });
  }

  function deleteRow(rowId) {
    setRows(function(current) {
      return current.map(function(row) {
        if (row.id !== rowId) return row;
        return Object.assign({}, row, { deleted: true });
      });
    });
  }

  function preferCurrent() {
    setRows(function(current) {
      return current.map(function(row) {
        if (row.deleted || row.type === 'same') return row;
        return Object.assign({}, row, { useExisting: true });
      });
    });
  }

  function preferImported() {
    setRows(function(current) {
      return current.map(function(row) {
        if (row.deleted || row.type === 'same') return row;
        return Object.assign({}, row, { useExisting: false });
      });
    });
  }

  return (
    <div className="media-import-lyrics-merge-panel">
      <div className="media-import-lyrics-merge-actions">
        <Button size="sm" variant="outline-secondary" onClick={preferCurrent}>Prefer current</Button>
        <Button size="sm" variant="outline-primary" onClick={preferImported}>Prefer imported</Button>
      </div>

      <Table bordered size="sm" responsive className="media-import-lyrics-merge-table">
        <thead>
          <tr>
            <th style={{ width: '38%' }}>Current lyrics</th>
            <th style={{ width: '38%' }}>{importedLabel}</th>
            <th style={{ width: '24%' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(function(row) {
            if (row.deleted) return null;
            const rowVariant = row.type === 'same'
              ? undefined
              : row.type === 'added'
                ? 'success'
                : row.type === 'removed'
                  ? 'danger'
                  : 'warning';
            const keepLabel = row.type === 'same'
              ? 'Same'
              : row.useExisting
                ? 'Keep current'
                : 'Keep imported';
            return (
              <tr key={row.id} className={rowVariant ? 'table-' + rowVariant : undefined}>
                <td style={{ whiteSpace: 'pre-wrap' }}>{row.existing || '—'}</td>
                <td style={{ whiteSpace: 'pre-wrap' }}>{row.imported || '—'}</td>
                <td>
                  {row.type === 'same' ? (
                    <span>{keepLabel}</span>
                  ) : (
                    <div style={{ display: 'flex', gap: '0.35em', flexWrap: 'wrap' }}>
                      <Button
                        size="sm"
                        variant={row.useExisting ? 'secondary' : 'outline-secondary'}
                        onClick={function() { toggleRow(row.id); }}
                      >
                        {keepLabel}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        onClick={function() { deleteRow(row.id); }}
                      >
                        Delete
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <div style={{ fontSize: '0.9em', color: '#666', marginTop: '0.5em' }}>
        Preview: {mergedPreview.length} line{mergedPreview.length === 1 ? '' : 's'}
      </div>
    </div>
  );
}

export function buildLyricsMergeResult(currentLines, importedLines) {
  const rows = buildFuzzyAlignedLyricRows(currentLines, importedLines);
  return mergeFuzzyLyricRows(rows);
}
