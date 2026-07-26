import { fetchViaMediaProxy } from './mediaProxyClient';
import {
  isShareableCollectionLink,
  musicCollectionProxyPathFromUri,
} from './musicCollectionLinkUtils';
import { createOwnedMediaLink } from './linkRecording';

export async function uploadCollectionLinksForTune(tune, options) {
  const opts = options || {};
  const token = opts.token;
  const driveApi = opts.driveApi;
  if (!token || !driveApi) {
    return { uploaded: 0, errors: ['Log in with Google to upload library tracks to Drive.'], tune: tune };
  }
  if (!tune || !Array.isArray(tune.links) || tune.links.length === 0) {
    return { uploaded: 0, errors: [], tune: tune };
  }

  let uploaded = 0;
  const errors = [];
  const updatedLinks = tune.links.slice();

  for (let i = 0; i < updatedLinks.length; i += 1) {
    const link = updatedLinks[i];
    if (!isShareableCollectionLink(link)) continue;
    if (Array.isArray(opts.linkIndices) && opts.linkIndices.indexOf(i) === -1) continue;

    const proxyPath = musicCollectionProxyPathFromUri(link.link);
    if (!proxyPath) {
      errors.push('Invalid music collection link for "' + (link.title || 'link ' + (i + 1)) + '".');
      continue;
    }

    try {
      const response = await fetchViaMediaProxy(proxyPath, token);
      const blob = await response.blob();
      if (!blob || blob.size === 0) {
        errors.push('Could not fetch library track for "' + (link.title || 'link ' + (i + 1)) + '".');
        continue;
      }

      const created = await createOwnedMediaLink({
        tune: tune,
        audioBlob: blob,
        title: link.title || tune.name || 'Library track',
        source: 'music-collection',
        linkIndex: i,
        token: token,
        driveApi: driveApi,
        uploadToDrive: true,
      });

      updatedLinks[i] = Object.assign({}, created.link, {
        title: link.title || created.link.title || '',
        startAt: link.startAt || '',
        endAt: link.endAt || '',
        source: 'music-collection',
      });
      if (created.link && created.link.googleId) {
        uploaded += 1;
      } else {
        errors.push('Upload failed for "' + (link.title || 'link ' + (i + 1)) + '".');
      }
    } catch (e) {
      errors.push((e && e.message) || ('Upload failed for "' + (link.title || 'link ' + (i + 1)) + '".'));
    }
  }

  return {
    uploaded: uploaded,
    errors: errors,
    tune: Object.assign({}, tune, { links: updatedLinks }),
  };
}
