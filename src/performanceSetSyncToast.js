import { toast } from 'react-toastify';

function formatNameList(names) {
  const list = Array.isArray(names) ? names.filter(Boolean) : [];
  if (list.length === 0) return '';
  if (list.length <= 3) return list.join(', ');
  return list.slice(0, 3).join(', ') + ' +' + (list.length - 3) + ' more';
}

export function showPerformanceSetSyncToast(result) {
  if (!result) return;

  if (result.error) {
    toast.error('Set list sync failed: ' + result.error, { autoClose: 8000 });
    return;
  }

  if (!result.changed) return;

  const lines = [];
  if (result.added && result.added.length > 0) {
    lines.push('Added: ' + formatNameList(result.added));
  }
  if (result.changedNames && result.changedNames.length > 0) {
    lines.push('Updated: ' + formatNameList(result.changedNames));
  }
  if (result.deleted && result.deleted.length > 0) {
    lines.push('Deleted: ' + formatNameList(result.deleted));
  }

  if (lines.length === 0) {
    toast.info('Set lists synced', { autoClose: 4000 });
    return;
  }

  toast.success(
  'Set lists synced\n' + lines.join('\n'),
    { autoClose: 7000 }
  );
}
