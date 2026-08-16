import React from 'react';
import { toast } from 'react-toastify';

export const AUDIO_GENERATION_JOBS_TAB = 'audio-generation';

export function backgroundJobsAudioGenerationPath() {
  return '/#/settings/background-jobs?jobsTab=' + AUDIO_GENERATION_JOBS_TAB;
}

export function tuneSingleViewPath(tuneId) {
  return '/#/tunes/' + encodeURIComponent(String(tuneId || ''));
}

function renderToastWithButton(message, buttonLabel, onClick, renderProps) {
  return (
    <div
      className="audio-generation-toast"
      style={{ display: 'flex', alignItems: 'center', gap: '0.75em', flexWrap: 'wrap' }}
    >
      <span>{message}</span>
      <button
        type="button"
        className="btn btn-sm btn-primary"
        onClick={function() {
          if (typeof renderProps.closeToast === 'function') renderProps.closeToast();
          onClick();
        }}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

export function showAudioGenerationStartedToast(options) {
  const opts = options || {};
  const tuneName = opts.tuneName || 'Tune';
  const message = opts.message || (tuneName + ': audio generation started');
  toast.info(function(renderProps) {
    return renderToastWithButton(message, 'View jobs', function() {
      window.location.assign(backgroundJobsAudioGenerationPath());
    }, renderProps);
  }, { autoClose: 8000, hideProgressBar: true });
}

export function showAudioGenerationCompleteToast(options) {
  const opts = options || {};
  const tuneName = opts.tuneName || 'Tune';
  const tuneId = opts.tuneId;
  const message = opts.message || (tuneName + ': audio generation complete');
  toast.success(function(renderProps) {
    return renderToastWithButton(message, 'Open tune', function() {
      if (tuneId) window.location.assign(tuneSingleViewPath(tuneId));
    }, renderProps);
  }, { autoClose: 10000, hideProgressBar: true });
}

export function showAudioGenerationErrorToast(message) {
  toast.error(message);
}
