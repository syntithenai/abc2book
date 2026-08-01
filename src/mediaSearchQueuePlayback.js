import {
  appendMediaCandidateToQueue,
  insertMediaCandidateAfterCurrentInQueue,
  isQueueActive,
  getCurrentItem,
  isExternalQueueItem,
} from './nowPlayingQueue';
import { externalMediaFromCandidate } from './mediaSearchExternalMedia';
import {
  standaloneMediaCandidateKey,
  stopStandaloneMediaPlayback,
  pauseStandaloneMediaPlayback,
  resumeStandaloneMediaPlayback,
} from './standaloneMediaPlayback';

export function mediaCandidateMatchesExternalMedia(candidate, externalMedia) {
  if (!candidate || !externalMedia) return false;
  const normalized = externalMediaFromCandidate(candidate);
  if (!normalized) return false;
  return standaloneMediaCandidateKey(normalized) === standaloneMediaCandidateKey(externalMedia);
}

export function isMediaCandidateCurrentQueueItem(candidate, queue) {
  if (!isQueueActive(queue)) return false;
  const item = getCurrentItem(queue);
  if (!isExternalQueueItem(item)) return false;
  return mediaCandidateMatchesExternalMedia(candidate, item.externalMedia);
}

export function buildMediaSearchPlaybackQueue(candidate, options) {
  return appendMediaCandidateToQueue(null, candidate, Object.assign({
    name: 'Media search',
    source: 'media-search',
    autoAdvance: true,
  }, options || {}));
}

export function startMediaCandidateQueuePlayback(options) {
  const opts = options || {};
  const candidate = opts.candidate;
  const tunebook = opts.tunebook;
  const setNowPlayingQueue = opts.setNowPlayingQueue;
  const mediaController = opts.mediaController;
  if (!candidate || !setNowPlayingQueue || !tunebook || !tunebook.startNowPlayingQueue) {
    return false;
  }
  const queue = opts.queue || buildMediaSearchPlaybackQueue(candidate, opts.queueOptions);
  if (!queue) return false;
  setNowPlayingQueue(queue);
  tunebook.startNowPlayingQueue(queue, tunebook.navigate, {
    startPlayback: true,
    mediaController: mediaController,
    navigate: false,
  });
  return true;
}

export async function pauseMediaCandidateQueuePlayback() {
  await pauseStandaloneMediaPlayback();
}

export async function resumeMediaCandidateQueuePlayback() {
  await resumeStandaloneMediaPlayback();
}

export async function stopMediaCandidateQueuePlayback() {
  await stopStandaloneMediaPlayback();
}

export function appendMediaCandidateToActiveQueue(queue, candidate, setNowPlayingQueue) {
  if (!setNowPlayingQueue) return queue;
  const next = appendMediaCandidateToQueue(queue, candidate, {
    source: 'media-search',
    autoAdvance: true,
  });
  if (next !== queue) setNowPlayingQueue(next);
  return next;
}

export function insertMediaCandidateNextInActiveQueue(queue, candidate, setNowPlayingQueue) {
  if (!setNowPlayingQueue) return queue;
  const next = insertMediaCandidateAfterCurrentInQueue(queue, candidate, {
    source: 'media-search',
    autoAdvance: true,
  });
  if (next !== queue) setNowPlayingQueue(next);
  return next;
}
