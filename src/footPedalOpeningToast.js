import { toast } from 'react-toastify';

export function announceFootPedalOpeningTune(tune) {
  const name = tune && tune.name ? String(tune.name).trim() : '';
  if (!name) return;
  toast.info('Opening ' + name, { autoClose: 2200 });
}
